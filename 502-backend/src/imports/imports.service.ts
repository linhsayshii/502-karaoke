import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { Prisma, Role, StockDocType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { InventoryService, StockLine } from '../inventory/inventory.service';
import { BRANCH_MANAGEABLE_ROLES, UsersService } from '../users/users.service';
import {
  ImportCategoriesDto,
  ImportProductsDto,
  ImportRoomsDto,
  ImportStockDto,
  ImportUsersDto,
  OnDuplicate,
  UserImportRow,
} from './dto/import.dto';
import {
  ImportAction,
  ImportRowResult,
  SeenNames,
  USERNAME_PATTERN,
  cleanText,
  groupByName,
  mergeCost,
  normalizeName,
  summarize,
  uniqueUsername,
  usernameBase,
} from './import-utils';

type Db = Prisma.TransactionClient | PrismaService;

// A checked import: what each row will do, and how to write it.
interface ImportPlan {
  rows: ImportRowResult[];
  apply: (tx: Prisma.TransactionClient) => Promise<object | void>;
  info?: object; // extra facts for the preview (e.g. the total of a phiếu)
}

const money = (n: number) => n.toLocaleString('vi-VN');

const ROOM_TYPE_LABELS: Record<string, string> = {
  VIP: 'VIP',
  NORMAL: 'Thường',
};

function rowResult(row: number, name: string | undefined) {
  return (action: ImportAction, message?: string): ImportRowResult => ({
    row,
    name: name ?? '',
    action,
    message,
  });
}

// Categories looked up by name; the missing ones (when allowed) are created
// on apply. Only call check() for rows that will be written, as its last
// check, so no category is created for a skipped or failed row.
class CategoryResolver {
  private ids: Map<string, number>;
  private missing = new Map<string, string>();

  constructor(
    categories: { id: number; name: string }[],
    private allowCreate: boolean,
  ) {
    this.ids = new Map(categories.map((c) => [normalizeName(c.name), c.id]));
  }

  find(name: string) {
    return this.ids.get(normalizeName(name));
  }

  // An error message when the category does not exist and may not be created.
  check(name: string) {
    const key = normalizeName(name);
    if (this.ids.has(key)) return undefined;
    if (!this.allowCreate) return `Chưa có danh mục "${name}"`;
    if (!this.missing.has(key)) this.missing.set(key, name);
    return undefined;
  }

  isNew(name: string) {
    return this.missing.has(normalizeName(name));
  }

  async createMissing(tx: Prisma.TransactionClient, branchId: number) {
    for (const [key, name] of this.missing) {
      const category = await tx.category.create({ data: { branchId, name } });
      this.ids.set(key, category.id);
    }
  }

  idOf(name: string | undefined) {
    return name ? (this.find(name) ?? null) : null;
  }
}

@Injectable()
export class ImportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
    private inventory: InventoryService,
    private users: UsersService,
  ) {}

  // A dry run only checks. Otherwise the rows are checked again and written
  // in one transaction — all of them, or none when a row became invalid
  // since the preview.
  private async run(dryRun: boolean, plan: (db: Db) => Promise<ImportPlan>) {
    if (dryRun) {
      const { rows, info } = await plan(this.prisma);
      return { rows, summary: summarize(rows), ...info };
    }
    return this.prisma.$transaction(
      async (tx) => {
        const { rows, apply, info } = await plan(tx);
        const errors = rows.filter((r) => r.action === 'ERROR');
        if (errors.length) {
          throw new BadRequestException({
            statusCode: 400,
            message: `Còn ${errors.length} dòng lỗi nên chưa nhập dữ liệu nào; hãy kiểm tra lại`,
            rows: errors,
          });
        }
        const written = await apply(tx);
        return { rows, summary: summarize(rows), ...info, ...written };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  // ---- danh mục -------------------------------------------------------------

  async importCategories(
    user: AuthUser,
    branchCode: string | undefined,
    dto: ImportCategoriesDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.run(dto.dryRun, async (db) => {
      const existing = new CategoryResolver(
        await db.category.findMany({ where: { branchId } }),
        false,
      );
      const seen = new SeenNames();
      const names: string[] = [];

      const rows = dto.rows.map((r) => {
        const name = cleanText(r.name);
        const result = rowResult(r.row, name);
        if (!name) return result('ERROR', 'Thiếu tên danh mục');
        const first = seen.firstRow(name, r.row);
        if (first !== undefined) {
          return result('ERROR', `Trùng với dòng ${first}`);
        }
        if (existing.find(name)) return result('SKIP', 'Danh mục đã có');
        names.push(name);
        return result('CREATE');
      });

      return {
        rows,
        apply: async (tx) => {
          await tx.category.createMany({
            data: names.map((name) => ({ branchId, name })),
          });
        },
      };
    });
  }

  // ---- sản phẩm -------------------------------------------------------------

  async importProducts(
    user: AuthUser,
    branchCode: string | undefined,
    dto: ImportProductsDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.run(dto.dryRun, async (db) => {
      const [products, categories] = await Promise.all([
        db.product.findMany({ where: { branchId, active: true } }),
        db.category.findMany({ where: { branchId } }),
      ]);
      const byName = groupByName(products, (p) => p.name);
      const cats = new CategoryResolver(categories, dto.createCategories);
      const seen = new SeenNames();
      const creates: {
        name: string;
        unit: string;
        price: number;
        trackStock: boolean;
        categoryName?: string;
      }[] = [];
      const updates: {
        id: number;
        data: Prisma.ProductUncheckedUpdateInput;
        categoryName?: string;
      }[] = [];

      const rows = dto.rows.map((r) => {
        const name = cleanText(r.name);
        const result = rowResult(r.row, name);
        if (!name) return result('ERROR', 'Thiếu tên sản phẩm');
        const first = seen.firstRow(name, r.row);
        if (first !== undefined) {
          return result('ERROR', `Trùng với dòng ${first}`);
        }
        const unit = cleanText(r.unit);
        const categoryName = cleanText(r.categoryName);
        const matches = byName.get(normalizeName(name)) ?? [];
        if (matches.length > 1) {
          return result(
            'ERROR',
            `Có ${matches.length} sản phẩm đang bán cùng tên; hãy đổi tên trong hệ thống trước`,
          );
        }

        const product = matches[0];
        if (!product) {
          const missing = [
            unit === undefined && 'đơn vị tính',
            r.price === undefined && 'giá bán',
          ].filter(Boolean);
          if (missing.length) {
            return result(
              'ERROR',
              `Thiếu ${missing.join(', ')} để tạo sản phẩm mới`,
            );
          }
          if (categoryName) {
            const error = cats.check(categoryName);
            if (error) return result('ERROR', error);
          }
          creates.push({
            name,
            unit: unit!,
            price: r.price!,
            trackStock: r.trackStock ?? true,
            categoryName,
          });
          return result(
            'CREATE',
            categoryName && cats.isNew(categoryName)
              ? `Tạo cả danh mục "${categoryName}"`
              : undefined,
          );
        }

        if (dto.onDuplicate === OnDuplicate.SKIP) {
          return result('SKIP', 'Sản phẩm đã có');
        }
        const data: Prisma.ProductUncheckedUpdateInput = {};
        const changes: string[] = [];
        if (unit !== undefined && unit !== product.unit) {
          data.unit = unit;
          changes.push(`ĐVT ${product.unit} → ${unit}`);
        }
        if (r.price !== undefined && r.price !== Number(product.price)) {
          data.price = r.price;
          changes.push(
            `giá ${money(Number(product.price))} → ${money(r.price)}`,
          );
        }
        if (r.trackStock !== undefined && r.trackStock !== product.trackStock) {
          // Same rule as ProductsService.update.
          if (!r.trackStock && product.stockQuantity !== 0) {
            return result(
              'ERROR',
              `Còn tồn kho ${product.stockQuantity} ${product.unit}; hãy lập phiếu xuất cho hết trước khi tắt quản lý tồn kho`,
            );
          }
          data.trackStock = r.trackStock;
          changes.push(
            r.trackStock ? 'bật quản lý tồn kho' : 'tắt quản lý tồn kho',
          );
        }
        let newCategory: string | undefined;
        if (categoryName && cats.find(categoryName) !== product.categoryId) {
          const error = cats.check(categoryName);
          if (error) return result('ERROR', error);
          newCategory = categoryName;
          changes.push(`danh mục → ${categoryName}`);
        }
        if (!changes.length) return result('SKIP', 'Không có thay đổi');
        updates.push({ id: product.id, data, categoryName: newCategory });
        return result('UPDATE', changes.join('; '));
      });

      return {
        rows,
        apply: async (tx) => {
          await cats.createMissing(tx, branchId);
          for (const { categoryName, ...p } of creates) {
            await tx.product.create({
              data: { ...p, branchId, categoryId: cats.idOf(categoryName) },
            });
          }
          for (const u of updates) {
            await tx.product.update({
              where: { id: u.id },
              data: {
                ...u.data,
                ...(u.categoryName && {
                  categoryId: cats.idOf(u.categoryName),
                }),
              },
            });
          }
        },
      };
    });
  }

  // ---- phòng ----------------------------------------------------------------

  async importRooms(
    user: AuthUser,
    branchCode: string | undefined,
    dto: ImportRoomsDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.run(dto.dryRun, async (db) => {
      const byName = groupByName(
        await db.room.findMany({ where: { branchId } }),
        (r) => r.name,
      );
      const seen = new SeenNames();
      const creates: Prisma.RoomUncheckedCreateInput[] = [];
      const updates: { id: number; data: Prisma.RoomUpdateInput }[] = [];

      const rows = dto.rows.map((r) => {
        const name = cleanText(r.name);
        const result = rowResult(r.row, name);
        if (!name) return result('ERROR', 'Thiếu tên phòng');
        const first = seen.firstRow(name, r.row);
        if (first !== undefined) {
          return result('ERROR', `Trùng với dòng ${first}`);
        }
        const matches = byName.get(normalizeName(name)) ?? [];
        if (matches.length > 1) {
          return result('ERROR', `Có ${matches.length} phòng cùng tên`);
        }

        const room = matches[0];
        if (!room) {
          if (r.pricePerHour === undefined) {
            return result('ERROR', 'Thiếu giá theo giờ để tạo phòng mới');
          }
          creates.push({
            branchId,
            name,
            type: r.type ?? 'VIP',
            pricePerHour: r.pricePerHour,
          });
          return result('CREATE');
        }

        if (dto.onDuplicate === OnDuplicate.SKIP) {
          return result('SKIP', 'Phòng đã có');
        }
        // The price of an open session was fixed when it opened, so this
        // never changes a running bill.
        const data: Prisma.RoomUpdateInput = {};
        const changes: string[] = [];
        if (r.type !== undefined && r.type !== room.type) {
          data.type = r.type;
          changes.push(
            `loại ${ROOM_TYPE_LABELS[room.type] ?? room.type} → ${ROOM_TYPE_LABELS[r.type]}`,
          );
        }
        if (
          r.pricePerHour !== undefined &&
          r.pricePerHour !== Number(room.pricePerHour)
        ) {
          data.pricePerHour = r.pricePerHour;
          changes.push(
            `giá ${money(Number(room.pricePerHour))} → ${money(r.pricePerHour)}/giờ`,
          );
        }
        if (!changes.length) return result('SKIP', 'Không có thay đổi');
        updates.push({ id: room.id, data });
        return result('UPDATE', changes.join('; '));
      });

      return {
        rows,
        apply: async (tx) => {
          await tx.room.createMany({ data: creates });
          for (const u of updates) {
            await tx.room.update({ where: { id: u.id }, data: u.data });
          }
        },
      };
    });
  }

  // ---- tài khoản ----------------------------------------------------------------

  // New accounts have no password (floor staff); a manager sets one later if
  // they need to log in. Existing accounts match by username, or by full name
  // within the branch when the file has no username column.
  async importUsers(
    actor: AuthUser,
    branchCode: string | undefined,
    dto: ImportUsersDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(actor, branchCode);

    // May the actor give this role in this branch? (null = yes)
    const roleErrors = new Map<Role, string | null>();
    const roleError = async (role: Role) => {
      if (!roleErrors.has(role)) {
        let error: string | null = null;
        if (role === Role.CHAIN_MANAGER) {
          error = 'Không nhập tài khoản quản lý hệ thống từ Excel';
        } else {
          try {
            await this.users.checkAssignment(actor, role, branchId);
          } catch (e) {
            if (!(e instanceof HttpException)) throw e;
            error = e.message;
          }
        }
        roleErrors.set(role, error);
      }
      return roleErrors.get(role)!;
    };

    return this.run(dto.dryRun, async (db) => {
      const accounts = await db.user.findMany({
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          role: true,
          position: true,
          branchId: true,
          active: true,
        },
      });
      const byUsername = new Map(accounts.map((u) => [u.username, u]));
      const byFullName = groupByName(
        accounts.filter((u) => u.branchId === branchId && u.active),
        (u) => u.fullName,
      );
      const taken = new Set(byUsername.keys());
      const seen = new SeenNames();
      const creates: Prisma.UserUncheckedCreateInput[] = [];
      const updates: { id: number; data: Prisma.UserUncheckedUpdateInput }[] =
        [];

      const checkRow = async (r: UserImportRow): Promise<ImportRowResult> => {
        const fullName = cleanText(r.fullName);
        const result = rowResult(r.row, fullName);
        if (!fullName) return result('ERROR', 'Thiếu họ tên');
        const username = cleanText(r.username)?.toLowerCase();
        if (username !== undefined && !USERNAME_PATTERN.test(username)) {
          return result(
            'ERROR',
            `Tên đăng nhập "${username}" chỉ gồm 3–32 chữ thường không dấu, số, dấu chấm, gạch dưới`,
          );
        }
        const first = seen.firstRow(username ?? fullName, r.row);
        if (first !== undefined) {
          return result('ERROR', `Trùng với dòng ${first}`);
        }

        let account: (typeof accounts)[number] | undefined;
        if (username !== undefined) {
          account = byUsername.get(username);
        } else {
          const matches = byFullName.get(normalizeName(fullName)) ?? [];
          if (matches.length > 1) {
            return result(
              'ERROR',
              `Có ${matches.length} tài khoản cùng họ tên; hãy thêm cột tên đăng nhập`,
            );
          }
          account = matches[0];
        }
        const phone = cleanText(r.phone);

        if (!account) {
          const role = r.role ?? Role.STAFF;
          const error = await roleError(role);
          if (error) return result('ERROR', error);
          const login =
            username ?? uniqueUsername(usernameBase(fullName), taken);
          taken.add(login);
          creates.push({
            username: login,
            password: null,
            fullName,
            phone,
            role,
            position: r.position ?? null,
            branchId,
          });
          return result('CREATE', `Tên đăng nhập: ${login}`);
        }

        if (account.branchId !== branchId) {
          return result(
            'ERROR',
            `Tên đăng nhập "${account.username}" đã được dùng ở cơ sở khác`,
          );
        }
        if (dto.onDuplicate === OnDuplicate.SKIP) {
          return result('SKIP', `Tài khoản ${account.username} đã có`);
        }
        if (
          actor.role === Role.BRANCH_MANAGER &&
          !BRANCH_MANAGEABLE_ROLES.includes(account.role)
        ) {
          return result(
            'ERROR',
            `Bạn không có quyền sửa tài khoản ${account.username}`,
          );
        }

        const data: Prisma.UserUncheckedUpdateInput = {};
        const changes: string[] = [];
        if (fullName !== account.fullName) {
          data.fullName = fullName;
          changes.push(`họ tên → ${fullName}`);
        }
        if (phone !== undefined && phone !== account.phone) {
          data.phone = phone;
          changes.push(`SĐT → ${phone}`);
        }
        if (r.position !== undefined && r.position !== account.position) {
          data.position = r.position;
          changes.push('đổi chức vụ');
        }
        if (r.role !== undefined && r.role !== account.role) {
          if (account.id === actor.id) {
            return result('ERROR', 'Không thể tự đổi vai trò của chính mình');
          }
          const error = await roleError(r.role);
          if (error) return result('ERROR', error);
          data.role = r.role;
          changes.push('đổi vai trò');
        }
        if (!changes.length) return result('SKIP', 'Không có thay đổi');
        updates.push({ id: account.id, data });
        return result('UPDATE', `${account.username}: ${changes.join('; ')}`);
      };

      const rows: ImportRowResult[] = [];
      for (const r of dto.rows) rows.push(await checkRow(r));

      return {
        rows,
        apply: async (tx) => {
          await tx.user.createMany({ data: creates });
          for (const u of updates) {
            await tx.user.update({ where: { id: u.id }, data: u.data });
          }
        },
      };
    });
  }

  // ---- phiếu nhập kho -------------------------------------------------------------

  // The whole file becomes one phiếu nhập, written through
  // InventoryService.writeDocument like a phiếu entered by hand.
  async importStock(
    user: AuthUser,
    branchCode: string | undefined,
    dto: ImportStockDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
    });

    return this.run(dto.dryRun, async (db) => {
      const [products, categories] = await Promise.all([
        db.product.findMany({ where: { branchId, active: true } }),
        db.category.findMany({ where: { branchId } }),
      ]);
      const byName = groupByName(products, (p) => p.name);
      const cats = new CategoryResolver(categories, true);

      // One line per product, keyed by normalized name.
      interface Line extends StockLine {
        first: ImportRowResult;
        stock?: number; // current stock of an existing product
        create?: {
          name: string;
          unit: string;
          price: number;
          categoryName?: string;
        };
        unitLabel: string;
      }
      const lines = new Map<string, Line>();

      const rows = dto.rows.map((r) => {
        const name = cleanText(r.productName);
        const result = rowResult(r.row, name);
        if (!name) return result('ERROR', 'Thiếu tên sản phẩm');
        if (r.quantity === undefined || r.quantity < 1) {
          return result('ERROR', 'Thiếu số lượng (số nguyên từ 1)');
        }
        const key = normalizeName(name);
        const matches = byName.get(key) ?? [];
        if (matches.length > 1) {
          return result(
            'ERROR',
            `Có ${matches.length} sản phẩm đang bán cùng tên; hãy đổi tên trong hệ thống trước`,
          );
        }
        const product = matches[0];
        if (product && !product.trackStock) {
          return result('ERROR', 'Sản phẩm không quản lý tồn kho');
        }
        const unitCost =
          r.unitCost ?? (product ? Number(product.costPrice) : 0);

        const line = lines.get(key);
        if (line) {
          Object.assign(
            line,
            mergeCost(line, { quantity: r.quantity, unitCost }),
          );
          return result(line.first.action, `Gộp vào dòng ${line.first.row}`);
        }

        if (product) {
          const first = result('UPDATE');
          lines.set(key, {
            first,
            productId: product.id,
            quantity: r.quantity,
            unitCost,
            stock: product.stockQuantity,
            unitLabel: product.unit,
          });
          return first;
        }

        if (!dto.createProducts) {
          return result('ERROR', `Chưa có sản phẩm "${name}"`);
        }
        const unit = cleanText(r.unit);
        const missing = [
          unit === undefined && 'đơn vị tính',
          r.price === undefined && 'giá bán',
        ].filter(Boolean);
        if (missing.length) {
          return result(
            'ERROR',
            `Chưa có sản phẩm này; thiếu ${missing.join(', ')} để tạo mới`,
          );
        }
        const categoryName = cleanText(r.categoryName);
        if (categoryName) cats.check(categoryName);
        const first = result('CREATE');
        lines.set(key, {
          first,
          productId: 0,
          quantity: r.quantity,
          unitCost,
          create: { name, unit: unit!, price: r.price!, categoryName },
          unitLabel: unit!,
        });
        return first;
      });

      // Messages of the first rows, now that merged rows are counted.
      let total = 0;
      for (const line of lines.values()) {
        total += line.quantity * line.unitCost;
        const qty = `${line.quantity} ${line.unitLabel} × ${money(line.unitCost)}`;
        line.first.message = line.create
          ? `Sản phẩm mới · ${qty}`
          : `${qty} · tồn ${line.stock} → ${line.stock! + line.quantity}`;
      }

      return {
        rows,
        apply: async (tx) => {
          await cats.createMissing(tx, branchId);
          const docLines: StockLine[] = [];
          for (const line of lines.values()) {
            let productId = line.productId;
            if (line.create) {
              const { categoryName, ...p } = line.create;
              const created = await tx.product.create({
                data: { ...p, branchId, categoryId: cats.idOf(categoryName) },
              });
              productId = created.id;
            }
            docLines.push({
              productId,
              quantity: line.quantity,
              unitCost: line.unitCost,
            });
          }
          const document = await this.inventory.writeDocument(
            tx,
            user,
            branch,
            {
              type: StockDocType.IMPORT,
              supplier: dto.supplier,
              note: dto.note,
              paymentMethod: dto.paymentMethod,
            },
            docLines,
          );
          return {
            document: {
              id: document.id,
              code: document.code,
              totalAmount: document.totalAmount,
            },
          };
        },
        info: { totalAmount: total },
      };
    });
  }
}
