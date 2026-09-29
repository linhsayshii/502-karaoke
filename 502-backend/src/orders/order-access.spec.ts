import { Role } from '@prisma/client';
import { isServerOf } from './order-access';

describe('isServerOf', () => {
  it('is the staff member assigned as server', () => {
    expect(isServerOf({ id: 7, role: Role.STAFF }, { serverId: 7 })).toBe(true);
  });
  it('is not the CSKH, another staff member or a cashier', () => {
    expect(isServerOf({ id: 7, role: Role.STAFF }, { serverId: 8 })).toBe(
      false,
    );
    expect(isServerOf({ id: 7, role: Role.STAFF }, { serverId: null })).toBe(
      false,
    );
    expect(isServerOf({ id: 7, role: Role.CASHIER }, { serverId: 7 })).toBe(
      false,
    );
  });
});
