// Mirror of the backend computeBill (502-backend/src/orders/billing.ts) for
// the live total on screen. The server recomputes on preview/checkout, so
// keep the two in sync when the rules change.

export const roundUpToThousand = (value: number) => Math.ceil(value / 1000) * 1000;

export interface BillInput {
  startTime: Date;
  endTime: Date;
  pricePerHour: number;
  items: { price: number; quantity: number }[];
  discountAmount: number;
  hourlyDiscountAmount: number;
  serviceFeeAmount: number;
  taxPercent: number;
}

export function computeBill(input: BillInput) {
  const durationMs = input.endTime.getTime() - input.startTime.getTime();
  const durationMinutes = Math.max(0, Math.ceil(durationMs / (1000 * 60)));
  const hourlyFee = roundUpToThousand((durationMinutes / 60) * input.pricePerHour);
  const totalProductPrice = input.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalBeforeTax =
    totalProductPrice +
    hourlyFee -
    input.discountAmount -
    input.hourlyDiscountAmount +
    input.serviceFeeAmount;
  const taxAmount = roundUpToThousand(totalBeforeTax * (input.taxPercent / 100));
  return {
    durationMinutes,
    hourlyFee,
    totalProductPrice,
    totalBeforeTax,
    taxAmount,
    finalAmount: totalBeforeTax + taxAmount,
  };
}
