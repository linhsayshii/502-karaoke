"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, formatMoney, formatTime } from "@/lib/format";
import { BUSINESS_DAY_HINT, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { DailyStat, Order } from "@/lib/types";

// Revenue per business day of payment (06:00 → 06:00 next morning). The
// fund's sales receipts cover exactly the same bills.
export default function StatisticsPage() {
  const branch = useBranchCode();
  const { branches } = useAuth();
  const notify = useNotify();
  const branchName = branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase();

  const [from, setFrom] = useState(() => businessDate());
  const [to, setTo] = useState(() => businessDate());
  const [data, setData] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DailyStat[]>("/orders/statistics", { params: { branch, from, to } });
      setData(res.data);
    } catch (error) {
      notify.error(error, "Không thể tải báo cáo doanh thu");
      setData([]);
    } finally {
      setLoading(false);
    }
    // Only reload automatically when the branch changes; dates wait for the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, notify]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sum = (key: keyof Omit<DailyStat, "date">) => data.reduce((s, d) => s + d[key], 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Thống kê kinh doanh – {branchName}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Báo cáo doanh thu theo ngày kinh doanh</CardTitle>
          <p className="text-sm text-muted-foreground">
            {BUSINESS_DAY_HINT} Chỉ tính hóa đơn đã thanh toán, theo giờ thanh toán; hóa đơn đã hủy không được tính.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Từ</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div className="flex items-center gap-2">
              <span>Đến</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? "Đang tải..." : "Xem báo cáo"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead className="text-right">Số hóa đơn</TableHead>
                <TableHead className="text-right">Tiền giờ</TableHead>
                <TableHead className="text-right">Tiền món</TableHead>
                <TableHead className="text-right">Tiền mặt</TableHead>
                <TableHead className="text-right">Chuyển khoản</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow
                  key={item.date}
                  onClick={() => setSelectedDate(item.date)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <TableCell>{new Date(`${item.date}T00:00:00`).toLocaleDateString("vi-VN")}</TableCell>
                  <TableCell className="text-right">{item.orderCount}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.hourlyFee)}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.productRevenue)}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.cash)}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.transfer)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(item.totalRevenue)}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    Không có dữ liệu
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {data.length > 1 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-bold">Tổng</TableCell>
                  <TableCell className="text-right font-bold">{sum("orderCount")}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(sum("hourlyFee"))}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(sum("productRevenue"))}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(sum("cash"))}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(sum("transfer"))}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(sum("totalRevenue"))}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-h-[80vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Hóa đơn ngày {selectedDate && new Date(`${selectedDate}T00:00:00`).toLocaleDateString("vi-VN")}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && <DailyDetails branch={branch} date={selectedDate} onChanged={fetchData} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DailyDetails({ branch, date, onChanged }: { branch: string; date: string; onChanged: () => void }) {
  const notify = useNotify();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .get<Order[]>("/orders", { params: { branch, businessDate: date } })
      .then((res) => setOrders(res.data.filter((o) => o.status !== "PENDING")))
      .catch((error) => notify.error(error, "Không thể tải danh sách hóa đơn"))
      .finally(() => setLoading(false));
  }, [branch, date, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const voidBill = async () => {
    if (!voiding) return;
    if (!reason.trim()) {
      notify.error(null, "Vui lòng nhập lý do hủy");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/orders/${voiding.id}/void`, { reason: reason.trim() });
      notify.success(`Đã hủy hóa đơn #${voiding.id}, hàng đã hoàn kho và phiếu thu đã hủy`);
      setVoiding(null);
      load();
      onChanged();
    } catch (error) {
      notify.error(error, "Không thể hủy hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Đang tải chi tiết...</div>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã HĐ</TableHead>
            <TableHead>Phòng</TableHead>
            <TableHead>Giờ vào</TableHead>
            <TableHead>Giờ ra</TableHead>
            <TableHead>CSKH / Phục vụ</TableHead>
            <TableHead>Thanh toán</TableHead>
            <TableHead className="text-right">Thành tiền</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className={order.status === "CANCELLED" ? "opacity-60" : ""}>
              <TableCell>#{order.id}</TableCell>
              <TableCell>{order.room?.name}</TableCell>
              <TableCell>{formatTime(order.startTime)}</TableCell>
              <TableCell>{formatTime(order.endTime)}</TableCell>
              <TableCell className="text-sm">
                {order.cskh?.fullName ?? "—"} / {order.server?.fullName ?? "—"}
              </TableCell>
              <TableCell>
                {order.status === "CANCELLED" ? (
                  <Badge variant="outline" title={order.cancelReason ?? undefined}>
                    {ORDER_STATUS_LABELS.CANCELLED}
                  </Badge>
                ) : order.paymentMethod ? (
                  PAYMENT_METHOD_LABELS[order.paymentMethod]
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right font-medium">{formatMoney(order.finalAmount)}</TableCell>
              <TableCell className="text-right">
                {order.status === "COMPLETED" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => {
                      setVoiding(order);
                      setReason("");
                    }}
                  >
                    Hủy
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center">
                Không có hóa đơn nào
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={!!voiding} onOpenChange={(open) => !open && setVoiding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hủy hóa đơn #{voiding?.id}</DialogTitle>
            <DialogDescription>
              Hàng đã bán được hoàn lại kho, phiếu thu của hóa đơn bị hủy và doanh thu giảm{" "}
              {formatMoney(voiding?.finalAmount)}.
            </DialogDescription>
          </DialogHeader>
          <Input placeholder="Lý do hủy" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(null)}>
              Đóng
            </Button>
            <Button variant="destructive" onClick={voidBill} disabled={saving}>
              {saving ? "Đang hủy..." : "Hủy hóa đơn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
