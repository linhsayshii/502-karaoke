import {
  billNumberPrefixRange,
  formatBillNumber,
  nextBillNumberOn,
  nextReportNumber,
  roomCode,
} from './bill-number';

describe('roomCode', () => {
  it('keeps 4-digit rooms and pads shorter ones with 0', () => {
    expect(roomCode('8888')).toBe('8888');
    expect(roomCode('Phòng 401')).toBe('4010');
    expect(roomCode('P302')).toBe('3020');
    expect(roomCode('P5')).toBe('5000');
  });

  it('uses the last number of the name and at most 4 digits', () => {
    expect(roomCode('Tầng 2 - 201 VIP')).toBe('2010');
    expect(roomCode('12345')).toBe('2345');
  });

  it('is 0000 without a number', () => {
    expect(roomCode('VIP')).toBe('0000');
    expect(roomCode(null)).toBe('0000');
  });
});

describe('formatBillNumber', () => {
  it('is DDMM + room + 3-digit sequence', () => {
    expect(formatBillNumber('2026-09-27', 'P302', 1)).toBe('27093020001');
    expect(formatBillNumber('2026-01-05', '8888', 12)).toBe('05018888012');
    expect(formatBillNumber('2026-09-27', 'P401', 200)).toBe('27094010200');
  });

  it('grows past 999 bills instead of wrapping', () => {
    expect(formatBillNumber('2026-09-27', 'P401', 1000)).toBe('270940101000');
  });
});

describe('billNumberPrefixRange', () => {
  const matches = (prefix: string, value: string) => {
    const { gte, lt } = billNumberPrefixRange(prefix);
    return value >= gte && (lt === undefined || value < lt);
  };

  it('covers exactly the numbers that start with the prefix', () => {
    expect(billNumberPrefixRange('2709')).toEqual({ gte: '2709', lt: '271' });
    expect(matches('2709', '27093020001')).toBe(true);
    expect(matches('2709', '27099999999')).toBe(true);
    expect(matches('2709', '27100000001')).toBe(false);
    expect(matches('2709', '27083020001')).toBe(false);
  });

  it('finds a full number', () => {
    expect(matches('27093020001', '27093020001')).toBe(true);
    expect(matches('27093020001', '27093020002')).toBe(false);
  });

  it('carries over trailing nines', () => {
    expect(billNumberPrefixRange('3199')).toEqual({ gte: '3199', lt: '32' });
    expect(billNumberPrefixRange('999')).toEqual({ gte: '999' });
  });
});

describe('nextBillNumberOn', () => {
  it('numbers a given business day through the shared counter', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ lastSeq: 51 }]) };
    const number = await nextBillNumberOn(tx as never, 1, '2026-10-02', 'P401');
    expect(number).toEqual({
      businessDate: new Date('2026-10-02T00:00:00Z'),
      billSeq: 51,
      billNumber: '02104010051',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // The counter row of that branch and that day, not of the branch's today:
    // the call is [template strings, branchId, date].
    const [, ...params] = tx.$queryRaw.mock.calls[0] as unknown[];
    expect(params).toEqual([1, '2026-10-02']);
  });
});

describe('nextReportNumber', () => {
  it('numbers an e-invoice on its own counter, in the shape of a bill number', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ lastSeq: 2 }]) };
    const number = await nextReportNumber(tx as never, 3, '2026-10-05', null);
    expect(number).toEqual({
      reportDate: new Date('2026-10-05T00:00:00Z'),
      reportSeq: 2,
      reportNumber: '05100000002',
    });
    const [strings, ...params] = tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('"ReportCounter"');
    expect(strings.join('?')).not.toContain('"BillCounter"');
    expect(params).toEqual([3, '2026-10-05']);
  });
});
