import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { PrViewGuard } from './pr-view.guard';

const context = (user?: Partial<AuthUser>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('PrViewGuard', () => {
  const guard = new PrViewGuard();

  it('lets managers, PR managers and the board through', () => {
    expect(guard.canActivate(context({ role: Role.BRANCH_MANAGER }))).toBe(
      true,
    );
    expect(
      guard.canActivate(context({ role: Role.CASHIER, managesPr: true })),
    ).toBe(true);
    expect(guard.canActivate(context({ role: Role.BOARD }))).toBe(true);
  });

  it('stops a cashier without the PR flag', () => {
    expect(() =>
      guard.canActivate(context({ role: Role.CASHIER, managesPr: false })),
    ).toThrow(ForbiddenException);
  });

  it('stops a request without a user', () => {
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
