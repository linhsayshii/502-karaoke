"use client";

import { useState } from "react";
import { SearchCheckIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api, { isBadRequest, isSessionEnded } from "@/lib/api";
import { UNKNOWN_RESULT_MESSAGE } from "@/lib/einvoice";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// "Không rõ" (spec §9.2): the send got no answer. The chain manager has
// Minvoice searched again (Kiểm tra lại), or looks there and either types the
// number found or sends the invoice back to draft. Rendered inside the panel's
// @container/einvoice.
export function UncertainBox({
  einvoice,
  config,
  billCompleted,
  busy,
  onChanged,
}: {
  einvoice: EinvoiceDetail;
  config: EinvoiceConfigView | null;
  // A voided bill takes no issue, so its invoice is settled by hand only.
  billCompleted: boolean;
  // The panel is reloading after a write.
  busy: boolean;
  onChanged: (row: EinvoiceDetail) => void;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const [number, setNumber] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [notSentOpen, setNotSentOpen] = useState(false);
  const canIssue = can(user, "einvoices.issue");
  const disabled = working || busy;

  // The server runs its date checks on the request's date even for a search:
  // today, or the newest date of the symbol when that is later.
  const today = toDateInput();
  const min = config?.minInvoiceDate ?? undefined;
  const recheckDate = min && today < min ? min : today;
  const canRecheck = billCompleted && !!config?.configured;

  const resolve = async (body: { found: boolean; invoiceNumber?: number }) => {
    setWorking(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/resolve`, body);
      notify.success(body.found ? `Đã ghi số hóa đơn ${body.invoiceNumber}` : "Đã đưa về nháp, có thể xuất lại");
      onChanged(res.data);
      return true;
    } catch (error) {
      notify.error(error, "Không cập nhật được hóa đơn");
      return false;
    } finally {
      setWorking(false);
    }
  };

  // The answer is the row: found (ISSUED), still uncertain with a hint in
  // lastError, or sent again and refused (DRAFT with the error).
  const recheck = async () => {
    setWorking(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/issue`, {
        invoiceDate: recheckDate,
        confirmFutureDate: recheckDate > today,
      });
      const row = res.data;
      if (row.status === "ISSUED") {
        // Found, but its number clashed with one of ours: none recorded yet.
        if (row.lastError) notify.warning(row.lastError);
        else notify.success(`Đã tìm thấy hóa đơn số ${row.invoiceNumber ?? "?"} trên Minvoice`);
      } else if (row.status === "UNCERTAIN") notify.warning("Vẫn chưa xác định được hóa đơn trên Minvoice");
      else toast.error(row.lastError ?? "Minvoice từ chối hóa đơn");
      onChanged(row);
      return true;
    } catch (error) {
      // As when issuing: only a 400 is known to have sent nothing; otherwise
      // the row is reloaded to show what the server made of it.
      if (isBadRequest(error) || isSessionEnded(error)) {
        notify.error(error, "Không kiểm tra lại được hóa đơn");
        return false;
      }
      notify.warning(UNKNOWN_RESULT_MESSAGE);
      onChanged(einvoice);
      return true;
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Alert className="border-warning">
        <TriangleAlertIcon className="text-warning" />
        <AlertTitle>Không rõ Minvoice đã tạo hóa đơn chưa</AlertTitle>
        <AlertDescription className="flex w-full min-w-0 flex-col gap-3">
          <p>
            Lần gửi ngày {formatDate(einvoice.invoiceDate)}, ký hiệu {einvoice.symbolCode ?? "—"} không nhận được trả
            lời. Mở Minvoice, tìm hóa đơn {formatMoney(einvoice.amount)} của {einvoice.buyerName ?? "khách lẻ"} rồi chọn
            một trong hai.
          </p>
          {/* What the last check found: it may carry the number to type in. */}
          {einvoice.lastError && (
            <p className="w-full rounded-md border border-warning bg-warning/10 p-2 font-medium text-foreground wrap-anywhere">
              {einvoice.lastError}
            </p>
          )}
          {canIssue ? (
            <div className="flex flex-col gap-3">
              {canRecheck && (
                <div>
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => setRecheckOpen(true)}>
                    {working ? <Spinner data-icon="inline-start" /> : <SearchCheckIcon data-icon="inline-start" />}
                    Kiểm tra lại trên Minvoice
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  inputMode="numeric"
                  aria-label="Số hóa đơn trên Minvoice"
                  placeholder="Số hóa đơn"
                  className="w-36"
                  value={number ?? ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setNumber(digits ? Number(digits) : null);
                  }}
                />
                <Button
                  size="sm"
                  disabled={disabled || !number}
                  onClick={() => number && resolve({ found: true, invoiceNumber: number })}
                >
                  Đã có — nhập số
                </Button>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => setNotSentOpen(true)}>
                  Chưa có — gửi lại
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs">Chỉ quản lý hệ thống đối chiếu được hóa đơn này.</p>
          )}
        </AlertDescription>
      </Alert>
      <ConfirmDialog
        open={recheckOpen}
        onOpenChange={setRecheckOpen}
        title="Kiểm tra lại trên Minvoice?"
        description={`Hệ thống tìm hóa đơn theo mã đối chiếu trên Minvoice và ghi số nếu thấy. Chỉ khi chắc chắn chưa có và lần gửi trước đã quá lâu, hóa đơn được gửi lại, mang ngày ${formatDate(recheckDate)}.`}
        confirmLabel="Kiểm tra lại"
        onConfirm={recheck}
      />
      <ConfirmDialog
        open={notSentOpen}
        onOpenChange={setNotSentOpen}
        title="Minvoice chưa có hóa đơn này?"
        description="Hóa đơn về lại nháp để xuất lần nữa. Nếu thật ra Minvoice đã tạo, xuất lại sẽ sinh hóa đơn trùng."
        confirmLabel="Về nháp"
        onConfirm={() => resolve({ found: false })}
      />
    </>
  );
}
