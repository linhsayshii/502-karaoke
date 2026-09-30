// test/einvoice.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FakeMinvoice } from './fake-minvoice';

// Hóa đơn điện tử (spec 2026-10-01) against a fake Minvoice
// (test/fake-minvoice.ts). The `it`s build on each other: run the whole file.

type Json = Record<string, unknown>;
const TAX_CODE = '0107811836';
// What must never leave the server: the Minvoice password, cookie and token.
const SECRETS = ['minvoice-pass', 'sess-', 'xsrf-'];

describe('E-invoices (e2e)', () => {
  let app: INestApplication<App>;
  const fake = new FakeMinvoice();
  const tokens: Record<string, string> = {};
  let cs1Id: number;
  let orderId: number;
  let draftId: number;

  const api = () => request(app.getHttpServer());
  const as = (name: string) => {
    const auth = `Bearer ${tokens[name]}`;
    return {
      get: (url: string) => api().get(`/api${url}`).set('Authorization', auth),
      post: (url: string, body: Json = {}) =>
        api().post(`/api${url}`).set('Authorization', auth).send(body),
      put: (url: string, body: Json = {}) =>
        api().put(`/api${url}`).set('Authorization', auth).send(body),
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
  const noSecrets = (body: unknown) => {
    const text = JSON.stringify(body);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  };

  beforeAll(async () => {
    process.env.MINVOICE_URL_TEMPLATE = await fake.start();
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
    for (const name of ['admin', 'ql1_cs1', 'tn1_cs1', 'ql1_cs2'])
      await login(name);
    await as('admin')
      .post('/users', {
        username: 'hdqt_hddt',
        fullName: 'HĐQT',
        role: 'BOARD',
        password: '12345678',
      })
      .expect(201);
    await login('hdqt_hddt');
    const branches = (await as('admin').get('/branches').expect(200))
      .body as Json[];
    cs1Id = branches.find((b) => b.code === 'cs1')!.id as number;
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
    delete process.env.MINVOICE_URL_TEMPLATE;
  });

  describe('config', () => {
    it('needs a tax code on the branch', async () => {
      const res = await as('admin')
        .post('/einvoice/config/login?branch=cs1', {
          username: 'admin',
          password: fake.password,
        })
        .expect(400);
      expect((res.body as Json).message).toMatch(/mã số thuế/);
      await as('admin')
        .patch(`/branches/${cs1Id}`, { taxCode: '12' })
        .expect(400);
      await as('admin')
        .patch(`/branches/${cs1Id}`, { taxCode: TAX_CODE })
        .expect(200);
    });

    it('is for the chain manager only', async () => {
      for (const name of ['ql1_cs1', 'tn1_cs1', 'hdqt_hddt']) {
        await as(name)
          .post('/einvoice/config/login?branch=cs1', {
            username: 'admin',
            password: fake.password,
          })
          .expect(403);
        await as(name).get('/einvoice/config/symbols?branch=cs1').expect(403);
      }
      await as('hdqt_hddt').get('/einvoice/config?branch=cs1').expect(200);
    });

    it('refuses a wrong password and keeps nothing', async () => {
      const res = await as('admin')
        .post('/einvoice/config/login?branch=cs1', {
          username: 'admin',
          password: 'sai',
        })
        .expect(400);
      expect((res.body as Json).message).toBe(
        'Sai tên đăng nhập hoặc mật khẩu Minvoice',
      );
      const view = (
        await as('admin').get('/einvoice/config?branch=cs1').expect(200)
      ).body as Json;
      expect(view).toMatchObject({
        needsLogin: true,
        username: null,
        configured: false,
      });
    });

    it('logs in, lists the symbols of the year and fills the seller', async () => {
      await as('admin')
        .post('/einvoice/config/login?branch=cs1', {
          username: 'admin',
          password: fake.password,
        })
        .expect(200);
      const { symbols } = (
        await as('admin').get('/einvoice/config/symbols?branch=cs1').expect(200)
      ).body as { symbols: Json[] };
      expect(symbols.map((s) => s.symbolCode)).toEqual([fake.symbolCode()]);
      const view = (
        await as('admin')
          .put('/einvoice/config/symbol?branch=cs1', {
            registerInvoiceId: symbols[0].registerInvoiceId,
          })
          .expect(200)
      ).body as Json;
      expect(view).toMatchObject({
        branchTaxCode: TAX_CODE,
        username: 'admin',
        symbolCode: fake.symbolCode(),
        registerInvoiceId: 'range-1',
        sellerName: 'CÔNG TY TNHH KARAOKE THỬ NGHIỆM',
        needsLogin: false,
        configured: true,
        minInvoiceDate: null,
      });
      noSecrets(view);
      noSecrets((await as('tn1_cs1').get('/einvoice/config').expect(200)).body);
    });

    it('logs in again by itself when the session expired', async () => {
      fake.expireSessions();
      const logins = fake.logins;
      await as('admin').get('/einvoice/config/symbols?branch=cs1').expect(200);
      expect(fake.logins).toBe(logins + 1);
    });

    it('checks a buyer tax code before looking it up', async () => {
      await as('tn1_cs1').get('/einvoice/tax-payers/12345').expect(400);
      await as('hdqt_hddt').get('/einvoice/tax-payers/0107068321').expect(403);
    });
  });

  describe('drafts', () => {
    const buyer = {
      buyerTaxCode: '0107068321',
      buyerName: 'CÔNG TY HOÀNG GIA',
      buyerAddress: 'Số 26, phố Nhổn',
      buyerEmail: '',
    };
    const beer = {
      name: 'Bia Heineken',
      unit: 'Lon',
      quantity: 10,
      unitPrice: 35000,
      vatRate: 10,
    };
    const filler = {
      name: 'Dịch vụ karaoke',
      unit: 'Lần',
      quantity: 1,
      unitPrice: 559091,
      vatRate: 10,
    };
    it('are for paid bills only', async () => {
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'HĐĐT-1', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      const order = (
        await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201)
      ).body as Json;
      await as('tn1_cs1')
        .post('/einvoices', { orderId: order.id, amount: 1000, lines: [] })
        .expect(400);
      const products = (await as('tn1_cs1').get('/products').expect(200))
        .body as Json[];
      await as('tn1_cs1')
        .patch(`/orders/${order.id as number}`, {
          items: [{ productId: products[0].id, quantity: 2 }],
        })
        .expect(200);
      await as('tn1_cs1')
        .post(`/orders/${order.id as number}/checkout`, {
          paymentMethod: 'CASH',
        })
        .expect(200);
      orderId = order.id as number;
    });

    it('are refused for a voided bill', async () => {
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'HĐĐT-2', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      const order = (
        await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201)
      ).body as Json;
      const id = order.id as number;
      await as('tn1_cs1')
        .post(`/orders/${id}/checkout`, { paymentMethod: 'CASH' })
        .expect(200);
      await as('admin')
        .post(`/orders/${id}/void`, { reason: 'Nhập nhầm phòng' })
        .expect(200);
      const res = await as('tn1_cs1')
        .post('/einvoices', { orderId: id, amount: 1000, lines: [] })
        .expect(400);
      expect((res.body as Json).message).toMatch(/đã thanh toán và chưa hủy/);
    });

    it('are created and edited by the sales roles of the branch', async () => {
      const created = (
        await as('tn1_cs1')
          .post('/einvoices', {
            orderId,
            amount: 1000000,
            ...buyer,
            lines: [beer],
          })
          .expect(201)
      ).body as Json;
      expect(created).toMatchObject({
        status: 'DRAFT',
        amount: '1000000',
        vatAmount: '35000',
        buyerName: 'CÔNG TY HOÀNG GIA',
        draft: {
          buyerAddress: 'Số 26, phố Nhổn',
          buyerEmail: null,
          lines: [beer],
        },
      });
      draftId = created.id as number;
      const edited = (
        await as('ql1_cs1')
          .patch(`/einvoices/${draftId}`, {
            amount: 1000000,
            ...buyer,
            lines: [beer, filler],
          })
          .expect(200)
      ).body as Json;
      expect(edited.vatAmount).toBe('90909');

      await as('hdqt_hddt')
        .post('/einvoices', { orderId, amount: 1, lines: [] })
        .expect(403);
      await as('ql1_cs2').get(`/einvoices/bill/${orderId}`).expect(403);
      await as('ql1_cs2')
        .patch(`/einvoices/${draftId}`, { amount: 1, lines: [] })
        .expect(403);
      await as('tn1_cs1')
        .post('/einvoices', {
          orderId,
          amount: 1,
          lines: [{ ...beer, vatRate: 7 }],
        })
        .expect(400);
      await as('tn1_cs1')
        .post('/einvoices', {
          orderId,
          amount: 1,
          buyerTaxCode: '123',
          lines: [],
        })
        .expect(400);
    });

    it('shows a bill with its invoices and how much is split', async () => {
      const detail = (
        await as('tn1_cs1').get(`/einvoices/bill/${orderId}`).expect(200)
      ).body as Json;
      expect(detail.allocated).toBe(1000000);
      expect((detail.einvoices as Json[]).map((e) => e.id)).toEqual([draftId]);
      expect((detail.order as Json).items).toHaveLength(1);
      const res = await as('tn1_cs1').get('/einvoices/bills').expect(200);
      expect(res.headers['x-total-count']).toBeDefined();
      expect(
        (res.body as Json[]).find((b) => b.orderId === orderId),
      ).toMatchObject({
        allocated: 1000000,
        einvoiceCount: 1,
      });
    });

    it('lists drafts whatever their day, and counts them', async () => {
      const drafts = (
        await as('hdqt_hddt')
          .get('/einvoices?branch=cs1&status=DRAFT')
          .expect(200)
      ).body as Json[];
      expect(drafts.map((d) => d.id)).toContain(draftId);
      const old = (
        await as('tn1_cs1')
          .get('/einvoices?from=2020-01-01&to=2020-01-02')
          .expect(200)
      ).body as Json[];
      expect(old).toHaveLength(0);
      const summary = (
        await as('tn1_cs1')
          .get('/einvoices/summary?from=2020-01-01&to=2020-01-02')
          .expect(200)
      ).body as Json;
      expect(summary).toMatchObject({
        draftCount: 1,
        errorCount: 0,
        uncertainCount: 0,
        issuedCount: 0,
        issuedAmount: 0,
      });
    });

    it('refuses a day that does not exist', async () => {
      await as('tn1_cs1').get('/einvoices?from=2026-13-01').expect(400);
      await as('tn1_cs1').get('/einvoices/summary?to=2026-02-30').expect(400);
      await as('tn1_cs1')
        .get('/einvoices/bills?businessDate=2026-02-30')
        .expect(400);
      await as('tn1_cs1')
        .get('/einvoices?from=2026-05-02&to=2026-05-01')
        .expect(400);
    });

    it('deletes a draft', async () => {
      const extra = (
        await as('tn1_cs1')
          .post('/einvoices', { orderId, amount: 5000, lines: [] })
          .expect(201)
      ).body as Json;
      await as('tn1_cs1')
        .delete(`/einvoices/${extra.id as number}`)
        .expect(200);
      await as('tn1_cs1')
        .delete(`/einvoices/${extra.id as number}`)
        .expect(404);
    });

    it('tells the bill sheet how many e-invoices a bill has', async () => {
      const order = (await as('admin').get(`/orders/${orderId}`).expect(200))
        .body as Json;
      expect(order._count).toEqual({ einvoices: 1 });
      expect(order.einvoices).toEqual([]);
      // An open session skips the lookup: the room page polls this route.
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'HĐĐT-3', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      const session = (
        await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201)
      ).body as Json;
      const open = (
        await as('admin')
          .get(`/orders/${session.id as number}`)
          .expect(200)
      ).body as Json;
      expect(open._count).toEqual({ einvoices: 0 });
      expect(open.einvoices).toEqual([]);
    });
  });
});
