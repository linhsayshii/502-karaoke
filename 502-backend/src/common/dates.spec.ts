import {
  businessDateOf,
  businessDatesBetween,
  businessDayRange,
  getBusinessDayRange,
  MAX_REPORT_RANGE_DAYS,
} from './dates';

describe('getBusinessDayRange', () => {
  it('runs from 06:00 to 06:00 the next day (local time)', () => {
    const { start, end } = getBusinessDayRange('2026-09-30');
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([
      30, 6, 0,
    ]);
    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([9, 1, 6]);
  });

  it('rejects malformed dates', () => {
    expect(() => getBusinessDayRange('30/09/2026')).toThrow();
    expect(() => getBusinessDayRange('2026-13-45')).toThrow();
  });
});

describe('businessDateOf', () => {
  it('puts the small hours on the previous business day', () => {
    expect(businessDateOf(new Date('2026-09-27T02:30:00'))).toBe('2026-09-26');
    expect(businessDateOf(new Date('2026-09-27T05:59:59'))).toBe('2026-09-26');
    expect(businessDateOf(new Date('2026-09-27T06:00:00'))).toBe('2026-09-27');
    expect(businessDateOf(new Date('2026-09-27T09:00:00'))).toBe('2026-09-27');
    expect(businessDateOf(new Date('2026-09-27T23:00:00'))).toBe('2026-09-27');
  });

  it('agrees with getBusinessDayRange', () => {
    const { start, end } = getBusinessDayRange('2026-09-26');
    expect(businessDateOf(start)).toBe('2026-09-26');
    expect(businessDateOf(new Date(end.getTime() - 1))).toBe('2026-09-26');
    expect(businessDateOf(end)).toBe('2026-09-27');
  });
});

describe('businessDayRange', () => {
  it('covers the whole last business day', () => {
    const range = businessDayRange('2026-09-01', '2026-09-30');
    expect(range.gte).toEqual(new Date('2026-09-01T06:00:00'));
    expect(range.lt).toEqual(new Date('2026-10-01T06:00:00'));
  });

  it('leaves missing ends open', () => {
    expect(businessDayRange()).toEqual({});
    expect(businessDayRange(undefined, '2026-09-01')).toEqual({
      lt: new Date('2026-09-02T06:00:00'),
    });
  });

  it('rejects a reversed range', () => {
    expect(() => businessDayRange('2026-09-02', '2026-09-01')).toThrow();
  });
});

describe('businessDatesBetween', () => {
  it('lists every day, across month ends', () => {
    expect(businessDatesBetween('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('limits the length of a report', () => {
    expect(() => businessDatesBetween('2020-01-01', '2026-01-01')).toThrow();
  });
});

describe('parseLocalDate (rejecting impossible calendar dates)', () => {
  it('rejects a day/month combination that rolls over (JS Date is lenient by default)', () => {
    expect(() => getBusinessDayRange('2026-02-30')).toThrow();
    expect(() => businessDatesBetween('2026-02-30', '2026-03-05')).toThrow();
  });

  it('rejects an out-of-range month', () => {
    expect(() => getBusinessDayRange('2026-13-01')).toThrow();
  });

  it('accepts a real leap day', () => {
    expect(() => getBusinessDayRange('2024-02-29')).not.toThrow();
    expect(businessDatesBetween('2024-02-28', '2024-03-01')).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });
});

describe('businessDatesBetween with a longer limit', () => {
  it('accepts up to maxDays days', () => {
    // 2024 is a leap year: 366 + 365 days.
    expect(
      businessDatesBetween('2024-01-01', '2025-12-31', MAX_REPORT_RANGE_DAYS),
    ).toHaveLength(731);
    expect(() => businessDatesBetween('2024-01-01', '2025-12-31')).toThrow(
      'Chỉ xem được tối đa 366 ngày một lần',
    );
    expect(() =>
      businessDatesBetween('2020-01-01', '2025-12-31', MAX_REPORT_RANGE_DAYS),
    ).toThrow('Chỉ xem được tối đa 1830 ngày một lần');
  });
});
