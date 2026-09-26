import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';

const include = { category: true };

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
    private inventory: InventoryService,
  ) {}

  private async assertCategoryInBranch(
    categoryId: number | null | undefined,
    branchId: number,
  ) {
    if (categoryId === null || categoryId === undefined) return;
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.branchId !== branchId) {
      throw new BadRequestException('Danh mục không thuộc cơ sở này');
    }
  }

  private async getProduct(user: AuthUser, id: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    this.branchScope.assertBranchAccess(user, product.branchId);
    return product;
  }

  async create(
    user: AuthUser,
    branchCode: string | undefined,
    dto: CreateProductDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    await this.assertCategoryInBranch(dto.categoryId, branchId);
    return this.prisma.product.create({
      data: { ...dto, name: dto.name.trim(), branchId },
      include,
    });
  }

  // With pendingQuantity: how many are already ordered in open sessions
  // (stock is only deducted at checkout).
  async findAll(user: AuthUser, branchCode?: string, includeInactive = false) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    const [products, pending] = await Promise.all([
      this.prisma.product.findMany({
        where: { branchId, active: includeInactive ? undefined : true },
        include,
        orderBy: { name: 'asc' },
      }),
      this.inventory.pendingQuantities(branchId),
    ]);
    return products.map((p) => ({
      ...p,
      pendingQuantity: pending.get(p.id) ?? 0,
    }));
  }

  async findOne(user: AuthUser, id: number) {
    await this.getProduct(user, id);
    return this.prisma.product.findUnique({ where: { id }, include });
  }

  async update(user: AuthUser, id: number, dto: UpdateProductDto) {
    const product = await this.getProduct(user, id);
    await this.assertCategoryInBranch(dto.categoryId, product.branchId);
    // Stock of an untracked product would vanish from every report.
    if (
      dto.trackStock === false &&
      product.trackStock &&
      product.stockQuantity !== 0
    ) {
      throw new ConflictException(
        `"${product.name}" còn tồn kho ${product.stockQuantity} ${product.unit}; hãy lập phiếu xuất cho hết trước khi tắt quản lý tồn kho`,
      );
    }
    return this.prisma.product.update({
      where: { id },
      data: { ...dto, name: dto.name?.trim() },
      include,
    });
  }

  // Soft delete: order items and stock history keep pointing at it.
  async remove(user: AuthUser, id: number) {
    await this.getProduct(user, id);
    return this.prisma.product.update({
      where: { id },
      data: { active: false },
      include,
    });
  }
}
