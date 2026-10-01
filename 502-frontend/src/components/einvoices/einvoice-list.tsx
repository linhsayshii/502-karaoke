"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { EinvoiceRow, EinvoiceSummary } from "@/lib/types";

type Tab = "all" | "DRAFT" | "ERROR" | "UNCERTAIN" | "ISSUED";
const TABS: { value: Tab; label: string; count?: keyof EinvoiceSummary }[] = [
  { value: "all", label: "Tất cả" },
  { value: "DRAFT", label: "Nháp", count: "draftCount" },
  { value: "ERROR", label: "Lỗi", count: "errorCount" },
  // With the sends still in flight or cut off (SENDING, badge "Đang gửi"):
  // the server lists and counts them here until opening one settles it.
  { value: "UNCERTAIN", label: "Không rõ", count: "uncertainCount" },
  { value: "ISSUED", label: "Đã xuất", count: "issuedCount" },
];

// Left column (spec §10.1): Tạo HĐĐT mới on top, the invoices below grouped
// by bill. Nháp / Lỗi / Không rõ are pending work: every day, no date box.
// Rendered inside @container/main, so its responsive classes are container
// variants.
export function EinvoiceList({
  version,
  selectedId,
  onSelect,
  onCreate,
}: {
  version: number;
  selectedId: number | null;
  onSelect: (orderId: number, einvoiceId: number) => void;
  onCreate: () => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const [tab, setTab] = useState<Tab>("all");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  // A bill number searches every day (the server ignores the dates then).
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  const dated = tab === "all" || tab === "ISSUED";

  const list = useApiData<EinvoiceRow[]>(
    "/einvoices",
    {
      branch,
      status: tab === "all" ? undefined : tab,
      billNumber: billNumber || undefined,
      ...(dated && !billNumber ? range : {}),
    },
    [],
    "Không thể tải danh sách hóa đơn điện tử",
  );
  // The tab counts: pending work of every day, issued ones of the chosen days
  // (summed in SQL, never from the capped list).
  const summary = useApiData<EinvoiceSummary | null>(
    "/einvoices/summary",
    { branch, ...range },
    null,
    "Không thể tải số hóa đơn",
  );
  const reloadList = list.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (version === 0) return;
    reloadList();
    reloadSummary();
  }, [version, reloadList, reloadSummary]);

  const groups = useMemo(() => {
    const byOrder = new Map<number, EinvoiceRow[]>();
    for (const row of list.data) {
      const group = byOrder.get(row.orderId);
      if (group) group.push(row);
      else byOrder.set(row.orderId, [row]);
    }
    return [...byOrder.values()];
  }, [list.data]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {can(user, "einvoices.write") && (
        <Button onClick={onCreate} className="self-start">
          <PlusIcon data-icon="inline-start" />
          Tạo HĐĐT mới
        </Button>
      )}
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
          className="w-full @md/main:w-44"
        />
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
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
      <ListLimitNotice
        shown={list.data.length}
        total={list.total}
        noun="hóa đơn"
        hint="Chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
      />
      {list.loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FileCheck2Icon}
          title="Không có hóa đơn điện tử"
          description={
            billNumber
              ? "Không có hóa đơn nào cho số bill này."
              : dated
                ? "Chưa có hóa đơn nào cho các bill trong khoảng ngày này."
                : "Không có hóa đơn nào ở trạng thái này."
          }
          className="rounded-xl border"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((rows) => (
            <BillGroup key={rows[0].orderId} rows={rows} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BillGroup({
  rows,
  selectedId,
  onSelect,
}: {
  rows: EinvoiceRow[];
  selectedId: number | null;
  onSelect: (orderId: number, einvoiceId: number) => void;
}) {
  const order = rows[0].order;
  return (
    <li className="rounded-xl border">
      <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-medium">
          {billLabel(order)} · {order.room?.name ?? "—"}
        </span>
        <span className="shrink-0 tabular-nums">{formatMoney(order.finalAmount)}</span>
      </div>
      <ul>
        {rows.map((row) => {
          const badge = einvoiceStatusBadge(row.status, row.lastError);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.orderId, row.id)}
                aria-current={selectedId === row.id ? "true" : undefined}
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/50",
                  selectedId === row.id && "bg-muted",
                )}
              >
                <span className="tabular-nums text-muted-foreground">#{row.id}</span>
                <span className="tabular-nums">{formatMoney(row.amount)}</span>
                <Badge variant={badge.variant}>
                  {badge.label}
                  {row.invoiceNumber ? ` · số ${row.invoiceNumber}` : ""}
                </Badge>
                <span className="ml-auto min-w-0 truncate text-muted-foreground">
                  {row.buyerName ?? "Khách lẻ"}
                  {row.createdBy ? ` · ${row.createdBy.fullName}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
