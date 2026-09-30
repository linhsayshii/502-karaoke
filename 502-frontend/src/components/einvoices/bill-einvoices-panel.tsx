"use client";

import { useCallback, useState } from "react";
import { FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import type { BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceEditor } from "@/components/einvoices/einvoice-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { billLabel, formatDateTime, formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The buyer of the invoice before, for "Chép từ HĐ trước" (none when it was a
// khách lẻ: there is nothing to copy). An issued one has no draft left, so
// only its MST and name.
const buyerOf = (einvoice: EinvoiceDetail | undefined): BuyerValue | null => {
  if (!einvoice) return null;
  const buyer = {
    buyerTaxCode: einvoice.buyerTaxCode ?? "",
    buyerName: einvoice.buyerName ?? "",
    buyerAddress: einvoice.draft?.buyerAddress ?? "",
    buyerEmail: einvoice.draft?.buyerEmail ?? "",
  };
  return Object.values(buyer).some(Boolean) ? buyer : null;
};

const DOT: Record<string, string> = {
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
};

// A bill and its small invoices (spec §10.2): the header with what is split,
// HĐ 1, HĐ 2… and + to add one, then the chosen invoice. Rendered both inline
// in @container/main and in the phone Sheet (portaled outside it), so it is its
// own container: the editor inside lays itself out by the panel's width.
export function BillEinvoicesPanel({
  orderId,
  initialEinvoiceId,
  config,
  onChanged,
  onDirtyChange,
  onActiveChange,
}: {
  orderId: number;
  initialEinvoiceId: number | "new";
  config: EinvoiceConfigView | null;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  // The invoice shown, so the page's list marks it and a click on it there
  // is known to change nothing.
  onActiveChange?: (id: number | "new") => void;
}) {
  const { user } = useAuth();
  const { data, loading, reload } = useApiData<EinvoiceBillDetail | null>(
    `/einvoices/bill/${orderId}`,
    {},
    null,
    "Không thể tải bill",
  );
  const [activeId, setActiveId] = useState<number | "new">(initialEinvoiceId);
  // Bumped by Bỏ on the only (new) invoice, so the editor starts again empty.
  const [fresh, setFresh] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingId, setPendingId] = useState<number | "new" | null>(null);

  const handleDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  const activate = (id: number | "new") => {
    setActiveId(id);
    onActiveChange?.(id);
  };
  const choose = (id: number | "new") => {
    if (id === activeId) return;
    if (dirty) setPendingId(id);
    else activate(id);
  };
  const afterWrite = (id: number | "new") => {
    reload();
    onChanged();
    activate(id);
  };

  if (!data) {
    return loading ? (
      <Skeleton className="h-96 w-full rounded-xl" />
    ) : (
      <EmptyState
        icon={FileCheck2Icon}
        title="Không tải được bill"
        description="Chọn lại hóa đơn trong danh sách."
        className="rounded-xl border"
      />
    );
  }
  const { order, einvoices, allocated } = data;
  const index = activeId === "new" ? einvoices.length : einvoices.findIndex((e) => e.id === activeId);
  const active = activeId === "new" ? null : (einvoices[index] ?? null);
  const billTotal = Number(order.finalAmount);
  const editedAfter = !!order.editedAt && einvoices.some((e) => e.createdAt < (order.editedAt as string));
  const canAdd = can(user, "einvoices.write") && order.status === "COMPLETED";

  const deleted = (id: number | null) => {
    const next = einvoices.find((e) => e.id !== id)?.id ?? "new";
    if (id !== null) afterWrite(next);
    // Bỏ on a new invoice: nothing was saved, nothing to reload.
    else if (next === "new") setFresh((n) => n + 1);
    else activate(next);
  };

  return (
    <div className="@container/einvoice flex min-w-0 flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">
            Bill {billLabel(order)} · {order.room?.name ?? "—"}
          </div>
          <div className="text-sm text-muted-foreground">Thanh toán {formatDateTime(order.endTime)}</div>
        </div>
        <div className="text-sm tabular-nums @md/einvoice:text-right">
          <div>
            Tổng {formatMoney(order.finalAmount)} (VAT {formatMoney(order.taxAmount)})
          </div>
          <div className="text-muted-foreground">
            Đã chia {formatMoney(allocated)} · Còn {formatMoney(billTotal - allocated)}
          </div>
        </div>
      </div>
      {(Number(order.discountAmount) > 0 || Number(order.hourlyDiscountAmount) > 0) && (
        <p className="text-xs text-muted-foreground">
          Giảm giá trên bill: món {formatMoney(order.discountAmount)}, giờ {formatMoney(order.hourlyDiscountAmount)}.
        </p>
      )}
      {allocated > billTotal && (
        <p className="text-sm text-warning">
          Tổng các hóa đơn ({formatMoney(allocated)}) vượt tổng bill ({formatMoney(order.finalAmount)}).
        </p>
      )}
      {order.cancelledAt && <p className="text-sm text-warning">Bill đã hủy lúc {formatDateTime(order.cancelledAt)}.</p>}
      {editedAfter && (
        <p className="text-sm text-warning">Bill đã sửa lúc {formatDateTime(order.editedAt)}, sau khi tạo hóa đơn.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={String(activeId)} onValueChange={(value) => choose(value === "new" ? "new" : Number(value))}>
          {/* The list's own h-9 is set for the horizontal orientation, so the override carries the same variant. */}
          <TabsList className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
            {einvoices.map((einvoice, i) => {
              const badge = einvoiceStatusBadge(einvoice.status, einvoice.lastError);
              return (
                <TabsTrigger key={einvoice.id} value={String(einvoice.id)} title={badge.label}>
                  <span className={cn("size-2 rounded-full", DOT[badge.variant])} aria-hidden />
                  HĐ {i + 1}
                  <span className="sr-only">({badge.label})</span>
                </TabsTrigger>
              );
            })}
            {activeId === "new" && <TabsTrigger value="new">HĐ {einvoices.length + 1} (mới)</TabsTrigger>}
          </TabsList>
        </Tabs>
        {canAdd && (
          <Button
            size="icon"
            variant="outline"
            aria-label="Thêm hóa đơn nhỏ"
            disabled={activeId === "new"}
            onClick={() => choose("new")}
          >
            <PlusIcon />
          </Button>
        )}
      </div>
      <Separator />

      {activeId !== "new" && !active ? (
        loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <EmptyState icon={FileCheck2Icon} title="Hóa đơn không còn" description="Chọn một hóa đơn khác của bill." />
        )
      ) : active && active.status !== "DRAFT" ? (
        <p className="text-sm text-muted-foreground">
          Hóa đơn {active.status === "ISSUED" ? "đã xuất" : "đang chờ đối chiếu"}.
        </p>
      ) : (
        <EinvoiceEditor
          // A save changes updatedAt, so the editor restarts from the saved row
          // and is no longer dirty.
          key={`${activeId}:${active?.updatedAt ?? ""}:${fresh}`}
          bill={order}
          einvoice={active}
          previous={buyerOf(einvoices[index - 1] ?? (activeId === "new" ? einvoices.at(-1) : undefined))}
          config={config}
          onSaved={(row) => afterWrite(row.id)}
          onDeleted={deleted}
          onDirtyChange={handleDirty}
        />
      )}

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && setPendingId(null)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          handleDirty(false);
          if (pendingId !== null) activate(pendingId);
          setPendingId(null);
        }}
      />
    </div>
  );
}
