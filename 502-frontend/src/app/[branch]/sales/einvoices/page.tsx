"use client";

import { useEffect, useState } from "react";
import { FileCheck2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { useBranchCode } from "@/lib/branch";
import type { EinvoiceConfigView } from "@/lib/types";

// A bill open in the panel, and which of its invoices ("new": not saved yet).
interface EinvoiceSelection {
  orderId: number;
  einvoiceId: number | "new";
}

export default function EinvoicesPage() {
  const branch = useBranchCode();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [selected, setSelected] = useState<EinvoiceSelection | null>(null);
  // Unsaved edits in the panel: switching bills or leaving asks first.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<EinvoiceSelection | null | undefined>(undefined);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Used by the list and the picker (Task 13).
  const select = (next: EinvoiceSelection | null) => {
    if (dirty) setPending(next);
    else setSelected(next);
  };
  void select;

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description="Chia bill đã thanh toán thành các hóa đơn nhỏ, lưu nháp và xuất lên Minvoice."
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <EmptyState
          icon={FileCheck2Icon}
          title={selected ? `Bill #${selected.orderId}` : "Chọn một hóa đơn"}
          description="Hoặc bấm Tạo HĐĐT mới để chia một bill."
          className="rounded-xl border"
        />
      </div>
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
