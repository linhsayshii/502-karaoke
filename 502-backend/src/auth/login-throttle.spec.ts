import { HttpException } from '@nestjs/common';
import {
  FAILED_LOGIN_WINDOW_MS,
  LOGIN_LOCK_MS,
  LoginThrottle,
  MAX_FAILED_LOGINS,
} from './login-throttle';

describe('LoginThrottle', () => {
  let throttle: LoginThrottle;
  let clock: number;

  beforeEach(() => {
    throttle = new LoginThrottle();
    clock = 1_000_000;
    throttle.now = () => clock;
  });

  const fail = (username: string, times: number) => {
    for (let i = 0; i < times; i++) throttle.recordFailure(username);
  };

  it('allows attempts below the limit', () => {
    fail('tn1_cs1', MAX_FAILED_LOGINS - 1);
    expect(() => throttle.assertAllowed('tn1_cs1')).not.toThrow();
  });

  it('locks a username after too many failures, case-insensitively', () => {
    fail('TN1_cs1', MAX_FAILED_LOGINS);
    let error: unknown;
    try {
      throttle.assertAllowed(' tn1_cs1 ');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toBe(
      'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    );
    // Other accounts are not affected.
    expect(() => throttle.assertAllowed('ql1_cs1')).not.toThrow();
  });

  it('unlocks after the lock period', () => {
    fail('tn1_cs1', MAX_FAILED_LOGINS);
    clock += LOGIN_LOCK_MS;
    expect(() => throttle.assertAllowed('tn1_cs1')).not.toThrow();
  });

  it('forgets failures older than the window', () => {
    fail('tn1_cs1', MAX_FAILED_LOGINS - 1);
    clock += FAILED_LOGIN_WINDOW_MS;
    fail('tn1_cs1', 1);
    expect(() => throttle.assertAllowed('tn1_cs1')).not.toThrow();
  });

  it('clears the failures on a successful login', () => {
    fail('tn1_cs1', MAX_FAILED_LOGINS - 1);
    throttle.recordSuccess('tn1_cs1');
    fail('tn1_cs1', 1);
    expect(() => throttle.assertAllowed('tn1_cs1')).not.toThrow();
  });
});
