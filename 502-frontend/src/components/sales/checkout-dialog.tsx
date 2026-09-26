"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import api, { apiErrorMessage } from "@/lib/api";
import { formatMoney, formatTime } from "@/lib/format";
import type { BillPreview } from "@/lib/types";

interface CheckoutDialogProps {
  orderId: number | null;
  roomName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckedOut: () => void;
}

// Shows the live bill from the server and closes it on confirmation.
export function CheckoutDialog({
  orderId,
  roomName,
  open,
  onOpenChange,
  onCheckedOut,
}: CheckoutDialogProps) {
  const { toast } = useToast();
  const [bill, setBill] = useState<BillPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setBill(null);
    api
      .get<BillPreview>(`/orders/${orderId}/preview`)
      .then((res) => {
        if (!cancelled) setBill(res.data);
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          title: "Lỗi",
          description: apiErrorMessage(error, "Không thể lấy thông tin thanh toán"),
          variant: "destructive",
        });
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId, toast, onOpenChange]);

  const confirm = async () => {
    if (!orderId) return;
    setSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/checkout`);
      toast({ title: "Đã thanh toán", description: `Phòng ${roomName ?? ""} đã trả phòng.` });
      onOpenChange(false);
      onCheckedOut();
    } catch (error) {
      toast({
        title: "Lỗi thanh toán",
        description: apiErrorMessage(error, "Không thể thanh toán hóa đơn"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const adjustments: [string, number, string][] = bill
    ? [
        ["Giảm giá dịch vụ", -Number(bill.discountAmount), ""],
        ["Giảm giá giờ hát", -Number(bill.hourlyDiscountAmount), ""],
        ["Phí dịch vụ", Number(bill.serviceFeeAmount), ""],
        ["Thuế", bill.taxAmount, bill.taxPercent ? `${bill.taxPercent}%` : ""],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Thanh toán phòng {roomName}</DialogTitle>
          <DialogDescription>Kiểm tra lại hóa đơn trước khi thanh toán.</DialogDescription>
        </DialogHeader>

        {!bill ? (
          <p className="py-8 text-center text-muted-foreground">Đang tính tiền...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg bg-slate-50 p-4 space-y-1">
                <div className="flex justify-between">
                  <span>Giờ vào – ra:</span>
                  <span className="font-medium">
                    {formatTime(bill.startTime)} – {formatTime(bill.endTime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Thời gian:</span>
                  <span className="font-medium">{bill.durationMinutes} phút</span>
                </div>
                <div className="flex justify-between">
                  <span>Tiền giờ:</span>
                  <span className="font-medium">{formatMoney(bill.hourlyFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tiền dịch vụ:</span>
                  <span className="font-medium">{formatMoney(bill.totalProductPrice)}</span>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 space-y-1">
                {adjustments
                  .filter(([, amount]) => amount !== 0)
                  .map(([label, amount, note]) => (
                    <div key={label} className="flex justify-between">
                      <span>
                        {label} {note && <span className="text-muted-foreground">({note})</span>}:
                      </span>
                      <span className="font-medium">{formatMoney(amount)}</span>
                    </div>
                  ))}
                <div className="flex justify-between pt-2 text-lg font-bold text-red-600">
                  <span>Thành tiền:</span>
                  <span>{formatMoney(bill.finalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="max-h-[40vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên món</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">SL</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product.name}</TableCell>
                      <TableCell className="text-right">{formatMoney(item.price)}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(Number(item.price) * item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {bill.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Không có dịch vụ nào
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            onClick={confirm}
            disabled={!bill || submitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {submitting ? "Đang xử lý..." : "Xác nhận thanh toán"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
