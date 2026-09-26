import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';

const include = { products: { where: { active: true } } };

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  private async assertUniqueName(
    branchId: number,
    name: string,
    exceptId?: number,
  ) {
    const duplicate = await this.prisma.category.findFirst({
      where: {
        branchId,
        name: { equals: name, mode: 'insensitive' },
        id: exceptId ? { not: exceptId } : undefined,
      },
    });
    if (duplicate) throw new ConflictException('Danh mục đã tồn tại');
  }

  private async getCategory(user: AuthUser, id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    this.branchScope.assertBranchAccess(user, category.branchId);
    return category;
  }

  async create(
    user: AuthUser,
    branchCode: string | undefined,
    dto: CreateCategoryDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    const name = dto.name.trim();
    await this.assertUniqueName(branchId, name);
    return this.prisma.category.create({ data: { name, branchId }, include });
  }

  async findAll(user: AuthUser, branchCode?: string) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.prisma.category.findMany({
      where: { branchId },
      include,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: number) {
    await this.getCategory(user, id);
    return this.prisma.category.findUnique({ where: { id }, include });
  }

  async update(user: AuthUser, id: number, dto: UpdateCategoryDto) {
    const category = await this.getCategory(user, id);
    const name = dto.name?.trim();
    if (name) await this.assertUniqueName(category.branchId, name, id);
    return this.prisma.category.update({
      where: { id },
      data: { name },
      include,
    });
  }

  // Products of a deleted category become uncategorized.
  async remove(user: AuthUser, id: number) {
    await this.getCategory(user, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
      return tx.category.delete({ where: { id } });
    });
  }
}
