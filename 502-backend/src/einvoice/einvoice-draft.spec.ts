import { draftVatOf, parseDraft } from './einvoice-draft';

const line = {
  name: 'Bia',
  unit: 'Lon',
  quantity: 2,
  unitPrice: 35000,
  vatRate: 10,
};

describe('parseDraft', () => {
  it('reads a stored draft', () => {
    expect(
      parseDraft({ buyerAddress: 'HN', buyerEmail: null, lines: [line] }),
    ).toEqual({
      buyerAddress: 'HN',
      buyerEmail: null,
      lines: [line],
    });
  });

  it('refuses what the DTO would refuse', () => {
    expect(() => parseDraft(null)).toThrow('Hóa đơn không có nội dung nháp');
    expect(() => parseDraft({ lines: [{ ...line, vatRate: 7 }] })).toThrow(
      /không hợp lệ/,
    );
    expect(() => parseDraft({ lines: [{ ...line, unitPrice: 1.5 }] })).toThrow(
      /không hợp lệ/,
    );
    expect(() => parseDraft({ lines: [{ ...line, name: '' }] })).toThrow(
      /không hợp lệ/,
    );
  });
});

describe('draftVatOf', () => {
  const beer = { ...line, quantity: 10, vatRate: 10 as const };

  it('counts what the lines do not cover at 10%, as the filler line would', () => {
    // 1.000.000 with 385.000 of lines: the filler takes 615.000 = 559.091 + 55.909.
    expect(draftVatOf(1_000_000, [beer])).toBe(35_000 + 55_909);
    expect(draftVatOf(110_000, [])).toBe(10_000);
  });

  it('is the VAT of the lines once they add up or go over', () => {
    expect(draftVatOf(385_000, [beer])).toBe(35_000);
    expect(draftVatOf(1_000, [beer])).toBe(35_000);
    expect(draftVatOf(0, [])).toBe(0);
  });
});

describe('parseDraft of an issued invoice', () => {
  it('reads the lines it keeps', () => {
    expect(parseDraft({ lines: [line] })).toEqual({
      buyerAddress: null,
      buyerEmail: null,
      lines: [line],
    });
  });
});
