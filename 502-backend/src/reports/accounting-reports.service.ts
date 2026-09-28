import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDayRange } from '../common/dates';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../funds/fund-categories';
import { roundCost } from '../inventory/costing';
import { Bucket, bucketsBetween, GroupBy, rollUp } from './buckets';
import {
  addProfit,
  emptyProfit,
  ProfitDay,
  ProfitMetrics,
  sumProfit,
  toProfitMetrics,
} from './profit';
import {
  businessDateSql,
  branchWhere,
  paidOrdersWhere,
  periodWhere,
  utcTimestamp,
} from './report-sql';
import { reportScope } from './report-scope';
import { ReportsService } from './reports.service';
import { ReportQuery, ReportRangeQuery } from './dto/report-query';

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

// A quantity and its value at cost.
export interface StockFlow {
  quantity: number;
  value: number;
}

// Nhập – xuất – tồn of a product. imports, sales and exports are positive;
// others (reversals of cancelled documents and bills, adjustments) signed.
export interface InventoryFlows {
  opening: StockFlow;
  imports: StockFlow;
  sales: StockFlow;
  exports: StockFlow;
  others: StockFlow;
  closing: StockFlow;
}

export interface InventoryRow extends InventoryFlows {
  productId: number;
  name: string;
  unit: string;
  categoryId: number | null;
  categoryName: string | null;
  branchCode: string;
}

export interface InventoryReport {
  branchId: number | null;
  range: Range;
  totals: InventoryFlows;
  rows: InventoryRow[];
}

const FLOW_KEYS = [
  'opening',
  'imports',
  'sales',
  'exports',
  'others',
  'closing',
] as const;

// The column each movement type goes to, and its sign there.
const FLOW_OF: Record<
  StockMovementType,
  { flow: keyof InventoryFlows; sign: 1 | -1 }
> = {
  IMPORT: { flow: 'imports', sign: 1 },
  SALE: { flow: 'sales', sign: -1 },
  EXPORT: { flow: 'exports', sign: -1 },
  REVERSAL: { flow: 'others', sign: 1 },
  ADJUSTMENT: { flow: 'others', sign: 1 },
};

const emptyFlows = (): InventoryFlows =>
  Object.fromEntries(
    FLOW_KEYS.map((key) => [key, { quantity: 0, value: 0 }]),
  ) as unknown as InventoryFlows;

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

  // Nhập – xuất – tồn per product. Opening and closing balances are the
  // ledger's (balance × average cost after the last movement before the
  // range / before its end); the flows in between are Σ quantity × unit
  // cost of the movements, so values may differ from the closing by the
  // rounding of the average (Ruling 12).
  async inventory(
    user: AuthUser,
    query: ReportRangeQuery,
  ): Promise<InventoryReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const range = businessDayRange(query.from, query.to);
    const [opening, closing, moved] = await Promise.all([
      this.balances(branchId, range.gte!),
      this.balances(branchId, range.lt!),
      this.prisma.$queryRaw<
        {
          productId: number;
          type: StockMovementType;
          quantity: number;
          value: number;
        }[]
      >`
        SELECT m."productId" AS "productId", m."type" AS "type",
          SUM(m."quantity")::int AS "quantity",
          SUM(m."quantity" * m."unitCost")::float8 AS "value"
        FROM "StockMovement" m
        WHERE ${periodWhere(Prisma.sql`m."createdAt"`, Prisma.sql`m."branchId"`, branchId, query.from, query.to)}
        GROUP BY 1, 2`,
    ]);

    const flows = new Map<number, InventoryFlows>();
    const flowsOf = (productId: number) => {
      let entry = flows.get(productId);
      if (!entry) {
        entry = emptyFlows();
        flows.set(productId, entry);
      }
      return entry;
    };
    for (const b of opening) {
      if (b.quantity !== 0) {
        flowsOf(b.productId).opening = {
          quantity: b.quantity,
          value: roundCost(b.quantity * b.cost),
        };
      }
    }
    for (const b of closing) {
      if (b.quantity !== 0) {
        flowsOf(b.productId).closing = {
          quantity: b.quantity,
          value: roundCost(b.quantity * b.cost),
        };
      }
    }
    for (const m of moved) {
      const { flow, sign } = FLOW_OF[m.type];
      const entry = flowsOf(m.productId)[flow];
      entry.quantity += sign * m.quantity;
      entry.value = roundCost(entry.value + sign * m.value);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...flows.keys()] } },
      select: {
        id: true,
        name: true,
        unit: true,
        category: { select: { id: true, name: true } },
        branch: { select: { code: true } },
      },
    });
    const rows = products
      .map(
        (p): InventoryRow => ({
          productId: p.id,
          name: p.name,
          unit: p.unit,
          categoryId: p.category?.id ?? null,
          categoryName: p.category?.name ?? null,
          branchCode: p.branch.code,
          ...flows.get(p.id)!,
        }),
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'vi') ||
          a.branchCode.localeCompare(b.branchCode),
      );

    const totals = emptyFlows();
    for (const row of rows) {
      for (const key of FLOW_KEYS) {
        totals[key].quantity += row[key].quantity;
        totals[key].value = roundCost(totals[key].value + row[key].value);
      }
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      totals,
      rows,
    };
  }

  // Each product's balance and average cost just before `moment`: those
  // after its last movement.
  private balances(branchId: number | undefined, moment: Date) {
    return this.prisma.$queryRaw<
      { productId: number; quantity: number; cost: number }[]
    >`
      SELECT DISTINCT ON (m."productId") m."productId" AS "productId",
        m."balanceAfter" AS "quantity", m."costAfter"::float8 AS "cost"
      FROM "StockMovement" m
      WHERE m."createdAt" < ${utcTimestamp(moment)}
        ${branchWhere(Prisma.sql`m."branchId"`, branchId)}
      ORDER BY m."productId", m."id" DESC`;
  }
}
