import { billedHoursOf } from '../orders/billing';
import { MAX_LINES } from './einvoice-math';
import type { EinvoiceLine } from './einvoice-types';

// What "Thêm hóa đơn vào báo cáo" writes (spec
// 2026-10-02-bao-cao-theo-tung-hddt §5.1).
export const HOURLY_LINE_NAME = 'Dịch vụ tính theo giờ';
export const RETAIL_BUYER = 'Bán cho người tiêu dùng';

// Started minutes of a closed bill, as computeBill counts them.
export function billMinutesOf(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 60_000));
}

// The lines of a whole paid bill, at its own prices before VAT and 10%: the
// hours, then the items. Discounts and another tax rate are not spread over
// them, so such a bill's draft shows "Còn thiếu/Thừa" until someone fixes it;
// past MAX_LINES the rest is left to that gap as well.
export function billLines(bill: {
  minutes: number;
  hourlyFee: number;
  pricePerHour: number;
  items: { name: string; unit: string; quantity: number; price: number }[];
}): EinvoiceLine[] {
  const hours = billedHoursOf(bill.minutes);
  const lines: EinvoiceLine[] =
    bill.hourlyFee > 0 && hours > 0
      ? [
          {
            name: HOURLY_LINE_NAME,
            unit: 'Giờ',
            quantity: hours,
            unitPrice: Math.round(bill.pricePerHour),
            vatRate: 10,
          },
        ]
      : [];
  for (const item of bill.items) {
    if (item.quantity <= 0) continue;
    // Product names and units have no length limit; a draft line has
    // (parseDraft refuses longer ones).
    lines.push({
      name: item.name.slice(0, 300),
      unit: item.unit.slice(0, 30),
      quantity: item.quantity,
      unitPrice: Math.round(item.price),
      vatRate: 10,
    });
  }
  return lines.slice(0, MAX_LINES);
}
