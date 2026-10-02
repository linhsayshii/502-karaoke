"use client";

import { Suspense, useState } from "react";
import { PackageIcon, SearchIcon } from "lucide-react";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { EINVOICE_REPORT_INFO } from "@/components/report-site/einvoice-metric-cells";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatMoney, formatNumber } from "@/lib/format";
import { einvoiceProductName, einvoiceProductsSheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { EinvoiceProductReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

// The lines of the counted e-invoices by name and unit (spec 2026-10-02 §5.3);
// "Chưa có dòng hàng" makes the rows add up to the revenue report. That row
// can be negative (a draft whose lines exceed its amount): it is shown with
// its sign like every amount, never hidden or clamped.
function ProductsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<EinvoiceProductReport | null>(
    "/report-site/reports/products",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo hàng hóa",
  );
  const scope = useReportScope(data);
  const [search, setSearch] = useState("");
  const keyword = search.trim().toLowerCase();
  // The search only narrows the named rows; the two rows of the rest stay.
  const rows = (data?.rows ?? []).filter(
    (r) => !keyword || r.kind !== "item" || (r.name ?? "").toLowerCase().includes(keyword),
  );
  const chartRows = (data?.rows ?? [])
    .filter((r) => r.kind === "item")
    .map((r) => ({ name: r.name ?? "", value: r.revenue }));

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName("hang-hoa-hddt", scope.fileScope, data.range.from, data.range.to), [
      einvoiceProductsSheet(data),
    ]);
  };

  const t = data?.totals;
  return (
    <>
      <PageHeader title="Hàng hóa" description={scope.name} info={EINVOICE_REPORT_INFO} />
      <ReportToolbar
        filters={filters}
        onChange={setFilters}
        onExport={data && !loading ? exportExcel : undefined}
        periods={false}
      />

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} />
            <StatTile label="VAT" value={formatMoney(t.vat)} />
            <StatTile label="Tổng tiền" value={formatMoney(t.total)} />
          </div>

          {chartRows.some((row) => row.value > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 mặt hàng</CardTitle>
                <CardDescription>Theo tiền trước VAT trên hóa đơn điện tử (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <RankingChart rows={chartRows} label="Trước VAT" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Mặt hàng</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · gom theo tên (không phân biệt hoa/thường) và ĐVT
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <InputGroup className="sm:max-w-64">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Tìm tên hàng"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Tìm tên hàng"
                />
              </InputGroup>
              {data.rows.length === 0 ? (
                <EmptyState
                  icon={PackageIcon}
                  title="Chưa có hóa đơn điện tử"
                  description={`Không có hóa đơn điện tử nào trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên hàng</TableHead>
                      <TableHead className={SHOW_FROM.sm}>ĐVT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.xs)}>SL</TableHead>
                      <TableHead className="text-right">Trước VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={`${row.kind}:${row.name ?? ""}:${row.unit ?? ""}:${i}`}>
                        <TableCell className={cn("font-medium", row.kind !== "item" && "text-muted-foreground")}>
                          {einvoiceProductName(row)}
                          {row.unit && (
                            <div className={cn("text-xs font-normal text-muted-foreground", ONLY_NARROW)}>
                              {row.unit}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={SHOW_FROM.sm}>{row.unit ?? "—"}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>
                          {row.quantity === null ? "—" : row.quantity.toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(row.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {!keyword && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <TableCell className={SHOW_FROM.sm} />
                        <TableCell className={SHOW_FROM.xs} />
                        <TableCell className="text-right tabular-nums">{formatNumber(t.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.total)}</TableCell>
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

export default function ReportProductsPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
