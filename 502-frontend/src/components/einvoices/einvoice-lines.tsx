"use client";

import { ListPlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DecimalInput, MoneyInput } from "@/components/einvoices/number-input";
import { EINVOICE_VAT_RATE, fillerLine, lineAmountOf, MAX_LINES } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EinvoiceBillDetail, EinvoiceLine } from "@/lib/types";

// One row per line from 38rem of the panel's @container/einvoice width up
// (fixed columns, so the rows line up under the header; the panel is 667px
// wide on a 1440px laptop with the sidebar open, just under the 672px of
// @2xl, which would then never switch there); below it each line is a card of
// two columns with the labels shown.
const LINE_GRID =
  "grid-cols-2 gap-2 @min-[38rem]/einvoice:grid-cols-[minmax(0,1fr)_4rem_4.5rem_7rem_8rem_2rem] @min-[38rem]/einvoice:items-center";
const NARROW_LABEL = "text-xs font-normal text-muted-foreground @min-[38rem]/einvoice:hidden";

// Dòng hàng of a small invoice: typed freely, taken from the bill, or a filler
// line that brings the total to the amount. Every new line carries
// EINVOICE_VAT_RATE; there is no rate to choose (spec
// 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.4).
export function EinvoiceLines({
  lines,
  bill,
  missing,
  disabled,
  onChange,
}: {
  lines: EinvoiceLine[];
  // Null for a bill thêm tay: nothing to take from.
  bill: EinvoiceBillDetail["order"] | null;
  missing: number;
  disabled: boolean;
  onChange: (lines: EinvoiceLine[]) => void;
}) {
  const full = lines.length >= MAX_LINES;

  // A change of price or quantity drops the fixed VAT of a filler line.
  const set = (index: number, patch: Partial<EinvoiceLine>) =>
    onChange(
      lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.unitPrice !== undefined || patch.quantity !== undefined) delete next.vatAmount;
        return next;
      }),
    );

  const fromBill: { label: string; line: EinvoiceLine }[] = !bill
    ? []
    : [
        ...(bill.billedHours > 0 && Number(bill.pricePerHour) > 0
          ? [
              {
                label: `Tiền giờ ${bill.billedHours.toLocaleString("vi-VN")} giờ × ${formatMoney(bill.pricePerHour)}`,
                line: {
                  // As "Thêm hóa đơn vào báo cáo" names it (bill-lines.ts).
                  name: "Dịch vụ tính theo giờ",
                  unit: "Giờ",
                  quantity: bill.billedHours,
                  unitPrice: Math.round(Number(bill.pricePerHour)),
                  vatRate: EINVOICE_VAT_RATE,
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
            vatRate: EINVOICE_VAT_RATE,
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
          onClick={() =>
            onChange([...lines, { name: "", unit: "", quantity: 1, unitPrice: 0, vatRate: EINVOICE_VAT_RATE }])
          }
        >
          <PlusIcon data-icon="inline-start" />
          Thêm dòng
        </Button>
        {bill && (
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
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full || missing <= 0}
          onClick={() => {
            const filler = fillerLine(missing, EINVOICE_VAT_RATE);
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
            className={cn(LINE_GRID, "hidden border-b pb-2 text-xs font-medium text-muted-foreground @min-[38rem]/einvoice:grid")}
          >
            <span>Tên hàng, dịch vụ</span>
            <span>ĐVT</span>
            <span>SL</span>
            <span>Đơn giá trước VAT</span>
            <span className="text-right">Thành tiền trước VAT</span>
            <span />
          </div>
          <ul className="flex flex-col gap-3 @min-[38rem]/einvoice:gap-2">
            {lines.map((line, index) => (
              <li
                key={index}
                className={cn(LINE_GRID, "grid rounded-md border p-2 @min-[38rem]/einvoice:border-0 @min-[38rem]/einvoice:p-0")}
              >
                <Input
                  aria-label={`Tên hàng dòng ${index + 1}`}
                  placeholder="Tên hàng, dịch vụ"
                  maxLength={300}
                  value={line.name}
                  disabled={disabled}
                  onChange={(e) => set(index, { name: e.target.value })}
                  className="col-span-2 @min-[38rem]/einvoice:col-span-1"
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
                <div className="flex flex-col gap-1 text-sm tabular-nums @min-[38rem]/einvoice:items-end">
                  <span className={NARROW_LABEL}>Thành tiền trước VAT</span>
                  <span className="flex h-9 items-center @min-[38rem]/einvoice:h-auto">{formatMoney(lineAmountOf(line))}</span>
                  {/* A line saved before rates were fixed keeps its own; it shows. */}
                  {line.vatRate !== EINVOICE_VAT_RATE && (
                    <span className="text-xs text-muted-foreground">VAT {line.vatRate}%</span>
                  )}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Xóa dòng ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  className="col-span-2 justify-self-end @min-[38rem]/einvoice:col-span-1"
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
