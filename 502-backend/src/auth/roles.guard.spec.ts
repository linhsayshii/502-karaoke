import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

const context = (role?: Role) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => jest.restoreAllMocks());

  it('allows any authenticated user when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(context(Role.STAFF))).toBe(true);
  });

  it('allows a listed role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.CHAIN_MANAGER, Role.BRANCH_MANAGER]);
    expect(guard.canActivate(context(Role.BRANCH_MANAGER))).toBe(true);
  });

  it('rejects other roles and missing users', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.CHAIN_MANAGER, Role.BRANCH_MANAGER]);
    expect(() => guard.canActivate(context(Role.CASHIER))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
