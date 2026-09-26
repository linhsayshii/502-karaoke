import { computeBill } from './billing';

const base = {
  startTime: new Date('2026-09-26T20:00:00'),
  endTime: new Date('2026-09-26T21:00:00'),
  pricePerHour: 120000,
  items: [],
  discountAmount: 0,
  hourlyDiscountAmount: 0,
  serviceFeeAmount: 0,
  taxPercent: 0,
};

describe('computeBill', () => {
  it('charges a full hour at the hourly price', () => {
    expect(computeBill(base)).toMatchObject({
      durationMinutes: 60,
      hourlyFee: 120000,
      finalAmount: 120000,
    });
  });

  it('counts a started minute and rounds the room fee up to 1,000', () => {
    // 61 minutes (one second over the hour) -> 61/60 * 100,000 = 101,666.67
    const bill = computeBill({
      ...base,
      pricePerHour: 100000,
      endTime: new Date('2026-09-26T21:00:01'),
    });
    expect(bill.durationMinutes).toBe(61);
    expect(bill.hourlyFee).toBe(102000);
  });

  it('applies products, discounts, service fee, then tax rounded up to 1,000', () => {
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
    expect(bill.totalBeforeTax).toBe(187000);
    expect(bill.taxAmount).toBe(15000);
    expect(bill.finalAmount).toBe(202000);
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
