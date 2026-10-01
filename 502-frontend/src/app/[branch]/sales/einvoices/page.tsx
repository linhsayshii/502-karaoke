"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileCheck2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { EinvoiceBillList, type Creating, type EinvoiceTab } from "@/components/einvoices/einvoice-bill-list";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { buyerOf, EinvoiceIssuePanel } from "@/components/einvoices/einvoice-issue-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The invoice in the right column; orderId null is a free invoice.
interface Selection {
  orderId: number | null;
  einvoiceId: number;
}

// The invoice a bill opens on: the first of the tab it was opened from, else
// the first not issued, else the first (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
function firstOf(detail: EinvoiceBillDetail, tab: EinvoiceTab): number | null {
  const matches = (e: EinvoiceDetail) =>
    tab === "DRAFT"
      ? e.status === "DRAFT" && !e.lastError
      : tab === "ERROR"
        ? e.status === "DRAFT" && !!e.lastError
        : tab === "UNCERTAIN"
          ? e.status === "UNCERTAIN" || e.status === "SENDING"
          : tab === "ISSUED"
            ? e.status === "ISSUED"
            : false;
  const { einvoices } = detail;
  return (einvoices.find(matches) ?? einvoices.find((e) => e.status !== "ISSUED") ?? einvoices[0])?.id ?? null;
}

export default function EinvoicesPage() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const notify = useNotify();
  const isMobile = useIsMobile();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  // The tab the open bill was opened from: it decides the invoice shown first.
  const [openedFrom, setOpenedFrom] = useState<EinvoiceTab>("BILLS");
  const [selected, setSelected] = useState<Selection | null>(null);
  // Phones show the panel in a Sheet, opened only by tapping an invoice.
  const [sheetOpen, setSheetOpen] = useState(false);
  // A draft just made: the cursor goes to its amount.
  const [focusId, setFocusId] = useState<number | null>(null);
  const [creating, setCreating] = useState<Creating>(null);
  // Bumped after every write so the lists and counts reload.
  const [listVersion, setListVersion] = useState(0);
  // Unsaved edits in the panel. Closing or reloading the tab asks through
  // beforeunload, and every switch inside the page through run(); leaving
  // through the sidebar is not guarded.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  // The panel is saving or issuing its invoice: that invoice's amount box in the
  // left column waits (the two PATCHes would overwrite each other).
  const [panelWorking, setPanelWorking] = useState(false);
  // The invoices whose amount box is being saved: the panel's save and the +
  // of their bill wait for the saved row to be back.
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const rowSaving = useCallback(
    (einvoiceId: number, saving: boolean) =>
      setSavingIds((ids) => (saving ? [...ids, einvoiceId] : ids.filter((id) => id !== einvoiceId))),
    [],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // One read of the open bill serves both columns.
  const bill = useApiData<EinvoiceBillDetail | null>(
    openOrderId === null ? null : `/einvoices/bill/${openOrderId}`,
    {},
    null,
    "Không thể tải bill",
  );
  // The answer may still be the previous bill's while the next one loads.
  const billDetail = openOrderId !== null && bill.data?.order.id === openOrderId ? bill.data : null;
  const explicit = selected && (selected.orderId === null || selected.orderId === openOrderId) ? selected : null;
  const firstId = !explicit && billDetail && !bill.loading ? firstOf(billDetail, openedFrom) : null;
  // The first invoice of a bill becomes the pick as soon as it shows, so a
  // reload or a change of status never moves the panel (adjusted during render).
  if (firstId !== null && openOrderId !== null) setSelected({ orderId: openOrderId, einvoiceId: firstId });
  const shown: Selection | null =
    explicit ?? (firstId !== null && openOrderId !== null ? { orderId: openOrderId, einvoiceId: firstId } : null);
  const freeId = shown?.orderId === null ? shown.einvoiceId : null;
  const free = useApiData<EinvoiceDetail | null>(
    freeId === null ? null : `/einvoices/${freeId}`,
    {},
    null,
    "Không thể tải hóa đơn",
  );
  const freeDetail = freeId !== null && free.data?.id === freeId ? free.data : null;

  // Every switch of bill or invoice asks first while the panel holds unsaved edits.
  const run = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };

  // The panel sits beside the list from @4xl/main up and under it below that
  // (the list can be long): there a pick brings the panel into view.
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollToPanel = () => {
    const list = gridRef.current?.firstElementChild;
    const panelBox = panelRef.current;
    if (!list || !panelBox) return;
    const stacked = panelBox.getBoundingClientRect().top > list.getBoundingClientRect().top + 1;
    if (stacked) panelBox.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleBill = (orderId: number, tab: EinvoiceTab) =>
    run(() => {
      setOpenOrderId((current) => (current === orderId ? null : orderId));
      setOpenedFrom(tab);
      setSelected(null);
      setFocusId(null);
    });

  const select = (orderId: number | null, einvoiceId: number) => {
    const open = () => {
      setSelected({ orderId, einvoiceId });
      if (isMobile) setSheetOpen(true);
      else requestAnimationFrame(scrollToPanel);
    };
    if (shown?.einvoiceId === einvoiceId) open();
    else run(open);
  };

  // After any write: the lists, the counts and what is open reload.
  const changed = (row: EinvoiceDetail) => {
    setListVersion((v) => v + 1);
    if (row.orderId === null) {
      if (row.id === freeId) free.reload();
    } else if (row.orderId === openOrderId) bill.reload();
  };
  const panelChanged = (row: EinvoiceDetail) => {
    changed(row);
    // Issuing moves the lower bound of the next invoice date.
    config.reload();
  };

  // + makes a draft at once, many in a row if wanted (spec §5.2). The panel
  // follows it unless it holds unsaved edits; + on a bill other than the open
  // one is a switch of bill, so that one asks first.
  const create = (orderId: number | null, amount: number) => {
    const switching = orderId !== null && orderId !== openOrderId;
    const go = async () => {
      setCreating(orderId ?? "free");
      try {
        const res = await api.post<EinvoiceDetail>(
          "/einvoices",
          { ...(orderId === null ? {} : { orderId }), amount, lines: [] },
          { params: { branch } },
        );
        const row = res.data;
        setListVersion((v) => v + 1);
        setFocusId(row.id);
        if (orderId !== null) {
          if (orderId === openOrderId) bill.reload();
          else {
            setOpenOrderId(orderId);
            setOpenedFrom("BILLS");
          }
        }
        if (!dirty || switching) setSelected({ orderId, einvoiceId: row.id });
      } catch (error) {
        notify.error(error, "Không tạo được hóa đơn");
      } finally {
        setCreating(null);
      }
    };
    if (switching) run(() => void go());
    else void go();
  };

  const deleted = (orderId: number | null, einvoiceId: number) => {
    setListVersion((v) => v + 1);
    if (shown?.einvoiceId === einvoiceId) {
      // The edits of a deleted invoice go with it (its delete asked first).
      setDirty(false);
      const siblings = orderId !== null ? (billDetail?.einvoices ?? []) : [];
      const index = siblings.findIndex((e) => e.id === einvoiceId);
      const next = siblings[index + 1] ?? siblings[index - 1];
      setSelected(next ? { orderId, einvoiceId: next.id } : null);
      if (!next) setSheetOpen(false);
    }
    if (orderId !== null) bill.reload();
  };

  const panelEinvoice =
    shown === null
      ? null
      : shown.orderId === null
        ? freeDetail
        : (billDetail?.einvoices.find((e) => e.id === shown.einvoiceId) ?? null);
  const index =
    shown !== null && shown.orderId !== null && billDetail
      ? billDetail.einvoices.findIndex((e) => e.id === shown.einvoiceId)
      : -1;
  const panelBusy = bill.loading || free.loading;
  const panelLocked = panelBusy || (shown !== null && savingIds.includes(shown.einvoiceId));
  const panel =
    shown === null ? null : panelEinvoice ? (
      <EinvoiceIssuePanel
        key={panelEinvoice.id}
        einvoice={panelEinvoice}
        bill={shown.orderId === null ? null : (billDetail?.order ?? null)}
        label={shown.orderId === null ? `HĐ tự do #${panelEinvoice.id}` : `HĐ ${index + 1}`}
        previous={index > 0 && billDetail ? buyerOf(billDetail.einvoices[index - 1]) : null}
        config={config.data}
        busy={panelLocked}
        onChanged={panelChanged}
        onReload={() => (shown.orderId === null ? free.reload() : bill.reload())}
        onDirtyChange={setDirty}
        onWorkingChange={setPanelWorking}
      />
    ) : panelBusy ? (
      <Skeleton className="h-96 w-full rounded-xl" />
    ) : (
      <EmptyState
        icon={FileCheck2Icon}
        title="Hóa đơn không còn"
        description="Chọn một hóa đơn khác."
        className="rounded-xl border"
      />
    );
  const emptyBill = billDetail !== null && billDetail.einvoices.length === 0;
  const emptyPanel = (
    <EmptyState
      icon={FileCheck2Icon}
      title={emptyBill ? "Bill chưa có hóa đơn nhỏ" : "Chọn một hóa đơn"}
      description={
        !can(user, "einvoices.write")
          ? "Mở một bill ở cột trái."
          : emptyBill
            ? "Bấm + trên dòng bill để thêm hóa đơn nhỏ."
            : "Mở một bill ở cột trái, hoặc bấm + cạnh ô tìm để tạo hóa đơn không theo bill."
      }
      className="rounded-xl border"
    />
  );

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description="Chia bill đã thanh toán thành các hóa đơn nhỏ ở cột trái, điền và xuất lên Minvoice ở cột phải."
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <div ref={gridRef} className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EinvoiceBillList
            version={listVersion}
            openOrderId={openOrderId}
            openBill={billDetail}
            openBillLoading={bill.loading}
            selectedId={shown?.einvoiceId ?? null}
            focusId={focusId}
            dirtyId={dirty ? (shown?.einvoiceId ?? null) : null}
            lockedId={panelWorking ? (shown?.einvoiceId ?? null) : null}
            savingIds={savingIds}
            creating={creating}
            onToggleBill={toggleBill}
            onSelect={select}
            onCreate={create}
            onSaved={changed}
            onDeleted={deleted}
            onSavingChange={rowSaving}
          />
          {!isMobile && (
            <div ref={panelRef} className="min-w-0 scroll-mt-[calc(var(--header-height)+1rem)]">
              {panel ?? emptyPanel}
            </div>
          )}
        </div>
      </div>
      {isMobile && (
        <Sheet open={sheetOpen && panel !== null} onOpenChange={(value) => !value && run(() => setSheetOpen(false))}>
          {/* The panel scrolls under a fixed title row, which keeps the close
              button clear of the panel's header. */}
          <SheetContent side="bottom" className="h-[100dvh] gap-0 p-0">
            <SheetHeader className="border-b py-3 pr-12">
              <SheetTitle>Xuất hóa đơn điện tử</SheetTitle>
              <SheetDescription className="sr-only">Ngày, người mua, dòng hàng và xuất hóa đơn đang chọn</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          setDirty(false);
          pending?.();
          setPending(null);
        }}
      />
    </>
  );
}
