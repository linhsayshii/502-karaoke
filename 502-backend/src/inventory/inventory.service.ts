import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, StockDocType, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { dateRange } from '../common/dates';
import { CreateStockDocumentDto } from './dto/create-stock-document.dto';
import {
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
  // Sales may drive stock negative (never block the cashier); exports may not.
  allowNegative?: boolean;
}

const userRef = { select: { id: true, fullName: true } };
const documentDetail = {
  lines: {
    include: { product: { select: { id: true, name: true, unit: true } } },
  },
  createdBy: userRef,
} satisfies Prisma.StockDocumentInclude;

function dateCode(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // The only way stockQuantity changes: atomic increment + one ledger row.
  // Must run inside the caller's transaction.
  async applyMovement(tx: Prisma.TransactionClient, m: MovementInput) {
    const product = await tx.product.update({
      where: { id: m.productId },
      data: { stockQuantity: { increment: m.quantity } },
      select: { name: true, stockQuantity: true },
    });
    if (!m.allowNegative && m.quantity < 0 && product.stockQuantity < 0) {
      throw new BadRequestException(
        `Không đủ tồn kho cho "${product.name}" (còn ${product.stockQuantity - m.quantity})`,
      );
    }
    await tx.stockMovement.create({
      data: {
        branchId: m.branchId,
        productId: m.productId,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: product.stockQuantity,
        documentId: m.documentId,
        orderId: m.orderId,
        createdById: m.createdById,
      },
    });
    return product.stockQuantity;
  }

  async stock(user: AuthUser, branchCode?: string) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.prisma.product.findMany({
      where: { branchId, active: true, trackStock: true },
      include: { category: true },
      orderBy: { name: 'asc' },
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
      if (!p || p.branchId !== branchId || !p.active) {
        throw new BadRequestException('Sản phẩm không thuộc cơ sở này');
      }
      if (!p.trackStock) {
        throw new BadRequestException(`"${p.name}" không quản lý tồn kho`);
      }
    }

    const isImport = dto.type === StockDocType.IMPORT;
    const lines = dto.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitCost: l.unitCost ?? Number(byId.get(l.productId)!.costPrice),
    }));
    const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.stockDocument.create({
        data: {
          branchId,
          type: dto.type,
          code: `tmp-${randomUUID()}`,
          supplier: dto.supplier,
          note: dto.note,
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

      for (const line of lines) {
        await this.applyMovement(tx, {
          branchId,
          productId: line.productId,
          type: isImport ? StockMovementType.IMPORT : StockMovementType.EXPORT,
          quantity: isImport ? line.quantity : -line.quantity,
          documentId: created.id,
          createdById: user.id,
        });
        if (isImport && line.unitCost > 0) {
          await tx.product.update({
            where: { id: line.productId },
            data: { costPrice: line.unitCost },
          });
        }
      }

      return tx.stockDocument.findUniqueOrThrow({
        where: { id: created.id },
        include: documentDetail,
      });
    });
  }

  async listDocuments(user: AuthUser, query: ListDocumentsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    return this.prisma.stockDocument.findMany({
      where: {
        branchId,
        type: query.type,
        createdAt: dateRange(query.from, query.to),
      },
      include: { createdBy: userRef, _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
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

  async movements(user: AuthUser, query: ListMovementsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    return this.prisma.stockMovement.findMany({
      where: {
        branchId,
        productId: query.productId,
        createdAt: dateRange(query.from, query.to),
      },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        document: { select: { id: true, code: true } },
        createdBy: userRef,
      },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }
}
