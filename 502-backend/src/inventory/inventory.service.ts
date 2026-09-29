import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Branch,
  OrderStatus,
  PaymentMethod,
  Prisma,
  StockDocType,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDayRange } from '../common/dates';
import { cancelLinkedEntry, recordPurchasePayment } from '../funds/fund-ledger';
import { costMovement, MovementCost } from './costing';
import { CreateStockDocumentDto } from './dto/create-stock-document.dto';
import {
  DateRangeQuery,
  ListDocumentsQuery,
  ListMovementsQuery,
} from './dto/inventory-queries';

export interface MovementInput {
  branchId: number;
  productId: number;
  type: StockMovementType;
  quantity: number; // signed
  documentId?: number;
  orderId?: number;
  createdById?: number;
  // Sales may drive stock negative (never block the cashier); exports and
  // reversals of imports may not.
  allowNegative?: boolean;
  // Goods coming in, and cancelled imports: the unit cost they move at (see
  // costMovement). Sales and exports ignore it: they leave at the average.
  unitCost?: number;
}

type Db = Prisma.TransactionClient | PrismaService;

export interface StockLine {
  productId: number;
  quantity: number;
  unitCost: number;
}

const userRef = { select: { id: true, fullName: true } };
const fundRef = {
  select: { id: true, method: true, amount: true, cancelledAt: true },
};
const documentDetail = {
  lines: {
    include: { product: { select: { id: true, name: true, unit: true } } },
    orderBy: { id: 'asc' },
  },
  createdBy: userRef,
  cancelledBy: userRef,
  fundTransaction: fundRef,
} satisfies Prisma.StockDocumentInclude;

function dateCode(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // The only way stockQuantity and costPrice change: atomic increment + one
  // ledger row, the weighted average cost moved on under the same row lock.
  // Must run inside the caller's transaction.
  async applyMovement(
    tx: Prisma.TransactionClient,
    m: MovementInput,
  ): Promise<{ balanceAfter: number } & MovementCost> {
    const product = await tx.product.update({
      where: { id: m.productId },
      data: { stockQuantity: { increment: m.quantity } },
      select: { name: true, stockQuantity: true, costPrice: true },
    });
    if (!m.allowNegative && m.quantity < 0 && product.stockQuantity < 0) {
      throw new BadRequestException(
        `Không đủ tồn kho cho "${product.name}" (còn ${product.stockQuantity - m.quantity})`,
      );
    }
    const average = Number(product.costPrice);
    const cost = costMovement({
      type: m.type,
      quantity: m.quantity,
      stockBefore: product.stockQuantity - m.quantity,
      average,
      unitCost: m.unitCost,
    });
    if (cost.costAfter !== average) {
      await tx.product.update({
        where: { id: m.productId },
        data: { costPrice: cost.costAfter },
      });
    }
    await tx.stockMovement.create({
      data: {
        branchId: m.branchId,
        productId: m.productId,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: product.stockQuantity,
        unitCost: cost.unitCost,
        costAfter: cost.costAfter,
        documentId: m.documentId,
        orderId: m.orderId,
        createdById: m.createdById,
      },
    });
    return { balanceAfter: product.stockQuantity, ...cost };
  }

  // Quantities ordered in open sessions: still in stock (deducted at
  // checkout) but already promised to a room.
  async pendingQuantities(branchId: number, db: Db = this.prisma) {
    const rows = await db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { branchId, status: OrderStatus.PENDING } },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  }

  // Stock-tracked products, including discontinued ones that still hold
  // stock (so the stock value never hides anything).
  async stock(user: AuthUser, branchCode?: string) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    const [products, pending] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          branchId,
          trackStock: true,
          OR: [{ active: true }, { stockQuantity: { not: 0 } }],
        },
        include: { category: true },
        orderBy: { name: 'asc' },
      }),
      this.pendingQuantities(branchId),
    ]);
    return products.map((p) => {
      const pendingQuantity = pending.get(p.id) ?? 0;
      return {
        ...p,
        pendingQuantity,
        availableQuantity: p.stockQuantity - pendingQuantity,
      };
    });
  }

  async createDocument(
    user: AuthUser,
    branchCode: string | undefined,
    dto: CreateStockDocumentDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
    });
    const isImport = dto.type === StockDocType.IMPORT;
    if (!isImport && dto.paymentMethod) {
      throw new BadRequestException('Phiếu xuất không ghi chi quỹ');
    }

    const productIds = dto.lines.map((l) => l.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Một sản phẩm chỉ được nhập một dòng trên phiếu',
      );
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const id of productIds) {
      const p = byId.get(id);
      if (!p || p.branchId !== branchId) {
        throw new BadRequestException('Sản phẩm không thuộc cơ sở này');
      }
      if (!p.trackStock) {
        throw new BadRequestException(`"${p.name}" không quản lý tồn kho`);
      }
      // Discontinued products may still be exported (clear what is left).
      if (isImport && !p.active) {
        throw new BadRequestException(`"${p.name}" đã ngừng bán`);
      }
    }

    const lines = dto.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitCost: l.unitCost ?? Number(byId.get(l.productId)!.costPrice),
    }));

    return this.prisma.$transaction((tx) =>
      this.writeDocument(tx, user, branch, dto, lines),
    );
  }

  // Writes a validated document with its movements (which move the cost
  // price on) and, for a paid import, its phiếu chi. Must run inside the
  // caller's transaction; the Excel import calls it after creating the
  // products it needs.
  async writeDocument(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    branch: Branch,
    doc: {
      type: StockDocType;
      supplier?: string;
      note?: string;
      paymentMethod?: PaymentMethod;
    },
    lines: StockLine[],
  ) {
    const branchId = branch.id;
    const isImport = doc.type === StockDocType.IMPORT;
    const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    const created = await tx.stockDocument.create({
      data: {
        branchId,
        type: doc.type,
        code: `tmp-${randomUUID()}`,
        supplier: doc.supplier?.trim() || null,
        note: doc.note?.trim() || null,
        totalAmount,
        createdById: user.id,
        lines: { create: lines },
      },
    });
    // PN-CS1-20260926-0042: the id suffix keeps codes unique without locks.
    const code = [
      isImport ? 'PN' : 'PX',
      branch.code.toUpperCase(),
      dateCode(created.createdAt),
      String(created.id).padStart(4, '0'),
    ].join('-');
    await tx.stockDocument.update({
      where: { id: created.id },
      data: { code },
    });

    // Rows are locked in product id order (see checkout).
    const byProduct = [...lines].sort((a, b) => a.productId - b.productId);
    for (const line of byProduct) {
      await this.applyMovement(tx, {
        branchId,
        productId: line.productId,
        type: isImport ? StockMovementType.IMPORT : StockMovementType.EXPORT,
        quantity: isImport ? line.quantity : -line.quantity,
        unitCost: line.unitCost,
        documentId: created.id,
        createdById: user.id,
      });
    }

    // Paid from the fund: the phiếu chi is written with the document.
    if (isImport && doc.paymentMethod && totalAmount > 0) {
      await recordPurchasePayment(tx, {
        branchId,
        stockDocumentId: created.id,
        code,
        supplier: created.supplier,
        amount: totalAmount,
        method: doc.paymentMethod,
        occurredAt: created.createdAt,
        createdById: user.id,
      });
    }

    return tx.stockDocument.findUniqueOrThrow({
      where: { id: created.id },
      include: documentDetail,
    });
  }

  // Cancels a document: its stock movements are reversed (an import can only
  // be cancelled while its goods are still in stock) at the cost each line
  // moved at, so a cancelled import comes back out of the average cost, and
  // its fund payment is cancelled.
  cancelDocument(user: AuthUser, id: number, reason: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const document = await tx.stockDocument.findUnique({
          where: { id },
          include: { lines: { orderBy: { productId: 'asc' } } },
        });
        if (!document) throw new NotFoundException('Không tìm thấy phiếu');
        this.branchScope.assertBranchAccess(user, document.branchId);

        const { count } = await tx.stockDocument.updateMany({
          where: { id, cancelledAt: null },
          data: {
            cancelledAt: new Date(),
            cancelledById: user.id,
            cancelReason: reason.trim(),
          },
        });
        if (count === 0) throw new ConflictException('Phiếu đã bị hủy');

        // The cost each line moved at. Movements from before costing have
        // none (0): an import falls back to its line cost (Ruling 2).
        const moved = await tx.stockMovement.findMany({
          where: {
            documentId: document.id,
            type: { in: [StockMovementType.IMPORT, StockMovementType.EXPORT] },
          },
          select: { productId: true, unitCost: true },
        });
        const movedAt = new Map(
          moved.map((mv) => [mv.productId, Number(mv.unitCost)]),
        );

        const isImport = document.type === StockDocType.IMPORT;
        for (const line of document.lines) {
          try {
            await this.applyMovement(tx, {
              branchId: document.branchId,
              productId: line.productId,
              type: StockMovementType.REVERSAL,
              quantity: isImport ? -line.quantity : line.quantity,
              unitCost: movedAt.get(line.productId) || Number(line.unitCost),
              documentId: document.id,
              createdById: user.id,
            });
          } catch (error) {
            if (error instanceof BadRequestException) {
              throw new BadRequestException(
                `Không thể hủy phiếu ${document.code}: ${error.message}`,
              );
            }
            throw error;
          }
        }

        await cancelLinkedEntry(
          tx,
          { stockDocumentId: document.id },
          {
            cancelledById: user.id,
            reason: `Hủy phiếu ${document.code}: ${reason.trim()}`,
          },
        );

        return tx.stockDocument.findUniqueOrThrow({
          where: { id },
          include: documentDetail,
        });
      },
      { timeout: 15000 },
    );
  }

  // Amounts (at cost) of every document of the period still standing, by
  // type — not only of the 200 the list returns. Summed in SQL on the
  // report pool.
  async documentsSummary(user: AuthUser, query: DateRangeQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const groups = await this.reportDb.stockDocument.groupBy({
      by: ['type'],
      where: {
        branchId,
        cancelledAt: null,
        createdAt: businessDayRange(query.from, query.to),
      },
      _sum: { totalAmount: true },
    });
    const total = (type: StockDocType) =>
      Number(groups.find((g) => g.type === type)?._sum.totalAmount ?? 0);
    return {
      importTotal: total(StockDocType.IMPORT),
      exportTotal: total(StockDocType.EXPORT),
    };
  }

  // The newest 200 documents, and how many match in all.
  async listDocuments(user: AuthUser, query: ListDocumentsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const where: Prisma.StockDocumentWhereInput = {
      branchId,
      type: query.type,
      createdAt: businessDayRange(query.from, query.to),
    };
    return Promise.all([
      this.prisma.stockDocument.findMany({
        where,
        include: {
          createdBy: userRef,
          cancelledBy: userRef,
          fundTransaction: fundRef,
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.stockDocument.count({ where }),
    ]);
  }

  async getDocument(user: AuthUser, id: number) {
    const document = await this.prisma.stockDocument.findUnique({
      where: { id },
      include: documentDetail,
    });
    if (!document) throw new NotFoundException('Không tìm thấy phiếu');
    this.branchScope.assertBranchAccess(user, document.branchId);
    return document;
  }

  // The newest 500 movements, and how many match in all.
  async movements(user: AuthUser, query: ListMovementsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const where: Prisma.StockMovementWhereInput = {
      branchId,
      productId: query.productId,
      createdAt: businessDayRange(query.from, query.to),
    };
    return Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, unit: true } },
          document: { select: { id: true, code: true, type: true } },
          createdBy: userRef,
        },
        orderBy: { id: 'desc' },
        take: 500,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
  }
}
