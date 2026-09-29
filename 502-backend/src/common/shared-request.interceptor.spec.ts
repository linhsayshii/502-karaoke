import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';
import { lastValueFrom, Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';
import {
  requestKey,
  SharedRequestInterceptor,
} from './shared-request.interceptor';

const user = (role: Role, branchId: number | null) =>
  ({ id: 1, role, branchId }) as AuthUser;
const request = (originalUrl: string, u?: AuthUser) =>
  ({ method: 'GET', originalUrl, user: u }) as never;
const context = (req: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;

// A handler that resolves when told to, counting how often it ran.
function handler() {
  let runs = 0;
  let settle: (value: unknown) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const next: CallHandler = {
    handle: () => {
      runs++;
      return new Observable((subscriber) => {
        settle = (value) => {
          subscriber.next(value);
          subscriber.complete();
        };
        fail = (error) => subscriber.error(error);
      });
    },
  };
  return {
    next,
    runs: () => runs,
    settle: (v: unknown) => settle(v),
    fail: (e: unknown) => fail(e),
  };
}

describe('requestKey', () => {
  it('ignores the order of the query parameters', () => {
    const admin = user(Role.CHAIN_MANAGER, null);
    expect(requestKey(request('/api/reports/revenue?to=2&from=1', admin))).toBe(
      requestKey(request('/api/reports/revenue?from=1&to=2', admin)),
    );
  });

  it('shares between the roles that see every branch', () => {
    expect(
      requestKey(
        request('/api/reports/revenue?from=1', user(Role.BOARD, null)),
      ),
    ).toBe(
      requestKey(
        request('/api/reports/revenue?from=1', user(Role.CHAIN_MANAGER, null)),
      ),
    );
  });

  it('never shares between branches or with the whole chain', () => {
    const url = '/api/reports/revenue?from=1';
    const keys = new Set([
      requestKey(request(url, user(Role.BRANCH_MANAGER, 1))),
      requestKey(request(url, user(Role.BRANCH_MANAGER, 2))),
      requestKey(request(url, user(Role.CHAIN_MANAGER, null))),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('SharedRequestInterceptor', () => {
  const req = request('/api/reports/revenue?from=1', user(Role.BOARD, null));

  it('runs identical requests in flight once', async () => {
    const interceptor = new SharedRequestInterceptor();
    const h = handler();
    const first = lastValueFrom(interceptor.intercept(context(req), h.next));
    const second = lastValueFrom(interceptor.intercept(context(req), h.next));
    h.settle({ total: 5 });
    await expect(first).resolves.toEqual({ total: 5 });
    await expect(second).resolves.toEqual({ total: 5 });
    expect(h.runs()).toBe(1);
    expect(interceptor.size).toBe(0);
  });

  it('computes again once the earlier request has finished', async () => {
    const interceptor = new SharedRequestInterceptor();
    const h = handler();
    const first = lastValueFrom(interceptor.intercept(context(req), h.next));
    h.settle(1);
    await first;
    const second = lastValueFrom(interceptor.intercept(context(req), h.next));
    h.settle(2);
    await expect(second).resolves.toBe(2);
    expect(h.runs()).toBe(2);
  });

  it('shares an error and then forgets it', async () => {
    const interceptor = new SharedRequestInterceptor();
    const h = handler();
    const first = lastValueFrom(interceptor.intercept(context(req), h.next));
    const second = lastValueFrom(interceptor.intercept(context(req), h.next));
    h.fail(new Error('x'));
    await expect(first).rejects.toThrow('x');
    await expect(second).rejects.toThrow('x');
    expect(interceptor.size).toBe(0);
  });
});
