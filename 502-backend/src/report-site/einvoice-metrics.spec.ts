import {
  addEinvoiceSums,
  emptyEinvoiceSums,
  sumEinvoices,
  toEinvoiceMetrics,
} from './einvoice-metrics';

const day = {
  einvoiceCount: 3,
  total: 330_000,
  vat: 30_000,
  issued: 110_000,
};

describe('einvoice metrics', () => {
  it('adds the sums of days', () => {
    const acc = emptyEinvoiceSums();
    addEinvoiceSums(acc, day);
    addEinvoiceSums(acc, day);
    expect(acc).toEqual({
      einvoiceCount: 6,
      total: 660_000,
      vat: 60_000,
      issued: 220_000,
    });
    expect(sumEinvoices([day, day])).toEqual(acc);
  });

  it('gives revenue before VAT and what is not issued yet, nothing else', () => {
    expect(toEinvoiceMetrics({ ...day, date: '2026-10-02' } as never)).toEqual({
      ...day,
      revenue: 300_000,
      pending: 220_000,
    });
  });
});
