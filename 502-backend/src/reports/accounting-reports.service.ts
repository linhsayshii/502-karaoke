import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../funds/fund-categories';
import { Bucket, bucketsBetween, GroupBy, rollUp } from './buckets';
import {
  addProfit,
  emptyProfit,
  ProfitDay,
  ProfitMetrics,
  sumProfit,
  toProfitMetrics,
} from './profit';
import { businessDateSql, paidOrdersWhere, periodWhere } from './report-sql';
import { reportScope } from './report-scope';
import { ReportsService } from './reports.service';
import { ReportQuery } from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

export interface ProfitReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  groupBy: GroupBy;
  categories: ExpenseCategory[]; // the expense lines, in order
  totals: ProfitMetrics;
  buckets: (Bucket & ProfitMetrics)[];
}

// Accounting reports: profit and loss, and the stock ledger. Like the
// revenue report, the SQL sums per business day and the periods are
// rolled up here.
@Injectable()
export class AccountingReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
    private reports: ReportsService,
  ) {}

  // Profit and loss per period. Sales and their cost by payment time,
  // manual fund entries by their time (cancelled ones and those written by
  // sales and imports left out), exports of documents still standing and
  // the imports' amounts by the document's time. `compare` is not used
  // (Ruling 7).
  async profit(user: AuthUser, query: ReportQuery): Promise<ProfitReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const groupBy = query.groupBy ?? 'day';
    const { from, to } = query;

    const [sales, cogs, fund, losses, purchases] = await Promise.all([
      this.reports.daily(branchId, from, to),
      this.prisma.$queryRaw<{ date: string; cogs: number }[]>`
        SELECT ${businessDateSql(Prisma.sql`o."endTime"`)} AS "date",
          COALESCE(SUM(i."quantity" * i."unitCost"), 0)::float8 AS "cogs"
        FROM "OrderItem" i
        JOIN "Order" o ON o."id" = i."orderId"
        WHERE ${paidOrdersWhere(branchId, from, to)}
        GROUP BY 1`,
      this.prisma.$queryRaw<
        {
          date: string;
          type: TransactionType;
          category: string | null;
          amount: number;
        }[]
      >`
        SELECT ${businessDateSql(Prisma.sql`f."occurredAt"`)} AS "date",
          f."type" AS "type", f."category" AS "category",
          SUM(f."amount")::float8 AS "amount"
        FROM "FundTransaction" f
        WHERE f."cancelledAt" IS NULL
          AND f."orderId" IS NULL
          AND f."stockDocumentId" IS NULL
          AND ${periodWhere(Prisma.sql`f."occurredAt"`, Prisma.sql`f."branchId"`, branchId, from, to)}
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<{ date: string; losses: number }[]>`
        SELECT ${businessDateSql(Prisma.sql`m."createdAt"`)} AS "date",
          SUM(-m."quantity" * m."unitCost")::float8 AS "losses"
        FROM "StockMovement" m
        JOIN "StockDocument" d ON d."id" = m."documentId"
        WHERE m."type" = 'EXPORT'
          AND d."cancelledAt" IS NULL
          AND ${periodWhere(Prisma.sql`m."createdAt"`, Prisma.sql`m."branchId"`, branchId, from, to)}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ date: string; purchases: number }[]>`
        SELECT ${businessDateSql(Prisma.sql`d."createdAt"`)} AS "date",
          SUM(d."totalAmount")::float8 AS "purchases"
        FROM "StockDocument" d
        WHERE d."type" = 'IMPORT'
          AND d."cancelledAt" IS NULL
          AND ${periodWhere(Prisma.sql`d."createdAt"`, Prisma.sql`d."branchId"`, branchId, from, to)}
        GROUP BY 1`,
    ]);

    const days: ProfitDay[] = [
      ...sales.map((row) => ({ date: row.date, sales: row })),
      ...cogs.map((row) => ({ date: row.date, cogs: row.cogs })),
      ...fund.map((row) =>
        row.type === TransactionType.EXPENSE
          ? {
              date: row.date,
              expense: { category: row.category, amount: row.amount },
            }
          : { date: row.date, otherIncome: row.amount },
      ),
      ...losses.map((row) => ({ date: row.date, losses: row.losses })),
      ...purchases.map((row) => ({
        date: row.date,
        purchases: row.purchases,
      })),
    ];

    return {
      branchId: branchId ?? null,
      range: { from, to },
      groupBy,
      categories: [...EXPENSE_CATEGORIES],
      totals: toProfitMetrics(sumProfit(days)),
      buckets: rollUp(
        bucketsBetween(from, to, groupBy),
        groupBy,
        days,
        emptyProfit,
        (acc, day) => addProfit(acc, day),
      ).map(({ bucket, value }) => ({ ...bucket, ...toProfitMetrics(value) })),
    };
  }
}
