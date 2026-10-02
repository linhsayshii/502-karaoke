"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { DatePicker } from "@/components/date-range-picker";
import { BuyerFields, type BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceLines } from "@/components/einvoices/einvoice-lines";
import { IssueControls } from "@/components/einvoices/issue-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { defaultInvoiceDate, invoiceDateProblem, issueProblem, totalsOf } from "@/lib/einvoice";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail, EinvoiceLine } from "@/lib/types";

interface FormState extends BuyerValue {
  invoiceDate: string;
  lines: EinvoiceLine[];
}

const formOf = (einvoice: EinvoiceDetail, fallbackDate: string): FormState => ({
  invoiceDate: einvoice.invoiceDate ?? fallbackDate,
  buyerTaxCode: einvoice.buyerTaxCode ?? "",
  buyerName: einvoice.buyerName ?? "",
  buyerAddress: einvoice.draft?.buyerAddress ?? "",
  buyerEmail: einvoice.draft?.buyerEmail ?? "",
  lines: einvoice.draft?.lines ?? [],
});

const buyerOf = (form: FormState): BuyerValue => ({
  buyerTaxCode: form.buyerTaxCode,
  buyerName: form.buyerName,
  buyerAddress: form.buyerAddress,
  buyerEmail: form.buyerEmail,
});

// One draft in the right column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.3): its invoice date, buyer and lines. The amount is typed in the left
// column and read from the saved row, so a change there never resets what is
// typed here. Rendered inside the panel's @container/einvoice.
export function EinvoiceEditor({
  bill,
  einvoice,
  previous,
  config,
  onSaved,
  onDirtyChange,
  onWorkingChange,
  busy,
}: {
  // Its paid bill; null for a bill thêm tay.
  bill: EinvoiceBillDetail["order"] | null;
  einvoice: EinvoiceDetail;
  previous: BuyerValue | null;
  config: EinvoiceConfigView | null;
  onSaved: (row: EinvoiceDetail) => void;
  onDirtyChange: (dirty: boolean) => void;
  // True while this editor saves or issues: the amount box of its row waits.
  onWorkingChange: (working: boolean) => void;
  // The page is reloading after a write: saving or issuing waits for the new row.
  busy: boolean;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  // A voided bill takes no changed or issued invoice (the server refuses);
  // its drafts are deleted in the left column.
  const billStands = !bill || bill.status === "COMPLETED";
  const canEdit = can(user, "einvoices.write") && billStands;
  const canIssue = can(user, "einvoices.issue") && billStands;
  const fallbackDate = defaultInvoiceDate(bill?.endTime);
  const saved = useMemo(() => formOf(einvoice, fallbackDate), [einvoice, fallbackDate]);
  const [form, setForm] = useState<FormState>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  // Saving and issuing tell the page from their own handlers (below and in
  // IssueControls), not from an effect, so the amount box of the row is locked
  // before any further click; only the unmount ends it here.
  useEffect(() => () => onWorkingChange(false), [onWorkingChange]);

  const amount = Number(einvoice.amount);
  const totals = totalsOf(form.lines);
  const missing = amount - totals.total;
  const problem = issueProblem(amount, form.lines);
  // A warning only: Xuất offers to issue it today instead (spec §2).
  const dateProblem = invoiceDateProblem(form.invoiceDate, config);

  const save = async () => {
    if (form.lines.some((line) => !line.name.trim())) {
      notify.warning("Dòng hàng nào cũng cần tên");
      return;
    }
    setSaving(true);
    onWorkingChange(true);
    try {
      const res = await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}`, {
        amount,
        invoiceDate: form.invoiceDate,
        buyerTaxCode: form.buyerTaxCode.trim() || null,
        buyerName: form.buyerName.trim() || null,
        buyerAddress: form.buyerAddress.trim() || null,
        buyerEmail: form.buyerEmail.trim() || null,
        lines: form.lines.map((line) => ({ ...line, name: line.name.trim(), unit: line.unit.trim() })),
      });
      notify.success("Đã lưu hóa đơn nháp");
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không lưu được hóa đơn");
    } finally {
      setSaving(false);
      onWorkingChange(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {einvoice.lastError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Lần gửi gần nhất bị lỗi</AlertTitle>
          <AlertDescription className="wrap-anywhere">{einvoice.lastError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Ngày hóa đơn</span>
        {canEdit ? (
          <DatePicker
            value={form.invoiceDate}
            onChange={(invoiceDate) => setForm((f) => ({ ...f, invoiceDate }))}
            min={config?.minInvoiceDate ?? undefined}
            today={toDateInput()}
            label="Ngày hóa đơn"
            className="w-fit"
          />
        ) : (
          <span className="text-sm">{formatDate(form.invoiceDate)}</span>
        )}
        {config?.minInvoiceDate && (
          <span className="text-xs text-muted-foreground">
            Từ {formatDate(config.minInvoiceDate)} trở đi (hóa đơn số {config.latestInvoiceNumber ?? "?"} cùng ký
            hiệu mang ngày này)
          </span>
        )}
        {dateProblem && <span className="text-xs text-warning">{dateProblem}</span>}
      </div>
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
        {missing !== 0 && (
          <>
            <dt className="text-destructive">{missing > 0 ? "Còn thiếu" : "Thừa"}</dt>
            <dd className="text-right text-destructive">{formatMoney(Math.abs(missing))}</dd>
          </>
        )}
      </dl>
      {problem && (amount < 1 || missing === 0) && <p className="text-sm text-destructive">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button onClick={save} disabled={saving || busy || !dirty}>
            {saving && <Spinner data-icon="inline-start" />}
            Lưu nháp
          </Button>
        )}
        {dirty && <span className="text-sm text-muted-foreground">Có thay đổi chưa lưu</span>}
        {canIssue && (
          <IssueControls
            einvoice={einvoice}
            invoiceDate={form.invoiceDate}
            config={config}
            problem={dirty ? "Lưu nháp trước khi xuất" : problem}
            busy={busy}
            onIssued={onSaved}
            onIssuingChange={onWorkingChange}
          />
        )}
      </div>
    </div>
  );
}
