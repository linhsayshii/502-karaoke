import { dateRange, getBusinessDayRange } from './dates';

describe('getBusinessDayRange', () => {
  it('runs from 11:30 to 06:00 the next day (local time)', () => {
    const { start, end } = getBusinessDayRange('2026-09-30');
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([
      30, 11, 30,
    ]);
    expect([end.getMonth(), end.getDate(), end.getHours()]).toEqual([9, 1, 6]);
  });

  it('rejects malformed dates', () => {
    expect(() => getBusinessDayRange('30/09/2026')).toThrow();
  });
});

describe('dateRange', () => {
  it('includes the whole "to" day', () => {
    const range = dateRange('2026-09-01', '2026-09-30');
    expect(range.gte).toEqual(new Date('2026-09-01T00:00:00'));
    expect(range.lt).toEqual(new Date('2026-10-01T00:00:00'));
  });

  it('leaves missing ends open', () => {
    expect(dateRange()).toEqual({});
  });
});
