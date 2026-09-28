import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Cost of goods (weighted average), expense categories, profit and loss and
// the stock ledger report, in cs3: the seed puts nothing there, so every
// number below is worked out by hand. The `it`s build on each other (stock,
// bills, fund entries): run the whole file, never with `-t`.

type Json = Record<string, unknown>;

describe('Costing and accounting reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  let beerId: number;
  let feeId: number;
  let roomId: number;

  const api = () => request(app.getHttpServer());
  // Every request in cs3, as the chain manager unless `as` says otherwise.
  const cs3 = (url: string) =>
    `/api${url}${url.includes('?') ? '&' : '?'}branch=cs3`;
  const get = (url: string, as = 'admin') =>
    api().get(cs3(url)).set('Authorization', `Bearer ${tokens[as]}`);
  const post = (url: string, body: Json = {}) =>
    api()
      .post(cs3(url))
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(body);
  const patch = (url: string, body: Json = {}) =>
    api()
      .patch(cs3(url))
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(body);

  const login = async (username: string) => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password: '12345678' })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysFromToday = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  };
  // Yesterday → tomorrow always holds the business day of "now".
  const period = `from=${ymd(daysFromToday(-1))}&to=${ymd(daysFromToday(1))}`;

  const stockOf = async (id: number) =>
    ((await get('/inventory/stock').expect(200)).body as Json[]).find(
      (p) => p.id === id,
    )!;
  const costOf = async () => Number((await stockOf(beerId)).costPrice);
  // Newest first.
  const lastMovement = async () =>
    (
      (await get(`/inventory/movements?productId=${beerId}`).expect(200))
        .body as Json[]
    )[0];
  const importBeer = async (
    quantity: number,
    unitCost: number,
    paymentMethod?: 'CASH',
  ) =>
    (
      await post('/inventory/documents', {
        type: 'IMPORT',
        lines: [{ productId: beerId, quantity, unitCost }],
        ...(paymentMethod && { paymentMethod }),
      }).expect(201)
    ).body as Json;
  const exportBeer = async (quantity: number) =>
    (
      await post('/inventory/documents', {
        type: 'EXPORT',
        note: 'Hao hụt',
        lines: [{ productId: beerId, quantity }],
      }).expect(201)
    ).body as Json;
  const cancelDocument = (id: number) =>
    post(`/inventory/documents/${id}/cancel`, { reason: 'Sai phiếu' }).expect(
      200,
    );

  beforeAll(async () => {
    execSync('npx prisma migrate reset --force --skip-generate', {
      env: process.env,
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await login('admin');
    await login('tn1_cs1');

    beerId = (
      (
        await post('/products', {
          name: 'Bia Sài Gòn',
          price: 30000,
          unit: 'chai',
        }).expect(201)
      ).body as Json
    ).id as number;
    feeId = (
      (
        await post('/products', {
          name: 'Phụ thu',
          price: 50000,
          unit: 'lần',
          trackStock: false,
        }).expect(201)
      ).body as Json
    ).id as number;
    roomId = (
      (await post('/rooms', { name: 'P301', pricePerHour: 100000 }).expect(201))
        .body as Json
    ).id as number;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('weighted average cost', () => {
    it('averages the import batches', async () => {
      await importBeer(10, 10000, 'CASH');
      expect(await costOf()).toBe(10000);
      await importBeer(10, 20000);
      expect(await costOf()).toBe(15000);

      const movement = await lastMovement();
      expect(movement).toMatchObject({
        type: 'IMPORT',
        quantity: 10,
        balanceAfter: 20,
      });
      expect(Number(movement.unitCost)).toBe(20000);
      expect(Number(movement.costAfter)).toBe(15000);
    });

    it('takes a cancelled import back out of the average', async () => {
      const doc = await importBeer(4, 30000);
      // (20 × 15,000 + 4 × 30,000) / 24
      expect(await costOf()).toBe(17500);
      await cancelDocument(doc.id as number);
      // (24 × 17,500 − 4 × 30,000) / 20
      expect(await costOf()).toBe(15000);

      const movement = await lastMovement();
      expect(movement).toMatchObject({
        type: 'REVERSAL',
        quantity: -4,
        balanceAfter: 20,
      });
      expect(Number(movement.unitCost)).toBe(30000);
      expect(Number(movement.costAfter)).toBe(15000);
    });
  });
});
