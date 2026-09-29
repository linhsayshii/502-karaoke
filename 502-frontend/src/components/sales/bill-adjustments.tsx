"use client";

import { useState } from "react";
import { ChevronDownIcon, ClockIcon, PercentIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

// Label, percent and amount on one line; the label goes on top when the card is narrow.
const ADJUSTMENT_ROW =
  "grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 @sm/field-group:grid-cols-[minmax(0,1fr)_6rem_8rem]";
const ADJUSTMENT_LABEL = "col-span-2 font-normal @sm/field-group:col-span-1";
const clampPercent = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
const nonNegative = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

type PercentKey = "discountPercent" | "hourlyDiscountPercent";
type AmountKey = "discountAmount" | "hourlyDiscountAmount";

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

// Discounts and VAT of an open session. Edits stay local until Áp dụng /
// Gửi duyệt; a cashier's discount becomes a request the managers approve.
export function BillAdjustments({ order, billFor, canApply, onSubmit, onCancelRequest }: BillAdjustmentsProps) {
  const saved = adjustmentsOf(order);
  const pending = order.discountRequests?.[0] ?? null;
  // The page remounts this with a key of the saved values and the pending
  // request, so a new saved state (poll, approval) resets the draft without
  // setting state in an effect.
  const [draft, setDraft] = useState<Adjustments>(saved);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const changed = changedKeys(saved, draft);
  const approval = !canApply && needsApproval(saved, draft);
  const preview = billFor(draft);
  const active = [
    saved.discountPercent || saved.discountAmount,
    saved.hourlyDiscountPercent || saved.hourlyDiscountAmount,
  ].filter(Boolean).length;

  const submit = async (note?: string) => {
    setBusy(true);
    try {
      return await onSubmit(draft, note);
    } finally {
      setBusy(false);
    }
  };

  // Percent follows the live bill (the server applies it at checkout);
  // typing an amount makes it a fixed sum. Only one of the pair is kept: a
  // percent > 0 wins in billing, so an amount left behind it would come back
  // unseen once the percent is dropped (the server stores it as 0 too).
  const row = (id: string, label: string, pk: PercentKey, ak: AmountKey) => (
    <Field className={ADJUSTMENT_ROW}>
      <FieldLabel htmlFor={`${id}-percent`} className={ADJUSTMENT_LABEL}>
        {label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={`${id}-percent`}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          disabled={!!pending}
          className="text-right tabular-nums"
          value={draft[pk]}
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
          disabled={!!pending}
          aria-label={`${label} (số tiền)`}
          className="text-right tabular-nums"
          value={draft[pk] > 0 ? preview[ak] : draft[ak]}
          onChange={(e) => setDraft({ ...draft, [pk]: 0, [ak]: nonNegative(e.target.value) })}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>đ</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );

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
        {pending && (
          <Alert>
            <ClockIcon />
            <AlertTitle>Đang chờ quản lý duyệt</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>
                {changedKeys(saved, pending.after)
                  .map((k) => `${ADJUSTMENT_LABELS[k]}: ${formatNumber(saved[k])} → ${formatNumber(pending.after[k])}`)
                  .join(" · ")}
              </span>
              <span className="tabular-nums">
                Tổng {formatMoney(pending.amountBefore)} → {formatMoney(pending.amountAfter)} · Lý do: {pending.note}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onCancelRequest(pending.id);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Hủy yêu cầu
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup className="gap-3">
          {row("discount", "Giảm giá món", "discountPercent", "discountAmount")}
          {row("hourly-discount", "Giảm giá giờ", "hourlyDiscountPercent", "hourlyDiscountAmount")}
          <Field className={ADJUSTMENT_ROW}>
            <FieldLabel htmlFor="tax-percent" className={ADJUSTMENT_LABEL}>
              Thuế VAT
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="tax-percent"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                disabled={!!pending}
                className="text-right tabular-nums"
                value={draft.taxPercent}
                onChange={(e) => setDraft({ ...draft, taxPercent: clampPercent(e.target.value) })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>%</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <span className="pr-3 text-right text-sm tabular-nums">{formatNumber(preview.taxAmount)} đ</span>
          </Field>
        </FieldGroup>
        {changed.length > 0 && !pending && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm tabular-nums">Tổng mới: {formatMoney(preview.finalAmount)}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(saved)}>
                Hoàn tác
              </Button>
              <Button size="sm" disabled={busy} onClick={() => (approval ? setReasonOpen(true) : submit())}>
                {approval ? "Gửi duyệt" : "Áp dụng"}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
      <ReasonDialog
        open={reasonOpen}
        onOpenChange={setReasonOpen}
        title="Gửi quản lý duyệt giảm giá"
        description={`Tổng ${formatMoney(billFor(saved).finalAmount)} → ${formatMoney(preview.finalAmount)}. Yêu cầu gửi tới mọi quản lý của cơ sở.`}
        confirmLabel="Gửi duyệt"
        reasonLabel="Lý do giảm giá"
        placeholder="Ví dụ: khách quen, phòng lỗi máy"
        requiredMessage="Vui lòng nhập lý do giảm giá"
        onConfirm={(note) => submit(note)}
      />
    </Collapsible>
  );
}
