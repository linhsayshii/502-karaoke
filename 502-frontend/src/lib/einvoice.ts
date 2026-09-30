import type { EinvoiceLine, VatRate } from "@/lib/types";

// Mirror of the backend's src/einvoice/einvoice-math.ts (spec §5): keep the
// two in sync. Rounded to the đồng with Math.round, unlike bills (billing.ts
// rounds VAT up).

export const VAT_RATES: VatRate[] = [0, 5, 8, 10];
export const MAX_LINES = 50;
export const FILLER_NAME = "Dịch vụ karaoke";

// Float noise is dropped first, as in the backend and in billing.ts.
export const roundToDong = (value: number) => Math.round(Math.round(value * 1000) / 1000);

export const lineAmountOf = (line: Pick<EinvoiceLine, "quantity" | "unitPrice">) =>
  roundToDong(line.quantity * line.unitPrice);

export const computedVatOf = (amount: number, rate: number) => roundToDong((amount * rate) / 100);

export const lineVatOf = (line: EinvoiceLine) => line.vatAmount ?? computedVatOf(lineAmountOf(line), line.vatRate);

export interface EinvoiceTotals {
  amountWithoutVat: number;
  vatAmount: number;
  total: number;
}

export function totalsOf(lines: EinvoiceLine[]): EinvoiceTotals {
  let amountWithoutVat = 0;
  let vatAmount = 0;
  for (const line of lines) {
    amountWithoutVat += lineAmountOf(line);
    vatAmount += lineVatOf(line);
  }
  return { amountWithoutVat, vatAmount, total: amountWithoutVat + vatAmount };
}

const dong = (value: number) => value.toLocaleString("vi-VN");

// Why a draft cannot be issued yet, or null when it can: its lines must add
// up to the amount typed, to the đồng.
export function issueProblem(amount: number, lines: EinvoiceLine[]): string | null {
  if (lines.length === 0) return "Hóa đơn chưa có dòng hàng";
  if (lines.length > MAX_LINES) return `Tối đa ${MAX_LINES} dòng hàng`;
  for (const [index, line] of lines.entries()) {
    if (
      line.vatAmount !== undefined &&
      Math.abs(line.vatAmount - computedVatOf(lineAmountOf(line), line.vatRate)) > 1
    ) {
      return `Dòng ${index + 1}: tiền thuế lệch quá 1 đồng so với thuế suất`;
    }
  }
  const { total } = totalsOf(lines);
  if (total < amount) return `Còn thiếu ${dong(amount - total)} đồng`;
  if (total > amount) return `Thừa ${dong(total - amount)} đồng`;
  return null;
}

// A line that brings the total up by `missing` at `rate`. Rounding means some
// totals cannot be reached by one price; then its VAT takes the one đồng left.
export function fillerLine(missing: number, rate: VatRate): EinvoiceLine | null {
  if (missing <= 0) return null;
  const base = roundToDong(missing / (1 + rate / 100));
  const filler = { name: FILLER_NAME, unit: "Lần", quantity: 1, vatRate: rate };
  for (const price of [base, base - 1, base + 1]) {
    if (price >= 0 && price + computedVatOf(price, rate) === missing) return { ...filler, unitPrice: price };
  }
  return { ...filler, unitPrice: base, vatAmount: missing - base };
}

export function defaultVatRate(taxPercent: number): VatRate {
  return (VAT_RATES as number[]).includes(taxPercent) ? (taxPercent as VatRate) : 10;
}
