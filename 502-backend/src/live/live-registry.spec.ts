import { Role } from '@prisma/client';
import { LiveRegistry, MAX_PER_USER, MAX_SOCKETS } from './live-registry';

const cashier = (id: number, branchId: number) => ({
  id,
  role: Role.CASHIER,
  branchId,
});
const manager = (id: number, branchId: number) => ({
  id,
  role: Role.BRANCH_MANAGER,
  branchId,
});
const chain = (id: number) => ({
  id,
  role: Role.CHAIN_MANAGER,
  branchId: null,
});

describe('LiveRegistry', () => {
  // Distinct objects: Jest's toEqual on Sets compares members structurally,
  // so plain `{}`s would all look alike.
  let n = 0;
  const sock = () => ({ n: n++ });

  it('counts every open socket against the cap, authenticated or not', () => {
    const reg = new LiveRegistry<object>();
    const sockets = Array.from({ length: MAX_SOCKETS }, sock);
    for (const s of sockets) expect(reg.open(s)).toBe(true);
    expect(reg.size).toBe(MAX_SOCKETS);
    expect(reg.open(sock())).toBe(false);
    expect(reg.size).toBe(MAX_SOCKETS);
    reg.close(sockets[0]);
    expect(reg.open(sock())).toBe(true);
  });

  it('limits sockets per user and frees the slot on close', () => {
    const reg = new LiveRegistry<object>();
    const mine = Array.from({ length: MAX_PER_USER + 1 }, sock);
    for (const s of mine) reg.open(s);
    for (let i = 0; i < MAX_PER_USER; i++) {
      expect(reg.authenticate(mine[i], cashier(7, 1), 9e12)).toBe('ok');
    }
    expect(reg.authenticate(mine[MAX_PER_USER], cashier(7, 1), 9e12)).toBe(
      'too-many',
    );
    reg.close(mine[0]);
    expect(reg.authenticate(mine[MAX_PER_USER], cashier(7, 1), 9e12)).toBe(
      'ok',
    );
    expect(reg.authenticate(sock(), cashier(7, 1), 9e12)).toBe('unknown');
  });

  it('re-authenticating the same socket keeps one slot and updates exp', () => {
    const reg = new LiveRegistry<object>();
    const s = sock();
    reg.open(s);
    reg.authenticate(s, cashier(1, 1), 100);
    expect(reg.authenticate(s, cashier(1, 1), 200)).toBe('ok');
    expect(reg.entry(s)?.exp).toBe(200);
    // one user, one socket: the per-user count did not grow
    for (let i = 0; i < MAX_PER_USER - 1; i++) {
      const t = sock();
      reg.open(t);
      expect(reg.authenticate(t, cashier(1, 1), 100)).toBe('ok');
    }
  });

  it('routes room/order events to the branch and the chain managers only', () => {
    const reg = new LiveRegistry<object>();
    const [c1, m1, c2, ch, anon] = [sock(), sock(), sock(), sock(), sock()];
    for (const s of [c1, m1, c2, ch, anon]) reg.open(s);
    reg.authenticate(c1, cashier(1, 1), 9e12);
    reg.authenticate(m1, manager(2, 1), 9e12);
    reg.authenticate(c2, cashier(3, 2), 9e12);
    reg.authenticate(ch, chain(4), 9e12);
    const got = reg.recipients({
      type: 'room.changed',
      branchId: 1,
      roomId: 5,
    });
    expect(new Set(got)).toEqual(new Set([c1, m1, ch]));
    expect(
      reg.recipients({ type: 'order.changed', branchId: 2, orderId: 9 }),
    ).toEqual(expect.arrayContaining([c2, ch]));
    expect(
      reg.recipients({ type: 'order.changed', branchId: 2, orderId: 9 }),
    ).toHaveLength(2);
  });

  it('sends discount.requested to the branch managers and chain managers, decided to the whole branch', () => {
    const reg = new LiveRegistry<object>();
    const [c1, m1, m1b, m2, ch] = [sock(), sock(), sock(), sock(), sock()];
    for (const s of [c1, m1, m1b, m2, ch]) reg.open(s);
    reg.authenticate(c1, cashier(1, 1), 9e12);
    reg.authenticate(m1, manager(2, 1), 9e12);
    reg.authenticate(m1b, manager(5, 1), 9e12);
    reg.authenticate(m2, manager(3, 2), 9e12);
    reg.authenticate(ch, chain(4), 9e12);
    expect(
      new Set(
        reg.recipients({
          type: 'discount.requested',
          branchId: 1,
          requestId: 1,
        }),
      ),
    ).toEqual(new Set([m1, m1b, ch]));
    expect(
      new Set(
        reg.recipients({
          type: 'discount.decided',
          branchId: 1,
          orderId: 1,
          requestId: 1,
          status: 'APPROVED',
        }),
      ),
    ).toEqual(new Set([c1, m1, m1b, ch]));
  });

  it('forgets a closed socket everywhere', () => {
    const reg = new LiveRegistry<object>();
    const s = sock();
    reg.open(s);
    reg.authenticate(s, chain(1), 9e12);
    reg.close(s);
    expect(reg.size).toBe(0);
    expect(reg.entry(s)).toBeUndefined();
    expect(
      reg.recipients({ type: 'room.changed', branchId: 1, roomId: 1 }),
    ).toEqual([]);
    expect([...reg.sockets()]).toEqual([]);
    reg.close(s); // closing twice is harmless
  });

  it('removes old placement when same user re-authenticates with different branch or role', () => {
    const reg = new LiveRegistry<object>();
    const s = sock();
    reg.open(s);
    // Authenticate as cashier of branch 1
    expect(reg.authenticate(s, cashier(7, 1), 100)).toBe('ok');
    expect(
      reg.recipients({ type: 'room.changed', branchId: 1, roomId: 1 }),
    ).toEqual([s]);
    expect(
      reg.recipients({ type: 'room.changed', branchId: 2, roomId: 1 }),
    ).toEqual([]);
    // Re-authenticate as same user but branchId: 2
    expect(reg.authenticate(s, cashier(7, 2), 200)).toBe('ok');
    expect(
      reg.recipients({ type: 'room.changed', branchId: 1, roomId: 1 }),
    ).toEqual([]);
    expect(
      reg.recipients({ type: 'room.changed', branchId: 2, roomId: 1 }),
    ).toEqual([s]);
    // Re-authenticate as same user but role: CHAIN_MANAGER
    expect(reg.authenticate(s, chain(7), 300)).toBe('ok');
    // Chain manager should be in recipients for any branch exactly once
    expect(
      reg.recipients({ type: 'room.changed', branchId: 1, roomId: 1 }),
    ).toEqual([s]);
    expect(
      reg.recipients({ type: 'room.changed', branchId: 2, roomId: 1 }),
    ).toEqual([s]);
    // Close and verify cleanup
    reg.close(s);
    expect(reg.size).toBe(0);
    expect(
      reg.recipients({ type: 'room.changed', branchId: 1, roomId: 1 }),
    ).toEqual([]);
    expect(
      reg.recipients({ type: 'room.changed', branchId: 2, roomId: 1 }),
    ).toEqual([]);
  });
});
