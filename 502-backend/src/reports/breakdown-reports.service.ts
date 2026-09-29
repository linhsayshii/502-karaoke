import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { roundCost } from '../inventory/costing';
import { dayCount } from './buckets';
import {
  hourGrid,
  HourCell,
  occupancy,
  rank,
  roundToTotal,
} from './breakdowns';
import {
  addSums,
  emptySums,
  RevenueMetrics,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';
import {
  businessWeekdaySql,
  localHourSql,
  paidOrdersWhere,
  REVENUE_COLUMNS,
} from './report-sql';
import { reportScope } from './report-scope';
import {
  ProductGroup,
  ProductReportQuery,
  ReportRangeQuery,
  RoomGroup,
  RoomReportQuery,
  StaffReportQuery,
  StaffRole,
} from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

// id null: the bills nobody was assigned to in that role (Chưa gán).
export interface StaffRow extends RevenueMetrics {
  id: number | null;
  name: string | null;
  username: string | null;
  branchCode: string | null;
}

export interface StaffReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  role: StaffRole;
  totals: RevenueMetrics;
  rows: StaffRow[];
}

// A room (by=room) or a room type (by=type, id = the type); id null: the
// bills without a room (Không phòng).
export interface RoomRow extends RevenueMetrics {
  id: number | string | null;
  name: string | null;
  type: string | null;
  branchCode: string | null; // by=room only
  rooms: number;
  occupancy: number | null;
}

export interface RoomReport {
  branchId: number | null;
  range: Range;
  by: RoomGroup;
  days: number;
  totals: RevenueMetrics;
  occupancy: number | null; // of all the rooms together
  rows: RoomRow[];
}

// What a set of lines sold: `gross` = Σ quantity × price, `discount` = its
// share of the bills' product discount, `net` = gross − discount (before
// VAT), `cost` = Σ quantity × unitCost (cost of goods sold), `grossProfit`
// = net − cost and `margin` = grossProfit / net (null when net is 0).
export interface ProductSales {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
  cost: number;
  grossProfit: number;
  margin: number | null;
}

// A product, or a category (by=category; id null: Không danh mục).
export interface ProductRow extends ProductSales {
  id: number | null;
  name: string | null;
  unit: string | null; // by=product only
  categoryName: string | null; // by=product only
  branchCode: string | null;
}

export interface ProductReport {
  branchId: number | null;
  range: Range;
  by: ProductGroup;
  totals: ProductSales;
  rows: ProductRow[];
}

export interface HoursReport {
  branchId: number | null;
  range: Range;
  totals: { sessions: number; revenue: number };
  cells: HourCell[]; // 7 × 24, Monday 00:00 first
}

// The person a bill is credited to in each staff report (fixed column
// names, never user input).
const STAFF_COLUMNS: Record<StaffRole, Prisma.Sql> = {
  cskh: Prisma.raw('o."cskhId"'),
  server: Prisma.raw('o."serverId"'),
  cashier: Prisma.raw('o."checkedOutById"'),
};

// Revenue of the paid bills broken down by a subject. Every report's rows
// add up to the revenue report's totals of the same scope and days.
@Injectable()
export class BreakdownReportsService {
  constructor(
    private prisma: ReportPrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Each bill counts in full for its CSKH, its server and its cashier.
  async staff(user: AuthUser, query: StaffReportQuery): Promise<StaffReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const role = query.role ?? 'cskh';
    const sums = await this.prisma.$queryRaw<
      (RevenueSums & { userId: number | null })[]
    >`
      SELECT ${STAFF_COLUMNS[role]} AS "userId", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1`;

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: sums.flatMap((row) => (row.userId === null ? [] : [row.userId])),
        },
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        branch: { select: { code: true } },
      },
    });
    const userOf = new Map(users.map((u) => [u.id, u]));

    const rows = sums.map((row): StaffRow => {
      const person = row.userId === null ? undefined : userOf.get(row.userId);
      return {
        id: row.userId,
        name: person?.fullName ?? null,
        username: person?.username ?? null,
        branchCode: person?.branch?.code ?? null,
        ...toMetrics(row),
      };
    });
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      role,
      totals: toMetrics(sumAll(sums)),
      rows: rank(rows, (r) => r.revenue),
    };
  }

  // Every room of the scope (also those without bills), or every room type.
  async rooms(user: AuthUser, query: RoomReportQuery): Promise<RoomReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const by = query.by ?? 'room';
    const days = dayCount(query.from, query.to);

    const [sums, rooms] = await Promise.all([
      this.prisma.$queryRaw<(RevenueSums & { roomId: number | null })[]>`
        SELECT o."roomId" AS "roomId", ${REVENUE_COLUMNS}
        FROM "Order" o
        WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
        GROUP BY 1`,
      this.prisma.room.findMany({
        where: { branchId },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          branch: { select: { code: true } },
        },
      }),
    ]);
    const sumsOf = new Map(sums.map((row) => [row.roomId, row]));

    const groups = new Map<
      number | string,
      Omit<RoomRow, keyof RevenueMetrics | 'occupancy'> & { sums: RevenueSums }
    >();
    for (const room of rooms) {
      const id = by === 'room' ? room.id : room.type;
      const group = groups.get(id) ?? {
        id,
        name: by === 'room' ? room.name : room.type,
        type: room.type,
        branchCode: by === 'room' ? room.branch.code : null,
        rooms: 0,
        sums: emptySums(),
      };
      group.rooms += 1;
      addSums(group.sums, sumsOf.get(room.id) ?? emptySums());
      groups.set(id, group);
    }

    const rows: RoomRow[] = [...groups.values()].map(
      ({ sums: own, ...group }) => ({
        ...group,
        occupancy: occupancy(own.roomMinutes, days, group.rooms),
        ...toMetrics(own),
      }),
    );
    const inRooms = sumAll(rows);
    // Bills without a room of this scope: no room at all, or (legacy data
    // migrated by `foundation`) a room that belongs to another branch and so
    // was never loaded into `rooms`.
    const roomIds = new Set(rooms.map((r) => r.id));
    const outOfScope = sums.filter(
      (row) => row.roomId === null || !roomIds.has(row.roomId),
    );
    if (outOfScope.length) {
      rows.push({
        id: null,
        name: null,
        type: null,
        branchCode: null,
        rooms: 0,
        occupancy: null,
        ...toMetrics(sumAll(outOfScope)),
      });
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      days,
      totals: toMetrics(sumAll(sums)),
      occupancy: occupancy(inRooms.roomMinutes, days, rooms.length),
      rows: rank(rows, (r) => r.revenue),
    };
  }

  // Sales per product or category. A bill's product discount is spread over
  // its lines in proportion to their amounts, then rounded to the đồng so
  // the rows still add up to the bills' discounts.
  async products(
    user: AuthUser,
    query: ProductReportQuery,
  ): Promise<ProductReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const by = query.by ?? 'product';
    // One row per line: never REVENUE_COLUMNS here (a bill would count once
    // per line).
    const lines = await this.prisma.$queryRaw<
      {
        productId: number;
        quantity: number;
        gross: number;
        discount: number;
        cost: number;
      }[]
    >`
      SELECT i."productId" AS "productId",
        SUM(i."quantity")::int AS "quantity",
        SUM(i."quantity" * i."price")::float8 AS "gross",
        COALESCE(SUM(i."quantity" * i."price" * o."discountAmount"
          / NULLIF(o."totalProductPrice", 0)), 0)::float8 AS "discount",
        COALESCE(SUM(i."quantity" * i."unitCost"), 0)::float8 AS "cost"
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1`;

    const products = await this.prisma.product.findMany({
      where: { id: { in: lines.map((line) => line.productId) } },
      select: {
        id: true,
        name: true,
        unit: true,
        category: { select: { id: true, name: true } },
        branch: { select: { code: true } },
      },
    });
    const productOf = new Map(products.map((p) => [p.id, p]));

    // Discounts not rounded yet: the exact shares.
    const groups = new Map<
      number | null,
      Omit<ProductRow, 'net' | 'grossProfit' | 'margin'>
    >();
    for (const line of lines) {
      // productId is a foreign key and products are only soft-deleted, so
      // every line's product is always found.
      const product = productOf.get(line.productId)!;
      const id = by === 'product' ? product.id : (product.category?.id ?? null);
      const group =
        groups.get(id) ??
        (by === 'product'
          ? {
              id,
              name: product.name,
              unit: product.unit,
              categoryName: product.category?.name ?? null,
              branchCode: product.branch.code,
              quantity: 0,
              gross: 0,
              discount: 0,
              cost: 0,
            }
          : {
              id,
              name: product.category?.name ?? null,
              unit: null,
              categoryName: null,
              branchCode: id === null ? null : product.branch.code,
              quantity: 0,
              gross: 0,
              discount: 0,
              cost: 0,
            });
      group.quantity += line.quantity;
      group.gross += line.gross;
      group.discount += line.discount;
      group.cost += line.cost;
      groups.set(id, group);
    }

    const list = [...groups.values()];
    // The exact shares add up to Σ discountAmount, a whole number.
    const discounts = roundToTotal(
      list.map((group) => group.discount),
      list.reduce((sum, group) => sum + group.discount, 0),
    );
    const quantity = list.reduce((sum, group) => sum + group.quantity, 0);
    const gross = list.reduce((sum, group) => sum + group.gross, 0);
    const discount = discounts.reduce((sum, value) => sum + value, 0);
    const net = gross - discount;
    const cost = roundCost(list.reduce((sum, group) => sum + group.cost, 0));
    const rows = list.map((group, i): ProductRow => {
      const rowNet = group.gross - discounts[i];
      const rowCost = roundCost(group.cost);
      const grossProfit = roundCost(rowNet - rowCost);
      return {
        ...group,
        discount: discounts[i],
        net: rowNet,
        cost: rowCost,
        grossProfit,
        margin: rowNet ? grossProfit / rowNet : null,
      };
    });
    const grossProfit = roundCost(net - cost);
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      totals: {
        quantity,
        gross,
        discount,
        net,
        cost,
        grossProfit,
        margin: net ? grossProfit / net : null,
      },
      rows: rank(rows, (r) => r.net),
    };
  }

  // Sessions and revenue (before VAT) by weekday of the business day and
  // hour of the start; the bills are still those paid in the range.
  async hours(user: AuthUser, query: ReportRangeQuery): Promise<HoursReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    // A bill without a start time counts at its payment.
    const start = Prisma.sql`COALESCE(o."startTime", o."endTime")`;
    const sums = await this.prisma.$queryRaw<HourCell[]>`
      SELECT ${businessWeekdaySql(start)} AS "weekday",
        ${localHourSql(start)} AS "hour",
        COUNT(*)::int AS "sessions",
        COALESCE(SUM(o."finalAmount" - o."taxAmount"), 0)::float8 AS "revenue"
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1, 2`;
    const cells = hourGrid(sums);
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      totals: {
        sessions: cells.reduce((sum, c) => sum + c.sessions, 0),
        revenue: cells.reduce((sum, c) => sum + c.revenue, 0),
      },
      cells,
    };
  }
}
