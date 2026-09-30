// test/einvoice.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EinvoiceConfigService } from '../src/einvoice/einvoice-config.service';
import {
  EinvoicesService,
  STALE_SENDING_MS,
} from '../src/einvoice/einvoices.service';
import { PrismaService } from '../src/prisma/prisma.service';
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

    it('store only what an issue can read back', async () => {
      const res = await as('tn1_cs1')
        .post('/einvoices', {
          orderId,
          amount: 1000,
          lines: [{ ...beer, name: '  Bia  ', vatAmount: null }],
        })
        .expect(201);
      const created = res.body as Json;
      const line = (created.draft as { lines: Json[] }).lines[0];
      expect(line.name).toBe('Bia');
      expect(line).not.toHaveProperty('vatAmount');
      const blank = await as('tn1_cs1')
        .patch(`/einvoices/${created.id as number}`, {
          amount: 1000,
          lines: [beer, { ...beer, name: '   ' }],
        })
        .expect(400);
      expect((blank.body as Json).message).toBe(
        'Dòng 2: tên hàng không được để trống',
      );
      const order = (await as('admin').get(`/orders/${orderId}`).expect(200))
        .body as Json;
      const prefix = (order.billNumber as string).slice(0, 6);
      const found = (
        await as('tn1_cs1')
          .get(`/einvoices?status=DRAFT&billNumber=${prefix}`)
          .expect(200)
      ).body as Json[];
      expect(found.map((e) => e.id)).toContain(created.id);
      await as('tn1_cs1')
        .delete(`/einvoices/${created.id as number}`)
        .expect(200);
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
  describe('issuing', () => {
    const today = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const buyer = {
      buyerTaxCode: '0107068321',
      buyerName: 'CÔNG TY HOÀNG GIA',
      buyerAddress: null,
      buyerEmail: null,
    };
    const filler = (unitPrice: number) => ({
      name: 'Dịch vụ karaoke',
      unit: 'Lần',
      quantity: 1,
      unitPrice,
      vatRate: 10,
    });
    const newDraft = async (unitPrice = 909091) =>
      (
        (
          await as('tn1_cs1')
            .post('/einvoices', {
              orderId,
              amount: 1000000,
              ...buyer,
              lines: [filler(unitPrice)],
            })
            .expect(201)
        ).body as Json
      ).id as number;
    const issue = (id: number, body: Json = { invoiceDate: today() }) =>
      as('admin').post(`/einvoices/${id}/issue`, body);
    let laterId: number;

    it('is for the chain manager only', async () => {
      for (const name of ['tn1_cs1', 'ql1_cs1', 'hdqt_hddt']) {
        await as(name)
          .post(`/einvoices/${draftId}/issue`, { invoiceDate: today() })
          .expect(403);
      }
    });

    it('refuses a draft whose lines do not add up', async () => {
      const id = await newDraft(900000);
      expect(((await issue(id).expect(400)).body as Json).message).toBe(
        'Còn thiếu 10.000 đồng',
      );
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('issues: Minvoice number kept, details deleted', async () => {
      const body = (await issue(draftId).expect(200)).body as Json;
      expect(body).toMatchObject({
        status: 'ISSUED',
        invoiceNumber: 1001,
        symbolCode: fake.symbolCode(),
        sellerTaxCode: TAX_CODE,
        invoiceDate: today(),
        draft: null,
        lastError: null,
      });
      noSecrets(body);
      expect(fake.invoices.at(-1)).toMatchObject({
        paymentMethod: 'TM/CK',
        invoiceSerial: fake.symbolCode(),
        registerInvoiceId: 'range-1',
        currencyId: 'vnd-id',
        buyerTaxCode: '0107068321',
        buyerAddress: 'Số 26, phố Nhổn',
        totalAmount: 1000000,
        totalAmountToWord: 'Một triệu đồng',
      });
      await issue(draftId).expect(409);
      await as('tn1_cs1')
        .patch(`/einvoices/${draftId}`, { amount: 1, lines: [] })
        .expect(409);
      const config = (
        await as('admin').get('/einvoice/config?branch=cs1').expect(200)
      ).body as Json;
      expect(config).toMatchObject({
        minInvoiceDate: today(),
        latestInvoiceNumber: 1001,
      });
    });

    it('keeps invoice dates in order and in the year of the symbol', async () => {
      laterId = await newDraft();
      expect(
        (
          (await issue(laterId, { invoiceDate: '2020-01-01' }).expect(400))
            .body as Json
        ).message,
      ).toMatch(/phải từ/);
      const nextYear = `${new Date().getFullYear() + 1}-01-01`;
      expect(
        (
          (await issue(laterId, { invoiceDate: nextYear }).expect(400))
            .body as Json
        ).message,
      ).toMatch(/xác nhận/);
      expect(
        (
          (
            await issue(laterId, {
              invoiceDate: nextYear,
              confirmFutureDate: true,
            }).expect(400)
          ).body as Json
        ).message,
      ).toMatch(/năm/);
      await issue(laterId, { invoiceDate: '2026-02-30' }).expect(400);
    });

    it('logs in again and takes the new range when Minvoice refuses', async () => {
      fake.expireSessions();
      fake.rangeId = 'range-2';
      const logins = fake.logins;
      const posts = fake.posts;
      const body = (await issue(laterId).expect(200)).body as Json;
      expect(body.status).toBe('ISSUED');
      expect(fake.posts).toBe(posts + 2);
      expect(fake.logins).toBe(logins + 1);
      expect(fake.invoices.at(-1)!.registerInvoiceId).toBe('range-2');
      expect(
        (
          (await as('admin').get('/einvoice/config?branch=cs1').expect(200))
            .body as Json
        ).registerInvoiceId,
      ).toBe('range-2');
    });

    it('gives up after a second refusal and keeps the draft', async () => {
      const id = await newDraft();
      fake.behaviours = ['reject', 'reject'];
      const posts = fake.posts;
      const body = (await issue(id).expect(200)).body as Json;
      expect(body).toMatchObject({
        status: 'DRAFT',
        symbolCode: null,
        invoiceDate: null,
      });
      expect(body.lastError).toMatch(/ModelState/);
      expect((body.draft as Json).lines).toHaveLength(1);
      expect(fake.posts).toBe(posts + 2);
      const errors = (
        await as('tn1_cs1').get('/einvoices?status=ERROR').expect(200)
      ).body as Json[];
      expect(errors.map((e) => e.id)).toContain(id);
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('does not resend a date Minvoice refuses', async () => {
      const id = await newDraft();
      fake.behaviours = ['date-order'];
      const posts = fake.posts;
      const body = (await issue(id).expect(200)).body as Json;
      expect(body.status).toBe('DRAFT');
      expect(body.lastError).toMatch(/^Minvoice từ chối ngày hóa đơn/);
      expect(body.lastError).toContain('quy luật tăng dần');
      expect(fake.posts).toBe(posts + 1);
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('marks a send without an answer as uncertain, then resolves it', async () => {
      const id = await newDraft();
      fake.behaviours = ['drop'];
      const posts = fake.posts;
      expect(((await issue(id).expect(200)).body as Json).status).toBe(
        'UNCERTAIN',
      );
      expect(fake.posts).toBe(posts + 1);
      // Nothing carries its reference on Minvoice, but that answer is not
      // trusted yet (MARKER_SEARCH_CONFIRMED): it stays uncertain, unsent.
      const again = (await issue(id).expect(200)).body as Json;
      expect(again).toMatchObject({
        status: 'UNCERTAIN',
        lastError: `Chưa tìm thấy hóa đơn K502-${id} trên Minvoice; kiểm tra trên Minvoice rồi đối chiếu bằng tay`,
        symbolCode: fake.symbolCode(),
        invoiceDate: today(),
      });
      expect(fake.posts).toBe(posts + 1);
      await as('tn1_cs1')
        .post(`/einvoices/${id}/resolve`, { found: false })
        .expect(403);
      const back = (
        await as('admin')
          .post(`/einvoices/${id}/resolve`, { found: false })
          .expect(200)
      ).body as Json;
      expect(back).toMatchObject({
        status: 'DRAFT',
        symbolCode: null,
        invoiceDate: null,
      });
      fake.behaviours = ['drop'];
      await issue(id).expect(200);
      const found = (
        await as('admin')
          .post(`/einvoices/${id}/resolve`, {
            found: true,
            invoiceNumber: 1500,
          })
          .expect(200)
      ).body as Json;
      expect(found).toMatchObject({
        status: 'ISSUED',
        invoiceNumber: 1500,
        draft: null,
        invoiceDate: today(),
      });
    });

    // A lost answer: the invoice exists on Minvoice under K502-<id>.
    const lostAnswer = async () => {
      const id = await newDraft();
      fake.behaviours = ['drop-after-create'];
      expect(((await issue(id).expect(200)).body as Json).status).toBe(
        'UNCERTAIN',
      );
      const created = fake.invoices.at(-1)!;
      expect(created.orderNumber).toBe(`K502-${id}`);
      return { id, created };
    };
    const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

    it('finds an invoice created by a send whose answer was lost', async () => {
      const service = app.get(EinvoicesService);
      const trusted = service.markerSearchConfirmed;
      try {
        const { id, created } = await lostAnswer();
        const posts = fake.posts;
        // The fake's list, like the real one, does not show orderNumber: its
        // single row counts once the filter is trusted.
        service.markerSearchConfirmed = true;
        // A stale stored session: the search logs in again by itself.
        fake.expireSessions();
        const logins = fake.logins;
        const body = (await issue(id).expect(200)).body as Json;
        expect(body).toMatchObject({
          status: 'ISSUED',
          invoiceNumber: created.invoiceNumber,
          minvoiceId: created.id,
          symbolCode: fake.symbolCode(),
          sellerTaxCode: TAX_CODE,
          invoiceDate: today(),
          draft: null,
          lastError: null,
        });
        expect(fake.posts).toBe(posts);
        expect(fake.logins).toBe(logins + 1);
      } finally {
        service.markerSearchConfirmed = trusted;
        fake.behaviours = [];
      }
    });

    it('only points at the likely invoice while the filter is unconfirmed', async () => {
      try {
        const { id, created } = await lostAnswer();
        const posts = fake.posts;
        const body = (await issue(id).expect(200)).body as Json;
        expect(body.status).toBe('UNCERTAIN');
        expect(body.lastError).toBe(
          `Có thể là hóa đơn số ${created.invoiceNumber as number} ngày ${dmy(today())} trên Minvoice (chưa chắc Minvoice lọc theo mã K502-${id}); kiểm tra trên Minvoice rồi đối chiếu bằng tay`,
        );
        expect((body.draft as Json).lines).toHaveLength(1);
        expect(fake.posts).toBe(posts);
        // The manual check confirms it.
        const found = (
          await as('admin')
            .post(`/einvoices/${id}/resolve`, {
              found: true,
              invoiceNumber: created.invoiceNumber,
            })
            .expect(200)
        ).body as Json;
        expect(found).toMatchObject({
          status: 'ISSUED',
          invoiceNumber: created.invoiceNumber,
        });
      } finally {
        fake.behaviours = [];
      }
    });

    it('stays uncertain when the number found is already on one of ours', async () => {
      const service = app.get(EinvoicesService);
      const trusted = service.markerSearchConfirmed;
      try {
        const { id, created } = await lostAnswer();
        // An issued invoice whose number was fixed by hand to that one.
        await as('admin')
          .patch(`/einvoices/${draftId}/number`, {
            invoiceNumber: created.invoiceNumber,
          })
          .expect(200);
        service.markerSearchConfirmed = true;
        const posts = fake.posts;
        const body = (await issue(id).expect(200)).body as Json;
        expect(body).toMatchObject({
          status: 'UNCERTAIN',
          invoiceNumber: null,
          lastError: `Số ${created.invoiceNumber as number} mà Minvoice trả về cho K502-${id} đã có ở hóa đơn #${draftId}; kiểm tra trên Minvoice rồi đối chiếu bằng tay`,
        });
        expect((body.draft as Json).lines).toHaveLength(1);
        expect(fake.posts).toBe(posts);
        await as('admin')
          .post(`/einvoices/${id}/resolve`, { found: false })
          .expect(200);
        await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
      } finally {
        service.markerSearchConfirmed = trusted;
        fake.behaviours = [];
      }
    });

    it('sends again once a search that finds nothing is trusted', async () => {
      const id = await newDraft();
      const service = app.get(EinvoicesService);
      const trusted = service.markerSearchConfirmed;
      try {
        fake.behaviours = ['drop'];
        expect(((await issue(id).expect(200)).body as Json).status).toBe(
          'UNCERTAIN',
        );
        const posts = fake.posts;
        service.markerSearchConfirmed = true;
        // Minvoice may still be saving a send lost moments ago: not resent.
        const prisma = app.get(PrismaService);
        const lostAt = async () =>
          (
            await prisma.einvoice.findUniqueOrThrow({
              where: { id },
              select: { sendingAt: true },
            })
          ).sendingAt;
        const sentAt = await lostAt();
        const early = (await issue(id).expect(200)).body as Json;
        expect(early.status).toBe('UNCERTAIN');
        expect(early.lastError).toMatch(
          new RegExp(
            `^Chưa tìm thấy hóa đơn K502-${id} trên Minvoice nhưng lần gửi trước còn quá mới; kiểm tra lại sau vài phút`,
          ),
        );
        expect(fake.posts).toBe(posts);
        // Checking again keeps the time of the lost send.
        expect(await lostAt()).toEqual(sentAt);
        // Well past it, an empty list is trusted: sent once more.
        await prisma.einvoice.update({
          where: { id },
          data: { sendingAt: new Date(Date.now() - STALE_SENDING_MS - 1000) },
        });
        const body = (await issue(id).expect(200)).body as Json;
        const created = fake.invoices.at(-1)!;
        expect(created.orderNumber).toBe(`K502-${id}`);
        expect(body).toMatchObject({
          status: 'ISSUED',
          invoiceNumber: created.invoiceNumber,
          invoiceDate: today(),
        });
        expect(fake.posts).toBe(posts + 1);
      } finally {
        service.markerSearchConfirmed = trusted;
        fake.behaviours = [];
      }
    });

    it('stays uncertain when Minvoice lists other invoices too', async () => {
      const id = await newDraft();
      const service = app.get(EinvoicesService);
      const trusted = service.markerSearchConfirmed;
      try {
        fake.behaviours = ['drop'];
        expect(((await issue(id).expect(200)).body as Json).status).toBe(
          'UNCERTAIN',
        );
        const posts = fake.posts;
        // A list that ignores the reference: never taken for a match, even
        // with a trusted search.
        fake.ignoreMarkerFilter = true;
        service.markerSearchConfirmed = true;
        expect(
          fake.invoices.filter((i) => i.invoiceSerial === fake.symbolCode())
            .length,
        ).toBeGreaterThanOrEqual(2);
        const body = (await issue(id).expect(200)).body as Json;
        expect(body.status).toBe('UNCERTAIN');
        expect(body.lastError).toBe(
          `Minvoice trả về kết quả không rõ khi tìm hóa đơn K502-${id}; kiểm tra trên Minvoice rồi đối chiếu bằng tay`,
        );
        expect(fake.posts).toBe(posts);
      } finally {
        fake.ignoreMarkerFilter = false;
        service.markerSearchConfirmed = trusted;
        fake.behaviours = [];
      }
      await as('admin')
        .post(`/einvoices/${id}/resolve`, { found: false })
        .expect(200);
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('resolves only an uncertain invoice', async () => {
      for (const body of [
        { found: true, invoiceNumber: 1600 },
        { found: false },
      ]) {
        const res = await as('admin')
          .post(`/einvoices/${draftId}/resolve`, body)
          .expect(409);
        expect((res.body as Json).message).toBe(
          'Hóa đơn không ở trạng thái "Không rõ"',
        );
      }
    });

    it('lets one of two simultaneous issues win', async () => {
      const id = await newDraft();
      fake.delayMs = 300;
      const posts = fake.posts;
      const [a, b] = await Promise.all([issue(id), issue(id)]);
      fake.delayMs = 0;
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(fake.posts).toBe(posts + 1);
    });

    it('does not send a draft saved after it was checked', async () => {
      const id = await newDraft();
      const config = app.get(EinvoiceConfigService);
      const ready = config.readyForIssue.bind(config);
      // A save lands between the checks and the lock.
      jest
        .spyOn(config, 'readyForIssue')
        .mockImplementationOnce(async (branchId: number) => {
          await app
            .get(PrismaService)
            .einvoice.update({ where: { id }, data: { amount: 2000000 } });
          return ready(branchId);
        });
      const posts = fake.posts;
      const res = await issue(id).expect(409);
      expect((res.body as Json).message).toBe(
        'Hóa đơn vừa được sửa, kiểm tra lại rồi xuất',
      );
      expect(fake.posts).toBe(posts);
      const row = (await as('admin').get(`/einvoices/${id}`).expect(200))
        .body as Json;
      expect(row).toMatchObject({ status: 'DRAFT', amount: '2000000' });
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('edits the number of an issued invoice, never to a taken one', async () => {
      await as('tn1_cs1')
        .patch(`/einvoices/${draftId}/number`, { invoiceNumber: 2001 })
        .expect(403);
      await as('admin')
        .patch(`/einvoices/${draftId}/number`, { invoiceNumber: 1500 })
        .expect(409);
      const edited = (
        await as('admin')
          .patch(`/einvoices/${draftId}/number`, { invoiceNumber: 2001 })
          .expect(200)
      ).body as Json;
      expect(edited.invoiceNumber).toBe(2001);
      expect(edited.numberEditedAt).not.toBeNull();
    });

    it('never sweeps a send still running, however old it looks', async () => {
      const id = await newDraft();
      const prisma = app.get(PrismaService);
      fake.delayMs = 500;
      const issuing = issue(id).then((res) => res);
      let status: string | undefined;
      for (let i = 0; i < 100 && status !== 'SENDING'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        status = (
          await prisma.einvoice.findUniqueOrThrow({
            where: { id },
            select: { status: true },
          })
        ).status;
      }
      expect(status).toBe('SENDING');
      await prisma.einvoice.update({
        where: { id },
        data: { sendingAt: new Date(Date.now() - STALE_SENDING_MS - 1000) },
      });
      expect(
        ((await as('admin').get(`/einvoices/${id}`).expect(200)).body as Json)
          .status,
      ).toBe('SENDING');
      const detail = (
        await as('tn1_cs1').get(`/einvoices/bill/${orderId}`).expect(200)
      ).body as Json;
      expect(
        (detail.einvoices as Json[]).find((e) => e.id === id),
      ).toMatchObject({ status: 'SENDING' });
      const res = await issuing;
      fake.delayMs = 0;
      expect(res.status).toBe(200);
      expect((res.body as Json).status).toBe('ISSUED');
    });

    it('turns a send stuck for minutes into uncertain when it is read', async () => {
      const id = await newDraft();
      const prisma = app.get(PrismaService);
      const stuck = () =>
        prisma.einvoice.update({
          where: { id },
          data: {
            status: 'SENDING',
            sendingAt: new Date(Date.now() - STALE_SENDING_MS - 1000),
          },
        });
      // A send still within its time is left alone.
      await prisma.einvoice.update({
        where: { id },
        data: { status: 'SENDING', sendingAt: new Date() },
      });
      expect(
        ((await as('admin').get(`/einvoices/${id}`).expect(200)).body as Json)
          .status,
      ).toBe('SENDING');
      await stuck();
      const row = (await as('tn1_cs1').get(`/einvoices/${id}`).expect(200))
        .body as Json;
      expect(row).toMatchObject({
        status: 'UNCERTAIN',
        lastError: 'Lần gửi bị cắt ngang, hãy đối chiếu trên Minvoice',
      });
      await as('admin')
        .post(`/einvoices/${id}/resolve`, { found: false })
        .expect(200);
      // The bill panel sweeps its rows the same way.
      await stuck();
      const detail = (
        await as('tn1_cs1').get(`/einvoices/bill/${orderId}`).expect(200)
      ).body as Json;
      expect(
        (detail.einvoices as Json[]).find((e) => e.id === id),
      ).toMatchObject({ status: 'UNCERTAIN' });
      const back = (
        await as('admin')
          .post(`/einvoices/${id}/resolve`, { found: false })
          .expect(200)
      ).body as Json;
      expect(back.status).toBe('DRAFT');
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('turns a send cut off by a restart into uncertain', async () => {
      const id = await newDraft();
      await app
        .get(PrismaService)
        .einvoice.update({ where: { id }, data: { status: 'SENDING' } });
      await app.get(EinvoicesService).onApplicationBootstrap();
      expect(
        ((await as('admin').get(`/einvoices/${id}`).expect(200)).body as Json)
          .status,
      ).toBe('UNCERTAIN');
      // It never went through a lock: no symbol or date to look up by, so
      // nothing is searched or sent.
      const posts = fake.posts;
      const again = (await issue(id).expect(200)).body as Json;
      expect(again.status).toBe('UNCERTAIN');
      expect(again.lastError).toMatch(/^Không rõ ký hiệu hoặc ngày/);
      expect(fake.posts).toBe(posts);
    });

    it('is wiped with the data of its branch', async () => {
      const res = await as('hdqt_hddt')
        .post('/admin/purge', {
          scope: 'branch',
          branch: 'cs1',
          password: '12345678',
        })
        .expect(200);
      expect(
        ((res.body as Json).deleted as Record<string, number>).einvoices,
      ).toBeGreaterThan(0);
    });
  });
});
