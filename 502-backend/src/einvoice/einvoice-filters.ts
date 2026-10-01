import { BadRequestException } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../common/dates';

// Filters shared by the e-invoice lists of both sites (spec 2026-10-02 §6).

// A YYYY-MM-DD as a @db.Date value. The DTO only checks the shape: a day that
// does not exist (2026-13-01 fails in Prisma, 2026-02-30 rolls into March) is
// refused here.
export function dbDay(
  value: string,
  message = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)',
): Date {
  const date = toDbDate(value);
  if (isNaN(date.getTime()) || fromDbDate(date) !== value) {
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
