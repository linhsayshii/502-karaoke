import { Prisma } from '@prisma/client';
import { branchWhere } from '../reports/report-sql';

// SQL pieces of the report site (spec 2026-10-02-trang-bao-cao-hddt §5), for
// "Einvoice" e LEFT JOIN "Order" o ON o."id" = e."orderId".

// The e-invoices counted: every one still there, except those not issued of
// a bill voided since (they can never be issued). A bill thêm tay that was
// cancelled has none left (ManualBillsService.cancel).
export const COUNTED_SQL = Prisma.sql`(e."status" = 'ISSUED' OR o."cancelledAt" IS NULL)`;

// Counted e-invoices of the business days from..to (a DATE column: no time
// zone to convert), of one branch or the whole chain (undefined).
// Einvoice(branchId, businessDate) index.
export function countedWhere(
  branchId: number | undefined,
  from: string,
  to: string,
): Prisma.Sql {
  return Prisma.sql`e."businessDate" BETWEEN ${from}::date AND ${to}::date
    ${branchWhere(Prisma.sql`e."branchId"`, branchId)}
    AND ${COUNTED_SQL}`;
}

// The EinvoiceSums of a group of counted e-invoices. All the e-invoices of
// a bill carry its business day, so bill counts add up over days and
// branches.
export const EINVOICE_SUM_COLUMNS = Prisma.sql`
  (COUNT(DISTINCT e."orderId") + COUNT(DISTINCT e."manualBillId"))::int AS "billCount",
  COUNT(*)::int AS "einvoiceCount",
  COALESCE(SUM(e."amount"), 0)::float8 AS "total",
  COALESCE(SUM(e."vatAmount"), 0)::float8 AS "vat",
  COALESCE(SUM(e."amount") FILTER (WHERE e."status" = 'ISSUED'), 0)::float8 AS "issued"`;

// The lines of an e-invoice's draft as rows `l` (jsonb); an invoice issued
// before lines were kept has none.
export const EINVOICE_LINES = Prisma.sql`jsonb_array_elements(COALESCE(e."draft"->'lines', '[]'::jsonb)) l`;

// A line priced as einvoice-math.ts does: before VAT = round(quantity ×
// unitPrice); VAT = its own vatAmount (a filler line) or round(before VAT ×
// vatRate / 100). Numeric arithmetic: round() halves away from zero, like
// Math.round on these positive amounts.
export const LINE_REVENUE = Prisma.sql`round((l->>'quantity')::numeric * (l->>'unitPrice')::numeric)`;
export const LINE_VAT = Prisma.sql`COALESCE((l->>'vatAmount')::numeric, round(round((l->>'quantity')::numeric * (l->>'unitPrice')::numeric) * (l->>'vatRate')::numeric / 100))`;
