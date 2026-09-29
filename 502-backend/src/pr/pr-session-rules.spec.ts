import { checkSessionTimes, sessionMinutes } from './pr-session-rules';

const at = (hhmm: string) => new Date(`2026-09-29T${hhmm}:00`);
const base = {
  orderStart: at('20:00'),
  startAt: at('20:30'),
  endAt: null,
  now: at('22:00'),
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
      sessionMinutes(at('20:00'), new Date(at('20:00').getTime() + 61_000), at('23:00')),
    ).toBe(2);
  });

  it('counts an open visit up to now', () => {
    expect(sessionMinutes(at('20:00'), null, at('20:45'))).toBe(45);
  });

  it('never goes below zero', () => {
    expect(sessionMinutes(at('20:00'), at('19:00'), at('23:00'))).toBe(0);
  });
});
