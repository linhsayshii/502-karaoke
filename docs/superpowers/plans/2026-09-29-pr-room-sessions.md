# PR/KTV trong phòng và Thống kê PR — kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gán PR/KTV vào từng phòng đang hát với giờ vào/giờ ra (thao tác như gọi món), và biến trang "Danh sách PR/KTV" thành "Thống kê PR" có số giờ trong phòng.

**Architecture:** Bảng mới `PrSession` (một lượt PR trong một `Order` đang mở), ghi qua `src/pr` trong transaction khóa đơn trước rồi khóa `PrStaff`. Thanh toán/hủy phiên đóng các lượt còn mở. Thống kê là một truy vấn SQL gom nhóm trên `ReportPrismaService`. Frontend thêm tab PR/KTV vào trang phòng (hai component mới), và thêm khoảng ngày cùng cột giờ vào trang `/pr/staff`.

**Tech Stack:** NestJS 11, Prisma 5.22, PostgreSQL 17, Jest + supertest (e2e), Next.js 16, React 19, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-29-pr-room-sessions-design.md`

## Global Constraints

- Mọi chữ hiển thị và thông báo lỗi bằng **tiếng Việt**.
- Tuân theo `docs/resource-rules.md` và đánh dấu checklist §5 trước khi coi là xong:
  - Truy vấn danh sách có `take` và chỉ `select` cột được dùng.
  - Danh sách có trần gửi `X-Total-Count`.
  - Không cộng tổng từ danh sách có trần.
  - Thống kê chạy trên `ReportPrismaService` và có `SharedRequestInterceptor`.
  - Truy vấn luồng bán hàng phải dùng index.
- PR **không** tính tiền: không đụng `billing.ts`, `lib/billing.ts`, quỹ hay báo cáo doanh thu.
- Migration tên `20261001000000_pr_sessions`, viết SQL tay. Không dùng `prisma db push`, không dùng partial index.
- Ngày kinh doanh D = [D 06:00, D+1 06:00) giờ máy chủ: dùng `businessDayRange`, `businessDateOf` của `src/common/dates.ts`.
- Quyền gán PR: `SALES` (CHAIN_MANAGER, BRANCH_MANAGER, CASHIER) hoặc `user.managesPr`. Quyền xem thống kê: `canViewPr` (quản lý, `managesPr`, BOARD).
- Chạy e2e từng file một: `docker start kara502-pg` trước, rồi `npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand` (hoặc `npm run test:e2e -- test/pr.e2e-spec.ts`).
- Frontend không có test tự động: kiểm bằng `npm run lint`, `npm run build` và trình duyệt, ở 390px và máy bàn.

## File Structure

**Backend (`502-backend/`)**
| File | Việc |
|---|---|
| `prisma/schema.prisma` | Thêm model `PrSession` và các quan hệ ngược |
| `prisma/migrations/20261001000000_pr_sessions/migration.sql` | Tạo bảng và index |
| `src/pr/pr-session-rules.ts` (mới) | Hàm thuần: `checkSessionTimes`, `sessionMinutes` |
| `src/pr/pr-session-rules.spec.ts` (mới) | Unit test |
| `src/orders/order-include.ts` (mới) | `staffRef`, `orderInclude` (danh sách), `prSessionSelect`, `orderDetailInclude` |
| `src/orders/order-lock.ts` (mới) | `lockOrderRow(tx, id, status, message)` dùng chung |
| `src/orders/orders.service.ts` | Dùng hai file trên; checkout/cancel đóng lượt PR |
| `src/pr/dto/pr-session.dto.ts` (mới) | DTO lượt PR và truy vấn thống kê |
| `src/pr/pr-sessions.service.ts` (mới) | Thêm/ra/sửa/xóa lượt, danh sách chọn, thống kê |
| `src/pr/pr.controller.ts`, `src/pr/pr.module.ts` | Route mới |
| `src/pr/pr.service.ts` | `canAssignPr`; `removeStaff` xét cả lượt phòng |
| `src/data-purge/data-purge.service.ts` | Xóa `prSession` |
| `test/pr.e2e-spec.ts` | `describe('PR/KTV in rooms')` mới |

**Frontend (`502-frontend/src/`)**
| File | Việc |
|---|---|
| `lib/types.ts` | `PrSession`, `AvailablePr`, `PrStats`, `Order.prSessions` |
| `lib/permissions.ts` | Quyền `pr.assign` |
| `components/sales/pr-picker.tsx` (mới) | Lưới ô PR để chạm thêm vào phòng |
| `components/sales/room-pr-list.tsx` (mới) | Danh sách lượt trong thẻ hóa đơn (Ra / Sửa giờ / Xóa) |
| `app/[branch]/sales/rooms/[id]/page.tsx` | Hàng đợi ghi dùng chung, tab Thực đơn \| PR/KTV, danh sách lượt |
| `app/[branch]/pr/staff/page.tsx`, `layout.tsx`, `lib/navigation.ts` | "Thống kê PR": khoảng ngày, cột giờ/lượt/phòng, hàng tổng |

**Docs:** `CLAUDE.md`, `DEPLOYMENT.md` (§6.15).

---

### Task 1: Bảng `PrSession` và quy tắc giờ (hàm thuần)

**Files:**
- Modify: `502-backend/prisma/schema.prisma`
- Create: `502-backend/prisma/migrations/20261001000000_pr_sessions/migration.sql`
- Create: `502-backend/src/pr/pr-session-rules.ts`
- Test: `502-backend/src/pr/pr-session-rules.spec.ts`

**Interfaces:**
- Produces:
  - Prisma model `PrSession`, truy cập qua `prisma.prSession`.
  - `checkSessionTimes(input: { orderStart: Date; startAt: Date; endAt: Date | null; now: Date }): string | null`, trả về thông báo lỗi hoặc `null`.
  - `sessionMinutes(startAt: Date, endAt: Date | null, now: Date): number`.

- [ ] **Step 1: Viết test hỏng**

`502-backend/src/pr/pr-session-rules.spec.ts`:
```ts
import { checkSessionTimes, sessionMinutes } from './pr-session-rules';

const at = (hhmm: string) => new Date(`2026-09-29T${hhmm}:00`);
const base = {
  orderStart: at('20:00'),
  startAt: at('20:30'),
  endAt: null,
  now: at('22:00'),
};

describe('checkSessionTimes', () => {
  it('accepts an open visit inside the session', () => {
    expect(checkSessionTimes(base)).toBeNull();
  });

  it('accepts a closed visit', () => {
    expect(checkSessionTimes({ ...base, endAt: at('21:00') })).toBeNull();
  });

  it('rejects a start before the room opened', () => {
    expect(checkSessionTimes({ ...base, startAt: at('19:59') })).toBe(
      'Giờ vào phải sau giờ mở phòng',
    );
  });

  it('rejects times in the future', () => {
    expect(checkSessionTimes({ ...base, startAt: at('22:01') })).toBe(
      'Giờ vào không được sau hiện tại',
    );
    expect(checkSessionTimes({ ...base, endAt: at('22:01') })).toBe(
      'Giờ ra không được sau hiện tại',
    );
  });

  it('rejects an end before the start', () => {
    expect(checkSessionTimes({ ...base, endAt: at('20:29') })).toBe(
      'Giờ ra phải sau giờ vào',
    );
  });
});

describe('sessionMinutes', () => {
  it('counts started minutes of a closed visit', () => {
    expect(sessionMinutes(at('20:00'), at('21:00'), at('23:00'))).toBe(60);
    expect(
      sessionMinutes(at('20:00'), new Date(at('20:00').getTime() + 61_000), at('23:00')),
    ).toBe(2);
  });

  it('counts an open visit up to now', () => {
    expect(sessionMinutes(at('20:00'), null, at('20:45'))).toBe(45);
  });

  it('never goes below zero', () => {
    expect(sessionMinutes(at('20:00'), at('19:00'), at('23:00'))).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận nó hỏng**

Run: `cd 502-backend && npx jest src/pr/pr-session-rules.spec.ts`
Expected: FAIL, "Cannot find module './pr-session-rules'".

- [ ] **Step 3: Viết hàm**

`502-backend/src/pr/pr-session-rules.ts`:
```ts
// Rules of a PR/KTV visit to a room (PrSession), shared by the service and
// its tests. A visit never costs the customer anything: it only records time.

export interface SessionTimes {
  orderStart: Date; // when the room session opened
  startAt: Date;
  endAt: Date | null; // null: still in the room
  now: Date;
}

// The Vietnamese error of impossible times, or null when they are fine.
export function checkSessionTimes({
  orderStart,
  startAt,
  endAt,
  now,
}: SessionTimes): string | null {
  if (startAt < orderStart) return 'Giờ vào phải sau giờ mở phòng';
  if (startAt > now) return 'Giờ vào không được sau hiện tại';
  if (endAt) {
    if (endAt < startAt) return 'Giờ ra phải sau giờ vào';
    if (endAt > now) return 'Giờ ra không được sau hiện tại';
  }
  return null;
}

// Started minutes of a visit (an open one counts up to now), as the SQL of
// GET /pr/stats counts them.
export function sessionMinutes(startAt: Date, endAt: Date | null, now: Date) {
  const ms = (endAt ?? now).getTime() - startAt.getTime();
  return Math.max(0, Math.ceil(ms / 60_000));
}
```

- [ ] **Step 4: Chạy test, xác nhận nó qua**

Run: `cd 502-backend && npx jest src/pr/pr-session-rules.spec.ts`
Expected: PASS (8 test).

- [ ] **Step 5: Thêm model vào `schema.prisma`**

Sau `model PrAttendance { … }`, thêm:
```prisma
// Một lượt PR/KTV ngồi trong một phòng đang hát. Không tính tiền trên hóa
// đơn, chỉ để thống kê giờ. Vài chục lượt mỗi cơ sở mỗi ngày (~100k dòng/năm
// cho cả chuỗi). Mỗi PR có tối đa một lượt đang mở: PrSessionsService giữ quy
// tắc này bằng khóa dòng PrStaff (Prisma 5 không biểu diễn được partial index).
model PrSession {
  id          Int       @id @default(autoincrement())
  branchId    Int
  branch      Branch    @relation(fields: [branchId], references: [id])
  orderId     Int
  order       Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  prStaffId   Int
  prStaff     PrStaff   @relation(fields: [prStaffId], references: [id])
  startAt     DateTime
  endAt       DateTime?
  createdById Int?
  createdBy   User?     @relation("PrSessionCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())

  @@index([orderId]) // room page, checkout / cancel
  @@index([branchId, startAt]) // GET /pr/stats
  @@index([prStaffId, endAt]) // is this PR in another room?
}
```
Thêm các quan hệ ngược:
- `Branch`: `prSessions PrSession[]` (sau `prAttendances`)
- `User`: `prSessionsCreated PrSession[] @relation("PrSessionCreatedBy")` (sau `prAttendancesRecorded`)
- `PrStaff`: `sessions PrSession[]` (sau `attendances`)
- `Order`: `prSessions PrSession[]` (cạnh `items`)

- [ ] **Step 6: Sinh SQL migration**

Run (e2e DB đang chạy, `docker start kara502-pg`):
```bash
cd 502-backend && mkdir -p prisma/migrations/20261001000000_pr_sessions && \
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://postgres:postgres@localhost:5433/karaoke_shadow" --script \
  > prisma/migrations/20261001000000_pr_sessions/migration.sql
```
(Lấy user/mật khẩu từ `test/e2e.env`; nếu DB `karaoke_shadow` chưa có, tạo trước bằng `docker exec kara502-pg createdb -U postgres karaoke_shadow`.)

Expected: file có `CREATE TABLE "PrSession"`, 3 `CREATE INDEX` và 4 `ADD CONSTRAINT … FOREIGN KEY` (Order: `ON DELETE CASCADE`; PrStaff, Branch: `ON DELETE RESTRICT`; User: `ON DELETE SET NULL`), không có lệnh nào khác. Thêm dòng đầu file:
```sql
-- PR/KTV trong phòng: một dòng mỗi lượt PR vào một phòng đang hát (không tính tiền).
```

- [ ] **Step 7: Sinh client, chạy lại toàn bộ unit test**

Run: `cd 502-backend && npx prisma generate && npm test`
Expected: PASS hết.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/prisma 502-backend/src/pr/pr-session-rules.ts 502-backend/src/pr/pr-session-rules.spec.ts
git commit -m "feat(pr): bảng PrSession và quy tắc giờ vào/ra phòng"
```

---

### Task 2: Tách `orderInclude` và khóa đơn dùng chung; đóng lượt PR khi thanh toán/hủy phiên

**Files:**
- Create: `502-backend/src/orders/order-include.ts`
- Create: `502-backend/src/orders/order-lock.ts`
- Modify: `502-backend/src/orders/orders.service.ts` (`orderInclude` dòng 37–56, `lockOrder` dòng 174–200, `findOne`, `update`, `checkout`, `cancel`)

**Interfaces:**
- Consumes: model `PrSession` (Task 1).
- Produces:
  - `prSessionSelect`, `orderInclude` (danh sách, không có lượt PR), `orderDetailInclude` (có `prSessions`) từ `src/orders/order-include.ts`.
  - `lockOrderRow(tx: Prisma.TransactionClient, id: number, status: OrderStatus, conflictMessage: string): Promise<void>` từ `src/orders/order-lock.ts`.
  - `closeOpenPrSessions(tx, orderId: number, endAt: Date): Promise<void>` cũng từ `order-lock.ts`.

- [ ] **Step 1: Tạo `order-include.ts`**

Chuyển `staffRef` và `orderInclude` từ `orders.service.ts` sang file mới, rồi thêm:
```ts
import { Prisma } from '@prisma/client';

export const staffRef = { select: { id: true, fullName: true } };

// Only what the screens show: bill lists return up to 1000 orders, so a
// whole product or room row per line would be carried for nothing.
export const orderInclude = {
  /* … giữ nguyên nội dung hiện tại … */
} satisfies Prisma.OrderInclude;

// A PR/KTV visit as the room page shows it.
export const prSessionSelect = {
  id: true,
  orderId: true,
  prStaffId: true,
  startAt: true,
  endAt: true,
  prStaff: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PrSessionSelect;

// One order as the room page and the bill sheet show it: the list fields
// plus the PR/KTV visits (kept out of the 1000-bill list).
export const orderDetailInclude = {
  ...orderInclude,
  prSessions: { select: prSessionSelect, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;
```

- [ ] **Step 2: Tạo `order-lock.ts`**

```ts
import { ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;

// Locks an order row until the transaction ends, provided it still has
// `status`. The UPDATE takes the lock (a concurrent writer waits here, then
// re-checks the status) and bumps updatedAt, so the room page on other
// devices picks the change up on its next poll.
export async function lockOrderRow(
  tx: Db,
  id: number,
  status: OrderStatus,
  conflictMessage: string,
) {
  const { count } = await tx.order.updateMany({
    where: { id, status },
    data: { updatedAt: new Date() },
  });
  if (count === 0) throw new ConflictException(conflictMessage);
}

// Closing a room (checkout, cancelled session) ends the PR/KTV visits still
// open in it, at the same moment. Uses the PrSession(orderId) index.
export async function closeOpenPrSessions(
  tx: Db,
  orderId: number,
  endAt: Date,
) {
  await tx.prSession.updateMany({
    where: { orderId, endAt: null },
    data: { endAt },
  });
}
```

- [ ] **Step 3: Sửa `orders.service.ts`**
  1. Xóa `staffRef` và `orderInclude` tại chỗ, import `{ orderDetailInclude, orderInclude }` từ `./order-include` và `{ closeOpenPrSessions, lockOrderRow }` từ `./order-lock`. Nếu `staffRef` còn được dùng trong file thì import cả nó.
  2. Trong `lockOrder`, thay khối `updateMany … if (count === 0) throw …` bằng `await lockOrderRow(tx, id, status, conflictMessage);`.
  3. Các lệnh trả về **một** đơn dùng `orderDetailInclude` thay cho `orderInclude`: `findOne`, `create`, `update`, `cancel`, `checkout`, `voidPaid`, `editPaid` (mọi `findUniqueOrThrow({ … include: orderInclude })`). `findAll` (danh sách) giữ `orderInclude`.
  4. Trong `checkout`, ngay sau `tx.order.update({ … status: COMPLETED … })`, thêm `await closeOpenPrSessions(tx, id, endTime);`.
  5. Trong `cancel`, ngay sau `tx.order.update({ … status: CANCELLED … })`, thêm `await closeOpenPrSessions(tx, id, now);`.

- [ ] **Step 4: Chạy unit test và build**

Run: `cd 502-backend && npm test && npm run build`
Expected: PASS, build không lỗi.

- [ ] **Step 5: Chạy e2e cũ để chắc không vỡ**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/foundation.e2e-spec.ts --runInBand`
Expected: PASS. Phần kiểm lượt PR khi đóng phòng nằm ở Task 3.

- [ ] **Step 6: Commit**

```bash
git add 502-backend/src/orders
git commit -m "refactor(orders): tách orderInclude/khóa đơn; đóng lượt PR khi thanh toán hoặc hủy phiên"
```

---

### Task 3: API lượt PR trong phòng (thêm, ra, sửa, xóa)

**Files:**
- Create: `502-backend/src/pr/dto/pr-session.dto.ts`
- Create: `502-backend/src/pr/pr-sessions.service.ts`
- Modify: `502-backend/src/pr/pr.service.ts` (thêm `canAssignPr`)
- Modify: `502-backend/src/pr/pr.controller.ts`, `502-backend/src/pr/pr.module.ts`
- Test: `502-backend/test/pr.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `checkSessionTimes` (Task 1).
  - `lockOrderRow`, `orderDetailInclude` (Task 2).
  - `BranchScopeService.assertBranchAccess(user, branchId)`.
- Produces:
  - `canAssignPr(user: AuthUser): boolean` (export từ `pr.service.ts`).
  - `PrSessionsService` với `add(user, dto)`, `end(user, id)`, `update(user, id, dto)`, `remove(user, id)`, mỗi hàm trả về đơn theo `orderDetailInclude`.
  - Route:
    - `POST /pr/sessions`
    - `POST /pr/sessions/:id/end` (200)
    - `PATCH /pr/sessions/:id`
    - `DELETE /pr/sessions/:id`

- [ ] **Step 1: Viết e2e hỏng**

Trong `test/pr.e2e-spec.ts`:
- Thêm import `PrismaService` từ `'../src/prisma/prisma.service'`.
- Trong `beforeAll`, mở rộng danh sách đăng nhập thành `['admin', 'ql1_cs1', 'tn1_cs1', 'ql1_cs2', 'tn1_cs2', 'pv1_cs1']`.
- Thêm `describe` lồng vào **cuối** `describe('PR/KTV (e2e)')`, sau `it('lets the board read but not write')`:
```ts
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

    beforeAll(async () => {
      const manager = as('ql1_cs1');
      hoaId = (await manager.post('/pr/staff', { name: 'Hoa' }).expect(201))
        .body.id as number;
      cucId = (await manager.post('/pr/staff', { name: 'Cúc', code: 'C1' }).expect(201))
        .body.id as number;
      const rooms = (await as('tn1_cs1').get('/rooms').expect(200)).body as Json[];
      roomA = rooms.find((r) => r.name === 'P101')!.id as number;
      roomB = rooms.find((r) => r.name === 'P102')!.id as number;
      orderA = (await as('tn1_cs1').post('/orders', { roomId: roomA }).expect(201))
        .body.id as number;
      orderB = (await as('tn1_cs1').post('/orders', { roomId: roomB }).expect(201))
        .body.id as number;
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
      const order = (await as('tn1_cs1').get(`/orders/${orderA}`).expect(200)).body as Json;
      expect(sessionsOf(order)).toHaveLength(1);
    });

    it('ends a visit, then the PR can go to another room', async () => {
      const order = (await as('tn1_cs1').get(`/orders/${orderA}`).expect(200)).body as Json;
      const sessionId = sessionsOf(order)[0].id as number;
      const ended = await as('tn1_cs1').post(`/pr/sessions/${sessionId}/end`).expect(200);
      expect(sessionsOf(ended.body as Json)[0].endAt).not.toBeNull();
      await as('tn1_cs1').post(`/pr/sessions/${sessionId}/end`).expect(409);
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderB, prStaffId: hoaId })
        .expect(201);
    });

    it('checks the times', async () => {
      const cashier = as('tn1_cs1');
      await cashier
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId, startAt: minutesAgo(180) })
        .expect(400);
      await cashier
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId, startAt: minutesAgo(-5) })
        .expect(400);
      const res = await cashier
        .post('/pr/sessions', { orderId: orderA, prStaffId: cucId, startAt: minutesAgo(90) })
        .expect(201);
      const visit = sessionsOf(res.body as Json).find((s) => s.prStaffId === cucId)!;
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
      const after = await as('tn1_cs1').delete(`/pr/sessions/${visit.id as number}`).expect(200);
      expect(sessionsOf(after.body as Json).some((s) => s.id === visit.id)).toBe(false);
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
      await as('pv1_cs1').post(`/pr/sessions/${visit.id as number}/end`).expect(200);
    });

    it('closes open visits at checkout and freezes them', async () => {
      const paid = await as('tn1_cs1')
        .post(`/orders/${orderB}/checkout`, { paymentMethod: 'CASH' })
        .expect(201);
      const body = paid.body as Json;
      const hoa = sessionsOf(body).find((s) => s.prStaffId === hoaId)!;
      expect(hoa.endAt).toBe(body.endTime);
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId: orderB, prStaffId: cucId })
        .expect(409);
      await as('tn1_cs1').delete(`/pr/sessions/${hoa.id as number}`).expect(409);
    });
  });
```
Chú ý:
- Nếu `POST /orders/:id/checkout` hiện trả 200 chứ không phải 201, sửa `.expect` cho khớp (xem `@HttpCode` trong `orders.controller.ts`).
- Kiểm tra `PATCH /users/:id` với `managesPr` như test "lets a branch manager mark a cashier as PR manager" ở đầu file.

- [ ] **Step 2: Chạy e2e, xác nhận hỏng**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand`
Expected: các `it` mới FAIL với 404 (route chưa có); các `it` cũ PASS.

- [ ] **Step 3: Thêm DTO**

`502-backend/src/pr/dto/pr-session.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)';

export class AddPrSessionDto {
  @ApiProperty()
  @IsInt()
  orderId: number;

  @ApiProperty()
  @IsInt()
  prStaffId: number;

  @ApiProperty({ required: false, description: 'Giờ vào; mặc định bây giờ' })
  @IsOptional()
  @IsDateString()
  startAt?: string;
}

export class UpdatePrSessionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiProperty({ required: false, nullable: true, description: 'null: còn trong phòng' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endAt?: string | null;
}

export class PrBranchQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class PrStatsQuery extends PrBranchQuery {
  @ApiProperty({ description: 'Ngày kinh doanh đầu (YYYY-MM-DD)' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from: string;

  @ApiProperty({ description: 'Ngày kinh doanh cuối (YYYY-MM-DD)' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to: string;
}
```

- [ ] **Step 4: `canAssignPr` trong `pr.service.ts`**

Dưới `canViewPr`:
```ts
// Who may put PR/KTV into a room: anyone who sells (cashiers, managers) and
// any account marked "Quản lý PR/KTV".
export function canAssignPr(user: AuthUser): boolean {
  return SALES.includes(user.role) || user.managesPr;
}
```
Đổi import thành `import { MANAGERS, SALES } from '../auth/roles';`.

- [ ] **Step 5: Viết `pr-sessions.service.ts`**

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { orderDetailInclude } from '../orders/order-include';
import { lockOrderRow } from '../orders/order-lock';
import { canAssignPr } from './pr.service';
import { checkSessionTimes } from './pr-session-rules';
import { AddPrSessionDto, UpdatePrSessionDto } from './dto/pr-session.dto';

type Db = Prisma.TransactionClient;

const CLOSED_MESSAGE = 'Phòng đã đóng, không sửa PR được nữa';

@Injectable()
export class PrSessionsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Puts a PR/KTV into an open room from `startAt` (default now).
  add(user: AuthUser, dto: AddPrSessionDto) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOpenOrder(tx, user, dto.orderId);
      const staff = await this.lockStaff(tx, dto.prStaffId);
      if (staff.branchId !== order.branchId) {
        throw new BadRequestException('PR/KTV không thuộc cơ sở này');
      }
      if (!staff.active) {
        throw new BadRequestException(`${staff.name} đã nghỉ, không gán được`);
      }
      await this.assertNotElsewhere(tx, staff);
      const now = new Date();
      const startAt = dto.startAt ? new Date(dto.startAt) : now;
      this.assertTimes(order.startTime, startAt, null, now);
      await tx.prSession.create({
        data: {
          branchId: order.branchId,
          orderId: order.id,
          prStaffId: staff.id,
          startAt,
          createdById: user.id,
        },
      });
      return this.detail(tx, order.id);
    });
  }

  // "Ra": the visit ends now.
  end(user: AuthUser, id: number) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisit(tx, user, id);
      const order = await this.lockOpenOrder(tx, user, visit.orderId);
      // Re-read under the order lock: another device may have ended it.
      const current = await tx.prSession.findUniqueOrThrow({
        where: { id },
        select: { startAt: true, endAt: true },
      });
      if (current.endAt) throw new ConflictException('PR đã ra khỏi phòng');
      const now = new Date();
      await tx.prSession.update({
        where: { id },
        data: { endAt: now < current.startAt ? current.startAt : now },
      });
      return this.detail(tx, order.id);
    });
  }

  // Corrects the times of a visit; endAt null puts the PR back in the room.
  update(user: AuthUser, id: number, dto: UpdatePrSessionDto) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisit(tx, user, id);
      const order = await this.lockOpenOrder(tx, user, visit.orderId);
      const current = await tx.prSession.findUniqueOrThrow({
        where: { id },
        select: { startAt: true, endAt: true, prStaffId: true },
      });
      const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
      const endAt =
        dto.endAt === undefined
          ? current.endAt
          : dto.endAt && new Date(dto.endAt);
      if (current.endAt && endAt === null) {
        const staff = await this.lockStaff(tx, current.prStaffId);
        await this.assertNotElsewhere(tx, staff, id);
      }
      this.assertTimes(order.startTime, startAt, endAt, new Date());
      await tx.prSession.update({ where: { id }, data: { startAt, endAt } });
      return this.detail(tx, order.id);
    });
  }

  // Removes a visit entered by mistake (only while the room is open).
  remove(user: AuthUser, id: number) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisit(tx, user, id);
      const order = await this.lockOpenOrder(tx, user, visit.orderId);
      await tx.prSession.delete({ where: { id } });
      return this.detail(tx, order.id);
    });
  }

  // ---- rules ---------------------------------------------------------------

  private assertAssign(user: AuthUser) {
    if (!canAssignPr(user)) {
      throw new ForbiddenException('Bạn không có quyền gán PR/KTV vào phòng');
    }
  }

  // Order first, then the PR row (the same order everywhere, and checkout
  // only locks orders and products): no deadlocks.
  private async lockOpenOrder(tx: Db, user: AuthUser, orderId: number) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, startTime: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy phòng đang hát');
    this.branchScope.assertBranchAccess(user, order.branchId);
    await lockOrderRow(tx, orderId, OrderStatus.PENDING, CLOSED_MESSAGE);
    if (!order.startTime) {
      throw new BadRequestException('Phòng chưa bắt đầu tính giờ');
    }
    return { ...order, startTime: order.startTime };
  }

  // Locks the PrStaff row so two devices cannot put the same PR into two
  // rooms at once.
  private async lockStaff(tx: Db, prStaffId: number) {
    await tx.$queryRaw`SELECT id FROM "PrStaff" WHERE id = ${prStaffId} FOR UPDATE`;
    const staff = await tx.prStaff.findUnique({
      where: { id: prStaffId },
      select: { id: true, branchId: true, name: true, active: true },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy PR/KTV');
    return staff;
  }

  // At most one open visit per PR (uses the PrSession(prStaffId, endAt) index).
  private async assertNotElsewhere(
    tx: Db,
    staff: { id: number; name: string },
    exceptId?: number,
  ) {
    const open = await tx.prSession.findFirst({
      where: {
        prStaffId: staff.id,
        endAt: null,
        id: exceptId ? { not: exceptId } : undefined,
      },
      select: { order: { select: { room: { select: { name: true } } } } },
    });
    if (open) {
      const room = open.order.room?.name ?? 'khác';
      throw new ConflictException(`${staff.name} đang ở phòng ${room}`);
    }
  }

  private assertTimes(
    orderStart: Date,
    startAt: Date,
    endAt: Date | null,
    now: Date,
  ) {
    const error = checkSessionTimes({ orderStart, startAt, endAt, now });
    if (error) throw new BadRequestException(error);
  }

  private async getVisit(tx: Db, user: AuthUser, id: number) {
    const visit = await tx.prSession.findUnique({
      where: { id },
      select: { id: true, branchId: true, orderId: true },
    });
    if (!visit) throw new NotFoundException('Không tìm thấy lượt PR');
    this.branchScope.assertBranchAccess(user, visit.branchId);
    return visit;
  }

  private detail(tx: Db, orderId: number) {
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderDetailInclude,
    });
  }
}
```

- [ ] **Step 6: Route và module**

`pr.module.ts`: `providers: [PrService, PrSessionsService]`.

`pr.controller.ts`: inject `private readonly sessions: PrSessionsService`, import các DTO, rồi thêm:
```ts
  @Post('sessions')
  addSession(@CurrentUser() user: AuthUser, @Body() dto: AddPrSessionDto) {
    return this.sessions.add(user, dto);
  }

  @Post('sessions/:id/end')
  @HttpCode(HttpStatus.OK)
  endSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sessions.end(user, id);
  }

  @Patch('sessions/:id')
  updateSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrSessionDto,
  ) {
    return this.sessions.update(user, id, dto);
  }

  @Delete('sessions/:id')
  removeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sessions.remove(user, id);
  }
```
Sửa comment đầu controller để nói thêm: quyền gán PR vào phòng là `canAssignPr`.

- [ ] **Step 7: Chạy e2e, xác nhận qua**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand`
Expected: PASS hết. Test "closes open visits at checkout" chứng minh phần của Task 2.

- [ ] **Step 8: Lint và commit**

```bash
cd 502-backend && npm run lint && npm test
git add 502-backend/src/pr 502-backend/test/pr.e2e-spec.ts
git commit -m "feat(pr): gán PR/KTV vào phòng với giờ vào/giờ ra"
```

---

### Task 4: Danh sách chọn PR (`GET /pr/available`)

**Files:**
- Modify: `502-backend/src/pr/pr-sessions.service.ts`, `502-backend/src/pr/pr.controller.ts`
- Test: `502-backend/test/pr.e2e-spec.ts`

**Interfaces:**
- Consumes: `canAssignPr` (Task 3), `businessDateOf` (`common/dates`).
- Produces: `GET /pr/available?branch` → `AvailablePr[]` = `{id, code, name, checkedIn: boolean, currentRoom: {orderId: number, roomName: string | null} | null}[]`, kèm header `X-Total-Count`.

- [ ] **Step 1: Viết e2e hỏng**

Thêm vào `describe('PR/KTV in rooms')`, **trước** `it('closes open visits at checkout…')`. Lúc này Hoa đang ở P102 (lượt mở trên `orderB`) và Cúc không ở phòng nào:
```ts
    it('lists who can be put into a room, with where they are', async () => {
      await as('ql1_cs1').post('/pr/attendance', { prStaffId: cucId }).expect(201);
      const res = await as('tn1_cs1').get('/pr/available').expect(200);
      expect(res.headers['x-total-count']).toBeDefined();
      const list = res.body as Json[];
      // Checked in today first.
      expect(list[0]).toMatchObject({ id: cucId, checkedIn: true, currentRoom: null });
      expect(list.find((p) => p.id === hoaId)).toMatchObject({
        checkedIn: false,
        currentRoom: { orderId: orderB, roomName: 'P102' },
      });
      await as('tn1_cs2').get('/pr/available?branch=cs1').expect(403);
      await as('pv1_cs1').get('/pr/available').expect(200); // managesPr
    });
```
(Nếu các test cũ đã điểm danh một người khác hôm nay và người đó vẫn `active`, thứ tự có thể khác; khi đó kiểm tra bằng `list.find` thay cho `list[0]`.)

- [ ] **Step 2: Chạy, xác nhận hỏng (404)**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand -t "lists who can be put"`
Expected: FAIL.

- [ ] **Step 3: Viết `available`**

Trong `PrSessionsService`, thêm hằng `const AVAILABLE_LIMIT = 500;` và import `businessDateOf`. Ngày trong DB là `@db.Date`, đọc về dưới dạng nửa đêm UTC (cùng quy ước `toDbDate` của `pr.service.ts`):
```ts
  // Active PR/KTV of the branch for the room page: who is on today's roll
  // call (first), and the room each one is sitting in right now.
  async available(
    user: AuthUser,
    branch?: string,
  ): Promise<[AvailablePr[], number]> {
    this.assertAssign(user);
    const branchId = await this.branchScope.resolveBranchId(user, branch);
    const today = new Date(`${businessDateOf(new Date())}T00:00:00Z`);
    const where: Prisma.PrStaffWhereInput = { branchId, active: true };
    const [rows, total] = await Promise.all([
      this.prisma.prStaff.findMany({
        where,
        orderBy: { name: 'asc' },
        take: AVAILABLE_LIMIT,
        select: {
          id: true,
          code: true,
          name: true,
          // Unique (prStaffId, businessDate) index.
          attendances: {
            where: { businessDate: today, checkOutAt: null },
            select: { id: true },
            take: 1,
          },
          // PrSession(prStaffId, endAt) index.
          sessions: {
            where: { endAt: null },
            select: { orderId: true, order: { select: { room: { select: { name: true } } } } },
            take: 1,
          },
        },
      }),
      this.prisma.prStaff.count({ where }),
    ]);
    const list = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      checkedIn: r.attendances.length > 0,
      currentRoom: r.sessions[0]
        ? { orderId: r.sessions[0].orderId, roomName: r.sessions[0].order.room?.name ?? null }
        : null,
    }));
    // Sorting at most 500 rows already loaded (nothing is summed).
    list.sort((a, b) => Number(b.checkedIn) - Number(a.checkedIn));
    return [list, total];
  }
```
Khai báo và export ở đầu file:
```ts
export interface AvailablePr {
  id: number;
  code: string | null;
  name: string;
  checkedIn: boolean;
  currentRoom: { orderId: number; roomName: string | null } | null;
}
```
(`Array.prototype.sort` ổn định, nên thứ tự theo tên được giữ trong mỗi nhóm.)

Controller (dùng `withTotalCount`, `Res`, `Query` đã import sẵn):
```ts
  @Get('available')
  available(
    @CurrentUser() user: AuthUser,
    @Query() query: PrBranchQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.sessions.available(user, query.branch));
  }
```

- [ ] **Step 4: Chạy lại cả file, xác nhận qua**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/pr 502-backend/test/pr.e2e-spec.ts
git commit -m "feat(pr): danh sách PR để gán vào phòng (điểm danh, đang ở phòng nào)"
```

---

### Task 5: Thống kê giờ PR (`GET /pr/stats`)

**Files:**
- Modify: `502-backend/src/pr/pr-sessions.service.ts` (inject `ReportPrismaService`), `502-backend/src/pr/pr.controller.ts`
- Test: `502-backend/test/pr.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `canViewPr` (`pr.service.ts`).
  - `businessDayRange`, `MAX_REPORT_DAYS` (`common/dates`).
  - `ReportPrismaService`, `SharedRequestInterceptor`.
- Produces: `GET /pr/stats?branch&from&to` → `PrStats = { range: {from, to}, totals: {minutes, sessions, rooms}, rows: {prStaffId, minutes, sessions, rooms}[] }`.

- [ ] **Step 1: Viết e2e hỏng**

Thêm làm `it` **cuối cùng** của `describe('PR/KTV in rooms')`. Lúc này mọi lượt đã đóng: Cúc có một lượt 90→30 phút trước (60 phút) và hai lượt ngắn.
```ts
    it('sums the hours of each PR over a range', async () => {
      const res = await as('ql1_cs1')
        .get(`/pr/stats?from=${today}&to=${today}`)
        .expect(200);
      const stats = res.body as {
        totals: { minutes: number; sessions: number; rooms: number };
        rows: { prStaffId: number; minutes: number; sessions: number; rooms: number }[];
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
      await as('tn1_cs2').get(`/pr/stats?branch=cs1&from=${today}&to=${today}`).expect(403);
      await as('hdqt_pr').get(`/pr/stats?branch=cs1&from=${today}&to=${today}`).expect(200);
      await as('ql1_cs1').get('/pr/stats?from=2024-01-01&to=2026-01-01').expect(400);
    });
```
Chú ý: `tn1_cs2` không có `managesPr`, nên bị chặn bởi `canViewPr` (403), không phải bởi phạm vi cơ sở.

Ghi chú về con số 2 lượt của Cúc:
- lượt 90→30 phút trước;
- lượt do `pv1_cs1` thêm rồi cho ra (khoảng 0 phút);
- lượt bị xóa không tính.

`rooms = 1` vì cả hai lượt đều ở `orderA`. `minutes` ≥ 60, và < 63 vì lượt ngắn tính 0–1 phút.

- [ ] **Step 2: Chạy, xác nhận hỏng**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand -t "sums the hours"`
Expected: FAIL (404).

- [ ] **Step 3: Viết `stats`**

Inject `private reportDb: ReportPrismaService` (từ `../prisma/report-prisma.service`) vào `PrSessionsService`, import `canViewPr` từ `./pr.service`, `businessDayRange` và `MAX_REPORT_DAYS` từ `../common/dates`:
```ts
  // Hours each PR/KTV spent in rooms over business days [from, to]; a visit
  // belongs to the day it started, and an open one counts up to now. Summed in
  // SQL on the report pool (PrSession(branchId, startAt) index).
  async stats(user: AuthUser, query: PrStatsQuery) {
    if (!canViewPr(user)) {
      throw new ForbiddenException('Bạn không có quyền xem PR/KTV');
    }
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const { gte, lt } = businessDayRange(query.from, query.to);
    if (!gte || !lt) throw new BadRequestException('Vui lòng chọn khoảng ngày');
    const days = Math.round((lt.getTime() - gte.getTime()) / 86_400_000);
    if (days > MAX_REPORT_DAYS) {
      throw new BadRequestException(`Chỉ xem tối đa ${MAX_REPORT_DAYS} ngày`);
    }
    const minutesSql = Prisma.sql`CEIL(EXTRACT(EPOCH FROM (COALESCE("endAt", now()) - "startAt")) / 60)`;
    const where = Prisma.sql`"branchId" = ${branchId} AND "startAt" >= ${gte} AND "startAt" < ${lt}`;
    const [rows, totals] = await Promise.all([
      this.reportDb.$queryRaw<
        { prStaffId: number; minutes: number; sessions: number; rooms: number }[]
      >`
        SELECT "prStaffId",
               GREATEST(COALESCE(SUM(${minutesSql}), 0), 0)::int AS minutes,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT "orderId")::int AS rooms
        FROM "PrSession" WHERE ${where}
        GROUP BY "prStaffId"`,
      this.reportDb.$queryRaw<{ minutes: number; sessions: number; rooms: number }[]>`
        SELECT GREATEST(COALESCE(SUM(${minutesSql}), 0), 0)::int AS minutes,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT "orderId")::int AS rooms
        FROM "PrSession" WHERE ${where}`,
    ]);
    return {
      range: { from: query.from, to: query.to },
      totals: totals[0],
      rows,
    };
  }
```
(Số dòng kết quả tối đa bằng số PR của cơ sở, không cần `LIMIT`. Tổng tính bằng SQL riêng, không cộng từ `rows`. Nếu `MAX_REPORT_DAYS` có ý nghĩa khác (366 ngày gồm cả hai đầu), dùng lại đúng kiểm tra mà `funds` hoặc `report-scope.ts` đang dùng cho giới hạn này.)

Controller: import `UseInterceptors` và `SharedRequestInterceptor` (`../common/shared-request.interceptor`):
```ts
  // Read-only sums on the report pool: identical requests in flight share one.
  @Get('stats')
  @UseInterceptors(SharedRequestInterceptor)
  stats(@CurrentUser() user: AuthUser, @Query() query: PrStatsQuery) {
    return this.sessions.stats(user, query);
  }
```

- [ ] **Step 4: Kiểm tra index bằng EXPLAIN**

Run:
```bash
docker exec -it kara502-pg psql -U postgres -d karaoke_test -c "SET enable_seqscan = off; EXPLAIN SELECT \"prStaffId\", COUNT(*) FROM \"PrSession\" WHERE \"branchId\" = 1 AND \"startAt\" >= now() - interval '1 day' AND \"startAt\" < now() GROUP BY 1;"
docker exec -it kara502-pg psql -U postgres -d karaoke_test -c "SET enable_seqscan = off; EXPLAIN SELECT id FROM \"PrSession\" WHERE \"prStaffId\" = 1 AND \"endAt\" IS NULL;"
docker exec -it kara502-pg psql -U postgres -d karaoke_test -c "SET enable_seqscan = off; EXPLAIN UPDATE \"PrSession\" SET \"endAt\" = now() WHERE \"orderId\" = 1 AND \"endAt\" IS NULL;"
```
(user/DB lấy từ `test/e2e.env`.)
Expected: lần lượt `Index Scan`/`Bitmap Index Scan` trên `PrSession_branchId_startAt_idx`, `PrSession_prStaffId_endAt_idx` và `PrSession_orderId_idx`.

- [ ] **Step 5: Chạy cả file e2e, xác nhận qua**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 502-backend/src/pr 502-backend/test/pr.e2e-spec.ts
git commit -m "feat(pr): thống kê giờ PR trong phòng theo khoảng ngày"
```

---

### Task 6: Xóa PR và "Xóa dữ liệu" xét lượt phòng

**Files:**
- Modify: `502-backend/src/pr/pr.service.ts` (`removeStaff`)
- Modify: `502-backend/src/data-purge/data-purge.service.ts:78-100`
- Test: `502-backend/test/pr.e2e-spec.ts`, `502-backend/test/board.e2e-spec.ts` (nếu test purge đang kiểm tra đúng tập khóa của `deleted`)

**Interfaces:**
- Consumes: `prisma.prSession` (Task 1).
- Produces: `removeStaff` giữ người đã từng vào phòng (đặt `active=false`); log purge có thêm khóa `prSessions`.

- [ ] **Step 1: Viết e2e hỏng**

Thêm vào cuối `describe('PR/KTV in rooms')`:
```ts
    it('keeps a PR who was ever in a room', async () => {
      // Hoa was never on a roll call but sat in rooms.
      const res = await as('ql1_cs1').delete(`/pr/staff/${hoaId}`).expect(200);
      expect(res.body).toEqual({ deleted: false });
    });
```

- [ ] **Step 2: Chạy, xác nhận hỏng**

Run: `cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand -t "keeps a PR who was ever"`
Expected: FAIL (409 do khóa ngoại, hoặc `deleted: true`).

- [ ] **Step 3: Sửa `removeStaff`**

```ts
  // Removes someone never on a roll call nor in a room; otherwise marks them
  // as left, so past roll calls and room visits keep their name.
  async removeStaff(user: AuthUser, id: number) {
    this.assertManage(user);
    await this.getStaff(user, id);
    const [attended, visited] = await Promise.all([
      this.prisma.prAttendance.findFirst({ where: { prStaffId: id }, select: { id: true } }),
      this.prisma.prSession.findFirst({ where: { prStaffId: id }, select: { id: true } }),
    ]);
    if (attended || visited) {
      /* … giữ nguyên nhánh cập nhật active=false … */
    }
    /* … */
  }
```
Frontend (Task 9) sửa thông báo tương ứng.

- [ ] **Step 4: Sửa purge**

Trong `data-purge.service.ts`, trong `counts`, thêm **trước** `orders` (lượt tham chiếu đơn và PR):
```ts
          prSessions: (await tx.prSession.deleteMany({ where: own })).count,
```
Nếu `board.e2e-spec.ts` so khớp đúng tập khóa của `deleted` (ví dụ `toEqual({...})`), thêm `prSessions` vào đó.

- [ ] **Step 5: Chạy e2e PR và board**

Run:
```bash
cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand
cd 502-backend && npx jest --config test/jest-e2e.json test/board.e2e-spec.ts --runInBand
```
Expected: PASS cả hai.

- [ ] **Step 6: Commit**

```bash
git add 502-backend/src 502-backend/test
git commit -m "fix(pr): giữ PR đã từng vào phòng; xóa dữ liệu gồm lượt PR"
```

---

### Task 7: Frontend: kiểu, quyền và hàng đợi ghi dùng chung trong trang phòng

**Files:**
- Modify: `502-frontend/src/lib/types.ts`
- Modify: `502-frontend/src/lib/permissions.ts`
- Modify: `502-frontend/src/app/[branch]/sales/rooms/[id]/page.tsx:222-245` (`saveOrder`)

**Interfaces:**
- Consumes: API của Task 3–5.
- Produces:
  - Types `PrSession`, `AvailablePr`, `PrStatsRow`, `PrStats`, `Order.prSessions?: PrSession[]`.
  - Quyền `"pr.assign"`.
  - Trong trang phòng: `runOrderAction(send: () => Promise<Order>, errorMessage: string): Promise<void>`.

- [ ] **Step 1: Types**

Trong `lib/types.ts`, sau `PrAttendance`:
```ts
// A PR/KTV visit to a room (not billed): Order.prSessions.
export interface PrSession {
  id: number;
  orderId: number;
  prStaffId: number;
  startAt: string;
  endAt: string | null; // null: still in the room
  prStaff: Pick<PrStaff, "id" | "code" | "name">;
}

// GET /pr/available: who can be put into a room, and where they are now.
export interface AvailablePr {
  id: number;
  code: string | null;
  name: string;
  checkedIn: boolean;
  currentRoom: { orderId: number; roomName: string | null } | null;
}

// GET /pr/stats: hours in rooms per PR/KTV over a range of business days.
export interface PrStatsRow {
  prStaffId: number;
  minutes: number;
  sessions: number;
  rooms: number;
}

export interface PrStats {
  range: { from: string; to: string };
  totals: Omit<PrStatsRow, "prStaffId">;
  rows: PrStatsRow[];
}
```
Trong `interface Order`, thêm:
```ts
  // Only on a single order (GET/PATCH /orders/:id), not in bill lists.
  prSessions?: PrSession[];
```

- [ ] **Step 2: Quyền**

`lib/permissions.ts`:
- Thêm vào `Permission`: `| "pr.assign" // put PR/KTV into a room (sales roles, and managesPr)`.
- Thêm vào `MATRIX`: `"pr.assign": [...MANAGERS, "CASHIER"],`.
- Đổi `PR_MANAGER_PERMISSIONS` thành `["pr", "pr.view", "pr.assign"]`.

- [ ] **Step 3: Hàng đợi ghi dùng chung trong trang phòng**

Thay `saveOrder` (dòng 222–245) bằng:
```ts
  // Every write of the order goes through one queue, each built on the latest
  // saved order, so quick taps and PR/KTV changes never overwrite each other.
  // `send` runs when the write's turn comes; returning null skips it.
  const enqueue = useCallback(
    (
      send: (current: Order) => Promise<Order> | null,
      errorMessage: string,
      onDone?: (saved: boolean) => void,
    ) => {
      pendingRef.current += 1;
      queueRef.current = queueRef.current.then(async () => {
        const current = orderRef.current;
        let saved = false;
        try {
          const request = current && send(current);
          if (!request) return;
          applyOrder(await request);
          saved = true;
        } catch (error) {
          notify.error(error, errorMessage);
        } finally {
          pendingRef.current -= 1;
          onDone?.(saved);
        }
      });
      return queueRef.current;
    },
    [applyOrder, notify],
  );

  // `buildPatch` runs when the edit's turn comes; returning null skips it.
  const saveOrder = useCallback(
    (buildPatch: (current: Order) => Record<string, unknown> | null, onDone?: (saved: boolean) => void) =>
      enqueue(
        (current) => {
          const patch = buildPatch(current);
          return patch && api.patch<Order>(`/orders/${current.id}`, patch).then((res) => res.data);
        },
        "Không thể lưu thay đổi",
        onDone,
      ),
    [enqueue],
  );

  // PR/KTV writes (/pr/sessions…) answer with the whole order.
  const runOrderAction = useCallback(
    (send: () => Promise<Order>, errorMessage: string) => enqueue(() => send(), errorMessage),
    [enqueue],
  );
```

- [ ] **Step 4: Lint và build**

Run: `cd 502-frontend && npm run lint && npm run build`
Expected: không lỗi. Trang phòng vẫn gọi món bình thường (kiểm ở Task 8).

- [ ] **Step 5: Commit**

```bash
git add 502-frontend/src/lib 502-frontend/src/app/[branch]/sales/rooms
git commit -m "refactor(sales): hàng đợi ghi đơn dùng chung; kiểu và quyền PR trong phòng"
```

---

### Task 8: Frontend: tab PR/KTV và danh sách lượt trong trang phòng

**Files:**
- Create: `502-frontend/src/components/sales/pr-picker.tsx`
- Create: `502-frontend/src/components/sales/room-pr-list.tsx`
- Modify: `502-frontend/src/app/[branch]/sales/rooms/[id]/page.tsx`

**Interfaces:**
- Consumes:
  - `runOrderAction` (Task 7), `AvailablePr`, `PrSession`, `can(user, "pr.assign")`.
  - `useApiData`, `useNow`, `minutesBetween`/`formatElapsed`, `formatTime`, `toDateTimeInput` (`lib/format.ts`).
  - `ConfirmDialog`, shadcn `Tabs`/`Dialog`/`Field`/`Input`.
- Produces:
  - `<PrPicker branch orderId sessions onAdd />`, trong đó `onAdd(prStaffId: number) => void`.
  - `<RoomPrList sessions canEdit onEnd onSave onRemove />`.

- [ ] **Step 1: `pr-picker.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ContactIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { useApiData } from "@/hooks/use-api-data";
import type { AvailablePr, PrSession } from "@/lib/types";

// PR/KTV tiles of the room page: tap one to put them into this room from now.
// Someone sitting in another room is shown there and cannot be tapped.
export function PrPicker({
  branch,
  orderId,
  sessions,
  onAdd,
}: {
  branch: string;
  orderId: number;
  sessions: PrSession[];
  onAdd: (prStaffId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, total, loading, reload } = useApiData<AvailablePr[]>(
    "/pr/available",
    { branch },
    [],
    "Không thể tải danh sách PR/KTV",
  );
  // Reload when this room's visits change (added, ended, removed).
  const signature = sessions.map((s) => `${s.id}:${s.endAt ?? ""}`).join(",");
  useEffect(() => {
    if (signature) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on the room's visits only
  }, [signature]);

  const keyword = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      data.filter(
        (p) => !keyword || p.name.toLowerCase().includes(keyword) || p.code?.toLowerCase().includes(keyword),
      ),
    [data, keyword],
  );

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Tìm tên hoặc mã PR..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm PR/KTV"
        />
      </InputGroup>
      <ListLimitNotice shown={data.length} total={total} noun="người" hint="Tìm theo tên hoặc mã." />
      {!loading && shown.length === 0 ? (
        <EmptyState
          icon={ContactIcon}
          title={data.length === 0 ? "Chưa có PR/KTV đang làm" : "Không tìm thấy PR/KTV"}
          description={data.length === 0 ? "Thêm PR/KTV ở trang Thống kê PR." : "Thử từ khóa khác."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 @lg/menu:grid-cols-3 @3xl/menu:grid-cols-4">
          {shown.map((pr) => {
            const here = pr.currentRoom?.orderId === orderId;
            const elsewhere = pr.currentRoom && !here;
            return (
              <Button
                key={pr.id}
                variant="outline"
                disabled={!!pr.currentRoom}
                className="relative h-auto min-h-20 flex-col items-start justify-between gap-2 p-3 text-left whitespace-normal"
                onClick={() => onAdd(pr.id)}
              >
                {here && <Badge className="absolute top-2 right-2">Trong phòng</Badge>}
                <span className="line-clamp-2 pr-8 font-medium">{pr.name}</span>
                <span className="flex w-full flex-wrap items-center gap-1 text-xs font-normal text-muted-foreground">
                  {pr.code && <span>{pr.code}</span>}
                  {pr.checkedIn && <Badge variant="success">Đã điểm danh</Badge>}
                  {elsewhere && <span>Đang ở phòng {pr.currentRoom?.roomName ?? "khác"}</span>}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```
(Nếu `ListLimitNotice` hoặc `EmptyState` có props khác, đọc `components/data-states.tsx` và khớp theo cách trang `pr/staff` dùng.)

- [ ] **Step 2: `room-pr-list.tsx`**

```tsx
"use client";

import { Fragment, useState } from "react";
import { LogOutIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNow } from "@/hooks/use-now";
import { formatElapsed, formatTime, minutesBetween, toDateTimeInput } from "@/lib/format";
import type { PrSession } from "@/lib/types";

export interface PrTimes {
  startAt: string; // ISO
  endAt: string | null;
}

// The PR/KTV visits of a room, in the bill card: time in – time out (or the
// live time of who is still sitting), with Ra / Sửa giờ / Xóa for who may.
export function RoomPrList({
  sessions,
  canEdit,
  onEnd,
  onSave,
  onRemove,
}: {
  sessions: PrSession[];
  canEdit: boolean;
  onEnd: (id: number) => void;
  onSave: (id: number, times: PrTimes) => Promise<void>;
  onRemove: (id: number) => void;
}) {
  const now = useNow();
  const [editing, setEditing] = useState<PrSession | null>(null);
  const [form, setForm] = useState({ startAt: "", endAt: "" });
  const [removing, setRemoving] = useState<PrSession | null>(null);

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có PR/KTV trong phòng.</p>;
  }

  const openEdit = (s: PrSession) => {
    setEditing(s);
    setForm({
      startAt: toDateTimeInput(new Date(s.startAt)),
      endAt: s.endAt ? toDateTimeInput(new Date(s.endAt)) : "",
    });
  };

  return (
    <>
      <ItemGroup className="rounded-lg border">
        {sessions.map((s, index) => {
          const minutes = minutesBetween(new Date(s.startAt), s.endAt ? new Date(s.endAt) : now);
          return (
            <Fragment key={s.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" className="rounded-none px-3">
                <ItemContent className="min-w-32">
                  <ItemTitle>
                    {s.prStaff.name}
                    {!s.endAt && <Badge variant="destructive">Đang ngồi</Badge>}
                  </ItemTitle>
                  <ItemDescription className="tabular-nums">
                    {formatTime(s.startAt)} – {s.endAt ? formatTime(s.endAt) : "…"} · {formatElapsed(minutes)}
                  </ItemDescription>
                </ItemContent>
                {canEdit && (
                  <ItemActions className="ml-auto">
                    {!s.endAt && (
                      <Button variant="outline" size="sm" onClick={() => onEnd(s.id)}>
                        <LogOutIcon data-icon="inline-start" />
                        Ra
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Sửa giờ ${s.prStaff.name}`} onClick={() => openEdit(s)}>
                      <PencilIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Xóa ${s.prStaff.name}`} onClick={() => setRemoving(s)}>
                      <Trash2Icon />
                    </Button>
                  </ItemActions>
                )}
              </Item>
            </Fragment>
          );
        })}
      </ItemGroup>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="flex flex-col gap-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editing) return;
              await onSave(editing.id, {
                startAt: new Date(form.startAt).toISOString(),
                endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
              });
              setEditing(null);
            }}
          >
            <DialogHeader>
              <DialogTitle>Sửa giờ {editing?.prStaff.name}</DialogTitle>
              <DialogDescription>Để trống giờ ra nếu PR vẫn còn trong phòng.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="pr-start">Giờ vào</FieldLabel>
                <Input
                  id="pr-start"
                  type="datetime-local"
                  required
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pr-end">Giờ ra</FieldLabel>
                <Input
                  id="pr-end"
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Hủy
              </Button>
              <Button type="submit">Lưu</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Xóa lượt của ${removing?.prStaff.name ?? ""}?`}
        description="Chỉ dùng khi gán nhầm. Lượt bị xóa không được tính giờ."
        confirmLabel="Xóa"
        destructive
        onConfirm={async () => {
          if (removing) onRemove(removing.id);
        }}
      />
    </>
  );
}
```
Trước khi dùng, kiểm tra hai hàm trong `lib/format.ts`:
- `minutesBetween(start: Date, end: Date)`: dòng chú thích "Minutes started between two moments" ngay dưới `formatHours`. Nếu tên hoặc chữ ký khác thì khớp theo đó.
- `formatTime`: phải nhận chuỗi ISO, như trang phòng đang dùng `formatTime(order.startTime)`.

- [ ] **Step 3: Gắn vào trang phòng**

Trong `page.tsx`:
1. Import `Tabs, TabsContent, TabsList, TabsTrigger` từ `@/components/ui/tabs`, `PrPicker` và `RoomPrList, type PrTimes`.
2. Thêm hằng:
   ```ts
   const canAssignPr = can(user, "pr.assign");
   const showLeft = canOperate || canAssignPr;
   ```
3. Thêm các hàm gọi API, đặt sau `setStaffMember`:
   ```ts
   const addPr = (prStaffId: number) =>
     runOrderAction(
       () => api.post<Order>("/pr/sessions", { orderId: orderRef.current!.id, prStaffId }).then((r) => r.data),
       "Không thể thêm PR/KTV",
     );
   const endPr = (id: number) =>
     runOrderAction(() => api.post<Order>(`/pr/sessions/${id}/end`).then((r) => r.data), "Không thể cho PR ra");
   const savePr = (id: number, times: PrTimes) =>
     runOrderAction(() => api.patch<Order>(`/pr/sessions/${id}`, times).then((r) => r.data), "Không thể sửa giờ PR");
   const removePr = (id: number) =>
     runOrderAction(() => api.delete<Order>(`/pr/sessions/${id}`).then((r) => r.data), "Không thể xóa lượt PR");
   ```
4. Lưới trang: thay `canOperate &&` trong `className` của div lưới (dòng ~480) bằng `showLeft &&`. Thẻ bên phải: thay `canOperate && "order-first …"` bằng `showLeft && "order-first …"`.
5. Thẻ bên trái: đổi `{canOperate && (<Card …>…Thực đơn…</Card>)}` thành:
   ```tsx
   {showLeft && (
     <Card className="@container/menu min-w-0">
       <Tabs defaultValue={canOperate ? "menu" : "pr"} className="gap-0">
         <CardHeader>
           <CardTitle>{canOperate ? "Thực đơn & PR/KTV" : "PR/KTV"}</CardTitle>
           <CardDescription>Chạm vào món hoặc PR/KTV để thêm vào phòng.</CardDescription>
           {canOperate && canAssignPr && (
             <CardAction>
               <TabsList>
                 <TabsTrigger value="menu">Thực đơn</TabsTrigger>
                 <TabsTrigger value="pr">PR/KTV</TabsTrigger>
               </TabsList>
             </CardAction>
           )}
         </CardHeader>
         {canOperate && (
           <TabsContent value="menu">
             <CardContent className="flex flex-col gap-4">{/* nội dung CardContent thực đơn hiện có, giữ nguyên */}</CardContent>
           </TabsContent>
         )}
         {canAssignPr && (
           <TabsContent value="pr">
             <CardContent>
               <PrPicker branch={branch} orderId={order.id} sessions={order.prSessions ?? []} onAdd={addPr} />
             </CardContent>
           </TabsContent>
         )}
       </Tabs>
     </Card>
   )}
   ```
   Nếu `CardHeader` bị vỡ bố cục khi có `CardAction` + `TabsList` ở 360px, đưa `TabsList` xuống đầu `CardContent` với `className="w-full"`. Nhớ tính thêm `pt-4` hoặc khoảng cách tương ứng.
6. Thẻ hóa đơn: ngay dưới khối CSKH/Phục vụ (`FieldGroup` hoặc đoạn `<p>` read-only), thêm:
   ```tsx
   <div className="flex flex-col gap-2">
     <h3 className="text-sm font-medium">PR/KTV</h3>
     <RoomPrList
       sessions={order.prSessions ?? []}
       canEdit={canAssignPr}
       onEnd={endPr}
       onSave={savePr}
       onRemove={removePr}
     />
   </div>
   ```
7. Polling: `applyOrder(res.data)` đã nhận `prSessions` vì `GET /orders/:id` trả `orderDetailInclude`. Không cần sửa gì.
8. Trang phòng không tải sản phẩm và nhân viên khi `!canOperate` (giữ nguyên). `PrPicker` tự tải danh sách PR khi tab PR được mở; `TabsContent` của radix không render tab ẩn.

- [ ] **Step 4: Lint và build**

Run: `cd 502-frontend && npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 5: Kiểm tra trên trình duyệt**

Khởi động backend (`npm run start:dev` trong `502-backend`, DB dev đã `migrate deploy`) và frontend qua `preview_start` hoặc `npm run dev`. Đăng nhập `tn1_cs1` / `12345678`:
- Mở một phòng, chuyển tab PR/KTV, chạm một PR. Kết quả: PR hiện trong thẻ hóa đơn với "Đang ngồi" và thời lượng.
- Mở phòng thứ hai: PR đó có dòng "Đang ở phòng …", ô bị làm mờ.
- Bấm Ra, rồi Sửa giờ (giờ vào trước giờ mở phòng thì hiện toast lỗi tiếng Việt), rồi Xóa.
- Gọi món xen giữa các thao tác PR: không mất món nào.
- Hai tab trình duyệt cùng phòng: thay đổi PR bên này hiện bên kia trong ≤ 15 giây.
- Thanh toán: lượt đang mở được đóng.
- Đăng nhập `pv1_cs1` (STAFF): chỉ thấy danh sách PR, không có nút.
- `resize_window` 390px: không cuộn ngang, tab và nút không tràn.

Chụp màn hình làm bằng chứng.

- [ ] **Step 6: Commit**

```bash
git add 502-frontend/src/components/sales 502-frontend/src/app/[branch]/sales/rooms
git commit -m "feat(sales): tab PR/KTV trong phòng, ghi giờ vào/ra từng PR"
```

---

### Task 9: Frontend: trang "Thống kê PR"

**Files:**
- Modify: `502-frontend/src/app/[branch]/pr/staff/page.tsx`
- Modify: `502-frontend/src/app/[branch]/pr/staff/layout.tsx`
- Modify: `502-frontend/src/lib/navigation.ts:73`

**Interfaces:**
- Consumes: `PrStats` (Task 7), `GET /pr/stats` (Task 5), `DateRangePicker`/`DateRangeValue` (`components/date-range-picker.tsx`), `businessDate()`, `formatElapsed`, `formatNumber`.
- Produces: trang `/pr/staff` tên "Thống kê PR".

- [ ] **Step 1: Đổi tên**

- `navigation.ts`: `{ title: "Thống kê PR", path: "/pr/staff", icon: Contact, permission: "pr.view" }` (nếu có icon biểu đồ hợp hơn, như `ChartColumnBig` đã import sẵn, có thể dùng; không bắt buộc).
- `layout.tsx`: `export const metadata: Metadata = { title: "Thống kê PR" };`
- `PageHeader`: `title="Thống kê PR"`, `info="Danh sách PR/KTV của cơ sở và số giờ trong phòng theo khoảng ngày. Quản lý và tài khoản “Quản lý PR/KTV” mới thêm, sửa, xóa được."`

- [ ] **Step 2: Tải thống kê**

Thêm state và gọi API:
```tsx
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const { data: stats, loading: statsLoading } = useApiData<PrStats | null>(
    "/pr/stats",
    { branch, from: range.from, to: range.to },
    null,
    "Không thể tải thống kê PR",
  );
  const statsById = useMemo(
    () => new Map((stats?.rows ?? []).map((r) => [r.prStaffId, r])),
    [stats],
  );
  const [sortBy, setSortBy] = useState<"name" | "hours">("name");
```
Đổi `shown` để sắp theo giờ khi cần. Sắp xếp danh sách đã tải, không cộng gì:
```tsx
  const shown = useMemo(() => {
    const list = staff.filter(
      (s) => !keyword || s.name.toLowerCase().includes(keyword) || s.code?.toLowerCase().includes(keyword),
    );
    if (sortBy === "hours") {
      list.sort((a, b) => (statsById.get(b.id)?.minutes ?? 0) - (statsById.get(a.id)?.minutes ?? 0));
    }
    return list;
  }, [staff, keyword, sortBy, statsById]);
```
Import `DateRangePicker, type DateRangeValue` từ `@/components/date-range-picker`, `ToggleGroup, ToggleGroupItem`, `businessDate, formatElapsed, formatNumber` từ `@/lib/format`, và `PrStats` từ types.

- [ ] **Step 3: Thanh lọc, cột và hàng tổng**

- Thanh lọc: thêm `<DateRangePicker value={range} onChange={setRange} />` và
  ```tsx
  <ToggleGroup type="single" variant="outline" size="sm" value={sortBy} onValueChange={(v) => v && setSortBy(v as "name" | "hours")} aria-label="Sắp xếp">
    <ToggleGroupItem value="name">Tên</ToggleGroupItem>
    <ToggleGroupItem value="hours">Số giờ</ToggleGroupItem>
  </ToggleGroup>
  ```
  đặt cạnh ô tìm kiếm, trong `div` flex hiện có (thêm `flex-wrap`).
- Cột mới, sau "Họ tên":
  - `<TableHead className="text-right">Số giờ</TableHead>`
  - `<TableHead className={cn("text-right", SHOW_FROM.xs)}>Lượt</TableHead>`
  - `<TableHead className={cn("text-right", SHOW_FROM.sm)}>Số phòng</TableHead>`
- Cột "Điện thoại" chuyển sang `SHOW_FROM.md`, "Ghi chú" sang `SHOW_FROM.lg`, để cột giờ luôn hiện trên điện thoại.
- Ô dữ liệu:
  ```tsx
  const row = statsById.get(s.id);
  <TableCell className="text-right tabular-nums">{statsLoading && !stats ? "…" : formatElapsed(row?.minutes ?? 0)}</TableCell>
  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.xs)}>{formatNumber(row?.sessions ?? 0)}</TableCell>
  <TableCell className={cn("text-right tabular-nums", SHOW_FROM.sm)}>{formatNumber(row?.rooms ?? 0)}</TableCell>
  ```
- Cập nhật `colSpan` của `TableEmpty` (thêm 3) và mảng cột của `TableSkeleton` cho khớp thứ tự mới.
- Hàng tổng: dùng `TableFooter` (thêm vào import của `@/components/ui/table`; nếu file chưa export `TableFooter` thì dùng một `TableRow` cuối với `className="font-medium bg-muted/50"`). Lấy số từ `stats.totals`, không cộng từ danh sách:
  ```tsx
  {stats && (
    <TableFooter>
      <TableRow>
        <TableCell>Tổng cộng</TableCell>
        <TableCell className="text-right tabular-nums">{formatElapsed(stats.totals.minutes)}</TableCell>
        <TableCell className={cn("text-right tabular-nums", SHOW_FROM.xs)}>{formatNumber(stats.totals.sessions)}</TableCell>
        <TableCell className={cn("text-right tabular-nums", SHOW_FROM.sm)}>{formatNumber(stats.totals.rooms)}</TableCell>
        <TableCell colSpan={4} className={SHOW_FROM.md} />
      </TableRow>
    </TableFooter>
  )}
  ```
  Số ô trống phải khớp số cột còn lại. Kiểm tra lại cho đúng `SHOW_FROM`, để không có ô thừa trên màn hẹp.
- `CardDescription`: thêm "Số giờ là tổng thời gian trong phòng của các lượt bắt đầu trong khoảng ngày đã chọn."
- Thông báo xóa (`remove` và `ConfirmDialog`): đổi "đã có lượt điểm danh" thành "đã có lịch sử điểm danh hoặc vào phòng".

- [ ] **Step 4: Lint và build**

Run: `cd 502-frontend && npm run lint && npm run build`
Expected: không lỗi.

- [ ] **Step 5: Kiểm tra trên trình duyệt**

Đăng nhập `ql1_cs1`, mở `/cs1/pr/staff`:
- Sidebar và tiêu đề tab ghi "Thống kê PR".
- Số giờ, lượt, phòng khớp với lượt đã tạo ở Task 8.
- Đổi khoảng ngày thì số liệu đổi.
- Sắp theo "Số giờ" hoạt động.
- Hàng tổng đúng.
- Ở 390px, cột Số giờ vẫn hiện và trang không cuộn ngang.
- Đăng nhập HĐQT (tạo bằng admin nếu chưa có): chỉ xem.

Chụp màn hình.

- [ ] **Step 6: Commit**

```bash
git add 502-frontend/src/app/[branch]/pr/staff 502-frontend/src/lib/navigation.ts
git commit -m "feat(pr): trang Thống kê PR với số giờ, lượt, số phòng theo khoảng ngày"
```

---

### Task 10: Tài liệu, checklist tài nguyên, đo tải

**Files:**
- Modify: `CLAUDE.md`, `DEPLOYMENT.md`

- [ ] **Step 1: `CLAUDE.md`**

- Danh sách migration: thêm "`20261001000000_pr_sessions` adds `PrSession` (PR/KTV visits to rooms, §6.15)".
- Đoạn **PR/KTV** (Backend architecture) thêm:
  - `PrSession`: one row per visit of a PR/KTV to an open `Order`, `startAt`/`endAt`, not billed.
  - Written by `PrSessionsService` (`/pr/sessions`, `/pr/sessions/:id/end`), open to `canAssignPr` (`SALES` or `managesPr`). Each write locks the order (`lockOrderRow` in `orders/order-lock.ts`), then the `PrStaff` row (at most one open visit per PR), and answers with the order (`orderDetailInclude`).
  - Checkout and cancel close open visits at `endTime` (`closeOpenPrSessions`).
  - `GET /pr/available` lists the picker (checked in first, current room).
  - `GET /pr/stats` sums minutes/visits/rooms per PR on the report pool with `SharedRequestInterceptor`.
  - `orderInclude` (lists) vs `orderDetailInclude` (one order, with `prSessions`) in `orders/order-include.ts`.
  - Removing a PR who was ever in a room only sets `active=false`; the purge deletes `PrSession`.
- Đoạn **PR/KTV** (Frontend): tab PR/KTV trong trang phòng (`components/sales/{pr-picker,room-pr-list}.tsx`, quyền `pr.assign`, mọi lần ghi đi qua `enqueue`/`runOrderAction` của trang phòng); `/[branch]/pr/staff` giờ là "Thống kê PR" (khoảng ngày, số giờ/lượt/phòng, hàng tổng từ `totals`).
- Dòng `npm run test:e2e` đã có `pr`, không đổi.

- [ ] **Step 2: `DEPLOYMENT.md` §6.15**

Sau §6.14:
```markdown
### 6.15. PR/KTV trong phòng (migration `20261001000000_pr_sessions`)

- Migration chỉ thêm bảng `PrSession` và ba chỉ mục, không đụng dữ liệu cũ, chạy trong tích tắc.
- Trong trang phòng có tab **PR/KTV**: chạm vào PR để ghi giờ vào, nút **Ra** để ghi giờ ra, **Sửa giờ**/**Xóa** khi gán nhầm (chỉ khi phòng còn mở). Thanh toán hoặc hủy phiên tự đóng các PR còn trong phòng. PR không tính tiền trên hóa đơn.
- Thu ngân, quản lý và tài khoản "Quản lý PR/KTV" gán được; HĐQT và nhân viên chỉ xem.
- Trang *Danh sách PR/KTV* đổi tên thành **Thống kê PR**: chọn khoảng ngày để xem số giờ trong phòng, số lượt và số phòng của từng PR.
```

- [ ] **Step 3: Checklist §5 `docs/resource-rules.md`**

Tự kiểm và ghi kết quả vào mô tả commit hoặc PR:

- [ ] `take`/`select`:
  - `/pr/available`: `take 500`, `X-Total-Count`, `ListLimitNotice`.
  - `prSessions` chỉ có trên đơn lẻ, danh sách 1000 hóa đơn không phình.
- [ ] Tổng thống kê tính bằng SQL riêng, không cộng từ danh sách.
- [ ] `EXPLAIN` ba truy vấn (Task 5 Step 4) dùng index.
- [ ] `/pr/stats` chạy trên `ReportPrismaService` và có `SharedRequestInterceptor`.
- [ ] Không có polling mới: danh sách PR tải khi mở tab và khi lượt của phòng đổi; lượt đi theo polling 15 s sẵn có.
- [ ] Không thêm thư viện, không đổi Docker.

- [ ] **Step 4: Đo tải (luồng bán hàng đổi: thanh toán thêm một `updateMany`)**

Chạy theo `docs/resource-rules.md` §6, sau khi `migrate reset` DB đo tải để có bảng mới:
```bash
node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2
```
Expected: thời gian thanh toán p95 của thu ngân không kém bảng hiện có quá sai số đo. Ghi số vào mô tả PR. Xong thì xóa container (`docker rm -f -v kara-load-be kara-load-pg`).

- [ ] **Step 5: Chạy toàn bộ kiểm tra lần cuối**

```bash
cd 502-backend && npm run lint && npm test && npm run build
cd 502-backend && npx jest --config test/jest-e2e.json test/pr.e2e-spec.ts --runInBand
cd 502-backend && npx jest --config test/jest-e2e.json test/foundation.e2e-spec.ts --runInBand
cd 502-backend && npx jest --config test/jest-e2e.json test/board.e2e-spec.ts --runInBand
cd 502-frontend && npm run lint && npm run build
```
Expected: tất cả PASS. Chạy từng file e2e một, không chạy song song.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md DEPLOYMENT.md
git commit -m "docs: PR/KTV trong phòng và Thống kê PR"
```
