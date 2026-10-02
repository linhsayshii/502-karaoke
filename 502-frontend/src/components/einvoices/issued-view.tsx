"use client";

import { useState } from "react";
import { PencilIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EditNumberDialog } from "@/components/einvoices/edit-number-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceDetail } from "@/lib/types";

// An issued invoice: the panel shows only its header (spec §4). Its draft
// stays as { lines } for the report site's products report; only the buyer's
// address and email are dropped, and invoices issued before the report site
// have draft = null. One that still has a lastError was issued but Minvoice's
// number clashed with one of ours, so its number is empty until the chain
// manager types the one shown on Minvoice.
// Gửi lại makes a new draft from its header (amount, buyer MST and name), not
// from its lines; the issued one stays as it is, here and on Minvoice.
// Rendered inside the panel's @container/einvoice.
export function IssuedView({
  einvoice,
  billCompleted,
  busy,
  onChanged,
  onResend,
}: {
  einvoice: EinvoiceDetail;
  // A voided bill takes no new invoice.
  billCompleted: boolean;
  // The panel is reloading after a write.
  busy: boolean;
  onChanged: (row: EinvoiceDetail) => void;
  // Creates the new draft and shows it; false when that failed.
  onResend: (einvoice: EinvoiceDetail) => Promise<boolean>;
}) {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const canEditNumber = can(user, "einvoices.issue");
  const canResend = can(user, "einvoices.write") && billCompleted;
  return (
    <div className="flex flex-col gap-3">
      {einvoice.lastError && (
        <Alert className="border-warning">
          <TriangleAlertIcon className="text-warning" />
          <AlertTitle>Hóa đơn đã xuất, cần sửa số</AlertTitle>
          <AlertDescription className="flex w-full min-w-0 flex-col gap-3">
            <p className="w-full font-medium text-foreground wrap-anywhere">{einvoice.lastError}</p>
            {canEditNumber && (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <PencilIcon data-icon="inline-start" />
                Nhập số hóa đơn
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Số hóa đơn</dt>
        <dd className="flex items-center gap-2 font-medium tabular-nums">
          {einvoice.invoiceNumber ?? "—"}
          {canEditNumber && (
            <Button size="icon" variant="ghost" className="size-7" aria-label="Sửa số hóa đơn" onClick={() => setEditOpen(true)}>
              <PencilIcon />
            </Button>
          )}
        </dd>
        <dt className="text-muted-foreground">Ký hiệu</dt>
        <dd>{einvoice.symbolCode ?? "—"}</dd>
        <dt className="text-muted-foreground">Ngày hóa đơn</dt>
        <dd>{formatDate(einvoice.invoiceDate)}</dd>
        <dt className="text-muted-foreground">Người mua</dt>
        <dd className="min-w-0 wrap-anywhere">
          {einvoice.buyerName ?? "Khách lẻ"}
          {einvoice.buyerTaxCode ? ` · MST ${einvoice.buyerTaxCode}` : ""}
        </dd>
        <dt className="text-muted-foreground">Số tiền</dt>
        <dd className="tabular-nums">
          {formatMoney(einvoice.amount)} (VAT {formatMoney(einvoice.vatAmount)})
        </dd>
        <dt className="text-muted-foreground">Người xuất</dt>
        <dd>
          {einvoice.issuedBy?.fullName ?? "—"} · {formatDateTime(einvoice.issuedAt)}
        </dd>
        {einvoice.numberEditedAt && (
          <>
            <dt className="text-muted-foreground">Sửa số</dt>
            <dd>
              {einvoice.numberEditedBy?.fullName ?? "—"} · {formatDateTime(einvoice.numberEditedAt)}
            </dd>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">Chi tiết dòng hàng xem trên Minvoice.</p>
      {canResend && (
        <Button size="sm" variant="outline" className="self-start" disabled={busy} onClick={() => setResendOpen(true)}>
          <RotateCcwIcon data-icon="inline-start" />
          Gửi lại
        </Button>
      )}
      <EditNumberDialog einvoice={einvoice} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} />
      <ConfirmDialog
        open={resendOpen}
        onOpenChange={setResendOpen}
        title={`Gửi lại hóa đơn${einvoice.invoiceNumber ? ` số ${einvoice.invoiceNumber}` : ""}?`}
        description={`Hóa đơn này giữ nguyên, ở đây và trên Minvoice. Hệ thống tạo một nháp mới của cùng bill với số tiền ${formatMoney(einvoice.amount)}, MST và tên người mua, ngày hôm nay; dòng hàng, địa chỉ và email cần nhập lại trước khi Xuất. Phần đã chia của bill tính cả hai hóa đơn.`}
        confirmLabel="Tạo nháp mới"
        onConfirm={() => onResend(einvoice)}
      />
    </div>
  );
}
