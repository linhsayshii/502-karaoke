"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ClockIcon, PercentIcon, SendHorizontalIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ReasonDialog } from "@/components/reason-dialog";
import type { computeBill } from "@/lib/billing";
import { ADJUSTMENT_LABELS, adjustmentsOf, changedKeys, needsApproval } from "@/lib/discount-rules";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Adjustments, Order } from "@/lib/types";

type AdjustmentKey = keyof Adjustments;

// Label, percent, amount and the row's button on one line; the label goes on
// top when the card is narrow.
const ADJUSTMENT_ROW =
  "grid grid-cols-[6rem_minmax(0,1fr)_2rem] items-center gap-2 @sm/field-group:grid-cols-[minmax(0,1fr)_6rem_8rem_2rem]";
const ADJUSTMENT_LABEL = "col-span-3 font-normal @sm/field-group:col-span-1";
const clampPercent = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
const nonNegative = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

type PercentKey = "discountPercent" | "hourlyDiscountPercent";
type AmountKey = "discountAmount" | "hourlyDiscountAmount";

// Each row is sent on its own: the other rows keep their saved values.
interface Row {
  id: string;
  label: string;
  keys: AdjustmentKey[];
}
const ROWS: Row[] = [
  { id: "discount", label: "Giảm giá món", keys: ["discountPercent", "discountAmount"] },
  { id: "hourly-discount", label: "Giảm giá giờ", keys: ["hourlyDiscountPercent", "hourlyDiscountAmount"] },
  { id: "tax", label: "Thuế VAT", keys: ["taxPercent"] },
];

interface BillAdjustmentsProps {
  order: Order;
  // The live bill with the given adjustments (for "Tổng mới").
  billFor: (adjustments: Adjustments) => ReturnType<typeof computeBill>;
  // Managers apply every change at once; a cashier only what makes nothing cheaper.
  canApply: boolean;
  // Resolves to whether it was saved.
  onSubmit: (adjustments: Adjustments, note?: string) => Promise<boolean>;
  onCancelRequest: (requestId: number) => Promise<boolean>;
}

// Discounts and VAT of an open session. Each row has its own send button:
// the row is applied at once (a manager, or a change that makes nothing
// cheaper) or becomes a request the managers approve. Until then the bill
// keeps the saved values; a row that equals them shows a green check.
export function BillAdjustments({ order, billFor, canApply, onSubmit, onCancelRequest }: BillAdjustmentsProps) {
  const saved = adjustmentsOf(order);
  const pending = order.discountRequests?.[0] ?? null;
  const pendingKeys = pending ? changedKeys(saved, pending.after) : [];
  // The page remounts this with a key of the saved values and the pending
  // request, so a new saved state (poll, approval) resets the draft without
  // setting state in an effect.
  const [draft, setDraft] = useState<Adjustments>(saved);
  const [sending, setSending] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = billFor(draft);
  const active = [
    saved.discountPercent || saved.discountAmount,
    saved.hourlyDiscountPercent || saved.hourlyDiscountAmount,
  ].filter(Boolean).length;

  // What sending this row would store: its draft values over the saved ones.
  const afterOf = (row: Row): Adjustments => {
    const after = { ...saved };
    for (const key of row.keys) after[key] = draft[key];
    return after;
  };
  const rowChanged = (row: Row) => row.keys.some((key) => draft[key] !== saved[key]);
  const rowPending = (row: Row) => row.keys.some((key) => pendingKeys.includes(key));
  const rowHasValue = (row: Row) => row.keys.some((key) => saved[key] > 0);
  const rowNeedsApproval = (row: Row) => !canApply && needsApproval(saved, afterOf(row));

  const submit = async (row: Row, note?: string) => {
    setBusy(true);
    try {
      return await onSubmit(afterOf(row), note);
    } finally {
      setBusy(false);
    }
  };
  const send = (row: Row) => (rowNeedsApproval(row) ? setSending(row) : void submit(row));
  const cancelPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await onCancelRequest(pending.id);
    } finally {
      setBusy(false);
    }
  };

  // The row's button: send when it differs from what is saved, a check when
  // it is what the bill uses, the pending request's cancel while it waits.
  const rowAction = (row: Row) => {
    if (rowPending(row)) {
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-warning"
          aria-label="Hủy yêu cầu duyệt"
          title="Đang chờ duyệt · bấm để hủy yêu cầu"
          disabled={busy}
          onClick={cancelPending}
        >
          <XIcon />
        </Button>
      );
    }
    if (rowChanged(row)) {
      const approval = rowNeedsApproval(row);
      return (
        <Button
          size="icon-sm"
          variant={approval ? "default" : "secondary"}
          aria-label={approval ? `Gửi duyệt ${row.label.toLowerCase()}` : `Áp dụng ${row.label.toLowerCase()}`}
          title={pending ? "Chờ xử lý yêu cầu đang gửi trước" : approval ? "Gửi quản lý duyệt" : "Áp dụng"}
          disabled={busy || !!pending}
          onClick={() => send(row)}
        >
          <SendHorizontalIcon />
        </Button>
      );
    }
    if (rowHasValue(row)) {
      return (
        <span className="flex size-8 items-center justify-center text-success" title="Đã áp dụng" aria-label="Đã áp dụng">
          <CheckIcon className="size-4" />
        </span>
      );
    }
    return <span className="size-8" aria-hidden />;
  };

  // A pending row shows what was sent, read only, until it is decided.
  const shown = (key: AdjustmentKey) => (pending && pendingKeys.includes(key) ? pending.after[key] : draft[key]);

  // Percent follows the live bill (the server applies it at checkout);
  // typing an amount makes it a fixed sum. Only one of the pair is kept: a
  // percent > 0 wins in billing, so an amount left behind it would come back
  // unseen once the percent is dropped (the server stores it as 0 too).
  const discountRow = (row: Row, pk: PercentKey, ak: AmountKey) => {
    const locked = rowPending(row);
    return (
      <Field className={ADJUSTMENT_ROW}>
        <FieldLabel htmlFor={`${row.id}-percent`} className={ADJUSTMENT_LABEL}>
          {row.label}
          {locked && (
            <Badge variant="warning" className="ml-2">
              Chờ duyệt
            </Badge>
          )}
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`${row.id}-percent`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            disabled={locked}
            className="text-right tabular-nums"
            value={shown(pk)}
            onChange={(e) => setDraft({ ...draft, [pk]: clampPercent(e.target.value), [ak]: 0 })}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>%</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput
            type="number"
            inputMode="numeric"
            min={0}
            disabled={locked}
            aria-label={`${row.label} (số tiền)`}
            className="text-right tabular-nums"
            value={locked ? shown(ak) : draft[pk] > 0 ? preview[ak] : draft[ak]}
            onChange={(e) => setDraft({ ...draft, [pk]: 0, [ak]: nonNegative(e.target.value) })}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>đ</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        {rowAction(row)}
      </Field>
    );
  };

  const taxRow = ROWS[2];
  const taxLocked = rowPending(taxRow);
  const anyChanged = ROWS.some(rowChanged);

  return (
    <Collapsible defaultOpen={active > 0 || !!pending}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group w-full justify-between">
          <span className="flex items-center gap-2">
            <PercentIcon />
            Giảm giá & thuế
            {pending ? <Badge variant="warning">Chờ duyệt</Badge> : active > 0 && <Badge variant="secondary">{active}</Badge>}
          </span>
          <ChevronDownIcon className="transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        <FieldGroup className="gap-3">
          {discountRow(ROWS[0], "discountPercent", "discountAmount")}
          {discountRow(ROWS[1], "hourlyDiscountPercent", "hourlyDiscountAmount")}
          <Field className={ADJUSTMENT_ROW}>
            <FieldLabel htmlFor="tax-percent" className={ADJUSTMENT_LABEL}>
              {taxRow.label}
              {taxLocked && (
                <Badge variant="warning" className="ml-2">
                  Chờ duyệt
                </Badge>
              )}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="tax-percent"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                disabled={taxLocked}
                className="text-right tabular-nums"
                value={shown("taxPercent")}
                onChange={(e) => setDraft({ ...draft, taxPercent: clampPercent(e.target.value) })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>%</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <span className="pr-3 text-right text-sm tabular-nums">{formatNumber(preview.taxAmount)} đ</span>
            {rowAction(taxRow)}
          </Field>
        </FieldGroup>
        {pending && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ClockIcon className="mt-0.5 size-4 shrink-0" />
            <span className="tabular-nums">
              Đang chờ quản lý duyệt:{" "}
              {pendingKeys
                .map((k) => `${ADJUSTMENT_LABELS[k]} ${formatNumber(saved[k])} → ${formatNumber(pending.after[k])}`)
                .join(", ")}
              . Tổng {formatMoney(pending.amountBefore)} → {formatMoney(pending.amountAfter)}. Lý do: {pending.note}. Tiền
              hiện tính theo giá chưa giảm.
            </span>
          </p>
        )}
        {anyChanged && !pending && (
          <p className="text-sm tabular-nums text-muted-foreground">Tổng mới nếu áp dụng: {formatMoney(preview.finalAmount)}</p>
        )}
      </CollapsibleContent>
      <ReasonDialog
        open={sending !== null}
        onOpenChange={(open) => !open && setSending(null)}
        title={`Gửi quản lý duyệt ${sending?.label.toLowerCase() ?? ""}`}
        description={
          sending
            ? `Tổng ${formatMoney(billFor(saved).finalAmount)} → ${formatMoney(billFor(afterOf(sending)).finalAmount)}. Yêu cầu gửi tới mọi quản lý của cơ sở; tiền vẫn tính theo giá cũ cho tới khi được duyệt.`
            : undefined
        }
        confirmLabel="Gửi duyệt"
        reasonLabel="Lý do giảm giá"
        placeholder="Ví dụ: khách quen, phòng lỗi máy"
        requiredMessage="Vui lòng nhập lý do giảm giá"
        onConfirm={(note) => (sending ? submit(sending, note) : Promise.resolve(false))}
      />
    </Collapsible>
  );
}
