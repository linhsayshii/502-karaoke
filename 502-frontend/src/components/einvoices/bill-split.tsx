"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { EinvoiceBillDetail, EinvoiceDetail, ManualBillDetail } from "@/lib/types";

// What an open bill hands its invoice rows.
interface RowProps {
  selectedId: number | null;
  focusId: number | null;
  // The invoice whose unsaved edits the panel holds.
  dirtyId: number | null;
  // The invoice the panel is saving or issuing.
  lockedId: number | null;
  // The report site names each invoice by its own number (spec
  // 2026-10-02-bao-cao-theo-tung-hddt §4.3), the main site HĐ 1, HĐ 2….
  numbered: boolean;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
}

// The small invoices of a bill (by id), with their amounts.
function InvoiceRows({
  einvoices,
  editable,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  numbered,
  onSelect,
  onSaved,
  onDeleted,
  onSavingChange,
}: RowProps & { einvoices: EinvoiceDetail[]; editable: boolean }) {
  if (einvoices.length === 0) {
    return <p className="px-3 py-1 text-sm text-muted-foreground">Chưa có hóa đơn nhỏ.</p>;
  }
  return (
    <ul>
      {einvoices.map((einvoice, index) => (
        <EinvoiceRow
          key={einvoice.id}
          einvoice={einvoice}
          label={numbered ? einvoice.reportNumber : `HĐ ${index + 1}`}
          selected={selectedId === einvoice.id}
          editable={editable}
          autoFocus={focusId === einvoice.id}
          forceConfirm={dirtyId === einvoice.id}
          locked={lockedId === einvoice.id}
          onSelect={() => onSelect(einvoice.id)}
          onSaved={onSaved}
          onDeleted={() => onDeleted(einvoice.id)}
          onSavingChange={onSavingChange}
        />
      ))}
    </ul>
  );
}

// The open paid bill in the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.2): what is split, what to watch, and its small invoices.
export function BillSplit({ detail, ...rows }: RowProps & { detail: EinvoiceBillDetail }) {
  const { order, einvoices, allocated } = detail;
  const billTotal = Number(order.finalAmount);
  const editedAfter = !!order.editedAt && einvoices.some((e) => e.createdAt < (order.editedAt as string));
  const discounted = Number(order.discountAmount) > 0 || Number(order.hourlyDiscountAmount) > 0;
  return (
    <div className="flex flex-col gap-1 border-t py-2">
      <p className="px-3 text-xs text-muted-foreground tabular-nums">
        VAT {formatMoney(order.taxAmount)}
        {discounted &&
          ` · giảm món ${formatMoney(order.discountAmount)}, giờ ${formatMoney(order.hourlyDiscountAmount)}`}
        {` · đã chia ${formatMoney(allocated)} · `}
        {allocated > billTotal ? `vượt ${formatMoney(allocated - billTotal)}` : `còn ${formatMoney(billTotal - allocated)}`}
      </p>
      {allocated > billTotal && <p className="px-3 text-xs text-warning">Tổng các hóa đơn vượt tổng bill.</p>}
      {order.cancelledAt && (
        <p className="px-3 text-xs text-warning">Bill đã hủy lúc {formatDateTime(order.cancelledAt)}.</p>
      )}
      {editedAfter && (
        <p className="px-3 text-xs text-warning">
          Bill đã sửa lúc {formatDateTime(order.editedAt)}, sau khi tạo hóa đơn.
        </p>
      )}
      <InvoiceRows einvoices={einvoices} editable={order.status === "COMPLETED"} {...rows} />
    </div>
  );
}

// An open bill thêm tay (report site, spec 2026-10-02 §7.5): who added it and
// its invoices. Its total is what its invoices hold, so nothing is "left".
// Cancelled here, where one left without an invoice can still be reached
// (spec 2026-10-02-bao-cao-theo-tung-hddt §5.3).
export function ManualBillSplit({
  detail,
  canWrite,
  onCancelled,
  ...rows
}: RowProps & { detail: ManualBillDetail; canWrite: boolean; onCancelled: () => void }) {
  const { bill, einvoices } = detail;
  const notify = useNotify();
  const [cancelling, setCancelling] = useState(false);
  const cancel = async (reason: string) => {
    try {
      await api.post(`/report-site/manual-bills/${bill.id}/cancel`, { reason });
      notify.success(`Đã hủy bill ${bill.billNumber}`);
      onCancelled();
      return true;
    } catch (error) {
      notify.error(error, "Không hủy được bill");
      return false;
    }
  };
  return (
    <div className="flex flex-col gap-1 border-t py-2">
      <div className="flex items-center gap-2 px-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Bill thêm tay ngày {formatDate(bill.businessDate)}
          {bill.createdBy && ` · ${bill.createdBy.fullName} thêm lúc ${formatDateTime(bill.createdAt)}`}
        </p>
        {canWrite && !bill.cancelledAt && (
          <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
            <XIcon data-icon="inline-start" />
            Hủy bill
          </Button>
        )}
      </div>
      {bill.cancelledAt && (
        <p className="px-3 text-xs text-warning">
          Bill đã hủy lúc {formatDateTime(bill.cancelledAt)}
          {bill.cancelReason ? `: ${bill.cancelReason}` : ""}.
        </p>
      )}
      <InvoiceRows einvoices={einvoices} editable={!bill.cancelledAt} {...rows} />
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={`Hủy bill ${bill.billNumber}?`}
        description="Các hóa đơn nháp của bill bị xóa cùng. Bill đã có hóa đơn gửi hoặc xuất thì không hủy được. Số hóa đơn không được cấp lại."
        confirmLabel="Hủy bill"
        maxLength={300} // the most the backend takes (CancelManualBillDto.reason)
        onConfirm={cancel}
      />
    </div>
  );
}
