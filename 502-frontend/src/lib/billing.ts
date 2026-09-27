// Mirror of the backend computeBill (502-backend/src/orders/billing.ts) for
// the live total on screen. The server recomputes on preview/checkout, so
// keep the two in sync when the rules change.

// Rounds up to the đồng; float noise is dropped first.
export const roundUpToDong = (value: number) => Math.ceil(Math.round(value * 1000) / 1000);

export interface BillInput {
  startTime: Date;
  endTime: Date;
  pricePerHour: number;
  items: { price: number; quantity: number }[];
  // A percent > 0 applies to the live base and wins over the amount.
  discountPercent: number; // of the products
  discountAmount: number;
  hourlyDiscountPercent: number; // of the room fee
  hourlyDiscountAmount: number;
  taxPercent: number; // of room fee + products after discounts
  // A room fee already settled (a paid bill edited without new times).
  hourlyFee?: number;
}

// Started minutes as hours rounded to the hundredth (83 min = 1.38 h).
export const billedHoursOf = (minutes: number) => Math.round((minutes * 100) / 60) / 100;

// Room fee = billed hours × price per hour, to the đồng (in hundredths of an
// hour, so there is no float error).
export const roomFeeOf = (minutes: number, pricePerHour: number) =>
  Math.round((Math.round((minutes * 100) / 60) * pricePerHour) / 100);

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));

const byPercentOrAmount = (base: number, percent: number, amount: number) =>
  percent > 0 ? roundUpToDong((base * percent) / 100) : amount;

export function computeBill(input: BillInput) {
  const durationMs = input.endTime.getTime() - input.startTime.getTime();
  const durationMinutes = Math.max(0, Math.ceil(durationMs / (1000 * 60)));
  const hourlyFee = input.hourlyFee ?? roomFeeOf(durationMinutes, input.pricePerHour);
  const totalProductPrice = input.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const discountAmount = clamp(
    byPercentOrAmount(totalProductPrice, input.discountPercent, input.discountAmount),
    totalProductPrice,
  );
  const hourlyDiscountAmount = clamp(
    byPercentOrAmount(hourlyFee, input.hourlyDiscountPercent, input.hourlyDiscountAmount),
    hourlyFee,
  );
  const totalBeforeTax = totalProductPrice - discountAmount + hourlyFee - hourlyDiscountAmount;
  const taxAmount = roundUpToDong((totalBeforeTax * input.taxPercent) / 100);

  return {
    durationMinutes,
    billedHours: billedHoursOf(durationMinutes),
    hourlyFee,
    totalProductPrice,
    discountAmount,
    hourlyDiscountAmount,
    totalBeforeTax,
    taxAmount,
    finalAmount: totalBeforeTax + taxAmount,
  };
}
