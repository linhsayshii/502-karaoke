"use client";

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { formatDate, toDateInput } from "@/lib/format";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// Ngày HĐ + Xuất (chain manager, spec §9.3): the date cannot be before the
// newest invoice of the symbol, has no upper bound, and a date after today
// is confirmed first. The answer is always the row: ISSUED, DRAFT with the
// error, or UNCERTAIN. Rendered inside the panel's @container/einvoice.
export function IssueControls({
  einvoice,
  config,
  problem,
  busy,
  onIssued,
}: {
  einvoice: EinvoiceDetail;
  config: EinvoiceConfigView | null;
  // Why the draft cannot go out yet (unsaved, lines not matching…), or null.
  problem: string | null;
  // The panel is reloading after a write: nothing more is sent meanwhile.
  busy: boolean;
  onIssued: (row: EinvoiceDetail) => void;
}) {
  const notify = useNotify();
  // The calendar day, not the business day (plan decision 8).
  const today = toDateInput();
  const min = config?.minInvoiceDate ?? undefined;
  // Nothing picked yet follows the config, which may arrive after this mounts,
  // and a pick that the config has since outdated falls back to it.
  const [picked, setPicked] = useState<string | null>(null);
  const floor = min && today < min ? min : today;
  const date = picked && (!min || picked >= min) ? picked : floor;
  const [issuing, setIssuing] = useState(false);
  const [confirmFuture, setConfirmFuture] = useState(false);
  const blocked = !config?.configured ? "Minvoice chưa được cấu hình cho cơ sở này" : problem;

  const send = async () => {
    setIssuing(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/issue`, {
        invoiceDate: date,
        confirmFutureDate: date > today,
      });
      const row = res.data;
      if (row.status === "ISSUED") notify.success(`Đã xuất hóa đơn số ${row.invoiceNumber ?? "?"}`);
      else if (row.status === "UNCERTAIN") {
        notify.warning("Không rõ Minvoice đã tạo hóa đơn chưa. Hãy đối chiếu trên Minvoice.");
      } else toast.error(row.lastError ?? "Minvoice từ chối hóa đơn");
      onIssued(row);
      return true;
    } catch (error) {
      notify.error(error, "Không xuất được hóa đơn");
      return false;
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1 @md/einvoice:ml-auto @md/einvoice:w-auto @md/einvoice:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker value={date} onChange={setPicked} min={min} today={today} label="Ngày hóa đơn" align="end" />
        <Button onClick={() => (date > today ? setConfirmFuture(true) : void send())} disabled={issuing || busy || !!blocked}>
          {issuing ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          Xuất
        </Button>
      </div>
      {min && (
        <span className="text-xs text-muted-foreground @md/einvoice:text-right">
          Từ {formatDate(min)} trở đi (hóa đơn số {config?.latestInvoiceNumber ?? "?"} cùng ký hiệu mang ngày này)
        </span>
      )}
      {blocked && <span className="text-xs text-muted-foreground @md/einvoice:text-right">{blocked}</span>}
      <ConfirmDialog
        open={confirmFuture}
        onOpenChange={setConfirmFuture}
        title="Xuất với ngày sau hôm nay?"
        description={`Mọi hóa đơn sau cùng ký hiệu ${config?.symbolCode ?? ""} sẽ phải mang ngày từ ${formatDate(date)} trở đi.`}
        confirmLabel="Xuất"
        onConfirm={send}
      />
    </div>
  );
}
