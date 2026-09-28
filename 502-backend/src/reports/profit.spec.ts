import { addProfit, emptyProfit, sumProfit, toProfitMetrics } from './profit';
import { emptySums, RevenueSums } from './revenue-metrics';

const sales = (patch: Partial<RevenueSums>): RevenueSums => ({
  ...emptySums(),
  ...patch,
});

describe('profit', () => {
  it('is gross profit − expenses − losses + other income', () => {
    const m = toProfitMetrics(
      sumProfit([
        {
          date: '2026-09-01',
          sales: sales({
            orderCount: 2,
            roomFee: 400000,
            productSales: 700000,
            productDiscount: 100000,
            vat: 100000,
            collected: 1100000,
          }),
        },
        { date: '2026-09-01', cogs: 300000 },
        {
          date: '2026-09-02',
          expense: { category: 'Điện nước', amount: 200000 },
        },
        {
          date: '2026-09-02',
          expense: { category: 'Chi linh tinh', amount: 50000 },
        },
        { date: '2026-09-02', losses: 25000.5 },
        { date: '2026-09-03', otherIncome: 10000 },
        { date: '2026-09-03', purchases: 999000 },
      ]),
    );
    expect(m).toMatchObject({
      revenue: 1000000,
      vat: 100000,
      roomFee: 400000,
      productSales: 700000,
      productDiscount: 100000,
      cogs: 300000,
      grossProfit: 700000,
      grossMargin: 0.7,
      expenseTotal: 250000,
      losses: 25000.5,
      otherIncome: 10000,
      purchases: 999000,
      profit: 434999.5,
    });
    expect(m.expenses['Điện nước']).toBe(200000);
    expect(m.expenses['Khác']).toBe(50000);
    expect(m.expenses['Lương']).toBe(0);
    expect(m.profitMargin).toBeCloseTo(0.4349995, 6);
  });

  it('has no margins without revenue', () => {
    const m = toProfitMetrics(emptyProfit());
    expect(m.grossMargin).toBeNull();
    expect(m.profitMargin).toBeNull();
    expect(m.profit).toBe(0);
    expect(Object.keys(m.expenses)).toHaveLength(8);
  });

  it('rounds sums to the cent', () => {
    const acc = emptyProfit();
    addProfit(acc, { date: '2026-09-01', cogs: 0.1 });
    addProfit(acc, { date: '2026-09-01', cogs: 0.2 });
    expect(toProfitMetrics(acc).cogs).toBe(0.3);
  });
});
