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
// The `it`s share one database and build on the bills the earlier ones
// created (`payBill`, the manual `prisma.order.create`s), so run the whole
// file — filtering with `-t` skips bills later tests rely on and fails.

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
interface BranchesReport {
  totals: Metrics;
  previous: { from: string; to: string; totals: Metrics } | null;
  buckets: { key: string }[];
  branches: (Metrics & {
    code: string;
    share: number | null;
    previous: Metrics | null;
    series: number[];
  })[];
}
// A row of a breakdown report: a subject (id null: none) and its numbers.
interface Row {
  id: number | string | null;
  name: string | null;
  [field: string]: number | string | null;
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

  const login = async (username: string, password = '12345678') => {
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
  const sumOf = (rows: Row[], field: string) =>
    rows.reduce((sum, row) => sum + Number(row[field]), 0);
  // The rows of a breakdown add up to the revenue report's totals.
  const expectSameTotals = (rows: Row[], totals: Metrics) => {
    for (const field of [
      'orderCount',
      'roomMinutes',
      'revenue',
      'vat',
      'collected',
    ])
      expect(sumOf(rows, field)).toBe(totals[field]);
  };

  const idOf = async (username: string) =>
    (
      await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { username } })
    ).id;
  const breakdown = async (username: string, path: string) =>
    (
      await as(username)
        .get(`${path}${path.includes('?') ? '&' : '?'}${period}`)
        .expect(200)
    ).body as {
      totals: Metrics;
      rows: Row[];
      occupancy?: number | null;
      days?: number;
    };

  // Opens a room (with `open`, e.g. its CSKH/server), orders `items`
  // (default 2 beers), applies `adjustments` and pays.
  const payBill = async (
    cashier: string,
    roomName: string,
    adjustments: Json,
    paymentMethod: 'CASH' | 'TRANSFER',
    {
      open = {},
      items = [['Bia Tiger', 2]],
    }: { open?: Json; items?: [string, number][] } = {},
  ) => {
    const rooms = (await as(cashier).get('/rooms').expect(200)).body as Json[];
    const products = (await as(cashier).get('/products').expect(200))
      .body as Json[];
    const roomId = rooms.find((r) => r.name === roomName)!.id;
    const opened = (
      await as(cashier)
        .post('/orders', { roomId, ...open })
        .expect(201)
    ).body as Json;
    await as(cashier)
      .patch(`/orders/${opened.id as number}`, {
        items: items.map(([name, quantity]) => ({
          productId: products.find((p) => p.name === name)!.id,
          quantity,
        })),
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

    await login('admin');
    for (const u of ['ql1_cs1', 'tn1_cs1', 'ql1_cs2', 'tn1_cs2'])
      await login(u);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('access', () => {
    it('is for managers only, within their own branch', async () => {
      await as('tn1_cs1').get(`/reports/revenue?${period}`).expect(403);
      await as('ql1_cs1')
        .get(`/reports/revenue?${period}&branch=cs2`)
        .expect(403);
      await as('admin')
        .get(`/reports/revenue?${period}&branch=khong-co`)
        .expect(404);
    });

    it('validates the query', async () => {
      await as('ql1_cs1').get('/reports/revenue').expect(400);
      await as('ql1_cs1')
        .get(`/reports/revenue?${period}&groupBy=hour`)
        .expect(400);
      await as('ql1_cs1')
        .get('/reports/revenue?from=2020-01-01&to=2026-01-01')
        .expect(400);
      await as('ql1_cs1')
        .get('/reports/revenue?from=2026-02-01&to=2026-01-01')
        .expect(400);
    });
  });

  describe('revenue', () => {
    it('keeps VAT apart from revenue, with discounts applied', async () => {
      // Fixed room discount + a percent product discount so roomDiscount and
      // productDiscount are actually non-zero end to end (spec §9: bills
      // "có … giảm giá, phí DV và VAT").
      const bill = await payBill(
        'tn1_cs1',
        'P101',
        {
          serviceFeePercent: 5,
          taxPercent: 10,
          hourlyDiscountAmount: 1000,
          discountPercent: 20,
        },
        'CASH',
      );
      const vat = Number(bill.taxAmount);
      const paid = Number(bill.finalAmount);
      const roomDiscount = Number(bill.hourlyDiscountAmount);
      const productDiscount = Number(bill.discountAmount);
      expect(vat).toBeGreaterThan(0);
      expect(roomDiscount).toBeGreaterThan(0);
      expect(productDiscount).toBeGreaterThan(0);

      const { totals } = await report('ql1_cs1');
      expect(totals).toMatchObject({
        orderCount: 1,
        vat,
        collected: paid,
        revenue: paid - vat,
        cash: paid,
        transfer: 0,
        roomDiscount,
        productDiscount,
      });
      expect(totals.revenue).toBe(
        totals.roomFee -
          totals.roomDiscount +
          totals.productSales -
          totals.productDiscount +
          totals.serviceFee,
      );
      expect(totals.revenue + totals.vat).toBe(totals.collected);

      const fund = (
        await as('ql1_cs1').get(`/funds/summary?${period}`).expect(200)
      ).body as Json;
      expect(fund).toMatchObject({ salesIncome: paid, salesVat: vat });
    });

    it('adds up the whole chain for the chain manager only', async () => {
      const cs2Bill = await payBill('tn1_cs2', 'P201', {}, 'TRANSFER');
      const cs2Paid = Number(cs2Bill.finalAmount);

      const cs1 = await report('ql1_cs1');
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
        await as('ql1_cs1')
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
      expect((await report('ql1_cs1')).previous).toBeNull();
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
      const bill = await payBill('tn1_cs1', 'P102', {}, 'CASH');
      const before = await report('ql1_cs1');
      await as('ql1_cs1')
        .post(`/orders/${bill.id as number}/void`, { reason: 'nhập nhầm' })
        .expect(200);
      const after = await report('ql1_cs1');
      expect(after.totals.collected).toBe(
        before.totals.collected - Number(bill.finalAmount),
      );
      expect(after.totals.orderCount).toBe(before.totals.orderCount - 1);
      expect(after.voided).toEqual({
        count: 1,
        amount: Number(bill.finalAmount),
      });

      const fund = (
        await as('ql1_cs1').get(`/funds/summary?${period}`).expect(200)
      ).body as Json;
      expect(fund.salesIncome).toBe(after.totals.collected);
      expect(fund.salesVat).toBe(after.totals.vat);
    });
  });

  describe('branches', () => {
    it('is for the chain manager only', async () => {
      await as('ql1_cs1').get(`/reports/branches?${period}`).expect(403);
      await as('tn1_cs1').get(`/reports/branches?${period}`).expect(403);
    });

    it('compares the branches with the numbers of the revenue report', async () => {
      const res = (
        await as('admin')
          .get(`/reports/branches?${period}&compare=1`)
          .expect(200)
      ).body as BranchesReport;
      const chain = await report('admin');

      expect(res.totals).toEqual(chain.totals);
      expect(res.branches.map((b) => b.code)).toEqual([
        'cs1',
        'cs2',
        'cs3',
        'cs4',
      ]);
      for (const branch of res.branches) {
        const same = chain.byBranch!.find((b) => b.code === branch.code)!;
        expect(branch.revenue).toBe((same as unknown as Metrics).revenue);
        expect(branch.collected).toBe(same.collected);
        expect(branch.series).toHaveLength(res.buckets.length);
        expect(branch.series.reduce((s, v) => s + v, 0)).toBe(branch.revenue);
        expect(branch.previous).toMatchObject({ orderCount: 0 });
      }
      expect(res.branches.reduce((s, b) => s + b.revenue, 0)).toBe(
        res.totals.revenue,
      );
      expect(res.branches.reduce((s, b) => s + (b.share ?? 0), 0)).toBeCloseTo(
        1,
      );
      expect(res.previous).toMatchObject({ totals: { orderCount: 0 } });
    });
  });

  describe('staff', () => {
    it('is for managers, within their own branch', async () => {
      await as('tn1_cs1').get(`/reports/staff?${period}`).expect(403);
      await as('ql1_cs1')
        .get(`/reports/staff?${period}&branch=cs2`)
        .expect(403);
      await as('ql1_cs1').get(`/reports/staff?${period}&role=boss`).expect(400);
    });

    it('credits each bill in full to its CSKH, its server and its cashier', async () => {
      const cskhId = await idOf('cskh1_cs1');
      const serverId = await idOf('pv1_cs1');
      const cashierId = await idOf('tn1_cs1');
      const bill = await payBill('tn1_cs1', 'P103', {}, 'CASH', {
        open: { cskhId, serverId },
      });
      const { totals } = await report('ql1_cs1');

      for (const [role, id] of [
        ['cskh', cskhId],
        ['server', serverId],
      ] as const) {
        const res = await breakdown('ql1_cs1', `/reports/staff?role=${role}`);
        expect(res.totals).toEqual(totals);
        expectSameTotals(res.rows, totals);
        expect(res.rows[0]).toMatchObject({
          id,
          orderCount: 1,
          collected: Number(bill.finalAmount),
        });
        // Bills without anyone in that role: "Chưa gán", always last.
        expect(res.rows.at(-1)).toMatchObject({
          id: null,
          name: null,
          orderCount: totals.orderCount - 1,
        });
      }

      const cashiers = await breakdown(
        'ql1_cs1',
        '/reports/staff?role=cashier',
      );
      expectSameTotals(cashiers.rows, totals);
      expect(cashiers.rows).toEqual([
        expect.objectContaining({
          id: cashierId,
          name: 'Thu ngân CS1',
          username: 'tn1_cs1',
          branchCode: 'cs1',
          orderCount: totals.orderCount,
        }),
      ]);
    });
  });

  describe('rooms', () => {
    it('validates the grouping', async () => {
      await as('ql1_cs1').get(`/reports/rooms?${period}&by=floor`).expect(400);
      await as('tn1_cs1').get(`/reports/rooms?${period}`).expect(403);
    });

    it('adds up per room, every room listed, with the occupancy', async () => {
      const { totals } = await report('ql1_cs1');
      const res = await breakdown('ql1_cs1', '/reports/rooms?by=room');
      expect(res.totals).toEqual(totals);
      expectSameTotals(res.rows, totals);
      expect(res.days).toBe(3);
      expect(res.rows.map((r) => r.name).sort()).toEqual([
        'P101',
        'P102',
        'P103',
      ]);

      const p101 = res.rows.find((r) => r.name === 'P101')!;
      expect(p101).toMatchObject({
        type: 'NORMAL',
        branchCode: 'cs1',
        rooms: 1,
      });
      expect(p101.orderCount).toBeGreaterThanOrEqual(1);
      expect(p101.occupancy).toBeCloseTo(Number(p101.roomMinutes) / (3 * 1110));
      // P102's only bill was voided: listed, with nothing.
      expect(res.rows.find((r) => r.name === 'P102')).toMatchObject({
        orderCount: 0,
        revenue: 0,
        occupancy: 0,
      });
      expect(res.occupancy).toBeCloseTo(totals.roomMinutes / (3 * 1110 * 3));
    });

    it('adds up per room type', async () => {
      const { totals } = await report('ql1_cs1');
      const res = await breakdown('ql1_cs1', '/reports/rooms?by=type');
      expectSameTotals(res.rows, totals);
      expect(res.rows.map((r) => [r.id, r.rooms]).sort()).toEqual([
        ['NORMAL', 2],
        ['VIP', 1],
      ]);
      const normal = res.rows.find((r) => r.id === 'NORMAL')!;
      expect(normal.occupancy).toBeCloseTo(
        Number(normal.roomMinutes) / (3 * 1110 * 2),
      );
    });

    it('counts a bill whose room belongs to another branch (legacy data) in "Không phòng"', async () => {
      const prisma = app.get(PrismaService);
      const cs1 = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs1' },
      });
      const cs3 = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs3' },
      });
      const p101 = await prisma.room.findFirstOrThrow({
        where: { branchId: cs1.id, name: 'P101' },
      });
      await prisma.order.create({
        data: {
          branchId: cs3.id,
          roomId: p101.id,
          status: 'COMPLETED',
          startTime: new Date('2026-02-03T20:00:00'),
          endTime: new Date('2026-02-03T21:00:00'),
          finalAmount: 110000,
          taxAmount: 10000,
          paymentMethod: 'CASH',
        },
      });

      const res = (
        await as('admin')
          .get('/reports/rooms?branch=cs3&from=2026-02-03&to=2026-02-03')
          .expect(200)
      ).body as { totals: Metrics; rows: Row[] };
      expectSameTotals(res.rows, res.totals);
      expect(res.rows.at(-1)).toMatchObject({
        id: null,
        orderCount: 1,
        revenue: 100000,
      });
    });
  });

  describe('products', () => {
    const productReport = (query = '') =>
      breakdown('ql1_cs1', `/reports/products${query}`) as unknown as Promise<{
        totals: Record<string, number>;
        rows: Row[];
      }>;
    // Products' net revenue + the room fee after its discount + the service
    // fee = the revenue (before VAT).
    const expectProductTotals = (
      res: { totals: Record<string, number>; rows: Row[] },
      totals: Metrics,
    ) => {
      expect(res.totals).toMatchObject({
        gross: totals.productSales,
        discount: totals.productDiscount,
        net: totals.productSales - totals.productDiscount,
      });
      for (const field of ['quantity', 'gross', 'discount', 'net'])
        expect(sumOf(res.rows, field)).toBe(res.totals[field]);
      for (const row of res.rows)
        expect(Number.isInteger(row.discount)).toBe(true);
      expect(
        res.totals.net +
          totals.roomFee -
          totals.roomDiscount +
          totals.serviceFee,
      ).toBe(totals.revenue);
    };

    it('validates the grouping', async () => {
      await as('ql1_cs1')
        .get(`/reports/products?${period}&by=brand`)
        .expect(400);
      await as('tn1_cs1').get(`/reports/products?${period}`).expect(403);
    });

    it('spreads the product discount over the lines, to the đồng', async () => {
      // 2 beers (50,000) + 1 water (10,000) with 7 đồng off: 5.83 + 1.17 → 6 + 1.
      const bill = await payBill(
        'tn1_cs1',
        'P101',
        { discountAmount: 7 },
        'CASH',
        {
          items: [
            ['Bia Tiger', 2],
            ['Nước suối', 1],
          ],
        },
      );
      expect(Number(bill.discountAmount)).toBe(7);

      const { totals } = await report('ql1_cs1');
      const res = await productReport();
      expectProductTotals(res, totals);
      const nuocSuoi = res.rows.find((r) => r.name === 'Nước suối');
      expect(nuocSuoi).toMatchObject({
        quantity: 1,
        gross: 10000,
        discount: 1,
        net: 9999,
        categoryName: 'Đồ uống',
        branchCode: 'cs1',
      });
      expect(typeof nuocSuoi?.unit).toBe('string');
      expect(res.rows[0].name).toBe('Bia Tiger');

      const byCategory = await productReport('?by=category');
      expect(byCategory.totals).toEqual(res.totals);
      expectProductTotals(byCategory, totals);
      expect(byCategory.rows.map((r) => r.name)).toEqual(['Đồ uống']);
    });

    it('follows a correction of a paid bill', async () => {
      const bills = (await as('ql1_cs1').get(`/orders?${period}`).expect(200))
        .body as Json[];
      const bill = bills.find((b) => Number(b.discountAmount) === 7)!;
      const products = (await as('ql1_cs1').get('/products').expect(200))
        .body as Json[];
      const idOfProduct = (name: string) =>
        products.find((p) => p.name === name)!.id;
      await as('ql1_cs1')
        .patch(`/orders/${bill.id as number}/paid`, {
          reason: 'thêm món',
          items: [
            { productId: idOfProduct('Bia Tiger'), quantity: 2 },
            { productId: idOfProduct('Nước suối'), quantity: 3 },
            { productId: idOfProduct('Phụ thu vệ sinh'), quantity: 1 },
          ],
        })
        .expect(200);

      const { totals } = await report('ql1_cs1');
      const res = await productReport();
      expectProductTotals(res, totals);
      expect(res.rows.find((r) => r.name === 'Nước suối')).toMatchObject({
        quantity: 3,
        gross: 30000,
      });

      // A product without a category: "Không danh mục", last.
      const byCategory = await productReport('?by=category');
      expectProductTotals(byCategory, totals);
      expect(byCategory.rows.at(-1)).toMatchObject({
        id: null,
        name: null,
        quantity: 1,
        gross: 50000,
      });
    });
  });

  describe('hours', () => {
    interface HoursReport {
      totals: { sessions: number; revenue: number };
      cells: {
        weekday: number;
        hour: number;
        sessions: number;
        revenue: number;
      }[];
    }

    it('counts sessions by weekday of the business day and hour of start', async () => {
      const prisma = app.get(PrismaService);
      const cs4 = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs4' },
      });
      const session = (start: string, end: string, paid: number, vat: number) =>
        prisma.order.create({
          data: {
            branchId: cs4.id,
            status: 'COMPLETED',
            startTime: new Date(start),
            endTime: new Date(end),
            finalAmount: paid,
            taxAmount: vat,
            paymentMethod: 'CASH',
          },
        });
      // 2026-01-09 is a Friday (T6).
      await session(
        '2026-01-09T22:10:00',
        '2026-01-10T00:30:00',
        110000,
        10000,
      );
      // Saturday 01:00 still belongs to Friday's business day.
      await session(
        '2026-01-10T01:00:00',
        '2026-01-10T03:00:00',
        220000,
        20000,
      );
      await session('2026-01-10T12:00:00', '2026-01-10T14:00:00', 55000, 5000);

      const res = (
        await as('admin')
          .get('/reports/hours?branch=cs4&from=2026-01-09&to=2026-01-10')
          .expect(200)
      ).body as HoursReport;
      expect(res.cells).toHaveLength(168);
      expect(
        res.cells
          .filter((c) => c.sessions > 0)
          .map((c) => [c.weekday, c.hour, c.sessions, c.revenue]),
      ).toEqual([
        [5, 1, 1, 200000],
        [5, 22, 1, 100000],
        [6, 12, 1, 50000],
      ]);
      expect(res.totals).toEqual({ sessions: 3, revenue: 350000 });

      // Bills without a room: the rooms report's "Không phòng" row.
      const rooms = (
        await as('admin')
          .get('/reports/rooms?branch=cs4&from=2026-01-09&to=2026-01-10')
          .expect(200)
      ).body as { occupancy: number | null; rows: Row[] };
      expect(rooms.occupancy).toBeNull();
      expect(rooms.rows).toEqual([
        expect.objectContaining({
          id: null,
          name: null,
          rooms: 0,
          occupancy: null,
          orderCount: 3,
          revenue: 350000,
        }),
      ]);
    });

    it('adds up to the revenue report', async () => {
      await as('tn1_cs1').get(`/reports/hours?${period}`).expect(403);
      const { totals } = await report('ql1_cs1');
      const res = (
        await as('ql1_cs1').get(`/reports/hours?${period}`).expect(200)
      ).body as HoursReport;
      expect(res.totals).toEqual({
        sessions: totals.orderCount,
        revenue: totals.revenue,
      });
    });
  });

  describe('whole chain', () => {
    it('adds up per breakdown across every branch, for the chain manager', async () => {
      const chain = await report('admin');
      for (const path of [
        '/reports/staff?role=cskh',
        '/reports/rooms?by=room',
        '/reports/rooms?by=type',
      ]) {
        const res = await breakdown('admin', path);
        expectSameTotals(res.rows, chain.totals);
      }

      const products = await breakdown(
        'admin',
        '/reports/products?by=category',
      );
      expect(products.totals).toMatchObject({
        gross: chain.totals.productSales,
        discount: chain.totals.productDiscount,
      });
      for (const field of ['gross', 'discount', 'net'])
        expect(sumOf(products.rows, field)).toBe(products.totals[field]);
    });
  });
});
