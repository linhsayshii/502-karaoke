"use client";

import { Suspense } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { DeltaBadge, StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { reportParams, useReportFilters } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatCompact, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { branchPeriodsSheet, branchesSheet } from "@/lib/report-sheets";
import { delta, reportFileName, tickLabel } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { BranchesReport, RevenueMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

function MetricCells({ m, share }: { m: RevenueMetrics; share: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.orderCount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.vat)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.collected)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.avgRevenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatPercent(share)}</TableCell>
    </>
  );
}

// Every branch side by side (chain manager only): the same numbers as the
// revenue report of the whole chain, per branch and per period.
function BranchesView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<BranchesReport | null>(
    "/reports/branches",
    reportParams(branch, { ...filters, chain: true }),
    null,
    "Không thể tải báo cáo so sánh cơ sở",
  );

  const t = data?.totals;
  const change = (pick: (m: RevenueMetrics) => number) =>
    data?.previous && t ? delta(pick(t), pick(data.previous.totals)) : undefined;

  const chartConfig = Object.fromEntries(
    (data?.branches ?? []).map((b, i) => [b.code, { label: b.name, color: `var(--chart-${(i % 5) + 1})` }]),
  ) satisfies ChartConfig;
  const chartData = data
    ? data.buckets.map((bucket, i) => ({
        tick: tickLabel(bucket, data.groupBy),
        label: bucket.label,
        ...Object.fromEntries(data.branches.map((b) => [b.code, b.series[i]])),
      }))
    : [];

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName("so-sanh-co-so", "toan-chuoi", data.range.from, data.range.to), [
      branchesSheet(data),
      branchPeriodsSheet(data),
    ]);
  };

  return (
    <>
      <PageHeader
        title="So sánh cơ sở"
        description="Toàn chuỗi"
        info={`Doanh thu chưa gồm VAT, VAT tính riêng. Theo giờ thanh toán. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} scope={false} />

      {!data || !t ? (
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
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} delta={change((m) => m.revenue)} />
            <StatTile label="VAT" value={formatMoney(t.vat)} delta={change((m) => m.vat)} />
            <StatTile
              label="Tổng thu"
              value={formatMoney(t.collected)}
              delta={change((m) => m.collected)}
              footer={`Tiền mặt ${formatMoney(t.cash)} · CK ${formatMoney(t.transfer)}`}
            />
            <StatTile
              label="Hóa đơn"
              value={formatNumber(t.orderCount)}
              delta={change((m) => m.orderCount)}
              footer={`TB ${formatMoney(t.avgRevenue)} / hóa đơn`}
            />
          </div>
          {data.previous && (
            <p className="text-sm text-muted-foreground">So với kỳ trước: {formatDateRange(data.previous)}</p>
          )}

          {data.buckets.length > 1 && t.orderCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu theo kỳ</CardTitle>
                <CardDescription>{formatDateRange(data.range)} · chưa gồm VAT (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(value: number) => formatCompact(value)}
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
                    <ChartLegend content={<ChartLegendContent />} />
                    {data.branches.map((b) => (
                      <Line
                        key={b.code}
                        dataKey={b.code}
                        type="monotone"
                        stroke={`var(--color-${b.code})`}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Theo cơ sở</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Tỷ trọng tính trên doanh thu chưa VAT của toàn chuỗi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cơ sở</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng thu</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>TB/HĐ</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Tỷ trọng</TableHead>
                    {data.previous && <TableHead className={cn("text-right", SHOW_FROM.sm)}>So kỳ trước</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.branches.map((b) => (
                    <TableRow key={b.branchId}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <MetricCells m={b} share={b.share} />
                      {data.previous && (
                        <TableCell className={cn("text-right", SHOW_FROM.sm)}>
                          <DeltaBadge value={delta(b.revenue, b.previous?.revenue)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Toàn chuỗi</TableCell>
                    <MetricCells m={t} share={t.revenue ? 1 : null} />
                    {data.previous && (
                      <TableCell className={cn("text-right", SHOW_FROM.sm)}>
                        <DeltaBadge value={delta(t.revenue, data.previous.totals.revenue)} />
                      </TableCell>
                    )}
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function BranchesReportPage() {
  return (
    <Suspense>
      <BranchesView />
    </Suspense>
  );
}
