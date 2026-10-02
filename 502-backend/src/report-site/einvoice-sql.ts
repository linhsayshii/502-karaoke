import { Prisma } from '@prisma/client';
import { branchWhere } from '../reports/report-sql';

// SQL pieces of the report site (spec 2026-10-02-trang-bao-cao-hddt §5), for
// "Einvoice" e. Nothing joins "Order": a join over a range of a few thousand
// invoices plans as a hash join over a Seq Scan of the whole table, so a
// bill's columns are read per invoice through "Order_pkey" (COUNTED_SQL, and
// the room in EinvoiceReportsService.rooms).

// The e-invoices counted: every one still there, except those not issued of
// a bill voided since (they can never be issued). A bill thêm tay that was
// cancelled has none left (ManualBillsService.cancel).
// A scalar subquery on purpose: PostgreSQL never hashes a scalar sublink and
// keeps the order of OR's arms, so the "Order_pkey" probe runs only for the
// invoices not issued of a paid bill. Never "simplify" it into EXISTS, NOT
// EXISTS or IN (SELECT …): those plan as a hashed subplan over a Seq Scan of
// "Order". The orderId test only saves the probe for bills thêm tay.
export const COUNTED_SQL = Prisma.sql`(e."status" = 'ISSUED' OR e."orderId" IS NULL
  OR (SELECT o."cancelledAt" FROM "Order" o WHERE o."id" = e."orderId") IS NULL)`;

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
// before lines were kept has none. Lines that are not an array count as none,
// as in the migration: jsonb_array_elements raises on anything else, which
// would fail every products report of that day.
export const EINVOICE_LINES = Prisma.sql`jsonb_array_elements(CASE WHEN jsonb_typeof(e."draft"->'lines') = 'array' THEN e."draft"->'lines' ELSE '[]'::jsonb END) l`;

// A line priced as einvoice-math.ts does: before VAT = round(quantity ×
// unitPrice); VAT = its own vatAmount (a filler line) or round(before VAT ×
// vatRate / 100). Numeric arithmetic: round() halves away from zero, like
// Math.round on these positive amounts.
export const LINE_REVENUE = Prisma.sql`round((l->>'quantity')::numeric * (l->>'unitPrice')::numeric)`;
export const LINE_VAT = Prisma.sql`COALESCE((l->>'vatAmount')::numeric, round(round((l->>'quantity')::numeric * (l->>'unitPrice')::numeric) * (l->>'vatRate')::numeric / 100))`;
