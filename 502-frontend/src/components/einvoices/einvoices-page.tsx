"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileCheck2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { EinvoiceBillList, type EinvoiceTab } from "@/components/einvoices/einvoice-bill-list";
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
import {
  type BillDetail,
  type BillRef,
  billBody,
  billKey,
  billRefOf,
  billUrl,
  detailRef,
  sameBill,
} from "@/lib/einvoice-bills";
import { billLabel, toDateInput } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Site } from "@/lib/site";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The invoice in the right column, of the open bill.
interface Selection {
  bill: BillRef;
  einvoiceId: number;
}

// What a new draft may carry besides its amount (Gửi lại of an issued one).
interface DraftExtra {
  buyerTaxCode?: string;
  buyerName?: string;
  invoiceDate?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The bill a link opens: ?bill=<orderId> or ?manualBill=<id> (Quản lý bán
// hàng of the report site sends one, with ?day for the list).
function linkedBill(params: URLSearchParams): BillRef | null {
  const order = Number(params.get("bill"));
  if (Number.isInteger(order) && order > 0) return { kind: "order", id: order };
  const manual = Number(params.get("manualBill"));
  if (Number.isInteger(manual) && manual > 0) return { kind: "manual", id: manual };
  return null;
}

// The invoice a bill opens on: the first of the tab it was opened from, else
// the first not issued, else the first (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
function firstOf(detail: BillDetail, tab: EinvoiceTab): number | null {
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

// Hóa đơn điện tử of both sites (spec 2026-10-02-trang-bao-cao-hddt §7.5): the
// main site splits its paid bills; the report site the paid bills holding an
// invoice and its bills thêm tay.
export function EinvoicesPage({ site }: { site: Site }) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const notify = useNotify();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [openBill, setOpenBill] = useState<BillRef | null>(() => linkedBill(searchParams));
  const [initialDay] = useState(() => {
    const day = searchParams.get("day");
    return day && DAY_RE.test(day) ? day : null;
  });
  // The tab the open bill was opened from: it decides the invoice shown first.
  const [openedFrom, setOpenedFrom] = useState<EinvoiceTab>("BILLS");
  // ?einvoice=<id> with the bill: the invoice Quản lý bán hàng was clicked on.
  const [selected, setSelected] = useState<Selection | null>(() => {
    const bill = linkedBill(searchParams);
    const einvoiceId = Number(searchParams.get("einvoice"));
    return bill && Number.isInteger(einvoiceId) && einvoiceId > 0 ? { bill, einvoiceId } : null;
  });
  // Phones show the panel in a Sheet, opened only by tapping an invoice.
  const [sheetOpen, setSheetOpen] = useState(false);
  // A draft just made: the cursor goes to its amount.
  const [focusId, setFocusId] = useState<number | null>(null);
  // billKey of the bill a new draft is being made for.
  const [creating, setCreating] = useState<string | null>(null);
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
  const bill = useApiData<BillDetail | null>(
    openBill === null ? null : billUrl(openBill),
    {},
    null,
    "Không thể tải bill",
  );
  // The answer may still be the previous bill's while the next one loads.
  const billDetail = bill.data && sameBill(openBill, detailRef(bill.data)) ? bill.data : null;
  const explicit = selected && sameBill(selected.bill, openBill) ? selected : null;
  const firstId = !explicit && billDetail && !bill.loading ? firstOf(billDetail, openedFrom) : null;
  // The first invoice of a bill becomes the pick as soon as it shows, so a
  // reload or a change of status never moves the panel (adjusted during render).
  if (firstId !== null && openBill !== null) setSelected({ bill: openBill, einvoiceId: firstId });
  const shown: Selection | null =
    explicit ?? (firstId !== null && openBill !== null ? { bill: openBill, einvoiceId: firstId } : null);

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

  const toggleBill = (ref: BillRef, tab: EinvoiceTab) =>
    run(() => {
      setOpenBill((current) => (sameBill(current, ref) ? null : ref));
      setOpenedFrom(tab);
      setSelected(null);
      setFocusId(null);
    });

  const select = (ref: BillRef, einvoiceId: number) => {
    const open = () => {
      setSelected({ bill: ref, einvoiceId });
      if (isMobile) setSheetOpen(true);
      else requestAnimationFrame(scrollToPanel);
    };
    if (shown?.einvoiceId === einvoiceId) open();
    else run(open);
  };

  // After any write: the lists, the counts and what is open reload.
  const changed = (row: EinvoiceDetail) => {
    setListVersion((v) => v + 1);
    if (sameBill(billRefOf(row), openBill)) bill.reload();
  };
  const panelChanged = (row: EinvoiceDetail) => {
    changed(row);
    // Issuing moves the lower bound of the next invoice date.
    config.reload();
  };

  // + makes a draft at once, many in a row if wanted (spec 2026-10-01 §5.2).
  // The panel follows it unless it holds unsaved edits; + on a bill other than
  // the open one is a switch of bill, so that one asks first.
  const create = (ref: BillRef, amount: number, extra: DraftExtra = {}) => {
    const switching = !sameBill(ref, openBill);
    const go = async () => {
      setCreating(billKey(ref));
      try {
        const res = await api.post<EinvoiceDetail>("/einvoices", { ...billBody(ref), amount, lines: [], ...extra });
        const row = res.data;
        setListVersion((v) => v + 1);
        setFocusId(row.id);
        if (switching) {
          setOpenBill(ref);
          setOpenedFrom("BILLS");
        } else bill.reload();
        if (!dirty || switching) setSelected({ bill: ref, einvoiceId: row.id });
        return true;
      } catch (error) {
        notify.error(error, "Không tạo được hóa đơn");
        return false;
      } finally {
        setCreating(null);
      }
    };
    if (!switching) return go();
    run(() => void go());
    return Promise.resolve(true);
  };

  // Gửi lại of an issued invoice: a new draft of its bill takes its amount and
  // buyer, dated today; the issued one stays. The panel shows an issued
  // invoice, so it holds no unsaved edits and is on the open bill.
  const resend = (row: EinvoiceDetail) =>
    create(billRefOf(row), Number(row.amount), {
      ...(row.buyerTaxCode ? { buyerTaxCode: row.buyerTaxCode } : {}),
      ...(row.buyerName ? { buyerName: row.buyerName } : {}),
      invoiceDate: toDateInput(),
    });

  // A bill thêm tay was cancelled: its drafts are gone with it.
  const billChanged = () => {
    setListVersion((v) => v + 1);
    setDirty(false);
    setSelected(null);
    setSheetOpen(false);
    bill.reload();
  };

  const deleted = (ref: BillRef, einvoiceId: number) => {
    setListVersion((v) => v + 1);
    if (shown?.einvoiceId === einvoiceId) {
      // The edits of a deleted invoice go with it (its delete asked first).
      setDirty(false);
      const siblings = billDetail?.einvoices ?? [];
      const index = siblings.findIndex((e) => e.id === einvoiceId);
      const next = siblings[index + 1] ?? siblings[index - 1];
      setSelected(next ? { bill: ref, einvoiceId: next.id } : null);
      if (!next) setSheetOpen(false);
    }
    if (sameBill(ref, openBill)) bill.reload();
  };

  const panelEinvoice = shown === null ? null : (billDetail?.einvoices.find((e) => e.id === shown.einvoiceId) ?? null);
  const index = panelEinvoice && billDetail ? billDetail.einvoices.findIndex((e) => e.id === panelEinvoice.id) : -1;
  const order = billDetail && "order" in billDetail ? billDetail.order : null;
  const manual = billDetail && "bill" in billDetail ? billDetail.bill : null;
  const panelLocked = bill.loading || (shown !== null && savingIds.includes(shown.einvoiceId));
  const panel =
    shown === null ? null : panelEinvoice ? (
      <EinvoiceIssuePanel
        key={panelEinvoice.id}
        einvoice={panelEinvoice}
        bill={order}
        label={
          site === "report"
            ? `${panelEinvoice.reportNumber}${manual ? ` · Bill ${billLabel(manual)} · ${manual.room?.name ?? "—"}` : ""}`
            : `HĐ ${index + 1}`
        }
        previous={index > 0 && billDetail ? buyerOf(billDetail.einvoices[index - 1]) : null}
        config={config.data}
        busy={panelLocked}
        onChanged={panelChanged}
        onResend={resend}
        onReload={bill.reload}
        onDirtyChange={setDirty}
        onWorkingChange={setPanelWorking}
      />
    ) : bill.loading ? (
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
  // The report site lists a paid bill only while it holds an invoice: without
  // one it has no row, so no + to press, and comes back from the main site.
  const unlisted = emptyBill && site === "report" && order !== null;
  const emptyPanel = (
    <EmptyState
      icon={FileCheck2Icon}
      title={emptyBill ? "Bill chưa có hóa đơn nhỏ" : "Chọn một hóa đơn"}
      description={
        unlisted
          ? "Bill này không có hóa đơn nào ở trang báo cáo. Gửi lại từ trang chính bằng nút Thêm hóa đơn vào báo cáo."
          : can(user, "einvoices.write") && emptyBill
            ? "Bấm + trên dòng bill để thêm hóa đơn nhỏ."
            : "Mở một bill ở cột trái."
      }
      className="rounded-xl border"
    />
  );

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description={
          site === "report"
            ? "Bill đã có hóa đơn điện tử bên trang chính và bill thêm tay: chia ở cột trái, điền và xuất lên Minvoice ở cột phải."
            : "Chia bill đã thanh toán thành các hóa đơn nhỏ ở cột trái, điền và xuất lên Minvoice ở cột phải."
        }
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <div ref={gridRef} className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EinvoiceBillList
            site={site}
            initialDay={initialDay}
            version={listVersion}
            openBill={openBill}
            openBillDetail={billDetail}
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
            onBillChanged={billChanged}
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
