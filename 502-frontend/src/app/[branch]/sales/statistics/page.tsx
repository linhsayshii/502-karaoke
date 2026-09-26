"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChartColumnBigIcon, ChevronRightIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, firstDayOfMonth, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { SHOW_FROM } from "@/lib/responsive";
import type { DailyStat } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = {
  cash: { label: PAYMENT_METHOD_LABELS.CASH, color: "var(--chart-1)" },
  transfer: { label: PAYMENT_METHOD_LABELS.TRANSFER, color: "var(--chart-2)" },
} satisfies ChartConfig;

const NUM = "text-right tabular-nums";
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

type Totals = Omit<DailyStat, "date">;

function StatTile({ label, value, footer }: { label: string; value: string; footer: React.ReactNode }) {
  return (
    <Card className="@container/card gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>
    </Card>
  );
}

// Revenue of paid bills per business day of payment (06:00 → 06:00). The
// fund's sales receipts cover exactly the same bills.
export default function StatisticsPage() {
  const branch = useBranchCode();
  const { branches } = useAuth();
  const notify = useNotify();
  const branchName = branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase();

  const [range, setRange] = useState<DateRangeValue>(() => ({ from: firstDayOfMonth(), to: businessDate() }));
  const [data, setData] = useState<DailyStat[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DailyStat[]>("/orders/statistics", { params: { branch, ...range } });
      setData(res.data);
    } catch (error) {
      notify.error(error, "Không thể tải báo cáo doanh thu");
    } finally {
      setLoading(false);
    }
  }, [branch, range, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(
    () =>
      (data ?? []).reduce<Totals>(
        (sum, d) => {
          for (const key of Object.keys(sum) as (keyof Totals)[]) sum[key] += d[key];
          return sum;
        },
        {
          orderCount: 0,
          totalRevenue: 0,
          hourlyFee: 0,
          productRevenue: 0,
          discount: 0,
          serviceFee: 0,
          tax: 0,
          cash: 0,
          transfer: 0,
        },
      ),
    [data],
  );

  const billsHref = (from: string, to: string) => `/${branch}/sales/statistics/bills?from=${from}&to=${to}`;
  // Days with sales, newest first (the chart shows every day of the range).
  const days = [...(data ?? [])].filter((d) => d.orderCount > 0).reverse();
  const average = totals.orderCount ? Math.round(totals.totalRevenue / totals.orderCount) : 0;
  const share = (part: number) => (totals.totalRevenue ? Math.round((part / totals.totalRevenue) * 100) : 0);

  return (
    <>
      <PageHeader
        title="Doanh thu"
        description={`${branchName} · ${BUSINESS_DAY_HINT} Tính theo giờ thanh toán; hóa đơn đã hủy không được tính.`}
        actions={<DateRangePicker value={range} onChange={setRange} align="end" />}
      />

      {!data ? (
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
            <StatTile
              label="Doanh thu"
              value={formatMoney(totals.totalRevenue)}
              footer={`Tiền mặt ${formatMoney(totals.cash)} · CK ${formatMoney(totals.transfer)}`}
            />
            <StatTile
              label="Hóa đơn đã thanh toán"
              value={formatNumber(totals.orderCount)}
              footer={`Trung bình ${formatMoney(average)} / hóa đơn`}
            />
            <StatTile
              label="Tiền giờ"
              value={formatMoney(totals.hourlyFee)}
              footer={`${share(totals.hourlyFee)}% doanh thu · giảm giá ${formatMoney(totals.discount)}`}
            />
            <StatTile
              label="Tiền món"
              value={formatMoney(totals.productRevenue)}
              footer={`Phí dịch vụ ${formatMoney(totals.serviceFee)} · thuế ${formatMoney(totals.tax)}`}
            />
          </div>

          {data.length > 1 && totals.orderCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu theo ngày</CardTitle>
                <CardDescription>{formatDateRange(range)} · chia theo hình thức thanh toán (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
                  <BarChart data={data} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={16}
                      tickFormatter={(value: string) => formatDate(value).slice(0, 5)}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(value: number) => compact.format(value)}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent indicator="line" labelFormatter={(value) => formatDate(String(value))} />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="cash"
                      stackId="revenue"
                      fill="var(--color-cash)"
                      stroke="var(--card)"
                      strokeWidth={2}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="transfer"
                      stackId="revenue"
                      fill="var(--color-transfer)"
                      stroke="var(--card)"
                      strokeWidth={2}
                      maxBarSize={24}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết theo ngày</CardTitle>
              <CardDescription>Các ngày có doanh thu; bấm mũi tên để xem hóa đơn của ngày đó.</CardDescription>
            </CardHeader>
            <CardContent>
              {totals.orderCount === 0 ? (
                <EmptyState
                  icon={ChartColumnBigIcon}
                  title="Chưa có doanh thu"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền giờ</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền món</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Phí DV + thuế</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tiền mặt</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Chuyển khoản</TableHead>
                      <TableHead className="text-right">Doanh thu</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {days.map((day) => (
                      <TableRow key={day.date} className={cn(day.orderCount === 0 && "text-muted-foreground")}>
                        <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{day.orderCount}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(day.hourlyFee)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(day.productRevenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(day.discount)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>
                          {formatNumber(day.serviceFee + day.tax)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(day.cash)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(day.transfer)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatNumber(day.totalRevenue)}
                        </TableCell>
                        <TableCell className="px-1">
                          {day.orderCount > 0 && (
                            <Button variant="ghost" size="icon-sm" asChild>
                              <Link
                                href={billsHref(day.date, day.date)}
                                aria-label={`Hóa đơn ngày ${formatDate(day.date)}`}
                              >
                                <ChevronRightIcon />
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {days.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{totals.orderCount}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(totals.hourlyFee)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(totals.productRevenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(totals.discount)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>
                          {formatNumber(totals.serviceFee + totals.tax)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(totals.cash)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(totals.transfer)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(totals.totalRevenue)}</TableCell>
                        <TableCell className="px-1">
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={billsHref(range.from, range.to)} aria-label="Tất cả hóa đơn trong kỳ">
                              <ChevronRightIcon />
                            </Link>
                          </Button>
                        </TableCell>
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
