"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { BillSplit } from "@/components/einvoices/bill-split";
import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type {
  EinvoiceBill,
  EinvoiceBillDetail,
  EinvoiceDetail,
  EinvoiceRow as EinvoiceListRow,
  EinvoiceSummary,
} from "@/lib/types";

// "BILLS" lists the paid bills of the days; the others the bills holding an
// invoice of that status (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
export type EinvoiceTab = "BILLS" | "DRAFT" | "ERROR" | "UNCERTAIN" | "ISSUED";
// What a new draft is being made for: a bill, or "free" (no bill).
export type Creating = number | "free" | null;

const TABS: { value: EinvoiceTab; label: string; count?: keyof EinvoiceSummary }[] = [
  { value: "BILLS", label: "Bill" },
  { value: "DRAFT", label: "Nháp", count: "draftCount" },
  { value: "ERROR", label: "Lỗi", count: "errorCount" },
  // With the sends still in flight or cut off (badge "Đang gửi").
  { value: "UNCERTAIN", label: "Không rõ", count: "uncertainCount" },
  { value: "ISSUED", label: "Đã xuất", count: "issuedCount" },
];

// Left column: the bills, each opened in place to split it, and the invoices
// without a bill on top. Rendered inside @container/main, so its responsive
// classes are container variants.
export function EinvoiceBillList({
  version,
  openOrderId,
  openBill,
  selectedId,
  focusId,
  dirtyId,
  creating,
  onToggleBill,
  onSelect,
  onCreate,
  onSaved,
  onDeleted,
}: {
  // Bumped after every write: the lists and counts reload.
  version: number;
  openOrderId: number | null;
  // The open bill once loaded (null meanwhile).
  openBill: EinvoiceBillDetail | null;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  creating: Creating;
  onToggleBill: (orderId: number, tab: EinvoiceTab) => void;
  onSelect: (orderId: number | null, einvoiceId: number) => void;
  // A new draft at once: for a bill with what is left of it, or free at 0.
  onCreate: (orderId: number | null, amount: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (orderId: number | null, einvoiceId: number) => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const canWrite = can(user, "einvoices.write");
  const [tab, setTab] = useState<EinvoiceTab>("BILLS");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  // A bill number searches every day (the server ignores the dates then).
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  // Drafts, errors and uncertain ones are work still to do: every day.
  const dated = tab === "BILLS" || tab === "ISSUED";
  const status = tab === "BILLS" ? undefined : tab;
  const days = dated && !billNumber ? range : {};

  const bills = useApiData<EinvoiceBill[]>(
    "/einvoices/bills",
    { branch, status, billNumber: billNumber || undefined, ...days },
    [],
    "Không thể tải danh sách bill",
  );
  // A bill number never matches a free invoice: the group is not asked for then.
  const free = useApiData<EinvoiceListRow[]>(
    billNumber ? null : "/einvoices",
    { branch, free: 1, status, ...days },
    [],
    "Không thể tải hóa đơn không theo bill",
  );
  // The tab counts: pending work of every day, issued ones of the chosen days
  // (summed in SQL, never from a capped list).
  const summary = useApiData<EinvoiceSummary | null>(
    "/einvoices/summary",
    { branch, ...range },
    null,
    "Không thể tải số hóa đơn",
  );
  const reloadBills = bills.reload;
  const reloadFree = free.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (version === 0) return;
    reloadBills();
    reloadFree();
    reloadSummary();
  }, [version, reloadBills, reloadFree, reloadSummary]);

  const freeRows = billNumber ? [] : free.data;
  // Over more than one day a bill shows its date too.
  const showDate = !dated || !!billNumber || range.from !== range.to;
  const emptyText = billNumber
    ? "Không có bill nào khớp số này."
    : tab === "BILLS"
      ? "Không có bill đã thanh toán trong khoảng ngày này."
      : tab === "ISSUED"
        ? "Không có hóa đơn đã xuất trong khoảng ngày này."
        : "Không có hóa đơn nào ở trạng thái này.";

  const createFree = () => {
    // A new draft shows in the Nháp tab and in the Bill tab of its day;
    // from the other tabs the list moves to Nháp.
    if (tab !== "BILLS" && tab !== "DRAFT") setTab("DRAFT");
    onCreate(null, 0);
  };

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
        <div className="flex min-w-0 flex-1 items-center gap-2 @md/main:flex-none">
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
          {canWrite && (
            <Button
              size="icon"
              variant="outline"
              aria-label="Thêm hóa đơn không theo bill"
              title="Thêm hóa đơn không theo bill"
              disabled={creating === "free"}
              onClick={createFree}
            >
              {creating === "free" ? <Spinner /> : <PlusIcon />}
            </Button>
          )}
        </div>
      </div>
      {freeRows.length > 0 && (
        <section className="rounded-xl border">
          <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-sm">
            <span className="font-medium">Hóa đơn không theo bill</span>
            <span className="tabular-nums text-muted-foreground">{free.total ?? freeRows.length}</span>
          </div>
          <ListLimitNotice shown={freeRows.length} total={free.total} noun="hóa đơn" hint="Chọn khoảng ngày ngắn hơn." />
          <ul>
            {freeRows.map((row) => (
              <EinvoiceRow
                key={row.id}
                einvoice={row}
                label={`HĐ #${row.id}`}
                selected={selectedId === row.id}
                editable
                autoFocus={focusId === row.id}
                forceConfirm={dirtyId === row.id}
                onSelect={() => onSelect(null, row.id)}
                onSaved={onSaved}
                onDeleted={() => onDeleted(null, row.id)}
              />
            ))}
          </ul>
        </section>
      )}
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
      ) : bills.data.length === 0 ? (
        freeRows.length === 0 && (
          <EmptyState icon={FileCheck2Icon} title="Không có bill" description={emptyText} className="rounded-xl border" />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.data.map((bill) => (
            <BillItem
              key={bill.orderId}
              bill={bill}
              open={openOrderId === bill.orderId}
              detail={openBill?.order.id === bill.orderId ? openBill : null}
              showDate={showDate}
              canWrite={canWrite}
              creating={creating === bill.orderId}
              selectedId={selectedId}
              focusId={focusId}
              dirtyId={dirtyId}
              onToggle={() => onToggleBill(bill.orderId, tab)}
              onCreate={onCreate}
              onSelect={(einvoiceId) => onSelect(bill.orderId, einvoiceId)}
              onSaved={onSaved}
              onDeleted={(einvoiceId) => onDeleted(bill.orderId, einvoiceId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BillItem({
  bill,
  open,
  detail,
  showDate,
  canWrite,
  creating,
  selectedId,
  focusId,
  dirtyId,
  onToggle,
  onCreate,
  onSelect,
  onSaved,
  onDeleted,
}: {
  bill: EinvoiceBill;
  open: boolean;
  detail: EinvoiceBillDetail | null;
  showDate: boolean;
  canWrite: boolean;
  creating: boolean;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  onToggle: () => void;
  onCreate: (orderId: number, amount: number) => void;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
}) {
  const total = Number(bill.finalAmount);
  // The open bill, once loaded, is fresher than the list.
  const allocated = detail ? detail.allocated : bill.allocated;
  const count = detail ? detail.einvoices.length : bill.einvoiceCount;
  const label = billLabel({ id: bill.orderId, billNumber: bill.billNumber });
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
                allocated > total && "text-warning",
              )}
            >
              {showDate ? formatDateTime(bill.endTime) : formatTime(bill.endTime)} ·{" "}
              {count ? `Đã chia ${formatMoney(allocated)} · ${count} HĐ` : "Chưa có HĐĐT"}
            </span>
          </span>
          {bill.cancelledAt && <Badge variant="warning">Đã hủy</Badge>}
          <span className="shrink-0 tabular-nums">{formatMoney(bill.finalAmount)}</span>
        </button>
        {canWrite && !bill.cancelledAt && (
          <Button
            size="icon"
            variant="outline"
            aria-label={`Thêm hóa đơn nhỏ cho bill ${label}`}
            title="Thêm hóa đơn nhỏ"
            disabled={creating}
            className={cn(open && "border-primary")}
            onClick={() => onCreate(bill.orderId, Math.max(0, total - allocated))}
          >
            {creating ? <Spinner /> : <PlusIcon />}
          </Button>
        )}
      </div>
      {open &&
        (detail ? (
          <BillSplit
            detail={detail}
            selectedId={selectedId}
            focusId={focusId}
            dirtyId={dirtyId}
            onSelect={onSelect}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <div className="border-t p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
    </li>
  );
}
