import { VENUE_OPEN_MINUTES } from '../common/dates';

// Pure helpers of the reports that break the revenue down by a subject
// (staff, room, product, hour).

// Rounds each value to a whole đồng so that the results add up to `total`
// (largest remainder first, ties to the earlier value). The values are the
// exact shares of `total`, e.g. a bill's discount spread over its lines.
export function roundToTotal(values: number[], total: number): number[] {
  const result = values.map((value) => Math.floor(value));
  const order = values
    .map((value, i) => ({ i, fraction: value - result[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  let rest = Math.round(total) - result.reduce((sum, v) => sum + v, 0);
  for (let k = 0; rest > 0 && order.length > 0; k++, rest--) {
    result[order[k % order.length].i] += 1;
  }
  return result;
}

// Share of the opening hours that `rooms` rooms were in use over `days`
// business days; null without rooms.
export function occupancy(
  roomMinutes: number,
  days: number,
  rooms: number,
): number | null {
  const open = days * rooms * VENUE_OPEN_MINUTES;
  return open > 0 ? roomMinutes / open : null;
}

// Highest value first (ties by name); the row without a subject — Chưa gán,
// Không phòng, Không danh mục (id null) — always last.
export function rank<T extends { id: unknown; name: string | null }>(
  rows: T[],
  value: (row: T) => number,
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.id === null) - Number(b.id === null) ||
      value(b) - value(a) ||
      (a.name ?? '').localeCompare(b.name ?? '', 'vi'),
  );
}

// Sessions and revenue (before VAT) started in one hour of one weekday
// (ISO: 1 = Monday … 7 = Sunday, of the business day).
export interface HourCell {
  weekday: number;
  hour: number;
  sessions: number;
  revenue: number;
}

// Every weekday × hour cell, Monday 00:00 first; cells without bills are 0.
export function hourGrid(rows: HourCell[]): HourCell[] {
  const cells: HourCell[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ weekday, hour, sessions: 0, revenue: 0 });
    }
  }
  for (const row of rows) {
    const cell = cells[(row.weekday - 1) * 24 + row.hour];
    cell.sessions += Number(row.sessions);
    cell.revenue += Number(row.revenue);
  }
  return cells;
}
