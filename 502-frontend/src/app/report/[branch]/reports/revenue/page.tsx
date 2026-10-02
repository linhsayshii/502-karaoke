"use client";

import { Suspense } from "react";
import { ChartColumnBigIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import {
  EINVOICE_REPORT_INFO,
  EinvoiceMetricCells,
  EinvoiceMetricHeads,
} from "@/components/report-site/einvoice-metric-cells";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { reportParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { einvoiceRevenueBranchesSheet, einvoiceRevenueSheet } from "@/lib/report-sheets";
import { delta, reportFileName, tickLabel } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { EinvoiceMetrics, EinvoiceRevenueReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = { revenue: { label: "Doanh thu", color: "var(--chart-1)" } } satisfies ChartConfig;
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// Revenue of the counted e-invoices by the business day of their bill
// (spec 2026-10-02-trang-bao-cao-hddt §5.2).
function RevenueView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<EinvoiceRevenueReport | null>(
    "/report-site/reports/revenue",
    reportParams(branch, filters),
    null,
    "Không thể tải báo cáo doanh thu",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    const byBranch = einvoiceRevenueBranchesSheet(data);
    await exportWorkbook(reportFileName("doanh-thu-hddt", scope.fileScope, data.range.from, data.range.to), [
      einvoiceRevenueSheet(data),
      ...(byBranch ? [byBranch] : []),
    ]);
  };

  const t = data?.totals;
  // Undefined while not comparing: the tiles then show no badge.
  const change = (pick: (m: EinvoiceMetrics) => number) =>
    data?.previous && t ? delta(pick(t), pick(data.previous.totals)) : undefined;
  // Periods with invoices, newest first (the chart shows every period).
  const rows = [...(data?.buckets ?? [])].filter((b) => b.einvoiceCount > 0).reverse();
  const chartData = data
    ? data.buckets.map((b) => ({ tick: tickLabel(b, data.groupBy), label: b.label, revenue: b.revenue }))
    : [];

  return (
    <>
      <PageHeader title="Doanh thu" description={scope.name} info={EINVOICE_REPORT_INFO} />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} />

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            <StatTile
              label="Doanh thu (chưa VAT)"
              value={formatMoney(t.revenue)}
              delta={change((m) => m.revenue)}
              footer={`Chưa xuất ${formatMoney(t.pending)} (gồm VAT)`}
            />
            <StatTile
              label="VAT"
              value={formatMoney(t.vat)}
              delta={change((m) => m.vat)}
              footer="Thuế GTGT trên hóa đơn điện tử"
            />
            <StatTile
              label="Tổng tiền"
              value={formatMoney(t.total)}
              delta={change((m) => m.total)}
              footer="Đã gồm VAT"
            />
            <StatTile label="Số HĐĐT" value={formatNumber(t.einvoiceCount)} delta={change((m) => m.einvoiceCount)} />
            <StatTile
              label="Đã xuất"
              value={formatMoney(t.issued)}
              delta={change((m) => m.issued)}
              footer="Đã gồm VAT"
            />
          </div>
          {data.previous && (
            <p className="text-sm text-muted-foreground">So với kỳ trước: {formatDateRange(data.previous)}</p>
          )}

          {data.buckets.length > 1 && t.einvoiceCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu theo kỳ</CardTitle>
                <CardDescription>{formatDateRange(data.range)} · chưa gồm VAT (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
                  <BarChart data={chartData} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(value: number) => compact.format(value)}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(_, payload) =>
                            (payload?.[0]?.payload as { label?: string } | undefined)?.label ?? ""
                          }
                        />
                      }
                    />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" maxBarSize={32} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết theo kỳ</CardTitle>
              <CardDescription>Các kỳ có hóa đơn điện tử.</CardDescription>
            </CardHeader>
            <CardContent>
              {t.einvoiceCount === 0 ? (
                <EmptyState
                  icon={ChartColumnBigIcon}
                  title="Chưa có hóa đơn điện tử"
                  description={`Không có hóa đơn điện tử nào trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kỳ</TableHead>
                      <EinvoiceMetricHeads />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">
                          {data.groupBy === "day" ? formatDate(row.key) : row.label}
                        </TableCell>
                        <EinvoiceMetricCells m={row} />
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <EinvoiceMetricCells m={t} />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>

          {data.byBranch && (
            <Card>
              <CardHeader>
                <CardTitle>Theo cơ sở</CardTitle>
                <CardDescription>Tỷ trọng tính trên doanh thu chưa VAT của toàn chuỗi.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cơ sở</TableHead>
                      <EinvoiceMetricHeads />
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tỷ trọng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byBranch.map((b) => (
                      <TableRow key={b.branchId}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <EinvoiceMetricCells m={b} />
                        <TableCell className={cn("text-right tabular-nums", SHOW_FROM.md)}>
                          {t.revenue ? percent.format(b.revenue / t.revenue) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function ReportRevenuePage() {
  return (
    <Suspense>
      <RevenueView />
    </Suspense>
  );
}
