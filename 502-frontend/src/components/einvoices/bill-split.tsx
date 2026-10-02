"use client";

import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
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
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
}

// The small invoices of a bill, HĐ 1, HĐ 2… (by id), with their amounts.
function InvoiceRows({
  einvoices,
  editable,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
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
          label={`HĐ ${index + 1}`}
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
export function ManualBillSplit({ detail, ...rows }: RowProps & { detail: ManualBillDetail }) {
  const { bill, einvoices } = detail;
  return (
    <div className="flex flex-col gap-1 border-t py-2">
      <p className="px-3 text-xs text-muted-foreground">
        Bill thêm tay ngày {formatDate(bill.businessDate)}
        {bill.createdBy && ` · ${bill.createdBy.fullName} thêm lúc ${formatDateTime(bill.createdAt)}`}
      </p>
      {bill.cancelledAt && (
        <p className="px-3 text-xs text-warning">
          Bill đã hủy lúc {formatDateTime(bill.cancelledAt)}
          {bill.cancelReason ? `: ${bill.cancelReason}` : ""}.
        </p>
      )}
      <InvoiceRows einvoices={einvoices} editable={!bill.cancelledAt} {...rows} />
    </div>
  );
}
