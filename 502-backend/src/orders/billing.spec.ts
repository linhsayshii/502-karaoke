import { computeBill, roundUpToThousand } from './billing';

const base = {
  startTime: new Date('2026-09-26T20:00:00'),
  endTime: new Date('2026-09-26T21:00:00'),
  pricePerHour: 120000,
  items: [],
  discountPercent: 0,
  discountAmount: 0,
  hourlyDiscountPercent: 0,
  hourlyDiscountAmount: 0,
  serviceFeePercent: 0,
  serviceFeeAmount: 0,
  taxPercent: 0,
};

describe('roundUpToThousand', () => {
  it('rounds up to the next 1,000 but ignores float noise', () => {
    expect(roundUpToThousand(101666.67)).toBe(102000);
    expect(roundUpToThousand(15000.000000000002)).toBe(15000);
    expect(roundUpToThousand(187000 * 0.08)).toBe(15000);
    expect(roundUpToThousand(0)).toBe(0);
  });
});

describe('computeBill', () => {
  it('charges a full hour at the hourly price', () => {
    expect(computeBill(base)).toMatchObject({
      durationMinutes: 60,
      hourlyFee: 120000,
      finalAmount: 120000,
    });
  });

  it('counts a started minute and bills hours rounded to 0.01', () => {
    // 61 minutes (one second over the hour) -> 1.0166 h -> 1.02 h
    const bill = computeBill({
      ...base,
      pricePerHour: 100000,
      endTime: new Date('2026-09-26T21:00:01'),
    });
    expect(bill.durationMinutes).toBe(61);
    expect(bill.billedHours).toBe(1.02);
    expect(bill.hourlyFee).toBe(102000);
  });

  it('rounds the hours half up, then multiplies by the price', () => {
    // 83 min = 1.3833 h -> 1.38 h; 85 min = 1.4166 h -> 1.42 h
    const at = (minutes: number) =>
      computeBill({
        ...base,
        pricePerHour: 150000,
        endTime: new Date(base.startTime.getTime() + minutes * 60000),
      });
    expect(at(83)).toMatchObject({ billedHours: 1.38, hourlyFee: 207000 });
    expect(at(85)).toMatchObject({ billedHours: 1.42, hourlyFee: 213000 });
    // 1.37 h × 150,000 = 205,500: no rounding to 1,000 any more.
    expect(at(82)).toMatchObject({ billedHours: 1.37, hourlyFee: 205500 });
  });

  it('has no float error on the fee', () => {
    // 69 min = 1.15 h; 1.15 * 100000 is 114999.99999999999 in floats.
    const bill = computeBill({
      ...base,
      pricePerHour: 100000,
      endTime: new Date('2026-09-26T21:09:00'),
    });
    expect(bill.billedHours).toBe(1.15);
    expect(bill.hourlyFee).toBe(115000);
  });

  it('keeps a given room fee instead of recomputing it', () => {
    const bill = computeBill({ ...base, hourlyFee: 100000 });
    expect(bill.hourlyFee).toBe(100000);
    expect(bill.finalAmount).toBe(100000);
  });

  it('applies products, fixed discounts, service fee, then tax rounded up', () => {
    const bill = computeBill({
      ...base,
      items: [
        { price: 25000, quantity: 3 },
        { price: 10000, quantity: 1 },
      ],
      discountAmount: 5000,
      hourlyDiscountAmount: 20000,
      serviceFeeAmount: 7000,
      taxPercent: 8,
    });
    // 85,000 + 120,000 - 5,000 - 20,000 + 7,000 = 187,000; 8% = 14,960 -> 15,000
    expect(bill.totalProductPrice).toBe(85000);
    expect(bill.discountAmount).toBe(5000);
    expect(bill.totalBeforeTax).toBe(187000);
    expect(bill.taxAmount).toBe(15000);
    expect(bill.finalAmount).toBe(202000);
  });

  it('applies percents to the live bases, not to a stale amount', () => {
    // 3 hours of room at 120,000 and 200,000 of products.
    const bill = computeBill({
      ...base,
      endTime: new Date('2026-09-26T23:00:00'),
      items: [{ price: 50000, quantity: 4 }],
      discountPercent: 10,
      discountAmount: 999000, // ignored: the percent wins
      hourlyDiscountPercent: 10,
      hourlyDiscountAmount: 12000, // stale 10% of the first hour
      serviceFeePercent: 5,
      taxPercent: 10,
    });
    expect(bill.hourlyFee).toBe(360000);
    expect(bill.discountAmount).toBe(20000);
    expect(bill.hourlyDiscountAmount).toBe(36000);
    // (200,000 - 20,000 + 360,000 - 36,000) = 504,000; 5% = 25,200 -> 26,000
    expect(bill.serviceFeeAmount).toBe(26000);
    expect(bill.totalBeforeTax).toBe(530000);
    expect(bill.taxAmount).toBe(53000);
    expect(bill.finalAmount).toBe(583000);
  });

  it('never discounts more than what is discounted', () => {
    const bill = computeBill({
      ...base,
      items: [{ price: 30000, quantity: 1 }],
      discountAmount: 100000,
      hourlyDiscountAmount: 500000,
    });
    expect(bill.discountAmount).toBe(30000);
    expect(bill.hourlyDiscountAmount).toBe(120000);
    expect(bill.finalAmount).toBe(0);
  });

  it('never bills negative time', () => {
    const bill = computeBill({
      ...base,
      endTime: new Date('2026-09-26T19:00:00'),
    });
    expect(bill.durationMinutes).toBe(0);
    expect(bill.hourlyFee).toBe(0);
  });
});
