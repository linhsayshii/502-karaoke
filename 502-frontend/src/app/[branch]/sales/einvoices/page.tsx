"use client";

import { useEffect, useState } from "react";
import { FileCheck2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { BillPickerDialog } from "@/components/einvoices/bill-picker-dialog";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { EinvoiceList } from "@/components/einvoices/einvoice-list";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped after a save or an issue so the list and its counts reload (the
  // setter comes with the panel that reports the changes).
  const [listVersion] = useState(0);
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
    else setSelected(next);
  };

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
          <EmptyState
            icon={FileCheck2Icon}
            title={selected ? `Bill #${selected.orderId}` : "Chọn một hóa đơn"}
            description={can(user, "einvoices.write") ? "Hoặc bấm Tạo HĐĐT mới để chia một bill." : undefined}
            className="rounded-xl border"
          />
        </div>
      </div>
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
          setSelected(pending ?? null);
          setPending(undefined);
        }}
      />
    </>
  );
}
