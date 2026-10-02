// The products report of the report site (spec 2026-10-02 §5.3); pure.

// Rows of lines grouped by name and unit; the SQL keeps the first ones and
// gathers the rest in a single "others" row.
export const PRODUCT_ROWS = 1000;

export interface ProductLineSums {
  name: string | null;
  unit: string | null;
  quantity: number | null;
  revenue: number; // before VAT
  vat: number;
  others: boolean;
}

// The counted invoices' sums, and those of all their lines.
export interface ProductTotals {
  total: number;
  vat: number;
  lineRevenue: number;
  lineVat: number;
}

export interface EinvoiceProductRow {
  // item: a name and unit; others: past PRODUCT_ROWS; unlisted: "Chưa có dòng
  // hàng", what the invoices hold beyond their lines (drafts without lines,
  // invoices issued before lines were kept, drafts whose lines do not match).
  kind: 'item' | 'others' | 'unlisted';
  name: string | null;
  unit: string | null;
  quantity: number | null;
  revenue: number;
  vat: number;
  total: number;
}

// The rows always add up to the revenue report of the same days.
export function productRows(
  lines: ProductLineSums[],
  totals: ProductTotals,
): EinvoiceProductRow[] {
  const rows: EinvoiceProductRow[] = lines.map((line) => ({
    kind: line.others ? 'others' : 'item',
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    revenue: line.revenue,
    vat: line.vat,
    total: line.revenue + line.vat,
  }));
  const revenue = totals.total - totals.vat - totals.lineRevenue;
  const vat = totals.vat - totals.lineVat;
  if (revenue !== 0 || vat !== 0) {
    rows.push({
      kind: 'unlisted',
      name: null,
      unit: null,
      quantity: null,
      revenue,
      vat,
      total: revenue + vat,
    });
  }
  return rows;
}
