import {
  addSums,
  emptySums,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';

const bill = (fields: Partial<RevenueSums>): RevenueSums => ({
  ...emptySums(),
  orderCount: 1,
  ...fields,
});

describe('revenue metrics', () => {
  it('keeps VAT out of revenue', () => {
    const metrics = toMetrics(
      sumAll([
        // (100,000 + 50,000 − 5,000) + 10% VAT
        bill({
          roomFee: 100000,
          productSales: 50000,
          productDiscount: 5000,
          vat: 14500,
          collected: 159500,
          cash: 159500,
        }),
        bill({ roomFee: 60000, collected: 60000, transfer: 60000 }),
      ]),
    );
    expect(metrics).toMatchObject({
      orderCount: 2,
      revenue: 205000,
      vat: 14500,
      collected: 219500,
      cash: 159500,
      transfer: 60000,
      avgRevenue: 102500,
    });
    expect(metrics.revenue).toBe(
      metrics.roomFee -
        metrics.roomDiscount +
        metrics.productSales -
        metrics.productDiscount +
        metrics.serviceFee,
    );
  });

  it('has no average without bills', () => {
    expect(toMetrics(emptySums())).toMatchObject({ revenue: 0, avgRevenue: 0 });
  });

  it('drops extra columns of a SQL row', () => {
    const row = { date: '2026-09-27', ...bill({ collected: 1000 }) };
    expect(toMetrics(row)).not.toHaveProperty('date');
  });

  it('adds into the accumulator', () => {
    const acc = emptySums();
    addSums(acc, bill({ roomMinutes: 90 }));
    addSums(acc, bill({ roomMinutes: 30 }));
    expect(acc).toMatchObject({ orderCount: 2, roomMinutes: 120 });
  });
});
