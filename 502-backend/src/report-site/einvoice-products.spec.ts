import { productRows } from './einvoice-products';

describe('productRows', () => {
  const beer = {
    name: 'Bia Tiger',
    unit: 'Lon',
    quantity: 3,
    revenue: 300_000,
    vat: 30_000,
    others: false,
  };
  const others = {
    name: null,
    unit: null,
    quantity: null,
    revenue: 50_000,
    vat: 5_000,
    others: true,
  };
  const sum = (rows: { revenue: number; vat: number; total: number }[]) =>
    rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        vat: acc.vat + r.vat,
        total: acc.total + r.total,
      }),
      { revenue: 0, vat: 0, total: 0 },
    );

  it('adds what the invoices hold beyond their lines, so the rows add up', () => {
    const rows = productRows([beer, others], {
      total: 495_000,
      vat: 45_000,
      lineRevenue: 350_000,
      lineVat: 35_000,
    });
    expect(rows.map((r) => r.kind)).toEqual(['item', 'others', 'unlisted']);
    expect(rows[2]).toMatchObject({
      revenue: 100_000,
      vat: 10_000,
      total: 110_000,
    });
    expect(sum(rows)).toEqual({
      revenue: 450_000,
      vat: 45_000,
      total: 495_000,
    });
  });

  it('has no "Chưa có dòng hàng" row when the lines cover everything', () => {
    const rows = productRows([beer], {
      total: 330_000,
      vat: 30_000,
      lineRevenue: 300_000,
      lineVat: 30_000,
    });
    expect(rows).toEqual([
      {
        kind: 'item',
        name: 'Bia Tiger',
        unit: 'Lon',
        quantity: 3,
        revenue: 300_000,
        vat: 30_000,
        total: 330_000,
      },
    ]);
  });
});
