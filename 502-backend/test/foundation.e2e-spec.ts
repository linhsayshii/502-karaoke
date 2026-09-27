import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Permission matrix and the main sales / inventory / fund flows against a
// fresh database seeded with the demo data (SEED_DEMO=1).

type Json = Record<string, unknown>;

describe('Foundation (e2e)', () => {
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
    delete: (url: string) =>
      api()
        .delete(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`),
  });

  const login = async (username: string, password = '12345678') => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
    return res.body as Json;
  };

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
    for (const u of [
      'ql1_cs1',
      'tn1_cs1',
      'pv1_cs1',
      'cskh1_cs1',
      'ql1_cs2',
      'tn1_cs2',
    ]) {
      await login(u);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('rejects business endpoints without a token', async () => {
      await api().get('/api/rooms').expect(401);
      await api().get('/api/products?branch=cs1').expect(401);
    });

    it('rejects a wrong password with a Vietnamese message', async () => {
      const res = await api()
        .post('/api/auth/login')
        .send({ username: 'tn1_cs1', password: 'sai' })
        .expect(401);
      expect((res.body as Json).message).toBe(
        'Tên đăng nhập hoặc mật khẩu không đúng',
      );
    });

    it('returns the account with its branch', async () => {
      const res = await as('tn1_cs1').get('/auth/me').expect(200);
      expect(res.body).toMatchObject({
        username: 'tn1_cs1',
        role: 'CASHIER',
        branch: { code: 'cs1' },
      });
      expect(res.body).not.toHaveProperty('password');
    });
  });

  describe('branch scope', () => {
    it('gives non-chain accounts their own branch only', async () => {
      const res = await as('tn1_cs1').get('/rooms').expect(200);
      const rooms = res.body as Json[];
      expect(rooms.map((r) => r.name)).toEqual(['P101', 'P102', 'P103']);

      await as('tn1_cs1').get('/rooms?branch=cs2').expect(403);
      await as('ql1_cs1').get('/products?branch=cs2').expect(403);

      const branches = await as('tn1_cs1').get('/branches').expect(200);
      expect((branches.body as Json[]).map((b) => b.code)).toEqual(['cs1']);
    });

    it('requires the chain manager to pick a branch', async () => {
      await as('admin').get('/rooms').expect(400);
      const res = await as('admin').get('/rooms?branch=cs2').expect(200);
      expect((res.body as Json[]).map((r) => r.name)).toEqual([
        'P201',
        'P202',
        'P203',
      ]);
      await as('admin').get('/rooms?branch=khong-co').expect(404);
    });

    it('blocks access by id to another branch', async () => {
      const cs2Rooms = await as('tn1_cs2').get('/rooms').expect(200);
      const cs2RoomId = (cs2Rooms.body as Json[])[0].id as number;
      await as('tn1_cs1').get(`/rooms/${cs2RoomId}`).expect(403);
      await as('tn1_cs1').post('/orders', { roomId: cs2RoomId }).expect(403);
    });
  });

  describe('role guards', () => {
    it('keeps cashiers to cashier work', async () => {
      await as('tn1_cs1').get('/inventory/stock').expect(403);
      await as('tn1_cs1').get('/funds').expect(403);
      await as('tn1_cs1')
        .get('/orders/statistics?from=2026-01-01&to=2026-01-02')
        .expect(403);
      await as('tn1_cs1').get('/orders').expect(403);
      await as('tn1_cs1').get('/users').expect(403);
      await as('tn1_cs1')
        .post('/rooms', { name: 'X', type: 'NORMAL', pricePerHour: 1 })
        .expect(403);
      await as('tn1_cs1').get('/products').expect(200);
    });

    it('keeps staff away from the catalog', async () => {
      await as('pv1_cs1').get('/products').expect(403);
      await as('pv1_cs1').post('/orders', { roomId: 1 }).expect(403);
    });

    it('reserves branch management to the chain manager', async () => {
      await as('ql1_cs1')
        .post('/branches', { code: 'cs9', name: 'CS9' })
        .expect(403);
      await as('admin')
        .post('/branches', { code: 'cs5', name: 'Cơ sở 5' })
        .expect(201);
    });

    it('validates bodies and strips unknown fields', async () => {
      const res = await as('tn1_cs1')
        .post('/orders', { roomId: 'x' })
        .expect(400);
      expect((res.body as Json).message).toContain('roomId');
    });
  });

  describe('sales, stock and staff visibility', () => {
    let roomId: number;
    let orderId: number;
    let beerId: number;
    let serviceId: number;
    let staffId: number;

    beforeAll(async () => {
      const rooms = await as('tn1_cs1').get('/rooms').expect(200);
      roomId = (rooms.body as Json[]).find((r) => r.name === 'P101')!
        .id as number;
      const products = (await as('tn1_cs1').get('/products').expect(200))
        .body as Json[];
      beerId = products.find((p) => p.name === 'Bia Tiger')!.id as number;
      serviceId = products.find((p) => p.name === 'Phụ thu vệ sinh')!
        .id as number;
      const floor = (await as('tn1_cs1').get('/users/floor-staff').expect(200))
        .body as Json[];
      staffId = floor.find((u) => u.fullName === 'Phục vụ CS1')!.id as number;
    });

    it('imports stock through a document', async () => {
      const res = await as('ql1_cs1')
        .post('/inventory/documents', {
          type: 'IMPORT',
          supplier: 'NCC A',
          lines: [{ productId: beerId, quantity: 10, unitCost: 15000 }],
        })
        .expect(201);
      const doc = res.body as Json;
      expect(doc.code).toMatch(/^PN-CS1-\d{8}-\d{4}$/);
      expect(Number(doc.totalAmount)).toBe(150000);

      const stock = (await as('ql1_cs1').get('/inventory/stock').expect(200))
        .body as Json[];
      const beer = stock.find((p) => p.id === beerId)!;
      expect(beer.stockQuantity).toBe(10);
      expect(Number(beer.costPrice)).toBe(15000);
      expect(stock.find((p) => p.id === serviceId)).toBeUndefined();
    });

    it('opens a room once', async () => {
      const res = await as('tn1_cs1')
        .post('/orders', { roomId, serverId: staffId })
        .expect(201);
      orderId = (res.body as Json).id as number;
      expect(res.body).toMatchObject({ status: 'PENDING', branchId: 1 });

      await as('tn1_cs1').post('/orders', { roomId }).expect(409);
      const room = (await as('tn1_cs1').get(`/rooms/${roomId}`).expect(200))
        .body as Json;
      expect(room).toMatchObject({ status: 'ACTIVE', activeOrderId: orderId });
    });

    it('shows staff only the rooms they serve, read-only', async () => {
      const mine = (await as('pv1_cs1').get('/rooms').expect(200))
        .body as Json[];
      expect(mine.map((r) => r.id)).toEqual([roomId]);
      const other = (await as('cskh1_cs1').get('/rooms').expect(200))
        .body as Json[];
      expect(other).toEqual([]);

      await as('pv1_cs1').get(`/orders/${orderId}`).expect(200);
      await as('cskh1_cs1').get(`/orders/${orderId}`).expect(403);
      await as('pv1_cs1')
        .patch(`/orders/${orderId}`, { items: [] })
        .expect(403);
    });

    it('prices items on the server', async () => {
      const res = await as('tn1_cs1')
        .patch(`/orders/${orderId}`, {
          items: [
            { productId: beerId, quantity: 2, price: 1 },
            { productId: serviceId, quantity: 1 },
          ],
          taxPercent: 10,
        })
        .expect(200);
      const items = (res.body as Json).items as Json[];
      expect(items.map((i) => Number(i.price))).toEqual([25000, 50000]);

      const cs2Products = (await as('tn1_cs2').get('/products').expect(200))
        .body as Json[];
      await as('tn1_cs1')
        .patch(`/orders/${orderId}`, {
          items: [{ productId: cs2Products[0].id, quantity: 1 }],
        })
        .expect(400);
    });

    it('checks out once and deducts stock', async () => {
      const preview = (
        await as('tn1_cs1').get(`/orders/${orderId}/preview`).expect(200)
      ).body as Json;
      expect(preview.totalProductPrice).toBe(100000);

      const res = await as('tn1_cs1')
        .post(`/orders/${orderId}/checkout`)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'COMPLETED' });
      expect(Number((res.body as Json).finalAmount)).toBeGreaterThanOrEqual(
        110000,
      );
      await as('tn1_cs1').post(`/orders/${orderId}/checkout`).expect(409);

      const stock = (await as('ql1_cs1').get('/inventory/stock').expect(200))
        .body as Json[];
      expect(stock.find((p) => p.id === beerId)!.stockQuantity).toBe(8);

      const movements = (
        await as('ql1_cs1')
          .get(`/inventory/movements?productId=${beerId}`)
          .expect(200)
      ).body as Json[];
      expect(
        movements.map((m) => [m.type, m.quantity, m.balanceAfter]),
      ).toEqual([
        ['SALE', -2, 8],
        ['IMPORT', 10, 10],
      ]);

      const room = (await as('tn1_cs1').get(`/rooms/${roomId}`).expect(200))
        .body as Json;
      expect(room.status).toBe('AVAILABLE');
      expect((await as('pv1_cs1').get('/rooms').expect(200)).body).toEqual([]);
    });

    it('never exports more than in stock', async () => {
      const res = await as('ql1_cs1')
        .post('/inventory/documents', {
          type: 'EXPORT',
          lines: [{ productId: beerId, quantity: 100 }],
        })
        .expect(400);
      expect((res.body as Json).message).toContain('Không đủ tồn kho');

      await as('ql1_cs1')
        .post('/inventory/documents', {
          type: 'EXPORT',
          note: 'Hư hỏng',
          lines: [{ productId: beerId, quantity: 3 }],
        })
        .expect(201);
      const stock = (await as('ql1_cs1').get('/inventory/stock').expect(200))
        .body as Json[];
      expect(stock.find((p) => p.id === beerId)!.stockQuantity).toBe(5);
    });

    it('lets only managers cancel an open session', async () => {
      const opened = await as('tn1_cs1')
        .post('/orders', { roomId })
        .expect(201);
      const id = (opened.body as Json).id as number;
      await as('tn1_cs1').post(`/orders/${id}/cancel`).expect(403);
      await as('ql1_cs1').post(`/orders/${id}/cancel`).expect(200);
      const room = (await as('tn1_cs1').get(`/rooms/${roomId}`).expect(200))
        .body as Json;
      expect(room.status).toBe('AVAILABLE');
    });

    it('reports revenue to managers', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const res = await as('ql1_cs1')
        .get(`/orders/statistics?from=${ymd(yesterday)}&to=${ymd(today)}`)
        .expect(200);
      const stats = res.body as Json[];
      expect(stats.reduce((s, d) => s + (d.orderCount as number), 0)).toBe(1);
    });
  });

  describe('account management', () => {
    it('lets a branch manager manage cashiers and staff of their branch', async () => {
      const created = await as('ql1_cs1')
        .post('/users', {
          username: 'tn_moi',
          password: 'matkhau1',
          fullName: 'Thu ngân mới',
          role: 'CASHIER',
          branchId: 999,
        })
        .expect(403);
      expect((created.body as Json).message).toBe(
        'Bạn không có quyền truy cập cơ sở này',
      );

      const res = await as('ql1_cs1')
        .post('/users', {
          username: 'tn_moi',
          password: 'matkhau1',
          fullName: 'Thu ngân mới',
          role: 'CASHIER',
        })
        .expect(201);
      expect(res.body).toMatchObject({ branchId: 1, hasPassword: true });
      expect(res.body).not.toHaveProperty('password');

      await as('ql1_cs1')
        .post('/users', {
          username: 'ql_moi',
          fullName: 'QL',
          role: 'BRANCH_MANAGER',
        })
        .expect(403);
    });

    it('stops a branch manager from touching other branches or themselves', async () => {
      const cs2Users = (await as('admin').get('/users?branch=cs2').expect(200))
        .body as Json[];
      const tnCs2 = cs2Users.find((u) => u.username === 'tn1_cs2')!;
      await as('ql1_cs1')
        .patch(`/users/${tnCs2.id as number}`, { fullName: 'X' })
        .expect(403);

      const me = (await as('ql1_cs1').get('/auth/me').expect(200)).body as Json;
      await as('ql1_cs1')
        .delete(`/users/${me.id as number}`)
        .expect(403);
      await as('ql1_cs1').get('/users?branch=cs2').expect(403);
    });

    it('locks an account immediately', async () => {
      const cs1Users = (await as('ql1_cs1').get('/users').expect(200))
        .body as Json[];
      const cskh = cs1Users.find((u) => u.username === 'cskh1_cs1')!;
      await as('ql1_cs1')
        .delete(`/users/${cskh.id as number}`)
        .expect(200);

      await as('cskh1_cs1').get('/rooms').expect(401);
      const res = await api()
        .post('/api/auth/login')
        .send({ username: 'cskh1_cs1', password: '12345678' })
        .expect(401);
      expect((res.body as Json).message).toBe('Tài khoản đã bị khóa');
    });
  });

  describe('cash fund', () => {
    it('records receipts and payments per branch', async () => {
      const before = (await as('ql1_cs1').get('/funds/summary').expect(200))
        .body as Json;
      // The bill paid earlier in this run is already in the fund.
      expect(before.salesIncome).toBeGreaterThan(0);
      expect(before.income).toBe(before.salesIncome);

      await as('ql1_cs1')
        .post('/funds', {
          type: 'INCOME',
          amount: 100000,
          category: 'Thu khác',
        })
        .expect(201);
      await as('ql1_cs1')
        .post('/funds', {
          type: 'EXPENSE',
          method: 'TRANSFER',
          amount: 30000,
          description: 'Mua đá',
        })
        .expect(201);
      await as('ql1_cs1')
        .post('/funds', { type: 'EXPENSE', amount: -5 })
        .expect(400);

      const summary = (await as('ql1_cs1').get('/funds/summary').expect(200))
        .body as Json;
      expect(summary).toMatchObject({
        openingBalance: 0,
        income: (before.income as number) + 100000,
        expense: 30000,
        net: (before.income as number) + 70000,
        closingBalance: (before.income as number) + 70000,
        salesIncome: before.salesIncome,
        purchaseExpense: 0,
      });
      const transfer = (summary.byMethod as Json[]).find(
        (m) => m.method === 'TRANSFER',
      )!;
      expect(transfer).toMatchObject({ income: 0, expense: 30000 });

      const cs2 = (await as('ql1_cs2').get('/funds/summary').expect(200))
        .body as Json;
      expect(cs2).toMatchObject({ income: 0, expense: 0, net: 0 });
      await as('ql1_cs2').get('/funds?branch=cs1').expect(403);
    });
  });

  // Sales, stock and fund must always tell the same story (cs2 only).
  describe('linked sales, stock and fund', () => {
    let roomId: number;
    let beerId: number;
    let waterId: number;
    let paidOrderId: number;
    let importId: number;

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const period = `from=${ymd(yesterday)}&to=${ymd(tomorrow)}`;

    const stockOf = async (productId: number) => {
      const stock = (await as('ql1_cs2').get('/inventory/stock').expect(200))
        .body as Json[];
      return stock.find((p) => p.id === productId)!;
    };
    const summary = async () =>
      (await as('ql1_cs2').get(`/funds/summary?${period}`).expect(200))
        .body as Json;
    const revenue = async () => {
      const days = (
        await as('ql1_cs2').get(`/orders/statistics?${period}`).expect(200)
      ).body as Json[];
      return days.reduce((s, d) => s + (d.totalRevenue as number), 0);
    };
    const openSession = async (items: Json[]) => {
      const opened = await as('tn1_cs2')
        .post('/orders', { roomId })
        .expect(201);
      const id = (opened.body as Json).id as number;
      await as('tn1_cs2').patch(`/orders/${id}`, { items }).expect(200);
      return id;
    };

    beforeAll(async () => {
      const rooms = (await as('tn1_cs2').get('/rooms').expect(200))
        .body as Json[];
      roomId = rooms.find((r) => r.name === 'P201')!.id as number;
      const products = (await as('tn1_cs2').get('/products').expect(200))
        .body as Json[];
      beerId = products.find((p) => p.name === 'Bia Tiger')!.id as number;
      waterId = products.find((p) => p.name === 'Nước suối')!.id as number;
    });

    it('writes the phiếu chi of an import paid from the fund', async () => {
      const res = await as('ql1_cs2')
        .post('/inventory/documents', {
          type: 'IMPORT',
          supplier: 'NCC B',
          paymentMethod: 'CASH',
          lines: [{ productId: beerId, quantity: 20, unitCost: 12000 }],
        })
        .expect(201);
      const doc = res.body as Json;
      importId = doc.id as number;
      expect(doc.fundTransaction).toMatchObject({ method: 'CASH' });
      expect(Number((doc.fundTransaction as Json).amount)).toBe(240000);

      // Bought on credit: no fund entry.
      await as('ql1_cs2')
        .post('/inventory/documents', {
          type: 'IMPORT',
          lines: [{ productId: waterId, quantity: 10, unitCost: 5000 }],
        })
        .expect(201);
      await as('ql1_cs2')
        .post('/inventory/documents', {
          type: 'EXPORT',
          paymentMethod: 'CASH',
          lines: [{ productId: waterId, quantity: 1 }],
        })
        .expect(400);

      const entries = (await as('ql1_cs2').get('/funds').expect(200))
        .body as Json[];
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        type: 'EXPENSE',
        category: 'Nhập hàng',
        stockDocument: { code: doc.code },
      });
      expect(await summary()).toMatchObject({
        expense: 240000,
        purchaseExpense: 240000,
        closingBalance: -240000,
      });
    });

    it('shows what open sessions have ordered but not yet paid', async () => {
      paidOrderId = await openSession([{ productId: beerId, quantity: 3 }]);
      expect(await stockOf(beerId)).toMatchObject({
        stockQuantity: 20,
        pendingQuantity: 3,
        availableQuantity: 17,
      });
      const products = (await as('tn1_cs2').get('/products').expect(200))
        .body as Json[];
      expect(products.find((p) => p.id === beerId)!.pendingQuantity).toBe(3);
    });

    it('keeps the room price of the session and applies live percents', async () => {
      await as('ql1_cs2')
        .patch(`/rooms/${roomId}`, { pricePerHour: 999000 })
        .expect(200);
      await as('tn1_cs2')
        .patch(`/orders/${paidOrderId}`, { discountPercent: 10 })
        .expect(200);

      let bill = (
        await as('tn1_cs2').get(`/orders/${paidOrderId}/preview`).expect(200)
      ).body as Json;
      // 1-2 started minutes at the 120,000 opening price.
      expect(bill.hourlyFee).toBeLessThanOrEqual(4000);
      expect(bill.discountAmount).toBe(8000); // 10% of 75,000, rounded up

      await as('tn1_cs2')
        .patch(`/orders/${paidOrderId}`, {
          items: [{ productId: beerId, quantity: 4 }],
        })
        .expect(200);
      bill = (
        await as('tn1_cs2').get(`/orders/${paidOrderId}/preview`).expect(200)
      ).body as Json;
      expect(bill.discountAmount).toBe(10000); // follows the new total
      await as('ql1_cs2')
        .patch(`/rooms/${roomId}`, { pricePerHour: 120000 })
        .expect(200);
    });

    it('writes the fund receipt at checkout and matches revenue', async () => {
      const res = await as('tn1_cs2')
        .post(`/orders/${paidOrderId}/checkout`, { paymentMethod: 'TRANSFER' })
        .expect(200);
      const order = res.body as Json;
      const finalAmount = Number(order.finalAmount);
      expect(order).toMatchObject({
        status: 'COMPLETED',
        paymentMethod: 'TRANSFER',
        fundTransaction: { method: 'TRANSFER', cancelledAt: null },
      });
      expect(Number(order.discountAmount)).toBe(10000);
      expect(Number((order.fundTransaction as Json).amount)).toBe(finalAmount);
      expect(
        Number(order.totalProductPrice) +
          Number(order.hourlyFee) -
          Number(order.discountAmount) -
          Number(order.hourlyDiscountAmount) +
          Number(order.serviceFeeAmount) +
          Number(order.taxAmount),
      ).toBe(finalAmount);

      expect(await revenue()).toBe(finalAmount);
      const fund = await summary();
      expect(fund.salesIncome).toBe(finalAmount);
      expect(
        (fund.byMethod as Json[]).find((m) => m.method === 'TRANSFER'),
      ).toMatchObject({ income: finalAmount });
      expect((await stockOf(beerId)).stockQuantity).toBe(16);

      const days = (
        await as('ql1_cs2').get(`/orders/statistics?${period}`).expect(200)
      ).body as Json[];
      expect(days.reduce((s, d) => s + (d.transfer as number), 0)).toBe(
        finalAmount,
      );
      const bills = (
        await as('ql1_cs2')
          .get(`/orders?${period}&status=COMPLETED`)
          .expect(200)
      ).body as Json[];
      expect(bills.map((b) => b.id)).toEqual([paidOrderId]);
    });

    it('cancels only manual fund entries, with a reason', async () => {
      const entries = (await as('ql1_cs2').get('/funds').expect(200))
        .body as Json[];
      const receipt = entries.find((e) => e.order !== null)!;
      await as('ql1_cs2')
        .post(`/funds/${receipt.id as number}/cancel`, { reason: 'x' })
        .expect(409);

      const manual = await as('ql1_cs2')
        .post('/funds', { type: 'INCOME', amount: 50000 })
        .expect(201);
      const id = (manual.body as Json).id as number;
      const before = await summary();
      await as('ql1_cs2').post(`/funds/${id}/cancel`, {}).expect(400);
      await as('tn1_cs2')
        .post(`/funds/${id}/cancel`, { reason: 'Ghi nhầm' })
        .expect(403);
      await as('ql1_cs2')
        .post(`/funds/${id}/cancel`, { reason: 'Ghi nhầm' })
        .expect(200);
      await as('ql1_cs2')
        .post(`/funds/${id}/cancel`, { reason: 'Ghi nhầm' })
        .expect(409);
      expect((await summary()).income).toBe((before.income as number) - 50000);
    });

    it('voids a paid bill: stock back, receipt cancelled, revenue gone', async () => {
      await as('tn1_cs2')
        .post(`/orders/${paidOrderId}/void`, { reason: 'Nhập nhầm' })
        .expect(403);
      await as('ql1_cs2').post(`/orders/${paidOrderId}/void`, {}).expect(400);
      const res = await as('ql1_cs2')
        .post(`/orders/${paidOrderId}/void`, { reason: 'Nhập nhầm phòng' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Nhập nhầm phòng',
        cancelledBy: { fullName: 'Quản lý CS2' },
      });
      expect((res.body as Json).fundTransaction).not.toMatchObject({
        cancelledAt: null,
      });
      await as('ql1_cs2')
        .post(`/orders/${paidOrderId}/void`, { reason: 'lần nữa' })
        .expect(409);

      expect((await stockOf(beerId)).stockQuantity).toBe(20);
      const movements = (
        await as('ql1_cs2')
          .get(`/inventory/movements?productId=${beerId}`)
          .expect(200)
      ).body as Json[];
      expect(movements[0]).toMatchObject({
        type: 'REVERSAL',
        quantity: 4,
        orderId: paidOrderId,
      });
      expect(await revenue()).toBe(0);
      expect((await summary()).salesIncome).toBe(0);
    });

    it('never lets an item edit and a checkout disagree', async () => {
      for (let round = 0; round < 3; round++) {
        const id = await openSession([{ productId: waterId, quantity: 1 }]);
        const [edit] = await Promise.all([
          as('tn1_cs2').patch(`/orders/${id}`, {
            items: [{ productId: waterId, quantity: 5 }],
          }),
          as('tn1_cs2').post(`/orders/${id}/checkout`).expect(200),
        ]);
        expect([200, 409]).toContain(edit.status);

        const order = (await as('ql1_cs2').get(`/orders/${id}`).expect(200))
          .body as Json;
        const items = order.items as Json[];
        const billed = items.reduce(
          (s, i) => s + Number(i.price) * (i.quantity as number),
          0,
        );
        expect(Number(order.totalProductPrice)).toBe(billed);
        const movements = (
          await as('ql1_cs2')
            .get(`/inventory/movements?productId=${waterId}`)
            .expect(200)
        ).body as Json[];
        const sale = movements.find(
          (m) => m.orderId === id && m.type === 'SALE',
        )!;
        expect(-(sale.quantity as number)).toBe(items[0].quantity);
      }
    });

    it('cancels a stock document by reversing it', async () => {
      const cancelled = await as('ql1_cs2')
        .post(`/inventory/documents/${importId}/cancel`, {
          reason: 'Sai số lượng',
        })
        .expect(200);
      expect(cancelled.body).toMatchObject({
        cancelReason: 'Sai số lượng',
        fundTransaction: { method: 'CASH' },
      });
      expect(
        (cancelled.body as Json).fundTransaction as Json,
      ).not.toMatchObject({ cancelledAt: null });
      await as('ql1_cs2')
        .post(`/inventory/documents/${importId}/cancel`, { reason: 'x' })
        .expect(409);

      const beer = await stockOf(beerId);
      expect(beer.stockQuantity).toBe(0);
      expect(Number(beer.costPrice)).toBe(0);
      expect(await summary()).toMatchObject({ expense: 0, purchaseExpense: 0 });

      // Goods already sold cannot be taken out of stock again.
      const water = await stockOf(waterId);
      const docs = (
        await as('ql1_cs2').get('/inventory/documents?type=IMPORT').expect(200)
      ).body as Json[];
      const waterImport = docs.find((d) => d.id !== importId)!;
      const res = await as('ql1_cs2')
        .post(`/inventory/documents/${waterImport.id as number}/cancel`, {
          reason: 'x',
        })
        .expect(400);
      expect((res.body as Json).message).toContain('Không thể hủy phiếu');
      expect((await stockOf(waterId)).stockQuantity).toBe(water.stockQuantity);
    });

    it('keeps every stock balance equal to its ledger', async () => {
      for (const productId of [beerId, waterId]) {
        const movements = (
          await as('ql1_cs2')
            .get(`/inventory/movements?productId=${productId}`)
            .expect(200)
        ).body as Json[];
        const ledger = movements.reduce(
          (s, m) => s + (m.quantity as number),
          0,
        );
        expect((await stockOf(productId)).stockQuantity).toBe(ledger);
        expect(movements[0].balanceAfter).toBe(ledger);
      }
    });

    it('refuses to stop tracking a product that still has stock', async () => {
      const res = await as('ql1_cs2')
        .patch(`/products/${waterId}`, { trackStock: false })
        .expect(409);
      expect((res.body as Json).message).toContain('còn tồn kho');
    });
  });

  // Excel import on the empty branch cs3 (the browser sends mapped rows).
  describe('excel import', () => {
    const cs3 = (url: string) => `${url}?branch=cs3`;
    const productNames = async () =>
      (
        (await as('admin').get(cs3('/products')).expect(200)).body as Json[]
      ).map((p) => p.name);
    const productRows = [
      { row: 2, name: 'Bia Heineken', unit: 'lon', price: 30000 },
      {
        row: 3,
        name: 'Khô mực',
        unit: 'đĩa',
        price: 120000,
        categoryName: 'Đồ nhắm',
      },
    ];

    it('checks rows in a dry run without writing', async () => {
      const res = await as('admin')
        .post(cs3('/imports/products'), {
          dryRun: true,
          onDuplicate: 'SKIP',
          createCategories: true,
          rows: productRows,
        })
        .expect(200);
      expect((res.body as Json).summary).toEqual({
        create: 2,
        update: 0,
        skip: 0,
        error: 0,
      });
      expect(await productNames()).toEqual([]);
    });

    it('creates products and their missing categories', async () => {
      await as('admin')
        .post(cs3('/imports/products'), {
          dryRun: false,
          onDuplicate: 'SKIP',
          createCategories: true,
          rows: productRows,
        })
        .expect(200);
      expect(await productNames()).toEqual(['Bia Heineken', 'Khô mực']);
      const categories = (await as('admin').get(cs3('/categories')).expect(200))
        .body as Json[];
      expect(categories.map((c) => c.name)).toEqual(['Đồ nhắm']);
    });

    it('skips or updates duplicates as chosen', async () => {
      const rows = [{ row: 2, name: 'bia heineken', price: 32000 }];
      const skip = await as('admin')
        .post(cs3('/imports/products'), {
          dryRun: false,
          onDuplicate: 'SKIP',
          createCategories: false,
          rows,
        })
        .expect(200);
      expect((skip.body as Json).summary).toMatchObject({ skip: 1 });

      await as('admin')
        .post(cs3('/imports/products'), {
          dryRun: false,
          onDuplicate: 'UPDATE',
          createCategories: false,
          rows,
        })
        .expect(200);
      const products = (await as('admin').get(cs3('/products')).expect(200))
        .body as Json[];
      expect(products.find((p) => p.name === 'Bia Heineken')).toMatchObject({
        price: '32000',
        unit: 'lon',
      });
    });

    it('writes nothing when a row is invalid', async () => {
      const res = await as('admin')
        .post(cs3('/imports/products'), {
          dryRun: false,
          onDuplicate: 'SKIP',
          createCategories: true,
          rows: [
            { row: 2, name: 'Snack', unit: 'gói', price: 15000 },
            { row: 3, name: 'Đậu phộng', unit: 'gói' },
          ],
        })
        .expect(400);
      expect((res.body as Json).rows).toEqual([
        {
          row: 3,
          name: 'Đậu phộng',
          action: 'ERROR',
          message: 'Thiếu giá bán để tạo sản phẩm mới',
        },
      ]);
      expect(await productNames()).not.toContain('Snack');
    });

    it('turns a stock sheet into one paid phiếu nhập', async () => {
      const res = await as('admin')
        .post(cs3('/imports/stock-import'), {
          dryRun: false,
          createProducts: true,
          supplier: 'NCC Excel',
          paymentMethod: 'TRANSFER',
          rows: [
            {
              row: 2,
              productName: 'Bia Heineken',
              quantity: 24,
              unitCost: 20000,
            },
            {
              row: 3,
              productName: 'Nước ngọt',
              quantity: 10,
              unitCost: 8000,
              unit: 'lon',
              price: 15000,
              categoryName: 'Đồ uống',
            },
            {
              row: 4,
              productName: 'bia heineken',
              quantity: 24,
              unitCost: 22000,
            },
          ],
        })
        .expect(200);
      const body = res.body as Json;
      expect(body.totalAmount).toBe(48 * 21000 + 10 * 8000);
      expect((body.document as Json).code).toMatch(/^PN-CS3-\d{8}-\d{4}$/);

      const stock = (await as('admin').get(cs3('/inventory/stock')).expect(200))
        .body as Json[];
      const beer = stock.find((p) => p.name === 'Bia Heineken')!;
      expect(beer).toMatchObject({ stockQuantity: 48, costPrice: '21000' });
      expect(stock.find((p) => p.name === 'Nước ngọt')).toMatchObject({
        stockQuantity: 10,
      });
      const movements = (
        await as('admin')
          .get(cs3(`/inventory/movements`) + `&productId=${beer.id as number}`)
          .expect(200)
      ).body as Json[];
      expect(movements.reduce((s, m) => s + (m.quantity as number), 0)).toBe(
        48,
      );

      const fund = (await as('admin').get(cs3('/funds/summary')).expect(200))
        .body as Json;
      expect(fund).toMatchObject({ purchaseExpense: 48 * 21000 + 10 * 8000 });
    });

    it('limits a branch manager to its branch and roles', async () => {
      await as('ql1_cs1')
        .post('/imports/rooms?branch=cs2', {
          dryRun: true,
          onDuplicate: 'SKIP',
          rows: [{ row: 2, name: 'P9', pricePerHour: 100000 }],
        })
        .expect(403);
      await as('tn1_cs1')
        .post('/imports/rooms', {
          dryRun: true,
          onDuplicate: 'SKIP',
          rows: [{ row: 2, name: 'P9', pricePerHour: 100000 }],
        })
        .expect(403);

      const res = await as('ql1_cs1')
        .post('/imports/users', {
          dryRun: false,
          onDuplicate: 'SKIP',
          rows: [
            { row: 2, fullName: 'Phạm Văn Nam', position: 'SERVER' },
            { row: 3, fullName: 'Lê Quản Lý', role: 'BRANCH_MANAGER' },
          ],
        })
        .expect(400);
      expect(((res.body as Json).rows as Json[])[0]).toMatchObject({ row: 3 });

      const ok = await as('ql1_cs1')
        .post('/imports/users', {
          dryRun: false,
          onDuplicate: 'SKIP',
          rows: [{ row: 2, fullName: 'Phạm Văn Nam', position: 'SERVER' }],
        })
        .expect(200);
      expect(((ok.body as Json).rows as Json[])[0]).toMatchObject({
        action: 'CREATE',
        message: 'Tên đăng nhập: pham.van.nam',
      });
      const staff = (await as('ql1_cs1').get('/users/floor-staff').expect(200))
        .body as Json[];
      expect(staff.map((u) => u.fullName)).toContain('Phạm Văn Nam');
    });

    it('accepts a sheet of 1000 rows', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        row: i + 2,
        name: `Danh mục thử nghiệm số ${i + 1}`,
      }));
      const res = await as('admin')
        .post(cs3('/imports/categories'), { dryRun: true, rows })
        .expect(200);
      expect((res.body as Json).summary).toMatchObject({ create: 1000 });
    });
  });
});
