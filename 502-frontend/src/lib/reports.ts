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
