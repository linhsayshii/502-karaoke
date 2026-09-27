import { BadRequestException } from '@nestjs/common';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A business day D runs from 06:00 on D to 06:00 on D+1 (server local time),
// so every moment belongs to exactly one day: the venue opens at 11:30 and a
// night that ends at 03:00 still counts for the evening it started. Revenue,
// bills, the fund and stock documents are all reported by these days.
export const BUSINESS_DAY_START_HOUR = 6;

// Longest period a list or report may span.
export const MAX_REPORT_DAYS = 366;

// Longest period of the reports module (grouped by week … year).
export const MAX_REPORT_RANGE_DAYS = 1830;

function parseLocalDate(value: string): Date {
  if (!DATE_RE.test(value)) {
    throw new BadRequestException('Ngày không hợp lệ (định dạng YYYY-MM-DD)');
  }
  const date = new Date(`${value}T00:00:00`);
  // new Date() rolls an out-of-range day/month over into the next one
  // (2026-02-30 -> 2 March) instead of rejecting it, so round-trip the
  // parsed date back to YYYY-MM-DD and compare with the input.
  if (isNaN(date.getTime()) || toDateString(date) !== value) {
    throw new BadRequestException('Ngày không hợp lệ (định dạng YYYY-MM-DD)');
  }
  return date;
}

// YYYY-MM-DD of a Date in local time.
export function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfBusinessDay(dateStr: string): Date {
  const start = parseLocalDate(dateStr);
  start.setHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
  return start;
}

// [D 06:00, D+1 06:00).
export function getBusinessDayRange(dateStr: string) {
  const start = startOfBusinessDay(dateStr);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// Prisma filter for the business days from..to (both included). Either end
// may be omitted.
export function businessDayRange(from?: string, to?: string) {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = startOfBusinessDay(from);
  if (to) range.lt = getBusinessDayRange(to).end;
  if (range.gte && range.lt && range.gte >= range.lt) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
  return range;
}

// The business day (YYYY-MM-DD) a moment belongs to.
export function businessDateOf(moment: Date): string {
  const day = new Date(moment);
  if (day.getHours() < BUSINESS_DAY_START_HOUR) {
    day.setDate(day.getDate() - 1);
  }
  return toDateString(day);
}

// Every business date from..to, both included.
export function businessDatesBetween(
  from: string,
  to: string,
  maxDays = MAX_REPORT_DAYS,
): string[] {
  const current = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (current > end) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
  const dates: string[] = [];
  while (current <= end) {
    dates.push(toDateString(current));
    if (dates.length > maxDays) {
      throw new BadRequestException(
        `Chỉ xem được tối đa ${maxDays} ngày một lần`,
      );
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
