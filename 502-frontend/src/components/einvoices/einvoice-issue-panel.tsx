"use client";

import type { BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceEditor } from "@/components/einvoices/einvoice-editor";
import { IssuedView } from "@/components/einvoices/issued-view";
import { UncertainBox } from "@/components/einvoices/uncertain-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { billLabel, formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The buyer of the invoice before, for "Chép từ HĐ trước" (none when it was a
// khách lẻ: there is nothing to copy). An issued one has no draft left, so
// only its MST and name.
export const buyerOf = (einvoice: EinvoiceDetail | undefined): BuyerValue | null => {
  if (!einvoice) return null;
  const buyer = {
    buyerTaxCode: einvoice.buyerTaxCode ?? "",
    buyerName: einvoice.buyerName ?? "",
    buyerAddress: einvoice.draft?.buyerAddress ?? "",
    buyerEmail: einvoice.draft?.buyerEmail ?? "",
  };
  return Object.values(buyer).some(Boolean) ? buyer : null;
};

// What the editor starts from. A save that changes it remounts the editor
// clean; an amount typed in the left column does not, so unsaved edits stay
// (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.3).
const editorKey = (einvoice: EinvoiceDetail) =>
  `${einvoice.id}:${JSON.stringify([einvoice.invoiceDate, einvoice.buyerTaxCode, einvoice.buyerName, einvoice.draft])}`;

// Right column: one invoice, to fill and issue. Rendered both inline in
// @container/main and in the phone Sheet (portaled outside it), so it is its
// own container.
export function EinvoiceIssuePanel({
  einvoice,
  bill,
  label,
  previous,
  config,
  busy,
  onChanged,
  onResend,
  onReload,
  onDirtyChange,
  onWorkingChange,
}: {
  einvoice: EinvoiceDetail;
  // Its paid bill; null for a bill thêm tay.
  bill: EinvoiceBillDetail["order"] | null;
  // "HĐ 2" within its bill; a bill thêm tay's carries the bill and room too.
  label: string;
  previous: BuyerValue | null;
  config: EinvoiceConfigView | null;
  busy: boolean;
  onChanged: (row: EinvoiceDetail) => void;
  // Gửi lại of an issued invoice: a new draft from it.
  onResend: (row: EinvoiceDetail) => Promise<boolean>;
  onReload: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onWorkingChange: (working: boolean) => void;
}) {
  const badge = einvoiceStatusBadge(einvoice.status, einvoice.lastError);
  return (
    <div className="@container/einvoice flex min-w-0 flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">
            {label}
            {bill && ` · Bill ${billLabel(bill)} · ${bill.room?.name ?? "—"}`}
          </div>
          <div className="text-sm text-muted-foreground">
            Số tiền (đã gồm VAT):{" "}
            <span className="font-medium text-foreground tabular-nums">{formatMoney(einvoice.amount)}</span> · sửa ở
            cột trái
          </div>
        </div>
        <Badge variant={badge.variant}>
          {badge.label}
          {einvoice.invoiceNumber ? ` · số ${einvoice.invoiceNumber}` : ""}
        </Badge>
      </div>
      {einvoice.status === "ISSUED" ? (
        <IssuedView
          einvoice={einvoice}
          billCompleted={!bill || bill.status === "COMPLETED"}
          busy={busy}
          onChanged={onChanged}
          onResend={onResend}
        />
      ) : einvoice.status === "UNCERTAIN" ? (
        <UncertainBox
          einvoice={einvoice}
          config={config}
          billCompleted={!bill || bill.status === "COMPLETED"}
          busy={busy}
          onChanged={onChanged}
        />
      ) : einvoice.status === "SENDING" ? (
        // The server turns a send that never answered into "Không rõ" when it
        // is read, so a reload is all this row ever needs.
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Spinner data-icon="inline-start" />
          Đang gửi lên Minvoice…
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReload}>
            Tải lại
          </Button>
        </div>
      ) : (
        <EinvoiceEditor
          key={editorKey(einvoice)}
          bill={bill}
          einvoice={einvoice}
          previous={previous}
          config={config}
          onSaved={onChanged}
          onDirtyChange={onDirtyChange}
          onWorkingChange={onWorkingChange}
          busy={busy}
        />
      )}
    </div>
  );
}
