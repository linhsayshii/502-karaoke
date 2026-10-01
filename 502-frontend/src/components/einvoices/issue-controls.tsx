"use client";

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api, { isBadRequest, isSessionEnded } from "@/lib/api";
import { invoiceDateProblem, UNKNOWN_RESULT_MESSAGE } from "@/lib/einvoice";
import { formatDate, toDateInput } from "@/lib/format";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// Xuất (chain manager, spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §2, §5.3):
// a draft dated today goes out at once; any other date first asks whether to
// issue it today instead. Keeping a date after today is the confirmation the
// server wants (confirmFutureDate). The answer is always the row: ISSUED,
// DRAFT with the error, or UNCERTAIN. Rendered inside the panel's
// @container/einvoice.
export function IssueControls({
  einvoice,
  invoiceDate,
  config,
  problem,
  busy,
  onIssued,
  onIssuingChange,
}: {
  einvoice: EinvoiceDetail;
  // YYYY-MM-DD, the calendar day saved with the draft.
  invoiceDate: string;
  config: EinvoiceConfigView | null;
  // Why the draft cannot go out yet (unsaved, lines not matching…), or null.
  problem: string | null;
  // The panel is reloading after a write: nothing more is sent meanwhile.
  busy: boolean;
  onIssued: (row: EinvoiceDetail) => void;
  // Told while a send is running: the invoice's amount in the left column waits.
  onIssuingChange: (issuing: boolean) => void;
}) {
  const notify = useNotify();
  // The calendar day, not the business day.
  const today = toDateInput();
  const [issuing, setIssuing] = useState(false);
  const [asking, setAsking] = useState(false);
  const blocked = !config?.configured ? "Minvoice chưa được cấu hình cho cơ sở này" : problem;
  // An answer whose date the server would refuse is not offered.
  const keepProblem = invoiceDateProblem(invoiceDate, config);
  const todayProblem = invoiceDateProblem(today, config);

  const send = async (date: string) => {
    setIssuing(true);
    onIssuingChange(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/issue`, {
        invoiceDate: date,
        confirmFutureDate: date > today,
      });
      const row = res.data;
      if (row.status === "ISSUED") {
        // Issued, but Minvoice's number clashed with one of ours: no number yet.
        if (row.lastError) notify.warning(row.lastError);
        else notify.success(`Đã xuất hóa đơn số ${row.invoiceNumber ?? "?"}`);
      } else if (row.status === "UNCERTAIN") {
        notify.warning("Không rõ Minvoice đã tạo hóa đơn chưa. Hãy đối chiếu trên Minvoice.");
      } else toast.error(row.lastError ?? "Minvoice từ chối hóa đơn");
      onIssued(row);
      return true;
    } catch (error) {
      // A 400 is a refusal before anything was sent. Anything else may have
      // reached Minvoice, so the row is reloaded instead of calling it failed.
      if (isBadRequest(error) || isSessionEnded(error)) {
        notify.error(error, "Không xuất được hóa đơn");
        return false;
      }
      notify.warning(UNKNOWN_RESULT_MESSAGE);
      onIssued(einvoice);
      return true;
    } finally {
      setIssuing(false);
      onIssuingChange(false);
    }
  };

  // One answer of the question: a refusal before anything was sent (400)
  // keeps it open, anything else closes it.
  const answer = async (date: string) => {
    if (await send(date)) setAsking(false);
  };

  return (
    <div className="flex w-full flex-col gap-1 @md/einvoice:ml-auto @md/einvoice:w-auto @md/einvoice:items-end">
      <Button
        className="self-start @md/einvoice:self-end"
        onClick={() => (invoiceDate === today ? void send(today) : setAsking(true))}
        disabled={issuing || busy || !!blocked}
      >
        {issuing ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
        Xuất
      </Button>
      {blocked && <span className="text-xs text-muted-foreground @md/einvoice:text-right">{blocked}</span>}
      <AlertDialog open={asking} onOpenChange={(open) => !issuing && setAsking(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đổi ngày hóa đơn về hôm nay?</AlertDialogTitle>
            <AlertDialogDescription>
              Ngày hóa đơn đang là {formatDate(invoiceDate)}, không phải hôm nay ({formatDate(today)}).
              {keepProblem
                ? ` Không giữ được ngày này: ${keepProblem}.`
                : invoiceDate > today &&
                  ` Giữ ngày này thì mọi hóa đơn sau cùng ký hiệu ${config?.symbolCode ?? ""} phải mang ngày từ ${formatDate(invoiceDate)} trở đi.`}
              {todayProblem && ` Không đổi về hôm nay được: ${todayProblem}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={issuing}>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              disabled={issuing || !!keepProblem}
              onClick={(e) => {
                e.preventDefault();
                void answer(invoiceDate);
              }}
            >
              Giữ {formatDate(invoiceDate)}
            </AlertDialogAction>
            <AlertDialogAction
              disabled={issuing || !!todayProblem}
              onClick={(e) => {
                e.preventDefault();
                void answer(today);
              }}
            >
              {issuing && <Spinner data-icon="inline-start" />}
              Đổi về hôm nay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
