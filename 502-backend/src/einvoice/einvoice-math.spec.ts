import {
  computedVatOf,
  defaultVatRate,
  fillerLine,
  issueProblem,
  lineAmountOf,
  lineVatOf,
  totalsOf,
} from './einvoice-math';
import type { EinvoiceLine } from './einvoice-types';

const line = (over: Partial<EinvoiceLine> = {}): EinvoiceLine => ({
  name: 'Bia Heineken',
  unit: 'Lon',
  quantity: 1,
  unitPrice: 0,
  vatRate: 10,
  ...over,
});

describe('einvoice-math', () => {
  it('rounds a line and its VAT to the đồng', () => {
    expect(lineAmountOf({ quantity: 1.38, unitPrice: 300000 })).toBe(414000);
    expect(lineAmountOf({ quantity: 0.333, unitPrice: 1000 })).toBe(333);
    expect(computedVatOf(909091, 10)).toBe(90909);
    // Float noise must not tip the rounding (187,000 × 8% = 14,960.000000000002).
    expect(computedVatOf(187000, 8)).toBe(14960);
  });

  it('uses the stored VAT of a filler line', () => {
    expect(lineVatOf(line({ unitPrice: 909095, vatAmount: 90909 }))).toBe(
      90909,
    );
    expect(lineVatOf(line({ unitPrice: 909095 }))).toBe(90910);
  });

  it('sums the lines', () => {
    expect(
      totalsOf([
        line({ quantity: 10, unitPrice: 35000 }),
        line({ unitPrice: 559091 }),
      ]),
    ).toEqual({ amountWithoutVat: 909091, vatAmount: 90909, total: 1000000 });
  });

  it('says why a draft cannot be issued', () => {
    expect(issueProblem(1000000, [])).toBe('Hóa đơn chưa có dòng hàng');
    expect(
      issueProblem(
        1,
        Array.from({ length: 51 }, () => line()),
      ),
    ).toBe('Tối đa 50 dòng hàng');
    expect(issueProblem(100, [line({ unitPrice: 91, vatAmount: 5 })])).toBe(
      'Dòng 1: tiền thuế lệch quá 1 đồng so với thuế suất',
    );
    expect(issueProblem(1000000, [line({ unitPrice: 900000 })])).toBe(
      'Còn thiếu 10.000 đồng',
    );
    expect(issueProblem(1000000, [line({ unitPrice: 1000000 })])).toBe(
      'Thừa 100.000 đồng',
    );
    expect(issueProblem(1000000, [line({ unitPrice: 909091 })])).toBeNull();
  });

  it('builds a filler line that reaches the amount', () => {
    expect(fillerLine(1000000, 10)).toEqual({
      name: 'Dịch vụ karaoke',
      unit: 'Lần',
      quantity: 1,
      unitPrice: 909091,
      vatRate: 10,
    });
    expect(fillerLine(0, 10)).toBeNull();
    expect(fillerLine(-5, 10)).toBeNull();
  });

  it('lets the filler VAT take the đồng no single price reaches', () => {
    // 909,094 + 90,909 = 1,000,003 and 909,095 + 90,910 = 1,000,005.
    const filler = fillerLine(1000004, 10)!;
    expect(filler.unitPrice).toBe(909095);
    expect(filler.vatAmount).toBe(90909);
    expect(issueProblem(1000004, [filler])).toBeNull();
  });

  it('defaults a line to the VAT of the bill when it is a legal rate', () => {
    expect(defaultVatRate(8)).toBe(8);
    expect(defaultVatRate(0)).toBe(0);
    expect(defaultVatRate(7)).toBe(10);
  });

  it('needs an amount before anything else', () => {
    expect(issueProblem(0, [])).toBe('Nhập số tiền của hóa đơn');
    // A line priced 0 adds up to an amount of 0: still nothing to issue.
    expect(issueProblem(0, [line()])).toBe('Nhập số tiền của hóa đơn');
  });
});
