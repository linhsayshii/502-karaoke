import { BadRequestException } from '@nestjs/common';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalDate(value: string): Date {
  if (!DATE_RE.test(value)) {
    throw new BadRequestException('Ngày không hợp lệ (định dạng YYYY-MM-DD)');
  }
  return new Date(`${value}T00:00:00`);
}

// Calendar-day range [from 00:00, to+1 00:00) in server local time.
// Either end may be omitted.
export function dateRange(from?: string, to?: string) {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = parseLocalDate(from);
  if (to) {
    const end = parseLocalDate(to);
    end.setDate(end.getDate() + 1);
    range.lt = end;
  }
  return range;
}

// Business day runs 11:30 -> 06:00 next day, in server local time.
export function getBusinessDayRange(dateStr: string) {
  const start = parseLocalDate(dateStr);
  start.setHours(11, 30, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(6, 0, 0, 0);
  return { start, end };
}
