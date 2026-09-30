import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { WebSocket } from 'ws';
import { UsersService } from '../users/users.service';
import { LiveEventsService } from './live-events.service';
import {
  CLOSE_AUTH,
  CLOSE_EXPIRED,
  HEARTBEAT_MS,
  LiveGateway,
  MAX_FAILED_AUTHS,
} from './live.gateway';

// Plain objects stand in for ws sockets (the registry is generic over them).
class FakeSocket {
  readyState: number = WebSocket.OPEN;
  pings = 0;
  terminated = false;
  closedWith: number | null = null;
  sent: string[] = [];
  private handlers = new Map<string, (...args: unknown[]) => void>();
  on(event: string, fn: (...args: unknown[]) => void) {
    this.handlers.set(event, fn);
    return this;
  }
  ping() {
    this.pings += 1;
  }
  terminate() {
    this.terminated = true;
    this.readyState = WebSocket.CLOSED;
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = WebSocket.CLOSING;
  }
  send(data: string) {
    this.sent.push(data);
  }
  pong() {
    this.handlers.get('pong')?.();
  }
  // Returns the promise of the handler's work so tests can await it.
  message(payload: unknown) {
    this.handlers.get('message')?.(Buffer.from(JSON.stringify(payload)));
  }
}

const cashier = { id: 7, role: Role.CASHIER, branchId: 1 };

describe('LiveGateway', () => {
  let events: LiveEventsService;
  let gateway: LiveGateway;
  let verify: jest.Mock;
  let findAuthUser: jest.Mock;
  const tick = () => (gateway as unknown as { tick(): void }).tick();
  const connect = () => {
    const s = new FakeSocket();
    gateway.handleConnection(s as unknown as WebSocket);
    return s;
  };
  const flush = () =>
    new Promise<void>((r) =>
      jest.requireActual<typeof import('timers')>('timers').setImmediate(r),
    );

  beforeEach(() => {
    jest.useFakeTimers();
    events = new LiveEventsService();
    verify = jest.fn().mockReturnValue({ sub: 7, exp: 9e9 });
    findAuthUser = jest.fn().mockResolvedValue(cashier);
    gateway = new LiveGateway(
      events,
      { verify } as unknown as JwtService,
      { findAuthUser } as unknown as UsersService,
    );
    gateway.afterInit();
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  it('pings a silent socket at ticks 1 and 2 and terminates it at tick 3', () => {
    const s = connect();
    tick();
    tick();
    expect(s.pings).toBe(2);
    expect(s.terminated).toBe(false);
    tick();
    expect(s.pings).toBe(2);
    expect(s.terminated).toBe(true);
  });

  it('runs the tick on the heartbeat interval', async () => {
    const s = connect();
    // really signed in through the gateway, which also cancels the 5 s auth timeout
    s.message({ type: 'auth', token: 'a' });
    await flush();
    jest.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(s.pings).toBe(2);
    expect(s.terminated).toBe(true);
  });

  it('a pong resets the miss count', () => {
    const s = connect();
    tick();
    tick();
    s.pong();
    tick();
    tick();
    expect(s.terminated).toBe(false);
    expect(s.pings).toBe(4);
    tick();
    expect(s.terminated).toBe(true);
  });

  it('closes an authenticated socket 4002 once its token is 60 s past exp', () => {
    const s = connect();
    const entry = events.registry.entry(s as unknown as WebSocket)!;
    const nowS = Math.floor(Date.now() / 1000);
    events.registry.authenticate(
      s as unknown as WebSocket,
      cashier,
      nowS - 30, // expired 30 s ago: still within the grace
    );
    tick();
    expect(s.closedWith).toBeNull();
    entry.exp = nowS - 61;
    tick();
    expect(s.closedWith).toBe(CLOSE_EXPIRED);
  });

  it('drops a second auth frame while the first is being checked', async () => {
    const s = connect();
    let release!: (u: typeof cashier) => void;
    findAuthUser.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    s.message({ type: 'auth', token: 'a' });
    s.message({ type: 'auth', token: 'b' });
    s.message({ type: 'auth', token: 'c' });
    expect(findAuthUser).toHaveBeenCalledTimes(1);
    release(cashier);
    await flush();
    expect(s.sent).toEqual([JSON.stringify({ type: 'ready', userId: 7 })]);
    // the guard is released afterwards: a renewal is checked again
    findAuthUser.mockResolvedValue(cashier);
    s.message({ type: 'auth', token: 'd' });
    expect(findAuthUser).toHaveBeenCalledTimes(2);
  });

  it('ignores frames on a socket that is no longer open', () => {
    const s = connect();
    s.readyState = WebSocket.CLOSING;
    s.message({ type: 'auth', token: 'a' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('closes a socket that never authenticated at its first refused auth', async () => {
    const s = connect();
    findAuthUser.mockResolvedValue(null);
    s.message({ type: 'auth', token: 'a' });
    await flush();
    expect(s.closedWith).toBe(CLOSE_AUTH);
  });

  it('closes a signed-in socket with 4001 at its 3rd refused auth', async () => {
    const s = connect();
    s.message({ type: 'auth', token: 'a' });
    await flush();
    expect(s.sent).toHaveLength(1); // ready
    verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    for (let i = 1; i < MAX_FAILED_AUTHS; i++) {
      s.message({ type: 'auth', token: 'bad' });
      await flush();
      expect(s.closedWith).toBeNull();
    }
    s.message({ type: 'auth', token: 'bad' });
    await flush();
    expect(s.closedWith).toBe(CLOSE_AUTH);
  });
});
