"use client";

import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { EinvoiceBillDetail, EinvoiceDetail } from "@/lib/types";

// The open bill in the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.2): what is split, what to watch, and its small invoices HĐ 1, HĐ 2…
// (by id) with their amounts.
export function BillSplit({
  detail,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  onSelect,
  onSaved,
  onDeleted,
  onSavingChange,
}: {
  detail: EinvoiceBillDetail;
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
}) {
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
      {einvoices.length === 0 ? (
        <p className="px-3 py-1 text-sm text-muted-foreground">Chưa có hóa đơn nhỏ.</p>
      ) : (
        <ul>
          {einvoices.map((einvoice, index) => (
            <EinvoiceRow
              key={einvoice.id}
              einvoice={einvoice}
              label={`HĐ ${index + 1}`}
              selected={selectedId === einvoice.id}
              editable={order.status === "COMPLETED"}
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
      )}
    </div>
  );
}
