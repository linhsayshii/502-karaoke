"use client";

import { Suspense, useState } from "react";
import { WarehouseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { InfoPopover } from "@/components/info-popover";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatAmount, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_CATEGORY } from "@/lib/labels";
import { INVENTORY_COLUMNS, inventorySheet, sumFlows } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { InventoryFlows, InventoryReport, InventoryReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";
const NONE = "none"; // products without a category

// The groups (SL + Thành tiền), left to right, and the narrowest width that
// shows each: the amounts come first, so Nhập and Xuất show from a small
// tablet on. ĐVT and đơn giá bình quân get their own columns only on wide
// screens (DETAILS), with a stand-in under the name below that.
const SHOW: Partial<Record<keyof InventoryFlows, string>> = {
  opening: SHOW_FROM.md,
  stockIn: SHOW_FROM.sm,
  stockOut: SHOW_FROM.sm,
};
const DETAILS = SHOW_FROM.lg;
const DETAILS_STAND_IN = "@5xl/main:hidden";
const FLOWS = INVENTORY_COLUMNS.map((flow) => ({ ...flow, show: SHOW[flow.key] }));
const NUM = "text-right tabular-nums";
// Every group (SL + Thành tiền) gets the same width, whatever its numbers,
// and so do ĐVT and đơn giá; the name column takes what is left.
const QTY_WIDTH = "w-20";
const VALUE_WIDTH = "w-32";

const categoryKey = (row: InventoryReportRow) => (row.categoryId === null ? NONE : String(row.categoryId));

// Nhập – xuất – tồn: per product, the opening balance, what came in and
// went out (valued at the weighted average cost of each movement) and the
// closing balance.
function InventoryView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [category, setCategory] = useState(ALL);
  const { data, loading } = useApiData<InventoryReport | null>(
    "/reports/inventory",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo nhập – xuất – tồn",
  );
  const scope = useReportScope(data);

  const categories = new Map<string, string>();
  for (const row of data?.rows ?? []) {
    const label =
      row.categoryId === null
        ? NO_CATEGORY
        : scope.chain
          ? `${row.categoryName ?? NO_CATEGORY} · ${row.branchCode.toUpperCase()}`
          : (row.categoryName ?? NO_CATEGORY);
    categories.set(categoryKey(row), label);
  }
  // A category that is gone after a reload falls back to all of them.
  const selected = category === ALL || categories.has(category) ? category : ALL;
  const rows = (data?.rows ?? []).filter((row) => selected === ALL || categoryKey(row) === selected);
  const t = sumFlows(rows);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName("nhap-xuat-ton", scope.fileScope, data.range.from, data.range.to), [
      inventorySheet(rows),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Xuất nhập tồn"
        description={scope.name}
        info={`Số lượng và giá trị theo giá vốn bình quân của từng lần nhập, bán, xuất. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} periods={false} />

      {!data ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <StatTile label="Tồn đầu" value={formatMoney(t.opening.value)} footer={`${formatNumber(t.opening.quantity)} đơn vị hàng`} />
            <StatTile label="Nhập" value={formatMoney(t.stockIn.value)} footer={`${formatNumber(t.stockIn.quantity)} đơn vị hàng`} />
            <StatTile
              label="Xuất"
              value={formatMoney(t.stockOut.value)}
              footer={`Bán ${formatMoney(t.sales.value)} · phiếu xuất ${formatMoney(t.exports.value)}`}
            />
            <StatTile label="Tồn cuối" value={formatMoney(t.closing.value)} footer={`${rows.length} món`} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-1">
                <CardTitle>Theo món</CardTitle>
                <InfoPopover>
                  Thành tiền theo giá vốn (đồng); đơn giá bình quân tính đến cuối kỳ. Tồn cuối = tồn đầu + nhập − xuất. Xuất gồm
                  bán hàng và phiếu xuất kho, đã trừ hàng trả lại kho khi hủy hóa đơn hay phiếu xuất; nhập đã trừ phiếu nhập bị
                  hủy.
                </InfoPopover>
              </div>
              <CardDescription>{formatDateRange(data.range)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {categories.size > 1 && (
                <Select value={selected} onValueChange={setCategory}>
                  <SelectTrigger className="w-full @md/main:w-56" aria-label="Danh mục">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
                    {[...categories].map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {rows.length === 0 ? (
                <EmptyState
                  icon={WarehouseIcon}
                  title="Không có hàng tồn hay biến động"
                  description={`Không có món nào còn tồn hoặc nhập, bán, xuất trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2}>Tên mặt hàng</TableHead>
                      <TableHead rowSpan={2} className={cn(QTY_WIDTH, DETAILS)}>
                        ĐVT
                      </TableHead>
                      <TableHead rowSpan={2} className={cn("text-right whitespace-normal", VALUE_WIDTH, DETAILS)}>
                        Đơn giá bình quân
                      </TableHead>
                      {FLOWS.map((flow) => (
                        <TableHead key={flow.key} colSpan={2} className={cn("border-l text-center", flow.show)}>
                          {flow.label}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      {FLOWS.map((flow) => [
                        <TableHead key={`${flow.key}-q`} className={cn("border-l", NUM, QTY_WIDTH, flow.show)}>
                          SL
                        </TableHead>,
                        <TableHead key={`${flow.key}-v`} className={cn(NUM, VALUE_WIDTH, flow.show)}>
                          Thành tiền
                        </TableHead>,
                      ])}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium whitespace-normal">
                          <div>{row.name}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {[row.categoryName ?? NO_CATEGORY, scope.chain ? row.branchCode.toUpperCase() : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          <div className={cn("text-xs font-normal text-muted-foreground", DETAILS_STAND_IN)}>
                            {[row.unit, `ĐG bình quân ${formatAmount(row.averageCost)}`].filter(Boolean).join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell className={DETAILS}>{row.unit}</TableCell>
                        <TableCell className={cn(NUM, DETAILS)}>{formatAmount(row.averageCost)}</TableCell>
                        {FLOWS.map((flow) => {
                          const strong = flow.key === "closing" && "font-medium";
                          return [
                            <TableCell key={`${flow.key}-q`} className={cn("border-l", NUM, strong, flow.show)}>
                              {formatNumber(row[flow.key].quantity)}
                            </TableCell>,
                            <TableCell key={`${flow.key}-v`} className={cn(NUM, strong, flow.show)}>
                              {formatAmount(row[flow.key].value)}
                            </TableCell>,
                          ];
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <TableCell className={DETAILS} />
                        <TableCell className={DETAILS} />
                        {FLOWS.map((flow) => [
                          // Quantities of different units do not add up.
                          <TableCell key={`${flow.key}-q`} className={cn("border-l", flow.show)} />,
                          <TableCell key={`${flow.key}-v`} className={cn(NUM, flow.show)}>
                            {formatAmount(t[flow.key].value)}
                          </TableCell>,
                        ])}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function InventoryReportPage() {
  return (
    <Suspense>
      <InventoryView />
    </Suspense>
  );
}
