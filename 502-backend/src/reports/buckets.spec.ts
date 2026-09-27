import {
  addDays,
  bucketOf,
  bucketsBetween,
  dayCount,
  previousRange,
  rollUp,
} from './buckets';

describe('bucketOf', () => {
  it('labels days, months, quarters and years in Vietnamese', () => {
    expect(bucketOf('2026-09-27', 'day')).toEqual({
      key: '2026-09-27',
      label: '27/09/2026',
      from: '2026-09-27',
      to: '2026-09-27',
    });
    expect(bucketOf('2026-02-10', 'month')).toEqual({
      key: '2026-02',
      label: 'T2/2026',
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(bucketOf('2024-02-10', 'month').to).toBe('2024-02-29');
    expect(bucketOf('2026-08-15', 'quarter')).toEqual({
      key: '2026-Q3',
      label: 'Q3/2026',
      from: '2026-07-01',
      to: '2026-09-30',
    });
    expect(bucketOf('2026-12-31', 'quarter').from).toBe('2026-10-01');
    expect(bucketOf('2026-12-31', 'year')).toEqual({
      key: '2026',
      label: '2026',
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('uses ISO weeks: Monday to Sunday, in the year of their Thursday', () => {
    // 2026-09-27 is a Sunday.
    expect(bucketOf('2026-09-27', 'week')).toEqual({
      key: '2026-W39',
      label: 'Tuần 39 (21/09–27/09)',
      from: '2026-09-21',
      to: '2026-09-27',
    });
    // 1 Jan 2026 is a Thursday: week 1 starts on Monday 29 Dec 2025.
    expect(bucketOf('2025-12-29', 'week')).toMatchObject({
      key: '2026-W01',
      from: '2025-12-29',
      to: '2026-01-04',
    });
    // 1 Jan 2027 (a Friday) still belongs to week 53 of 2026.
    expect(bucketOf('2027-01-01', 'week').key).toBe('2026-W53');
  });
});

describe('bucketsBetween', () => {
  it('clips the first and the last bucket to the range', () => {
    expect(
      bucketsBetween('2026-08-15', '2026-10-05', 'month').map((b) => [
        b.key,
        b.from,
        b.to,
      ]),
    ).toEqual([
      ['2026-08', '2026-08-15', '2026-08-31'],
      ['2026-09', '2026-09-01', '2026-09-30'],
      ['2026-10', '2026-10-01', '2026-10-05'],
    ]);
  });

  it('covers every day of the range, in order', () => {
    expect(
      bucketsBetween('2026-09-01', '2026-09-03', 'day').map((b) => b.key),
    ).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(
      bucketsBetween('2026-09-27', '2026-09-28', 'week').map((b) => b.key),
    ).toEqual(['2026-W39', '2026-W40']);
    expect(
      bucketsBetween('2025-11-20', '2026-02-01', 'year').map((b) => [
        b.key,
        b.from,
        b.to,
      ]),
    ).toEqual([
      ['2025', '2025-11-20', '2025-12-31'],
      ['2026', '2026-01-01', '2026-02-01'],
    ]);
  });
});

describe('date arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayCount('2024-01-01', '2024-12-31')).toBe(366);
    expect(dayCount('2026-09-27', '2026-09-27')).toBe(1);
  });

  it('gives the days of the same length right before, by day', () => {
    expect(previousRange('2026-09-01', '2026-09-27', 'day')).toEqual({
      from: '2026-08-05',
      to: '2026-08-31',
    });
    expect(previousRange('2026-03-01', '2026-03-01')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('gives the whole previous weeks, months and quarters', () => {
    // Wednesday to Friday → the whole week before (Mon–Sun).
    expect(previousRange('2026-09-23', '2026-09-25', 'week')).toEqual({
      from: '2026-09-14',
      to: '2026-09-20',
    });
    expect(previousRange('2026-09-01', '2026-09-27', 'month')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(previousRange('2026-03-10', '2026-03-20', 'month')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    // Three months → the three whole months before.
    expect(previousRange('2026-07-01', '2026-09-27', 'month')).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(previousRange('2026-07-01', '2026-09-27', 'quarter')).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(previousRange('2026-01-15', '2026-02-10', 'quarter')).toEqual({
      from: '2025-10-01',
      to: '2025-12-31',
    });
  });

  it('gives the same dates a year earlier, by year', () => {
    expect(previousRange('2026-01-01', '2026-09-27', 'year')).toEqual({
      from: '2025-01-01',
      to: '2025-09-27',
    });
    expect(previousRange('2024-02-01', '2024-02-29', 'year')).toEqual({
      from: '2023-02-01',
      to: '2023-02-28',
    });
    // Two calendar years → two years earlier, so the periods never overlap.
    expect(previousRange('2025-06-01', '2026-03-31', 'year')).toEqual({
      from: '2023-06-01',
      to: '2024-03-31',
    });
  });
});

describe('rollUp', () => {
  it('sums rows into their bucket and keeps empty buckets', () => {
    const buckets = bucketsBetween('2026-09-01', '2026-10-31', 'month');
    const rows = [
      { date: '2026-09-03', n: 2 },
      { date: '2026-09-20', n: 3 },
    ];
    const result = rollUp(
      buckets,
      'month',
      rows,
      () => ({ n: 0 }),
      (acc, row) => {
        acc.n += row.n;
      },
    );
    expect(result.map((r) => [r.bucket.key, r.value.n])).toEqual([
      ['2026-09', 5],
      ['2026-10', 0],
    ]);
  });
});
