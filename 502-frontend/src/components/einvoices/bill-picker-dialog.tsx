"use client";

import { useState } from "react";
import { ReceiptTextIcon } from "lucide-react";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DatePicker } from "@/components/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatMoney, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EinvoiceBill } from "@/lib/types";

// "Tạo HĐĐT mới": pick a paid bill of a business day, or find one by number.
// A dialog is portaled outside @container/main, so it uses viewport breakpoints.
export function BillPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (orderId: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chọn bill để xuất hóa đơn</DialogTitle>
          <DialogDescription>Bill đã thanh toán của một ngày kinh doanh, hoặc tìm theo số bill.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the list loads when the dialog opens. */}
        {open && <PickerBody onPick={onPick} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onPick }: { onPick: (orderId: number) => void }) {
  const branch = useBranchCode();
  const [day, setDay] = useState(businessDate());
  const [search, setSearch] = useState("");
  // A bill number searches every day (the server ignores the day then).
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  const { data, total, loading } = useApiData<EinvoiceBill[]>(
    "/einvoices/bills",
    billNumber ? { branch, billNumber } : { branch, businessDate: day },
    [],
    "Không thể tải danh sách bill",
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!billNumber && <DatePicker value={day} onChange={setDay} max={businessDate()} label="Ngày kinh doanh" />}
        <Input
          type="search"
          inputMode="numeric"
          placeholder="Tìm số bill…"
          aria-label="Tìm theo số bill"
          maxLength={15}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-44"
        />
      </div>
      <ListLimitNotice shown={data.length} total={total} noun="bill" hint="Tìm theo số bill để thấy bill khác." />
      <div className="max-h-[60dvh] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={ReceiptTextIcon} title="Không có bill đã thanh toán" />
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {data.map((bill) => {
              const billTotal = Number(bill.finalAmount);
              const over = bill.allocated > billTotal;
              return (
                <li key={bill.orderId}>
                  <button
                    type="button"
                    onClick={() => onPick(bill.orderId)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{billLabel({ id: bill.orderId, billNumber: bill.billNumber })}</span>
                    <span className="text-muted-foreground">
                      {bill.roomName ?? "—"} · {formatTime(bill.endTime)}
                    </span>
                    <span className="ml-auto tabular-nums">{formatMoney(bill.finalAmount)}</span>
                    <span className={cn("w-full text-xs text-muted-foreground tabular-nums", over && "text-warning")}>
                      {bill.einvoiceCount
                        ? `Đã chia ${formatMoney(bill.allocated)} vào ${bill.einvoiceCount} hóa đơn${
                            over ? " (vượt bill)" : bill.allocated === billTotal ? " (đủ)" : ""
                          }`
                        : "Chưa có hóa đơn điện tử"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
