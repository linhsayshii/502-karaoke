import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDayRange } from '../common/dates';
import { DateRangeQuery } from '../inventory/dto/inventory-queries';
import { CreateFundTransactionDto } from './dto/create-fund-transaction.dto';
import { ListFundTransactionsQuery } from './dto/fund-queries';
import { manualCategory } from './fund-categories';

const userRef = { select: { id: true, fullName: true } };
const fundInclude = {
  createdBy: userRef,
  cancelledBy: userRef,
  order: {
    select: {
      id: true,
      billNumber: true,
      status: true,
      room: { select: { name: true } },
    },
  },
  stockDocument: { select: { id: true, code: true, type: true } },
} satisfies Prisma.FundTransactionInclude;

interface Totals {
  income: number;
  expense: number;
}

const METHODS = [PaymentMethod.CASH, PaymentMethod.TRANSFER];

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
        method: query.method,
        occurredAt: businessDayRange(query.from, query.to),
      },
      include: fundInclude,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  }

  // Manual phiếu thu / phiếu chi, under a fixed category (fund-categories.ts).
  async create(
    user: AuthUser,
    branchCode: string | undefined,
    dto: CreateFundTransactionDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.prisma.fundTransaction.create({
      data: {
        ...dto,
        category: manualCategory(dto.type, dto.category),
        description: dto.description?.trim() || null,
        branchId,
        createdById: user.id,
      },
      include: fundInclude,
    });
  }

  // Only manual entries: the receipt of a bill or the payment of an import
  // follows its source (void the bill / cancel the stock document instead).
  async cancel(user: AuthUser, id: number, reason: string) {
    const entry = await this.prisma.fundTransaction.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Không tìm thấy phiếu thu/chi');
    this.branchScope.assertBranchAccess(user, entry.branchId);
    if (entry.orderId !== null) {
      throw new ConflictException(
        'Phiếu thu này gắn với hóa đơn; hãy hủy hóa đơn trong mục Hóa đơn',
      );
    }
    if (entry.stockDocumentId !== null) {
      throw new ConflictException(
        'Phiếu chi này gắn với phiếu nhập kho; hãy hủy phiếu nhập trong mục Phiếu kho',
      );
    }

    const { count } = await this.prisma.fundTransaction.updateMany({
      where: { id, cancelledAt: null },
      data: {
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancelReason: reason.trim(),
      },
    });
    if (count === 0) throw new ConflictException('Phiếu đã bị hủy');
    return this.prisma.fundTransaction.findUniqueOrThrow({
      where: { id },
      include: fundInclude,
    });
  }

  // Cash book of the period: opening balance, receipts and payments (split by
  // cash / transfer, and what came from sales and imports), closing balance.
  // Cancelled entries are left out.
  async summary(user: AuthUser, query: DateRangeQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const period = businessDayRange(query.from, query.to);
    const active = { branchId, cancelledAt: null };

    const [inPeriod, before, linked, salesTax] = await Promise.all([
      this.prisma.fundTransaction.groupBy({
        by: ['type', 'method'],
        where: { ...active, occurredAt: period },
        _sum: { amount: true },
      }),
      period.gte
        ? this.prisma.fundTransaction.groupBy({
            by: ['type', 'method'],
            where: { ...active, occurredAt: { lt: period.gte } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      this.prisma.fundTransaction.groupBy({
        by: ['type'],
        where: {
          ...active,
          occurredAt: period,
          OR: [{ orderId: { not: null } }, { stockDocumentId: { not: null } }],
        },
        _sum: { amount: true },
      }),
      // VAT inside the sales receipts: the tax of the bills they belong to.
      this.prisma.order.aggregate({
        where: {
          fundTransaction: {
            is: { branchId, cancelledAt: null, occurredAt: period },
          },
        },
        _sum: { taxAmount: true },
      }),
    ]);

    type Row = {
      type: TransactionType;
      method: PaymentMethod;
      _sum: { amount: Prisma.Decimal | null };
    };
    const totals = (rows: Row[], method?: PaymentMethod): Totals => {
      const sum = (type: TransactionType) =>
        rows
          .filter((r) => r.type === type && (!method || r.method === method))
          .reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
      return {
        income: sum(TransactionType.INCOME),
        expense: sum(TransactionType.EXPENSE),
      };
    };
    const balance = (t: Totals) => t.income - t.expense;

    const periodTotals = totals(inPeriod);
    const opening = balance(totals(before));
    const linkedSum = (type: TransactionType) =>
      Number(linked.find((r) => r.type === type)?._sum.amount ?? 0);

    return {
      openingBalance: opening,
      income: periodTotals.income,
      expense: periodTotals.expense,
      net: balance(periodTotals),
      closingBalance: opening + balance(periodTotals),
      // Receipts of paid bills / payments of imports within the totals.
      salesIncome: linkedSum(TransactionType.INCOME),
      salesVat: Number(salesTax._sum.taxAmount ?? 0),
      purchaseExpense: linkedSum(TransactionType.EXPENSE),
      byMethod: METHODS.map((method) => {
        const t = totals(inPeriod, method);
        const methodOpening = balance(totals(before, method));
        return {
          method,
          openingBalance: methodOpening,
          income: t.income,
          expense: t.expense,
          closingBalance: methodOpening + balance(t),
        };
      }),
    };
  }
}
