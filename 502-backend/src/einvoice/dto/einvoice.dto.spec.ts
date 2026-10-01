import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EinvoiceNumberDto, ResolveEinvoiceDto } from './einvoice.dto';

// Thông tư 78/2021: an invoice number has at most 8 digits.
describe('invoice number DTOs', () => {
  const errors = (cls: new () => object, body: object) =>
    validateSync(plainToInstance(cls, body)).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it.each([
    [ResolveEinvoiceDto, { found: true }],
    [EinvoiceNumberDto, {}],
  ] as const)('%p takes 1 to 99 999 999', (cls, base) => {
    expect(errors(cls, { ...base, invoiceNumber: 99_999_999 })).toEqual([]);
    expect(errors(cls, { ...base, invoiceNumber: 100_000_000 })).toEqual([
      'Số hóa đơn có tối đa 8 chữ số',
    ]);
    expect(errors(cls, { ...base, invoiceNumber: 0 })).not.toEqual([]);
  });
});
