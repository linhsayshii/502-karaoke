"use client";

import { useEffect, useState } from "react";
import { BanknoteIcon, CreditCardIcon, LandmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LineItemsTable } from "@/components/line-items-table";
import { BillSummary } from "@/components/sales/bill-summary";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { billLabel, formatDuration, formatMoney, formatTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import type { BillPreview, Order, PaymentMethod } from "@/lib/types";

interface CheckoutDialogProps {
  orderId: number | null;
  roomName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckedOut: () => void;
}

// Shows the bill computed by the server and closes it: the server bills the
// same numbers, deducts stock and writes the fund receipt.
export function CheckoutDialog({ orderId, roomName, open, onOpenChange, onCheckedOut }: CheckoutDialogProps) {
  const notify = useNotify();
  const [bill, setBill] = useState<BillPreview | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setBill(null);
    setMethod("CASH");
    api
      .get<BillPreview>(`/orders/${orderId}/preview`)
      .then((res) => {
        if (!cancelled) setBill(res.data);
      })
      .catch((error) => {
        if (cancelled) return;
        notify.error(error, "Không thể lấy thông tin thanh toán");
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId, notify, onOpenChange]);

  const confirm = async () => {
    if (!orderId) return;
    setSubmitting(true);
    try {
      const res = await api.post<Order>(`/orders/${orderId}/checkout`, { paymentMethod: method });
      notify.success(
        `Đã thanh toán phòng ${roomName ?? ""} (${PAYMENT_METHOD_LABELS[method].toLowerCase()}) · hóa đơn ${billLabel(res.data)}`,
      );
      onOpenChange(false);
      onCheckedOut();
    } catch (error) {
      notify.error(error, "Không thể thanh toán hóa đơn");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Thanh toán phòng {roomName}</DialogTitle>
          <DialogDescription>
            {bill
              ? `Giờ vào ${formatTime(bill.startTime)} · giờ ra ${formatTime(bill.endTime)} · ${formatDuration(bill.durationMinutes)}`
              : "Đang tính tiền..."}
          </DialogDescription>
        </DialogHeader>

        {!bill ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <LineItemsTable
              className="max-h-56 overflow-auto"
              items={bill.items.map((item) => ({ ...item, name: item.product.name, unit: item.product.unit }))}
              emptyText="Không gọi món nào"
            />

            <BillSummary bill={bill} percents={bill} pricePerHour={Number(bill.pricePerHour)} />

            <Separator />

            <Field orientation="horizontal" className="flex-wrap justify-between gap-3">
              <FieldLabel className="flex-none">
                <CreditCardIcon className="size-4 text-muted-foreground" />
                Hình thức thanh toán
              </FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={method}
                onValueChange={(value) => value && setMethod(value as PaymentMethod)}
                aria-label="Hình thức thanh toán"
              >
                <ToggleGroupItem value="CASH">
                  <BanknoteIcon />
                  {PAYMENT_METHOD_LABELS.CASH}
                </ToggleGroupItem>
                <ToggleGroupItem value="TRANSFER">
                  <LandmarkIcon />
                  {PAYMENT_METHOD_LABELS.TRANSFER}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Đóng
          </Button>
          <Button onClick={confirm} disabled={!bill || submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            Thu {bill ? formatMoney(bill.finalAmount) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
