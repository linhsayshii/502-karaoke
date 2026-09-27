// Revenue of a set of paid bills. VAT is always kept apart: `revenue` is
// before VAT, and `collected` = revenue + vat is what the guests paid (the
// same as the fund's sales receipts).
export interface RevenueSums {
  orderCount: number;
  roomMinutes: number;
  roomFee: number; // tiền giờ, before its discount
  productSales: number; // tiền hàng, before its discount
  roomDiscount: number;
  productDiscount: number;
  serviceFee: number;
  vat: number;
  collected: number; // Σ finalAmount
  cash: number;
  transfer: number;
}

export interface RevenueMetrics extends RevenueSums {
  revenue: number; // doanh thu chưa VAT
  avgRevenue: number; // revenue per bill
}

const SUM_FIELDS = [
  'orderCount',
  'roomMinutes',
  'roomFee',
  'productSales',
  'roomDiscount',
  'productDiscount',
  'serviceFee',
  'vat',
  'collected',
  'cash',
  'transfer',
] as const satisfies readonly (keyof RevenueSums)[];

export function emptySums(): RevenueSums {
  return Object.fromEntries(
    SUM_FIELDS.map((field) => [field, 0]),
  ) as unknown as RevenueSums;
}

export function addSums(acc: RevenueSums, row: RevenueSums): void {
  for (const field of SUM_FIELDS) acc[field] += Number(row[field]);
}

export function sumAll(rows: RevenueSums[]): RevenueSums {
  const acc = emptySums();
  for (const row of rows) addSums(acc, row);
  return acc;
}

export function toMetrics(sums: RevenueSums): RevenueMetrics {
  const clean = sumAll([sums]);
  const revenue = clean.collected - clean.vat;
  return {
    ...clean,
    revenue,
    avgRevenue: clean.orderCount ? Math.round(revenue / clean.orderCount) : 0,
  };
}
