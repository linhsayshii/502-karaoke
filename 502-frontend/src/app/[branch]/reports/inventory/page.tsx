"use client";

import { Suspense, useState } from "react";
import { WarehouseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatAmount, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_CATEGORY } from "@/lib/labels";
import { INVENTORY_FLOWS, inventorySheet, sumFlows } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { InventoryFlows, InventoryReport, InventoryReportRow, StockFlow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";
const NONE = "none"; // products without a category

// The columns, left to right, and the narrowest width that shows each.
const SHOW: Partial<Record<keyof InventoryFlows, string>> = {
  opening: SHOW_FROM.sm,
  imports: SHOW_FROM.md,
  sales: SHOW_FROM.md,
  exports: SHOW_FROM.lg,
  others: SHOW_FROM.lg,
};
const FLOWS = INVENTORY_FLOWS.map((flow) => ({ ...flow, show: SHOW[flow.key] }));

const categoryKey = (row: InventoryReportRow) => (row.categoryId === null ? NONE : String(row.categoryId));

function FlowCell({ flow, className, strong }: { flow: StockFlow; className?: string; strong?: boolean }) {
  return (
    <TableCell className={cn("text-right tabular-nums", strong && "font-medium", className)}>
      <div>{formatNumber(flow.quantity)}</div>
      <div className="text-xs font-normal text-muted-foreground">{formatAmount(flow.value)}</div>
    </TableCell>
  );
}

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
            <StatTile label="Nhập" value={formatMoney(t.imports.value)} footer={`${formatNumber(t.imports.quantity)} đơn vị hàng`} />
            <StatTile
              label="Bán và xuất kho"
              value={formatMoney(t.sales.value + t.exports.value)}
              footer={`Bán ${formatMoney(t.sales.value)} · xuất ${formatMoney(t.exports.value)}`}
            />
            <StatTile label="Tồn cuối" value={formatMoney(t.closing.value)} footer={`${rows.length} món`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Theo món</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Mỗi ô: số lượng, dưới là giá trị (đồng). Tồn cuối = tồn đầu + nhập − bán −
                xuất + hoàn/điều chỉnh.
              </CardDescription>
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
                      <TableHead>Món</TableHead>
                      {FLOWS.map((flow) => (
                        <TableHead key={flow.key} className={cn("text-right", flow.show)}>
                          {flow.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">
                          <div>{row.name}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {[row.categoryName ?? NO_CATEGORY, row.unit, scope.chain ? row.branchCode.toUpperCase() : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </TableCell>
                        {FLOWS.map((flow) => (
                          <FlowCell key={flow.key} flow={row[flow.key]} className={flow.show} strong={flow.key === "closing"} />
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng giá trị</TableCell>
                        {FLOWS.map((flow) => (
                          <TableCell key={flow.key} className={cn("text-right tabular-nums", flow.show)}>
                            {formatAmount(t[flow.key].value)}
                          </TableCell>
                        ))}
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
