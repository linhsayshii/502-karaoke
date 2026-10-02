"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { BillSplit, ManualBillSplit } from "@/components/einvoices/bill-split";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { type BillDetail, type BillRef, billKey, sameBill } from "@/lib/einvoice-bills";
import { billLabel, businessDate, formatDate, formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Site } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { EinvoiceBill, EinvoiceDetail, EinvoiceSummary, ReportSiteBill } from "@/lib/types";

// "BILLS" lists the bills of the days; the others the bills holding an
// invoice of that status (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
export type EinvoiceTab = "BILLS" | "DRAFT" | "ERROR" | "UNCERTAIN" | "ISSUED";

const TABS: { value: EinvoiceTab; label: string; count?: keyof EinvoiceSummary }[] = [
  { value: "BILLS", label: "Bill" },
  { value: "DRAFT", label: "Nháp", count: "draftCount" },
  { value: "ERROR", label: "Lỗi", count: "errorCount" },
  // With the sends still in flight or cut off (badge "Đang gửi").
  { value: "UNCERTAIN", label: "Không rõ", count: "uncertainCount" },
  { value: "ISSUED", label: "Đã xuất", count: "issuedCount" },
];

// A bill of the left column, from the list of either site.
interface ListedBill {
  ref: BillRef;
  billNumber: string | null;
  roomName: string | null;
  // When a paid bill was paid; a bill thêm tay shows its day instead.
  time: string | null;
  businessDate: string | null;
  cancelledAt: string | null;
  // The bill's own total; null for a bill thêm tay, whose invoices are its total.
  finalAmount: number | null;
  allocated: number;
  einvoiceCount: number;
}

// GET /einvoices/bills (main site): the paid bills.
const fromMainList = (bill: EinvoiceBill): ListedBill => ({
  ref: { kind: "order", id: bill.orderId },
  billNumber: bill.billNumber,
  roomName: bill.roomName,
  time: bill.endTime,
  businessDate: null,
  cancelledAt: bill.cancelledAt,
  finalAmount: Number(bill.finalAmount),
  allocated: bill.allocated,
  einvoiceCount: bill.einvoiceCount,
});

// GET /report-site/bills: paid bills holding an invoice, and bills thêm tay.
const fromReportList = (bill: ReportSiteBill): ListedBill => ({
  ref:
    bill.manualBillId !== null
      ? { kind: "manual", id: bill.manualBillId }
      : { kind: "order", id: bill.orderId as number },
  billNumber: bill.billNumber,
  roomName: bill.roomName,
  time: bill.time,
  businessDate: bill.businessDate,
  cancelledAt: bill.cancelledAt,
  finalAmount: bill.finalAmount,
  allocated: bill.allocated,
  einvoiceCount: bill.einvoiceCount,
});

// Left column: the bills, each opened in place to split it. On the report
// site (spec 2026-10-02 §7.5) the paid bills holding an invoice and the bills
// thêm tay. Rendered inside @container/main, so its responsive classes are
// container variants.
export function EinvoiceBillList({
  site,
  initialDay,
  version,
  openBill,
  openBillDetail,
  openBillLoading,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  savingIds,
  creating,
  onToggleBill,
  onSelect,
  onCreate,
  onSaved,
  onDeleted,
  onSavingChange,
  onBillChanged,
}: {
  site: Site;
  // The day listed first (a link from Quản lý bán hàng); today's business day otherwise.
  initialDay: string | null;
  // Bumped after every write: the lists and counts reload.
  version: number;
  openBill: BillRef | null;
  // The open bill once loaded (null meanwhile), and whether it is being read.
  openBillDetail: BillDetail | null;
  openBillLoading: boolean;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  // The invoice the panel is saving or issuing: its amount box waits.
  lockedId: number | null;
  // The invoices whose amount is being saved: the + of their bill waits.
  savingIds: number[];
  // billKey of the bill a new draft is being made for.
  creating: string | null;
  onToggleBill: (bill: BillRef, tab: EinvoiceTab) => void;
  onSelect: (bill: BillRef, einvoiceId: number) => void;
  // A new draft at once: what is left of a paid bill, 0 for a bill thêm tay.
  onCreate: (bill: BillRef, amount: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (bill: BillRef, einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
  // A bill thêm tay was cancelled: the lists and the open bill reload.
  onBillChanged: () => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const canWrite = can(user, "einvoices.write");
  const report = site === "report";
  const [tab, setTab] = useState<EinvoiceTab>("BILLS");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const day = initialDay ?? businessDate();
    return { from: day, to: day };
  });
  const [search, setSearch] = useState("");
  // A bill number searches every day (the server ignores the dates then).
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  // Drafts, errors and uncertain ones are work still to do: every day.
  const dated = tab === "BILLS" || tab === "ISSUED";
  const status = tab === "BILLS" ? undefined : tab;
  const days = dated && !billNumber ? range : {};

  const bills = useApiData<(EinvoiceBill | ReportSiteBill)[]>(
    report ? "/report-site/bills" : "/einvoices/bills",
    { branch, status, billNumber: billNumber || undefined, ...days },
    [],
    "Không thể tải danh sách bill",
  );
  const rows = report
    ? (bills.data as ReportSiteBill[]).map(fromReportList)
    : (bills.data as EinvoiceBill[]).map(fromMainList);
  // The tab counts: pending work of every day, issued ones of the chosen days
  // (summed in SQL, never from a capped list).
  const summary = useApiData<EinvoiceSummary | null>(
    report ? "/report-site/bills/summary" : "/einvoices/summary",
    { branch, ...range },
    null,
    "Không thể tải số hóa đơn",
  );
  const reloadBills = bills.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (version === 0) return;
    reloadBills();
    reloadSummary();
  }, [version, reloadBills, reloadSummary]);

  // Over more than one day a bill shows its date too.
  const showDate = !dated || !!billNumber || range.from !== range.to;
  const emptyText = billNumber
    ? "Không có bill nào khớp số này."
    : tab === "BILLS"
      ? report
        ? "Không có bill có hóa đơn điện tử hay bill thêm tay trong khoảng ngày này."
        : "Không có bill đã thanh toán trong khoảng ngày này."
      : tab === "ISSUED"
        ? "Không có hóa đơn đã xuất trong khoảng ngày này."
        : "Không có hóa đơn nào ở trạng thái này.";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tabs value={tab} onValueChange={(value) => setTab(value as EinvoiceTab)}>
        {/* The list's own h-9 is set for the horizontal orientation, so the override carries the same variant. */}
        <TabsList className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
          {TABS.map((t) => {
            const count = t.count && summary.data ? summary.data[t.count] : 0;
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {count ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        {dated && !billNumber ? (
          <DateRangePicker value={range} onChange={setRange} />
        ) : (
          <span className="text-sm text-muted-foreground">Mọi ngày</span>
        )}
        <Input
          type="search"
          inputMode="numeric"
          placeholder="Tìm số bill…"
          aria-label="Tìm theo số bill"
          maxLength={15}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 @md/main:w-44 @md/main:flex-none"
        />
      </div>
      <ListLimitNotice
        shown={bills.data.length}
        total={bills.total}
        noun="bill"
        hint="Chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
      />
      {/* Skeleton only before the first answer: a reload after a write keeps
          the list, so an open bill and a focused amount box stay put. */}
      {bills.loading && bills.data.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileCheck2Icon} title="Không có bill" description={emptyText} className="rounded-xl border" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((bill) => {
            const open = sameBill(openBill, bill.ref);
            return (
              <BillItem
                key={billKey(bill.ref)}
                bill={bill}
                open={open}
                detail={open ? openBillDetail : null}
                detailLoading={open && openBillLoading}
                showDate={showDate}
                canWrite={canWrite}
                creating={creating === billKey(bill.ref)}
                selectedId={selectedId}
                focusId={focusId}
                dirtyId={dirtyId}
                lockedId={lockedId}
                savingIds={savingIds}
                onToggle={() => onToggleBill(bill.ref, tab)}
                onCreate={onCreate}
                onSelect={(einvoiceId) => onSelect(bill.ref, einvoiceId)}
                onSaved={onSaved}
                onDeleted={(einvoiceId) => onDeleted(bill.ref, einvoiceId)}
                onSavingChange={onSavingChange}
                numbered={report}
                onBillChanged={onBillChanged}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BillItem({
  bill,
  open,
  detail,
  detailLoading,
  showDate,
  canWrite,
  creating,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  savingIds,
  onToggle,
  onCreate,
  onSelect,
  onSaved,
  onDeleted,
  onSavingChange,
  numbered,
  onBillChanged,
}: {
  bill: ListedBill;
  open: boolean;
  detail: BillDetail | null;
  // The bill is open and being read again (after a write, or just opened).
  detailLoading: boolean;
  showDate: boolean;
  canWrite: boolean;
  creating: boolean;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  lockedId: number | null;
  savingIds: number[];
  onToggle: () => void;
  onCreate: (bill: BillRef, amount: number) => void;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
  // The report site names each invoice by its own number.
  numbered: boolean;
  onBillChanged: () => void;
}) {
  const manual = bill.ref.kind === "manual";
  const total = bill.finalAmount;
  // The open bill, once loaded, is fresher than the list.
  const allocated = detail ? detail.allocated : bill.allocated;
  const count = detail ? detail.einvoices.length : bill.einvoiceCount;
  const label = billLabel({ id: bill.ref.id, billNumber: bill.billNumber });
  // + hands out what is left of the bill, so it waits until that is known: its
  // own create, a read of the bill, or an amount of its invoices being saved.
  const plusBusy = creating || detailLoading || !!detail?.einvoices.some((e) => savingIds.includes(e.id));
  const when = manual ? formatDate(bill.businessDate) : showDate ? formatDateTime(bill.time) : formatTime(bill.time);
  const split = !count
    ? "Chưa có HĐĐT"
    : total === null
      ? `${count} HĐ`
      : `Đã chia ${formatMoney(allocated)} · ${count} HĐ`;
  const rows = { selectedId, focusId, dirtyId, lockedId, numbered, onSelect, onSaved, onDeleted, onSavingChange };
  return (
    <li className="rounded-xl border">
      <div className="flex items-center gap-2 py-1 pr-2 pl-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted/50"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {label} · {bill.roomName ?? "—"}
            </span>
            <span
              className={cn(
                "block truncate text-xs text-muted-foreground tabular-nums",
                total !== null && allocated > total && "text-warning",
              )}
            >
              {when} · {split}
            </span>
          </span>
          {manual && <Badge variant="outline">Thêm tay</Badge>}
          {bill.cancelledAt && <Badge variant="warning">Đã hủy</Badge>}
          <span className="shrink-0 tabular-nums">{formatMoney(total ?? allocated)}</span>
        </button>
        {canWrite && !bill.cancelledAt && (
          <Button
            size="icon"
            variant="outline"
            aria-label={`Thêm hóa đơn nhỏ cho bill ${label}`}
            title="Thêm hóa đơn nhỏ"
            disabled={plusBusy}
            className={cn(open && "border-primary")}
            onClick={() => onCreate(bill.ref, total === null ? 0 : Math.max(0, total - allocated))}
          >
            {creating ? <Spinner /> : <PlusIcon />}
          </Button>
        )}
      </div>
      {open &&
        (detail ? (
          "order" in detail ? (
            <BillSplit detail={detail} {...rows} />
          ) : (
            <ManualBillSplit detail={detail} canWrite={canWrite} onCancelled={onBillChanged} {...rows} />
          )
        ) : (
          <div className="border-t p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
    </li>
  );
}
