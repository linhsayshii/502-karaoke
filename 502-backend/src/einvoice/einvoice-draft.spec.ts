import { parseDraft } from './einvoice-draft';

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
