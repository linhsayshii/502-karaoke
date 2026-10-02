"use client";

import { useState } from "react";
import { DatePicker } from "@/components/date-range-picker";
import { MoneyInput } from "@/components/einvoices/number-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate, formatMoney } from "@/lib/format";
import type { CreatedManualBill, Room } from "@/lib/types";

// The most the backend takes for the first e-invoice (CreateManualBillDto.amount,
// spec 2026-10-02 §6.1); MoneyInput itself lets 12 digits through.
const MAX_AMOUNT = 100_000_000_000;

// Thêm hóa đơn (spec 2026-10-02-trang-bao-cao-hddt §7.4): a bill only to issue
// e-invoices, numbered in the day's sequence of the branch with its room, and
// its first e-invoice of the amount typed. The parent remounts it (key) on
// each opening, so it starts empty.
export function AddManualBillDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (bill: CreatedManualBill) => void;
}) {
  const branch = useBranchCode();
  const notify = useNotify();
  const rooms = useApiData<Room[]>(open ? "/rooms" : null, { branch }, [], "Không thể tải danh sách phòng");
  const [day, setDay] = useState(() => businessDate());
  const [roomId, setRoomId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const tooMuch = amount !== null && amount > MAX_AMOUNT;
  const ready = roomId !== "" && amount !== null && amount >= 1 && !tooMuch;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await api.post<CreatedManualBill>(
        "/report-site/manual-bills",
        { businessDate: day, roomId: Number(roomId), amount },
        { params: { branch } },
      );
      notify.success(`Đã thêm bill ${res.data.billNumber}`);
      onCreated(res.data);
    } catch (error) {
      notify.error(error, "Không thêm được hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Thêm hóa đơn</DialogTitle>
            <DialogDescription>
              Bill chỉ để xuất hóa đơn điện tử, chỉ có ở trang báo cáo. Số bill nối tiếp dãy số của ngày đã chọn.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Ngày</FieldLabel>
              <DatePicker value={day} onChange={setDay} max={businessDate()} label="Ngày kinh doanh" />
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-bill-room">Phòng</FieldLabel>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="manual-bill-room" className="w-full">
                  <SelectValue placeholder="Chọn phòng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {rooms.data.map((room) => (
                      <SelectItem key={room.id} value={String(room.id)}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={tooMuch || undefined}>
              <FieldLabel htmlFor="manual-bill-amount">Số tiền hóa đơn điện tử</FieldLabel>
              <MoneyInput
                id="manual-bill-amount"
                value={amount}
                onChange={setAmount}
                placeholder="0"
                aria-invalid={tooMuch || undefined}
              />
              {tooMuch ? (
                <FieldError>Tối đa {formatMoney(MAX_AMOUNT)}</FieldError>
              ) : (
                <FieldDescription>Đã gồm VAT. Người mua và dòng hàng nhập ở trang Hóa đơn điện tử.</FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button type="submit" disabled={!ready || saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Thêm hóa đơn
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
