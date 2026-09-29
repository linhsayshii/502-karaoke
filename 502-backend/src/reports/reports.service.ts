import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { ReportPrismaService } from '../prisma/report-prisma.service';
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
import { reportScope } from './report-scope';
import { ReportQuery } from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

interface BranchInfo {
  branchId: number;
  code: string;
  name: string;
}

export interface RevenueReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: (Range & { totals: RevenueMetrics }) | null;
  buckets: (Bucket & RevenueMetrics)[];
  byBranch: (BranchInfo & RevenueMetrics)[] | null;
  // Bills paid and then voided (not in any total).
  voided: { count: number; amount: number };
}

// GET /reports/branches: the whole chain, branch by branch.
export interface BranchesReport {
  range: Range;
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: (Range & { totals: RevenueMetrics }) | null;
  buckets: Bucket[];
  branches: (BranchInfo &
    RevenueMetrics & {
      share: number | null; // of the chain's revenue; null when it is 0
      previous: RevenueMetrics | null; // when comparing
      series: number[]; // revenue per bucket, in the order of `buckets`
    })[];
}

// Sums of the paid bills of one branch on one business day.
export type DailyRow = RevenueSums & { date: string; branchId: number };

interface BranchRecord {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

// Reports of paid bills over time, by business day of payment. The SQL
// groups by day and branch; the periods and totals are added up here.
@Injectable()
export class ReportsService {
  constructor(
    private prisma: ReportPrismaService,
    private branchScope: BranchScopeService,
  ) {}

  async revenue(user: AuthUser, query: ReportQuery): Promise<RevenueReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare
      ? previousRange(query.from, query.to, groupBy)
      : null;

    const [daily, previousDaily, branches, voided] = await Promise.all([
      this.daily(branchId, query.from, query.to),
      previous
        ? this.daily(branchId, previous.from, previous.to)
        : Promise.resolve([]),
      branchId === undefined ? this.branchList() : Promise.resolve(null),
      this.voided(branchId, query.from, query.to),
    ]);

    // Totals, periods and branches all come from the same rows.
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      groupBy,
      totals: toMetrics(sumAll(daily)),
      previous: previous && {
        ...previous,
        totals: toMetrics(sumAll(previousDaily)),
      },
      buckets: this.periods(
        bucketsBetween(query.from, query.to, groupBy),
        groupBy,
        daily,
      ).map(({ bucket, value }) => ({ ...bucket, ...toMetrics(value) })),
      byBranch:
        branches &&
        this.perBranch(branches, daily, []).map(({ branch, rows }) => ({
          ...branch,
          ...toMetrics(sumAll(rows)),
        })),
      voided,
    };
  }

  // Branch comparison of the whole chain (chain manager only, so ?branch
  // is ignored).
  async branches(query: ReportQuery): Promise<BranchesReport> {
    businessDatesBetween(query.from, query.to, MAX_REPORT_RANGE_DAYS);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare
      ? previousRange(query.from, query.to, groupBy)
      : null;

    const [daily, previousDaily, branches] = await Promise.all([
      this.daily(undefined, query.from, query.to),
      previous
        ? this.daily(undefined, previous.from, previous.to)
        : Promise.resolve([]),
      this.branchList(),
    ]);

    const buckets = bucketsBetween(query.from, query.to, groupBy);
    const totals = toMetrics(sumAll(daily));
    return {
      range: { from: query.from, to: query.to },
      groupBy,
      totals,
      previous: previous && {
        ...previous,
        totals: toMetrics(sumAll(previousDaily)),
      },
      buckets,
      branches: this.perBranch(branches, daily, previousDaily).map(
        ({ branch, rows, previousRows }) => {
          const metrics = toMetrics(sumAll(rows));
          return {
            ...branch,
            ...metrics,
            share: totals.revenue ? metrics.revenue / totals.revenue : null,
            previous: previous ? toMetrics(sumAll(previousRows)) : null,
            series: this.periods(buckets, groupBy, rows).map(
              ({ value }) => toMetrics(value).revenue,
            ),
          };
        },
      ),
    };
  }

  // Sums per business day and branch of the paid bills. One query per
  // range, so a report's totals, periods and branches always agree.
  // Also the sales lines of the profit report (AccountingReportsService).
  daily(branchId: number | undefined, from: string, to: string) {
    return this.prisma.$queryRaw<DailyRow[]>`
      SELECT ${businessDateSql(Prisma.sql`o."endTime"`)} AS "date",
        o."branchId" AS "branchId", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, from, to)}
      GROUP BY 1, 2`;
  }

  // Wrapped in an arrow (not passed by reference): with this tsconfig's
  // default (non-strict) function-parameter variance, TS's generic
  // inference for rollUp's R falls back to its bare constraint when given
  // addSums directly, losing the extra `date` field. A contextually-typed
  // arrow restores correct inference.
  private periods(buckets: Bucket[], groupBy: GroupBy, rows: DailyRow[]) {
    return rollUp(buckets, groupBy, rows, emptySums, (acc, row) =>
      addSums(acc, row),
    );
  }

  private branchList(): Promise<BranchRecord[]> {
    return this.prisma.branch.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, active: true },
    });
  }

  // The rows of each branch: every active branch, and inactive ones that
  // still sold in one of the two periods.
  private perBranch(
    branches: BranchRecord[],
    rows: DailyRow[],
    previousRows: DailyRow[],
  ) {
    return branches.flatMap((branch) => {
      const own = rows.filter((r) => r.branchId === branch.id);
      const ownPrevious = previousRows.filter((r) => r.branchId === branch.id);
      if (!branch.active && own.length === 0 && ownPrevious.length === 0) {
        return [];
      }
      const info: BranchInfo = {
        branchId: branch.id,
        code: branch.code,
        name: branch.name,
      };
      return [{ branch: info, rows: own, previousRows: ownPrevious }];
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
