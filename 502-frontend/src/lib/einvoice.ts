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

// An issue or re-check that failed for any reason but a 400 may still have
// reached Minvoice (a network drop, a 524 or a 5xx after the send): the panel
// is reloaded to show the row as the server has it, never "it failed".
export const UNKNOWN_RESULT_MESSAGE = "Không rõ kết quả, đã tải lại để xem trạng thái hóa đơn";

// The backend's STALE_SENDING_MS (einvoices.service.ts): an uncertain invoice
// goes back to draft ("Chưa có — gửi lại") only this long after its lost send.
export const STALE_SENDING_MS = 3 * 60_000;

const dong = (value: number) => value.toLocaleString("vi-VN");

// Why a draft cannot be issued yet, or null when it can: it needs an amount
// (a draft may keep 0 while it is being split), and its lines must add up to
// that amount, to the đồng.
export function issueProblem(amount: number, lines: EinvoiceLine[]): string | null {
  if (!(amount >= 1)) return "Nhập số tiền của hóa đơn";
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
// totals cannot be reached by one price; then its VAT takes the one đồng left
// (the real Minvoice accepts that, 01/10/2026).
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
