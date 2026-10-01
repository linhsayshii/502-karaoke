"use client";

import { ListPlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DecimalInput, MoneyInput } from "@/components/einvoices/number-input";
import { fillerLine, lineAmountOf, MAX_LINES, VAT_RATES } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EinvoiceBillDetail, EinvoiceLine, VatRate } from "@/lib/types";

// One row per line from the panel's @container/einvoice width up (fixed
// columns, so the rows line up under the header); below it each line is a
// card of two columns with the labels shown.
const LINE_GRID =
  "grid-cols-2 gap-2 @2xl/einvoice:grid-cols-[minmax(0,1fr)_4rem_4.5rem_7rem_6.5rem_6.5rem_2rem] @2xl/einvoice:items-center";
const NARROW_LABEL = "text-xs font-normal text-muted-foreground @2xl/einvoice:hidden";

// Dòng hàng of a small invoice (spec §10.2): typed freely, taken from the
// bill, or a filler line that brings the total to the amount.
export function EinvoiceLines({
  lines,
  bill,
  defaultRate,
  missing,
  disabled,
  onChange,
}: {
  lines: EinvoiceLine[];
  bill: EinvoiceBillDetail["order"];
  defaultRate: VatRate;
  missing: number;
  disabled: boolean;
  onChange: (lines: EinvoiceLine[]) => void;
}) {
  const full = lines.length >= MAX_LINES;

  // A change of price, quantity or rate drops the fixed VAT of a filler line.
  const set = (index: number, patch: Partial<EinvoiceLine>) =>
    onChange(
      lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.unitPrice !== undefined || patch.quantity !== undefined || patch.vatRate !== undefined) {
          delete next.vatAmount;
        }
        return next;
      }),
    );

  const fromBill: { label: string; line: EinvoiceLine }[] = [
    ...(bill.billedHours > 0 && Number(bill.pricePerHour) > 0
      ? [
          {
            label: `Tiền giờ ${bill.billedHours.toLocaleString("vi-VN")} giờ × ${formatMoney(bill.pricePerHour)}`,
            line: {
              name: `Tiền giờ phòng ${bill.room?.name ?? ""}`.trim(),
              unit: "Giờ",
              quantity: bill.billedHours,
              unitPrice: Math.round(Number(bill.pricePerHour)),
              vatRate: defaultRate,
            },
          },
        ]
      : []),
    ...bill.items.map((item) => ({
      label: `${item.name} × ${item.quantity} (${formatMoney(item.price)})`,
      line: {
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: Math.round(Number(item.price)),
        vatRate: defaultRate,
      },
    })),
  ];

  return (
    <FieldSet className="min-w-0 gap-3">
      <FieldLegend variant="label">Dòng hàng</FieldLegend>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full}
          onClick={() => onChange([...lines, { name: "", unit: "", quantity: 1, unitPrice: 0, vatRate: defaultRate }])}
        >
          <PlusIcon data-icon="inline-start" />
          Thêm dòng
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={disabled || full || fromBill.length === 0}>
              <ListPlusIcon data-icon="inline-start" />
              Lấy món từ bill
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-80 max-w-(--radix-dropdown-menu-content-available-width) overflow-y-auto"
          >
            {fromBill.map((entry, index) => (
              <DropdownMenuItem key={index} onSelect={() => onChange([...lines, entry.line])}>
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full || missing <= 0}
          onClick={() => {
            const filler = fillerLine(missing, defaultRate);
            if (filler) onChange([...lines, filler]);
          }}
        >
          Thêm dòng bù phần còn thiếu
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dòng hàng.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            aria-hidden
            className={cn(LINE_GRID, "hidden border-b pb-2 text-xs font-medium text-muted-foreground @2xl/einvoice:grid")}
          >
            <span>Tên hàng, dịch vụ</span>
            <span>ĐVT</span>
            <span>SL</span>
            <span>Đơn giá trước VAT</span>
            <span>Thuế suất</span>
            <span className="text-right">Thành tiền</span>
            <span />
          </div>
          <ul className="flex flex-col gap-3 @2xl/einvoice:gap-2">
            {lines.map((line, index) => (
              <li
                key={index}
                className={cn(LINE_GRID, "grid rounded-md border p-2 @2xl/einvoice:border-0 @2xl/einvoice:p-0")}
              >
                <Input
                  aria-label={`Tên hàng dòng ${index + 1}`}
                  placeholder="Tên hàng, dịch vụ"
                  maxLength={300}
                  value={line.name}
                  disabled={disabled}
                  onChange={(e) => set(index, { name: e.target.value })}
                  className="col-span-2 @2xl/einvoice:col-span-1"
                />
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-unit`} className={NARROW_LABEL}>
                    ĐVT
                  </FieldLabel>
                  <Input
                    id={`einvoice-line-${index}-unit`}
                    aria-label={`ĐVT dòng ${index + 1}`}
                    maxLength={30}
                    value={line.unit}
                    disabled={disabled}
                    onChange={(e) => set(index, { unit: e.target.value })}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-quantity`} className={NARROW_LABEL}>
                    Số lượng
                  </FieldLabel>
                  <DecimalInput
                    id={`einvoice-line-${index}-quantity`}
                    aria-label={`Số lượng dòng ${index + 1}`}
                    className="text-right tabular-nums"
                    value={line.quantity}
                    disabled={disabled}
                    onChange={(quantity) => set(index, { quantity })}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-price`} className={NARROW_LABEL}>
                    Đơn giá trước VAT
                  </FieldLabel>
                  <MoneyInput
                    id={`einvoice-line-${index}-price`}
                    aria-label={`Đơn giá trước VAT dòng ${index + 1}`}
                    className="text-right tabular-nums"
                    value={line.unitPrice}
                    disabled={disabled}
                    onChange={(unitPrice) => set(index, { unitPrice: unitPrice ?? 0 })}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-rate`} className={NARROW_LABEL}>
                    Thuế suất
                  </FieldLabel>
                  <Select
                    value={String(line.vatRate)}
                    disabled={disabled}
                    onValueChange={(rate) => set(index, { vatRate: Number(rate) as VatRate })}
                  >
                    <SelectTrigger
                      id={`einvoice-line-${index}-rate`}
                      aria-label={`Thuế suất dòng ${index + 1}`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {VAT_RATES.map((rate) => (
                          <SelectItem key={rate} value={String(rate)}>
                            VAT {rate}%
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="self-center text-sm tabular-nums @2xl/einvoice:text-right">
                  <span className="text-muted-foreground @2xl/einvoice:hidden">Thành tiền: </span>
                  {formatMoney(lineAmountOf(line))}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Xóa dòng ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  className="justify-self-end"
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FieldSet>
  );
}
