import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { dateRange } from '../common/dates';
import { DateRangeQuery } from '../inventory/dto/inventory-queries';
import { CreateFundTransactionDto } from './dto/create-fund-transaction.dto';
import { ListFundTransactionsQuery } from './dto/fund-queries';

@Injectable()
export class FundsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  async list(user: AuthUser, query: ListFundTransactionsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    return this.prisma.fundTransaction.findMany({
      where: {
        branchId,
        type: query.type,
        occurredAt: dateRange(query.from, query.to),
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }

  async create(
    user: AuthUser,
    branchCode: string | undefined,
    dto: CreateFundTransactionDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.prisma.fundTransaction.create({
      data: {
        ...dto,
        category: dto.category?.trim() || null,
        branchId,
        createdById: user.id,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  // Totals for the period: thu, chi and chênh lệch.
  async summary(user: AuthUser, query: DateRangeQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const groups = await this.prisma.fundTransaction.groupBy({
      by: ['type'],
      where: { branchId, occurredAt: dateRange(query.from, query.to) },
      _sum: { amount: true },
    });
    const total = (type: TransactionType) =>
      Number(groups.find((g) => g.type === type)?._sum.amount ?? 0);
    const income = total(TransactionType.INCOME);
    const expense = total(TransactionType.EXPENSE);
    return { income, expense, net: income - expense };
  }
}
