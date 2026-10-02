import { BadRequestException } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../common/dates';

// Filters shared by the e-invoice lists of both sites (spec 2026-10-02 §6).

// No bill of this business predates 2000. The floor also refuses year 0000,
// which JavaScript reads as a day but PostgreSQL's ::date does not (a 500),
// and keeps a mistyped year from making a real bill.
const FIRST_YEAR = 2000;

// A YYYY-MM-DD as a @db.Date value. The DTO only checks the shape: a day that
// does not exist (2026-13-01 fails in Prisma, 2026-02-30 rolls into March) or
// lies before FIRST_YEAR is refused here.
export function dbDay(
  value: string,
  message = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)',
): Date {
  const date = toDbDate(value);
  if (
    isNaN(date.getTime()) ||
    fromDbDate(date) !== value ||
    date.getUTCFullYear() < FIRST_YEAR
  ) {
    throw new BadRequestException(message);
  }
  return date;
}

export function dateRange(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  if (from && to && from > to) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
  return {
    ...(from ? { gte: dbDay(from) } : {}),
    ...(to ? { lte: dbDay(to) } : {}),
  };
}

// Pending "Không rõ" work: a SENDING row whose send was cut off stays SENDING
// until it is opened (sweepStaleSending), so it is listed and counted with
// the uncertain ones. (branchId, status, createdAt) index.
export const NOT_SETTLED = {
  in: [EinvoiceStatus.SENDING, EinvoiceStatus.UNCERTAIN],
};

// The invoices of a tab: "Lỗi" is a draft with an error, "Không rõ" also
// holds sends still in flight or cut off.
export function statusWhere(
  status: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED',
): Prisma.EinvoiceWhereInput {
  if (status === 'DRAFT') {
    return { status: EinvoiceStatus.DRAFT, lastError: null };
  }
  if (status === 'ERROR') {
    return { status: EinvoiceStatus.DRAFT, lastError: { not: null } };
  }
  if (status === 'UNCERTAIN') return { status: NOT_SETTLED };
  return { status: EinvoiceStatus.ISSUED };
}
