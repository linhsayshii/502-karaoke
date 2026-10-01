"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type InputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode">;

// Whole đồng with thousands separators while typing.
export function MoneyInput({
  value,
  onChange,
  ...props
}: InputProps & { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      value={value === null ? "" : value.toLocaleString("vi-VN")}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
        const next = digits ? Number(digits) : null;
        // A key that changes nothing (a letter) is not a change: it would drop
        // the fixed VAT of a filler line.
        if (next !== value) onChange(next);
      }}
    />
  );
}

const quantityText = (value: number) => String(value).replace(".", ",");
const quantityOf = (text: string) => {
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) / 1000 : null;
};

// A quantity (up to 3 decimals, "," or "."): the text is kept while typing
// ("1," is not a number yet) and goes back to the value on blur. A change from
// outside (a row removed above this one) shows at once; it is adjusted during
// render rather than by remounting, so typing never loses the focus.
export function DecimalInput({
  value,
  onChange,
  onBlur,
  ...props
}: InputProps & { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => quantityText(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (quantityOf(text) !== value) setText(quantityText(value));
  }
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d,.]/g, "");
        setText(next);
        const quantity = quantityOf(next);
        if (quantity !== null && quantity !== value) onChange(quantity);
      }}
      onBlur={(e) => {
        setText(quantityText(value));
        onBlur?.(e);
      }}
    />
  );
}
