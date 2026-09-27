// Report periods: business dates (YYYY-MM-DD) grouped by day, ISO week,
// month, quarter or year. Pure calendar arithmetic on the date strings (in
// UTC), so the server time zone never shifts a day.

export const GROUP_BYS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export interface Bucket {
  key: string;
  label: string;
  // First and last business date of the bucket (within the range when the
  // bucket comes from bucketsBetween).
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
// Date.UTC normalises overflow: day 0 is the last day of the previous month.
const ymd = (year: number, month: number, day: number) =>
  fromUtc(Date.UTC(year, month - 1, day));
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

// Number of dates from..to, both included.
export function dayCount(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
}

// ISO 8601 week: starts on Monday and belongs to the year of its Thursday.
function isoWeek(date: string) {
  const weekday = (new Date(toUtc(date)).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(date, -weekday);
  const thursday = addDays(monday, 3);
  const year = Number(thursday.slice(0, 4));
  const week =
    Math.floor((toUtc(thursday) - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return { monday, year, week };
}

// The whole bucket a date falls in (not clipped to any range).
export function bucketOf(date: string, groupBy: GroupBy): Bucket {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  switch (groupBy) {
    case 'day':
      return {
        key: date,
        label: `${dayMonth(date)}/${year}`,
        from: date,
        to: date,
      };
    case 'week': {
      const { monday, year: weekYear, week } = isoWeek(date);
      const sunday = addDays(monday, 6);
      return {
        key: `${weekYear}-W${String(week).padStart(2, '0')}`,
        label: `Tuần ${week} (${dayMonth(monday)}–${dayMonth(sunday)})`,
        from: monday,
        to: sunday,
      };
    }
    case 'month':
      return {
        key: date.slice(0, 7),
        label: `T${month}/${year}`,
        from: ymd(year, month, 1),
        to: ymd(year, month + 1, 0),
      };
    case 'quarter': {
      const quarter = Math.ceil(month / 3);
      return {
        key: `${year}-Q${quarter}`,
        label: `Q${quarter}/${year}`,
        from: ymd(year, quarter * 3 - 2, 1),
        to: ymd(year, quarter * 3 + 1, 0),
      };
    }
    case 'year':
      return {
        key: String(year),
        label: String(year),
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      };
  }
}

// The buckets covering from..to in order; the first and the last one are
// clipped to the range.
export function bucketsBetween(
  from: string,
  to: string,
  groupBy: GroupBy,
): Bucket[] {
  const buckets: Bucket[] = [];
  for (let date = from; date <= to; ) {
    const bucket = bucketOf(date, groupBy);
    buckets.push({
      ...bucket,
      from: date,
      to: bucket.to < to ? bucket.to : to,
    });
    date = addDays(bucket.to, 1);
  }
  return buckets;
}

// The period of the same number of days right before from..to.
export function previousRange(from: string, to: string) {
  const days = dayCount(from, to);
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

// Adds rows that carry a business `date` into their bucket; buckets without
// rows keep `empty()`.
export function rollUp<R extends { date: string }, A>(
  buckets: Bucket[],
  groupBy: GroupBy,
  rows: R[],
  empty: () => A,
  add: (acc: A, row: R) => void,
): { bucket: Bucket; value: A }[] {
  const byKey = new Map(
    buckets.map((bucket) => [bucket.key, { bucket, value: empty() }]),
  );
  for (const row of rows) {
    const entry = byKey.get(bucketOf(row.date, groupBy).key);
    if (entry) add(entry.value, row);
  }
  return [...byKey.values()];
}
