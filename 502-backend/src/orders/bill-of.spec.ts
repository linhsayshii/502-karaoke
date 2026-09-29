import { Prisma } from '@prisma/client';
import { billOf, billedEndOf } from './bill-of';

const order = {
  startTime: new Date('2026-09-30T13:00:00Z'),
  pricePerHour: new Prisma.Decimal(100000),
  discountPercent: 0,
  discountAmount: new Prisma.Decimal(0),
  hourlyDiscountPercent: 0,
  hourlyDiscountAmount: new Prisma.Decimal(0),
  taxPercent: 10,
  items: [{ price: new Prisma.Decimal(20000), quantity: 2 }],
};

describe('billOf', () => {
  it('bills the stored adjustments by default', () => {
    const bill = billOf(order, new Date('2026-09-30T14:00:00Z'));
    expect(bill.hourlyFee).toBe(100000);
    expect(bill.finalAmount).toBe(154000);
  });
  it('bills other adjustments when given', () => {
    const bill = billOf(order, new Date('2026-09-30T14:00:00Z'), {
      discountPercent: 0,
      discountAmount: 40000,
      hourlyDiscountPercent: 0,
      hourlyDiscountAmount: 0,
      taxPercent: 0,
    });
    expect(bill.finalAmount).toBe(100000);
  });
});

describe('billedEndOf', () => {
  it('stops at the locked time', () => {
    const locked = new Date('2026-09-30T14:00:00Z');
    expect(billedEndOf({ timeLockedAt: locked }, new Date())).toBe(locked);
  });
  it('runs to now otherwise', () => {
    const now = new Date();
    expect(billedEndOf({ timeLockedAt: null }, now)).toBe(now);
  });
});
