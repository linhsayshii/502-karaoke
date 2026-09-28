import type { ProfitMetrics } from "@/lib/types";

export interface ProfitLine {
  key: string;
  label: string;
  value: (m: ProfitMetrics) => number | null;
  kind?: "money" | "percent";
  level?: 0 | 1; // 1: a detail of the line above
  strong?: boolean; // a total (doanh thu, lãi gộp, lợi nhuận)
  info?: boolean; // outside the profit (VAT, purchases)
  optional?: boolean; // hidden on the page when 0 over the whole range
}

// The lines of the profit and loss statement, top to bottom. Costs are
// positive amounts; profit = gross profit − expenses − losses + other
// income.
export function profitLines(categories: string[]): ProfitLine[] {
  return [
    { key: "revenue", label: "Doanh thu (chưa VAT)", strong: true, value: (m) => m.revenue },
    { key: "roomNet", label: "Tiền giờ sau giảm giá", level: 1, value: (m) => m.roomFee - m.roomDiscount },
    { key: "productNet", label: "Tiền hàng sau giảm giá", level: 1, value: (m) => m.productSales - m.productDiscount },
    { key: "cogs", label: "Giá vốn hàng bán", value: (m) => m.cogs },
    { key: "grossProfit", label: "Lãi gộp", strong: true, value: (m) => m.grossProfit },
    { key: "grossMargin", label: "Tỷ suất lãi gộp", level: 1, kind: "percent", value: (m) => m.grossMargin },
    { key: "expenses", label: "Chi phí hoạt động", value: (m) => m.expenseTotal },
    ...categories.map(
      (category): ProfitLine => ({
        key: `expense:${category}`,
        label: category,
        level: 1,
        optional: true,
        value: (m) => m.expenses[category] ?? 0,
      }),
    ),
    { key: "losses", label: "Hàng xuất kho / hao hụt", value: (m) => m.losses },
    { key: "otherIncome", label: "Thu khác", value: (m) => m.otherIncome },
    { key: "profit", label: "Lợi nhuận", strong: true, value: (m) => m.profit },
    { key: "profitMargin", label: "Tỷ suất lợi nhuận", level: 1, kind: "percent", value: (m) => m.profitMargin },
    { key: "vat", label: "VAT phải nộp", info: true, value: (m) => m.vat },
    { key: "purchases", label: "Tiền nhập hàng", info: true, value: (m) => m.purchases },
  ];
}
