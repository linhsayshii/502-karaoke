import { hourGrid, occupancy, rank, roundToTotal } from './breakdowns';

describe('roundToTotal', () => {
  it('rounds shares of a whole sum so that they still add up to it', () => {
    // 7 đồng over 50,000 + 10,000: 5.83 + 1.17 → 6 + 1.
    expect(roundToTotal([(50000 * 7) / 60000, (10000 * 7) / 60000], 7)).toEqual(
      [6, 1],
    );
    expect(roundToTotal([1 / 3, 1 / 3, 1 / 3], 1)).toEqual([1, 0, 0]);
    // Ties go to the first value.
    expect(roundToTotal([2.5, 2.5], 5)).toEqual([3, 2]);
  });

  it('keeps whole values and accepts no values', () => {
    expect(roundToTotal([3, 4], 7)).toEqual([3, 4]);
    expect(roundToTotal([], 0)).toEqual([]);
  });

  it('absorbs floating-point noise', () => {
    expect(roundToTotal([0.1 + 0.2, 0.7], 1)).toEqual([0, 1]);
    expect(roundToTotal([5.9999999999, 1.0000000001], 7)).toEqual([6, 1]);
  });
});

describe('occupancy', () => {
  it('is the share of the opening hours (1110 minutes a day) in use', () => {
    expect(occupancy(1110, 1, 1)).toBe(1);
    expect(occupancy(555, 2, 1)).toBe(0.25);
    expect(occupancy(1110, 1, 2)).toBe(0.5);
  });

  it('is null without rooms', () => {
    expect(occupancy(0, 3, 0)).toBeNull();
  });
});

describe('rank', () => {
  it('puts the highest value first, ties by name, the row without a subject last', () => {
    const rows = [
      { id: null, name: null, value: 9 },
      { id: 1, name: 'B', value: 5 },
      { id: 2, name: 'A', value: 5 },
      { id: 3, name: 'C', value: 7 },
    ];
    expect(rank(rows, (r) => r.value).map((r) => r.id)).toEqual([
      3,
      2,
      1,
      null,
    ]);
    // The input is left as it was.
    expect(rows.map((r) => r.id)).toEqual([null, 1, 2, 3]);
  });
});

describe('hourGrid', () => {
  it('has a cell for every weekday × hour, Monday 00:00 first', () => {
    const cells = hourGrid([
      { weekday: 5, hour: 22, sessions: 2, revenue: 300 },
    ]);
    expect(cells).toHaveLength(7 * 24);
    expect(cells[0]).toEqual({ weekday: 1, hour: 0, sessions: 0, revenue: 0 });
    expect(cells[167]).toEqual({
      weekday: 7,
      hour: 23,
      sessions: 0,
      revenue: 0,
    });
    expect(cells[4 * 24 + 22]).toEqual({
      weekday: 5,
      hour: 22,
      sessions: 2,
      revenue: 300,
    });
    expect(cells.reduce((s, c) => s + c.sessions, 0)).toBe(2);
  });
});
