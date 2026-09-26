"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ReceiptTextIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { BillSheet, ORDER_STATUS_BADGE } from "@/components/sales/bill-sheet";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, formatDuration, formatMoney, formatNumber, formatTime, minutesBetween } from "@/lib/format";
import { BUSINESS_DAY_HINT, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { SHOW_FROM } from "@/lib/responsive";
import type { Order, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "ALL";
type StatusFilter = Exclude<OrderStatus, "PENDING"> | typeof ALL;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = [SHOW_FROM.xs, "", SHOW_FROM.sm, SHOW_FROM.md, SHOW_FROM.lg, SHOW_FROM.sm, "", ""];

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
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Order[]>("/orders", { params: { branch, ...range } });
      setOrders(res.data.filter((o) => o.status !== "PENDING"));
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
  const shown = useMemo(
    () =>
      (orders ?? []).filter(
        (o) =>
          (status === ALL || o.status === status) &&
          (!keyword || String(o.id) === keyword || (o.room?.name ?? "").toLowerCase().includes(keyword)),
      ),
    [orders, status, keyword],
  );
  const paid = (orders ?? []).filter((o) => o.status === "COMPLETED");
  const revenue = paid.reduce((sum, o) => sum + Number(o.finalAmount), 0);
  const cancelledCount = (orders ?? []).length - paid.length;

  return (
    <>
      <PageHeader
        title="Hóa đơn"
        description={`Hóa đơn đã thanh toán hoặc đã hủy, theo ngày kinh doanh lúc thanh toán/hủy. ${BUSINESS_DAY_HINT}`}
        actions={<DateRangePicker value={range} onChange={setRange} align="end" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>{formatDateRange(range)}</CardTitle>
          <CardDescription>
            {paid.length} hóa đơn đã thanh toán · doanh thu {formatMoney(revenue)}
            {cancelledCount > 0 && ` · ${cancelledCount} hóa đơn đã hủy`}
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
                placeholder="Tìm phòng hoặc mã hóa đơn"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm hóa đơn"
              />
            </InputGroup>
          </div>

          <div className={cn("transition-opacity", loading && orders && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={SHOW_FROM.xs}>Mã</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Giờ vào – ra</TableHead>
                  <TableHead className={SHOW_FROM.md}>Thời lượng</TableHead>
                  <TableHead className={SHOW_FROM.lg}>CSKH / Phục vụ</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Hình thức</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!orders ? (
                  <TableSkeleton columns={COLUMNS} />
                ) : shown.length === 0 ? (
                  <TableEmpty
                    colSpan={8}
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
                      <TableCell className={cn("font-medium", SHOW_FROM.xs)}>#{order.id}</TableCell>
                      <TableCell>{order.room?.name ?? "—"}</TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>
                        {formatTime(order.startTime)} – {formatTime(order.endTime)}
                      </TableCell>
                      <TableCell className={SHOW_FROM.md}>
                        {order.endTime ? formatDuration(minutesBetween(order.startTime, new Date(order.endTime))) : "—"}
                      </TableCell>
                      <TableCell className={cn("max-w-48 truncate", SHOW_FROM.lg)}>
                        {[order.cskh?.fullName, order.server?.fullName].filter(Boolean).join(" / ") || "—"}
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
