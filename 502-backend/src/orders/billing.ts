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

export interface Bill {
  durationMinutes: number;
  hourlyFee: number;
  totalProductPrice: number;
  totalBeforeTax: number;
  taxAmount: number;
  finalAmount: number;
}

const roundUpToThousand = (value: number) => Math.ceil(value / 1000) * 1000;

// Room fee = started minutes / 60 * price per hour, rounded up to 1,000 VND.
// Tax = taxPercent of the subtotal, also rounded up to 1,000 VND.
export function computeBill(input: BillInput): Bill {
  const durationMs = input.endTime.getTime() - input.startTime.getTime();
  const durationMinutes = Math.max(0, Math.ceil(durationMs / (1000 * 60)));
  const hourlyFee = roundUpToThousand(
    (durationMinutes / 60) * input.pricePerHour,
  );

  const totalProductPrice = input.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const totalBeforeTax =
    totalProductPrice +
    hourlyFee -
    input.discountAmount -
    input.hourlyDiscountAmount +
    input.serviceFeeAmount;
  const taxAmount = roundUpToThousand(
    totalBeforeTax * (input.taxPercent / 100),
  );

  return {
    durationMinutes,
    hourlyFee,
    totalProductPrice,
    totalBeforeTax,
    taxAmount,
    finalAmount: totalBeforeTax + taxAmount,
  };
}
