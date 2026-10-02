import { TableCell, TableHead } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { SHOW_FROM } from "@/lib/responsive";
import type { EinvoiceMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

// What every report of the report site counts (spec 2026-10-02 §5.1).
export const EINVOICE_REPORT_INFO = `Tính theo hóa đơn điện tử đã lưu nháp, đang gửi hoặc đã xuất, vào ngày hóa đơn của từng hóa đơn (một bill chia nhiều hóa đơn khác ngày thì nằm ở nhiều ngày); hóa đơn chưa xuất của bill đã hủy không được tính. Doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`;

const NUM = "text-right tabular-nums";

// The metric columns of the report site's tables, the same in every report.
export function EinvoiceMetricHeads() {
  return (
    <>
      <TableHead className={cn("text-right", SHOW_FROM.xs)}>HĐĐT</TableHead>
      <TableHead className="text-right">Doanh thu</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng tiền</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Đã xuất</TableHead>
    </>
  );
}

export function EinvoiceMetricCells({ m }: { m: EinvoiceMetrics }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.einvoiceCount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.vat)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.total)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.issued)}</TableCell>
    </>
  );
}
