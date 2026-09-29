// test/approvals.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Sales rights by role and by room (spec 2026-09-30): servers order for their
// own room, CSKH only look, only the chain manager corrects or voids a paid
// bill, and a cashier's discount waits for a manager. The `it`s build on each
// other: run the whole file.

type Json = Record<string, unknown>;

describe('Sales approvals (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, number> = {};
  let roomIds: number[] = [];
  let productIds: number[] = [];

  const api = () => request(app.getHttpServer());
  const as = (name: string) => {
    const auth = `Bearer ${tokens[name]}`;
    return {
      get: (url: string) => api().get(`/api${url}`).set('Authorization', auth),
      post: (url: string, body: Json = {}) =>
        api().post(`/api${url}`).set('Authorization', auth).send(body),
      patch: (url: string, body: Json = {}) =>
        api().patch(`/api${url}`).set('Authorization', auth).send(body),
      delete: (url: string) =>
        api().delete(`/api${url}`).set('Authorization', auth),
    };
  };
  const login = async (username: string) => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password: '12345678' })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };
  const openRoom = async (roomId: number, body: Json = {}) =>
    (
      await as('tn1_cs1')
        .post('/orders', { roomId, ...body })
        .expect(201)
    ).body as Json;

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
    await app.init();
    for (const name of [
      'admin',
      'ql1_cs1',
      'tn1_cs1',
      'pv1_cs1',
      'cskh1_cs1',
      'ql1_cs2',
    ]) {
      await login(name);
    }
    const users = (await as('admin').get('/users').expect(200)).body as Json[];
    for (const u of users) userIds[u.username as string] = u.id as number;
    // The demo seed gives cs1 only 3 rooms: create the rooms the suite needs.
    roomIds = [];
    for (let i = 1; i <= 8; i++) {
      const room = await as('ql1_cs1')
        .post('/rooms', { name: `E2E-${i}`, pricePerHour: 100000 })
        .expect(201);
      roomIds.push((room.body as Json).id as number);
    }
    productIds = (
      (await as('tn1_cs1').get('/products').expect(200)).body as Json[]
    ).map((p) => p.id as number);
    expect(roomIds.length).toBeGreaterThanOrEqual(6);
    expect(productIds.length).toBeGreaterThanOrEqual(1);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('paid bills', () => {
    let paidId: number;

    it('only the chain manager corrects or voids a paid bill', async () => {
      const order = await openRoom(roomIds[0]);
      await as('tn1_cs1')
        .patch(`/orders/${order.id as number}`, {
          items: [{ productId: productIds[0], quantity: 1 }],
        })
        .expect(200);
      await as('tn1_cs1')
        .post(`/orders/${order.id as number}/checkout`, {
          paymentMethod: 'CASH',
        })
        .expect(200);
      paidId = order.id as number;

      for (const name of ['tn1_cs1', 'ql1_cs1']) {
        await as(name)
          .patch(`/orders/${paidId}/paid`, { reason: 'x', taxPercent: 10 })
          .expect(403);
        await as(name)
          .post(`/orders/${paidId}/void`, { reason: 'x' })
          .expect(403);
      }
      await as('admin')
        .patch(`/orders/${paidId}/paid`, { reason: 'Sửa VAT', taxPercent: 8 })
        .expect(200);
    });

    it('a branch manager still cancels an open session', async () => {
      const order = await openRoom(roomIds[1]);
      await as('ql1_cs1')
        .post(`/orders/${order.id as number}/cancel`)
        .expect(200);
    });
  });

  describe('time lock', () => {
    let orderId: number;
    let prId: number;

    it('locks the time: the fee stops and open PR visits end', async () => {
      const order = await openRoom(roomIds[2], {
        serverId: userIds.pv1_cs1,
        cskhId: userIds.cskh1_cs1,
      });
      orderId = order.id as number;
      prId = (
        (await as('ql1_cs1').post('/pr/staff', { name: 'Lan' }).expect(201))
          .body as Json
      ).id as number;
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId, prStaffId: prId })
        .expect(201);

      // CSKH only looks; the server locks.
      await as('cskh1_cs1').post(`/orders/${orderId}/lock-time`).expect(403);
      const locked = (
        await as('pv1_cs1').post(`/orders/${orderId}/lock-time`).expect(201)
      ).body as Json;
      expect(locked.timeLockedAt).toBeTruthy();
      const visits = locked.prSessions as Json[];
      expect(visits[0].endAt).toBe(locked.timeLockedAt);
      await as('pv1_cs1').post(`/orders/${orderId}/lock-time`).expect(409);

      // No PR after the lock.
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId, prStaffId: prId })
        .expect(409);

      // The room map shows it.
      const room = (await as('tn1_cs1').get(`/rooms/${roomIds[2]}`).expect(200))
        .body as Json;
      expect((room.activeOrder as Json).timeLockedAt).toBe(locked.timeLockedAt);
    });

    it('only cashiers and managers unlock, and it is logged', async () => {
      await as('pv1_cs1').post(`/orders/${orderId}/unlock-time`).expect(403);
      const unlocked = (
        await as('tn1_cs1').post(`/orders/${orderId}/unlock-time`).expect(201)
      ).body as Json;
      expect(unlocked.timeLockedAt).toBeNull();
      await as('tn1_cs1').post(`/orders/${orderId}/unlock-time`).expect(409);
    });

    it('checkout ends the bill at the locked time', async () => {
      const locked = (
        await as('tn1_cs1').post(`/orders/${orderId}/lock-time`).expect(201)
      ).body as Json;
      const paid = (
        await as('tn1_cs1')
          .post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' })
          .expect(200)
      ).body as Json;
      expect(paid.endTime).toBe(locked.timeLockedAt);
    });
  });

  describe('server and CSKH', () => {
    let mine: number;
    let other: number;

    it('the server orders for their own room only', async () => {
      mine = (
        await openRoom(roomIds[3], {
          serverId: userIds.pv1_cs1,
          cskhId: userIds.cskh1_cs1,
        })
      ).id as number;
      other = (await openRoom(roomIds[4])).id as number;
      const items = [{ productId: productIds[0], quantity: 2 }];

      await as('pv1_cs1').get('/products').expect(200);
      const saved = (
        await as('pv1_cs1').patch(`/orders/${mine}`, { items }).expect(200)
      ).body as Json;
      expect((saved.items as Json[])[0].quantity).toBe(2);
      await as('pv1_cs1').patch(`/orders/${other}`, { items }).expect(403);
      await as('pv1_cs1')
        .patch(`/orders/${mine}`, { cskhId: null })
        .expect(403);
      // Discounts no longer go through PATCH (dropped by the whitelist); the
      // server may not send them to /adjustments either (see 'discounts').
      const ignored = (
        await as('pv1_cs1')
          .patch(`/orders/${mine}`, { discountPercent: 50 })
          .expect(200)
      ).body as Json;
      expect(ignored.discountPercent).toBe(0);
      await as('pv1_cs1')
        .post(`/orders/${mine}/adjustments`, { discountPercent: 50 })
        .expect(403);
      await as('pv1_cs1').get(`/orders/${mine}/preview`).expect(200);
      await as('pv1_cs1')
        .post(`/orders/${mine}/checkout`, { paymentMethod: 'CASH' })
        .expect(403);
    });

    it('the server brings PR/KTV into their own room only', async () => {
      const lan = (
        (await as('ql1_cs1').post('/pr/staff', { name: 'Mai' }).expect(201))
          .body as Json
      ).id as number;
      await as('pv1_cs1').get('/pr/available').expect(200);
      await as('pv1_cs1')
        .post('/pr/sessions', { orderId: other, prStaffId: lan })
        .expect(403);
      const res = (
        await as('pv1_cs1')
          .post('/pr/sessions', { orderId: mine, prStaffId: lan })
          .expect(201)
      ).body as Json;
      const visit = (res.prSessions as Json[])[0];
      await as('pv1_cs1')
        .post(`/pr/sessions/${visit.id as number}/end`)
        .expect(200);
    });

    it('the CSKH only looks', async () => {
      await as('cskh1_cs1').get(`/orders/${mine}`).expect(200);
      await as('cskh1_cs1').get(`/orders/${mine}/preview`).expect(200);
      await as('cskh1_cs1')
        .patch(`/orders/${mine}`, {
          items: [{ productId: productIds[0], quantity: 1 }],
        })
        .expect(403);
      await as('cskh1_cs1').get(`/orders/${other}`).expect(403);
    });
  });

  describe('discounts', () => {
    let orderId: number;

    it('a cashier discount waits for a manager and blocks checkout', async () => {
      orderId = (await openRoom(roomIds[5])).id as number;
      const url = `/orders/${orderId}/adjustments`;
      await as('tn1_cs1').post(url, { discountPercent: 10 }).expect(400); // no reason
      await as('tn1_cs1').post(url, {}).expect(400); // nothing changes
      const res = (
        await as('tn1_cs1')
          .post(url, { discountPercent: 10, note: 'Khách quen' })
          .expect(201)
      ).body as Json;
      expect(res.discountPercent).toBe(0);
      expect(res.branchManagers).toBe(1);
      const pending = (res.discountRequests as Json[])[0];
      expect(pending.note).toBe('Khách quen');
      await as('tn1_cs1').post(url, { taxPercent: 12 }).expect(409);
      await as('tn1_cs1')
        .post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' })
        .expect(409);
    });

    it('the discount fields no longer go through PATCH /orders/:id', async () => {
      const res = (
        await as('tn1_cs1')
          .patch(`/orders/${orderId}`, { discountPercent: 50 })
          .expect(200)
      ).body as Json;
      expect(res.discountPercent).toBe(0);
    });
  });

  describe('discounts applied at once', () => {
    it('managers apply at once; cashiers do when nothing gets cheaper', async () => {
      const order = await openRoom(roomIds[6]);
      const url = `/orders/${order.id as number}/adjustments`;
      const byManager = (
        await as('ql1_cs1').post(url, { discountAmount: 20000 }).expect(201)
      ).body as Json;
      expect(Number(byManager.discountAmount)).toBe(20000);
      expect(byManager.discountRequests).toEqual([]);
      const byCashier = (
        await as('tn1_cs1')
          .post(url, { discountAmount: 0, taxPercent: 12 })
          .expect(201)
      ).body as Json;
      expect(Number(byCashier.discountAmount)).toBe(0);
      expect(byCashier.taxPercent).toBe(12);
      await as('pv1_cs1').post(url, { taxPercent: 20 }).expect(403);
      // A request still waiting when the session is cancelled expires.
      await as('tn1_cs1')
        .post(url, { discountPercent: 5, note: 'Thử' })
        .expect(201);
      await as('tn1_cs1')
        .post(`/orders/${order.id as number}/cancel`)
        .expect(403);
      await as('ql1_cs1')
        .post(`/orders/${order.id as number}/cancel`)
        .expect(200);
      const cancelled = (
        await as('ql1_cs1')
          .get(`/orders/${order.id as number}`)
          .expect(200)
      ).body as Json;
      expect(cancelled.discountRequests).toEqual([]);
    });
  });
});
