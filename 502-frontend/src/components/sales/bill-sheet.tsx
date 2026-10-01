"use client";

import { useEffect, useState } from "react";
import { BanIcon, CircleAlertIcon, PencilIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth-provider";
import { LineItemsTable } from "@/components/line-items-table";
import { ReasonDialog } from "@/components/reason-dialog";
import { BillSummary } from "@/components/sales/bill-summary";
import { EditPaidBillDialog } from "@/components/sales/edit-paid-bill-dialog";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { billLabel, formatDateTime, formatMoney, minutesBetween } from "@/lib/format";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import type { Order } from "@/lib/types";

export const ORDER_STATUS_BADGE = {
  PENDING: "destructive",
  COMPLETED: "success",
  CANCELLED: "outline",
} as const;

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || "—"}</dd>
    </div>
  );
}

// A closed bill as it was stored, and (managers) correcting it — stock, fund
// receipt and revenue follow the new amounts — or voiding it: the sold goods
// go back to stock and its fund receipt is cancelled.
export function BillSheet({
  orderId,
  onOpenChange,
  onChanged,
}: {
  orderId: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  // Keep showing the last bill while the sheet animates closed.
  const [shownId, setShownId] = useState(orderId);
  if (orderId !== null && orderId !== shownId) setShownId(orderId);

  return (
    <Sheet open={orderId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        {shownId !== null && <BillDetail key={shownId} orderId={shownId} onChanged={onChanged} />}
      </SheetContent>
    </Sheet>
  );
}

function BillDetail({ orderId, onChanged }: { orderId: number; onChanged: () => void }) {
  const { user } = useAuth();
  const notify = useNotify();
  const [order, setOrder] = useState<Order | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Order>(`/orders/${orderId}`)
      .then((res) => !cancelled && setOrder(res.data))
      .catch((error) => !cancelled && notify.error(error, "Không thể tải hóa đơn"));
    return () => {
      cancelled = true;
    };
  }, [orderId, notify]);

  const voidBill = async (reason: string) => {
    if (!order) return;
    try {
      const res = await api.post<Order>(`/orders/${order.id}/void`, { reason });
      setOrder(res.data);
      notify.success(`Đã hủy hóa đơn ${billLabel(order)}: hàng đã hoàn kho, phiếu thu đã hủy`);
      onChanged();
    } catch (error) {
      notify.error(error, "Không thể hủy hóa đơn");
      return false;
    }
  };

  const minutes = order?.endTime ? minutesBetween(order.startTime, new Date(order.endTime)) : 0;
  // Voiding or correcting a bill never touches its e-invoices on Minvoice.
  const einvoiceCount = order?._count?.einvoices ?? 0;
  const einvoiceNote = einvoiceCount
    ? `Bill có ${einvoiceCount} hóa đơn điện tử (${order?._count?.issuedEinvoices ?? 0} đã xuất).`
    : null;

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="flex items-center gap-2">
          Hóa đơn {order ? billLabel(order) : `#${orderId}`}
          {order && <Badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>}
        </SheetTitle>
        <SheetDescription>
          {order
            ? `Phòng ${order.room?.name ?? "—"} · ${formatDateTime(order.endTime ?? order.startTime)}`
            : "Đang tải..."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {!order ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : (
          <>
            {order.status === "CANCELLED" && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>
                  Đã hủy lúc {formatDateTime(order.cancelledAt)}
                  {order.cancelledBy && ` bởi ${order.cancelledBy.fullName}`}
                </AlertTitle>
                <AlertDescription>
                  {order.cancelReason ?? "Không ghi lý do"}
                  {order.checkedOutBy && " · Hóa đơn đã thanh toán trước đó: hàng đã hoàn kho, phiếu thu đã hủy."}
                </AlertDescription>
              </Alert>
            )}

            {order.editedAt && (
              <Alert>
                <PencilIcon />
                <AlertTitle>
                  Đã sửa lúc {formatDateTime(order.editedAt)}
                  {order.editedBy && ` bởi ${order.editedBy.fullName}`}
                </AlertTitle>
                <AlertDescription>{order.editReason ?? "Không ghi lý do"}</AlertDescription>
              </Alert>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Meta label="Giờ vào">{formatDateTime(order.startTime)}</Meta>
              <Meta label="Giờ ra">{formatDateTime(order.endTime)}</Meta>
              <Meta label="CSKH">{order.cskh?.fullName}</Meta>
              <Meta label="Phục vụ">{order.server?.fullName}</Meta>
              <Meta label="Mở phòng">{order.createdBy?.fullName}</Meta>
              <Meta label="Thanh toán">{order.checkedOutBy?.fullName}</Meta>
              <Meta label="Hình thức">{order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : null}</Meta>
              <Meta label="Phiếu thu quỹ">
                {order.fundTransaction
                  ? `${formatMoney(order.fundTransaction.amount)}${order.fundTransaction.cancelledAt ? " (đã hủy)" : ""}`
                  : null}
              </Meta>
            </dl>

            <LineItemsTable
              items={order.items.map((item) => ({ ...item, name: item.product.name, unit: item.product.unit }))}
              emptyText="Không gọi món nào"
            />

            <Separator />
            <BillSummary
              bill={{
                durationMinutes: minutes,
                hourlyFee: Number(order.hourlyFee),
                totalProductPrice: Number(order.totalProductPrice),
                discountAmount: Number(order.discountAmount),
                hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
                taxAmount: Number(order.taxAmount),
                finalAmount: Number(order.finalAmount),
              }}
              percents={order}
              pricePerHour={Number(order.pricePerHour)}
              totalLabel={order.status === "COMPLETED" ? "Đã thu" : "Thành tiền"}
            />
          </>
        )}
      </div>

      {order?.status === "COMPLETED" && (can(user, "sales.editPaid") || can(user, "sales.void")) && (
        <SheetFooter className="border-t">
          {can(user, "sales.editPaid") && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Sửa hóa đơn
            </Button>
          )}
          {can(user, "sales.void") && (
            <Button variant="destructive" onClick={() => setVoidOpen(true)}>
              <BanIcon data-icon="inline-start" />
              Hủy hóa đơn
            </Button>
          )}
        </SheetFooter>
      )}

      {order?.status === "COMPLETED" && (
        <EditPaidBillDialog
          order={order}
          open={editOpen}
          onOpenChange={setEditOpen}
          warning={einvoiceNote && `${einvoiceNote} Sửa bill không sửa hóa đơn trên Minvoice.`}
          onSaved={(saved) => {
            // The correction's answer carries no e-invoice count.
            setOrder((prev) => ({ ...saved, _count: prev?._count }));
            onChanged();
          }}
        />
      )}

      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Hủy hóa đơn ${order ? billLabel(order) : ""}?`}
        description={
          <>
            {`Hàng đã bán được hoàn lại kho, phiếu thu ${formatMoney(order?.finalAmount)} bị hủy và doanh thu giảm tương ứng. Hóa đơn vẫn được lưu để đối chiếu.`}
            {einvoiceNote && (
              <span className="mt-2 block text-warning">{`${einvoiceNote} Hủy bill không hủy hóa đơn trên Minvoice.`}</span>
            )}
          </>
        }
        confirmLabel="Hủy hóa đơn"
        onConfirm={voidBill}
      />
    </>
  );
}
