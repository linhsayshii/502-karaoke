import type { ExportColumn } from "@/lib/excel-export";
import type { RevenueMetrics } from "@/lib/types";

// The revenue metrics as Excel columns (revenue before VAT, VAT apart),
// shared by the reports.
export const METRIC_COLUMNS: ExportColumn<RevenueMetrics>[] = [
  { header: "Hóa đơn", type: "number", value: (m) => m.orderCount },
  { header: "Giờ phòng", type: "decimal", value: (m) => m.roomMinutes / 60 },
  { header: "Tiền giờ", type: "money", value: (m) => m.roomFee },
  { header: "Giảm tiền giờ", type: "money", value: (m) => m.roomDiscount },
  { header: "Tiền hàng", type: "money", value: (m) => m.productSales },
  { header: "Giảm tiền hàng", type: "money", value: (m) => m.productDiscount },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (m) => m.revenue },
  { header: "VAT", type: "money", value: (m) => m.vat },
  { header: "Tổng thu", type: "money", value: (m) => m.collected },
  { header: "Tiền mặt", type: "money", value: (m) => m.cash },
  { header: "Chuyển khoản", type: "money", value: (m) => m.transfer },
];
