export interface BillInput {
  startTime: Date;
  endTime: Date;
  pricePerHour: number;
  items: { price: number; quantity: number }[];
  // A percent > 0 is applied to the live base and wins over the amount;
  // with percent 0 the amount is a fixed sum.
  discountPercent: number; // of the products
  discountAmount: number;
  hourlyDiscountPercent: number; // of the room fee
  hourlyDiscountAmount: number;
  serviceFeePercent: number; // of products + room fee after discounts
  serviceFeeAmount: number;
  taxPercent: number; // of the subtotal
  // A room fee already settled (editing a paid bill without touching its
  // times keeps what was charged); otherwise computed from the times.
  hourlyFee?: number;
}

export interface Bill {
  durationMinutes: number;
  billedHours: number; // hours charged, rounded to 0.01
  hourlyFee: number;
  totalProductPrice: number;
  // The amounts actually applied (derived from the percent when one is set).
  discountAmount: number;
  hourlyDiscountAmount: number;
  serviceFeeAmount: number;
  totalBeforeTax: number;
  taxAmount: number;
  finalAmount: number;
}

// Rounds up to 1,000 VND. Sub-đồng float noise is dropped first so that
// e.g. 187,000 × 8% = 14,960.000000000002 does not become an extra 1,000.
export const roundUpToThousand = (value: number) =>
  Math.ceil(Math.round(value) / 1000) * 1000;

// Started minutes as hours rounded to the hundredth (83 min = 1.38 h).
export const billedHoursOf = (minutes: number) =>
  Math.round((minutes * 100) / 60) / 100;

// Room fee = billed hours × price per hour, to the đồng. Works in hundredths
// of an hour so 1.38 × 150,000 has no float error.
export const roomFeeOf = (minutes: number, pricePerHour: number) =>
  Math.round((Math.round((minutes * 100) / 60) * pricePerHour) / 100);

const clamp = (value: number, max: number) =>
  Math.min(Math.max(value, 0), Math.max(max, 0));

const byPercentOrAmount = (base: number, percent: number, amount: number) =>
  percent > 0 ? roundUpToThousand((base * percent) / 100) : amount;

// The single billing formula (the frontend mirrors it in lib/billing.ts):
// room fee = started minutes / 60 rounded to 0.01 hour, × price per hour;
// discounts never exceed what they discount; tax is rounded up to 1,000.
export function computeBill(input: BillInput): Bill {
  const durationMs = input.endTime.getTime() - input.startTime.getTime();
  const durationMinutes = Math.max(0, Math.ceil(durationMs / (1000 * 60)));
  const hourlyFee =
    input.hourlyFee ?? roomFeeOf(durationMinutes, input.pricePerHour);

  const totalProductPrice = input.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const discountAmount = clamp(
    byPercentOrAmount(
      totalProductPrice,
      input.discountPercent,
      input.discountAmount,
    ),
    totalProductPrice,
  );
  const hourlyDiscountAmount = clamp(
    byPercentOrAmount(
      hourlyFee,
      input.hourlyDiscountPercent,
      input.hourlyDiscountAmount,
    ),
    hourlyFee,
  );
  const serviceBase =
    totalProductPrice - discountAmount + hourlyFee - hourlyDiscountAmount;
  const serviceFeeAmount = Math.max(
    0,
    byPercentOrAmount(
      serviceBase,
      input.serviceFeePercent,
      input.serviceFeeAmount,
    ),
  );

  const totalBeforeTax = serviceBase + serviceFeeAmount;
  const taxAmount = roundUpToThousand(
    (totalBeforeTax * input.taxPercent) / 100,
  );

  return {
    durationMinutes,
    billedHours: billedHoursOf(durationMinutes),
    hourlyFee,
    totalProductPrice,
    discountAmount,
    hourlyDiscountAmount,
    serviceFeeAmount,
    totalBeforeTax,
    taxAmount,
    finalAmount: totalBeforeTax + taxAmount,
  };
}
