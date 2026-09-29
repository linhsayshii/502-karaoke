// Rules of a PR/KTV visit to a room (PrSession), shared by the service and
// its tests. A visit never costs the customer anything: it only records time.

export interface SessionTimes {
  orderStart: Date; // when the room session opened
  startAt: Date;
  endAt: Date | null; // null: still in the room
  now: Date;
}

// The Vietnamese error of impossible times, or null when they are fine.
export function checkSessionTimes({
  orderStart,
  startAt,
  endAt,
  now,
}: SessionTimes): string | null {
  if (startAt < orderStart) return 'Giờ vào phải sau giờ mở phòng';
  if (startAt > now) return 'Giờ vào không được sau hiện tại';
  if (endAt) {
    if (endAt < startAt) return 'Giờ ra phải sau giờ vào';
    if (endAt > now) return 'Giờ ra không được sau hiện tại';
  }
  return null;
}

// Started minutes of a visit (an open one counts up to now), as the SQL of
// GET /pr/stats counts them.
export function sessionMinutes(startAt: Date, endAt: Date | null, now: Date) {
  const ms = (endAt ?? now).getTime() - startAt.getTime();
  return Math.max(0, Math.ceil(ms / 60_000));
}
