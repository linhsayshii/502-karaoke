import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EinvoiceDraft, EinvoiceLine, VAT_RATES } from './einvoice-types';

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
