import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const MAX_FAILED_LOGINS = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
// Bounds the memory an attacker can fill with made-up usernames.
const MAX_TRACKED = 10_000;

interface Attempts {
  failures: number[];
  lockedUntil: number;
}

const keyOf = (username: string) => username.trim().toLowerCase();

// Slows password guessing: after MAX_FAILED_LOGINS wrong passwords for one
// username within FAILED_LOGIN_WINDOW_MS, that username cannot log in for
// LOGIN_LOCK_MS. Kept in memory (a single backend process; a restart clears
// it). Limits per client IP belong to the reverse proxy (see DEPLOYMENT.md).
@Injectable()
export class LoginThrottle {
  private attempts = new Map<string, Attempts>();
  now = () => Date.now();

  // `what` names the refused action in the message (the purge reuses this).
  assertAllowed(username: string, what = 'Đăng nhập sai') {
    const entry = this.attempts.get(keyOf(username));
    const now = this.now();
    if (entry && entry.lockedUntil > now) {
      const minutes = Math.ceil((entry.lockedUntil - now) / 60_000);
      throw new HttpException(
        `${what} quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(username: string) {
    const now = this.now();
    const key = keyOf(username);
    const entry = this.attempts.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures
      .filter((time) => now - time < FAILED_LOGIN_WINDOW_MS)
      .concat(now);
    if (entry.failures.length >= MAX_FAILED_LOGINS) {
      entry.lockedUntil = now + LOGIN_LOCK_MS;
      entry.failures = [];
    }
    this.attempts.delete(key);
    this.attempts.set(key, entry);
    this.prune(now);
  }

  recordSuccess(username: string) {
    this.attempts.delete(keyOf(username));
  }

  private prune(now: number) {
    if (this.attempts.size <= MAX_TRACKED) return;
    for (const [key, entry] of this.attempts) {
      const stale =
        entry.lockedUntil <= now &&
        entry.failures.every((time) => now - time >= FAILED_LOGIN_WINDOW_MS);
      if (stale) this.attempts.delete(key);
    }
    // Still full: drop the least recently failed usernames.
    for (const key of this.attempts.keys()) {
      if (this.attempts.size <= MAX_TRACKED) break;
      this.attempts.delete(key);
    }
  }
}
