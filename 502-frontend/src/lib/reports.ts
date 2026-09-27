import type { GroupBy } from "@/lib/types";

export const GROUP_BYS: GroupBy[] = ["day", "week", "month", "quarter", "year"];

// Change against the previous period (0.12 = +12%); null when the previous
// value is 0 (nothing to compare with).
export function delta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

// doanh-thu_cs1_2026-09-01_2026-09-27.xlsx
export function reportFileName(report: string, scope: string, from: string, to: string) {
  return `${report}_${scope}_${from}_${to}.xlsx`;
}

// GET /orders (Hóa đơn) caps a range at this many days (common/dates.ts MAX_REPORT_DAYS).
export const MAX_BILLS_RANGE_DAYS = 366;

// Number of days between two local YYYY-MM-DD dates, both included.
function dayCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

// Whether from..to fits on the Hóa đơn (bills) page, which caps at
// MAX_BILLS_RANGE_DAYS while a report can span up to 1830 days.
export function withinBillsRange(from: string, to: string): boolean {
  return dayCount(from, to) <= MAX_BILLS_RANGE_DAYS;
}
