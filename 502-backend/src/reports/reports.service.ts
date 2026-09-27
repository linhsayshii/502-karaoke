import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  businessDatesBetween,
  businessDayRange,
  MAX_REPORT_RANGE_DAYS,
} from '../common/dates';
import {
  Bucket,
  bucketsBetween,
  GroupBy,
  previousRange,
  rollUp,
} from './buckets';
import {
  addSums,
  emptySums,
  RevenueMetrics,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';
import {
  businessDateSql,
  paidOrdersWhere,
  REVENUE_COLUMNS,
} from './report-sql';
import { ReportQuery } from './dto/report-query';

export interface RevenueReport {
  branchId: number | null; // null: the whole chain
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: { from: string; to: string; totals: RevenueMetrics } | null;
  buckets: (Bucket & RevenueMetrics)[];
  byBranch:
    | ({ branchId: number; code: string; name: string } & RevenueMetrics)[]
    | null;
  // Bills paid and then voided (not in any total).
  voided: { count: number; amount: number };
}

// Reports of paid bills, by business day of payment. The SQL groups by day
// (and a dimension); the periods and totals are added up here.
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  async revenue(user: AuthUser, query: ReportQuery): Promise<RevenueReport> {
    const branchId = await this.branchScope.resolveOptionalBranchId(
      user,
      query.branch,
    );
    // Validates the dates and the length of the range.
    businessDatesBetween(query.from, query.to, MAX_REPORT_RANGE_DAYS);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare ? previousRange(query.from, query.to) : null;

    const [daily, previousDaily, byBranch, voided] = await Promise.all([
      this.dailyRevenue(branchId, query.from, query.to),
      previous
        ? this.dailyRevenue(branchId, previous.from, previous.to)
        : Promise.resolve([]),
      branchId === undefined
        ? this.revenueByBranch(query.from, query.to)
        : Promise.resolve(null),
      this.voided(branchId, query.from, query.to),
    ]);

    // Wrapped in an arrow (not passed by reference): with this tsconfig's
    // default (non-strict) function-parameter variance, TS's generic
    // inference for rollUp's R falls back to its bare constraint when given
    // addSums directly, losing the extra `date` field. A contextually-typed
    // arrow restores correct inference.
    const buckets = rollUp(
      bucketsBetween(query.from, query.to, groupBy),
      groupBy,
      daily,
      emptySums,
      (acc, row) => addSums(acc, row),
    ).map(({ bucket, value }) => ({ ...bucket, ...toMetrics(value) }));

    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      groupBy,
      totals: toMetrics(sumAll(daily)),
      previous: previous && {
        ...previous,
        totals: toMetrics(sumAll(previousDaily)),
      },
      buckets,
      byBranch,
      voided,
    };
  }

  private dailyRevenue(branchId: number | undefined, from: string, to: string) {
    return this.prisma.$queryRaw<(RevenueSums & { date: string })[]>`
      SELECT ${businessDateSql(Prisma.sql`o."endTime"`)} AS "date", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, from, to)}
      GROUP BY 1`;
  }

  // Every active branch (and inactive ones that still sold in the period).
  private async revenueByBranch(from: string, to: string) {
    const [branches, rows] = await Promise.all([
      this.prisma.branch.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, active: true },
      }),
      this.prisma.$queryRaw<(RevenueSums & { branchId: number })[]>`
        SELECT o."branchId" AS "branchId", ${REVENUE_COLUMNS}
        FROM "Order" o
        WHERE ${paidOrdersWhere(undefined, from, to)}
        GROUP BY o."branchId"`,
    ]);
    return branches.flatMap((branch) => {
      const row = rows.find((r) => r.branchId === branch.id);
      if (!branch.active && !row) return [];
      return [
        {
          branchId: branch.id,
          code: branch.code,
          name: branch.name,
          ...toMetrics(row ?? emptySums()),
        },
      ];
    });
  }

  private async voided(branchId: number | undefined, from: string, to: string) {
    const result = await this.prisma.order.aggregate({
      where: {
        branchId,
        status: OrderStatus.CANCELLED,
        paymentMethod: { not: null },
        endTime: businessDayRange(from, to),
      },
      _count: { _all: true },
      _sum: { finalAmount: true },
    });
    return {
      count: result._count._all,
      amount: Number(result._sum.finalAmount ?? 0),
    };
  }
}
