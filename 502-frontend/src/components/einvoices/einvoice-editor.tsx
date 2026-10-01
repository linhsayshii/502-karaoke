"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BuyerFields, type BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceLines } from "@/components/einvoices/einvoice-lines";
import { IssueControls } from "@/components/einvoices/issue-controls";
import { MoneyInput } from "@/components/einvoices/number-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { issueProblem, totalsOf } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail, EinvoiceLine } from "@/lib/types";

interface FormState extends BuyerValue {
  amount: number | null;
  lines: EinvoiceLine[];
}

const formOf = (einvoice: EinvoiceDetail | null): FormState => ({
  amount: einvoice ? Number(einvoice.amount) : null,
  buyerTaxCode: einvoice?.buyerTaxCode ?? "",
  buyerName: einvoice?.buyerName ?? "",
  buyerAddress: einvoice?.draft?.buyerAddress ?? "",
  buyerEmail: einvoice?.draft?.buyerEmail ?? "",
  lines: einvoice?.draft?.lines ?? [],
});

const buyerOf = (form: FormState): BuyerValue => ({
  buyerTaxCode: form.buyerTaxCode,
  buyerName: form.buyerName,
  buyerAddress: form.buyerAddress,
  buyerEmail: form.buyerEmail,
});

// One draft (or a new, unsaved one) of a bill (spec §10.2). The panel keys it
// by the invoice and its updatedAt, so it starts from the saved draft and a
// save remounts it clean. Rendered inside the panel's @container/einvoice.
export function EinvoiceEditor({
  bill,
  einvoice,
  previous,
  config,
  onSaved,
  onDeleted,
  onDirtyChange,
  busy,
}: {
  bill: EinvoiceBillDetail["order"];
  einvoice: EinvoiceDetail | null;
  previous: BuyerValue | null;
  config: EinvoiceConfigView | null;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (id: number | null) => void;
  onDirtyChange: (dirty: boolean) => void;
  // The panel is reloading after a write: the editor still shows the old row,
  // so saving or issuing it again waits for the new one.
  busy: boolean;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const canWrite = can(user, "einvoices.write");
  // A voided bill takes no new or changed invoice (the server refuses to
  // issue it), but its drafts can still be deleted so they leave the Nháp tab.
  const canEdit = canWrite && bill.status === "COMPLETED";
  // The same goes for issuing: the chain manager, on a bill that stands.
  const canIssue = can(user, "einvoices.issue") && bill.status === "COMPLETED";
  const saved = useMemo(() => formOf(einvoice), [einvoice]);
  const [form, setForm] = useState<FormState>(saved);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const totals = totalsOf(form.lines);
  const missing = (form.amount ?? 0) - totals.total;
  const problem = form.amount ? issueProblem(form.amount, form.lines) : "Nhập số tiền của hóa đơn";

  const body = () => ({
    amount: form.amount,
    buyerTaxCode: form.buyerTaxCode.trim() || null,
    buyerName: form.buyerName.trim() || null,
    buyerAddress: form.buyerAddress.trim() || null,
    buyerEmail: form.buyerEmail.trim() || null,
    lines: form.lines.map((line) => ({ ...line, name: line.name.trim(), unit: line.unit.trim() })),
  });

  const save = async () => {
    if (!form.amount) {
      notify.warning("Nhập số tiền của hóa đơn");
      return;
    }
    if (form.lines.some((line) => !line.name.trim())) {
      notify.warning("Dòng hàng nào cũng cần tên");
      return;
    }
    setSaving(true);
    try {
      const res = einvoice
        ? await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}`, body())
        : await api.post<EinvoiceDetail>("/einvoices", { orderId: bill.id, ...body() });
      notify.success("Đã lưu hóa đơn nháp");
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không lưu được hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!einvoice) return;
    try {
      await api.delete(`/einvoices/${einvoice.id}`);
      notify.success("Đã xóa hóa đơn nháp");
      onDeleted(einvoice.id);
    } catch (error) {
      notify.error(error, "Không xóa được hóa đơn");
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {einvoice?.lastError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Lần gửi gần nhất bị lỗi</AlertTitle>
          <AlertDescription className="wrap-anywhere">{einvoice.lastError}</AlertDescription>
        </Alert>
      )}
      <Field className="max-w-60">
        <FieldLabel htmlFor="einvoice-amount">Số tiền (đã gồm VAT)</FieldLabel>
        <MoneyInput
          id="einvoice-amount"
          className="tabular-nums"
          value={form.amount}
          disabled={!canEdit}
          onChange={(amount) => setForm((f) => ({ ...f, amount }))}
        />
      </Field>
      {/* Functional updates: a lookup answers after a while and must not undo
          the lines typed meanwhile. */}
      <BuyerFields
        value={buyerOf(form)}
        previous={previous}
        disabled={!canEdit}
        onChange={(buyer) => setForm((f) => ({ ...f, ...buyer }))}
      />
      <EinvoiceLines
        lines={form.lines}
        bill={bill}
        missing={missing}
        disabled={!canEdit}
        onChange={(lines) => setForm((f) => ({ ...f, lines }))}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums @md/einvoice:ml-auto @md/einvoice:w-72">
        <dt className="text-muted-foreground">Trước thuế</dt>
        <dd className="text-right">{formatMoney(totals.amountWithoutVat)}</dd>
        <dt className="text-muted-foreground">VAT</dt>
        <dd className="text-right">{formatMoney(totals.vatAmount)}</dd>
        <dt className="font-medium">Tổng</dt>
        <dd className="text-right font-medium">{formatMoney(totals.total)}</dd>
        {form.amount !== null && missing !== 0 && (
          <>
            <dt className="text-destructive">{missing > 0 ? "Còn thiếu" : "Thừa"}</dt>
            <dd className="text-right text-destructive">{formatMoney(Math.abs(missing))}</dd>
          </>
        )}
      </dl>
      {problem && (form.amount === null || missing === 0) && <p className="text-sm text-destructive">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button onClick={save} disabled={saving || busy || !dirty}>
            {saving && <Spinner data-icon="inline-start" />}
            Lưu nháp
          </Button>
        )}
        {einvoice
          ? canWrite && (
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                Xóa
              </Button>
            )
          : canEdit && (
              <Button variant="ghost" onClick={() => onDeleted(null)}>
                Bỏ
              </Button>
            )}
        {dirty && <span className="text-sm text-muted-foreground">Có thay đổi chưa lưu</span>}
        {einvoice && canIssue && (
          <IssueControls
            einvoice={einvoice}
            config={config}
            problem={dirty ? "Lưu nháp trước khi xuất" : problem}
            busy={busy}
            onIssued={onSaved}
          />
        )}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Xóa hóa đơn nháp?"
        description="Nháp và các dòng hàng của nó bị xóa hẳn."
        confirmLabel="Xóa"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
