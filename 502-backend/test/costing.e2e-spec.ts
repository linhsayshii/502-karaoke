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

  describe('cost of the bills', () => {
    let firstBill: Json;
    let secondBill: Json;

    const payBill = async (beers: number) => {
      const order = (await post('/orders', { roomId }).expect(201))
        .body as Json;
      await patch(`/orders/${order.id as number}`, {
        items: [{ productId: beerId, quantity: beers }],
      }).expect(200);
      return (
        await post(`/orders/${order.id as number}/checkout`, {
          paymentMethod: 'CASH',
        }).expect(200)
      ).body as Json;
    };
    const itemCost = (order: Json, productId: number) =>
      Number(
        (order.items as Json[]).find((i) => i.productId === productId)!
          .unitCost,
      );

    it('snapshots the average cost on the bill at checkout', async () => {
      firstBill = await payBill(4);
      expect(itemCost(firstBill, beerId)).toBe(15000);
      expect(await costOf()).toBe(15000);
      expect((await stockOf(beerId)).stockQuantity).toBe(16);
    });

    it('puts a voided bill back at the cost it left at', async () => {
      await importBeer(4, 30000);
      // (16 × 15,000 + 4 × 30,000) / 20
      expect(await costOf()).toBe(18000);
      await post(`/orders/${firstBill.id as number}/void`, {
        reason: 'Khách trả lại',
      }).expect(200);
      // (20 × 18,000 + 4 × 15,000) / 24
      expect(await costOf()).toBe(17500);
      const movement = await lastMovement();
      expect(movement).toMatchObject({ type: 'REVERSAL', quantity: 4 });
      expect(Number(movement.unitCost)).toBe(15000);
    });

    it('follows a corrected bill: more at the current average, less at the bill’s own cost', async () => {
      secondBill = await payBill(2);
      expect(itemCost(secondBill, beerId)).toBe(17500);
      await importBeer(3, 25500);
      // (22 × 17,500 + 3 × 25,500) / 25
      expect(await costOf()).toBe(18460);

      const more = (
        await patch(`/orders/${secondBill.id as number}/paid`, {
          reason: 'Thêm bia',
          items: [{ productId: beerId, quantity: 4 }],
        }).expect(200)
      ).body as Json;
      // (2 × 17,500 + 2 × 18,460) / 4
      expect(itemCost(more, beerId)).toBe(17980);
      expect(await costOf()).toBe(18460);

      const less = (
        await patch(`/orders/${secondBill.id as number}/paid`, {
          reason: 'Trả bớt',
          items: [
            { productId: beerId, quantity: 1 },
            { productId: feeId, quantity: 1 },
          ],
        }).expect(200)
      ).body as Json;
      expect(itemCost(less, beerId)).toBe(17980);
      expect(itemCost(less, feeId)).toBe(0);
      // (23 × 18,460 + 3 × 17,980) / 26 = 18,404.615…
      expect(await costOf()).toBe(18404.62);
      expect((await stockOf(beerId)).stockQuantity).toBe(26);
    });
  });

  describe('expense categories', () => {
    it('takes only the fixed categories of the entry type', async () => {
      await post('/funds', {
        type: 'EXPENSE',
        amount: 500000,
        category: 'Điện nước',
      }).expect(201);
      await post('/funds', {
        type: 'EXPENSE',
        method: 'TRANSFER',
        amount: 1000000,
        category: 'Lương',
      }).expect(201);
      const other = (
        await post('/funds', { type: 'EXPENSE', amount: 20000 }).expect(201)
      ).body as Json;
      expect(other.category).toBe('Khác');
      const income = (
        await post('/funds', { type: 'INCOME', amount: 200000 }).expect(201)
      ).body as Json;
      expect(income.category).toBe('Thu khác');

      await post('/funds', {
        type: 'EXPENSE',
        amount: 1000,
        category: 'Mua đá',
      }).expect(400);
      await post('/funds', {
        type: 'INCOME',
        amount: 1000,
        category: 'Lương',
      }).expect(400);

      // Cancelled: out of every total.
      const marketing = (
        await post('/funds', {
          type: 'EXPENSE',
          amount: 300000,
          category: 'Marketing',
        }).expect(201)
      ).body as Json;
      await post(`/funds/${marketing.id as number}/cancel`, {
        reason: 'Ghi nhầm',
      }).expect(200);

      // An entry from before the fixed list (free text).
      const branch = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs3' },
      });
      await prisma.fundTransaction.create({
        data: {
          branchId: branch.id,
          type: 'EXPENSE',
          amount: 10000,
          category: 'Chi linh tinh',
        },
      });
    });
  });

  describe('products report', () => {
    it('adds the cost of goods, the gross profit and the margin', async () => {
      const res = (await get(`/reports/products?${period}`).expect(200))
        .body as { totals: Json; rows: Json[] };
      const beer = res.rows.find((r) => r.id === beerId)!;
      expect(beer).toMatchObject({
        quantity: 1,
        gross: 30000,
        net: 30000,
        cost: 17980,
        grossProfit: 12020,
      });
      expect(beer.margin as number).toBeCloseTo(12020 / 30000, 6);
      expect(res.rows.find((r) => r.id === feeId)).toMatchObject({
        quantity: 1,
        cost: 0,
        grossProfit: 50000,
        margin: 1,
      });
      expect(res.totals).toMatchObject({
        net: 80000,
        cost: 17980,
        grossProfit: 62020,
      });
    });
  });

  describe('profit and loss', () => {
    interface Profit {
      branchId: number | null;
      categories: string[];
      totals: Record<string, number> & { expenses: Record<string, number> };
      buckets: { profit: number; cogs: number }[];
    }

    it('counts exports as losses, not the cancelled ones', async () => {
      await exportBeer(2);
      const cancelled = await exportBeer(1);
      await cancelDocument(cancelled.id as number);
      // An export and its cancellation leave the average as it was.
      expect(await costOf()).toBe(18404.62);
      expect((await stockOf(beerId)).stockQuantity).toBe(24);
    });

    it('is revenue − cost of goods − expenses − losses + other income', async () => {
      const revenue = (
        (await get(`/reports/revenue?${period}`).expect(200)).body as {
          totals: Record<string, number>;
        }
      ).totals;
      const res = (await get(`/reports/profit?${period}`).expect(200))
        .body as Profit;
      const t = res.totals;
      expect(res.categories).toEqual([
        'Lương',
        'Mặt bằng',
        'Điện nước',
        'Sửa chữa – bảo trì',
        'Marketing',
        'Vật tư tiêu hao',
        'Thuế – phí',
        'Khác',
      ]);
      expect(t.revenue).toBe(revenue.revenue);
      expect(t.vat).toBe(revenue.vat);
      // The voided first bill is out; the corrected second one took 1 beer.
      expect(t.cogs).toBe(17980);
      expect(t.grossProfit).toBeCloseTo(revenue.revenue - 17980, 2);
      expect(t.expenses).toEqual({
        Lương: 1000000,
        'Mặt bằng': 0,
        'Điện nước': 500000,
        'Sửa chữa – bảo trì': 0,
        Marketing: 0,
        'Vật tư tiêu hao': 0,
        'Thuế – phí': 0,
        Khác: 30000,
      });
      expect(t.expenseTotal).toBe(1530000);
      expect(t.losses).toBeCloseTo(2 * 18404.62, 2);
      expect(t.otherIncome).toBe(200000);
      // Imports of 10 × 10,000, 10 × 20,000, 4 × 30,000 and 3 × 25,500 (the
      // cancelled one left out); the paid import's phiếu chi is no expense.
      expect(t.purchases).toBe(496500);
      expect(t.profit).toBeCloseTo(
        revenue.revenue - 17980 - 1530000 - 2 * 18404.62 + 200000,
        2,
      );
      expect(
        res.buckets.reduce((sum, bucket) => sum + bucket.profit, 0),
      ).toBeCloseTo(t.profit, 2);

      // The products report sees the same cost of goods.
      const products = (await get(`/reports/products?${period}`).expect(200))
        .body as { totals: { cost: number } };
      expect(products.totals.cost).toBe(t.cogs);
    });

    it('covers the whole chain for the chain manager, managers only', async () => {
      const branch = (await get(`/reports/profit?${period}`).expect(200))
        .body as Profit;
      const chain = (
        await api()
          .get(`/api/reports/profit?${period}&groupBy=month`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .expect(200)
      ).body as Profit;
      expect(chain.branchId).toBeNull();
      expect(chain.totals.profit).toBeCloseTo(branch.totals.profit, 2);
      await api()
        .get(`/api/reports/profit?${period}`)
        .set('Authorization', `Bearer ${tokens.tn1_cs1}`)
        .expect(403);
    });
  });
});
