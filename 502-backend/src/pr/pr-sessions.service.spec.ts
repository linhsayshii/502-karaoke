import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role, StaffPosition } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { LiveEventsService } from '../live/live-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { PrSessionsService } from './pr-sessions.service';

// The rules of a visit read the order's server and lock time: they must be
// read under the order lock, or a change committed just before the lock is
// missed (a PR added to a locked room ends before it starts at checkout).
// The fake order below changes at the moment the row gets locked, as if
// another transaction committed while this one waited for the lock.

const user = (role: Role, id = 1): AuthUser => ({
  id,
  username: 'u',
  fullName: 'U',
  role,
  position: role === Role.STAFF ? StaffPosition.SERVER : null,
  managesPr: false,
  branchId: 1,
  branch: { id: 1, code: 'cs1', name: 'Cơ sở 1' },
});

function serviceWith(beforeLock: object, afterLock: object) {
  let locked = false;
  const current = () => ({
    id: 7,
    branchId: 1,
    startTime: new Date(Date.now() - 3_600_000),
    ...(locked ? afterLock : beforeLock),
  });
  const tx = {
    order: {
      findUnique: jest.fn(() => Promise.resolve(current())),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(current())),
      updateMany: jest.fn(() => {
        locked = true;
        return Promise.resolve({ count: 1 });
      }),
    },
    // Anything past the checks: the test fails if it gets here.
    $queryRaw: jest.fn(() => Promise.reject(new Error('went past the checks'))),
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  const branchScope = {
    assertBranchAccess: jest.fn(),
  } as unknown as BranchScopeService;
  const live = {
    orderChanged: jest.fn(),
  } as unknown as LiveEventsService;
  return new PrSessionsService(
    prisma,
    {} as ReportPrismaService,
    branchScope,
    live,
  );
}

describe('PrSessionsService reads the order under its lock', () => {
  it('sees a time lock committed while it waited for the row', async () => {
    const service = serviceWith(
      { serverId: null, timeLockedAt: null },
      { serverId: null, timeLockedAt: new Date() },
    );
    await expect(
      service.add(user(Role.CASHIER), { orderId: 7, prStaffId: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('sees a server change committed while it waited for the row', async () => {
    const service = serviceWith(
      { serverId: 5, timeLockedAt: null },
      { serverId: 6, timeLockedAt: null },
    );
    await expect(
      service.add(user(Role.STAFF, 5), { orderId: 7, prStaffId: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
