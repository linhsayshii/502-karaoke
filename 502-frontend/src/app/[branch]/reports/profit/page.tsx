"use client";

import { Suspense } from "react";
import { ScaleIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatAmount, formatCompact, formatMoney, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { profitLines, type ProfitLine } from "@/lib/profit";
import { reportFileName, tickLabel } from "@/lib/reports";
import type { ProfitMetrics, ProfitReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = { profit: { label: "Lợi nhuận", color: "var(--chart-1)" } } satisfies ChartConfig;

const NUM = "text-right tabular-nums whitespace-nowrap";
// The first column stays in view while the periods scroll sideways.
const STICKY = "sticky left-0 z-10 bg-card";

const cellText = (line: ProfitLine, m: ProfitMetrics) => {
  const value = line.value(m);
  return line.kind === "percent" ? formatPercent(value) : formatAmount(value ?? 0);
};

// Percent lines go to Excel as text: their columns are formatted as money.
const excelValue = (line: ProfitLine, m: ProfitMetrics) =>
  line.kind === "percent" ? formatPercent(line.value(m)) : line.value(m);

const hasFigures = (m: ProfitMetrics) =>
  [m.revenue, m.cogs, m.expenseTotal, m.losses, m.otherIncome, m.purchases].some((value) => value !== 0);

// Profit and loss: revenue before VAT − cost of goods sold (weighted average
// at the sale) − operating expenses (manual phiếu chi) − goods exported +
// other income. Periods as columns, by month by default.
function ProfitView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters({ groupBy: "month" });
  const { data, loading } = useApiData<ProfitReport | null>(
    "/reports/profit",
    { ...rangeParams(branch, filters), groupBy: filters.groupBy },
    null,
    "Không thể tải báo cáo lãi lỗ",
  );
  const scope = useReportScope(data);

  const lines = data ? profitLines(data.categories) : [];
  const shownLines = data ? lines.filter((line) => !line.optional || line.value(data.totals) !== 0) : [];

  const exportExcel = async () => {
    if (!data) return;
    const columns: ExportColumn<ProfitLine>[] = [
      { header: "Khoản mục", value: (line) => (line.level ? `   ${line.label}` : line.label) },
      { header: "Tổng", type: "money", value: (line) => excelValue(line, data.totals) },
      ...data.buckets.map(
        (bucket): ExportColumn<ProfitLine> => ({
          header: bucket.label,
          type: "money",
          value: (line) => excelValue(line, bucket),
        }),
      ),
    ];
    await exportWorkbook(reportFileName("lai-lo", scope.fileScope, data.range.from, data.range.to), [
      toSheet("Lãi lỗ", columns, lines),
    ]);
  };

  const t = data?.totals;
  const chartData = data
    ? data.buckets.map((b) => ({ tick: tickLabel(b, data.groupBy), label: b.label, profit: b.profit }))
    : [];

  return (
    <>
      <PageHeader
        title="Lãi lỗ"
        description={`${scope.name} · Lợi nhuận = doanh thu chưa VAT − giá vốn hàng bán − chi phí − hàng xuất kho + thu khác. Tiền nhập hàng thành hàng tồn nên không tính là chi phí. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar
        filters={filters}
        onChange={setFilters}
        onExport={data && !loading ? exportExcel : undefined}
        compare={false}
      />

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
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} footer={`VAT phải nộp ${formatMoney(t.vat)}`} />
            <StatTile
              label="Lãi gộp"
              value={formatMoney(t.grossProfit)}
              footer={`Giá vốn ${formatMoney(t.cogs)} · biên ${formatPercent(t.grossMargin)}`}
            />
            <StatTile
              label="Chi phí và hao hụt"
              value={formatMoney(t.expenseTotal + t.losses)}
              footer={`Chi phí ${formatMoney(t.expenseTotal)} · xuất kho ${formatMoney(t.losses)}`}
            />
            <StatTile
              label="Lợi nhuận"
              value={formatMoney(t.profit)}
              footer={`Thu khác ${formatMoney(t.otherIncome)} · biên ${formatPercent(t.profitMargin)}`}
            />
          </div>

          {!hasFigures(t) ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={ScaleIcon}
                  title="Chưa có số liệu"
                  description={`Không có doanh thu, chi phí hay nhập xuất kho trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {data.buckets.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Lợi nhuận theo kỳ</CardTitle>
                    <CardDescription>{formatDateRange(data.range)} · đồng</CardDescription>
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
                        <Bar dataKey="profit" maxBarSize={32} radius={[4, 4, 0, 0]}>
                          {chartData.map((point) => (
                            <Cell
                              key={point.label}
                              fill={point.profit < 0 ? "var(--destructive)" : "var(--color-profit)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Báo cáo lãi lỗ</CardTitle>
                  <CardDescription>
                    {formatDateRange(data.range)} · Khoản mục chi bằng 0 được ẩn (vẫn có trong file Excel).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn(STICKY, "min-w-40")}>Khoản mục</TableHead>
                        <TableHead className={NUM}>Tổng</TableHead>
                        {data.buckets.length > 1 &&
                          data.buckets.map((bucket) => (
                            <TableHead key={bucket.key} className={NUM}>
                              {bucket.label}
                            </TableHead>
                          ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shownLines.map((line) => (
                        <TableRow
                          key={line.key}
                          className={cn(line.strong && "font-medium", line.info && "text-muted-foreground")}
                        >
                          <TableCell
                            className={cn(STICKY, line.level === 1 && "pl-6 text-muted-foreground")}
                          >
                            {line.label}
                          </TableCell>
                          <TableCell className={NUM}>{cellText(line, data.totals)}</TableCell>
                          {data.buckets.length > 1 &&
                            data.buckets.map((bucket) => (
                              <TableCell key={bucket.key} className={NUM}>
                                {cellText(line, bucket)}
                              </TableCell>
                            ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function ProfitReportPage() {
  return (
    <Suspense>
      <ProfitView />
    </Suspense>
  );
}
