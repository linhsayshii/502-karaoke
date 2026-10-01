// test/report-site.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakeMinvoice } from './fake-minvoice';

// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt) against a fake Minvoice
// (test/fake-minvoice.ts). The `it`s build on each other: run the whole file.

type Json = Record<string, unknown>;

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
});
