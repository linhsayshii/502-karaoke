"use client";

import { Suspense } from "react";
import { PackageIcon } from "lucide-react";
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
import { formatAmount, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_CATEGORY } from "@/lib/labels";
import { PRODUCT_GROUPS, reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { ProductGroup, ProductReport, ProductReportRow, ProductSales } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const GROUP_LABELS: Record<ProductGroup, string> = { product: "Theo món", category: "Theo danh mục" };

// A category row with id null: the products without a category.
const rowName = (row: ProductReportRow) => row.name ?? (row.id === null ? NO_CATEGORY : "");

function columnsFor(by: ProductGroup): ExportColumn<ProductReportRow>[] {
  return [
    { header: by === "product" ? "Món" : "Danh mục", value: rowName },
    ...(by === "product"
      ? [
          { header: "Danh mục", value: (r: ProductReportRow) => (r.id === null ? null : (r.categoryName ?? NO_CATEGORY)) },
          { header: "Đơn vị", value: (r: ProductReportRow) => r.unit },
        ]
      : []),
    { header: "Cơ sở", value: (r) => r.branchCode?.toUpperCase() ?? null },
    { header: "Số lượng", type: "number", value: (r) => r.quantity },
    { header: "Thành tiền", type: "money", value: (r) => r.gross },
    { header: "Giảm giá phân bổ", type: "money", value: (r) => r.discount },
    { header: "Doanh thu thuần (chưa VAT)", type: "money", value: (r) => r.net },
    { header: "Giá vốn", type: "money", value: (r) => r.cost },
    { header: "Lãi gộp", type: "money", value: (r) => r.grossProfit },
    { header: "% biên", type: "percent", value: (r) => r.margin },
    { header: "Tỷ trọng", type: "percent", value: (r) => r.share },
  ];
}

function SalesCells({ m, share }: { m: ProductSales; share: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.quantity)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.gross)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.discount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.net)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatAmount(m.cost)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatAmount(m.grossProfit)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatPercent(m.margin)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatPercent(share)}</TableCell>
    </>
  );
}

// Sales per product or category. A bill's product discount is spread over
// its lines in proportion to their amounts, so the net adds up to the
// revenue report's product sales after discount.
function ProductsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [by, setBy] = useReportOption<ProductGroup>("by", PRODUCT_GROUPS, "product");
  const { data, loading } = useApiData<ProductReport | null>(
    "/reports/products",
    { ...rangeParams(branch, filters), by },
    null,
    "Không thể tải báo cáo hàng hóa",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`hang-hoa-${data.by}`, scope.fileScope, data.range.from, data.range.to), [
      // id null + a name: rowName() shows "Tổng", the category column stays empty.
      toSheet(GROUP_LABELS[data.by], columnsFor(data.by), data.rows, {
        id: null,
        name: "Tổng",
        unit: null,
        categoryName: null,
        branchCode: null,
        share: data.totals.net ? 1 : null,
        ...data.totals,
      }),
    ]);
  };

  const t = data?.totals;
  const chartRows = (data?.rows ?? [])
    .filter((row) => row.id !== null)
    .map((row) => ({
      name: rowName(row) + (scope.chain && row.branchCode ? ` · ${row.branchCode.toUpperCase()}` : ""),
      value: row.net,
    }));

  return (
    <>
      <PageHeader
        title="Hàng hóa"
        description={`${scope.name} · Doanh thu thuần = thành tiền − giảm giá của hóa đơn phân bổ theo tỷ lệ tiền từng món; chưa gồm VAT. Giá vốn là giá bình quân lúc bán. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} periods={false} />
      <Tabs value={by} onValueChange={(value) => setBy(value as ProductGroup)}>
        <TabsList>
          {PRODUCT_GROUPS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUP_LABELS[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-5">
            <StatTile label="Doanh thu thuần (chưa VAT)" value={formatMoney(t.net)} footer="Tiền hàng sau giảm giá" />
            <StatTile
              label="Lãi gộp"
              value={formatMoney(t.grossProfit)}
              footer={`Giá vốn ${formatMoney(t.cost)} · biên ${formatPercent(t.margin)}`}
            />
            <StatTile label="Thành tiền" value={formatMoney(t.gross)} footer="Số lượng × đơn giá" />
            <StatTile label="Giảm giá" value={formatMoney(t.discount)} footer="Giảm tiền hàng của các hóa đơn" />
            <StatTile label="Số lượng bán" value={formatNumber(t.quantity)} footer={`${data.rows.length} ${data.by === "product" ? "món" : "danh mục"}`} />
          </div>

          {data.rows.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={PackageIcon}
                  title="Chưa bán món nào"
                  description={`Không có món nào trên hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {chartRows.some((row) => row.value > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top 10 {data.by === "product" ? "món" : "danh mục"}</CardTitle>
                    <CardDescription>Theo doanh thu thuần chưa VAT (đồng)</CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <RankingChart rows={chartRows} label="Doanh thu thuần" />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{GROUP_LABELS[data.by]}</CardTitle>
                  <CardDescription>{formatDateRange(data.range)} · Tỷ trọng trên doanh thu thuần.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{data.by === "product" ? "Món" : "Danh mục"}</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.xs)}>SL</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.lg)}>Thành tiền</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                        <TableHead className="text-right">Doanh thu</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.md)}>Giá vốn</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.sm)}>Lãi gộp</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.md)}>% biên</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.lg)}>Tỷ trọng</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row) => (
                        <TableRow key={row.id ?? "none"}>
                          <TableCell className="font-medium">
                            <div className={cn(row.id === null && "text-muted-foreground")}>{rowName(row)}</div>
                            <div className="text-xs font-normal text-muted-foreground">
                              {[
                                data.by === "product" ? (row.categoryName ?? NO_CATEGORY) : null,
                                data.by === "product" ? row.unit : null,
                                scope.chain ? row.branchCode?.toUpperCase() : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </TableCell>
                          <SalesCells m={row} share={row.share} />
                        </TableRow>
                      ))}
                    </TableBody>
                    {data.rows.length > 1 && (
                      <TableFooter>
                        <TableRow>
                          <TableCell>Tổng</TableCell>
                          <SalesCells m={t} share={t.net ? 1 : null} />
                        </TableRow>
                      </TableFooter>
                    )}
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

export default function ProductsReportPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
