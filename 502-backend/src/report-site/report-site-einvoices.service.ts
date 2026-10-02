import { Injectable } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf } from '../common/dates';
import { dateRange } from '../einvoice/einvoice-filters';
import { billNumberPrefixRange } from '../orders/bill-number';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { ReportSiteEinvoicesQuery } from './dto/manual-bill.dto';
import { COUNTED_SQL, countedWhere } from './einvoice-sql';

// The newest e-invoices a screen gets (docs/resource-rules.md §1.1).
const LIST_CAP = 500;

// One row of Quản lý bán hàng on the report site.
export interface ReportSiteEinvoice {
  id: number;
  reportNumber: string;
  invoiceDate: string;
  status: EinvoiceStatus;
  // Carries a lastError: a draft whose last send failed ("Lỗi"), or an issued
  // one whose number has to be fixed (einvoiceStatusBadge in the frontend).
  hasError: boolean;
  // Minvoice's number, once issued.
  invoiceNumber: number | null;
  buyerName: string | null;
  amount: number;
  vatAmount: number;
  orderId: number | null;
  manualBillId: number | null;
  billNumber: string | null;
  roomName: string | null;
  billCancelledAt: Date | null;
}

@Injectable()
export class ReportSiteEinvoicesService {
  constructor(
    private db: ReportPrismaService,
    private scope: BranchScopeService,
  ) {}

  // The counted e-invoices (einvoice-sql.ts) of the invoice dates, or those
  // whose number starts with `number` on any day (spec
  // 2026-10-02-bao-cao-theo-tung-hddt §5.2): the newest 500 and the count.
  async list(
    user: AuthUser,
    query: ReportSiteEinvoicesQuery,
  ): Promise<[ReportSiteEinvoice[], number]> {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    let where: Prisma.Sql;
    if (query.number) {
      // Einvoice(branchId, reportNumber), as a range like the bill numbers.
      const range = billNumberPrefixRange(query.number);
      where = Prisma.sql`e."branchId" = ${branchId}
        AND e."reportNumber" >= ${range.gte}
        ${range.lt ? Prisma.sql`AND e."reportNumber" < ${range.lt}` : Prisma.empty}
        AND ${COUNTED_SQL}`;
    } else {
      // from/to reach the SQL as text for ::date: checked first.
      dateRange(query.from, query.to);
      const today = businessDateOf(new Date());
      where = countedWhere(
        branchId,
        query.from ?? query.to ?? today,
        query.to ?? query.from ?? today,
      );
    }
    // The 500 are picked first, then each one's bill is read through its
    // primary key (LATERAL … LIMIT 1, see einvoice-sql.ts).
    const [rows, [{ total }]] = await Promise.all([
      this.db.$queryRaw<ReportSiteEinvoice[]>`
        SELECT e."id", e."reportNumber",
          to_char(e."invoiceDate", 'YYYY-MM-DD') AS "invoiceDate",
          e."status", (e."lastError" IS NOT NULL) AS "hasError",
          e."invoiceNumber", e."buyerName",
          e."amount"::float8 AS "amount", e."vatAmount"::float8 AS "vatAmount",
          e."orderId", e."manualBillId",
          COALESCE(o."billNumber", m."billNumber") AS "billNumber",
          COALESCE(o."roomName", m."roomName") AS "roomName",
          COALESCE(o."cancelledAt", m."cancelledAt") AS "billCancelledAt"
        FROM (
          SELECT e."id", e."reportNumber", e."reportSeq", e."invoiceDate",
            e."status", e."lastError", e."invoiceNumber", e."buyerName",
            e."amount", e."vatAmount", e."orderId", e."manualBillId"
          FROM "Einvoice" e
          WHERE ${where}
          ORDER BY e."invoiceDate" DESC, e."reportSeq" DESC
          LIMIT ${LIST_CAP}
        ) e
        LEFT JOIN LATERAL (
          SELECT o."billNumber", r."name" AS "roomName", o."cancelledAt"
          FROM "Order" o LEFT JOIN "Room" r ON r."id" = o."roomId"
          WHERE o."id" = e."orderId" LIMIT 1) o ON true
        LEFT JOIN LATERAL (
          SELECT m."billNumber", r."name" AS "roomName", m."cancelledAt"
          FROM "ManualBill" m LEFT JOIN "Room" r ON r."id" = m."roomId"
          WHERE m."id" = e."manualBillId" LIMIT 1) m ON true
        ORDER BY e."invoiceDate" DESC, e."reportSeq" DESC`,
      this.db.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS "total" FROM "Einvoice" e WHERE ${where}`,
    ]);
    return [rows, total];
  }
}
