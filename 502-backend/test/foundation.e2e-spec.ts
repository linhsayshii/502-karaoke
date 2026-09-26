import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Permission matrix and the main sales / inventory / fund flows against a
// fresh database seeded with the demo accounts (SEED_DEMO=1).

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

  const login = async (username: string, password = 'demo123') => {
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
    app = configureApp(moduleRef.createNestApplication());
    await app.init();

    await login('admin', 'admin123');
    for (const u of [
      'ql_cs1',
      'tn_cs1',
      'nv_cs1',
      'cskh_cs1',
      'ql_cs2',
      'tn_cs2',
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
        .send({ username: 'tn_cs1', password: 'sai' })
        .expect(401);
      expect((res.body as Json).message).toBe(
        'Tên đăng nhập hoặc mật khẩu không đúng',
      );
    });

    it('returns the account with its branch', async () => {
      const res = await as('tn_cs1').get('/auth/me').expect(200);
      expect(res.body).toMatchObject({
        username: 'tn_cs1',
        role: 'CASHIER',
        branch: { code: 'cs1' },
      });
      expect(res.body).not.toHaveProperty('password');
    });
  });

  describe('branch scope', () => {
    it('gives non-chain accounts their own branch only', async () => {
      const res = await as('tn_cs1').get('/rooms').expect(200);
      const rooms = res.body as Json[];
      expect(rooms.map((r) => r.name)).toEqual(['P101', 'P102', 'P103']);

      await as('tn_cs1').get('/rooms?branch=cs2').expect(403);
      await as('ql_cs1').get('/products?branch=cs2').expect(403);

      const branches = await as('tn_cs1').get('/branches').expect(200);
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
      const cs2Rooms = await as('tn_cs2').get('/rooms').expect(200);
      const cs2RoomId = (cs2Rooms.body as Json[])[0].id as number;
      await as('tn_cs1').get(`/rooms/${cs2RoomId}`).expect(403);
      await as('tn_cs1').post('/orders', { roomId: cs2RoomId }).expect(403);
    });
  });

  describe('role guards', () => {
    it('keeps cashiers to cashier work', async () => {
      await as('tn_cs1').get('/inventory/stock').expect(403);
      await as('tn_cs1').get('/funds').expect(403);
      await as('tn_cs1')
        .get('/orders/statistics?from=2026-01-01&to=2026-01-02')
        .expect(403);
      await as('tn_cs1').get('/orders').expect(403);
      await as('tn_cs1').get('/users').expect(403);
      await as('tn_cs1')
        .post('/rooms', { name: 'X', type: 'NORMAL', pricePerHour: 1 })
        .expect(403);
      await as('tn_cs1').get('/products').expect(200);
    });

    it('keeps staff away from the catalog', async () => {
      await as('nv_cs1').get('/products').expect(403);
      await as('nv_cs1').post('/orders', { roomId: 1 }).expect(403);
    });

    it('reserves branch management to the chain manager', async () => {
      await as('ql_cs1')
        .post('/branches', { code: 'cs9', name: 'CS9' })
        .expect(403);
      await as('admin')
        .post('/branches', { code: 'cs5', name: 'Cơ sở 5' })
        .expect(201);
    });

    it('validates bodies and strips unknown fields', async () => {
      const res = await as('tn_cs1')
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
      const rooms = await as('tn_cs1').get('/rooms').expect(200);
      roomId = (rooms.body as Json[]).find((r) => r.name === 'P101')!
        .id as number;
      const products = (await as('tn_cs1').get('/products').expect(200))
        .body as Json[];
      beerId = products.find((p) => p.name === 'Bia Tiger')!.id as number;
      serviceId = products.find((p) => p.name === 'Phụ thu vệ sinh')!
        .id as number;
      const floor = (await as('tn_cs1').get('/users/floor-staff').expect(200))
        .body as Json[];
      staffId = floor.find((u) => u.fullName === 'Phục vụ CS1')!.id as number;
    });

    it('imports stock through a document', async () => {
      const res = await as('ql_cs1')
        .post('/inventory/documents', {
          type: 'IMPORT',
          supplier: 'NCC A',
          lines: [{ productId: beerId, quantity: 10, unitCost: 15000 }],
        })
        .expect(201);
      const doc = res.body as Json;
      expect(doc.code).toMatch(/^PN-CS1-\d{8}-\d{4}$/);
      expect(Number(doc.totalAmount)).toBe(150000);

      const stock = (await as('ql_cs1').get('/inventory/stock').expect(200))
        .body as Json[];
      const beer = stock.find((p) => p.id === beerId)!;
      expect(beer.stockQuantity).toBe(10);
      expect(Number(beer.costPrice)).toBe(15000);
      expect(stock.find((p) => p.id === serviceId)).toBeUndefined();
    });

    it('opens a room once', async () => {
      const res = await as('tn_cs1')
        .post('/orders', { roomId, serverId: staffId })
        .expect(201);
      orderId = (res.body as Json).id as number;
      expect(res.body).toMatchObject({ status: 'PENDING', branchId: 1 });

      await as('tn_cs1').post('/orders', { roomId }).expect(409);
      const room = (await as('tn_cs1').get(`/rooms/${roomId}`).expect(200))
        .body as Json;
      expect(room).toMatchObject({ status: 'ACTIVE', activeOrderId: orderId });
    });

    it('shows staff only the rooms they serve, read-only', async () => {
      const mine = (await as('nv_cs1').get('/rooms').expect(200))
        .body as Json[];
      expect(mine.map((r) => r.id)).toEqual([roomId]);
      const other = (await as('cskh_cs1').get('/rooms').expect(200))
        .body as Json[];
      expect(other).toEqual([]);

      await as('nv_cs1').get(`/orders/${orderId}`).expect(200);
      await as('cskh_cs1').get(`/orders/${orderId}`).expect(403);
      await as('nv_cs1').patch(`/orders/${orderId}`, { items: [] }).expect(403);
    });

    it('prices items on the server', async () => {
      const res = await as('tn_cs1')
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

      const cs2Products = (await as('tn_cs2').get('/products').expect(200))
        .body as Json[];
      await as('tn_cs1')
        .patch(`/orders/${orderId}`, {
          items: [{ productId: cs2Products[0].id, quantity: 1 }],
        })
        .expect(400);
    });

    it('checks out once and deducts stock', async () => {
      const preview = (
        await as('tn_cs1').get(`/orders/${orderId}/preview`).expect(200)
      ).body as Json;
      expect(preview.totalProductPrice).toBe(100000);

      const res = await as('tn_cs1')
        .post(`/orders/${orderId}/checkout`)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'COMPLETED' });
      expect(Number((res.body as Json).finalAmount)).toBeGreaterThanOrEqual(
        110000,
      );
      await as('tn_cs1').post(`/orders/${orderId}/checkout`).expect(409);

      const stock = (await as('ql_cs1').get('/inventory/stock').expect(200))
        .body as Json[];
      expect(stock.find((p) => p.id === beerId)!.stockQuantity).toBe(8);

      const movements = (
        await as('ql_cs1')
          .get(`/inventory/movements?productId=${beerId}`)
          .expect(200)
      ).body as Json[];
      expect(
        movements.map((m) => [m.type, m.quantity, m.balanceAfter]),
      ).toEqual([
        ['SALE', -2, 8],
        ['IMPORT', 10, 10],
      ]);

      const room = (await as('tn_cs1').get(`/rooms/${roomId}`).expect(200))
        .body as Json;
      expect(room.status).toBe('AVAILABLE');
      expect((await as('nv_cs1').get('/rooms').expect(200)).body).toEqual([]);
    });

    it('never exports more than in stock', async () => {
      const res = await as('ql_cs1')
        .post('/inventory/documents', {
          type: 'EXPORT',
          lines: [{ productId: beerId, quantity: 100 }],
        })
        .expect(400);
      expect((res.body as Json).message).toContain('Không đủ tồn kho');

      await as('ql_cs1')
        .post('/inventory/documents', {
          type: 'EXPORT',
          note: 'Hư hỏng',
          lines: [{ productId: beerId, quantity: 3 }],
        })
        .expect(201);
      const stock = (await as('ql_cs1').get('/inventory/stock').expect(200))
        .body as Json[];
      expect(stock.find((p) => p.id === beerId)!.stockQuantity).toBe(5);
    });

    it('lets only managers cancel an open session', async () => {
      const opened = await as('tn_cs1').post('/orders', { roomId }).expect(201);
      const id = (opened.body as Json).id as number;
      await as('tn_cs1').post(`/orders/${id}/cancel`).expect(403);
      await as('ql_cs1').post(`/orders/${id}/cancel`).expect(200);
      const room = (await as('tn_cs1').get(`/rooms/${roomId}`).expect(200))
        .body as Json;
      expect(room.status).toBe('AVAILABLE');
    });

    it('reports revenue to managers', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const res = await as('ql_cs1')
        .get(`/orders/statistics?from=${ymd(yesterday)}&to=${ymd(today)}`)
        .expect(200);
      const stats = res.body as Json[];
      expect(stats.reduce((s, d) => s + (d.orderCount as number), 0)).toBe(1);
    });
  });

  describe('account management', () => {
    it('lets a branch manager manage cashiers and staff of their branch', async () => {
      const created = await as('ql_cs1')
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

      const res = await as('ql_cs1')
        .post('/users', {
          username: 'tn_moi',
          password: 'matkhau1',
          fullName: 'Thu ngân mới',
          role: 'CASHIER',
        })
        .expect(201);
      expect(res.body).toMatchObject({ branchId: 1, hasPassword: true });
      expect(res.body).not.toHaveProperty('password');

      await as('ql_cs1')
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
      const tnCs2 = cs2Users.find((u) => u.username === 'tn_cs2')!;
      await as('ql_cs1')
        .patch(`/users/${tnCs2.id as number}`, { fullName: 'X' })
        .expect(403);

      const me = (await as('ql_cs1').get('/auth/me').expect(200)).body as Json;
      await as('ql_cs1')
        .delete(`/users/${me.id as number}`)
        .expect(403);
      await as('ql_cs1').get('/users?branch=cs2').expect(403);
    });

    it('locks an account immediately', async () => {
      const cs1Users = (await as('ql_cs1').get('/users').expect(200))
        .body as Json[];
      const cskh = cs1Users.find((u) => u.username === 'cskh_cs1')!;
      await as('ql_cs1')
        .delete(`/users/${cskh.id as number}`)
        .expect(200);

      await as('cskh_cs1').get('/rooms').expect(401);
      const res = await api()
        .post('/api/auth/login')
        .send({ username: 'cskh_cs1', password: 'demo123' })
        .expect(401);
      expect((res.body as Json).message).toBe('Tài khoản đã bị khóa');
    });
  });

  describe('cash fund', () => {
    it('records receipts and payments per branch', async () => {
      await as('ql_cs1')
        .post('/funds', {
          type: 'INCOME',
          amount: 100000,
          category: 'Thu khác',
        })
        .expect(201);
      await as('ql_cs1')
        .post('/funds', {
          type: 'EXPENSE',
          amount: 30000,
          description: 'Mua đá',
        })
        .expect(201);
      await as('ql_cs1')
        .post('/funds', { type: 'EXPENSE', amount: -5 })
        .expect(400);

      const summary = await as('ql_cs1').get('/funds/summary').expect(200);
      expect(summary.body).toEqual({
        income: 100000,
        expense: 30000,
        net: 70000,
      });

      const cs2 = await as('ql_cs2').get('/funds/summary').expect(200);
      expect(cs2.body).toEqual({ income: 0, expense: 0, net: 0 });
      await as('ql_cs2').get('/funds?branch=cs1').expect(403);
    });
  });
});
