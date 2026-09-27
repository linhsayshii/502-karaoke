"use client";

import { Suspense } from "react";
import { DoorOpenIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatHours, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_ROOM, roomTypeLabel } from "@/lib/labels";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import { reportFileName, ROOM_GROUPS } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { RevenueMetrics, RoomGroup, RoomReport, RoomReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const GROUP_LABELS: Record<RoomGroup, string> = { room: "Theo phòng", type: "Theo loại phòng" };

// After their discounts.
const roomNet = (m: RevenueMetrics) => m.roomFee - m.roomDiscount;
const productNet = (m: RevenueMetrics) => m.productSales - m.productDiscount;

// A room, a room type (by=type) or "Không phòng" (id null).
function rowName(row: RoomReportRow, by: RoomGroup) {
  if (row.id === null) return row.name ?? NO_ROOM;
  return by === "type" ? roomTypeLabel(row.type) : (row.name ?? "");
}

function columnsFor(by: RoomGroup): ExportColumn<RoomReportRow>[] {
  return [
    { header: by === "room" ? "Phòng" : "Loại phòng", value: (r) => rowName(r, by) },
    ...(by === "room"
      ? [
          { header: "Loại", value: (r: RoomReportRow) => (r.type ? roomTypeLabel(r.type) : null) },
          { header: "Cơ sở", value: (r: RoomReportRow) => r.branchCode?.toUpperCase() ?? null },
        ]
      : [{ header: "Số phòng", type: "number" as const, value: (r: RoomReportRow) => r.rooms }]),
    { header: "Công suất", type: "percent", value: (r) => r.occupancy },
    ...METRIC_COLUMNS,
  ];
}

function MetricCells({ m, occupancy }: { m: RevenueMetrics; occupancy: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.orderCount)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatHours(m.roomMinutes)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatPercent(occupancy)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(roomNet(m))}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(productNet(m))}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
    </>
  );
}

// Revenue and occupancy per room or room type; every room of the scope is
// listed, also those without guests.
function RoomsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [by, setBy] = useReportOption<RoomGroup>("by", ROOM_GROUPS, "room");
  const { data, loading } = useApiData<RoomReport | null>(
    "/reports/rooms",
    { ...rangeParams(branch, filters), by },
    null,
    "Không thể tải báo cáo phòng",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`phong-${data.by}`, scope.fileScope, data.range.from, data.range.to), [
      // id null + a name: rowName() shows "Tổng".
      toSheet(GROUP_LABELS[data.by], columnsFor(data.by), data.rows, {
        id: null,
        name: "Tổng",
        type: null,
        branchCode: null,
        rooms: data.rows.reduce((sum, r) => sum + r.rooms, 0),
        occupancy: data.occupancy,
        ...data.totals,
      }),
    ]);
  };

  const t = data?.totals;
  const chartRows = data
    ? data.rows
        .filter((row) => row.id !== null)
        .map((row) => ({
          name: rowName(row, data.by) + (scope.chain && row.branchCode ? ` · ${row.branchCode.toUpperCase()}` : ""),
          value: row.revenue,
        }))
    : [];

  return (
    <>
      <PageHeader
        title="Phòng"
        description={`${scope.name} · Công suất = giờ có khách / giờ mở cửa (11:30 – 06:00, 18,5 giờ mỗi ngày). Doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} periods={false} />
      <Tabs value={by} onValueChange={(value) => setBy(value as RoomGroup)}>
        <TabsList>
          {ROOM_GROUPS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUP_LABELS[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
            <StatTile
              label="Doanh thu (chưa VAT)"
              value={formatMoney(t.revenue)}
              footer={`Tiền giờ ${formatMoney(roomNet(t))} · tiền hàng ${formatMoney(productNet(t))}`}
            />
            <StatTile label="Giờ phòng" value={formatHours(t.roomMinutes)} footer={`${formatNumber(t.orderCount)} hóa đơn`} />
            <StatTile
              label="Công suất"
              value={formatPercent(data.occupancy)}
              footer={`${data.rows.reduce((sum, r) => sum + r.rooms, 0)} phòng · ${data.days} ngày`}
            />
          </div>

          {t.orderCount === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={DoorOpenIcon}
                  title="Chưa có hóa đơn"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            chartRows.some((row) => row.value > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 {data.by === "room" ? "phòng" : "loại phòng"}</CardTitle>
                  <CardDescription>Theo doanh thu chưa VAT (đồng)</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <RankingChart rows={chartRows} label="Doanh thu" />
                </CardContent>
              </Card>
            )
          )}

          <Card>
            <CardHeader>
              <CardTitle>{GROUP_LABELS[data.by]}</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Tiền giờ và tiền hàng đã trừ giảm giá.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{data.by === "room" ? "Phòng" : "Loại phòng"}</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>Giờ phòng</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>Công suất</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền giờ</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền hàng</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id ?? "none"}>
                      <TableCell className="font-medium">
                        <div className={cn(row.id === null && "text-muted-foreground")}>{rowName(row, data.by)}</div>
                        {row.id !== null && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {data.by === "room"
                              ? [roomTypeLabel(row.type), scope.chain ? row.branchCode?.toUpperCase() : null]
                                  .filter(Boolean)
                                  .join(" · ")
                              : `${row.rooms} phòng`}
                          </div>
                        )}
                      </TableCell>
                      <MetricCells m={row} occupancy={row.occupancy} />
                    </TableRow>
                  ))}
                </TableBody>
                {data.rows.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Tổng</TableCell>
                      <MetricCells m={t} occupancy={data.occupancy} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function RoomsReportPage() {
  return (
    <Suspense>
      <RoomsView />
    </Suspense>
  );
}
