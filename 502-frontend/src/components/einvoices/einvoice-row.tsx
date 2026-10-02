"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MoneyInput } from "@/components/einvoices/number-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { isEmptyDraft } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { EinvoiceDetail, EinvoiceRow as EinvoiceListRow } from "@/lib/types";

// One small invoice in the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.2): its amount is typed here and saved on Enter or when the box is left;
// a draft is deleted here, at once when nothing was typed in it. Rendered
// inside @container/main.
export function EinvoiceRow({
  einvoice,
  label,
  selected,
  editable,
  autoFocus = false,
  forceConfirm = false,
  locked = false,
  onSelect,
  onSaved,
  onDeleted,
  onSavingChange,
}: {
  // A row of the open bill, with its draft.
  einvoice: EinvoiceListRow | EinvoiceDetail;
  label: string;
  selected: boolean;
  // Its bill stands: the amount of a draft may change.
  editable: boolean;
  // Just created: the cursor goes to its amount.
  autoFocus?: boolean;
  // The panel holds unsaved edits of it: deleting it always asks.
  forceConfirm?: boolean;
  // The panel is saving or issuing this invoice: its amount waits, so the two
  // writes never overwrite each other.
  locked?: boolean;
  onSelect: () => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: () => void;
  // Told while the amount is on its way: the page holds back the panel's save
  // and the bill's + until the saved row is back.
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const canWrite = can(user, "einvoices.write");
  const isDraft = einvoice.status === "DRAFT";
  const savedAmount = Number(einvoice.amount);
  const [typed, setTyped] = useState<number | null>(savedAmount);
  const [shown, setShown] = useState(savedAmount);
  // A reload with another amount shows it; adjusted during render, so typing
  // never loses the focus.
  if (savedAmount !== shown) {
    setShown(savedAmount);
    setTyped(savedAmount);
  }
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The page hears about a save from the event itself (below), never from an
  // effect: an effect only runs after the click on the bill's + that follows
  // the blur has been dispatched, and that + would read the old remainder. A
  // row that goes away mid-save ends it here.
  const savingRef = useRef(false);
  useEffect(
    () => () => {
      if (savingRef.current) onSavingChange(einvoice.id, false);
    },
    [einvoice.id, onSavingChange],
  );

  // PATCH replaces the whole draft: the buyer, lines and date go with the new
  // amount. Every row reads the invoice first: the row's own data may be
  // older than a Lưu nháp in the panel whose reload is still on its way, and
  // the old buyer and lines would overwrite that save. The date goes along
  // only when the invoice has one, so an old draft without a date keeps none.
  const saveAmount = async () => {
    if (typed === null) {
      setTyped(savedAmount);
      return;
    }
    if (typed === savedAmount || saving) return;
    setSaving(true);
    savingRef.current = true;
    onSavingChange(einvoice.id, true);
    try {
      const current = (await api.get<EinvoiceDetail>(`/einvoices/${einvoice.id}`)).data;
      const res = await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}`, {
        amount: typed,
        invoiceDate: current.invoiceDate,
        buyerTaxCode: current.buyerTaxCode,
        buyerName: current.buyerName,
        buyerAddress: current.draft?.buyerAddress ?? null,
        buyerEmail: current.draft?.buyerEmail ?? null,
        lines: current.draft?.lines ?? [],
      });
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không lưu được số tiền");
      setTyped(savedAmount);
    } finally {
      setSaving(false);
      savingRef.current = false;
      onSavingChange(einvoice.id, false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/einvoices/${einvoice.id}`);
      notify.success("Đã xóa hóa đơn nháp");
      onDeleted();
    } catch (error) {
      notify.error(error, "Không xóa được hóa đơn");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const badge = einvoiceStatusBadge(einvoice.status, einvoice.lastError);
  return (
    <>
      <li
        onClick={(e) => {
          // The amount box and the buttons do their own thing.
          if (!(e.target as HTMLElement).closest("input, button")) onSelect();
        }}
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm",
          selected ? "bg-muted" : "hover:bg-muted/50",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
          className="shrink-0 font-medium tabular-nums"
        >
          {label}
        </button>
        {canWrite && isDraft && editable ? (
          <MoneyInput
            aria-label={`Số tiền ${label}`}
            autoFocus={autoFocus}
            className="h-8 w-32 text-right tabular-nums"
            value={typed}
            disabled={saving || locked}
            onChange={setTyped}
            onBlur={() => void saveAmount()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <span className="tabular-nums">{formatMoney(einvoice.amount)}</span>
        )}
        {saving && <Spinner />}
        <Badge variant={badge.variant}>
          {badge.label}
          {einvoice.invoiceNumber ? ` · số ${einvoice.invoiceNumber}` : ""}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{einvoice.buyerName ?? "Khách lẻ"}</span>
        {canWrite && isDraft && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Xóa ${label}`}
            disabled={deleting}
            onClick={() => (forceConfirm || !isEmptyDraft(einvoice) ? setConfirmOpen(true) : void remove())}
          >
            <Trash2Icon />
          </Button>
        )}
      </li>
      {/* Outside the row: clicks in a portal still bubble through React to
          its parent, and must not select the row. */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xóa hóa đơn nháp?"
        description="Nháp và các dòng hàng của nó bị xóa hẳn."
        confirmLabel="Xóa"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
