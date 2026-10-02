"use client";

import { Suspense } from "react";
import { DoorOpenIcon } from "lucide-react";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import {
  EINVOICE_REPORT_INFO,
  EinvoiceMetricCells,
  EinvoiceMetricHeads,
} from "@/components/report-site/einvoice-metric-cells";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatMoney, formatNumber } from "@/lib/format";
import { roomTypeLabel } from "@/lib/labels";
import { einvoiceRoomsSheet, ROOM_GROUP_LABELS, roomRowName } from "@/lib/report-sheets";
import { reportFileName, ROOM_GROUPS } from "@/lib/reports";
import type { EinvoiceRoomReport, RoomGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

// The counted e-invoices per room or room type (spec 2026-10-02 §5.2); every
// room of the scope is listed, also those without invoices.
function RoomsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [by, setBy] = useReportOption<RoomGroup>("by", ROOM_GROUPS, "room");
  const { data, loading } = useApiData<EinvoiceRoomReport | null>(
    "/report-site/reports/rooms",
    { ...rangeParams(branch, filters), by },
    null,
    "Không thể tải báo cáo phòng",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`phong-hddt-${data.by}`, scope.fileScope, data.range.from, data.range.to), [
      einvoiceRoomsSheet(data),
    ]);
  };

  const t = data?.totals;
  const chartRows = data
    ? data.rows
        .filter((row) => row.id !== null)
        .map((row) => ({
          name: roomRowName(row, data.by) + (scope.chain && row.branchCode ? ` · ${row.branchCode.toUpperCase()}` : ""),
          value: row.revenue,
        }))
    : [];

  return (
    <>
      <PageHeader title="Phòng" description={scope.name} info={EINVOICE_REPORT_INFO} />
      <ReportToolbar
        filters={filters}
        onChange={setFilters}
        onExport={data && !loading ? exportExcel : undefined}
        periods={false}
      />
      <Tabs value={by} onValueChange={(value) => setBy(value as RoomGroup)}>
        <TabsList>
          {ROOM_GROUPS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {ROOM_GROUP_LABELS[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} footer={`VAT ${formatMoney(t.vat)}`} />
            <StatTile label="Tổng tiền" value={formatMoney(t.total)} footer={`Đã xuất ${formatMoney(t.issued)}`} />
            <StatTile
              label="Bill"
              value={formatNumber(t.billCount)}
              footer={`${formatNumber(t.einvoiceCount)} hóa đơn điện tử`}
            />
          </div>

          {t.einvoiceCount === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={DoorOpenIcon}
                  title="Chưa có hóa đơn điện tử"
                  description={`Không có hóa đơn điện tử nào trong ${formatDateRange(data.range)}.`}
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
              <CardTitle>{ROOM_GROUP_LABELS[data.by]}</CardTitle>
              <CardDescription>{formatDateRange(data.range)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{data.by === "room" ? "Phòng" : "Loại phòng"}</TableHead>
                    <EinvoiceMetricHeads />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id ?? "none"}>
                      <TableCell className="font-medium">
                        <div className={cn(row.id === null && "text-muted-foreground")}>{roomRowName(row, data.by)}</div>
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
                      <EinvoiceMetricCells m={row} />
                    </TableRow>
                  ))}
                </TableBody>
                {data.rows.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Tổng</TableCell>
                      <EinvoiceMetricCells m={t} />
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

export default function ReportRoomsPage() {
  return (
    <Suspense>
      <RoomsView />
    </Suspense>
  );
}
