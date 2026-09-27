"use client";

import { Suspense } from "react";
import { ClockIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Heatmap } from "@/components/reports/heatmap";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, WEEKDAY_LABELS } from "@/lib/labels";
import { HOUR_METRICS, reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { HourCell, HourMetric, HoursReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const METRIC_LABELS: Record<HourMetric, string> = { sessions: "Lượt khách", revenue: "Doanh thu" };

const hourRange = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`;

interface WeekdayRow {
  label: string;
  sessions: number;
  revenue: number;
}

const cellColumns: ExportColumn<HourCell>[] = [
  { header: "Thứ", value: (c) => WEEKDAY_LABELS[c.weekday - 1] },
  { header: "Giờ bắt đầu", value: (c) => hourRange(c.hour) },
  { header: "Lượt khách", type: "number", value: (c) => c.sessions },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (c) => c.revenue },
];

const weekdayColumns: ExportColumn<WeekdayRow>[] = [
  { header: "Thứ", value: (r) => r.label },
  { header: "Lượt khách", type: "number", value: (r) => r.sessions },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (r) => r.revenue },
];

// Totals per weekday of the business day (T2 → CN).
function byWeekday(cells: HourCell[]): WeekdayRow[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const day = cells.filter((c) => c.weekday === i + 1);
    return {
      label,
      sessions: day.reduce((sum, c) => sum + c.sessions, 0),
      revenue: day.reduce((sum, c) => sum + c.revenue, 0),
    };
  });
}

// When the guests come: sessions and revenue (before VAT) by weekday of the
// business day × hour the session started. The bills are those paid in the
// range, as in the revenue report.
function HoursView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [metric, setMetric] = useReportOption<HourMetric>("metric", HOUR_METRICS, "sessions");
  const { data, loading } = useApiData<HoursReport | null>(
    "/reports/hours",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo khung giờ",
  );
  const scope = useReportScope(data);

  const value = (cell: HourCell) => (metric === "sessions" ? cell.sessions : cell.revenue);
  const format = (v: number) => (metric === "sessions" ? `${formatNumber(v)} lượt` : formatMoney(v));
  const weekdays = data ? byWeekday(data.cells) : [];
  const busiest = data?.cells.reduce<HourCell | null>((best, c) => (value(c) > (best ? value(best) : 0) ? c : best), null);

  const exportExcel = async () => {
    if (!data) return;
    const totals = { ...data.totals };
    await exportWorkbook(reportFileName("khung-gio", scope.fileScope, data.range.from, data.range.to), [
      toSheet("Theo thứ", weekdayColumns, weekdays, { label: "Tổng", ...totals }),
      toSheet("Theo giờ", cellColumns, data.cells),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Khung giờ"
        description={`${scope.name} · Theo thứ của ngày kinh doanh và giờ khách vào phòng; doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} periods={false} />
      <Tabs value={metric} onValueChange={(v) => setMetric(v as HourMetric)}>
        <TabsList>
          {HOUR_METRICS.map((m) => (
            <TabsTrigger key={m} value={m}>
              {METRIC_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatTile label="Lượt khách" value={formatNumber(data.totals.sessions)} footer="Số hóa đơn đã thanh toán" />
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(data.totals.revenue)} />
            <StatTile
              label={`Đông nhất (${METRIC_LABELS[metric].toLowerCase()})`}
              value={busiest ? `${WEEKDAY_LABELS[busiest.weekday - 1]} ${String(busiest.hour).padStart(2, "0")}h` : "—"}
              footer={busiest ? format(value(busiest)) : "Chưa có hóa đơn"}
            />
          </div>

          {data.totals.sessions === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={ClockIcon}
                  title="Chưa có hóa đơn"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{METRIC_LABELS[metric]} theo thứ × giờ</CardTitle>
                  <CardDescription>
                    {formatDateRange(data.range)} · Cột là giờ bắt đầu, từ 06:00; di chuột lên ô để xem số.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Heatmap cells={data.cells} value={value} format={format} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Theo thứ</CardTitle>
                  <CardDescription>Thứ của ngày kinh doanh (khách vào sau 0:00 tính cho hôm trước).</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thứ</TableHead>
                        <TableHead className="text-right">Lượt</TableHead>
                        <TableHead className="text-right">Doanh thu</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.sm)}>TB/lượt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weekdays.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className={NUM}>{formatNumber(row.sessions)}</TableCell>
                          <TableCell className={NUM}>{formatNumber(row.revenue)}</TableCell>
                          <TableCell className={cn(NUM, SHOW_FROM.sm)}>
                            {row.sessions ? formatNumber(Math.round(row.revenue / row.sessions)) : "—"}
                          </TableCell>
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

export default function HoursReportPage() {
  return (
    <Suspense>
      <HoursView />
    </Suspense>
  );
}
