import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// HĐQT (BOARD): sees every branch, changes nothing, and can wipe the data of
// a branch or of the whole system after typing its password again. The `it`s
// build on each other: run the whole file.

type Json = Record<string, unknown>;

describe('Board role (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const as = (name: string) => ({
    get: (url: string) =>
      api().get(`/api${url}`).set('Authorization', `Bearer ${tokens[name]}`),
    post: (url: string, body: Json = {}) =>
      api()
        .post(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[name]}`)
        .send(body),
  });
  const login = async (username: string, password = '12345678') => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };
  const roomCount = async (branch: string) =>
    (
      (await as('admin').get(`/rooms?branch=${branch}`).expect(200))
        .body as Json[]
    ).length;

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
    await login('admin');
    await login('ql1_cs1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('is created by the chain manager only, without a branch', async () => {
    const body = {
      username: 'hdqt1',
      fullName: 'Hội đồng quản trị',
      role: 'BOARD',
      password: '12345678',
    };
    await as('ql1_cs1')
      .post('/users', { ...body, branchId: 1 })
      .expect(403);
    const created = (await as('admin').post('/users', body).expect(201))
      .body as Json;
    expect(created.role).toBe('BOARD');
    expect(created.branchId).toBeNull();
    await login('hdqt1');
  });

  it('reads every branch', async () => {
    const board = as('hdqt1');
    for (const branch of ['cs1', 'cs2']) {
      await board
        .get(`/reports/revenue?branch=${branch}&from=2026-01-01&to=2026-01-31`)
        .expect(200);
      await board.get(`/inventory/stock?branch=${branch}`).expect(200);
      await board.get(`/funds?branch=${branch}`).expect(200);
      await board.get(`/rooms?branch=${branch}`).expect(200);
    }
    await board
      .get('/reports/branches?from=2026-01-01&to=2026-01-31')
      .expect(200);
    const branches = (await board.get('/branches').expect(200)).body as Json[];
    expect(branches.length).toBeGreaterThanOrEqual(5);
  });

  it('cannot change anything', async () => {
    const board = as('hdqt1');
    await board
      .post('/rooms?branch=cs1', { name: 'P999', pricePerHour: 1 })
      .expect(403);
    await board.post('/categories?branch=cs1', { name: 'X' }).expect(403);
    await board
      .post('/products?branch=cs1', { name: 'X', price: 1, unit: 'cái' })
      .expect(403);
    await board.post('/orders?branch=cs1', { roomId: 1 }).expect(403);
    await board
      .post('/funds?branch=cs1', { type: 'INCOME', amount: 1 })
      .expect(403);
    await board
      .post('/inventory/documents?branch=cs1', { type: 'IMPORT', lines: [] })
      .expect(403);
    await board.post('/branches', { code: 'cs9', name: 'X' }).expect(403);
    await board.post('/imports/rooms?branch=cs1', { rows: [] }).expect(403);
  });

  it('is the only role that can purge', async () => {
    for (const name of ['admin', 'ql1_cs1']) {
      await as(name)
        .post('/admin/purge', { scope: 'all', password: '12345678' })
        .expect(403);
    }
    expect(await roomCount('cs1')).toBeGreaterThan(0);
  });

  it('needs the account password again', async () => {
    const board = as('hdqt1');
    await board
      .post('/admin/purge', { scope: 'all', password: 'sai-mat-khau' })
      .expect(403);
    await board
      .post('/admin/purge', { scope: 'branch', password: '12345678' })
      .expect(400);
    expect(await roomCount('cs1')).toBeGreaterThan(0);
  });

  it('wipes one branch and leaves the others', async () => {
    // A paid import and a paid bill in cs1: stock, fund and bill rows that
    // reference each other, so the wipe must delete children first.
    const manager = as('ql1_cs1');
    const products = (await manager.get('/products').expect(200))
      .body as Json[];
    const beer = products.find((p) => p.name === 'Bia Tiger')!;
    await manager
      .post('/inventory/documents', {
        type: 'IMPORT',
        lines: [{ productId: beer.id, quantity: 10, unitCost: 15000 }],
        paymentMethod: 'CASH',
      })
      .expect(201);
    const room = ((await manager.get('/rooms').expect(200)).body as Json[])[0];
    const order = (
      await manager.post('/orders', { roomId: room.id }).expect(201)
    ).body as Json;
    await api()
      .patch(`/api/orders/${order.id as number}`)
      .set('Authorization', `Bearer ${tokens.ql1_cs1}`)
      .send({ items: [{ productId: beer.id, quantity: 2 }] })
      .expect(200);
    await manager
      .post(`/orders/${order.id as number}/checkout`, { paymentMethod: 'CASH' })
      .expect(200);

    const cs2 = await roomCount('cs2');
    expect(cs2).toBeGreaterThan(0);
    const cs2Products = (
      (await as('admin').get('/products?branch=cs2').expect(200)).body as Json[]
    ).length;
    const res = await as('hdqt1')
      .post('/admin/purge', {
        scope: 'branch',
        branch: 'cs1',
        password: '12345678',
      })
      .expect(200);
    const deleted = (res.body as Json).deleted as Record<string, number>;
    expect(deleted.orders).toBe(1);
    expect(deleted.orderItems).toBe(1);
    expect(deleted.stockDocuments).toBe(1);
    expect(deleted.fundTransactions).toBe(2);
    expect(deleted.stockMovements).toBe(2);
    expect(
      (
        (await as('admin').get('/products?branch=cs2').expect(200))
          .body as Json[]
      ).length,
    ).toBe(cs2Products);
    expect(
      ((await as('admin').get('/funds?branch=cs1').expect(200)).body as Json[])
        .length,
    ).toBe(0);
    expect(await roomCount('cs1')).toBe(0);
    expect(await roomCount('cs2')).toBe(cs2);
    // Accounts stay.
    await login('tn1_cs1');
  });

  it('wipes the whole system', async () => {
    await as('hdqt1')
      .post('/admin/purge', { scope: 'all', password: '12345678' })
      .expect(200);
    for (const branch of ['cs1', 'cs2', 'cs5']) {
      expect(await roomCount(branch)).toBe(0);
    }
    await login('admin');
  });

  it('keeps a log of every purge and refused attempt', async () => {
    await as('ql1_cs1').get('/admin/purge/logs').expect(403);
    const logs = (await as('admin').get('/admin/purge/logs').expect(200))
      .body as Json[];
    // Newest first: whole system, cs1, wrong password.
    expect(
      logs.map((l) => [l.scope, l.branchCode, l.success, l.username]),
    ).toEqual([
      ['ALL', null, true, 'hdqt1'],
      ['BRANCH', 'cs1', true, 'hdqt1'],
      ['ALL', null, false, 'hdqt1'],
    ]);
    expect(logs[1].branchName).toBe('Cơ sở 1');
    expect((logs[1].deleted as Json).orders).toBe(1);
    expect(logs[2].deleted).toBeNull();
    expect(
      ((await as('hdqt1').get('/admin/purge/logs').expect(200)).body as Json[])
        .length,
    ).toBe(3);
  });

  // Last: it locks hdqt1 out of the purge for 15 minutes.
  it('locks the purge after too many wrong passwords', async () => {
    const wrong = { scope: 'all', password: 'sai-mat-khau' };
    // The purges above cleared the earlier wrong attempt: five in a row.
    for (let i = 0; i < 5; i++) {
      await as('hdqt1').post('/admin/purge', wrong).expect(403);
    }
    const res = await as('hdqt1')
      .post('/admin/purge', { scope: 'all', password: '12345678' })
      .expect(429);
    expect((res.body as Json).message).toBe(
      'Nhập sai mật khẩu quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    );
    // The lock is for the purge only: the account still logs in.
    await login('hdqt1');
  });
});
