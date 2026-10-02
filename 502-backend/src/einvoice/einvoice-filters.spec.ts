import { BadRequestException } from '@nestjs/common';
import { dbDay } from './einvoice-filters';

describe('dbDay', () => {
  it('takes a day from 2000 on', () => {
    expect(dbDay('2000-01-01')).toEqual(new Date('2000-01-01T00:00:00Z'));
    expect(dbDay('2026-10-02')).toEqual(new Date('2026-10-02T00:00:00Z'));
  });

  // 0000-01-01 is a valid JS date but not a PostgreSQL one (::date fails
  // with a 500); a mistyped year must not make a real bill either.
  it.each(['0000-01-01', '1999-12-31'])('refuses %s', (day) => {
    expect(() => dbDay(day)).toThrow(BadRequestException);
    expect(() => dbDay(day)).toThrow(
      'Ngày không hợp lệ (định dạng YYYY-MM-DD)',
    );
  });

  it('refuses a day that does not exist, with the message it is given', () => {
    expect(() => dbDay('2026-02-30', 'Ngày xuất sai')).toThrow('Ngày xuất sai');
  });
});
