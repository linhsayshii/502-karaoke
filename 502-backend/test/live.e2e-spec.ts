// test/live.e2e-spec.ts
import { execSync } from 'child_process';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { LiveEventsService } from '../src/live/live-events.service';
import { AUTH_TIMEOUT_MS } from '../src/live/live.gateway';

// The signal channel of the cashier and manager screens (spec §7, §11): who
// may connect, who hears what. Uses Node's global WebSocket (Node ≥ 22).

type Json = Record<string, unknown>;

const anyNumber = expect.any(Number) as number;

// One client socket with a queue of parsed messages.
class Client {
  readonly messages: Json[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: ((m: Json) => void)[] = [];
  readonly ws: WebSocket;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Json;
      const w = this.waiters.shift();
      if (w) w(m);
      else this.messages.push(m);
    };
    this.ws.onclose = (e) => (this.closed = { code: e.code, reason: e.reason });
  }
  opened() {
    return new Promise<void>((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('ws error'));
    });
  }
  auth(token: string) {
    this.ws.send(JSON.stringify({ type: 'auth', token }));
  }
  next(timeoutMs = 3000): Promise<Json> {
    const queued = this.messages.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('no message')), timeoutMs);
      this.waiters.push((m) => {
        clearTimeout(t);
        res(m);
      });
    });
  }
  // Every message that arrives within `ms`.
  async drain(ms = 500): Promise<Json[]> {
    await new Promise((r) => setTimeout(r, ms));
    return this.messages.splice(0);
  }
  waitClose(timeoutMs = AUTH_TIMEOUT_MS + 2000) {
    return new Promise<{ code: number; reason: string }>((res, rej) => {
      if (this.closed) return res(this.closed);
      const t = setTimeout(() => rej(new Error('not closed')), timeoutMs);
      this.ws.addEventListener('close', (e) => {
        clearTimeout(t);
        res({ code: e.code, reason: e.reason });
      });
    });
  }
  close() {
    this.ws.close(1000);
  }
}

describe('Live events (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  const tokens: Record<string, string> = {};
  let roomIds: number[] = [];
  const clients: Client[] = [];

  const api = () => request(app.getHttpServer());
  const as = (name: string) => {
    const auth = `Bearer ${tokens[name]}`;
    return {
      get: (u: string) => api().get(`/api${u}`).set('Authorization', auth),
      post: (u: string, body: Json = {}) =>
        api().post(`/api${u}`).set('Authorization', auth).send(body),
      patch: (u: string, body: Json = {}) =>
        api().patch(`/api${u}`).set('Authorization', auth).send(body),
    };
  };
  const login = async (username: string) => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password: '12345678' })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };
  // Connects and authenticates as `name`, consuming the `ready` message.
  const connectAs = async (name: string) => {
    const c = new Client(url);
    clients.push(c);
    await c.opened();
    c.auth(tokens[name]);
    expect(await c.next()).toMatchObject({ type: 'ready' });
    return c;
  };

  beforeAll(async () => {
    execSync('npx prisma migrate reset --force --skip-generate', {
      env: { ...process.env, SEED_DEMO: '1' },
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    // A real port: the browser's WebSocket needs a listening server.
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    url = `ws://127.0.0.1:${port}/api/ws`;
    for (const name of [
      'admin',
      'ql1_cs1',
      'tn1_cs1',
      'pv1_cs1',
      'ql1_cs2',
      'tn1_cs2',
    ])
      await login(name);
    const rooms = (await as('tn1_cs1').get('/rooms').expect(200))
      .body as Json[];
    roomIds = rooms
      .filter((r) => r.status === 'AVAILABLE')
      .map((r) => r.id as number);
    expect(roomIds.length).toBeGreaterThanOrEqual(2);
  });

  // Close every client and wait until the server has forgotten them, so one
  // test's sockets never count in the next test's registry size.
  afterEach(async () => {
    const live = app.get(LiveEventsService);
    for (const c of clients.splice(0)) c.close();
    for (let i = 0; i < 50 && live.registry.size > 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('closes a socket that sends no auth within the timeout', async () => {
      const c = new Client(url);
      clients.push(c);
      await c.opened();
      expect((await c.waitClose()).code).toBe(4001);
    });

    it('closes on a bad token', async () => {
      const c = new Client(url);
      clients.push(c);
      await c.opened();
      c.auth('not-a-token');
      expect((await c.waitClose(2000)).code).toBe(4001);
    });

    it('refuses floor staff (STAFF)', async () => {
      const c = new Client(url);
      clients.push(c);
      await c.opened();
      c.auth(tokens['pv1_cs1']);
      expect((await c.waitClose(2000)).code).toBe(4001);
    });

    it('ignores other messages and keeps the socket', async () => {
      const c = await connectAs('tn1_cs1');
      c.ws.send('not json');
      c.ws.send(JSON.stringify({ type: 'hello' }));
      expect(await c.drain(300)).toEqual([]);
      expect(c.closed).toBeNull();
    });

    it('forgets a closed socket', async () => {
      const live = app.get(LiveEventsService);
      const before = live.registry.size;
      const c = await connectAs('tn1_cs1');
      expect(live.registry.size).toBe(before + 1);
      c.close();
      await c.waitClose(2000);
      await new Promise((r) => setTimeout(r, 100));
      expect(live.registry.size).toBe(before);
    });
  });

  describe('routing', () => {
    let orderId: number;
    let requestId: number;

    it('room.changed reaches the branch and the chain manager, not another branch', async () => {
      const cs1 = await connectAs('tn1_cs1');
      const cs2 = await connectAs('tn1_cs2');
      const chain = await connectAs('admin');
      const order = (
        await as('tn1_cs1').post('/orders', { roomId: roomIds[0] }).expect(201)
      ).body as Json;
      orderId = order.id as number;
      expect(await cs1.next()).toEqual({
        type: 'room.changed',
        branchId: order.branchId,
        roomId: roomIds[0],
      });
      expect(await chain.next()).toMatchObject({
        type: 'room.changed',
        roomId: roomIds[0],
      });
      expect(await cs2.drain()).toEqual([]);
    });

    it('order.changed on an item edit', async () => {
      const cs1 = await connectAs('tn1_cs1');
      const products = (await as('tn1_cs1').get('/products').expect(200))
        .body as Json[];
      await as('tn1_cs1')
        .patch(`/orders/${orderId}`, {
          items: [{ productId: products[0].id, quantity: 1 }],
        })
        .expect(200);
      expect(await cs1.next()).toMatchObject({
        type: 'order.changed',
        orderId,
      });
    });

    it('a cashier request reaches the branch managers and the chain manager only', async () => {
      const cashier = await connectAs('tn1_cs1');
      const ql1 = await connectAs('ql1_cs1');
      const ql2 = await connectAs('ql1_cs2');
      const chain = await connectAs('admin');
      const res = await as('tn1_cs1')
        .post(`/orders/${orderId}/adjustments`, {
          discountPercent: 10,
          note: 'khách quen',
        })
        .expect(201);
      const pending = ((res.body as Json).discountRequests as Json[])[0];
      requestId = pending.id as number;
      const forManager = await ql1.drain();
      expect(forManager).toEqual(
        expect.arrayContaining([
          { type: 'order.changed', branchId: anyNumber, orderId },
          {
            type: 'discount.requested',
            branchId: anyNumber,
            requestId,
          },
        ]),
      );
      expect(await chain.drain()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'discount.requested', requestId }),
        ]),
      );
      // the cashier is told the order changed, but not about the request queue
      const forCashier = await cashier.drain();
      expect(forCashier).toEqual([
        expect.objectContaining({ type: 'order.changed', orderId }),
      ]);
      expect(await ql2.drain()).toEqual([]);
    });

    it('the decision reaches the cashier', async () => {
      const cashier = await connectAs('tn1_cs1');
      const ql2 = await connectAs('ql1_cs2');
      await as('ql1_cs1')
        .post(`/discount-requests/${requestId}/approve`)
        .expect(201);
      const got = await cashier.drain();
      expect(got).toEqual(
        expect.arrayContaining([
          {
            type: 'discount.decided',
            branchId: anyNumber,
            orderId,
            requestId,
            status: 'APPROVED',
          },
          expect.objectContaining({ type: 'order.changed', orderId }),
        ]),
      );
      expect(await ql2.drain()).toEqual([]);
    });

    it('checkout sends room.changed and order.changed', async () => {
      const cs1 = await connectAs('tn1_cs1');
      await as('tn1_cs1')
        .post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' })
        .expect(200);
      const got = await cs1.drain();
      expect(got.map((m) => m.type).sort()).toEqual([
        'order.changed',
        'room.changed',
      ]);
    });
  });
});
