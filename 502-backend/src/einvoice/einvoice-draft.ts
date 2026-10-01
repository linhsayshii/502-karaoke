import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { EinvoiceDraftDto } from './dto/einvoice.dto';
import { fillerLine, lineVatOf, totalsOf } from './einvoice-math';
import { EinvoiceDraft, EinvoiceLine, VAT_RATES } from './einvoice-types';

const clean = (value: string | null | undefined) => value?.trim() || null;

// The VAT an invoice not issued yet is counted with (spec 2026-10-02 §4.4):
// its lines' VAT, plus that of the "Dịch vụ karaoke" filler line (10%) that
// would make up what the lines do not cover yet. Lines that add up need no
// filler, so for an issued invoice this is its lines' VAT.
export function draftVatOf(amount: number, lines: EinvoiceLine[]): number {
  const { total, vatAmount } = totalsOf(lines);
  const filler = fillerLine(amount - total, 10);
  return vatAmount + (filler ? lineVatOf(filler) : 0);
}

// The columns a saved draft writes (spec 2026-10-01 §4.1): the details go in
// `draft`, only in a shape parseDraft reads back (a blank name is refused, a
// null vatAmount is left out).
export function draftData(dto: EinvoiceDraftDto) {
  const lines: EinvoiceLine[] = dto.lines.map((line, index) => {
    const name = line.name.trim();
    if (!name) {
      throw new BadRequestException(
        `Dòng ${index + 1}: tên hàng không được để trống`,
      );
    }
    return {
      name,
      unit: line.unit.trim(),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.vatAmount == null ? {} : { vatAmount: line.vatAmount }),
    };
  });
  const draft: EinvoiceDraft = {
    buyerAddress: clean(dto.buyerAddress),
    buyerEmail: clean(dto.buyerEmail),
    lines,
  };
  return {
    amount: dto.amount,
    vatAmount: draftVatOf(dto.amount, lines),
    buyerTaxCode: clean(dto.buyerTaxCode),
    buyerName: clean(dto.buyerName),
    draft: draft as unknown as Prisma.InputJsonObject,
  };
}

// What an issued invoice keeps of its draft (spec 2026-10-02 §4.3): the lines,
// for the products report of the report site; the buyer's address and email
// go, as before.
export function issuedDraft(lines: EinvoiceLine[]): Prisma.InputJsonObject {
  return { lines } as unknown as Prisma.InputJsonObject;
}

// Einvoice.draft read back through the rules of EinvoiceLineDto, so JSON of a
// wrong shape never reaches a Minvoice payload (spec §4.1).
export function parseDraft(value: Prisma.JsonValue | null): EinvoiceDraft {
  const draft = value as unknown as Partial<EinvoiceDraft> | null;
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.lines)) {
    throw new BadRequestException('Hóa đơn không có nội dung nháp');
  }
  if (!draft.lines.every(isLine)) {
    throw new BadRequestException(
      'Nội dung nháp không hợp lệ, hãy sửa và lưu lại hóa đơn',
    );
  }
  return {
    buyerAddress:
      typeof draft.buyerAddress === 'string' ? draft.buyerAddress : null,
    buyerEmail: typeof draft.buyerEmail === 'string' ? draft.buyerEmail : null,
    lines: draft.lines,
  };
}

function isLine(value: unknown): value is EinvoiceLine {
  const line = value as EinvoiceLine;
  return (
    typeof line?.name === 'string' &&
    line.name.length > 0 &&
    line.name.length <= 300 &&
    typeof line.unit === 'string' &&
    line.unit.length <= 30 &&
    typeof line.quantity === 'number' &&
    line.quantity > 0 &&
    Number.isInteger(line.unitPrice) &&
    line.unitPrice >= 0 &&
    (VAT_RATES as readonly number[]).includes(line.vatRate) &&
    (line.vatAmount === undefined ||
      (Number.isInteger(line.vatAmount) && line.vatAmount >= 0))
  );
}
