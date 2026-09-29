"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReceiptTextIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { ExportExcelButton } from "@/components/export-excel-button";
import { PageHeader } from "@/components/layout/page-header";
import { BillSheet, ORDER_STATUS_BADGE } from "@/components/sales/bill-sheet";
import { useNotify } from "@/hooks/use-notify";
import api, { totalCountOf } from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { billLabel, businessDate, formatClock, formatMoney, formatNumber, formatTime, minutesBetween } from "@/lib/format";
import { BUSINESS_DAY_HINT, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { billsSheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { Order, OrderStatus, OrderSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";
type StatusFilter = Exclude<OrderStatus, "PENDING"> | typeof ALL;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A whole số hóa đơn (DDMM + room + sequence) is looked up over every day.
const FULL_BILL_NUMBER_RE = /^\d{11,}$/;
const COLUMNS = [SHOW_FROM.xs, "", SHOW_FROM.sm, SHOW_FROM.md, SHOW_FROM.lg, SHOW_FROM.lg, SHOW_FROM.sm, "", ""];

// Closed bills (paid or cancelled) of a period, by business day of payment /
// cancellation — the same days as Doanh thu and Sổ quỹ.
function BillsView() {
  const branch = useBranchCode();
  const notify = useNotify();
  const searchParams = useSearchParams();
  const [range, setRange] = useState<DateRangeValue>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const today = businessDate();
    return from && to && DATE_RE.test(from) && DATE_RE.test(to) ? { from, to } : { from: today, to: today };
  });
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  // How many bills the period has in all; the list holds the newest 1000.
  const [total, setTotal] = useState<number | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { branch, ...range };
      const [res, totals] = await Promise.all([
        api.get<Order[]>("/orders", { params }),
        api.get<OrderSummary>("/orders/summary", { params }),
      ]);
      setOrders(res.data.filter((o) => o.status !== "PENDING"));
      setTotal(totalCountOf(res));
      setSummary(totals.data);
    } catch (error) {
      notify.error(error, "Không thể tải danh sách hóa đơn");
    } finally {
      setLoading(false);
    }
  }, [branch, range, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const keyword = search.trim().toLowerCase().replace(/^#/, "");
  const numberQuery = FULL_BILL_NUMBER_RE.test(keyword) ? keyword : null;

  // Bills with that number, whatever the selected period.
  const [found, setFound] = useState<Order[] | null>(null);
  useEffect(() => {
    setFound(null);
    if (!numberQuery) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<Order[]>("/orders", { params: { branch, billNumber: numberQuery } })
        .then((res) => !cancelled && setFound(res.data.filter((o) => o.status !== "PENDING")))
        .catch((error) => {
          if (cancelled) return;
          notify.error(error, "Không thể tìm hóa đơn");
          setFound([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [branch, numberQuery, notify]);

  const listed = numberQuery ? found : orders;
  const shown = useMemo(
    () =>
      (listed ?? []).filter(
        (o) =>
          (status === ALL || o.status === status) &&
          (!keyword ||
            numberQuery ||
            String(o.id) === keyword ||
            (o.billNumber ?? "").includes(keyword) ||
            (o.room?.name ?? "").toLowerCase().includes(keyword)),
      ),
    [listed, status, keyword, numberQuery],
  );

  // The bills as filtered on screen, with every column of the bill.
  const exportExcel = async () => {
    const name = numberQuery
      ? `hoa-don_${branch}_${numberQuery}.xlsx`
      : reportFileName("hoa-don", branch, range.from, range.to);
    await exportWorkbook(name, [billsSheet(shown)]);
    if (!numberQuery && orders && total !== null && total > orders.length) {
      toast.warning(
        `File chỉ gồm ${formatNumber(orders.length)} / ${formatNumber(total)} hóa đơn mới nhất; chọn khoảng ngày ngắn hơn để có đủ.`,
      );
    }
  };

  return (
    <>
      <PageHeader
        title="Hóa đơn"
        info={`Hóa đơn đã thanh toán hoặc đã hủy, theo ngày kinh doanh lúc thanh toán/hủy. ${BUSINESS_DAY_HINT}`}
        actions={
          <>
            <ExportExcelButton onExport={listed && shown.length > 0 ? exportExcel : undefined} />
            <DateRangePicker value={range} onChange={setRange} align="end" />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{numberQuery ? `Số hóa đơn ${numberQuery}` : formatDateRange(range)}</CardTitle>
          <CardDescription>
            {numberQuery ? (
              "Kết quả tìm trên mọi ngày, không theo khoảng thời gian đã chọn"
            ) : summary ? (
              // Summed by the server over every bill of the period, not only the listed ones.
              <>
                {formatNumber(summary.paidCount)} hóa đơn đã thanh toán · doanh thu{" "}
                {formatMoney(summary.collected - summary.vat)} · VAT {formatMoney(summary.vat)} · tổng thu{" "}
                {formatMoney(summary.collected)}
                {summary.cancelledCount > 0 && ` · ${formatNumber(summary.cancelledCount)} hóa đơn đã hủy`}
              </>
            ) : (
              "Đang tính tổng…"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={status}
              onValueChange={(value) => value && setStatus(value as StatusFilter)}
              aria-label="Trạng thái"
            >
              <ToggleGroupItem value={ALL}>Tất cả</ToggleGroupItem>
              <ToggleGroupItem value="COMPLETED">{ORDER_STATUS_LABELS.COMPLETED}</ToggleGroupItem>
              <ToggleGroupItem value="CANCELLED">{ORDER_STATUS_LABELS.CANCELLED}</ToggleGroupItem>
            </ToggleGroup>
            <InputGroup className="sm:ml-auto sm:max-w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Tìm phòng hoặc số hóa đơn"
                inputMode="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm hóa đơn"
              />
            </InputGroup>
          </div>

          {!numberQuery && orders && (
            <ListLimitNotice
              shown={orders.length}
              total={total}
              noun="hóa đơn"
              hint="Dòng tổng ở trên vẫn tính đủ mọi hóa đơn của khoảng này. Lọc trạng thái và tìm phòng chỉ tìm trong các hóa đơn đang hiển thị; chọn khoảng ngày ngắn hơn, hoặc gõ đủ số hóa đơn để tìm trên mọi ngày."
            />
          )}

          <div className={cn("transition-opacity", !numberQuery && loading && orders && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={SHOW_FROM.xs}>Số hóa đơn</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Giờ vào – ra</TableHead>
                  <TableHead className={SHOW_FROM.md}>Thời lượng</TableHead>
                  <TableHead className={SHOW_FROM.lg}>CSKH</TableHead>
                  <TableHead className={SHOW_FROM.lg}>Phục vụ</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Hình thức</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!listed ? (
                  <TableSkeleton columns={COLUMNS} />
                ) : shown.length === 0 ? (
                  <TableEmpty
                    colSpan={9}
                    icon={ReceiptTextIcon}
                    title="Không có hóa đơn"
                    description="Không có hóa đơn nào khớp với bộ lọc trong khoảng thời gian này."
                  />
                ) : (
                  shown.map((order) => (
                    <TableRow
                      key={order.id}
                      className={cn("cursor-pointer", order.status === "CANCELLED" && "text-muted-foreground")}
                      onClick={() => setSelectedId(order.id)}
                    >
                      <TableCell className={cn("font-medium tabular-nums", SHOW_FROM.xs)}>{billLabel(order)}</TableCell>
                      <TableCell>
                        {order.room?.name ?? "—"}
                        <div className="text-xs text-muted-foreground tabular-nums @sm/main:hidden">
                          {billLabel(order)}
                        </div>
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>
                        {formatTime(order.startTime)} – {formatTime(order.endTime)}
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.md)}>
                        {order.endTime ? formatClock(minutesBetween(order.startTime, new Date(order.endTime))) : "—"}
                      </TableCell>
                      <TableCell className={cn("max-w-40 truncate", SHOW_FROM.lg)}>
                        {order.cskh?.fullName ?? "—"}
                      </TableCell>
                      <TableCell className={cn("max-w-40 truncate", SHOW_FROM.lg)}>
                        {order.server?.fullName ?? "—"}
                      </TableCell>
                      <TableCell className={SHOW_FROM.sm}>
                        {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          order.status === "CANCELLED" && "line-through",
                        )}
                      >
                        {formatNumber(order.finalAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <BillSheet orderId={selectedId} onOpenChange={(open) => !open && setSelectedId(null)} onChanged={load} />
    </>
  );
}

export default function BillsPage() {
  return (
    <Suspense>
      <BillsView />
    </Suspense>
  );
}
