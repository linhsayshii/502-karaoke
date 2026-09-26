import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  async findAll(user: AuthUser, branchCode?: string, includeInactive = false) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.prisma.product.findMany({
      where: { branchId, active: includeInactive ? undefined : true },
      include,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: number) {
    await this.getProduct(user, id);
    return this.prisma.product.findUnique({ where: { id }, include });
  }

  async update(user: AuthUser, id: number, dto: UpdateProductDto) {
    const product = await this.getProduct(user, id);
    await this.assertCategoryInBranch(dto.categoryId, product.branchId);
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
