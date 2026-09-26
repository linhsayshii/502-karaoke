"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { formatMoney, formatTime, toDateInput } from "@/lib/format";
import type { Order } from "@/lib/types";

interface DailyStat {
  date: string;
  orderCount: number;
  totalRevenue: number;
}

// Revenue per business day (11:30 → 06:00 next morning).
export default function StatisticsPage() {
  const branch = useBranchCode();
  const { branches } = useAuth();
  const notify = useNotify();
  const branchName = branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase();

  const [from, setFrom] = useState(() => toDateInput());
  const [to, setTo] = useState(() => toDateInput());
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

  const totalOrders = data.reduce((sum, d) => sum + d.orderCount, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.totalRevenue, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Thống kê kinh doanh – {branchName}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Báo cáo doanh thu theo ngày kinh doanh</CardTitle>
          <p className="text-sm text-muted-foreground">
            Một ngày kinh doanh tính từ 11:30 đến 06:00 sáng hôm sau; chỉ tính hóa đơn đã thanh toán.
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
                <TableHead>Số hóa đơn</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead>Chi tiết</TableHead>
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
                  <TableCell>{item.orderCount}</TableCell>
                  <TableCell className="text-right">{formatMoney(item.totalRevenue)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      Xem
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    Không có dữ liệu
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {data.length > 1 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-bold">Tổng</TableCell>
                  <TableCell className="font-bold">{totalOrders}</TableCell>
                  <TableCell className="text-right font-bold">{formatMoney(totalRevenue)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Hóa đơn ngày {selectedDate && new Date(`${selectedDate}T00:00:00`).toLocaleDateString("vi-VN")}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && <DailyDetails branch={branch} date={selectedDate} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DailyDetails({ branch, date }: { branch: string; date: string }) {
  const notify = useNotify();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Order[]>("/orders", { params: { branch, businessDate: date, status: "COMPLETED" } })
      .then((res) => setOrders(res.data))
      .catch((error) => notify.error(error, "Không thể tải danh sách hóa đơn"))
      .finally(() => setLoading(false));
  }, [branch, date, notify]);

  if (loading) return <div>Đang tải chi tiết...</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã HĐ</TableHead>
          <TableHead>Phòng</TableHead>
          <TableHead>Giờ vào</TableHead>
          <TableHead>Giờ ra</TableHead>
          <TableHead>CSKH / Phục vụ</TableHead>
          <TableHead className="text-right">Tiền giờ</TableHead>
          <TableHead className="text-right">Tiền hàng</TableHead>
          <TableHead className="text-right">Thành tiền</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>#{order.id}</TableCell>
            <TableCell>{order.room?.name}</TableCell>
            <TableCell>{formatTime(order.startTime)}</TableCell>
            <TableCell>{formatTime(order.endTime)}</TableCell>
            <TableCell className="text-sm">
              {order.cskh?.fullName ?? "—"} / {order.server?.fullName ?? "—"}
            </TableCell>
            <TableCell className="text-right">{formatMoney(order.hourlyFee)}</TableCell>
            <TableCell className="text-right">{formatMoney(order.totalProductPrice)}</TableCell>
            <TableCell className="text-right font-medium">{formatMoney(order.finalAmount)}</TableCell>
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
  );
}
