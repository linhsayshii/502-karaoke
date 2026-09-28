"use client";

import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatHours, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, STAFF_ROLE_LABELS, UNASSIGNED_STAFF } from "@/lib/labels";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import { reportFileName, STAFF_ROLES } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { RevenueMetrics, StaffReport, StaffReportRow, StaffRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

// id null: the bills nobody was assigned to in this role.
const staffName = (row: StaffReportRow) => row.name ?? (row.id === null ? UNASSIGNED_STAFF : `#${row.id}`);

const columns: ExportColumn<StaffReportRow>[] = [
  { header: "Nhân viên", value: staffName },
  { header: "Tài khoản", value: (r) => r.username },
  { header: "Cơ sở", value: (r) => r.branchCode?.toUpperCase() ?? null },
  ...METRIC_COLUMNS,
  { header: "TB/hóa đơn", type: "money", value: (r) => r.avgRevenue },
];

// The number cells of a row (the same for the total).
function MetricCells({ m }: { m: RevenueMetrics }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.orderCount)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatHours(m.roomMinutes)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.roomFee)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.productSales)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.roomDiscount + m.productDiscount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.vat)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.avgRevenue)}</TableCell>
    </>
  );
}

// Revenue per CSKH, server or cashier; each bill counts in full for each of
// them, so every tab adds up to the revenue report.
function StaffView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [role, setRole] = useReportOption<StaffRole>("role", STAFF_ROLES, "cskh");
  const { data, loading } = useApiData<StaffReport | null>(
    "/reports/staff",
    { ...rangeParams(branch, filters), role },
    null,
    "Không thể tải báo cáo nhân viên",
  );
  const scope = useReportScope(data);
  // Labels from the data shown (the tab may be ahead of it while loading).
  const roleLabel = data ? STAFF_ROLE_LABELS[data.role] : "";

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`nhan-vien-${data.role}`, scope.fileScope, data.range.from, data.range.to), [
      toSheet(STAFF_ROLE_LABELS[data.role], columns, data.rows, {
        id: null,
        name: "Tổng",
        username: null,
        branchCode: null,
        ...data.totals,
      }),
    ]);
  };

  const t = data?.totals;
  const chartRows = (data?.rows ?? [])
    .filter((row) => row.id !== null)
    .map((row) => ({
      name: staffName(row) + (scope.chain && row.branchCode ? ` · ${row.branchCode.toUpperCase()}` : ""),
      value: row.revenue,
    }));

  return (
    <>
      <PageHeader
        title="Nhân viên"
        description={scope.name}
        info={`Mỗi hóa đơn được tính trọn cho CSKH, phục vụ và thu ngân của nó. Doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} periods={false} />
      <Tabs value={role} onValueChange={(value) => setRole(value as StaffRole)}>
        <TabsList>
          {STAFF_ROLES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {STAFF_ROLE_LABELS[r]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : t.orderCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={UsersIcon}
              title="Chưa có hóa đơn"
              description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
            />
          </CardContent>
        </Card>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          {chartRows.some((row) => row.value > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 {roleLabel}</CardTitle>
                <CardDescription>Theo doanh thu chưa VAT (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <RankingChart rows={chartRows} label="Doanh thu" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{roleLabel}</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Dòng &quot;{UNASSIGNED_STAFF}&quot; gom các hóa đơn không ghi {roleLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>Giờ phòng</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.lg)}>Tiền giờ</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.lg)}>Tiền hàng</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>TB/HĐ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id ?? "none"}>
                      <TableCell className="font-medium">
                        <div className={cn(row.id === null && "text-muted-foreground")}>{staffName(row)}</div>
                        {row.username && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {row.username}
                            {scope.chain && row.branchCode && ` · ${row.branchCode.toUpperCase()}`}
                          </div>
                        )}
                      </TableCell>
                      <MetricCells m={row} />
                    </TableRow>
                  ))}
                </TableBody>
                {data.rows.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Tổng</TableCell>
                      <MetricCells m={t} />
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

export default function StaffReportPage() {
  return (
    <Suspense>
      <StaffView />
    </Suspense>
  );
}
