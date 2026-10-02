import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { rank } from '../reports/breakdowns';
import { bucketsBetween, previousRange, rollUp } from '../reports/buckets';
import {
  ReportQuery,
  ReportRangeQuery,
  RoomReportQuery,
} from '../reports/dto/report-query';
import { reportScope } from '../reports/report-scope';
import {
  addEinvoiceSums,
  type EinvoiceSums,
  emptyEinvoiceSums,
  sumEinvoices,
  toEinvoiceMetrics,
} from './einvoice-metrics';
import {
  PRODUCT_ROWS,
  type ProductLineSums,
  productRows,
  type ProductTotals,
} from './einvoice-products';
import {
  countedWhere,
  EINVOICE_LINES,
  EINVOICE_SUM_COLUMNS,
  LINE_REVENUE,
  LINE_VAT,
} from './einvoice-sql';

type DailyRow = EinvoiceSums & { date: string; branchId: number };

// The reports of the report site (spec 2026-10-02-trang-bao-cao-hddt §5):
// the counted e-invoices by the business day of their bill, on the report
// pool. Shapes follow the main reports so their pages read alike.
@Injectable()
export class EinvoiceReportsService {
  constructor(
    private db: ReportPrismaService,
    private scope: BranchScopeService,
  ) {}

  async revenue(user: AuthUser, query: ReportQuery) {
    const branchId = await reportScope(this.scope, user, query);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare
      ? previousRange(query.from, query.to, groupBy)
      : null;
    const [daily, previousDaily, branches] = await Promise.all([
      this.daily(branchId, query.from, query.to),
      previous
        ? this.daily(branchId, previous.from, previous.to)
        : Promise.resolve([]),
      branchId === undefined
        ? this.db.branch.findMany({
            orderBy: { code: 'asc' },
            select: { id: true, code: true, name: true, active: true },
          })
        : Promise.resolve(null),
    ]);
    // Totals, periods and branches all come from the same rows.
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      groupBy,
      totals: toEinvoiceMetrics(sumEinvoices(daily)),
      previous: previous && {
        ...previous,
        totals: toEinvoiceMetrics(sumEinvoices(previousDaily)),
      },
      buckets: rollUp(
        bucketsBetween(query.from, query.to, groupBy),
        groupBy,
        daily,
        emptyEinvoiceSums,
        (acc, row) => addEinvoiceSums(acc, row),
      ).map(({ bucket, value }) => ({
        ...bucket,
        ...toEinvoiceMetrics(value),
      })),
      // Every active branch, and an inactive one that has invoices.
      byBranch:
        branches &&
        branches
          .filter((b) => b.active || daily.some((r) => r.branchId === b.id))
          .map((b) => ({
            branchId: b.id,
            code: b.code,
            name: b.name,
            ...toEinvoiceMetrics(
              sumEinvoices(daily.filter((r) => r.branchId === b.id)),
            ),
          })),
    };
  }

  // Every room of the scope, also those without invoices; "Không phòng" (id
  // null) for the bills thêm tay of the migration and rooms out of scope.
  async rooms(user: AuthUser, query: RoomReportQuery) {
    const branchId = await reportScope(this.scope, user, query);
    const by = query.by ?? 'room';
    const [sums, rooms] = await Promise.all([
      // The paid bill's room through "Order_pkey", one probe per invoice
      // (einvoice-sql.ts). The LIMIT 1 is load-bearing: without it the
      // planner pulls the subquery up into a hash join over a Seq Scan of
      // "Order".
      this.db.$queryRaw<(EinvoiceSums & { roomId: number | null })[]>`
        SELECT COALESCE(r."roomId", m."roomId") AS "roomId", ${EINVOICE_SUM_COLUMNS}
        FROM "Einvoice" e
        LEFT JOIN LATERAL (SELECT o."roomId" FROM "Order" o WHERE o."id" = e."orderId" LIMIT 1) r ON true
        LEFT JOIN "ManualBill" m ON m."id" = e."manualBillId"
        WHERE ${countedWhere(branchId, query.from, query.to)}
        GROUP BY 1`,
      this.db.room.findMany({
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
      {
        id: number | string;
        name: string;
        type: string;
        branchCode: string | null;
        rooms: number;
        sums: EinvoiceSums;
      }
    >();
    for (const room of rooms) {
      const id = by === 'room' ? room.id : room.type;
      const group = groups.get(id) ?? {
        id,
        name: by === 'room' ? room.name : room.type,
        type: room.type,
        branchCode: by === 'room' ? room.branch.code : null,
        rooms: 0,
        sums: emptyEinvoiceSums(),
      };
      group.rooms += 1;
      addEinvoiceSums(group.sums, sumsOf.get(room.id) ?? emptyEinvoiceSums());
      groups.set(id, group);
    }
    type RoomRow = {
      id: number | string | null;
      name: string | null;
      type: string | null;
      branchCode: string | null;
      rooms: number;
    } & ReturnType<typeof toEinvoiceMetrics>;
    const rows: RoomRow[] = [...groups.values()].map(
      ({ sums: own, ...group }) => ({ ...group, ...toEinvoiceMetrics(own) }),
    );
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
        ...toEinvoiceMetrics(sumEinvoices(outOfScope)),
      });
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      totals: toEinvoiceMetrics(sumEinvoices(sums)),
      rows: rank(rows, (r) => r.revenue),
    };
  }

  // Lines grouped by name (spaces squeezed, any case) and unit; the first
  // PRODUCT_ROWS by revenue, the rest in one row, then "Chưa có dòng hàng".
  async products(user: AuthUser, query: ReportRangeQuery) {
    const branchId = await reportScope(this.scope, user, query);
    const where = countedWhere(branchId, query.from, query.to);
    const [lines, [totals]] = await Promise.all([
      this.db.$queryRaw<ProductLineSums[]>`
        WITH lines AS (
          SELECT regexp_replace(btrim(l->>'name'), '[[:space:]]+', ' ', 'g') AS "name",
            btrim(COALESCE(l->>'unit', '')) AS "unit",
            (l->>'quantity')::numeric AS "quantity",
            ${LINE_REVENUE} AS "revenue",
            ${LINE_VAT} AS "vat"
          FROM "Einvoice" e
          CROSS JOIN LATERAL ${EINVOICE_LINES}
          WHERE ${where}
        ), grouped AS (
          -- The group keys after the revenue make the rank a total order, so
          -- the same groups fall past the cut and rows of equal revenue keep
          -- their place from one request to the next.
          SELECT min("name") AS "name", "unit", SUM("quantity") AS "quantity",
            SUM("revenue") AS "revenue", SUM("vat") AS "vat",
            row_number() OVER (ORDER BY SUM("revenue") DESC, lower("name"), "unit")::int AS "rank"
          FROM lines
          GROUP BY lower("name"), "unit"
        )
        SELECT "name", "unit", "quantity"::float8 AS "quantity",
          "revenue"::float8 AS "revenue", "vat"::float8 AS "vat", false AS "others",
          "rank"
        FROM grouped WHERE "rank" <= ${PRODUCT_ROWS}
        UNION ALL
        SELECT NULL, NULL, NULL, SUM("revenue")::float8, SUM("vat")::float8, true, NULL
        FROM grouped WHERE "rank" > ${PRODUCT_ROWS}
        HAVING COUNT(*) > 0
        ORDER BY "others", "rank"`,
      this.db.$queryRaw<ProductTotals[]>`
        SELECT COALESCE(SUM(e."amount"), 0)::float8 AS "total",
          COALESCE(SUM(e."vatAmount"), 0)::float8 AS "vat",
          COALESCE(SUM(x."revenue"), 0)::float8 AS "lineRevenue",
          COALESCE(SUM(x."vat"), 0)::float8 AS "lineVat"
        FROM "Einvoice" e
        CROSS JOIN LATERAL (
          SELECT SUM(${LINE_REVENUE}) AS "revenue", SUM(${LINE_VAT}) AS "vat"
          FROM ${EINVOICE_LINES}
        ) x
        WHERE ${where}`,
    ]);
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      totals: {
        revenue: totals.total - totals.vat,
        vat: totals.vat,
        total: totals.total,
      },
      rows: productRows(lines, totals),
    };
  }

  // Sums per business day and branch: one query per range, so totals,
  // periods and branches always agree.
  private daily(branchId: number | undefined, from: string, to: string) {
    return this.db.$queryRaw<DailyRow[]>`
      SELECT to_char(e."businessDate", 'YYYY-MM-DD') AS "date",
        e."branchId" AS "branchId", ${EINVOICE_SUM_COLUMNS}
      FROM "Einvoice" e
      WHERE ${countedWhere(branchId, from, to)}
      GROUP BY 1, 2`;
  }
}
