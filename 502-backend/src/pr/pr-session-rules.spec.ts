import { checkSessionTimes, sessionMinutes } from './pr-session-rules';

const at = (hhmm: string) => new Date(`2026-09-29T${hhmm}:00`);
const base = {
  orderStart: at('20:00'),
  startAt: at('20:30'),
  endAt: null,
  now: at('22:00'),
  lockedAt: null,
};

describe('checkSessionTimes', () => {
  it('accepts an open visit inside the session', () => {
    expect(checkSessionTimes(base)).toBeNull();
  });

  it('accepts a closed visit', () => {
    expect(checkSessionTimes({ ...base, endAt: at('21:00') })).toBeNull();
  });

  it('rejects a start before the room opened', () => {
    expect(checkSessionTimes({ ...base, startAt: at('19:59') })).toBe(
      'Giờ vào phải sau giờ mở phòng',
    );
  });

  it('rejects times in the future', () => {
    expect(checkSessionTimes({ ...base, startAt: at('22:01') })).toBe(
      'Giờ vào không được sau hiện tại',
    );
    expect(checkSessionTimes({ ...base, endAt: at('22:01') })).toBe(
      'Giờ ra không được sau hiện tại',
    );
  });

  it('rejects an end before the start', () => {
    expect(checkSessionTimes({ ...base, endAt: at('20:29') })).toBe(
      'Giờ ra phải sau giờ vào',
    );
  });
});

describe('sessionMinutes', () => {
  it('counts started minutes of a closed visit', () => {
    expect(sessionMinutes(at('20:00'), at('21:00'), at('23:00'))).toBe(60);
    expect(
      sessionMinutes(
        at('20:00'),
        new Date(at('20:00').getTime() + 61_000),
        at('23:00'),
      ),
    ).toBe(2);
  });

  it('counts an open visit up to now', () => {
    expect(sessionMinutes(at('20:00'), null, at('20:45'))).toBe(45);
  });

  it('never goes below zero', () => {
    expect(sessionMinutes(at('20:00'), at('19:00'), at('23:00'))).toBe(0);
  });
});

describe('checkSessionTimes after the time is locked', () => {
  const orderStart = new Date('2026-09-30T13:00:00Z');
  const lockedAt = new Date('2026-09-30T15:00:00Z');
  const now = new Date('2026-09-30T15:30:00Z');

  it('keeps visits inside the locked time', () => {
    expect(
      checkSessionTimes({
        orderStart,
        startAt: new Date('2026-09-30T14:00:00Z'),
        endAt: new Date('2026-09-30T15:10:00Z'),
        now,
        lockedAt,
      }),
    ).toBe('Giờ ra không được sau lúc chốt giờ');
  });
  it('needs an end time', () => {
    expect(
      checkSessionTimes({
        orderStart,
        startAt: new Date('2026-09-30T14:00:00Z'),
        endAt: null,
        now,
        lockedAt,
      }),
    ).toBe('Phòng đã chốt giờ, PR phải có giờ ra');
  });
  it('accepts a visit ending at the lock', () => {
    expect(
      checkSessionTimes({
        orderStart,
        startAt: new Date('2026-09-30T14:00:00Z'),
        endAt: lockedAt,
        now,
        lockedAt,
      }),
    ).toBeNull();
  });
});
