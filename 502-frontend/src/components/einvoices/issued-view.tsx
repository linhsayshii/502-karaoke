"use client";

import { useState } from "react";
import { PencilIcon, TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EditNumberDialog } from "@/components/einvoices/edit-number-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceDetail } from "@/lib/types";

// An issued invoice: only its header is kept (spec §4). One that still has a
// lastError was issued but Minvoice's number clashed with one of ours, so its
// number is empty until the chain manager types the one shown on Minvoice.
// Rendered inside the panel's @container/einvoice.
export function IssuedView({
  einvoice,
  onChanged,
}: {
  einvoice: EinvoiceDetail;
  onChanged: (row: EinvoiceDetail) => void;
}) {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const canEditNumber = can(user, "einvoices.issue");
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
      <EditNumberDialog einvoice={einvoice} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} />
    </div>
  );
}
