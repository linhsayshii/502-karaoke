"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ChartColumnBigIcon, ChevronRightIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { reportParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatDate, formatHours, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import { delta, reportFileName, tickLabel, withinBillsRange } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { ReportBucket, RevenueMetrics, RevenueReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = {
  roomNet: { label: "Tiền giờ", color: "var(--chart-1)" },
  productNet: { label: "Tiền hàng", color: "var(--chart-2)" },
  serviceFee: { label: "Phí dịch vụ", color: "var(--chart-3)" },
} satisfies ChartConfig;

const NUM = "text-right tabular-nums";
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// After their discounts.
const roomNet = (m: RevenueMetrics) => m.roomFee - m.roomDiscount;
const productNet = (m: RevenueMetrics) => m.productSales - m.productDiscount;

type PeriodRow = ReportBucket & RevenueMetrics;
type BranchRow = { name: string } & RevenueMetrics;

const periodColumns: ExportColumn<PeriodRow>[] = [
  { header: "Kỳ", value: (r) => r.label },
  { header: "Từ ngày", value: (r) => formatDate(r.from) },
  { header: "Đến ngày", value: (r) => formatDate(r.to) },
  ...METRIC_COLUMNS,
];

const branchColumns: ExportColumn<BranchRow>[] = [{ header: "Cơ sở", value: (r) => r.name }, ...METRIC_COLUMNS];

// Revenue of paid bills by business day of payment (06:00 → 06:00), before
// VAT with VAT apart; the fund's sales receipts cover the same bills.
function RevenueView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<RevenueReport | null>(
    "/reports/revenue",
    reportParams(branch, filters),
    null,
    "Không thể tải báo cáo doanh thu",
  );

  // The scope of the data actually shown, not the toolbar's current filter
  // (which may not match yet while a request is in flight or failed).
  const scope = useReportScope(data);
  const isChainData = scope.chain;
  const scopeName = scope.name;
  const billsHref = (from: string, to: string) => `/${branch}/sales/statistics/bills?from=${from}&to=${to}`;

  const exportExcel = async () => {
    if (!data) return;
    const tables = [
      toSheet("Theo kỳ", periodColumns, data.buckets, {
        key: "",
        label: "Tổng",
        from: data.range.from,
        to: data.range.to,
        ...data.totals,
      }),
    ];
    if (data.byBranch) {
      tables.push(toSheet("Theo cơ sở", branchColumns, data.byBranch, { name: "Tổng", ...data.totals }));
    }
    await exportWorkbook(reportFileName("doanh-thu", scope.fileScope, data.range.from, data.range.to), tables);
  };

  const t = data?.totals;
  // Undefined while not comparing: the tiles then show no badge.
  const change = (pick: (m: RevenueMetrics) => number) =>
    data?.previous && t ? delta(pick(t), pick(data.previous.totals)) : undefined;
  // Periods with sales, newest first (the chart shows every period).
  const rows = [...(data?.buckets ?? [])].filter((b) => b.orderCount > 0).reverse();
  const chartData = data
    ? data.buckets.map((b) => ({
        tick: tickLabel(b, data.groupBy),
        label: b.label,
        roomNet: roomNet(b),
        productNet: productNet(b),
        serviceFee: b.serviceFee,
      }))
    : [];

  return (
    <>
      <PageHeader
        title="Doanh thu"
        description={`${scopeName} · Doanh thu chưa gồm VAT, VAT tính riêng. Theo giờ thanh toán; hóa đơn đã hủy không được tính. ${BUSINESS_DAY_HINT}`}
      />
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
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-5">
            <StatTile
              label="Doanh thu (chưa VAT)"
              value={formatMoney(t.revenue)}
              delta={change((m) => m.revenue)}
              footer={`Tiền giờ ${formatMoney(roomNet(t))} · tiền hàng ${formatMoney(productNet(t))}`}
            />
            <StatTile
              label="VAT"
              value={formatMoney(t.vat)}
              delta={change((m) => m.vat)}
              footer="Thuế GTGT trên hóa đơn, không tính vào doanh thu"
            />
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
              footer={`TB ${formatMoney(t.avgRevenue)} / hóa đơn${data.voided.count ? ` · ${data.voided.count} đã hủy` : ""}`}
            />
            <StatTile
              label="Giờ phòng"
              value={formatHours(t.roomMinutes)}
              delta={change((m) => m.roomMinutes)}
              footer={
                t.orderCount
                  ? `TB ${formatNumber(Math.round(t.roomMinutes / t.orderCount))} phút / hóa đơn`
                  : "Chưa có hóa đơn"
              }
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
                    <ChartLegend content={<ChartLegendContent />} />
                    {(["roomNet", "productNet", "serviceFee"] as const).map((key, i, all) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="revenue"
                        fill={`var(--color-${key})`}
                        stroke="var(--card)"
                        strokeWidth={2}
                        maxBarSize={32}
                        radius={i === all.length - 1 ? [4, 4, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết theo kỳ</CardTitle>
              <CardDescription>
                Các kỳ có doanh thu
                {!isChainData && "; bấm mũi tên để xem hóa đơn của kỳ đó"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {t.orderCount === 0 ? (
                <EmptyState
                  icon={ChartColumnBigIcon}
                  title="Chưa có doanh thu"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kỳ</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền giờ</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền hàng</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Phí DV</TableHead>
                      <TableHead className="text-right">Doanh thu</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng thu</TableHead>
                      {!isChainData && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">
                          {data.groupBy === "day" ? formatDate(row.key) : row.label}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{row.orderCount}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(row.roomFee)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(row.productSales)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>
                          {formatNumber(row.roomDiscount + row.productDiscount)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(row.serviceFee)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatNumber(row.revenue)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.collected)}</TableCell>
                        {!isChainData && (
                          <TableCell className="px-1">
                            <Button variant="ghost" size="icon-sm" asChild>
                              <Link href={billsHref(row.from, row.to)} aria-label={`Hóa đơn ${row.label}`}>
                                <ChevronRightIcon />
                              </Link>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{t.orderCount}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(t.roomFee)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(t.productSales)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>
                          {formatNumber(t.roomDiscount + t.productDiscount)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(t.serviceFee)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(t.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.collected)}</TableCell>
                        {!isChainData && (
                          <TableCell className="px-1">
                            {withinBillsRange(data.range.from, data.range.to) && (
                              <Button variant="ghost" size="icon-sm" asChild>
                                <Link
                                  href={billsHref(data.range.from, data.range.to)}
                                  aria-label="Tất cả hóa đơn trong kỳ"
                                >
                                  <ChevronRightIcon />
                                </Link>
                              </Button>
                            )}
                          </TableCell>
                        )}
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
                      <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                      <TableHead className="text-right">Doanh thu</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng thu</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tỷ trọng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byBranch.map((b) => (
                      <TableRow key={b.branchId}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{b.orderCount}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(b.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(b.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(b.collected)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>
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

export default function RevenueReportPage() {
  return (
    <Suspense>
      <RevenueView />
    </Suspense>
  );
}
