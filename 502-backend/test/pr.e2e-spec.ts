import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { businessDateOf } from '../src/common/dates';

// PR/KTV: a list per branch and its daily roll call, kept by the managers and
// by any account marked "Quản lý PR/KTV" (User.managesPr). The `it`s build on
// each other: run the whole file.

type Json = Record<string, unknown>;

describe('PR/KTV (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const auth = (name: string) => `Bearer ${tokens[name]}`;
  const as = (name: string) => ({
    get: (url: string) =>
      api().get(`/api${url}`).set('Authorization', auth(name)),
    post: (url: string, body: Json = {}) =>
      api().post(`/api${url}`).set('Authorization', auth(name)).send(body),
    patch: (url: string, body: Json = {}) =>
      api().patch(`/api${url}`).set('Authorization', auth(name)).send(body),
    delete: (url: string) =>
      api().delete(`/api${url}`).set('Authorization', auth(name)),
  });
  const login = async (username: string) => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password: '12345678' })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };
  const today = businessDateOf(new Date());
  let cashierId: number;
  let lanId: number;
  let maiId: number;
  let attendanceId: number;

  beforeAll(async () => {
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
    for (const name of ['admin', 'ql1_cs1', 'tn1_cs1', 'ql1_cs2']) {
      await login(name);
    }
    const users = (await as('ql1_cs1').get('/users').expect(200))
      .body as Json[];
    cashierId = users.find((u) => u.username === 'tn1_cs1')!.id as number;
  });

  afterAll(async () => {
    await app.close();
  });

  it('is closed to accounts without the flag', async () => {
    await as('tn1_cs1').get('/pr/staff').expect(403);
    await as('tn1_cs1').post('/pr/staff', { name: 'Lan' }).expect(403);
  });

  it('lets a branch manager mark a cashier as PR manager', async () => {
    const res = await as('ql1_cs1')
      .patch(`/users/${cashierId}`, { managesPr: true })
      .expect(200);
    expect((res.body as Json).managesPr).toBe(true);
    const me = (await as('tn1_cs1').get('/auth/me').expect(200)).body as Json;
    expect(me.managesPr).toBe(true);
  });

  it('keeps the list of the own branch', async () => {
    const cashier = as('tn1_cs1');
    lanId = (
      (
        await cashier
          .post('/pr/staff', { name: ' Lan ', code: 'A1' })
          .expect(201)
      ).body as Json
    ).id as number;
    maiId = (
      (await cashier.post('/pr/staff', { name: 'Mai', code: 'A2' }).expect(201))
        .body as Json
    ).id as number;
    await cashier.post('/pr/staff', { name: 'Hoa', code: 'a1' }).expect(409);
    await cashier.patch(`/pr/staff/${maiId}`, { phone: '0901' }).expect(200);

    const list = await cashier.get('/pr/staff').expect(200);
    expect(list.headers['x-total-count']).toBe('2');
    expect((list.body as Json[]).map((s) => s.name)).toEqual(['Lan', 'Mai']);

    // Another branch neither sees nor edits it.
    await cashier.post('/pr/staff?branch=cs2', { name: 'X' }).expect(403);
    await as('ql1_cs2').patch(`/pr/staff/${lanId}`, { name: 'X' }).expect(403);
    const cs2 = await as('ql1_cs2').get('/pr/staff').expect(200);
    expect(cs2.body).toEqual([]);
  });

  it('takes the roll call once per day', async () => {
    const cashier = as('tn1_cs1');
    const res = await cashier
      .post('/pr/attendance', { prStaffId: lanId })
      .expect(201);
    const row = res.body as Json;
    attendanceId = row.id as number;
    expect(row.businessDate).toBe(today);
    expect(row.checkOutAt).toBeNull();
    await cashier.post('/pr/attendance', { prStaffId: lanId }).expect(409);
    // A past day needs its time, inside that day.
    await cashier
      .post('/pr/attendance', { prStaffId: maiId, businessDate: '2026-01-05' })
      .expect(400);
    await cashier
      .post('/pr/attendance', {
        prStaffId: maiId,
        businessDate: '2026-01-05',
        checkInAt: new Date('2026-01-07T20:00:00').toISOString(),
      })
      .expect(400);
    await cashier
      .post('/pr/attendance', {
        prStaffId: maiId,
        businessDate: '2026-01-05',
        checkInAt: new Date('2026-01-05T20:00:00').toISOString(),
      })
      .expect(201);

    const out = await cashier
      .post(`/pr/attendance/${attendanceId}/check-out`)
      .expect(200);
    expect((out.body as Json).checkOutAt).not.toBeNull();
    await cashier.post(`/pr/attendance/${attendanceId}/check-out`).expect(409);

    const list = await cashier.get('/pr/attendance').expect(200);
    expect(list.headers['x-total-count']).toBe('1');
    const past = await cashier
      .get('/pr/attendance?businessDate=2026-01-05')
      .expect(200);
    expect((past.body as Json[])[0].prStaff).toMatchObject({ name: 'Mai' });
  });

  it('corrects and undoes an entry', async () => {
    const cashier = as('tn1_cs1');
    const [entry] = (await cashier.get('/pr/attendance').expect(200))
      .body as Json[];
    const inAt = new Date(entry.checkInAt as string);
    await cashier
      .patch(`/pr/attendance/${attendanceId}`, {
        checkOutAt: new Date(inAt.getTime() - 60_000).toISOString(),
      })
      .expect(400);
    const cleared = await cashier
      .patch(`/pr/attendance/${attendanceId}`, {
        checkOutAt: null,
        note: 'Tăng ca',
      })
      .expect(200);
    expect(cleared.body).toMatchObject({ checkOutAt: null, note: 'Tăng ca' });
    await cashier.delete(`/pr/attendance/${attendanceId}`).expect(200);
    expect((await cashier.get('/pr/attendance').expect(200)).body).toEqual([]);
  });

  it('removes someone never called, keeps anyone called as left', async () => {
    const cashier = as('tn1_cs1');
    expect(
      (await cashier.delete(`/pr/staff/${lanId}`).expect(200)).body,
    ).toEqual({ deleted: true });
    expect(
      (await cashier.delete(`/pr/staff/${maiId}`).expect(200)).body,
    ).toEqual({ deleted: false });
    expect((await cashier.get('/pr/staff').expect(200)).body).toEqual([]);
    const all = await cashier.get('/pr/staff?includeInactive=true').expect(200);
    expect(all.body).toMatchObject([{ name: 'Mai', active: false }]);
    await cashier.post('/pr/attendance', { prStaffId: maiId }).expect(400);
  });

  it('lets the board read but not write', async () => {
    await as('admin')
      .post('/users', {
        username: 'hdqt_pr',
        fullName: 'HĐQT',
        role: 'BOARD',
        password: '12345678',
      })
      .expect(201);
    await login('hdqt_pr');
    const board = as('hdqt_pr');
    await board.get('/pr/staff?branch=cs1&includeInactive=true').expect(200);
    await board.get('/pr/attendance?branch=cs1').expect(200);
    await board.post('/pr/staff?branch=cs1', { name: 'X' }).expect(403);
    await board.post('/pr/attendance', { prStaffId: maiId }).expect(403);
  });
});
