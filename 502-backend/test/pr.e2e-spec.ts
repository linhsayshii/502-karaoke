import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { businessDateOf } from '../src/common/dates';
import { PrismaService } from '../src/prisma/prisma.service';

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
    // Production runs the database in Asia/Ho_Chi_Minh, where raw SQL that
    // binds a JS Date or uses now() against a UTC `timestamp` column goes
    // wrong. Only new connections see it, so set it before the app connects.
    execSync(
      `docker exec kara502-pg psql -U postgres -d karaoke_test -c "ALTER DATABASE karaoke_test SET timezone TO 'Asia/Ho_Chi_Minh'"`,
      { stdio: 'pipe' },
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
    for (const name of [
      'admin',
      'ql1_cs1',
      'tn1_cs1',
      'ql1_cs2',
      'tn1_cs2',
      'pv1_cs1',
    ]) {
      await login(name);
    }
    const users = (await as('ql1_cs1').get('/users').expect(200))
      .body as Json[];
    cashierId = users.find((u) => u.username === 'tn1_cs1')!.id as number;
  });

  afterAll(async () => {
    await app.close();
    // Leave the database as the other e2e suites expect it.
    execSync(
      `docker exec kara502-pg psql -U postgres -d karaoke_test -c "ALTER DATABASE karaoke_test RESET timezone"`,
      { stdio: 'pipe' },
    );
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

  describe('PR/KTV in rooms', () => {
    let hoaId: number;
    let cucId: number;
    let roomA: number;
    let roomB: number;
    let orderA: number;
    let orderB: number;
    let staffUserId: number;
    const minutesAgo = (m: number) =>
      new Date(Date.now() - m * 60_000).toISOString();
    const sessionsOf = (order: Json) => order.prSessions as Json[];
    const idOf = (res: { body: unknown }) => (res.body as Json).id as number;

    beforeAll(async () => {
      const manager = as('ql1_cs1');
      hoaId = idOf(
        await manager.post('/pr/staff', { name: 'Hoa' }).expect(201),
      );
      cucId = idOf(
        await manager
          .post('/pr/staff', { name: 'Cúc', code: 'C1' })
          .expect(201),
      );
      const rooms = (await as('tn1_cs1').get('/rooms').expect(200))
        .body as Json[];
      roomA = rooms.find((r) => r.name === 'P101')!.id as number;
      roomB = rooms.find((r) => r.name === 'P102')!.id as number;
      orderA = idOf(
        await as('tn1_cs1').post('/orders', { roomId: roomA }).expect(201),
      );
      orderB = idOf(
        await as('tn1_cs1').post('/orders', { roomId: roomB }).expect(201),
      );
      // Rooms opened two hours ago, so visits can start in the past.
      const prisma = app.get(PrismaService);
      await prisma.order.updateMany({
        where: { id: { in: [orderA, orderB] } },
        data: { startTime: new Date(Date.now() - 2 * 3600_000) },
      });
      const users = (await manager.get('/users').expect(200)).body as Json[];
      staffUserId = users.find((u) => u.username === 'pv1_cs1')!.id as number;
    });

    it('adds a PR to a room, once at a time', async () => {
      const res = await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderA, prStaffId: hoaId })
        .expect(201);
      expect(sessionsOf(res.body as Json)).toMatchObject([
        { prStaffId: hoaId, endAt: null, prStaff: { name: 'Hoa' } },
      ]);
      const busy = await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderB, prStaffId: hoaId })
        .expect(409);
      expect((busy.body as Json).message).toBe('Hoa đang ở phòng P101');
      // The order carries its visits for the room page.
      const order = (await as('tn1_cs1').get(`/orders/${orderA}`).expect(200))
        .body as Json;
      expect(sessionsOf(order)).toHaveLength(1);
    });

    it('ends a visit, then the PR can go to another room', async () => {
      const order = (await as('tn1_cs1').get(`/orders/${orderA}`).expect(200))
        .body as Json;
      const sessionId = sessionsOf(order)[0].id as number;
      const ended = await as('tn1_cs1')
        .post(`/pr/sessions/${sessionId}/end`)
        .expect(200);
      expect(sessionsOf(ended.body as Json)[0].endAt).not.toBeNull();
      await as('tn1_cs1').post(`/pr/sessions/${sessionId}/end`).expect(409);
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderB, prStaffId: hoaId })
        .expect(201);
    });

    it('checks the times', async () => {
      const cashier = as('tn1_cs1');
      await cashier
        .post('/pr/sessions', {
          orderId: orderA,
          prStaffId: cucId,
          startAt: minutesAgo(180),
        })
        .expect(400);
      await cashier
        .post('/pr/sessions', {
          orderId: orderA,
          prStaffId: cucId,
          startAt: minutesAgo(-5),
        })
        .expect(400);
      const res = await cashier
        .post('/pr/sessions', {
          orderId: orderA,
          prStaffId: cucId,
          startAt: minutesAgo(90),
        })
        .expect(201);
      const visit = sessionsOf(res.body as Json).find(
        (s) => s.prStaffId === cucId,
      )!;
      await cashier
        .patch(`/pr/sessions/${visit.id as number}`, { endAt: minutesAgo(100) })
        .expect(400);
      const fixed = await cashier
        .patch(`/pr/sessions/${visit.id as number}`, { endAt: minutesAgo(30) })
        .expect(200);
      expect(
        sessionsOf(fixed.body as Json).find((s) => s.id === visit.id)!.endAt,
      ).not.toBeNull();
    });

    it('deletes a visit entered by mistake', async () => {
      const res = await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId })
        .expect(201);
      const visit = sessionsOf(res.body as Json).find(
        (s) => s.prStaffId === cucId && s.endAt === null,
      )!;
      const after = await as('tn1_cs1')
        .delete(`/pr/sessions/${visit.id as number}`)
        .expect(200);
      expect(
        sessionsOf(after.body as Json).some((s) => s.id === visit.id),
      ).toBe(false);
    });

    it('lets sales roles and PR managers assign, nobody else', async () => {
      await as('pv1_cs1')
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId })
        .expect(403);
      await as('tn1_cs2')
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId })
        .expect(403);
      await as('ql1_cs1')
        .patch(`/users/${staffUserId}`, { managesPr: true })
        .expect(200);
      const res = await as('pv1_cs1')
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId })
        .expect(201);
      const visit = sessionsOf(res.body as Json).find(
        (s) => s.prStaffId === cucId && s.endAt === null,
      )!;
      await as('pv1_cs1')
        .post(`/pr/sessions/${visit.id as number}/end`)
        .expect(200);
      // HĐQT stays view only, even with the flag on its account.
      const users = (await as('admin').get('/users').expect(200))
        .body as Json[];
      const boardId = users.find((u) => u.username === 'hdqt_pr')!.id as number;
      await as('admin')
        .patch(`/users/${boardId}`, { managesPr: true })
        .expect(200);
      await as('hdqt_pr')
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId })
        .expect(403);
      await as('hdqt_pr')
        .post('/pr/staff?branch=cs1', { name: 'X' })
        .expect(403);
      await as('hdqt_pr').get('/pr/staff?branch=cs1').expect(200);
      await as('admin')
        .patch(`/users/${boardId}`, { managesPr: false })
        .expect(200);
    });

    it('refuses visits of one PR that overlap in time', async () => {
      const cashier = as('tn1_cs1');
      const order = (await cashier.get(`/orders/${orderA}`).expect(200))
        .body as Json;
      const cucVisits = sessionsOf(order).filter((s) => s.prStaffId === cucId);
      // V1: the 90 → 30 minutes ago visit.
      const v1 = cucVisits.find(
        (s) =>
          Date.now() - new Date(s.startAt as string).getTime() > 80 * 60_000,
      )!;
      // A new visit starting inside V1, in another room.
      const inside = await cashier
        .post('/pr/sessions', {
          orderId: orderB,
          prStaffId: cucId,
          startAt: minutesAgo(60),
        })
        .expect(409);
      expect((inside.body as Json).message).toMatch(
        /^Cúc đã có lượt ở phòng P101 \(\d{2}:\d{2}–\d{2}:\d{2}\) trùng giờ$/,
      );
      // Stretching V1 over the later short visit.
      await cashier
        .patch(`/pr/sessions/${v1.id as number}`, {
          endAt: new Date().toISOString(),
        })
        .expect(409);
      // Nothing changed.
      const after = (await cashier.get(`/orders/${orderA}`).expect(200))
        .body as Json;
      expect(
        sessionsOf(after).filter((s) => s.prStaffId === cucId),
      ).toHaveLength(cucVisits.length);
    });

    it('lists who can be put into a room, with where they are', async () => {
      await as('ql1_cs1')
        .post('/pr/attendance', { prStaffId: cucId })
        .expect(201);
      const res = await as('tn1_cs1').get('/pr/available').expect(200);
      expect(res.headers['x-total-count']).toBeDefined();
      const list = res.body as Json[];
      // Checked in today first.
      expect(list[0]).toMatchObject({
        id: cucId,
        checkedIn: true,
        currentRoom: null,
      });
      expect(list.find((p) => p.id === hoaId)).toMatchObject({
        checkedIn: false,
        currentRoom: { orderId: orderB, roomName: 'P102' },
      });
      await as('tn1_cs2').get('/pr/available?branch=cs1').expect(403);
      await as('pv1_cs1').get('/pr/available').expect(200); // managesPr
    });

    it('closes open visits at checkout and freezes them', async () => {
      const paid = await as('tn1_cs1')
        .post(`/orders/${orderB}/checkout`, { paymentMethod: 'CASH' })
        .expect(200);
      const body = paid.body as Json;
      const hoa = sessionsOf(body).find((s) => s.prStaffId === hoaId)!;
      expect(hoa.endAt).toBe(body.endTime);
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderB, prStaffId: cucId })
        .expect(409);
      await as('tn1_cs1')
        .delete(`/pr/sessions/${hoa.id as number}`)
        .expect(409);
    });

    it('closes open visits when a manager cancels the session', async () => {
      const daoId = idOf(
        await as('ql1_cs1').post('/pr/staff', { name: 'Đào' }).expect(201),
      );
      const rooms = (await as('tn1_cs1').get('/rooms').expect(200))
        .body as Json[];
      const roomC = rooms.find((r) => r.name === 'P103')!.id as number;
      const orderC = idOf(
        await as('tn1_cs1').post('/orders', { roomId: roomC }).expect(201),
      );
      await app.get(PrismaService).order.update({
        where: { id: orderC },
        data: { startTime: new Date(Date.now() - 2 * 3600_000) },
      });
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderC, prStaffId: daoId })
        .expect(201);
      const cancelled = await as('ql1_cs1')
        .post(`/orders/${orderC}/cancel`)
        .expect(200);
      const body = cancelled.body as Json;
      const dao = sessionsOf(body).find((s) => s.prStaffId === daoId)!;
      expect(dao.endAt).toBe(body.endTime);
    });

    it('counts an open visit up to now, whatever the database time zone', async () => {
      const yenId = idOf(
        await as('ql1_cs1').post('/pr/staff', { name: 'Yến' }).expect(201),
      );
      // P102 was paid above, so it is free again.
      const orderD = idOf(
        await as('tn1_cs1').post('/orders', { roomId: roomB }).expect(201),
      );
      await app.get(PrismaService).order.update({
        where: { id: orderD },
        data: { startTime: new Date(Date.now() - 2 * 3600_000) },
      });
      await as('tn1_cs1')
        .post('/pr/sessions', {
          orderId: orderD,
          prStaffId: yenId,
          startAt: minutesAgo(45),
        })
        .expect(201);
      const stats = (
        await as('ql1_cs1')
          .get(`/pr/stats?from=${today}&to=${today}`)
          .expect(200)
      ).body as { rows: { prStaffId: number; minutes: number }[] };
      const yen = stats.rows.find((r) => r.prStaffId === yenId)!;
      expect(yen.minutes).toBeGreaterThanOrEqual(45);
      expect(yen.minutes).toBeLessThan(47);
    });

    it('sums the hours of each PR over a range', async () => {
      const res = await as('ql1_cs1')
        .get(`/pr/stats?from=${today}&to=${today}`)
        .expect(200);
      const stats = res.body as {
        totals: { minutes: number; sessions: number; rooms: number };
        rows: {
          prStaffId: number;
          minutes: number;
          sessions: number;
          rooms: number;
        }[];
      };
      const cuc = stats.rows.find((r) => r.prStaffId === cucId)!;
      expect(cuc.sessions).toBe(2); // the deleted one does not count
      expect(cuc.rooms).toBe(1);
      expect(cuc.minutes).toBeGreaterThanOrEqual(60);
      expect(cuc.minutes).toBeLessThan(63);
      const sum = (key: 'minutes' | 'sessions') =>
        stats.rows.reduce((s, r) => s + r[key], 0);
      expect(stats.totals.minutes).toBe(sum('minutes'));
      expect(stats.totals.sessions).toBe(sum('sessions'));
      // tn1_cs2 has no managesPr flag: canViewPr stops it, not the branch scope.
      await as('tn1_cs2')
        .get(`/pr/stats?branch=cs1&from=${today}&to=${today}`)
        .expect(403);
      await as('hdqt_pr')
        .get(`/pr/stats?branch=cs1&from=${today}&to=${today}`)
        .expect(200);
      await as('ql1_cs1')
        .get('/pr/stats?from=2024-01-01&to=2026-01-01')
        .expect(400);
    });

    it('keeps a PR who was ever in a room', async () => {
      // Hoa was never on a roll call but sat in rooms.
      const res = await as('ql1_cs1').delete(`/pr/staff/${hoaId}`).expect(200);
      expect(res.body).toEqual({ deleted: false });
    });

    // Last: it wipes cs1.
    it('purge removes the branch PR visits', async () => {
      const res = await as('hdqt_pr')
        .post('/admin/purge', {
          scope: 'branch',
          branch: 'cs1',
          password: '12345678',
        })
        .expect(200);
      const deleted = (res.body as Json).deleted as Record<string, number>;
      expect(deleted.prSessions).toBeGreaterThan(0);
      const stats = (
        await as('ql1_cs1')
          .get(`/pr/stats?from=${today}&to=${today}`)
          .expect(200)
      ).body as { rows: unknown[]; totals: { sessions: number } };
      expect(stats.rows).toEqual([]);
      expect(stats.totals.sessions).toBe(0);
    });
  });
});
