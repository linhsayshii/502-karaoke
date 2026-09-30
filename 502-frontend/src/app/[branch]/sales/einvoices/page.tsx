"use client";

import { useEffect, useState } from "react";
import { FileCheck2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { BillEinvoicesPanel } from "@/components/einvoices/bill-einvoices-panel";
import { BillPickerDialog } from "@/components/einvoices/bill-picker-dialog";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { EinvoiceList } from "@/components/einvoices/einvoice-list";
import { PageHeader } from "@/components/layout/page-header";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApiData } from "@/hooks/use-api-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";
import type { EinvoiceConfigView } from "@/lib/types";

// A bill open in the panel, and which of its invoices ("new": not saved yet).
interface EinvoiceSelection {
  orderId: number;
  einvoiceId: number | "new";
}

export default function EinvoicesPage() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [selected, setSelected] = useState<EinvoiceSelection | null>(null);
  // Bumped by every switch through select(): the panel is keyed by it, so a
  // click on another invoice of the bill that is open reopens it there.
  const [nonce, setNonce] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped after a save, a delete or an issue so the list and its counts reload.
  const [listVersion, setListVersion] = useState(0);
  // Unsaved edits in the panel. Closing or reloading the tab asks through
  // beforeunload, and so does switching bill or invoice inside the page through
  // select(); leaving through the sidebar is not guarded.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<EinvoiceSelection | null | undefined>(undefined);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const show = (next: EinvoiceSelection | null) => {
    setSelected(next);
    setNonce((n) => n + 1);
  };
  // Every switch of bill or invoice (the list, the picker) goes through here:
  // unsaved edits ask first, and choosing the invoice that is open changes nothing.
  const select = (next: EinvoiceSelection | null) => {
    const same =
      next !== null &&
      selected !== null &&
      next.einvoiceId !== "new" &&
      next.orderId === selected.orderId &&
      next.einvoiceId === selected.einvoiceId;
    if (same) return;
    if (dirty) setPending(next);
    else show(next);
  };

  const isMobile = useIsMobile();
  const changed = () => {
    setListVersion((v) => v + 1);
    config.reload();
  };
  const panel = selected && (
    <BillEinvoicesPanel
      key={`${selected.orderId}:${nonce}`}
      orderId={selected.orderId}
      initialEinvoiceId={selected.einvoiceId}
      config={config.data}
      onChanged={changed}
      onDirtyChange={setDirty}
      // The panel's own tabs switch invoices without a remount; the page only
      // follows, so the list marks the invoice shown.
      onActiveChange={(einvoiceId) => setSelected((s) => s && { ...s, einvoiceId })}
    />
  );

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description="Chia bill đã thanh toán thành các hóa đơn nhỏ, lưu nháp và xuất lên Minvoice."
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <div className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EinvoiceList
            version={listVersion}
            selectedId={selected && selected.einvoiceId !== "new" ? selected.einvoiceId : null}
            onSelect={(orderId, einvoiceId) => select({ orderId, einvoiceId })}
            onCreate={() => setPickerOpen(true)}
          />
          {!isMobile &&
            (panel ?? (
              <EmptyState
                icon={FileCheck2Icon}
                title="Chọn một hóa đơn"
                description={can(user, "einvoices.write") ? "Hoặc bấm Tạo HĐĐT mới để chia một bill." : undefined}
                className="rounded-xl border"
              />
            ))}
        </div>
      </div>
      {isMobile && (
        <Sheet open={!!selected} onOpenChange={(value) => !value && select(null)}>
          {/* The panel scrolls under a fixed title row, which keeps the close
              button clear of the panel's header. */}
          <SheetContent side="bottom" className="h-[100dvh] gap-0 p-0">
            <SheetHeader className="border-b py-3 pr-12">
              <SheetTitle>Hóa đơn điện tử của bill</SheetTitle>
              <SheetDescription className="sr-only">Sửa, lưu nháp và xuất các hóa đơn nhỏ của bill</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
      <BillPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(orderId) => {
          setPickerOpen(false);
          select({ orderId, einvoiceId: "new" });
        }}
      />
      <ConfirmDialog
        open={pending !== undefined}
        onOpenChange={(open) => !open && setPending(undefined)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          setDirty(false);
          show(pending ?? null);
          setPending(undefined);
        }}
      />
    </>
  );
}
