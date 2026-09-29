# Phân quyền bán hàng, chốt giờ, duyệt giảm giá — giai đoạn 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phục vụ gọi món/PR/chốt giờ phòng mình, CSKH chỉ xem, chỉ quản lý hệ thống sửa/hủy hóa đơn đã thu, và mọi giảm giá/hạ VAT của thu ngân đi qua yêu cầu được quản lý duyệt từ xa, có nhật ký — chạy bằng polling (WebSocket là giai đoạn 2, kế hoạch riêng).

**Architecture:** Thêm cột chốt giờ trên `Order`, bảng `OrderEvent` (mở khóa giờ) và `DiscountRequest` (hàng chờ + nhật ký). Quyền theo phòng (`order.serverId === user.id`) kiểm tra trong service sau khóa dòng order. Giảm giá/VAT tách khỏi `PATCH /orders/:id` sang module `src/discounts` (`POST /orders/:id/adjustments`, `/discount-requests/*`); các hàm dùng chung trong transaction nằm ở `orders/discount-ledger.ts` để `OrdersService` và `DiscountsService` không phụ thuộc vòng. Frontend thêm khung giảm giá có luồng gửi duyệt, nút chốt/mở khóa giờ, trang "Duyệt giảm giá" và badge.

**Tech Stack:** NestJS 11, Prisma 5.22, PostgreSQL 17, Jest (unit + e2e supertest), Next.js 16 App Router, React 19, shadcn/ui, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-30-role-permissions-discount-approval-design.md` (đọc trước khi làm bất kỳ task nào).

## Global Constraints

- Mọi chuỗi hiển thị và thông báo lỗi bằng tiếng Việt.
- Theo `docs/resource-rules.md`: danh sách có `take` + `select` đúng cột + `X-Total-Count` (`withTotalCount`) + `ListLimitNotice`; hàng chờ trần **200**, nhật ký trần **500**; truy vấn luồng bán hàng dùng index; polling qua `usePolling`, chu kỳ ≥ 15 s.
- Mọi ghi vào một order khóa dòng order trước (`lockOrder` / `lockOrderRow`), rồi mới tới dòng khác (PrStaff, DiscountRequest).
- `before`/`after` của `DiscountRequest` là JSON đúng 5 khóa: `discountPercent`, `discountAmount`, `hourlyDiscountPercent`, `hourlyDiscountAmount`, `taxPercent`.
- Cần duyệt khi bất kỳ khoản giảm nào tăng hoặc `taxPercent` giảm.
- Thanh toán phiên đã chốt: `endTime = timeLockedAt`.
- Không dùng `prisma db push`; migration viết bằng `prisma migrate diff` (xem CLAUDE.md).
- Code comment bằng tiếng Anh như code hiện có; commit message tiếng Việt kiểu `feat(sales): …`, kết thúc bằng `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Chạy e2e: `docker start kara502-pg` trước; chạy từng bộ một (`npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts`).

## File Structure

Backend (`502-backend/`):
- `prisma/schema.prisma` — cột chốt giờ, `OrderEvent`, `DiscountRequest`, 3 enum, quan hệ ngược trên `Branch`/`User`/`Order`.
- `prisma/migrations/20261002000000_sales_approvals/migration.sql` — mới.
- `src/orders/bill-of.ts` — mới: `billOf`, `adjustmentsOf`, `billedEndOf` (chuyển từ `orders.service.ts`).
- `src/orders/discount-rules.ts` (+ `.spec.ts`) — mới: khóa giảm giá, `needsApproval`, `changedKeys`, `pickAdjustments`.
- `src/orders/discount-ledger.ts` — mới: hàm dùng trong transaction (`pendingRequestOf`, `assertNoPendingRequest`, `expirePendingRequests`, `logAdjustmentChange`).
- `src/orders/order-access.ts` (+ `.spec.ts`) — mới: `isServerOf`, thông báo lỗi.
- `src/orders/order-include.ts` — `orderDetailInclude` kèm yêu cầu đang chờ.
- `src/orders/dto/order-adjustments.dto.ts` — mới; `update-order.dto.ts`, `edit-paid-order.dto.ts` sửa.
- `src/orders/orders.service.ts`, `orders.controller.ts` — chốt giờ, quyền phục vụ, chặn thanh toán khi chờ duyệt, log sửa hóa đơn đã thu.
- `src/auth/roles.ts` — `CHAIN_ONLY`.
- `src/discounts/{discounts.module,discounts.controller,discounts.service,decided-message}.ts` (+ `decided-message.spec.ts`), `src/discounts/dto/*.ts` — mới.
- `src/pr/pr-session-rules.ts` (+ spec), `src/pr/pr-sessions.service.ts` — PR theo phòng của phục vụ, giới hạn chốt giờ.
- `src/rooms/rooms.service.ts` — `timeLockedAt` trên phiên đang mở.
- `src/products/products.controller.ts` — mở `GET /products` cho STAFF.
- `src/data-purge/data-purge.service.ts` — xóa 2 bảng mới.
- `src/app.module.ts` — import `DiscountsModule`.
- `test/approvals.e2e-spec.ts` — mới.

Frontend (`502-frontend/src/`):
- `lib/types.ts`, `lib/permissions.ts`, `lib/navigation.ts`, `lib/discount-rules.ts` (mới).
- `components/sales/bill-adjustments.tsx` — mới: khung giảm giá/VAT có gửi duyệt.
- `components/discounts/{adjustment-diff,pending-requests,discount-log}.tsx` — mới.
- `hooks/use-pending-discounts.ts` — mới: badge + toast cho quản lý.
- `app/[branch]/sales/discounts/{layout,page}.tsx` — mới.
- `app/[branch]/sales/rooms/[id]/page.tsx`, `app/[branch]/sales/rooms/page.tsx`, `components/sales/bill-sheet.tsx`, `components/layout/app-sidebar.tsx`, `app/[branch]/admin/users/page.tsx`.

Docs: `CLAUDE.md`, `docs/resource-rules.md`, `DEPLOYMENT.md` (mục migration §6.16).

---

### Task 1: Schema và migration

**Files:**
- Modify: `502-backend/prisma/schema.prisma`
- Create: `502-backend/prisma/migrations/20261002000000_sales_approvals/migration.sql`

**Interfaces:**
- Produces: Prisma models `OrderEvent`, `DiscountRequest`; enums `OrderEventType { TIME_UNLOCK }`, `DiscountRequestStatus { PENDING APPROVED REJECTED CANCELLED EXPIRED }`, `DiscountSource { REQUEST DIRECT PAID_EDIT }`; `Order.timeLockedAt: DateTime?`, `Order.timeLockedById: Int?`, relations `Order.events`, `Order.discountRequests`.

- [ ] **Step 1: Sửa `Order`** — thêm sau khối `editReason`:

```prisma
  // Chốt giờ (phục vụ / thu ngân): the room fee is billed up to this moment
  // and checkout takes it as endTime. Null while the clock runs.
  timeLockedAt   DateTime?
  timeLockedById Int?
  timeLockedBy   User?     @relation("OrderTimeLockedBy", fields: [timeLockedById], references: [id])

  events           OrderEvent[]
  discountRequests DiscountRequest[]
```

- [ ] **Step 2: Thêm model và enum** (cuối file):

```prisma
// Rare events of a session kept for tracing (for now only unlocking the
// time). Locking lives on Order, so this grows only when someone unlocks:
// a few rows per branch per day. Kept like the books, wiped by the data purge.
model OrderEvent {
  id          Int            @id @default(autoincrement())
  branchId    Int
  branch      Branch         @relation(fields: [branchId], references: [id])
  orderId     Int
  order       Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type        OrderEventType
  // TIME_UNLOCK: when the time had been locked.
  lockedAt    DateTime?
  createdById Int?
  createdBy   User?          @relation("OrderEventCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime       @default(now())

  @@index([orderId])
}

enum OrderEventType {
  TIME_UNLOCK
}

// Every change of a bill's discounts / VAT: a cashier's request waiting for
// a manager, a change applied at once (a manager, or a change that needs no
// approval) and a correction of a paid bill. Both the approval queue and the
// audit trail. ~30 rows per branch per day (~55k/year for 5 branches); kept
// like the books, wiped by the data purge.
model DiscountRequest {
  id            Int                   @id @default(autoincrement())
  branchId      Int
  branch        Branch                @relation(fields: [branchId], references: [id])
  orderId       Int
  order         Order                 @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status        DiscountRequestStatus
  source        DiscountSource
  // {discountPercent, discountAmount, hourlyDiscountPercent, hourlyDiscountAmount, taxPercent}
  before        Json
  after         Json
  // The bill total (VAT included) when it was sent, before and after.
  amountBefore  Decimal
  amountAfter   Decimal
  note          String?
  requestedById Int?
  requestedBy   User?                 @relation("DiscountRequestedBy", fields: [requestedById], references: [id])
  createdAt     DateTime              @default(now())
  decidedById   Int?
  decidedBy     User?                 @relation("DiscountDecidedBy", fields: [decidedById], references: [id])
  decidedAt     DateTime?
  decisionNote  String?

  @@index([branchId, status])
  @@index([branchId, createdAt])
  @@index([orderId])
}

enum DiscountRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
  EXPIRED
}

enum DiscountSource {
  REQUEST
  DIRECT
  PAID_EDIT
}
```

- [ ] **Step 3: Quan hệ ngược** — trong `model Branch` thêm `orderEvents OrderEvent[]` và `discountRequests DiscountRequest[]`; trong `model User` thêm:

```prisma
  ordersTimeLocked          Order[]           @relation("OrderTimeLockedBy")
  orderEventsCreated        OrderEvent[]      @relation("OrderEventCreatedBy")
  discountRequestsSent      DiscountRequest[] @relation("DiscountRequestedBy")
  discountRequestsDecided   DiscountRequest[] @relation("DiscountDecidedBy")
```

- [ ] **Step 4: Sinh SQL migration**

```bash
cd 502-backend && docker start kara502-pg
mkdir -p prisma/migrations/20261002000000_sales_approvals
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@localhost:5433/karaoke_shadow --script \
  > prisma/migrations/20261002000000_sales_approvals/migration.sql
```

Nếu database `karaoke_shadow` chưa có: `docker exec kara502-pg psql -U postgres -c "create database karaoke_shadow"`. Mở file SQL, kiểm tra: chỉ có `CREATE TYPE` ×3, `ALTER TABLE "Order" ADD COLUMN` ×2, `CREATE TABLE` ×2, 4 index, các khóa ngoại. Thêm dòng đầu `-- Chốt giờ, mở khóa giờ (OrderEvent), duyệt giảm giá (DiscountRequest).`

- [ ] **Step 5: Áp và sinh client**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/karaoke_test npx prisma migrate deploy
npx prisma generate && npm test
```

Expected: migrate "applied 1 migration"; toàn bộ unit test PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261002000000_sales_approvals
git commit -m "feat(db): chốt giờ, OrderEvent, DiscountRequest"
```

---

### Task 2: Luật giảm giá và tính bill có chốt giờ (hàm thuần)

**Files:**
- Create: `502-backend/src/orders/discount-rules.ts`, `502-backend/src/orders/discount-rules.spec.ts`
- Create: `502-backend/src/orders/bill-of.ts`, `502-backend/src/orders/bill-of.spec.ts`
- Modify: `502-backend/src/orders/orders.service.ts` (xóa `billOf`, `adjustmentsOf`, `BillableOrder` cục bộ, import từ `bill-of.ts`)

**Interfaces:**
- Produces:
  - `ADJUSTMENT_KEYS`, `type AdjustmentKey`, `type Adjustments = Record<AdjustmentKey, number>`
  - `needsApproval(before: Adjustments, after: Adjustments): boolean`
  - `changedKeys(before: Adjustments, after: Adjustments): AdjustmentKey[]`
  - `pickAdjustments(source: Partial<Record<AdjustmentKey, number | undefined>>): Partial<Adjustments>` (bỏ `undefined`)
  - `type BillableOrder`, `adjustmentsOf(order: BillableOrder): Adjustments`, `billOf(order: BillableOrder, endTime: Date, adjustments?: Adjustments): Bill`, `billedEndOf(order: { timeLockedAt: Date | null }, now: Date): Date`

- [ ] **Step 1: Test luật duyệt**

```ts
// src/orders/discount-rules.spec.ts
import { changedKeys, needsApproval, pickAdjustments } from './discount-rules';

const base = {
  discountPercent: 0,
  discountAmount: 0,
  hourlyDiscountPercent: 0,
  hourlyDiscountAmount: 0,
  taxPercent: 10,
};

describe('needsApproval', () => {
  it('is false when nothing changes', () => {
    expect(needsApproval(base, { ...base })).toBe(false);
  });
  it.each([
    'discountPercent',
    'discountAmount',
    'hourlyDiscountPercent',
    'hourlyDiscountAmount',
  ] as const)('is true when %s goes up', (key) => {
    expect(needsApproval(base, { ...base, [key]: 5 })).toBe(true);
  });
  it('is true when VAT goes down', () => {
    expect(needsApproval(base, { ...base, taxPercent: 8 })).toBe(true);
  });
  it('is false when VAT goes up or a discount is removed', () => {
    expect(needsApproval(base, { ...base, taxPercent: 12 })).toBe(false);
    expect(
      needsApproval({ ...base, discountPercent: 10 }, base),
    ).toBe(false);
  });
  it('is true when a percent becomes a fixed amount', () => {
    expect(
      needsApproval(
        { ...base, discountPercent: 10 },
        { ...base, discountPercent: 0, discountAmount: 50000 },
      ),
    ).toBe(true);
  });
});

describe('changedKeys / pickAdjustments', () => {
  it('lists the keys that differ', () => {
    expect(changedKeys(base, { ...base, taxPercent: 8, discountAmount: 1 })).toEqual([
      'discountAmount',
      'taxPercent',
    ]);
  });
  it('drops undefined and unrelated fields', () => {
    expect(
      pickAdjustments({ discountPercent: 5, taxPercent: undefined, cskhId: 3 } as never),
    ).toEqual({ discountPercent: 5 });
  });
});
```

- [ ] **Step 2: Chạy, xác nhận FAIL**

Run: `npx jest src/orders/discount-rules.spec.ts` — Expected: FAIL "Cannot find module './discount-rules'".

- [ ] **Step 3: Viết `discount-rules.ts`**

```ts
// The discount / VAT fields of a bill, and which changes a manager must
// approve (spec 2026-09-30 §6). Mirrored in 502-frontend/src/lib/discount-rules.ts.

export const ADJUSTMENT_KEYS = [
  'discountPercent',
  'discountAmount',
  'hourlyDiscountPercent',
  'hourlyDiscountAmount',
  'taxPercent',
] as const;
export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];
export type Adjustments = Record<AdjustmentKey, number>;

const DISCOUNT_KEYS: AdjustmentKey[] = [
  'discountPercent',
  'discountAmount',
  'hourlyDiscountPercent',
  'hourlyDiscountAmount',
];

// Field by field, not by total: a percent follows the live bill, so totals
// move with time. Any discount going up or VAT going down lowers what the
// customer pays and needs a manager.
export function needsApproval(before: Adjustments, after: Adjustments) {
  return (
    DISCOUNT_KEYS.some((key) => after[key] > before[key]) ||
    after.taxPercent < before.taxPercent
  );
}

export function changedKeys(before: Adjustments, after: Adjustments) {
  return ADJUSTMENT_KEYS.filter((key) => before[key] !== after[key]);
}

// The adjustment fields that were sent (a DTO also carries other fields).
export function pickAdjustments(
  source: Partial<Record<AdjustmentKey, number | undefined>>,
): Partial<Adjustments> {
  const picked: Partial<Adjustments> = {};
  for (const key of ADJUSTMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
```

- [ ] **Step 4: Chạy, xác nhận PASS** — `npx jest src/orders/discount-rules.spec.ts`

- [ ] **Step 5: Test `bill-of`**

```ts
// src/orders/bill-of.spec.ts
import { Prisma } from '@prisma/client';
import { billOf, billedEndOf } from './bill-of';

const order = {
  startTime: new Date('2026-09-30T13:00:00Z'),
  pricePerHour: new Prisma.Decimal(100000),
  discountPercent: 0,
  discountAmount: new Prisma.Decimal(0),
  hourlyDiscountPercent: 0,
  hourlyDiscountAmount: new Prisma.Decimal(0),
  taxPercent: 10,
  items: [{ price: new Prisma.Decimal(20000), quantity: 2 }],
};

describe('billOf', () => {
  it('bills the stored adjustments by default', () => {
    const bill = billOf(order, new Date('2026-09-30T14:00:00Z'));
    expect(bill.hourlyFee).toBe(100000);
    expect(bill.finalAmount).toBe(154000);
  });
  it('bills other adjustments when given', () => {
    const bill = billOf(order, new Date('2026-09-30T14:00:00Z'), {
      discountPercent: 0,
      discountAmount: 40000,
      hourlyDiscountPercent: 0,
      hourlyDiscountAmount: 0,
      taxPercent: 0,
    });
    expect(bill.finalAmount).toBe(100000);
  });
});

describe('billedEndOf', () => {
  it('stops at the locked time', () => {
    const locked = new Date('2026-09-30T14:00:00Z');
    expect(billedEndOf({ timeLockedAt: locked }, new Date())).toBe(locked);
  });
  it('runs to now otherwise', () => {
    const now = new Date();
    expect(billedEndOf({ timeLockedAt: null }, now)).toBe(now);
  });
});
```

- [ ] **Step 6: Viết `bill-of.ts`** (chuyển nguyên logic cũ từ `orders.service.ts`, thêm tham số `adjustments`):

```ts
import { BadRequestException } from '@nestjs/common';
import { Order, Prisma } from '@prisma/client';
import { Bill, computeBill } from './billing';
import { Adjustments } from './discount-rules';

export type BillableOrder = Pick<
  Order,
  | 'startTime'
  | 'pricePerHour'
  | 'discountPercent'
  | 'discountAmount'
  | 'hourlyDiscountPercent'
  | 'hourlyDiscountAmount'
  | 'taxPercent'
> & { items: { price: Prisma.Decimal; quantity: number }[] };

export function adjustmentsOf(order: BillableOrder): Adjustments {
  return {
    discountPercent: order.discountPercent,
    discountAmount: Number(order.discountAmount),
    hourlyDiscountPercent: order.hourlyDiscountPercent,
    hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
    taxPercent: order.taxPercent,
  };
}

// The bill of a session ending at `endTime`, with its stored adjustments or
// the given ones (what a discount request would make of it).
export function billOf(
  order: BillableOrder,
  endTime: Date,
  adjustments: Adjustments = adjustmentsOf(order),
): Bill {
  if (!order.startTime) {
    throw new BadRequestException('Hóa đơn chưa bắt đầu tính giờ');
  }
  return computeBill({
    startTime: order.startTime,
    endTime,
    pricePerHour: Number(order.pricePerHour),
    items: order.items.map((i) => ({
      price: Number(i.price),
      quantity: i.quantity,
    })),
    ...adjustments,
  });
}

// End of the billed time of an open session: the locked time, else now.
export const billedEndOf = (
  order: { timeLockedAt: Date | null },
  now: Date,
): Date => order.timeLockedAt ?? now;
```

Trong `orders.service.ts`: xóa `type BillableOrder`, `function billOf`, `function adjustmentsOf`; thêm `import { adjustmentsOf, billOf, billedEndOf } from './bill-of';` (bỏ `computeBill` khỏi import nếu chỉ `editPaid` còn dùng — nó vẫn dùng, giữ lại).

- [ ] **Step 7: Chạy** — `npx jest src/orders && npm run build` — Expected: PASS, build OK.

- [ ] **Step 8: Commit**

```bash
git add src/orders
git commit -m "refactor(orders): tách billOf, thêm luật duyệt giảm giá"
```

---

### Task 3: Chỉ quản lý hệ thống sửa/hủy hóa đơn đã thanh toán + khung e2e

**Files:**
- Modify: `502-backend/src/auth/roles.ts`, `502-backend/src/orders/orders.controller.ts`
- Create: `502-backend/test/approvals.e2e-spec.ts`

**Interfaces:**
- Produces: `CHAIN_ONLY: Role[]`; e2e helpers `as(name)`, `openRoom(cashier, roomId, body?)`, biến `roomIds: number[]`, `productIds: number[]`, `userIds: Record<string, number>` dùng ở các task sau (thêm `it` vào cùng file).

- [ ] **Step 1: Viết file e2e với test quyền hóa đơn đã thu**

```ts
// test/approvals.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

// Sales rights by role and by room (spec 2026-09-30): servers order for their
// own room, CSKH only look, only the chain manager corrects or voids a paid
// bill, and a cashier's discount waits for a manager. The `it`s build on each
// other: run the whole file.

type Json = Record<string, unknown>;

describe('Sales approvals (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, number> = {};
  let roomIds: number[] = [];
  let productIds: number[] = [];

  const api = () => request(app.getHttpServer());
  const as = (name: string) => {
    const auth = `Bearer ${tokens[name]}`;
    return {
      get: (url: string) => api().get(`/api${url}`).set('Authorization', auth),
      post: (url: string, body: Json = {}) =>
        api().post(`/api${url}`).set('Authorization', auth).send(body),
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
  const openRoom = async (roomId: number, body: Json = {}) =>
    (
      await as('tn1_cs1')
        .post('/orders', { roomId, ...body })
        .expect(201)
    ).body as Json;

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
    for (const name of [
      'admin',
      'ql1_cs1',
      'tn1_cs1',
      'pv1_cs1',
      'cskh1_cs1',
      'ql1_cs2',
    ]) {
      await login(name);
    }
    const users = (await as('admin').get('/users').expect(200)).body as Json[];
    for (const u of users) userIds[u.username as string] = u.id as number;
    roomIds = ((await as('tn1_cs1').get('/rooms').expect(200)).body as Json[])
      .filter((r) => r.status === 'AVAILABLE')
      .map((r) => r.id as number);
    productIds = (
      (await as('tn1_cs1').get('/products').expect(200)).body as Json[]
    ).map((p) => p.id as number);
    expect(roomIds.length).toBeGreaterThanOrEqual(6);
    expect(productIds.length).toBeGreaterThanOrEqual(1);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('paid bills', () => {
    let paidId: number;

    it('only the chain manager corrects or voids a paid bill', async () => {
      const order = await openRoom(roomIds[0]);
      await as('tn1_cs1')
        .patch(`/orders/${order.id}`, {
          items: [{ productId: productIds[0], quantity: 1 }],
        })
        .expect(200);
      await as('tn1_cs1')
        .post(`/orders/${order.id}/checkout`, { paymentMethod: 'CASH' })
        .expect(200);
      paidId = order.id as number;

      for (const name of ['tn1_cs1', 'ql1_cs1']) {
        await as(name)
          .patch(`/orders/${paidId}/paid`, { reason: 'x', taxPercent: 10 })
          .expect(403);
        await as(name)
          .post(`/orders/${paidId}/void`, { reason: 'x' })
          .expect(403);
      }
      await as('admin')
        .patch(`/orders/${paidId}/paid`, { reason: 'Sửa VAT', taxPercent: 8 })
        .expect(200);
    });

    it('a branch manager still cancels an open session', async () => {
      const order = await openRoom(roomIds[1]);
      await as('ql1_cs1').post(`/orders/${order.id}/cancel`).expect(200);
    });
  });
});
```

- [ ] **Step 2: Chạy, xác nhận FAIL**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts`
Expected: FAIL — `ql1_cs1` nhận 200 thay vì 403 ở `/paid`.

- [ ] **Step 3: Sửa quyền**

`src/auth/roles.ts` thêm:

```ts
// Corrects or voids a paid bill (spec 2026-09-30): neither the branch manager
// nor the cashier may touch a bill once it is paid.
export const CHAIN_ONLY: Role[] = [Role.CHAIN_MANAGER];
```

`orders.controller.ts`: import `CHAIN_ONLY`; `editPaid` và `voidPaid` đổi `@Roles(...MANAGERS)` → `@Roles(...CHAIN_ONLY)`; sửa comment trên `editPaid`/`voidPaid` thành "Chain manager only". Trong `orders.service.ts` sửa comment "Managers only: void…" / "Managers only: correct…" thành "Chain manager only: …".

- [ ] **Step 4: Chạy lại** — Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/auth/roles.ts src/orders test/approvals.e2e-spec.ts
git commit -m "feat(orders): chỉ quản lý hệ thống sửa, hủy hóa đơn đã thanh toán"
```

---

### Task 4: Chốt giờ / mở khóa giờ

**Files:**
- Modify: `502-backend/src/orders/orders.service.ts`, `orders.controller.ts`, `order-include.ts`
- Modify: `502-backend/src/pr/pr-session-rules.ts`, `pr-session-rules.spec.ts`, `pr-sessions.service.ts`
- Modify: `502-backend/src/rooms/rooms.service.ts`
- Create: `502-backend/src/orders/order-access.ts`, `order-access.spec.ts`
- Test: `502-backend/test/approvals.e2e-spec.ts`

**Interfaces:**
- Consumes: `billedEndOf` (Task 2).
- Produces:
  - `isServerOf(user: Pick<AuthUser,'id'|'role'>, order: { serverId: number | null }): boolean`, `SERVE_FORBIDDEN: string` trong `order-access.ts`
  - `OrdersService.lockTime(user, id)`, `OrdersService.unlockTime(user, id)`; routes `POST /orders/:id/lock-time` (SALES + STAFF), `POST /orders/:id/unlock-time` (SALES)
  - `checkSessionTimes({ orderStart, startAt, endAt, now, lockedAt })` — `lockedAt: Date | null` mới
  - `roomInclude` phiên đang mở có `timeLockedAt`; `orderInclude` có `timeLockedBy: staffRef`

- [ ] **Step 1: Test `order-access`**

```ts
// src/orders/order-access.spec.ts
import { Role } from '@prisma/client';
import { isServerOf } from './order-access';

describe('isServerOf', () => {
  it('is the staff member assigned as server', () => {
    expect(isServerOf({ id: 7, role: Role.STAFF }, { serverId: 7 })).toBe(true);
  });
  it('is not the CSKH, another staff member or a cashier', () => {
    expect(isServerOf({ id: 7, role: Role.STAFF }, { serverId: 8 })).toBe(false);
    expect(isServerOf({ id: 7, role: Role.STAFF }, { serverId: null })).toBe(false);
    expect(isServerOf({ id: 7, role: Role.CASHIER }, { serverId: 7 })).toBe(false);
  });
});
```

- [ ] **Step 2: Viết `order-access.ts`**

```ts
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';

export const SERVE_FORBIDDEN = 'Bạn chỉ thao tác được phòng mình phục vụ';

// The floor staff member assigned as server (phục vụ) of a session: orders
// for it, brings PR/KTV in and locks its time — for that room only. Checked
// under the order's row lock. The CSKH of the room only looks.
export function isServerOf(
  user: Pick<AuthUser, 'id' | 'role'>,
  order: { serverId: number | null },
) {
  return user.role === Role.STAFF && order.serverId === user.id;
}
```

Run: `npx jest src/orders/order-access.spec.ts` — Expected: PASS.

- [ ] **Step 3: Test luật PR khi đã chốt** — thêm vào `src/pr/pr-session-rules.spec.ts` (mọi lời gọi `checkSessionTimes` hiện có thêm `lockedAt: null`):

```ts
describe('checkSessionTimes after the time is locked', () => {
  const orderStart = new Date('2026-09-30T13:00:00Z');
  const lockedAt = new Date('2026-09-30T15:00:00Z');
  const now = new Date('2026-09-30T15:30:00Z');

  it('keeps visits inside the locked time', () => {
    expect(
      checkSessionTimes({
        orderStart,
        startAt: new Date('2026-09-30T14:00:00Z'),
        endAt: new Date('2026-09-30T15:10:00Z'),
        now,
        lockedAt,
      }),
    ).toBe('Giờ ra không được sau lúc chốt giờ');
  });
  it('needs an end time', () => {
    expect(
      checkSessionTimes({
        orderStart,
        startAt: new Date('2026-09-30T14:00:00Z'),
        endAt: null,
        now,
        lockedAt,
      }),
    ).toBe('Phòng đã chốt giờ, PR phải có giờ ra');
  });
  it('accepts a visit ending at the lock', () => {
    expect(
      checkSessionTimes({
        orderStart,
        startAt: new Date('2026-09-30T14:00:00Z'),
        endAt: lockedAt,
        now,
        lockedAt,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 4: Sửa `pr-session-rules.ts`**

```ts
export interface SessionTimes {
  orderStart: Date; // when the room session opened
  startAt: Date;
  endAt: Date | null; // null: still in the room
  now: Date;
  lockedAt: Date | null; // the room's time was locked (chốt giờ)
}

export function checkSessionTimes({
  orderStart,
  startAt,
  endAt,
  now,
  lockedAt,
}: SessionTimes): string | null {
  // After the lock nobody is in the room any more: every visit ends by then.
  const limit = lockedAt ?? now;
  const limitName = lockedAt ? 'lúc chốt giờ' : 'hiện tại';
  if (startAt < orderStart) return 'Giờ vào phải sau giờ mở phòng';
  if (startAt > limit) return `Giờ vào không được sau ${limitName}`;
  if (!endAt && lockedAt) return 'Phòng đã chốt giờ, PR phải có giờ ra';
  if (endAt) {
    if (endAt < startAt) return 'Giờ ra phải sau giờ vào';
    if (endAt > limit) return `Giờ ra không được sau ${limitName}`;
  }
  return null;
}
```

Run: `npx jest src/pr` — Expected: PASS.

- [ ] **Step 5: Viết test e2e chốt giờ** — thêm vào `approvals.e2e-spec.ts` trong `describe('Sales approvals (e2e)')`:

```ts
  describe('time lock', () => {
    let orderId: number;
    let prId: number;

    it('locks the time: the fee stops and open PR visits end', async () => {
      const order = await openRoom(roomIds[2], {
        serverId: userIds.pv1_cs1,
        cskhId: userIds.cskh1_cs1,
      });
      orderId = order.id as number;
      prId = (
        (await as('ql1_cs1').post('/pr/staff', { name: 'Lan' }).expect(201))
          .body as Json
      ).id as number;
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId, prStaffId: prId })
        .expect(201);

      // CSKH only looks; the server locks.
      await as('cskh1_cs1').post(`/orders/${orderId}/lock-time`).expect(403);
      const locked = (
        await as('pv1_cs1').post(`/orders/${orderId}/lock-time`).expect(201)
      ).body as Json;
      expect(locked.timeLockedAt).toBeTruthy();
      const visits = locked.prSessions as Json[];
      expect(visits[0].endAt).toBe(locked.timeLockedAt);
      await as('pv1_cs1').post(`/orders/${orderId}/lock-time`).expect(409);

      // No PR after the lock.
      await as('tn1_cs1')
        .post('/pr/sessions', { orderId, prStaffId: prId })
        .expect(409);

      // The room map shows it.
      const room = (
        await as('tn1_cs1').get(`/rooms/${roomIds[2]}`).expect(200)
      ).body as Json;
      expect((room.activeOrder as Json).timeLockedAt).toBe(locked.timeLockedAt);
    });

    it('only cashiers and managers unlock, and it is logged', async () => {
      await as('pv1_cs1').post(`/orders/${orderId}/unlock-time`).expect(403);
      const unlocked = (
        await as('tn1_cs1').post(`/orders/${orderId}/unlock-time`).expect(201)
      ).body as Json;
      expect(unlocked.timeLockedAt).toBeNull();
      await as('tn1_cs1').post(`/orders/${orderId}/unlock-time`).expect(409);
    });

    it('checkout ends the bill at the locked time', async () => {
      const locked = (
        await as('tn1_cs1').post(`/orders/${orderId}/lock-time`).expect(201)
      ).body as Json;
      const paid = (
        await as('tn1_cs1')
          .post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' })
          .expect(200)
      ).body as Json;
      expect(paid.endTime).toBe(locked.timeLockedAt);
    });
  });
```

Run e2e — Expected: FAIL (404 trên `/lock-time`).

- [ ] **Step 6: Service** — trong `orders.service.ts`:

Import: `import { isServerOf, SERVE_FORBIDDEN } from './order-access';`, thêm `OrderEventType` vào import `@prisma/client`.

`preview`: thay `const endTime = new Date();` bằng `const endTime = billedEndOf(order, new Date());`.

`checkout`: thay `const endTime = new Date();` bằng

```ts
        // A locked session ends when it was locked: the bill's duration, its
        // business day, number and fund receipt all use that moment.
        const endTime = billedEndOf(order, new Date());
```

Thêm 2 method sau `cancel`:

```ts
  // Chốt giờ: the room fee stops now; PR/KTV still in the room leave now.
  // Sales roles, and the server assigned to the session.
  lockTime(user: AuthUser, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(
        tx,
        user,
        id,
        OrderStatus.PENDING,
        'Phòng đã đóng',
      );
      if (user.role === Role.STAFF && !isServerOf(user, order)) {
        throw new ForbiddenException(SERVE_FORBIDDEN);
      }
      if (order.timeLockedAt) {
        throw new ConflictException('Phòng đã chốt giờ');
      }
      const now = new Date();
      await tx.order.update({
        where: { id },
        data: { timeLockedAt: now, timeLockedById: user.id },
      });
      await closeOpenPrSessions(tx, id, now);
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderDetailInclude,
      });
    });
  }

  // The clock runs again from the start time (the locked gap is billed).
  // Logged: who unlocked, when, and when it had been locked.
  unlockTime(user: AuthUser, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(
        tx,
        user,
        id,
        OrderStatus.PENDING,
        'Phòng đã đóng',
      );
      if (!order.timeLockedAt) {
        throw new ConflictException('Phòng chưa chốt giờ');
      }
      await tx.order.update({
        where: { id },
        data: { timeLockedAt: null, timeLockedById: null },
      });
      await tx.orderEvent.create({
        data: {
          branchId: order.branchId,
          orderId: id,
          type: OrderEventType.TIME_UNLOCK,
          lockedAt: order.timeLockedAt,
          createdById: user.id,
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderDetailInclude,
      });
    });
  }
```

- [ ] **Step 7: Controller** — thêm vào `orders.controller.ts` (import `Role` đã có):

```ts
  // Chốt giờ: sales roles and the server of the room (checked in the service).
  @Post(':id/lock-time')
  @Roles(...SALES, Role.STAFF)
  lockTime(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.lockTime(user, id);
  }

  @Post(':id/unlock-time')
  @Roles(...SALES)
  unlockTime(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.unlockTime(user, id);
  }
```

- [ ] **Step 8: Include** — `order-include.ts`, trong `orderInclude` thêm `timeLockedBy: staffRef,`. `rooms.service.ts` `roomInclude.orders.select` thêm `timeLockedAt: true,`.

- [ ] **Step 9: PR sau chốt** — `pr-sessions.service.ts`:

`lockOpenOrder` select thêm `serverId: true, timeLockedAt: true`, trả `{ ...order, startTime: order.startTime }` (đã gồm 2 trường mới).

`add`: sau `const order = await this.lockOpenOrder(...)`:

```ts
      if (order.timeLockedAt) {
        throw new ConflictException('Phòng đã chốt giờ, không thêm PR được');
      }
```

Mọi lời gọi `this.assertTimes(order.startTime, startAt, endAt, now)` thêm tham số thứ 5 `order.timeLockedAt`; `assertTimes` truyền `lockedAt` vào `checkSessionTimes`:

```ts
  private assertTimes(
    orderStart: Date,
    startAt: Date,
    endAt: Date | null,
    now: Date,
    lockedAt: Date | null,
  ) {
    const error = checkSessionTimes({ orderStart, startAt, endAt, now, lockedAt });
    if (error) throw new BadRequestException(error);
  }
```

(Nếu `assertTimes` hiện có thân khác, giữ nguyên thân, chỉ thêm `lockedAt`.)

- [ ] **Step 10: Chạy** — `npm test && npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts` — Expected: PASS. Rồi `npx jest --config ./test/jest-e2e.json --runInBand test/pr.e2e-spec.ts` — Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src test/approvals.e2e-spec.ts
git commit -m "feat(sales): chốt giờ và mở khóa giờ có ghi log"
```

---

### Task 5: Phục vụ gọi món và PR cho phòng mình

**Files:**
- Modify: `502-backend/src/orders/orders.service.ts` (`update`), `orders.controller.ts` (`PATCH :id`)
- Modify: `502-backend/src/products/products.controller.ts` (`GET /products`, `GET /products/:id`)
- Modify: `502-backend/src/pr/pr-sessions.service.ts`
- Test: `502-backend/test/approvals.e2e-spec.ts`

**Interfaces:**
- Consumes: `isServerOf`, `SERVE_FORBIDDEN` (Task 4); `lockOpenOrder` trả `serverId` (Task 4).
- Produces: `PATCH /orders/:id` mở cho STAFF (chỉ `items`); `PrSessionsService.assertAssignFor(user, order)`.

- [ ] **Step 1: Test e2e**

```ts
  describe('server and CSKH', () => {
    let mine: number;
    let other: number;

    it('the server orders for their own room only', async () => {
      mine = (
        await openRoom(roomIds[3], {
          serverId: userIds.pv1_cs1,
          cskhId: userIds.cskh1_cs1,
        })
      ).id as number;
      other = (await openRoom(roomIds[4])).id as number;
      const items = [{ productId: productIds[0], quantity: 2 }];

      await as('pv1_cs1').get('/products').expect(200);
      const saved = (
        await as('pv1_cs1').patch(`/orders/${mine}`, { items }).expect(200)
      ).body as Json;
      expect((saved.items as Json[])[0].quantity).toBe(2);
      await as('pv1_cs1').patch(`/orders/${other}`, { items }).expect(403);
      await as('pv1_cs1')
        .patch(`/orders/${mine}`, { cskhId: null })
        .expect(403);
      await as('pv1_cs1').get(`/orders/${mine}/preview`).expect(200);
      await as('pv1_cs1')
        .post(`/orders/${mine}/checkout`, { paymentMethod: 'CASH' })
        .expect(403);
    });

    it('the server brings PR/KTV into their own room only', async () => {
      const lan = (
        (await as('ql1_cs1').post('/pr/staff', { name: 'Mai' }).expect(201))
          .body as Json
      ).id as number;
      await as('pv1_cs1').get('/pr/available').expect(200);
      await as('pv1_cs1')
        .post('/pr/sessions', { orderId: other, prStaffId: lan })
        .expect(403);
      const res = (
        await as('pv1_cs1')
          .post('/pr/sessions', { orderId: mine, prStaffId: lan })
          .expect(201)
      ).body as Json;
      const visit = (res.prSessions as Json[])[0];
      await as('pv1_cs1').post(`/pr/sessions/${visit.id}/end`).expect(200);
    });

    it('the CSKH only looks', async () => {
      await as('cskh1_cs1').get(`/orders/${mine}`).expect(200);
      await as('cskh1_cs1').get(`/orders/${mine}/preview`).expect(200);
      await as('cskh1_cs1')
        .patch(`/orders/${mine}`, {
          items: [{ productId: productIds[0], quantity: 1 }],
        })
        .expect(403);
      await as('cskh1_cs1').get(`/orders/${other}`).expect(403);
    });
  });
```

Run — Expected: FAIL (403 cho `pv1_cs1` ở `GET /products`).

- [ ] **Step 2: Controller** — `orders.controller.ts`, `PATCH ':id'`: `@Roles(...SALES, Role.STAFF)` và comment `// Sales roles; the server of the room may only change its items (checked in the service).`. `products.controller.ts`: `GET /` và `GET /:id` đổi `@Roles(...SALES_READERS)` → `@Roles(...SALES_READERS, Role.STAFF)` (import `Role` từ `@prisma/client`), comment `// Floor staff: the menu of their branch for the room they serve (loaded once per room page, never polled).`

- [ ] **Step 3: Service `update`** — ngay sau `const order = await this.lockOrder(...)`:

```ts
      if (user.role === Role.STAFF) {
        if (!isServerOf(user, order)) {
          throw new ForbiddenException(SERVE_FORBIDDEN);
        }
        if (dto.cskhId !== undefined || dto.serverId !== undefined) {
          throw new ForbiddenException('Phục vụ chỉ được gọi món');
        }
      }
```

- [ ] **Step 4: PR** — `pr-sessions.service.ts`:

Thêm import `Role` từ `@prisma/client` và `isServerOf, SERVE_FORBIDDEN` từ `'../orders/order-access'`. Thay `assertAssign`:

```ts
  // Who sells or keeps the PR list, or the server of this very room.
  private assertAssignFor(
    user: AuthUser,
    order: { serverId: number | null },
  ) {
    if (canAssignPr(user)) return;
    if (isServerOf(user, order)) return;
    throw new ForbiddenException(
      user.role === Role.STAFF
        ? SERVE_FORBIDDEN
        : 'Bạn không có quyền gán PR/KTV vào phòng',
    );
  }
```

Trong `add`, `end`, `update`, `remove`: bỏ dòng `this.assertAssign(user);` ở đầu; gọi `this.assertAssignFor(user, order);` ngay sau `const order = await this.lockOpenOrder(...)`.

`available`: thay `this.assertAssign(user);` bằng

```ts
    // Floor staff pick from it for the room they serve (checked when they add).
    if (!canAssignPr(user) && user.role !== Role.STAFF) {
      throw new ForbiddenException('Bạn không có quyền gán PR/KTV vào phòng');
    }
```

- [ ] **Step 5: Chạy** — e2e `approvals` và `pr` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src test/approvals.e2e-spec.ts
git commit -m "feat(sales): phục vụ gọi món và gán PR cho phòng mình"
```

---

### Task 6: Gửi giảm giá — áp ngay hoặc chờ duyệt; chặn thanh toán khi chờ

**Files:**
- Create: `502-backend/src/orders/dto/order-adjustments.dto.ts`, `502-backend/src/orders/discount-ledger.ts`
- Modify: `502-backend/src/orders/dto/update-order.dto.ts`, `edit-paid-order.dto.ts`, `order-include.ts`, `orders.service.ts`
- Create: `502-backend/src/discounts/discounts.module.ts`, `discounts.controller.ts`, `discounts.service.ts`, `dto/adjust-order.dto.ts`
- Modify: `502-backend/src/app.module.ts`
- Test: `502-backend/test/approvals.e2e-spec.ts`

**Interfaces:**
- Consumes: `adjustmentsOf`, `billOf`, `billedEndOf` (Task 2); `needsApproval`, `changedKeys`, `pickAdjustments`, `Adjustments` (Task 2); `lockOrderRow`.
- Produces:
  - `OrderAdjustmentsDto` (5 trường tùy chọn), `AdjustOrderDto extends OrderAdjustmentsDto { note?: string }`
  - `discount-ledger.ts`: `PENDING_REQUEST_MESSAGE`, `pendingRequestOf(tx, orderId): Promise<{ id: number } | null>`, `assertNoPendingRequest(tx, orderId)`, `expirePendingRequests(tx, orderId, at: Date)`, `logAdjustmentChange(tx, entry: AdjustmentLogEntry)`
  - `POST /orders/:id/adjustments` → order (`orderDetailInclude`) `& { branchManagers?: number }`
  - `orderDetailInclude.discountRequests` = yêu cầu PENDING (tối đa 1)
  - `DiscountsService.lockPendingOrder(tx, user, orderId)` (dùng lại ở Task 7)

- [ ] **Step 1: Test e2e**

```ts
  describe('discounts', () => {
    let orderId: number;

    it('a cashier discount waits for a manager and blocks checkout', async () => {
      orderId = (await openRoom(roomIds[5])).id as number;
      const url = `/orders/${orderId}/adjustments`;
      await as('tn1_cs1').post(url, { discountPercent: 10 }).expect(400); // no reason
      await as('tn1_cs1').post(url, {}).expect(400); // nothing changes
      const res = (
        await as('tn1_cs1')
          .post(url, { discountPercent: 10, note: 'Khách quen' })
          .expect(201)
      ).body as Json;
      expect(res.discountPercent).toBe(0);
      expect(res.branchManagers).toBe(1);
      const pending = (res.discountRequests as Json[])[0];
      expect(pending.note).toBe('Khách quen');
      await as('tn1_cs1').post(url, { taxPercent: 12 }).expect(409);
      await as('tn1_cs1')
        .post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' })
        .expect(409);
    });

    it('the discount fields no longer go through PATCH /orders/:id', async () => {
      const res = (
        await as('tn1_cs1')
          .patch(`/orders/${orderId}`, { discountPercent: 50 })
          .expect(200)
      ).body as Json;
      expect(res.discountPercent).toBe(0);
    });
  });

  describe('discounts applied at once', () => {
    it('managers apply at once; cashiers do when nothing gets cheaper', async () => {
      const order = await openRoom(roomIds[6] ?? roomIds[0]);
      const url = `/orders/${order.id}/adjustments`;
      const byManager = (
        await as('ql1_cs1').post(url, { discountAmount: 20000 }).expect(201)
      ).body as Json;
      expect(Number(byManager.discountAmount)).toBe(20000);
      expect(byManager.discountRequests).toEqual([]);
      const byCashier = (
        await as('tn1_cs1')
          .post(url, { discountAmount: 0, taxPercent: 12 })
          .expect(201)
      ).body as Json;
      expect(Number(byCashier.discountAmount)).toBe(0);
      expect(byCashier.taxPercent).toBe(12);
      await as('pv1_cs1').post(url, { taxPercent: 20 }).expect(403);
      await as('tn1_cs1').post(`/orders/${order.id}/cancel`).expect(403);
      await as('ql1_cs1').post(`/orders/${order.id}/cancel`).expect(200);
    });
  });
```

`roomIds[6] ?? roomIds[0]`: phòng 0 đã trống lại sau Task 3. Run — Expected: FAIL (404 trên `/adjustments`).

- [ ] **Step 2: DTO** — tạo `src/orders/dto/order-adjustments.dto.ts` bằng cách **chuyển** 5 trường `discountPercent`, `discountAmount`, `hourlyDiscountPercent`, `hourlyDiscountAmount`, `taxPercent` (nguyên decorator) từ `UpdateOrderDto`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

// The discounts and VAT of a bill. On an open session they go through
// POST /orders/:id/adjustments (a cashier's discount waits for a manager);
// a paid bill's correction (chain manager) also takes them.
export class OrderAdjustmentsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  hourlyDiscountPercent?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyDiscountAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;
}
```

`UpdateOrderDto` chỉ còn `items`, `cskhId`, `serverId` (xóa 5 trường và các import không dùng: `IsNumber`, `Max`, `Min`); comment đổi thành `// What may change on an open session besides discounts/VAT (see OrderAdjustmentsDto).`

`EditPaidOrderDto`: `export class EditPaidOrderDto extends IntersectionType(UpdateOrderDto, OrderAdjustmentsDto) {` với `import { ApiProperty, IntersectionType } from '@nestjs/swagger';` và import `OrderAdjustmentsDto`.

Tạo `src/discounts/dto/adjust-order.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderAdjustmentsDto } from '../../orders/dto/order-adjustments.dto';

export class AdjustOrderDto extends OrderAdjustmentsDto {
  @ApiProperty({
    required: false,
    maxLength: 500,
    description: 'Lý do; bắt buộc khi cần quản lý duyệt',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

- [ ] **Step 3: `discount-ledger.ts`**

```ts
import { ConflictException } from '@nestjs/common';
import {
  DiscountRequestStatus,
  DiscountSource,
  Prisma,
} from '@prisma/client';
import { Adjustments } from './discount-rules';

type Db = Prisma.TransactionClient;

export const PENDING_REQUEST_MESSAGE =
  'Hóa đơn đang chờ quản lý duyệt giảm giá. Chờ duyệt hoặc hủy yêu cầu.';

// Discount requests seen from the order's writers (checkout, cancel, the
// correction of a paid bill). Always called after the order's row lock, so
// the pending request of an order cannot change underneath. Uses the
// DiscountRequest(orderId) index.
export function pendingRequestOf(tx: Db, orderId: number) {
  return tx.discountRequest.findFirst({
    where: { orderId, status: DiscountRequestStatus.PENDING },
    select: { id: true },
  });
}

export async function assertNoPendingRequest(tx: Db, orderId: number) {
  if (await pendingRequestOf(tx, orderId)) {
    throw new ConflictException(PENDING_REQUEST_MESSAGE);
  }
}

// Closing a session (checkout, cancel) drops a request still waiting.
export function expirePendingRequests(tx: Db, orderId: number, at: Date) {
  return tx.discountRequest.updateMany({
    where: { orderId, status: DiscountRequestStatus.PENDING },
    data: { status: DiscountRequestStatus.EXPIRED, decidedAt: at },
  });
}

export interface AdjustmentLogEntry {
  branchId: number;
  orderId: number;
  source: DiscountSource;
  before: Adjustments;
  after: Adjustments;
  amountBefore: number;
  amountAfter: number;
  note?: string | null;
  userId: number;
}

// A change applied at once (DIRECT, PAID_EDIT): written as already approved
// by the one who made it.
export function logAdjustmentChange(tx: Db, entry: AdjustmentLogEntry) {
  const now = new Date();
  return tx.discountRequest.create({
    data: {
      branchId: entry.branchId,
      orderId: entry.orderId,
      status: DiscountRequestStatus.APPROVED,
      source: entry.source,
      before: { ...entry.before },
      after: { ...entry.after },
      amountBefore: entry.amountBefore,
      amountAfter: entry.amountAfter,
      note: entry.note?.trim() || null,
      requestedById: entry.userId,
      decidedById: entry.userId,
      decidedAt: now,
    },
    select: { id: true },
  });
}
```

- [ ] **Step 4: `orderDetailInclude`** — `order-include.ts`:

```ts
// The request of an open session still waiting for a manager (at most one).
export const pendingRequestSelect = {
  id: true,
  after: true,
  note: true,
  amountBefore: true,
  amountAfter: true,
  createdAt: true,
  requestedBy: staffRef,
} satisfies Prisma.DiscountRequestSelect;

export const orderDetailInclude = {
  ...orderInclude,
  prSessions: { select: prSessionSelect, orderBy: { id: 'asc' } },
  // DiscountRequest(orderId) index.
  discountRequests: {
    where: { status: 'PENDING' },
    select: pendingRequestSelect,
    take: 1,
  },
} satisfies Prisma.OrderInclude;
```

- [ ] **Step 5: OrdersService** — import `assertNoPendingRequest, expirePendingRequests` từ `'./discount-ledger'`.
  - `checkout`: ngay sau `lockOrder(...)`: `await assertNoPendingRequest(tx, id);`
  - `cancel`: sau `const now = new Date();`: `await expirePendingRequests(tx, id, now);`
  - `update`: `const { items, ...fields } = dto;` giữ nguyên (DTO không còn trường giảm giá, whitelist của `ValidationPipe` bỏ các trường lạ).

- [ ] **Step 6: DiscountsService (phần adjust)**

```ts
// src/discounts/discounts.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscountRequestStatus,
  DiscountSource,
  OrderStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { BranchScopeService } from '../common/branch-scope.service';
import { adjustmentsOf, billOf, billedEndOf } from '../orders/bill-of';
import {
  Adjustments,
  changedKeys,
  needsApproval,
  pickAdjustments,
} from '../orders/discount-rules';
import { logAdjustmentChange, pendingRequestOf } from '../orders/discount-ledger';
import { orderDetailInclude } from '../orders/order-include';
import { lockOrderRow } from '../orders/order-lock';
import { AdjustOrderDto } from './dto/adjust-order.dto';

type Db = Prisma.TransactionClient;

const CLOSED_MESSAGE = 'Phiên đã đóng';

@Injectable()
export class DiscountsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Loads an open session the user may act on and locks its row (every
  // writer of an order goes through the order lock first).
  async lockPendingOrder(tx: Db, user: AuthUser, orderId: number) {
    const found = await tx.order.findUnique({
      where: { id: orderId },
      select: { branchId: true },
    });
    if (!found) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.branchScope.assertBranchAccess(user, found.branchId);
    await lockOrderRow(tx, orderId, OrderStatus.PENDING, CLOSED_MESSAGE);
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { select: { price: true, quantity: true } } },
    });
  }

  // A manager's change, or one that makes nothing cheaper, applies at once
  // (and is logged); a cashier's discount becomes a request for the managers
  // of the branch.
  adjust(user: AuthUser, orderId: number, dto: AdjustOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockPendingOrder(tx, user, orderId);
      const before = adjustmentsOf(order);
      const after: Adjustments = { ...before, ...pickAdjustments(dto) };
      if (changedKeys(before, after).length === 0) {
        throw new BadRequestException('Không có thay đổi');
      }
      if (await pendingRequestOf(tx, order.id)) {
        throw new ConflictException('Đang có yêu cầu giảm giá chờ duyệt');
      }
      const end = billedEndOf(order, new Date());
      const amountBefore = billOf(order, end).finalAmount;
      const amountAfter = billOf(order, end, after).finalAmount;
      const direct =
        MANAGERS.includes(user.role) || !needsApproval(before, after);
      let branchManagers: number | undefined;

      if (direct) {
        await tx.order.update({ where: { id: order.id }, data: after });
        await logAdjustmentChange(tx, {
          branchId: order.branchId,
          orderId: order.id,
          source: DiscountSource.DIRECT,
          before,
          after,
          amountBefore,
          amountAfter,
          note: dto.note,
          userId: user.id,
        });
      } else {
        const note = dto.note?.trim();
        if (!note) throw new BadRequestException('Nhập lý do giảm giá');
        await tx.discountRequest.create({
          data: {
            branchId: order.branchId,
            orderId: order.id,
            status: DiscountRequestStatus.PENDING,
            source: DiscountSource.REQUEST,
            before: { ...before },
            after: { ...after },
            amountBefore,
            amountAfter,
            note,
            requestedById: user.id,
          },
        });
        // Whom it reaches: the branch managers who can sign in (the chain
        // managers always can). The screen warns when there is none.
        branchManagers = await tx.user.count({
          where: {
            branchId: order.branchId,
            role: Role.BRANCH_MANAGER,
            active: true,
            password: { not: null },
          },
        });
      }
      const saved = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: orderDetailInclude,
      });
      return { ...saved, branchManagers };
    });
  }
}
```

- [ ] **Step 7: Controller + module**

```ts
// src/discounts/discounts.controller.ts
import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { SALES } from '../auth/roles';
import { DiscountsService } from './discounts.service';
import { AdjustOrderDto } from './dto/adjust-order.dto';

@ApiTags('discounts')
@ApiBearerAuth()
@Controller()
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  // Discounts / VAT of an open session (not PATCH /orders/:id).
  @Post('orders/:id/adjustments')
  @Roles(...SALES)
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustOrderDto,
  ) {
    return this.discounts.adjust(user, id, dto);
  }
}
```

```ts
// src/discounts/discounts.module.ts
import { Module } from '@nestjs/common';
import { DiscountsController } from './discounts.controller';
import { DiscountsService } from './discounts.service';

@Module({
  controllers: [DiscountsController],
  providers: [DiscountsService],
})
export class DiscountsModule {}
```

`app.module.ts`: thêm `DiscountsModule` vào `imports`.

- [ ] **Step 8: Chạy** — `npm test && npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts` — Expected: PASS. Kiểm tra thêm `test/foundation.e2e-spec.ts` (nó có thể gửi giảm giá qua `PATCH /orders/:id`): nếu FAIL ở đó, đổi các lời gọi đó sang `as('<quản lý>').post('/orders/:id/adjustments', {...})` (quản lý → áp ngay) — chạy lại tới PASS.

- [ ] **Step 9: Commit**

```bash
git add src test
git commit -m "feat(sales): giảm giá qua yêu cầu duyệt, chặn thanh toán khi chờ"
```

---

### Task 7: Hàng chờ, duyệt / từ chối / hủy, nhật ký

**Files:**
- Create: `502-backend/src/discounts/decided-message.ts`, `decided-message.spec.ts`, `dto/discount-queries.ts`, `dto/decision.dto.ts`
- Modify: `502-backend/src/discounts/discounts.service.ts`, `discounts.controller.ts`
- Modify: `502-backend/src/orders/orders.service.ts` (`editPaid` ghi `PAID_EDIT`)
- Test: `502-backend/test/approvals.e2e-spec.ts`

**Interfaces:**
- Consumes: `lockPendingOrder` (Task 6), `logAdjustmentChange` (Task 6), `changedKeys`, `pickAdjustments`.
- Produces:
  - `GET /discount-requests/pending` (MANAGERS) → `DiscountRequestRow[]`, `X-Total-Count`, trần 200
  - `GET /discount-requests/pending-count` (MANAGERS) → `{ count: number }`
  - `GET /discount-requests?from&to&branch?&status?` (READERS) → `DiscountRequestRow[]`, `X-Total-Count`, trần 500
  - `GET /discount-requests/:id` (SALES_READERS) → `DiscountRequestRow`
  - `POST /discount-requests/:id/approve {note?}`, `/reject {note}` (MANAGERS), `/cancel` (SALES) → `DiscountRequestRow`
  - `DiscountRequestRow` = select `requestSelect` (dưới)
  - `decidedMessage(r: { status; decidedAt: Date | null; decidedBy: { fullName: string } | null }): string`

- [ ] **Step 1: Test `decidedMessage`**

```ts
// src/discounts/decided-message.spec.ts
import { DiscountRequestStatus } from '@prisma/client';
import { decidedMessage } from './decided-message';

const at = new Date(2026, 8, 30, 21, 5); // local 21:05
const by = { fullName: 'Nguyễn A' };

describe('decidedMessage', () => {
  it('names who decided and when', () => {
    expect(
      decidedMessage({ status: DiscountRequestStatus.APPROVED, decidedAt: at, decidedBy: by }),
    ).toBe('Yêu cầu đã được Nguyễn A duyệt lúc 21:05');
    expect(
      decidedMessage({ status: DiscountRequestStatus.REJECTED, decidedAt: at, decidedBy: by }),
    ).toBe('Yêu cầu đã bị Nguyễn A từ chối lúc 21:05');
    expect(
      decidedMessage({ status: DiscountRequestStatus.CANCELLED, decidedAt: at, decidedBy: by }),
    ).toBe('Yêu cầu đã được Nguyễn A hủy lúc 21:05');
  });
  it('says an expired request expired', () => {
    expect(
      decidedMessage({ status: DiscountRequestStatus.EXPIRED, decidedAt: at, decidedBy: null }),
    ).toBe('Yêu cầu đã hết hạn (phiên đã đóng hoặc giảm giá đã đổi)');
  });
});
```

- [ ] **Step 2: Viết `decided-message.ts`**

```ts
import { DiscountRequestStatus } from '@prisma/client';

// HH:mm in server local time (TZ=Asia/Ho_Chi_Minh).
const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// What the second manager to press Duyệt/Từ chối is told: the request was
// already handled, by whom and when.
export function decidedMessage(r: {
  status: DiscountRequestStatus;
  decidedAt: Date | null;
  decidedBy: { fullName: string } | null;
}) {
  const by = r.decidedBy?.fullName ?? 'người khác';
  const at = r.decidedAt ? ` lúc ${clock(r.decidedAt)}` : '';
  switch (r.status) {
    case DiscountRequestStatus.APPROVED:
      return `Yêu cầu đã được ${by} duyệt${at}`;
    case DiscountRequestStatus.REJECTED:
      return `Yêu cầu đã bị ${by} từ chối${at}`;
    case DiscountRequestStatus.CANCELLED:
      return `Yêu cầu đã được ${by} hủy${at}`;
    default:
      return 'Yêu cầu đã hết hạn (phiên đã đóng hoặc giảm giá đã đổi)';
  }
}
```

Run: `npx jest src/discounts` — Expected: PASS.

- [ ] **Step 3: Test e2e** — thêm vào `describe('discounts')` sau 2 test ở Task 6:

```ts
    it('reaches every manager of the branch, and nobody else', async () => {
      const queue = await as('ql1_cs1').get('/discount-requests/pending').expect(200);
      expect(queue.headers['x-total-count']).toBe('1');
      expect(((queue.body as Json[])[0].order as Json).id).toBe(orderId);
      const count = (
        await as('ql1_cs1').get('/discount-requests/pending-count').expect(200)
      ).body as Json;
      expect(count.count).toBe(1);
      expect(
        ((await as('admin').get('/discount-requests/pending').expect(200)).body as Json[]).length,
      ).toBe(1);
      expect(
        (await as('ql1_cs2').get('/discount-requests/pending').expect(200)).body,
      ).toEqual([]);
      await as('tn1_cs1').get('/discount-requests/pending').expect(403);
    });

    it('the first manager decides; the next one is told who did', async () => {
      const [request] = (
        await as('ql1_cs1').get('/discount-requests/pending').expect(200)
      ).body as Json[];
      const id = request.id as number;
      await as('ql1_cs2').post(`/discount-requests/${id}/approve`).expect(403);
      const approved = (
        await as('ql1_cs1').post(`/discount-requests/${id}/approve`).expect(201)
      ).body as Json;
      expect(approved.status).toBe('APPROVED');
      const second = await as('admin')
        .post(`/discount-requests/${id}/reject`, { note: 'Không' })
        .expect(409);
      expect((second.body as Json).message).toMatch(/đã được .* duyệt lúc/);
      const order = (await as('tn1_cs1').get(`/orders/${orderId}`).expect(200))
        .body as Json;
      expect(order.discountPercent).toBe(10);
      expect(order.discountRequests).toEqual([]);
      const seen = (
        await as('tn1_cs1').get(`/discount-requests/${id}`).expect(200)
      ).body as Json;
      expect(seen.status).toBe('APPROVED');
    });

    it('rejects with a reason, cancels, and expires when the session is cancelled', async () => {
      const url = `/orders/${orderId}/adjustments`;
      const req = async () =>
        (
          (
            await as('tn1_cs1')
              .post(url, { hourlyDiscountAmount: 10000, note: 'Lỗi âm thanh' })
              .expect(201)
          ).body as { discountRequests: Json[] }
        ).discountRequests[0].id as number;

      const a = await req();
      await as('ql1_cs1').post(`/discount-requests/${a}/reject`).expect(400);
      await as('ql1_cs1')
        .post(`/discount-requests/${a}/reject`, { note: 'Không đúng' })
        .expect(201);

      const b = await req();
      await as('tn1_cs1').post(`/discount-requests/${b}/cancel`).expect(201);

      // Checkout is refused while it waits; cancelling the session expires it.
      const c = await req();
      await as('tn1_cs1')
        .post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' })
        .expect(409);
      await as('ql1_cs1').post(`/orders/${orderId}/cancel`).expect(200);
      const late = await as('ql1_cs1')
        .post(`/discount-requests/${c}/approve`)
        .expect(409);
      expect((late.body as Json).message).toMatch(/hết hạn/);
    });

    it('keeps a log the board can read', async () => {
      const today = new Date();
      const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const res = await as('ql1_cs1')
        .get(`/discount-requests?from=2026-01-01&to=${d}`)
        .expect(200);
      const rows = res.body as Json[];
      const statuses = rows.map((r) => r.status);
      expect(statuses).toEqual(
        expect.arrayContaining(['APPROVED', 'REJECTED', 'CANCELLED']),
      );
      // The chain manager's paid-bill correction of Task 3 was logged too.
      const all = (
        await as('admin').get(`/discount-requests?from=2026-01-01&to=${d}`).expect(200)
      ).body as Json[];
      expect(all.some((r) => r.source === 'PAID_EDIT')).toBe(true);
      await as('tn1_cs1').get(`/discount-requests?from=${d}&to=${d}`).expect(403);
    });
```

Run — Expected: FAIL (404 `/discount-requests/pending`).

- [ ] **Step 4: DTO truy vấn và quyết định**

```ts
// src/discounts/dto/discount-queries.ts
import { ApiProperty } from '@nestjs/swagger';
import { DiscountRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải có dạng YYYY-MM-DD';

export class DiscountBranchQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class DiscountLogQuery extends DiscountBranchQuery {
  @ApiProperty({ description: 'Từ ngày kinh doanh YYYY-MM-DD' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from: string;

  @ApiProperty({ description: 'Đến ngày kinh doanh YYYY-MM-DD' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to: string;

  @ApiProperty({ required: false, enum: DiscountRequestStatus })
  @IsOptional()
  @IsEnum(DiscountRequestStatus)
  status?: DiscountRequestStatus;
}
```

```ts
// src/discounts/dto/decision.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveDto {
  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do từ chối' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập lý do từ chối' })
  @MaxLength(500)
  note: string;
}
```

- [ ] **Step 5: Service** — thêm vào `DiscountsService` (import thêm `businessDayRange`, `businessDatesBetween` từ `'../common/dates'`, `staffRef` từ `'../orders/order-include'`, `decidedMessage`, `DiscountLogQuery`, `Role`):

```ts
const QUEUE_LIMIT = 200;
const LOG_LIMIT = 500;

// What the queue, the log and the room page show of a request.
const requestSelect = {
  id: true,
  branchId: true,
  orderId: true,
  status: true,
  source: true,
  before: true,
  after: true,
  amountBefore: true,
  amountAfter: true,
  note: true,
  createdAt: true,
  decidedAt: true,
  decisionNote: true,
  requestedBy: staffRef,
  decidedBy: staffRef,
  branch: { select: { id: true, code: true, name: true } },
  order: {
    select: {
      id: true,
      billNumber: true,
      status: true,
      room: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.DiscountRequestSelect;
```

Methods:

```ts
  // Branch managers see their branch, the chain manager every branch
  // (whatever branch the screen is on).
  private queueWhere(user: AuthUser): Prisma.DiscountRequestWhereInput {
    return {
      status: DiscountRequestStatus.PENDING,
      branchId: user.role === Role.CHAIN_MANAGER ? undefined : user.branchId!,
    };
  }

  // Oldest first. DiscountRequest(branchId, status) index.
  pending(user: AuthUser) {
    const where = this.queueWhere(user);
    return Promise.all([
      this.prisma.discountRequest.findMany({
        where,
        select: requestSelect,
        orderBy: { id: 'asc' },
        take: QUEUE_LIMIT,
      }),
      this.prisma.discountRequest.count({ where }),
    ]);
  }

  async pendingCount(user: AuthUser) {
    return {
      count: await this.prisma.discountRequest.count({
        where: this.queueWhere(user),
      }),
    };
  }

  // Newest first, by the business day it was sent (≤ 366 days).
  // DiscountRequest(branchId, createdAt) index.
  async log(user: AuthUser, query: DiscountLogQuery) {
    businessDatesBetween(query.from, query.to, 366);
    const branchId = await this.branchScope.resolveOptionalBranchId(
      user,
      query.branch,
    );
    const where: Prisma.DiscountRequestWhereInput = {
      branchId,
      status: query.status,
      createdAt: businessDayRange(query.from, query.to),
    };
    return Promise.all([
      this.prisma.discountRequest.findMany({
        where,
        select: requestSelect,
        orderBy: { id: 'desc' },
        take: LOG_LIMIT,
      }),
      this.prisma.discountRequest.count({ where }),
    ]);
  }

  async findOne(user: AuthUser, id: number) {
    const request = await this.prisma.discountRequest.findUnique({
      where: { id },
      select: requestSelect,
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu');
    this.branchScope.assertBranchAccess(user, request.branchId);
    return request;
  }

  approve(user: AuthUser, id: number, note?: string) {
    return this.decide(user, id, DiscountRequestStatus.APPROVED, note);
  }

  reject(user: AuthUser, id: number, note: string) {
    return this.decide(user, id, DiscountRequestStatus.REJECTED, note);
  }

  cancel(user: AuthUser, id: number) {
    return this.decide(user, id, DiscountRequestStatus.CANCELLED);
  }

  // Whoever acts first wins: the order is locked first (as by every writer
  // of an order), then the request only moves while still PENDING. A stale
  // request (the bill's discounts changed meanwhile) expires instead of
  // overwriting a newer value; that is committed before the 409 is thrown.
  private async decide(
    user: AuthUser,
    id: number,
    status: DiscountRequestStatus,
    note?: string,
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const request = await tx.discountRequest.findUnique({
        where: { id },
        select: { orderId: true, branchId: true },
      });
      if (!request) throw new NotFoundException('Không tìm thấy yêu cầu');
      this.branchScope.assertBranchAccess(user, request.branchId);

      // A closed session already expired its request (checkout, cancel).
      const { count: open } = await tx.order.updateMany({
        where: { id: request.orderId, status: OrderStatus.PENDING },
        data: { updatedAt: new Date() },
      });
      const current = await tx.discountRequest.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          decidedAt: true,
          decidedBy: { select: { fullName: true } },
          before: true,
          after: true,
        },
      });
      if (current.status !== DiscountRequestStatus.PENDING) {
        throw new ConflictException(decidedMessage(current));
      }
      if (open === 0) throw new ConflictException(CLOSED_MESSAGE);

      const now = new Date();
      if (status === DiscountRequestStatus.APPROVED) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: request.orderId },
          include: { items: { select: { price: true, quantity: true } } },
        });
        const before = current.before as Adjustments;
        if (changedKeys(before, adjustmentsOf(order)).length > 0) {
          await tx.discountRequest.update({
            where: { id },
            data: { status: DiscountRequestStatus.EXPIRED, decidedAt: now },
          });
          return { stale: true as const };
        }
        await tx.order.update({
          where: { id: request.orderId },
          data: current.after as Adjustments,
        });
      }
      await tx.discountRequest.update({
        where: { id },
        data: {
          status,
          decidedById: user.id,
          decidedAt: now,
          decisionNote: note?.trim() || null,
        },
      });
      return { stale: false as const };
    });
    if (outcome.stale) {
      throw new ConflictException(
        'Giảm giá của hóa đơn đã thay đổi, thu ngân cần gửi lại yêu cầu',
      );
    }
    return this.prisma.discountRequest.findUniqueOrThrow({
      where: { id },
      select: requestSelect,
    });
  }
```

`cancel` chỉ dành cho SALES (controller). Thêm vào đầu `decide` khi `status === CANCELLED`: không cần kiểm tra thêm (thu ngân và quản lý cùng cơ sở đều hủy được — spec §3).

- [ ] **Step 6: Controller** — thêm vào `DiscountsController` (import `Get`, `Query`, `Res`, `HttpCode`, `HttpStatus` không cần — POST mặc định 201 như test; `withTotalCount`, `MANAGERS`, `READERS`, `SALES_READERS`, `Response`, `DiscountLogQuery`, `ApproveDto`, `RejectDto`):

```ts
  // The approval queue of the caller (branch manager: own branch; chain
  // manager: every branch), oldest first; the newest 200.
  @Get('discount-requests/pending')
  @Roles(...MANAGERS)
  pending(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.discounts.pending(user));
  }

  // The sidebar badge (polled every 15 s on managers' screens only).
  @Get('discount-requests/pending-count')
  @Roles(...MANAGERS)
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.discounts.pendingCount(user);
  }

  // Nhật ký giảm giá, newest 500.
  @Get('discount-requests')
  @Roles(...READERS)
  log(
    @CurrentUser() user: AuthUser,
    @Query() query: DiscountLogQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.discounts.log(user, query));
  }

  // The room page reads what became of its request.
  @Get('discount-requests/:id')
  @Roles(...SALES_READERS)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discounts.findOne(user, id);
  }

  @Post('discount-requests/:id/approve')
  @Roles(...MANAGERS)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveDto,
  ) {
    return this.discounts.approve(user, id, dto.note);
  }

  @Post('discount-requests/:id/reject')
  @Roles(...MANAGERS)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDto,
  ) {
    return this.discounts.reject(user, id, dto.note);
  }

  @Post('discount-requests/:id/cancel')
  @Roles(...SALES)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discounts.cancel(user, id);
  }
```

Đặt `pending` và `pending-count` **trước** `:id` trong file (Nest khớp theo thứ tự khai báo).

- [ ] **Step 7: `editPaid` ghi `PAID_EDIT`** — trong `orders.service.ts` `editPaid`, sau `tx.order.update(...)` (import `changedKeys`, `pickAdjustments`, `logAdjustmentChange`, `DiscountSource`):

```ts
        // Discounts / VAT changed on a paid bill: logged with the reason.
        const before = adjustmentsOf(order);
        const after = { ...before, ...pickAdjustments(fields) };
        if (changedKeys(before, after).length > 0) {
          await logAdjustmentChange(tx, {
            branchId: order.branchId,
            orderId: id,
            source: DiscountSource.PAID_EDIT,
            before,
            after,
            amountBefore: Number(order.finalAmount),
            amountAfter: bill.finalAmount,
            note: reason,
            userId: user.id,
          });
        }
```

- [ ] **Step 8: Chạy** — `npm test`, rồi e2e `approvals` — Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src test/approvals.e2e-spec.ts
git commit -m "feat(sales): hàng chờ duyệt giảm giá, duyệt/từ chối/hủy và nhật ký"
```

---

### Task 8: Xóa dữ liệu, EXPLAIN, tài liệu backend

**Files:**
- Modify: `502-backend/src/data-purge/data-purge.service.ts`
- Modify: `test/board.e2e-spec.ts` nếu nó so sánh đúng bộ khóa của `deleted`
- Modify: `docs/resource-rules.md`, `CLAUDE.md`, `DEPLOYMENT.md`

- [ ] **Step 1: Purge** — trong `counts`, trước `orderItems`:

```ts
          // Before orders: both point at an order.
          discountRequests: (
            await tx.discountRequest.deleteMany({ where: own })
          ).count,
          orderEvents: (await tx.orderEvent.deleteMany({ where: own })).count,
```

Sửa comment đầu class: "…bills (with their discount requests and time-unlock log), stock, fund…".

- [ ] **Step 2: Chạy `board` e2e** — `npx jest --config ./test/jest-e2e.json --runInBand test/board.e2e-spec.ts`. Nếu test so `deleted` bằng `toEqual` với bộ khóa cố định, thêm `discountRequests` và `orderEvents` vào mong đợi. Expected: PASS.

- [ ] **Step 3: EXPLAIN trên dữ liệu load** (theo `docs/resource-rules.md` §6; dựng `kara-load-pg` nếu chưa có, chạy `migrate deploy` lên nó). Chạy trong `psql`:

```sql
EXPLAIN ANALYZE SELECT id FROM "DiscountRequest" WHERE "orderId" = 12345 AND status = 'PENDING' LIMIT 1;
EXPLAIN ANALYZE SELECT count(*) FROM "DiscountRequest" WHERE "branchId" = 1 AND status = 'PENDING';
EXPLAIN ANALYZE SELECT id FROM "DiscountRequest" WHERE "branchId" = 1 AND "createdAt" >= now() - interval '30 days' ORDER BY id DESC LIMIT 500;
EXPLAIN ANALYZE SELECT o.id, o."timeLockedAt" FROM "Order" o WHERE o."roomId" = 1 AND o.status = 'PENDING' LIMIT 1;
```

Expected: 3 dòng đầu `Index Scan`/`Bitmap Index Scan` trên index mới (bảng rỗng thì Postgres có thể chọn Seq Scan — chèn 50k dòng giả bằng `INSERT … SELECT generate_series` để kiểm tra rồi xóa); dòng 4 không đổi so với trước (cột mới không ảnh hưởng index). Ghi kết quả vào mô tả commit.

- [ ] **Step 4: `docs/resource-rules.md`**
  - §1.1 danh sách trần: thêm "hàng chờ duyệt giảm giá 200, nhật ký giảm giá 500".
  - §3.2 ví dụ bảng phụ: thêm "`DiscountRequest`: ~30 dòng/cơ sở/ngày (~55 nghìn/năm cho 5 cơ sở), `OrderEvent`: chỉ khi mở khóa giờ; giữ như sổ sách, xóa cùng "Xóa dữ liệu"".
  - §2.3 polling: thêm "badge Duyệt giảm giá mỗi 15 giây, chỉ trên máy quản lý".

- [ ] **Step 5: `CLAUDE.md`**
  - Mục "Accounts and permissions": `CASHIER` — giảm giá/hạ VAT gửi quản lý duyệt; `STAFF` — phục vụ được gán (`serverId`) gọi/bớt món, gán PR, chốt giờ phòng mình; CSKH chỉ xem; sửa/hủy hóa đơn đã thanh toán chỉ `CHAIN_MANAGER` (`CHAIN_ONLY`).
  - Mục "Orders / billing": chốt giờ (`timeLockedAt`, `lock-time`/`unlock-time`, `OrderEvent`, thanh toán `endTime = timeLockedAt`); giảm giá qua `POST /orders/:id/adjustments` và `src/discounts` (`DiscountRequest`, `needsApproval`, hàng chờ theo cơ sở, ai trước thắng, chặn thanh toán khi chờ, `PAID_EDIT`).
  - Danh sách migration: `20261002000000_sales_approvals` (§6.16).
  - Lệnh e2e: thêm `approvals`.

- [ ] **Step 6: `DEPLOYMENT.md`** — thêm §6.16: migration `20261002000000_sales_approvals` chỉ thêm cột/bảng (không đổi dữ liệu cũ); sau khi cập nhật, đặt mật khẩu cho tài khoản phục vụ nếu muốn họ gọi món, và mỗi cơ sở cần ít nhất một quản lý cơ sở có mật khẩu để duyệt giảm giá.

- [ ] **Step 7: Chạy lại cả bộ** — `npm run lint && npm test && npm run build`; e2e từng bộ: `foundation`, `reports`, `costing`, `board`, `pr`, `approvals`. Expected: tất cả PASS.

- [ ] **Step 8: Commit**

```bash
git add src test docs CLAUDE.md DEPLOYMENT.md
git commit -m "chore: xóa dữ liệu gồm yêu cầu giảm giá, cập nhật tài liệu"
```

---

### Task 9: Frontend — kiểu, quyền, luật giảm giá, điều hướng

**Files:**
- Modify: `502-frontend/src/lib/types.ts`, `lib/permissions.ts`, `lib/navigation.ts`, `components/sales/bill-sheet.tsx`
- Create: `502-frontend/src/lib/discount-rules.ts`

**Interfaces:**
- Produces:
  - `Order.timeLockedAt: string | null`, `Order.timeLockedBy?: StaffRef | null`, `Order.discountRequests?: PendingDiscount[]`; `Room.activeOrder.timeLockedAt: string | null`
  - `type Adjustments`, `interface PendingDiscount`, `interface DiscountRequestRow`, `type DiscountRequestStatus`, `type DiscountSource`
  - `Permission` thêm `"sales.void" | "discounts.approve" | "discounts.view"`; `isServerOf(user, order)`
  - `lib/discount-rules.ts`: `ADJUSTMENT_KEYS`, `needsApproval`, `changedKeys`, `adjustmentsOf(order)`

- [ ] **Step 1: `types.ts`** — trong `interface Order` sau `editReason`:

```ts
  // Chốt giờ: the room fee stops here; checkout takes it as endTime.
  timeLockedAt: string | null;
  timeLockedBy?: StaffRef | null;
  // Only on a single order: the discount request waiting for a manager (0 or 1).
  discountRequests?: PendingDiscount[];
```

`Room.activeOrder` thêm `timeLockedAt: string | null;`. Cuối file:

```ts
export type Adjustments = Pick<
  Order,
  "discountPercent" | "hourlyDiscountPercent" | "taxPercent"
> & { discountAmount: number; hourlyDiscountAmount: number };

export type DiscountRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
export type DiscountSource = "REQUEST" | "DIRECT" | "PAID_EDIT";

export interface PendingDiscount {
  id: number;
  after: Adjustments;
  note: string | null;
  amountBefore: string | number;
  amountAfter: string | number;
  createdAt: string;
  requestedBy: StaffRef | null;
}

// GET /discount-requests (queue, log, one request).
export interface DiscountRequestRow extends Omit<PendingDiscount, "after"> {
  branchId: number;
  orderId: number;
  status: DiscountRequestStatus;
  source: DiscountSource;
  before: Adjustments;
  after: Adjustments;
  decidedAt: string | null;
  decisionNote: string | null;
  decidedBy: StaffRef | null;
  branch: { id: number; code: string; name: string };
  order: { id: number; billNumber: string | null; status: OrderStatus; room: { id: number; name: string } | null };
}
```

- [ ] **Step 2: `lib/discount-rules.ts`**

```ts
import type { Adjustments, Order } from "@/lib/types";

// Mirror of 502-backend/src/orders/discount-rules.ts — keep them in sync.
export const ADJUSTMENT_KEYS = [
  "discountPercent",
  "discountAmount",
  "hourlyDiscountPercent",
  "hourlyDiscountAmount",
  "taxPercent",
] as const satisfies readonly (keyof Adjustments)[];

const DISCOUNT_KEYS = ADJUSTMENT_KEYS.filter((k) => k !== "taxPercent");

// Any discount going up or VAT going down needs a manager.
export const needsApproval = (before: Adjustments, after: Adjustments) =>
  DISCOUNT_KEYS.some((k) => after[k] > before[k]) || after.taxPercent < before.taxPercent;

export const changedKeys = (before: Adjustments, after: Adjustments) =>
  ADJUSTMENT_KEYS.filter((k) => before[k] !== after[k]);

export const adjustmentsOf = (order: Order): Adjustments => ({
  discountPercent: order.discountPercent,
  discountAmount: Number(order.discountAmount),
  hourlyDiscountPercent: order.hourlyDiscountPercent,
  hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
  taxPercent: order.taxPercent,
});

export const ADJUSTMENT_LABELS: Record<(typeof ADJUSTMENT_KEYS)[number], string> = {
  discountPercent: "Giảm giá món (%)",
  discountAmount: "Giảm giá món (đ)",
  hourlyDiscountPercent: "Giảm giá giờ (%)",
  hourlyDiscountAmount: "Giảm giá giờ (đ)",
  taxPercent: "VAT (%)",
};
```

Trong `app/[branch]/sales/rooms/[id]/page.tsx`: xóa `type Adjustments`, `adjustmentsOf` cục bộ, import từ `@/lib/types` và `@/lib/discount-rules`.

- [ ] **Step 3: `permissions.ts`** — thêm vào union `Permission`:

```ts
  | "sales.void" // void a paid bill (chain manager only)
  | "discounts.approve" // approve / reject cashiers' discount requests
  | "discounts.view" // discount log (read only)
```

`MATRIX`: `"sales.editPaid": ["CHAIN_MANAGER"]`, `"sales.void": ["CHAIN_MANAGER"]`, `"discounts.approve": MANAGERS`, `"discounts.view": READERS`. `ROUTE_PERMISSIONS`: thêm `["/sales/discounts", "discounts.view"],` trước `["/sales/settings", …]`. Cuối file:

```ts
// The floor staff member assigned as server of this session: orders for it,
// brings PR/KTV in and locks its time. The backend checks it again.
export function isServerOf(user: User | null, order: Pick<Order, "serverId">): boolean {
  return !!user && user.role === "STAFF" && order.serverId === user.id;
}
```

(import `Order` từ `@/lib/types`.)

- [ ] **Step 4: `navigation.ts`** — nhóm "Bán hàng", sau "Hóa đơn":

```ts
      { title: "Duyệt giảm giá", path: "/sales/discounts", icon: BadgePercent, permission: "discounts.view" },
```

(import `BadgePercent` từ `lucide-react`.)

- [ ] **Step 5: `bill-sheet.tsx`** — dòng 182 đổi điều kiện thành `(can(user, "sales.editPaid") || can(user, "sales.void"))`, dòng 190 `can(user, "sales.cancel")` → `can(user, "sales.void")`.

- [ ] **Step 6: Kiểm tra** — `cd 502-frontend && npm run lint && npx tsc --noEmit`. Expected: không lỗi (trang phòng có thể báo lỗi kiểu ở `adjust` → sửa ở Task 10/11; nếu có, để `// @ts-expect-error` là không được — thay vào đó làm Task 10 ngay rồi mới chạy lại).

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(web): quyền mới, kiểu và luật giảm giá"
```

---

### Task 10: Frontend — trang phòng cho phục vụ, chốt giờ; sơ đồ phòng

**Files:**
- Modify: `502-frontend/src/app/[branch]/sales/rooms/[id]/page.tsx`
- Modify: `502-frontend/src/app/[branch]/sales/rooms/page.tsx`

**Interfaces:**
- Consumes: `isServerOf`, `Order.timeLockedAt`, `Room.activeOrder.timeLockedAt` (Task 9); routes `lock-time`/`unlock-time` (Task 4).

- [ ] **Step 1: Quyền theo phòng** — trong `RoomDetailPage`, sau `const [order, setOrder] = …` các cờ tính theo order:

```tsx
  // The server assigned to this session orders, brings PR/KTV in and locks
  // the time for it; the CSKH only looks (the backend checks it again).
  const isServer = !!order && isServerOf(user, order);
  const canEditItems = canOperate || isServer;
  const canAssignPrHere = canAssignPr || isServer;
  const locked = !!order?.timeLockedAt;
  const showLeft = canEditItems || canAssignPrHere;
```

Xóa `const showLeft = canOperate || canAssignPr;` cũ.

- [ ] **Step 2: Tải thực đơn cho phục vụ** — trong `load`, thay khối `Promise.all` bằng:

```tsx
        const orderRes = await api.get<Order>(`/orders/${roomRes.data.activeOrderId}`);
        // The menu for whoever orders here: sales roles and this room's server.
        const menu = canOperate || isServerOf(user, orderRes.data);
        const [productsRes, staffRes] = await Promise.all([
          menu
            ? api.get<Product[]>("/products", { params: { branch } })
            : Promise.resolve({ data: [] as Product[] }),
          canOperate
            ? api.get<FloorStaff[]>("/users/floor-staff", { params: { branch } })
            : Promise.resolve({ data: [] as FloorStaff[] }),
        ]);
```

Thêm `user` vào deps của effect.

- [ ] **Step 3: Thay các chỗ dùng `canOperate`** trong phần render theo bảng:

| Chỗ | Điều kiện mới |
|---|---|
| `Tabs defaultValue` | `canEditItems ? "menu" : "pr"` |
| `CardTitle` thẻ trái | `canEditItems ? "Thực đơn & PR/KTV" : "PR/KTV"` |
| mô tả & `TabsList` | `canEditItems && canAssignPrHere` |
| `TabsContent value="menu"` | `canEditItems` |
| `TabsContent value="pr"` | `canAssignPrHere` |
| nút +/−, ô số lượng, nút xóa món | `canEditItems` |
| `RoomPrList canEdit` | `canAssignPrHere` |
| mô tả EmptyState "Chọn món ở thực đơn…" | `canEditItems` |
| chọn CSKH/phục vụ, khung giảm giá, nút Thanh toán | giữ `canOperate` |

Trong `TabsContent value="pr"`: khi `locked` thì thay `PrPicker` bằng

```tsx
<EmptyState icon={LockIcon} title="Phòng đã chốt giờ" description="Không thêm PR/KTV sau khi chốt giờ." />
```

- [ ] **Step 4: Tiền giờ dừng khi chốt** — trong `computeBill({...})` thay `endTime: now,` bằng `endTime: order.timeLockedAt ? new Date(order.timeLockedAt) : now,`.

- [ ] **Step 5: Nút chốt / mở khóa** — thêm state `const [lockOpen, setLockOpen] = useState(false);` và hành động:

```tsx
  // Both go through the order queue, after the edits already sent.
  const lockTime = () =>
    runOrderAction(
      () => api.post<Order>(`/orders/${orderRef.current!.id}/lock-time`).then((r) => r.data),
      "Không thể chốt giờ",
    );
  const unlockTime = () =>
    runOrderAction(
      () => api.post<Order>(`/orders/${orderRef.current!.id}/unlock-time`).then((r) => r.data),
      "Không thể mở khóa giờ",
    );
```

Trong `PageHeader actions`, trước nút "Hủy phiên":

```tsx
            {!locked && canEditItems && (
              <Button variant="outline" onClick={() => setLockOpen(true)}>
                <LockIcon data-icon="inline-start" />
                Chốt giờ
              </Button>
            )}
            {locked && canOperate && (
              <Button variant="outline" onClick={() => setLockOpen(true)}>
                <LockOpenIcon data-icon="inline-start" />
                Mở khóa giờ
              </Button>
            )}
```

Cuối component, cạnh `ConfirmDialog` hủy phiên:

```tsx
      <ConfirmDialog
        open={lockOpen}
        onOpenChange={setLockOpen}
        title={locked ? `Mở khóa giờ phòng ${room?.name ?? ""}?` : `Chốt giờ phòng ${room?.name ?? ""}?`}
        description={
          locked
            ? "Tiền giờ tính tiếp từ giờ vào, kể cả khoảng đã khóa. Việc mở khóa được ghi lại."
            : "Tiền giờ dừng tại bây giờ, PR/KTV đang trong phòng được cho ra. Vẫn gọi thêm món được."
        }
        confirmLabel={locked ? "Mở khóa giờ" : "Chốt giờ"}
        onConfirm={async () => {
          const ok = await (locked ? unlockTime() : lockTime());
          if (!ok) return false;
        }}
      />
```

(import `LockIcon`, `LockOpenIcon` từ `lucide-react`; kiểm tra `ConfirmDialog.onConfirm` nhận `Promise<boolean | void>` như `ReasonDialog` — nếu chỉ nhận `() => void`, bỏ `return false`.)

- [ ] **Step 6: Nhãn trạng thái hóa đơn** — `CardAction`:

```tsx
            <CardAction>
              {locked ? (
                <Badge variant="warning">Đã chốt {formatTime(order.timeLockedAt!)}</Badge>
              ) : (
                <Badge variant="destructive">Đang hát</Badge>
              )}
            </CardAction>
```

- [ ] **Step 7: Sơ đồ phòng** — `app/[branch]/sales/rooms/page.tsx`: trong `roomSummary`, sau dòng `từ …`:

```ts
  if (room.activeOrder?.timeLockedAt) parts.push(`đã chốt giờ ${formatTime(room.activeOrder.timeLockedAt)}`);
```

Dòng hiển thị thời gian trên thẻ:

```tsx
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        lockedAt ? "font-medium text-warning" : active ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {active && room.startTime
                        ? lockedAt
                          ? `Chờ thanh toán · ${formatElapsed(minutesBetween(room.startTime, lockedAt))}`
                          : formatElapsed(minutesBetween(room.startTime, now))
                        : status.label}
                    </span>
```

với `const lockedAt = room.activeOrder?.timeLockedAt ?? null;` khai báo cạnh `active` trong vòng `map`. Nếu nhãn làm tràn thẻ ở 360 px, rút gọn thành `Chờ TT · …` và giữ đủ chữ trong `title`.

- [ ] **Step 8: Kiểm tra trong trình duyệt** — `preview_start` backend + frontend (`.claude/launch.json` đã có), đăng nhập `pv1_cs1`/`12345678` sau khi `tn1_cs1` mở phòng với phục vụ `pv1_cs1`. Kiểm tra ở 390 px (`resize_window` mobile): phục vụ thấy thực đơn, thêm món được, tab PR thêm được PR, nút "Chốt giờ" chốt được, không có "Mở khóa giờ", không có khung giảm giá và nút Thanh toán; `cskh1_cs1` chỉ xem. `tn1_cs1` thấy "Chờ thanh toán" trên sơ đồ và "Mở khóa giờ". `read_console_messages` không lỗi. Chụp màn hình làm bằng chứng.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(web): phục vụ gọi món, chốt giờ, sơ đồ phòng chờ thanh toán"
```

---

### Task 11: Frontend — khung giảm giá có gửi duyệt

**Files:**
- Create: `502-frontend/src/components/sales/bill-adjustments.tsx`
- Modify: `502-frontend/src/app/[branch]/sales/rooms/[id]/page.tsx`

**Interfaces:**
- Consumes: `needsApproval`, `changedKeys`, `adjustmentsOf`, `ADJUSTMENT_LABELS` (Task 9); `POST /orders/:id/adjustments`, `POST /discount-requests/:id/cancel`, `GET /discount-requests/:id` (Task 6–7).
- Produces: `<BillAdjustments order billFor canApply onSubmit onCancelRequest />`.

- [ ] **Step 1: Component**

```tsx
// components/sales/bill-adjustments.tsx
"use client";

import { useState } from "react";
import { ChevronDownIcon, ClockIcon, PercentIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ReasonDialog } from "@/components/reason-dialog";
import { ADJUSTMENT_LABELS, adjustmentsOf, changedKeys, needsApproval } from "@/lib/discount-rules";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Bill } from "@/lib/billing";
import type { Adjustments, Order } from "@/lib/types";

const ROW = "grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2";
const clampPercent = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
const nonNegative = (v: string) => Math.max(0, Math.round(Number(v) || 0));

interface BillAdjustmentsProps {
  order: Order;
  // The live bill with other adjustments (for "Tổng mới").
  billFor: (adjustments: Adjustments) => Bill;
  // Managers apply every change at once; a cashier only what makes nothing cheaper.
  canApply: boolean;
  // Resolves to whether it was saved.
  onSubmit: (adjustments: Adjustments, note?: string) => Promise<boolean>;
  onCancelRequest: (requestId: number) => Promise<boolean>;
}

// Discounts and VAT of an open session. Edits stay local until Áp dụng /
// Gửi duyệt; a cashier's discount becomes a request the managers approve.
export function BillAdjustments({ order, billFor, canApply, onSubmit, onCancelRequest }: BillAdjustmentsProps) {
  const saved = adjustmentsOf(order);
  const pending = order.discountRequests?.[0] ?? null;
  // The page remounts this with a key of the saved values and the pending
  // request, so a new saved state (poll, approval) resets the draft without
  // setting state in an effect.
  const [draft, setDraft] = useState<Adjustments>(saved);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const changed = changedKeys(saved, draft);
  const approval = !canApply && needsApproval(saved, draft);
  const preview = billFor(draft);
  const active = [saved.discountPercent || saved.discountAmount, saved.hourlyDiscountPercent || saved.hourlyDiscountAmount].filter(Boolean).length;

  const submit = async (note?: string) => {
    setBusy(true);
    const ok = await onSubmit(draft, note);
    setBusy(false);
    return ok;
  };

  const row = (id: string, label: string, pk: "discountPercent" | "hourlyDiscountPercent", ak: "discountAmount" | "hourlyDiscountAmount", applied: number) => (
    <Field className={ROW}>
      <FieldLabel htmlFor={`${id}-percent`}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={`${id}-percent`}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          disabled={!!pending}
          className="text-right tabular-nums"
          value={draft[pk]}
          onChange={(e) => setDraft({ ...draft, [pk]: clampPercent(e.target.value) })}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>%</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput
          type="number"
          inputMode="numeric"
          min={0}
          disabled={!!pending}
          aria-label={`${label} (số tiền)`}
          className="text-right tabular-nums"
          value={draft[pk] > 0 ? applied : draft[ak]}
          onChange={(e) => setDraft({ ...draft, [pk]: 0, [ak]: nonNegative(e.target.value) })}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>đ</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );

  return (
    <Collapsible defaultOpen={active > 0 || !!pending}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group w-full justify-between">
          <span className="flex items-center gap-2">
            <PercentIcon />
            Giảm giá & thuế
            {pending ? <Badge variant="warning">Chờ duyệt</Badge> : active > 0 && <Badge variant="secondary">{active}</Badge>}
          </span>
          <ChevronDownIcon className="transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        {pending && (
          <Alert>
            <ClockIcon />
            <AlertTitle>Đang chờ quản lý duyệt</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>
                {changedKeys(saved, pending.after)
                  .map((k) => `${ADJUSTMENT_LABELS[k]}: ${formatNumber(saved[k])} → ${formatNumber(pending.after[k])}`)
                  .join(" · ")}
              </span>
              <span className="tabular-nums">
                Tổng {formatMoney(pending.amountBefore)} → {formatMoney(pending.amountAfter)} · Lý do: {pending.note}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onCancelRequest(pending.id);
                  setBusy(false);
                }}
              >
                Hủy yêu cầu
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup className="gap-3">
          {row("discount", "Giảm giá món", "discountPercent", "discountAmount", preview.discountAmount)}
          {row("hourly-discount", "Giảm giá giờ", "hourlyDiscountPercent", "hourlyDiscountAmount", preview.hourlyDiscountAmount)}
          <Field className={ROW}>
            <FieldLabel htmlFor="tax-percent">Thuế VAT</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="tax-percent"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                disabled={!!pending}
                className="text-right tabular-nums"
                value={draft.taxPercent}
                onChange={(e) => setDraft({ ...draft, taxPercent: clampPercent(e.target.value) })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>%</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <span className="pr-3 text-right text-sm tabular-nums">{formatNumber(preview.taxAmount)} đ</span>
          </Field>
        </FieldGroup>
        {changed.length > 0 && !pending && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm tabular-nums">Tổng mới: {formatMoney(preview.finalAmount)}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(saved)}>
                Hoàn tác
              </Button>
              <Button size="sm" disabled={busy} onClick={() => (approval ? setReasonOpen(true) : submit())}>
                {approval ? "Gửi duyệt" : "Áp dụng"}
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
      <ReasonDialog
        open={reasonOpen}
        onOpenChange={setReasonOpen}
        title="Gửi quản lý duyệt giảm giá"
        description={`Tổng ${formatMoney(billFor(saved).finalAmount)} → ${formatMoney(preview.finalAmount)}. Yêu cầu gửi tới mọi quản lý của cơ sở.`}
        confirmLabel="Gửi duyệt"
        onConfirm={async (note) => {
          const ok = await submit(note);
          if (!ok) return false;
        }}
      />
    </Collapsible>
  );
}
```

Trước khi viết, kiểm tra: `components/ui/alert.tsx` export `Alert/AlertTitle/AlertDescription`; `Bill` được export từ `lib/billing.ts` (nếu tên khác, dùng `ReturnType<typeof computeBill>`); `Badge` có variant `warning` (có, theo CLAUDE.md); `formatNumber`/`formatMoney` nhận `string | number`. Chép hằng số `ADJUSTMENT_ROW`/`ADJUSTMENT_LABEL` từ trang phòng thay cho `ROW` nếu khác nhau, để giao diện không đổi.

- [ ] **Step 2: Nối vào trang phòng**

- Xóa state `adjust`/`setAdjust`, hàm `saveAdjustments`, `adjustmentRow`, `activeAdjustments`, các `setAdjust(adjustmentsOf(...))`, khối `Collapsible` giảm giá cũ, và điều kiện `!adjust` ở `if (!order || !adjust)`.
- `computeBill` dùng `...adjustmentsOf(order)` thay `...adjust`; `BillSummary percents={adjustmentsOf(order)}`.
- Thêm:

```tsx
  // null: nothing waiting; the id of the request this screen last saw pending.
  const pendingIdRef = useRef<number | null>(null);

  const submitAdjustments = (adjustments: Adjustments, note?: string) =>
    runOrderAction(
      () =>
        api
          .post<Order & { branchManagers?: number }>(`/orders/${orderRef.current!.id}/adjustments`, { ...adjustments, note })
          .then((res) => {
            const sent = res.data.discountRequests?.length;
            if (sent && res.data.branchManagers === 0) {
              notify.warning("Cơ sở chưa có quản lý cơ sở, yêu cầu chỉ tới quản lý hệ thống");
            } else if (sent) {
              notify.success("Đã gửi yêu cầu, chờ quản lý duyệt");
            } else {
              notify.success("Đã áp dụng");
            }
            return res.data;
          }),
      "Không thể lưu giảm giá",
    );

  const cancelRequest = async (requestId: number) => {
    try {
      await api.post(`/discount-requests/${requestId}/cancel`);
      const res = await api.get<Order>(`/orders/${orderRef.current!.id}`);
      applyOrder(res.data);
      return true;
    } catch (error) {
      notify.error(error, "Không thể hủy yêu cầu");
      return false;
    }
  };

  // Tells the cashier what became of their request when it leaves the order.
  useEffect(() => {
    const current = order?.discountRequests?.[0]?.id ?? null;
    const previous = pendingIdRef.current;
    pendingIdRef.current = current;
    if (previous === null || current !== null) return;
    api
      .get<DiscountRequestRow>(`/discount-requests/${previous}`)
      .then(({ data }) => {
        if (data.status === "APPROVED") notify.success(`Quản lý ${data.decidedBy?.fullName ?? ""} đã duyệt giảm giá`);
        else if (data.status === "REJECTED")
          notify.warning(`Giảm giá bị từ chối: ${data.decisionNote ?? ""}`);
      })
      .catch(() => {});
  }, [order?.discountRequests, notify]);
```

Nếu `useNotify` không có `warning`, dùng `toast.warning` của `sonner` trực tiếp (kiểm tra `hooks/use-notify.ts`) hoặc thêm hàm `warning` vào hook theo cách `success` được viết.

- Thay khối giảm giá bằng:

```tsx
            {canOperate && (
              <BillAdjustments
                key={`${JSON.stringify(adjustmentsOf(order))}:${order.discountRequests?.[0]?.id ?? ""}`}
                order={order}
                billFor={(adjustments) =>
                  computeBill({
                    startTime: new Date(order.startTime),
                    endTime: order.timeLockedAt ? new Date(order.timeLockedAt) : now,
                    pricePerHour: Number(order.pricePerHour),
                    items: shownItems.map(({ price, quantity }) => ({ price, quantity })),
                    ...adjustments,
                  })
                }
                canApply={can(user, "discounts.approve")}
                onSubmit={submitAdjustments}
                onCancelRequest={cancelRequest}
              />
            )}
```

- Nút Thanh toán: `disabled={!!order.discountRequests?.length}` và khi đang chờ đổi chữ thành `Chờ duyệt giảm giá…`.

- [ ] **Step 3: Kiểm tra trong trình duyệt** (390 px và desktop): `tn1_cs1` nhập giảm 10% → nút "Gửi duyệt" → nhập lý do → băng "Đang chờ quản lý duyệt", ô khóa, Thanh toán khóa; "Hủy yêu cầu" bỏ được. Bỏ giảm giá hoặc tăng VAT → "Áp dụng" áp ngay. `ql1_cs1` → luôn "Áp dụng". Console không lỗi.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(web): khung giảm giá gửi quản lý duyệt"
```

---

### Task 12: Frontend — trang Duyệt giảm giá và badge

**Files:**
- Create: `502-frontend/src/app/[branch]/sales/discounts/layout.tsx`, `page.tsx`
- Create: `502-frontend/src/components/discounts/adjustment-diff.tsx`, `pending-requests.tsx`, `discount-log.tsx`
- Create: `502-frontend/src/hooks/use-pending-discounts.ts`
- Modify: `502-frontend/src/components/layout/app-sidebar.tsx`

**Interfaces:**
- Consumes: `DiscountRequestRow`, `ADJUSTMENT_LABELS`, `changedKeys` (Task 9); endpoints Task 7.
- Produces: `usePendingDiscounts(): number | null`; `DISCOUNTS_CHANGED` (tên sự kiện `window`) để trang báo sidebar tải lại ngay.

- [ ] **Step 1: `adjustment-diff.tsx`**

```tsx
import { ADJUSTMENT_LABELS, changedKeys } from "@/lib/discount-rules";
import { formatMoney, formatNumber } from "@/lib/format";
import type { DiscountRequestRow } from "@/lib/types";

// "Giảm giá món (%): 0 → 10" per changed field, and the totals.
export function AdjustmentDiff({ request }: { request: DiscountRequestRow }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {changedKeys(request.before, request.after).map((k) => (
        <span key={k} className="tabular-nums">
          {ADJUSTMENT_LABELS[k]}: {formatNumber(request.before[k])} → <b>{formatNumber(request.after[k])}</b>
        </span>
      ))}
      <span className="text-muted-foreground tabular-nums">
        Tổng {formatMoney(request.amountBefore)} → {formatMoney(request.amountAfter)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: `use-pending-discounts.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { usePolling } from "@/hooks/use-polling";
import api from "@/lib/api";
import { can } from "@/lib/permissions";

// Fired by the Duyệt giảm giá page after a decision, so the badge updates at once.
export const DISCOUNTS_CHANGED = "discounts-changed";

// Requests waiting for this manager (own branch; the chain manager: every
// branch). Polled every 15 s on managers' screens only; null for others.
export function usePendingDiscounts(): number | null {
  const { user } = useAuth();
  const enabled = can(user, "discounts.approve");
  const [count, setCount] = useState<number | null>(null);
  const last = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ count: number }>("/discount-requests/pending-count");
      if (last.current !== null && data.count > last.current) {
        toast.info("Có yêu cầu giảm giá mới chờ duyệt");
      }
      last.current = data.count;
      setCount(data.count);
    } catch {
      // The next tick retries.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    window.addEventListener(DISCOUNTS_CHANGED, load);
    return () => window.removeEventListener(DISCOUNTS_CHANGED, load);
  }, [enabled, load]);
  usePolling(load, 15_000, enabled);

  return enabled ? count : null;
}
```

- [ ] **Step 3: Badge sidebar** — `app-sidebar.tsx`: `const pendingDiscounts = usePendingDiscounts();`, import `SidebarMenuBadge`; trong `SidebarMenuItem` sau `SidebarMenuButton`:

```tsx
                  {item.path === "/sales/discounts" && !!pendingDiscounts && (
                    <SidebarMenuBadge>{pendingDiscounts}</SidebarMenuBadge>
                  )}
```

- [ ] **Step 4: `pending-requests.tsx`** — danh sách thẻ, một cột trên điện thoại, hai cột từ `@3xl/main`:

```tsx
"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { ReasonDialog } from "@/components/reason-dialog";
import { AdjustmentDiff } from "@/components/discounts/adjustment-diff";
import { DISCOUNTS_CHANGED } from "@/hooks/use-pending-discounts";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import { usePolling } from "@/hooks/use-polling";
import api from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { DiscountRequestRow } from "@/lib/types";

// The requests waiting for this manager; whoever acts first wins.
export function PendingRequests() {
  const notify = useNotify();
  const { data, total, loading, reload } = useApiData<DiscountRequestRow[]>(
    "/discount-requests/pending",
    {},
    [],
    "Không thể tải yêu cầu chờ duyệt",
  );
  const [rejecting, setRejecting] = useState<DiscountRequestRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  usePolling(reload, 15_000);

  const done = () => {
    reload();
    window.dispatchEvent(new Event(DISCOUNTS_CHANGED));
  };
  const approve = async (r: DiscountRequestRow) => {
    setBusyId(r.id);
    try {
      await api.post(`/discount-requests/${r.id}/approve`);
      notify.success(`Đã duyệt giảm giá phòng ${r.order.room?.name ?? ""}`);
    } catch (error) {
      notify.error(error, "Không thể duyệt");
    } finally {
      setBusyId(null);
      done();
    }
  };
  const reject = async (note: string) => {
    if (!rejecting) return;
    try {
      await api.post(`/discount-requests/${rejecting.id}/reject`, { note });
      notify.success("Đã từ chối");
    } catch (error) {
      notify.error(error, "Không thể từ chối");
      return false;
    } finally {
      done();
    }
  };

  if (!loading && data.length === 0) {
    return <EmptyState icon={CheckIcon} title="Không có yêu cầu chờ duyệt" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <ListLimitNotice shown={data.length} total={total} />
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        {data.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                Phòng {r.order.room?.name ?? "—"} · {r.branch.name}
              </CardTitle>
              <CardDescription>
                {r.requestedBy?.fullName ?? "—"} gửi lúc {formatTime(r.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <AdjustmentDiff request={r} />
              <p className="text-sm">Lý do: {r.note}</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button disabled={busyId === r.id} onClick={() => approve(r)}>
                <CheckIcon data-icon="inline-start" />
                Duyệt
              </Button>
              <Button variant="outline" disabled={busyId === r.id} onClick={() => setRejecting(r)}>
                <XIcon data-icon="inline-start" />
                Từ chối
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <ReasonDialog
        open={!!rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={`Từ chối giảm giá phòng ${rejecting?.order.room?.name ?? ""}?`}
        confirmLabel="Từ chối"
        onConfirm={reject}
      />
    </div>
  );
}
```

Kiểm tra chữ ký thật của `ListLimitNotice` và `EmptyState` trong `components/data-states.tsx` và sửa props cho khớp.

- [ ] **Step 5: `discount-log.tsx`** — bảng nhật ký:

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker } from "@/components/date-range-picker";
import { AdjustmentDiff } from "@/components/discounts/adjustment-diff";
import { useApiData } from "@/hooks/use-api-data";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatDateTime } from "@/lib/format";
import { SHOW_FROM } from "@/lib/responsive";
import type { DiscountRequestRow, DiscountRequestStatus, DiscountSource } from "@/lib/types";

const STATUS: Record<DiscountRequestStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  PENDING: { label: "Chờ duyệt", variant: "warning" },
  APPROVED: { label: "Đã áp", variant: "success" },
  REJECTED: { label: "Từ chối", variant: "destructive" },
  CANCELLED: { label: "Đã hủy", variant: "secondary" },
  EXPIRED: { label: "Hết hạn", variant: "secondary" },
};
const SOURCE: Record<DiscountSource, string> = {
  REQUEST: "Thu ngân xin",
  DIRECT: "Áp trực tiếp",
  PAID_EDIT: "Sửa hóa đơn đã thu",
};

// Every discount / VAT change of the chosen business days, newest first.
export function DiscountLog() {
  const branch = useBranchCode();
  const [range, setRange] = useState({ from: businessDate(), to: businessDate() });
  const { data, total, loading } = useApiData<DiscountRequestRow[]>(
    "/discount-requests",
    { branch, ...range },
    [],
    "Không thể tải nhật ký giảm giá",
  );
  return (
    <div className="flex flex-col gap-4">
      <DateRangePicker value={range} onChange={setRange} />
      <ListLimitNotice shown={data.length} total={total} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lúc</TableHead>
            <TableHead>Hóa đơn</TableHead>
            <TableHead>Thay đổi</TableHead>
            <TableHead className={SHOW_FROM.md}>Người gửi / duyệt</TableHead>
            <TableHead className={SHOW_FROM.sm}>Ghi chú</TableHead>
            <TableHead>Trạng thái</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableSkeleton columns={["", "", "", SHOW_FROM.md, SHOW_FROM.sm, ""]} />
          ) : data.length === 0 ? (
            <TableEmpty colSpan={6} title="Không có thay đổi giảm giá trong khoảng này" />
          ) : (
            data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>
                  {billLabel(r.order)} · {r.order.room?.name ?? "—"}
                  <div className="text-xs text-muted-foreground">{SOURCE[r.source]}</div>
                </TableCell>
                <TableCell>
                  <AdjustmentDiff request={r} />
                </TableCell>
                <TableCell className={SHOW_FROM.md}>
                  {r.requestedBy?.fullName ?? "—"}
                  {r.decidedBy && r.source === "REQUEST" && (
                    <div className="text-xs text-muted-foreground">→ {r.decidedBy.fullName}</div>
                  )}
                </TableCell>
                <TableCell className={SHOW_FROM.sm}>
                  {r.note}
                  {r.decisionNote && <div className="text-xs text-muted-foreground">{r.decisionNote}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

Trước khi viết: đọc `components/date-range-picker.tsx`, `components/data-states.tsx`, `lib/format.ts` (`billLabel`, `formatDateTime` — nếu không có `formatDateTime`, dùng hàm định dạng ngày giờ có sẵn), rồi sửa props/tên hàm cho khớp. Quản lý hệ thống ở `branch` hiện tại; nhật ký cả chuỗi không cần ở giai đoạn này.

- [ ] **Step 6: Trang**

```tsx
// app/[branch]/sales/discounts/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Duyệt giảm giá" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

```tsx
// app/[branch]/sales/discounts/page.tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/layout/page-header";
import { DiscountLog } from "@/components/discounts/discount-log";
import { PendingRequests } from "@/components/discounts/pending-requests";
import { can } from "@/lib/permissions";

export default function DiscountsPage() {
  const { user } = useAuth();
  const approver = can(user, "discounts.approve");
  return (
    <>
      <PageHeader
        title="Duyệt giảm giá"
        description="Yêu cầu giảm giá, hạ VAT của thu ngân và nhật ký mọi thay đổi giảm giá."
      />
      <Tabs defaultValue={approver ? "pending" : "log"} className="gap-4">
        <TabsList>
          {approver && <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>}
          <TabsTrigger value="log">Nhật ký</TabsTrigger>
        </TabsList>
        {approver && (
          <TabsContent value="pending">
            <PendingRequests />
          </TabsContent>
        )}
        <TabsContent value="log">
          <DiscountLog />
        </TabsContent>
      </Tabs>
    </>
  );
}
```

(Kiểm tra cách các trang khác dùng `PageHeader` và bọc `RouteGuard` — nếu `[branch]/layout.tsx` đã guard theo `canVisit`, không cần thêm.)

- [ ] **Step 7: Kiểm tra trong trình duyệt** — hai tab/cửa sổ: `tn1_cs1` gửi yêu cầu; `ql1_cs1` thấy badge trong ≤ 15 s và toast, duyệt được; màn hình thu ngân nhận "đã duyệt" trong ≤ 15 s. Mở thêm `admin`: thấy cùng yêu cầu; bấm duyệt sau `ql1_cs1` → toast 409 có tên người duyệt. `ql1_cs2` không thấy. 390 px: thẻ một cột, bảng không cuộn ngang. Console không lỗi.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(web): trang Duyệt giảm giá, badge chờ duyệt"
```

---

### Task 13: Cảnh báo phục vụ chưa có mật khẩu

**Files:**
- Modify: `502-frontend/src/app/[branch]/admin/users/page.tsx`

- [ ] **Step 1:** Trong `Field` "Vị trí" (sau `</Select>`), import `FieldDescription`:

```tsx
                    {form.position === "SERVER" &&
                      (isNew ? form.password === "" : editing !== "new" && !editing?.hasPassword) && (
                        <FieldDescription className="text-warning">
                          Phục vụ cần mật khẩu để đăng nhập và gọi món cho phòng mình.
                        </FieldDescription>
                      )}
```

- [ ] **Step 2:** Kiểm tra trong trình duyệt: tạo tài khoản Phục vụ không mật khẩu → thấy cảnh báo; nhập mật khẩu → mất.

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "feat(web): nhắc đặt mật khẩu cho phục vụ"
```

---

### Task 14: Rà soát tài nguyên và đo tải

**Files:**
- Modify: `502-backend/test/load/bench.mjs`
- Modify: `docs/resource-rules.md` (bảng §6 nếu số liệu đổi)

- [ ] **Step 1: Bench** — trong vòng lặp thu ngân của `bench.mjs` (đọc file để tìm hàm thao tác một phiên), sau khi thêm món: 1 lần trong 5 phiên gọi `POST /orders/:id/adjustments {discountPercent: 5, note: "bench"}` bằng tài khoản thu ngân, rồi `POST /discount-requests/:id/approve` bằng một tài khoản quản lý của cơ sở đó; mọi phiên gọi `POST /orders/:id/lock-time` trước checkout. Thêm 5 "máy quản lý" gọi `GET /discount-requests/pending-count` mỗi 15 s suốt bài đo.

- [ ] **Step 2: Chạy** theo `docs/resource-rules.md` §6: `node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2`. So thanh toán p95, sơ đồ phòng p95, lỗi 500/503, RAM (`docker stats --no-stream`) với bảng §6. Expected: thanh toán p95 không tăng quá ~20% so với 0,18–0,25 s; không lỗi 5xx.

- [ ] **Step 3: Checklist §5 của `resource-rules.md`** — đi từng mục, ghi kết quả vào mô tả commit:
  - `take`/`select`/`X-Total-Count`/`ListLimitNotice`: hàng chờ 200, nhật ký 500 ✔
  - không cộng tổng từ danh sách có trần ✔ (badge dùng `pending-count`)
  - EXPLAIN luồng bán hàng (Task 8) ✔
  - không `Map`/cache mới ✔; không nâng body ✔; không thư viện mới ✔
  - polling qua `usePolling` 15 s, listener `DISCOUNTS_CHANGED` được dọn ✔
  - đã chạy `test/load` ✔

- [ ] **Step 4: Commit**

```bash
git add test/load docs
git commit -m "test(load): thêm giảm giá, duyệt và chốt giờ vào bench"
```
