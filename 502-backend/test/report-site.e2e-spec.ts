// test/report-site.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { businessDateOf, toDateString } from '../src/common/dates';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeMinvoice } from './fake-minvoice';

// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt) against a fake Minvoice
// (test/fake-minvoice.ts). The `it`s build on each other: run the whole file.

type Json = Record<string, unknown>;
const TAX_CODE = '0107811836';
const DAY_MS = 86_400_000;

describe('Report site (e2e)', () => {
  let app: INestApplication<App>;
  const fake = new FakeMinvoice();
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let cs1Id: number;

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
  const login = (username: string, site?: 'report') =>
    api()
      .post('/api/auth/login')
      .send({ username, password: '12345678', ...(site ? { site } : {}) });
  const signIn = async (username: string) => {
    const res = await login(username).expect(200);
    const body = res.body as Json;
    tokens[username] = body.access_token as string;
    ids[username] = (body.user as Json).id as number;
  };
  // A bill of cs1 paid now, in a room of that name; as GET /orders/:id.
  const paidBill = async (roomName: string) => {
    const room = (
      await as('ql1_cs1')
        .post('/rooms', { name: roomName, pricePerHour: 100000 })
        .expect(201)
    ).body as Json;
    const order = (
      await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201)
    ).body as Json;
    const products = (await as('tn1_cs1').get('/products').expect(200))
      .body as Json[];
    await as('tn1_cs1')
      .patch(`/orders/${order.id as number}`, {
        items: [{ productId: products[0].id, quantity: 2 }],
      })
      .expect(200);
    await as('tn1_cs1')
      .post(`/orders/${order.id as number}/checkout`, { paymentMethod: 'CASH' })
      .expect(200);
    return (
      await as('admin')
        .get(`/orders/${order.id as number}`)
        .expect(200)
    ).body as Json;
  };
  // DDMM + room (4) + sequence.
  const seqOf = (billNumber: string) => Number(billNumber.slice(8));
  const today = () => businessDateOf(new Date());
  const daysAgo = (n: number) =>
    toDateString(new Date(Date.now() - n * DAY_MS));
  const filler = (unitPrice: number) => ({
    name: 'Dịch vụ karaoke',
    unit: 'Lần',
    quantity: 1,
    unitPrice,
    vatRate: 10,
  });
  const issueToday = (einvoiceId: number) =>
    as('admin')
      .post(`/einvoices/${einvoiceId}/issue`, {
        invoiceDate: toDateString(new Date()),
      })
      .expect(200);

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
    // On 127.0.0.1, where supertest calls: its own listen(0) binds [::] and
    // can get a port another program holds on 127.0.0.1, which then answers.
    await app.listen(0, '127.0.0.1');
    for (const name of ['admin', 'ql1_cs1', 'tn1_cs1', 'ql1_cs2'])
      await signIn(name);
    const branches = (await as('admin').get('/branches').expect(200))
      .body as Json[];
    const branchId = (code: string) =>
      branches.find((b) => b.code === code)!.id as number;
    cs1Id = branchId('cs1');
    // The report site's own accounts, each given "Vào trang báo cáo".
    const accounts: [string, string, number | null][] = [
      ['qlbc_cs1', 'BRANCH_MANAGER', branchId('cs1')],
      ['qlbc_cs2', 'BRANCH_MANAGER', branchId('cs2')],
      ['hdqt_bc', 'BOARD', null],
    ];
    for (const [username, role, branch] of accounts) {
      await as('admin')
        .post('/users', {
          username,
          fullName: username,
          role,
          branchId: branch,
          password: '12345678',
          reportAccess: true,
        })
        .expect(201);
      await signIn(username);
    }
    await as('admin')
      .patch(`/branches/${cs1Id}`, { taxCode: TAX_CODE })
      .expect(200);
    await as('admin')
      .post('/einvoice/config/login?branch=cs1', {
        username: 'admin',
        password: fake.password,
      })
      .expect(200);
    const { symbols } = (
      await as('admin').get('/einvoice/config/symbols?branch=cs1').expect(200)
    ).body as { symbols: Json[] };
    await as('admin')
      .put('/einvoice/config/symbol?branch=cs1', {
        registerInvoiceId: symbols[0].registerInvoiceId,
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
    delete process.env.MINVOICE_URL_TEMPLATE;
  });

  describe('access', () => {
    it('lets in the chain manager and the accounts given the right', async () => {
      for (const name of ['admin', 'qlbc_cs1', 'hdqt_bc'])
        await login(name, 'report').expect(200);
    });

    it('turns away the cashier and a branch manager without the right', async () => {
      for (const name of ['tn1_cs1', 'ql1_cs1']) {
        const res = await login(name, 'report').expect(403);
        expect((res.body as Json).message).toBe(
          'Tài khoản này không được vào trang báo cáo',
        );
        // No session is made before the check (spec §3.2): no refresh
        // cookie, no access token.
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.body).not.toHaveProperty('access_token');
      }
      // The main site is unchanged for them.
      await login('tn1_cs1').expect(200);
    });

    it('tells the app who has the right', async () => {
      expect(
        (await as('qlbc_cs1').get('/auth/me').expect(200)).body,
      ).toMatchObject({ reportAccess: true });
      expect(
        (await as('ql1_cs1').get('/auth/me').expect(200)).body,
      ).toMatchObject({ reportAccess: false });
    });

    it('is granted by the chain manager only, to branch managers and HĐQT only', async () => {
      const refused = await as('admin')
        .patch(`/users/${ids.tn1_cs1}`, { reportAccess: true })
        .expect(400);
      expect((refused.body as Json).message).toBe(
        'Chỉ tài khoản quản lý cơ sở hoặc HĐQT được vào trang báo cáo',
      );
      const denied = await as('ql1_cs1')
        .patch(`/users/${ids.tn1_cs1}`, { reportAccess: false })
        .expect(403);
      expect((denied.body as Json).message).toBe(
        'Chỉ quản lý hệ thống được cấp quyền vào trang báo cáo',
      );
      await as('admin')
        .patch(`/users/${ids.ql1_cs1}`, { reportAccess: true })
        .expect(200);
      await login('ql1_cs1', 'report').expect(200);
      await as('admin')
        .patch(`/users/${ids.ql1_cs1}`, { reportAccess: false })
        .expect(200);
      await login('ql1_cs1', 'report').expect(403);
    });

    it('goes when the account moves to another role', async () => {
      const created = (
        await as('admin')
          .post('/users', {
            username: 'qlbc_tam',
            fullName: 'QL tạm',
            role: 'BRANCH_MANAGER',
            branchId: cs1Id,
            password: '12345678',
            reportAccess: true,
          })
          .expect(201)
      ).body as Json;
      const moved = (
        await as('admin')
          .patch(`/users/${created.id as number}`, { role: 'CASHIER' })
          .expect(200)
      ).body as Json;
      expect(moved.reportAccess).toBe(false);
      await login('qlbc_tam', 'report').expect(403);
    });
  });

  describe('e-invoices of a bill thêm tay', () => {
    let manualBillId: number;
    let draftId: number;

    it('are made only on the report site, in the branch of the bill', async () => {
      // Task 6 adds the route that makes bills thêm tay; one is written here,
      // on a day far in the past so no later test's day can meet it.
      manualBillId = (
        await app.get(PrismaService).manualBill.create({
          data: {
            branchId: cs1Id,
            businessDate: new Date('2025-01-15T00:00:00Z'),
            billSeq: 900,
            billNumber: '15010000900',
          },
          select: { id: true },
        })
      ).id;
      const body = { manualBillId, amount: 110000, lines: [] };
      for (const name of ['tn1_cs1', 'ql1_cs1']) {
        const res = await as(name).post('/einvoices', body).expect(403);
        expect((res.body as Json).message).toBe(
          'Hóa đơn của bill thêm tay chỉ mở được ở trang báo cáo',
        );
      }
      await as('qlbc_cs2').post('/einvoices', body).expect(403);
      await as('hdqt_bc').post('/einvoices', body).expect(403);
      const created = (
        await as('qlbc_cs1').post('/einvoices', body).expect(201)
      ).body as Json;
      expect(created).toMatchObject({
        orderId: null,
        manualBillId,
        status: 'DRAFT',
        invoiceDate: '2025-01-15',
        vatAmount: '10000',
      });
      draftId = created.id as number;
    });

    it('are out of reach of the main site’s accounts', async () => {
      for (const name of ['tn1_cs1', 'ql1_cs1'])
        await as(name).get(`/einvoices/${draftId}`).expect(403);
      await as('tn1_cs1')
        .patch(`/einvoices/${draftId}`, { amount: 1, lines: [] })
        .expect(403);
      await as('tn1_cs1').delete(`/einvoices/${draftId}`).expect(403);
      await as('qlbc_cs1').get(`/einvoices/${draftId}`).expect(200);
      await as('hdqt_bc').get(`/einvoices/${draftId}`).expect(200);
    });

    it('are not counted on the main site', async () => {
      const main = (await as('tn1_cs1').get('/einvoices/summary').expect(200))
        .body as Json;
      expect(main.draftCount).toBe(0);
    });
  });

  describe('bills thêm tay', () => {
    let roomId: number;
    const add = (name: string, body: Json) =>
      as(name).post('/report-site/manual-bills?branch=cs1', body);

    it('take the next number of their day, shared with the paid bills', async () => {
      const first = await paidBill('BC 401');
      roomId = first.roomId as number;
      const added = (
        await add('qlbc_cs1', {
          businessDate: today(),
          roomId,
          amount: 110000,
        }).expect(201)
      ).body as Json;
      const second = await paidBill('BC 402');
      expect(seqOf(added.billNumber as string)).toBe(
        seqOf(first.billNumber as string) + 1,
      );
      expect(seqOf(second.billNumber as string)).toBe(
        seqOf(added.billNumber as string) + 1,
      );
      expect((added.billNumber as string).slice(4, 8)).toBe('4010');
      const detail = (
        await as('qlbc_cs1')
          .get(`/report-site/manual-bills/${added.id as number}`)
          .expect(200)
      ).body as { bill: Json; einvoices: Json[]; allocated: number };
      expect(detail.bill).toMatchObject({
        billNumber: added.billNumber,
        businessDate: today(),
        cancelledAt: null,
        room: { name: 'BC 401' },
      });
      expect(detail.einvoices).toHaveLength(1);
      expect(detail.einvoices[0]).toMatchObject({
        id: added.einvoiceId,
        amount: '110000',
        status: 'DRAFT',
        invoiceDate: today(),
      });
      expect(detail.allocated).toBe(110000);
    });

    it('take a past day, never a future one, and a room of their branch', async () => {
      const past = daysAgo(40);
      const added = (
        await add('qlbc_cs1', {
          businessDate: past,
          roomId,
          amount: 1000,
        }).expect(201)
      ).body as Json;
      expect((added.billNumber as string).slice(0, 4)).toBe(
        `${past.slice(8, 10)}${past.slice(5, 7)}`,
      );
      const future = toDateString(new Date(Date.now() + 2 * DAY_MS));
      const res = await add('qlbc_cs1', {
        businessDate: future,
        roomId,
        amount: 1000,
      }).expect(400);
      expect((res.body as Json).message).toBe(
        'Không thêm bill cho ngày sau hôm nay',
      );
      const cs2Room = (
        await as('ql1_cs2')
          .post('/rooms', { name: 'BC2 101', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      await add('qlbc_cs1', {
        businessDate: past,
        roomId: cs2Room.id,
        amount: 1000,
      }).expect(400);
      await add('qlbc_cs1', {
        businessDate: '2026-02-30',
        roomId,
        amount: 1000,
      }).expect(400);
      // A calendar day for JavaScript, none for PostgreSQL's ::date (a 500).
      await add('qlbc_cs1', {
        businessDate: '0000-01-01',
        roomId,
        amount: 1000,
      }).expect(400);
    });

    it('are added by the report site’s managers only', async () => {
      const body = { businessDate: today(), roomId, amount: 1000 };
      for (const name of ['tn1_cs1', 'ql1_cs1', 'hdqt_bc'])
        await add(name, body).expect(403);
      await add('qlbc_cs2', body).expect(403);
      await as('tn1_cs1').get('/report-site/manual-bills/1').expect(403);
      await as('ql1_cs1').get('/report-site/manual-bills/1').expect(403);
    });

    // Spec §8: every other kind of account on every route of a bill thêm
    // tay and of its draft; HĐQT reads, never writes.
    it('are read by HĐQT and out of reach of every other account', async () => {
      const bill = (
        await add('qlbc_cs1', {
          businessDate: today(),
          roomId,
          amount: 20000,
        }).expect(201)
      ).body as Json;
      const detail = `/report-site/manual-bills/${bill.id as number}`;
      const draft = `/einvoices/${bill.einvoiceId as number}`;
      const before = (await as('qlbc_cs1').get(draft).expect(200)).body as Json;
      for (const name of ['tn1_cs1', 'ql1_cs1', 'qlbc_cs2']) {
        await as(name).get(detail).expect(403);
        await as(name).get(draft).expect(403);
        await as(name).patch(draft, { amount: 1, lines: [] }).expect(403);
        await as(name).delete(draft).expect(403);
      }
      for (const name of ['tn1_cs1', 'ql1_cs1', 'qlbc_cs2', 'hdqt_bc'])
        await as(name)
          .post(`${detail}/cancel`, { reason: 'Nhập nhầm' })
          .expect(403);
      await as('hdqt_bc').get(detail).expect(200);
      await as('hdqt_bc').get(draft).expect(200);
      await as('hdqt_bc').patch(draft, { amount: 1, lines: [] }).expect(403);
      await as('hdqt_bc').delete(draft).expect(403);
      const after = (await as('qlbc_cs1').get(detail).expect(200)).body as {
        bill: Json;
        einvoices: Json[];
      };
      expect(after.bill.cancelledAt).toBeNull();
      expect(after.einvoices).toEqual([before]);
    });

    it('are cancelled with their drafts, never with an issued invoice', async () => {
      const drafts = (
        await add('qlbc_cs1', {
          businessDate: today(),
          roomId,
          amount: 50000,
        }).expect(201)
      ).body as Json;
      const cancel = (id: number, reason: string) =>
        as('qlbc_cs1').post(`/report-site/manual-bills/${id}/cancel`, {
          reason,
        });
      await cancel(drafts.id as number, '  ').expect(400);
      await cancel(drafts.id as number, 'Nhập nhầm').expect(200);
      const cancelled = (
        await as('qlbc_cs1')
          .get(`/report-site/manual-bills/${drafts.id as number}`)
          .expect(200)
      ).body as { bill: Json; einvoices: Json[] };
      expect(cancelled.bill).toMatchObject({ cancelReason: 'Nhập nhầm' });
      expect(cancelled.einvoices).toHaveLength(0);
      await cancel(drafts.id as number, 'Lần hai').expect(409);
      await as('qlbc_cs1')
        .post('/einvoices', { manualBillId: drafts.id, amount: 1, lines: [] })
        .expect(400);

      const issued = (
        await add('qlbc_cs1', {
          businessDate: today(),
          roomId,
          amount: 110000,
        }).expect(201)
      ).body as Json;
      const einvoiceId = issued.einvoiceId as number;
      await as('qlbc_cs1')
        .patch(`/einvoices/${einvoiceId}`, {
          amount: 110000,
          lines: [filler(100000)],
        })
        .expect(200);
      await issueToday(einvoiceId);
      const res = await cancel(issued.id as number, 'Nhập nhầm').expect(409);
      expect((res.body as Json).message).toBe(
        'Bill có hóa đơn đã gửi hoặc đã xuất, không hủy được',
      );
      const kept = (
        await as('qlbc_cs1')
          .get(`/report-site/manual-bills/${issued.id as number}`)
          .expect(200)
      ).body as { bill: Json; einvoices: Json[] };
      expect(kept.bill.cancelledAt).toBeNull();
      expect(kept.einvoices[0]).toMatchObject({ status: 'ISSUED' });
    });

    it('keep the rooms they are numbered with', async () => {
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'BC 499', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      await add('qlbc_cs1', {
        businessDate: today(),
        roomId: room.id,
        amount: 1000,
      }).expect(201);
      const res = await as('ql1_cs1')
        .delete(`/rooms/${room.id as number}`)
        .expect(409);
      expect((res.body as Json).message).toMatch(/lịch sử hóa đơn/);
    });
  });

  describe('bills of the report site', () => {
    const bills = (query = '', name = 'qlbc_cs1') =>
      as(name).get(`/report-site/bills?branch=cs1${query}`);
    const summary = async () =>
      (
        await as('qlbc_cs1')
          .get('/report-site/bills/summary?branch=cs1')
          .expect(200)
      ).body as Json;

    it('lists the paid bills holding an e-invoice and the bills thêm tay of the days', async () => {
      const paid = await paidBill('BC 403');
      const before = (await bills().expect(200)).body as Json[];
      expect(before.some((b) => b.orderId === paid.id)).toBe(false);
      await as('tn1_cs1')
        .post('/einvoices', { orderId: paid.id, amount: 50000, lines: [] })
        .expect(201);
      const res = await bills().expect(200);
      const rows = res.body as Json[];
      expect(rows.find((b) => b.orderId === paid.id)).toMatchObject({
        manualBillId: null,
        total: 50000,
        allocated: 50000,
        einvoiceCount: 1,
        issuedCount: 0,
        finalAmount: Number(paid.finalAmount),
      });
      // Today's bills thêm tay, the cancelled one too.
      expect(
        rows.filter((b) => b.manualBillId !== null).length,
      ).toBeGreaterThanOrEqual(3);
      expect(rows.some((b) => b.cancelledAt !== null)).toBe(true);
      expect(Number(res.headers['x-total-count'])).toBe(rows.length);
      const seqs = rows.map((b) => seqOf(b.billNumber as string));
      expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
    });

    it('counts only the issued invoices of a bill voided since', async () => {
      const bill = await paidBill('BC 404');
      const kept = (
        await as('tn1_cs1')
          .post('/einvoices', {
            orderId: bill.id,
            amount: 110000,
            lines: [filler(100000)],
          })
          .expect(201)
      ).body as Json;
      await issueToday(kept.id as number);
      await as('tn1_cs1')
        .post('/einvoices', { orderId: bill.id, amount: 30000, lines: [] })
        .expect(201);
      const before = await summary();
      await as('admin')
        .post(`/orders/${bill.id as number}/void`, {
          reason: 'Khách đổi phòng',
        })
        .expect(200);
      const after = await summary();
      expect((before.total as number) - (after.total as number)).toBe(30000);
      const [row] = (
        await bills(`&billNumber=${bill.billNumber as string}`).expect(200)
      ).body as Json[];
      expect(row).toMatchObject({
        orderId: bill.id,
        total: 110000,
        allocated: 140000,
        einvoiceCount: 2,
        issuedCount: 1,
      });
      expect(row.cancelledAt).toEqual(expect.any(String));
    });

    it('finds bills by the status of their invoices, every day for drafts', async () => {
      const drafts = (await bills('&status=DRAFT').expect(200)).body as Json[];
      // The bill thêm tay of 2025-01-15 ("e-invoices of a bill thêm tay").
      expect(drafts.some((b) => b.billNumber === '15010000900')).toBe(true);
      const main = (await as('tn1_cs1').get('/einvoices/summary').expect(200))
        .body as Json;
      expect((await summary()).draftCount as number).toBeGreaterThan(
        main.draftCount as number,
      );
    });

    it('belongs to the report site', async () => {
      await bills('', 'tn1_cs1').expect(403);
      await bills('', 'ql1_cs1').expect(403);
      await as('ql1_cs1').get('/report-site/bills/summary').expect(403);
      await bills('', 'qlbc_cs2').expect(403);
      await bills('', 'hdqt_bc').expect(200);
    });
  });

  describe('reports', () => {
    const D = daysAgo(50);
    const report = (path: string, query: string, name = 'qlbc_cs1') =>
      as(name).get(
        `/report-site/reports/${path}?branch=cs1&from=${D}&to=${D}${query}`,
      );
    const beer = (name: string, quantity: number) => ({
      name,
      unit: 'Lon',
      quantity,
      unitPrice: 100000,
      vatRate: 10,
    });
    let laterId: number;

    it('sets up three bills thêm tay on one past day', async () => {
      const room = async (name: string) =>
        (
          (
            await as('ql1_cs1')
              .post('/rooms', { name, pricePerHour: 100000 })
              .expect(201)
          ).body as Json
        ).id as number;
      const r501 = await room('BC 501');
      const r502 = await room('BC 502');
      const add = async (roomId: number, amount: number) =>
        (
          await as('qlbc_cs1')
            .post('/report-site/manual-bills?branch=cs1', {
              businessDate: D,
              roomId,
              amount,
            })
            .expect(201)
        ).body as Json;
      await add(r501, 110000); // no line: all of it "Chưa có dòng hàng"
      const b = await add(r502, 220000);
      await as('qlbc_cs1')
        .patch(`/einvoices/${b.einvoiceId as number}`, {
          amount: 220000,
          lines: [beer('Bia  Tiger ', 2)],
        })
        .expect(200);
      const c = await add(r502, 110000);
      await as('qlbc_cs1')
        .patch(`/einvoices/${c.einvoiceId as number}`, {
          amount: 110000,
          lines: [beer('bia tiger', 1)],
        })
        .expect(200);
      laterId = b.einvoiceId as number;
    });

    it('sums the revenue of the counted invoices', async () => {
      const body = (
        await report('revenue', '&groupBy=day&compare=1').expect(200)
      ).body as Json;
      expect(body.totals).toEqual({
        billCount: 3,
        einvoiceCount: 3,
        total: 440000,
        vat: 40000,
        issued: 0,
        revenue: 400000,
        pending: 440000,
      });
      expect((body.previous as Json).totals).toMatchObject({ total: 0 });
      expect((body.buckets as Json[])[0]).toMatchObject({
        key: D,
        total: 440000,
      });
      await issueToday(laterId);
      const issued = (await report('revenue', '').expect(200)).body as Json;
      expect(issued.totals).toMatchObject({ issued: 220000, pending: 220000 });
    });

    it('splits it by room, adding up to the revenue', async () => {
      const body = (await report('rooms', '&by=room').expect(200)).body as {
        totals: Json;
        rows: Json[];
      };
      const byName = new Map(body.rows.map((r) => [r.name, r.total]));
      expect(byName.get('BC 501')).toBe(110000);
      expect(byName.get('BC 502')).toBe(330000);
      expect(body.rows.reduce((s, r) => s + (r.total as number), 0)).toBe(
        440000,
      );
    });

    it('groups the lines by name and unit, and keeps the rest apart', async () => {
      const body = (await report('products', '').expect(200)).body as {
        totals: Json;
        rows: Json[];
      };
      expect(body.totals).toEqual({
        revenue: 400000,
        vat: 40000,
        total: 440000,
      });
      const [item, unlisted] = body.rows;
      expect(item).toMatchObject({
        kind: 'item',
        unit: 'Lon',
        quantity: 3,
        revenue: 300000,
        vat: 30000,
      });
      expect((item.name as string).toLowerCase()).toBe('bia tiger');
      // Issued: its lines stay in the report.
      expect(unlisted).toMatchObject({
        kind: 'unlisted',
        revenue: 100000,
        vat: 10000,
        total: 110000,
      });
    });

    // Equal revenue is no order of its own: the name, then the unit, decide,
    // so the rows (and what falls past the 1000-row cut) never shuffle.
    it('puts lines of equal revenue in order of name, then unit', async () => {
      const day = daysAgo(51);
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'BC 503', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      const line = (name: string, unit: string) => ({
        ...beer(name, 1),
        unit,
      });
      const lines = [
        line('Zebra', 'Lon'),
        line('bia', 'Thung'),
        line('Bia', 'Lon'),
        line('bia', 'Chai'),
        line('BIA', 'Ket'),
      ];
      const bill = (
        await as('qlbc_cs1')
          .post('/report-site/manual-bills?branch=cs1', {
            businessDate: day,
            roomId: room.id,
            amount: 110000 * lines.length,
          })
          .expect(201)
      ).body as Json;
      await as('qlbc_cs1')
        .patch(`/einvoices/${bill.einvoiceId as number}`, {
          amount: 110000 * lines.length,
          lines,
        })
        .expect(200);
      const body = (
        await as('qlbc_cs1')
          .get(`/report-site/reports/products?branch=cs1&from=${day}&to=${day}`)
          .expect(200)
      ).body as { rows: Json[] };
      expect(body.rows.map((r) => [r.name, r.unit])).toEqual([
        ['bia', 'Chai'],
        ['BIA', 'Ket'],
        ['Bia', 'Lon'],
        ['bia', 'Thung'],
        ['Zebra', 'Lon'],
      ]);
    });

    it('shows the whole chain to the chain manager and HĐQT', async () => {
      const body = (
        await as('hdqt_bc')
          .get(`/report-site/reports/revenue?from=${D}&to=${D}`)
          .expect(200)
      ).body as Json;
      expect(body.branchId).toBeNull();
      expect((body.byBranch as Json[]).length).toBeGreaterThan(1);
    });

    it('belongs to the report site', async () => {
      await report('revenue', '', 'tn1_cs1').expect(403);
      await report('revenue', '', 'ql1_cs1').expect(403);
      await as('qlbc_cs1')
        .get(`/report-site/reports/revenue?branch=cs2&from=${D}&to=${D}`)
        .expect(403);
      await as('qlbc_cs1')
        .get(
          '/report-site/reports/products?branch=cs1&from=2010-01-01&to=2026-01-01',
        )
        .expect(400);
    });
  });

  describe('data purge', () => {
    it('wipes the bills thêm tay of the branch', async () => {
      const res = await as('hdqt_bc')
        .post('/admin/purge', {
          scope: 'branch',
          branch: 'cs1',
          password: '12345678',
        })
        .expect(200);
      expect(
        ((res.body as Json).deleted as Record<string, number>).manualBills,
      ).toBeGreaterThan(0);
      expect(
        await app
          .get(PrismaService)
          .manualBill.count({ where: { branchId: cs1Id } }),
      ).toBe(0);
    });
  });
});
