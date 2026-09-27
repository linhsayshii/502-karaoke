import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Reports against a fresh database seeded with the demo accounts
// (SEED_DEMO=1). Every total must add up with the bills and the fund.

type Json = Record<string, unknown>;
type Metrics = Record<string, number>;
interface Report {
  branchId: number | null;
  totals: Metrics;
  previous: { from: string; to: string; totals: Metrics } | null;
  buckets: {
    key: string;
    from: string;
    to: string;
    collected: number;
    roomMinutes: number;
  }[];
  byBranch: { code: string; collected: number }[] | null;
  voided: { count: number; amount: number };
}

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const as = (username: string) => ({
    get: (url: string) =>
      api()
        .get(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`),
    post: (url: string, body: Json = {}) =>
      api()
        .post(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`)
        .send(body),
    patch: (url: string, body: Json = {}) =>
      api()
        .patch(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`)
        .send(body),
  });

  const login = async (username: string, password = 'demo123') => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password })
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
  const report = async (username: string, query = '') =>
    (await as(username).get(`/reports/revenue?${period}${query}`).expect(200))
      .body as Report;

  // Opens a room, orders 2 beers, applies `adjustments` and pays.
  const payBill = async (
    cashier: string,
    roomName: string,
    adjustments: Json,
    paymentMethod: 'CASH' | 'TRANSFER',
  ) => {
    const rooms = (await as(cashier).get('/rooms').expect(200)).body as Json[];
    const products = (await as(cashier).get('/products').expect(200))
      .body as Json[];
    const roomId = rooms.find((r) => r.name === roomName)!.id;
    const beerId = products.find((p) => p.name === 'Bia Tiger')!.id;
    const opened = (await as(cashier).post('/orders', { roomId }).expect(201))
      .body as Json;
    await as(cashier)
      .patch(`/orders/${opened.id as number}`, {
        items: [{ productId: beerId, quantity: 2 }],
        ...adjustments,
      })
      .expect(200);
    return (
      await as(cashier)
        .post(`/orders/${opened.id as number}/checkout`, { paymentMethod })
        .expect(200)
    ).body as Json;
  };

  beforeAll(async () => {
    const env = { ...process.env, SEED_DEMO: '1' };
    execSync('npx prisma migrate reset --force --skip-generate', {
      env,
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();

    await login('admin', 'admin123');
    for (const u of ['ql_cs1', 'tn_cs1', 'ql_cs2', 'tn_cs2']) await login(u);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('access', () => {
    it('is for managers only, within their own branch', async () => {
      await as('tn_cs1').get(`/reports/revenue?${period}`).expect(403);
      await as('ql_cs1')
        .get(`/reports/revenue?${period}&branch=cs2`)
        .expect(403);
      await as('admin')
        .get(`/reports/revenue?${period}&branch=khong-co`)
        .expect(404);
    });

    it('validates the query', async () => {
      await as('ql_cs1').get('/reports/revenue').expect(400);
      await as('ql_cs1')
        .get(`/reports/revenue?${period}&groupBy=hour`)
        .expect(400);
      await as('ql_cs1')
        .get('/reports/revenue?from=2020-01-01&to=2026-01-01')
        .expect(400);
      await as('ql_cs1')
        .get('/reports/revenue?from=2026-02-01&to=2026-01-01')
        .expect(400);
    });
  });

  describe('revenue', () => {
    it('keeps VAT apart from revenue', async () => {
      const bill = await payBill(
        'tn_cs1',
        'P101',
        { serviceFeePercent: 5, taxPercent: 10 },
        'CASH',
      );
      const vat = Number(bill.taxAmount);
      const paid = Number(bill.finalAmount);
      expect(vat).toBeGreaterThan(0);

      const { totals } = await report('ql_cs1');
      expect(totals).toMatchObject({
        orderCount: 1,
        vat,
        collected: paid,
        revenue: paid - vat,
        cash: paid,
        transfer: 0,
      });
      expect(totals.revenue).toBe(
        totals.roomFee -
          totals.roomDiscount +
          totals.productSales -
          totals.productDiscount +
          totals.serviceFee,
      );
    });

    it('adds up the whole chain for the chain manager only', async () => {
      const cs2Bill = await payBill('tn_cs2', 'P201', {}, 'TRANSFER');
      const cs2Paid = Number(cs2Bill.finalAmount);

      const cs1 = await report('ql_cs1');
      expect(cs1.byBranch).toBeNull();
      expect(cs1.branchId).not.toBeNull();

      const chain = await report('admin');
      expect(chain.branchId).toBeNull();
      expect(chain.totals.collected).toBe(cs1.totals.collected + cs2Paid);
      expect(chain.byBranch!.map((b) => b.code)).toEqual([
        'cs1',
        'cs2',
        'cs3',
        'cs4',
      ]);
      expect(chain.byBranch!.reduce((s, b) => s + b.collected, 0)).toBe(
        chain.totals.collected,
      );
      expect((await report('admin', '&branch=cs2')).totals.transfer).toBe(
        cs2Paid,
      );
    });

    it('groups by period and compares with the period before', async () => {
      const from = ymd(daysFromToday(-40));
      const to = ymd(daysFromToday(1));
      const res = (
        await as('ql_cs1')
          .get(`/reports/revenue?from=${from}&to=${to}&groupBy=month&compare=1`)
          .expect(200)
      ).body as Report;
      expect(res.buckets.length).toBeGreaterThanOrEqual(2);
      expect(res.buckets[0].from).toBe(from);
      expect(res.buckets[res.buckets.length - 1].to).toBe(to);
      expect(res.buckets.reduce((s, b) => s + b.collected, 0)).toBe(
        res.totals.collected,
      );
      expect(res.previous).toMatchObject({
        to: ymd(daysFromToday(-41)),
        totals: { orderCount: 0 },
      });
      expect((await report('ql_cs1')).previous).toBeNull();
    });

    it('puts a bill on the business day of its payment (06:00 → 06:00)', async () => {
      const prisma = app.get(PrismaService);
      const cs3 = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs3' },
      });
      const paidAt = (time: string, amount: number) =>
        prisma.order.create({
          data: {
            branchId: cs3.id,
            status: 'COMPLETED',
            startTime: new Date('2026-01-09T22:00:00'),
            endTime: new Date(`2026-01-10T${time}`),
            finalAmount: amount,
            paymentMethod: 'CASH',
          },
        });
      await paidAt('05:59:59', 100000);
      await paidAt('06:00:00', 200000);

      const res = (
        await as('admin')
          .get('/reports/revenue?branch=cs3&from=2026-01-09&to=2026-01-10')
          .expect(200)
      ).body as Report;
      expect(res.buckets.map((b) => [b.key, b.collected])).toEqual([
        ['2026-01-09', 100000],
        ['2026-01-10', 200000],
      ]);
      // 22:00 → 05:59:59 is 480 started minutes.
      expect(res.buckets[0].roomMinutes).toBe(480);
    });

    it('leaves voided bills out of every total', async () => {
      const bill = await payBill('tn_cs1', 'P102', {}, 'CASH');
      const before = await report('ql_cs1');
      await as('ql_cs1')
        .post(`/orders/${bill.id as number}/void`, { reason: 'nhập nhầm' })
        .expect(200);
      const after = await report('ql_cs1');
      expect(after.totals.collected).toBe(
        before.totals.collected - Number(bill.finalAmount),
      );
      expect(after.totals.orderCount).toBe(before.totals.orderCount - 1);
      expect(after.voided).toEqual({
        count: 1,
        amount: Number(bill.finalAmount),
      });
    });
  });
});
