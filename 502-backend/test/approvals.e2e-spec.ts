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
        .patch(`/orders/${order.id}`, {
          items: [{ productId: productIds[0], quantity: 1 }],
        })
        .expect(200);
      await as('tn1_cs1')
        .post(`/orders/${order.id}/checkout`, { paymentMethod: 'CASH' })
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
      await as('ql1_cs1').post(`/orders/${order.id}/cancel`).expect(200);
    });
  });
});
