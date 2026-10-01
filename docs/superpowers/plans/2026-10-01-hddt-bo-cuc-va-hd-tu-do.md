# Hóa đơn điện tử: bố cục hai cột, HĐ tự do, ngày theo nháp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang Hóa đơn điện tử có hai cột:
- cột trái là danh sách bill, nơi thêm/xóa nháp tức thì và nhập số tiền;
- cột phải là panel xuất: ngày hóa đơn, người mua, dòng hàng VAT 10%, Lưu nháp, Xuất.

Thêm hóa đơn không theo bill. Ngày hóa đơn được lưu cùng nháp.

**Architecture:**
- **Backend:**
  - `Einvoice.orderId` được để trống, để có hóa đơn tự do.
  - Nháp được có `amount` 0; xuất thì cần ≥ 1.
  - Ngày dự kiến của nháp nằm trong cột `invoiceDate` có sẵn. Mặc định là ngày lịch lúc thanh toán bill; lần gửi thất bại không xóa ngày.
  - `GET /einvoices/bills` lọc theo khoảng ngày và theo trạng thái hóa đơn.
  - `GET /einvoices` thêm `free=1`.
- **Frontend:**
  - Trang giữ việc chọn (bill đang mở, hóa đơn đang chọn) và tải một lần chi tiết bill, dùng chung cho hai cột.
  - Cột trái: `einvoice-bill-list` → `bill-split` → `einvoice-row`.
  - Cột phải: `einvoice-issue-panel` → `einvoice-editor` → `issue-controls`.

**Tech Stack:** NestJS 11, Prisma 5.22 (PostgreSQL 17), Jest (unit; e2e với supertest và `test/fake-minvoice.ts`), Next.js 16 App Router, React 19, shadcn/ui (radix-ui), Tailwind 4. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`. Đọc hết spec trước Task 1. Spec gốc `docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md` vẫn đúng cho mọi thứ spec mới không nhắc tới.

## Global Constraints

- **Chữ và commit:**
  - Chuỗi hiển thị và thông báo lỗi bằng **tiếng Việt**; comment trong code bằng tiếng Anh, như code hiện có.
  - Commit tiếng Việt theo dạng `feat(einvoice): …` (backend) hoặc `feat(web): …` (frontend), kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Làm trên nhánh `feat/einvoice-layout` (Task 0 tạo nhánh).
- **Quyền:**
  - Tạo, sửa, xóa nháp (kể cả hóa đơn tự do) thuộc `EINVOICE_WRITERS` (`SALES`). Xuất, đối chiếu, sửa số thuộc `CHAIN_ONLY`. HĐQT chỉ xem.
  - Phạm vi cơ sở luôn qua `BranchScopeService` (`resolveBranchId`, `assertBranchAccess`).
- **Ngày hóa đơn** là ngày lịch theo giờ server/trình duyệt (`Asia/Ho_Chi_Minh`): backend dùng `toDateString`, frontend dùng `toDateInput()`. **Không bao giờ** dùng ngày kinh doanh (`businessDateOf`/`businessDate()`) cho ngày hóa đơn.
- **Thuế suất:** mọi dòng mới trên giao diện mang VAT 10% (`EINVOICE_VAT_RATE`). Backend vẫn nhận 0/5/8/10.
- **Đồng bộ:** `502-frontend/src/lib/einvoice.ts` là bản sao của `502-backend/src/einvoice/einvoice-math.ts`. Sửa luật tiền ở cả hai trong cùng một task.
- **Tài nguyên** (`docs/resource-rules.md` §5):
  - Danh sách có `take` 500, `X-Total-Count`, và màn hình có `ListLimitNotice`.
  - Không tổng nào cộng từ danh sách đã cắt.
  - Không polling, không sự kiện WebSocket, không thư viện mới.
- **Lệnh:**
  - Backend: `cd 502-backend`. Sửa `prisma/schema.prisma` xong thì chạy `npx prisma generate`.
  - E2E: chạy `docker start kara502-pg` trước, chạy từng file một: `npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand`. Lỗi `Cannot convert undefined or null to object` ở `@IsEnum` nghĩa là client Prisma cũ, chạy lại `npx prisma generate`.
  - Frontend: `cd 502-frontend`. Không có test tự động: kiểm tra bằng `npx tsc --noEmit`, `npm run lint`, `npm run build` và trình duyệt.

---

### Task 0: Nhánh, spec và kế hoạch

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md:3`
- Commit: `docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`, `docs/superpowers/plans/2026-10-01-hddt-bo-cuc-va-hd-tu-do.md`

- [ ] **Step 1: Tạo nhánh từ `main`**

```bash
git switch main && git switch -c feat/einvoice-layout
```

- [ ] **Step 2: Trỏ spec gốc sang spec mới**

Trong `docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md`, ngay dưới dòng `Ngày: 01/10/2026. Trạng thái: …` (dòng 3), thêm một dòng trống rồi dòng:

```markdown
> Bố cục trang (§10.1–10.3), hóa đơn không theo bill, số tiền 0 của nháp và ngày hóa đơn lưu cùng nháp đã được sửa bởi `2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`; đọc spec đó cho các mục này.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md docs/superpowers/plans/2026-10-01-hddt-bo-cuc-va-hd-tu-do.md
git commit -m "docs(einvoice): spec và kế hoạch bố cục hai cột, hóa đơn không theo bill, ngày theo nháp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Nháp có số tiền 0, xuất cần số tiền ≥ 1

Spec §2 (Thêm nhanh), §4 (`POST`/`PATCH` `amount` từ 0, `issue` cần ≥ 1).

**Files:**
- Modify: `502-backend/src/einvoice/einvoice-math.ts` (`issueProblem`)
- Modify: `502-backend/src/einvoice/einvoice-math.spec.ts`
- Modify: `502-backend/src/einvoice/dto/einvoice.dto.ts` (`EinvoiceDraftDto.amount`)
- Modify: `502-frontend/src/lib/einvoice.ts` (`issueProblem`, bản sao)
- Test: `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Produces: `issueProblem(amount, lines)` trả `'Nhập số tiền của hóa đơn'` khi `amount < 1`, ở cả backend và frontend. `POST`/`PATCH /einvoices` nhận `amount: 0`.

- [ ] **Step 1: Viết test hỏng (unit)**

Trong `502-backend/src/einvoice/einvoice-math.spec.ts`, thêm vào cuối `describe('einvoice-math', …)` (trước dấu `});` cuối):

```ts
  it('needs an amount before anything else', () => {
    expect(issueProblem(0, [])).toBe('Nhập số tiền của hóa đơn');
    // A line priced 0 adds up to an amount of 0: still nothing to issue.
    expect(issueProblem(0, [line()])).toBe('Nhập số tiền của hóa đơn');
  });
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `cd 502-backend && npx jest src/einvoice/einvoice-math.spec.ts`
Expected: FAIL ở `needs an amount before anything else` (nhận `'Hóa đơn chưa có dòng hàng'` và `null`).

- [ ] **Step 3: Sửa `issueProblem` ở backend**

Trong `502-backend/src/einvoice/einvoice-math.ts`, sửa comment và dòng đầu của `issueProblem`:

```ts
// Why a draft cannot be issued yet, or null when it can: it needs an amount
// (a draft may keep 0 while it is being split), and its lines must add up to
// that amount, to the đồng.
export function issueProblem(
  amount: number,
  lines: EinvoiceLine[],
): string | null {
  if (!(amount >= 1)) return 'Nhập số tiền của hóa đơn';
  if (lines.length === 0) return 'Hóa đơn chưa có dòng hàng';
```

(Phần còn lại của hàm giữ nguyên.)

- [ ] **Step 4: Sửa bản sao ở frontend**

Trong `502-frontend/src/lib/einvoice.ts`, sửa tương tự:

```ts
// Why a draft cannot be issued yet, or null when it can: it needs an amount
// (a draft may keep 0 while it is being split), and its lines must add up to
// that amount, to the đồng.
export function issueProblem(amount: number, lines: EinvoiceLine[]): string | null {
  if (!(amount >= 1)) return "Nhập số tiền của hóa đơn";
  if (lines.length === 0) return "Hóa đơn chưa có dòng hàng";
```

- [ ] **Step 5: Cho nháp nhận số tiền 0**

Trong `502-backend/src/einvoice/dto/einvoice.dto.ts`, trường `amount` của `EinvoiceDraftDto`:

```ts
  @ApiProperty({
    description: 'Số tiền đã gồm VAT, đồng; nháp được để 0, xuất thì cần ≥ 1',
  })
  @IsInt()
  @Min(0)
  @Max(100_000_000_000)
  amount: number;
```

- [ ] **Step 6: Chạy unit test**

Run: `cd 502-backend && npx jest src/einvoice`
Expected: PASS.

- [ ] **Step 7: Viết test e2e**

Trong `502-backend/test/einvoice.e2e-spec.ts`, `describe('drafts')`: thêm `it` này ngay sau `it('deletes a draft', …)`, trước `it('tells the bill sheet how many e-invoices a bill has', …)`:

```ts
    it('takes empty drafts, one per click', async () => {
      const ids: number[] = [];
      for (let i = 0; i < 2; i++) {
        const draft = (
          await as('tn1_cs1')
            .post('/einvoices', { orderId, amount: 0, lines: [] })
            .expect(201)
        ).body as Json;
        expect(draft).toMatchObject({ status: 'DRAFT', amount: '0' });
        ids.push(draft.id as number);
      }
      expect(ids[0]).not.toBe(ids[1]);
      await as('tn1_cs1')
        .post('/einvoices', { orderId, amount: -1, lines: [] })
        .expect(400);
      for (const id of ids)
        await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });
```

`describe('issuing')`: thêm `it` này ngay sau `it('refuses a draft whose lines do not add up', …)`:

```ts
    it('refuses a draft without an amount', async () => {
      const id = (
        (
          await as('tn1_cs1')
            .post('/einvoices', { orderId, amount: 0, lines: [filler(0)] })
            .expect(201)
        ).body as Json
      ).id as number;
      expect(((await issue(id).expect(400)).body as Json).message).toBe(
        'Nhập số tiền của hóa đơn',
      );
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });
```

- [ ] **Step 8: Chạy e2e**

Run: `docker start kara502-pg && cd 502-backend && npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 9: Kiểm tra frontend vẫn biên dịch**

Run: `cd 502-frontend && npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 10: Commit**

```bash
git add 502-backend/src/einvoice/einvoice-math.ts 502-backend/src/einvoice/einvoice-math.spec.ts 502-backend/src/einvoice/dto/einvoice.dto.ts 502-backend/test/einvoice.e2e-spec.ts 502-frontend/src/lib/einvoice.ts
git commit -m "feat(einvoice): nháp được để số tiền 0, xuất thì cần số tiền

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hóa đơn không theo bill (schema, tạo, xuất, danh sách)

Spec §2 (Hóa đơn tự do), §3 (Dữ liệu), §4 (`POST` không `orderId`, `issue`, `GET /einvoices?free=1`).

**Files:**
- Modify: `502-backend/prisma/schema.prisma` (model `Einvoice`)
- Create: `502-backend/prisma/migrations/20261004000000_free_einvoices/migration.sql`
- Modify: `502-backend/src/einvoice/dto/einvoice.dto.ts` (`CreateEinvoiceDto`, `EinvoiceListQuery`)
- Modify: `502-backend/src/einvoice/einvoices.controller.ts` (`create`)
- Modify: `502-backend/src/einvoice/einvoices.service.ts` (`create`, `issue`, `listWhere`)
- Test: `502-backend/src/einvoice/einvoices.service.spec.ts`, `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `EinvoicesService.create(user: AuthUser, dto: CreateEinvoiceDto, branch?: string)`.
  - `POST /einvoices?branch=<code>` không có `orderId` thì tạo hóa đơn có `orderId: null`, `order: null`.
  - `GET /einvoices?free=1`.
  - Trong `einvoices.service.spec.ts`: helper `creating()` và `dataOf(mock, call?)`; Task 3 dùng lại hai helper này.

- [ ] **Step 1: Viết test hỏng (unit)**

Trong `502-backend/src/einvoice/einvoices.service.spec.ts`:
- Sửa dòng import ngày thành:

```ts
import { businessDateOf, toDateString, toDbDate } from '../common/dates';
```

- Thêm vào cuối file:

```ts
// A service whose prisma creates and updates drafts (create, update).
const creating = () => {
  const einvoice = {
    create: jest.fn().mockResolvedValue({ id: 40 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn().mockResolvedValue({
      id: 40,
      branchId: 1,
      status: 'DRAFT',
      invoiceDate: null,
    }),
  };
  const order = { findUnique: jest.fn() };
  const scope = {
    resolveBranchId: jest.fn().mockResolvedValue(3),
    assertBranchAccess: jest.fn(),
  };
  const service = new EinvoicesService(
    { einvoice, order } as never,
    {} as never,
    scope as never,
    {} as never,
    {} as never,
  );
  return { service, einvoice, order, scope };
};
// The `data` of the n-th call of a prisma create/update mock.
const dataOf = (mock: jest.Mock, call = 0) =>
  (mock.mock.calls[call] as [{ data: Record<string, unknown> }])[0].data;

describe('EinvoicesService free invoices', () => {
  afterEach(() => jest.restoreAllMocks());

  it("are created in the branch of the page, on today's business day", async () => {
    const { service, einvoice, order, scope } = creating();
    await service.create(user, { amount: 0, lines: [] }, 'cs3');
    expect(scope.resolveBranchId).toHaveBeenCalledWith(user, 'cs3');
    expect(order.findUnique).not.toHaveBeenCalled();
    expect(dataOf(einvoice.create)).toMatchObject({
      branchId: 3,
      orderId: null,
      businessDate: toDbDate(businessDateOf(new Date())),
      amount: 0,
    });
  });

  it('are issued without a bill to check', async () => {
    const { service, einvoice, sender } = setup(issued);
    einvoice.findUnique.mockResolvedValueOnce({ ...draftRow(), order: null });
    await service.issue(user, 12, dto);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('are listed apart', async () => {
    const einvoice = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const service = new EinvoicesService(
      { einvoice } as never,
      {} as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      {} as never,
      {} as never,
    );
    await service.list(user, { free: true, status: 'DRAFT' });
    expect(einvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: 1, status: 'DRAFT', lastError: null, orderId: null },
      }),
    );
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `cd 502-backend && npx jest src/einvoice/einvoices.service.spec.ts -t "free invoices"`
Expected: FAIL. TypeScript báo `free` không có trong `EinvoiceListQuery`, `orderId` bắt buộc trong `CreateEinvoiceDto`, `create` chỉ nhận 2 tham số.

- [ ] **Step 3: Schema và migration**

Trong `502-backend/prisma/schema.prisma`, model `Einvoice`, thay hai dòng `orderId`/`order` bằng:

```prisma
  // Null for a free invoice, made without a bill
  // (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do).
  orderId      Int?
  order        Order?         @relation(fields: [orderId], references: [id])
```

Tạo `502-backend/prisma/migrations/20261004000000_free_einvoices/migration.sql`:

```sql
-- Hóa đơn điện tử không theo bill (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §3).
ALTER TABLE "Einvoice" ALTER COLUMN "orderId" DROP NOT NULL;
```

Run:

```bash
cd 502-backend && npx prisma generate
docker exec kara502-pg psql -U postgres -c "create database karaoke_shadow" || true
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:postgres@localhost:5433/karaoke_shadow" --script
```

Expected: lệnh `migrate diff` in ra `-- This is an empty migration.` (migration khớp schema).

- [ ] **Step 4: DTO**

Trong `502-backend/src/einvoice/dto/einvoice.dto.ts`:
- Dòng import `class-transformer` đổi thành `import { Transform, Type } from 'class-transformer';`.
- `CreateEinvoiceDto` đổi thành:

```ts
export class CreateEinvoiceDto extends EinvoiceDraftDto {
  @ApiProperty({
    required: false,
    description: 'Bill đã thanh toán; bỏ trống là hóa đơn không theo bill',
  })
  @IsOptional()
  @IsInt()
  orderId?: number;
}
```

- Trong `EinvoiceListQuery`, thêm sau `billNumber`:

```ts
  @ApiProperty({
    required: false,
    description: 'Chỉ hóa đơn không theo bill (1 / true)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  free?: boolean;
```

- [ ] **Step 5: Controller nhận `?branch=` khi tạo**

Trong `502-backend/src/einvoice/einvoices.controller.ts`:
- Thêm `import { EinvoiceBranchQuery } from './dto/config.dto';`.
- Thay hàm `create` bằng:

```ts
  @Post()
  @Roles(...EINVOICE_WRITERS)
  create(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBranchQuery,
    @Body() dto: CreateEinvoiceDto,
  ) {
    return this.einvoices.create(user, dto, query.branch);
  }
```

- [ ] **Step 6: Service — tạo, xuất, lọc**

Trong `502-backend/src/einvoice/einvoices.service.ts`, thay toàn bộ hàm `create` bằng:

```ts
  async create(user: AuthUser, dto: CreateEinvoiceDto, branch?: string) {
    const written = {
      createdById: user.id,
      updatedById: user.id,
      ...draftData(dto),
    };
    if (dto.orderId === undefined) {
      // A free invoice: no bill, the branch of the page, and the business day
      // it is made on for the list filters (spec
      // 2026-10-01-hddt-bo-cuc-va-hd-tu-do §4).
      const branchId = await this.scope.resolveBranchId(user, branch);
      const created = await this.prisma.einvoice.create({
        data: {
          branchId,
          orderId: null,
          businessDate: toDbDate(businessDateOf(new Date())),
          ...written,
        },
        select: { id: true },
      });
      return this.findOne(user, created.id);
    }
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, branchId: true, status: true, businessDate: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.scope.assertBranchAccess(user, order.branchId);
    if (order.status !== OrderStatus.COMPLETED || !order.businessDate) {
      throw new BadRequestException(
        'Chỉ tạo hóa đơn điện tử cho bill đã thanh toán và chưa hủy',
      );
    }
    const created = await this.prisma.einvoice.create({
      data: {
        branchId: order.branchId,
        orderId: order.id,
        businessDate: order.businessDate,
        ...written,
      },
      select: { id: true },
    });
    return this.findOne(user, created.id);
  }
```

Trong `issue`, thay khối:

```ts
    if (row.order.status !== OrderStatus.COMPLETED) {
```

bằng:

```ts
    // A free invoice has no bill that could have been voided.
    if (row.order && row.order.status !== OrderStatus.COMPLETED) {
```

Trong `listWhere`, ngay trước dòng `// Pending work (drafts, errors, uncertain) is listed whatever its day.`, thêm:

```ts
    if (query.free) where.orderId = null;
```

- [ ] **Step 7: Chạy unit test và build**

Run: `cd 502-backend && npx jest src/einvoice && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, không lỗi kiểu. Nếu TypeScript báo chỗ khác giả định `order`/`orderId` luôn có (`groupBy` của `bills`, …), sửa cho chấp nhận `null`, không đổi hành vi.

- [ ] **Step 8: Viết test e2e**

Trong `502-backend/test/einvoice.e2e-spec.ts`, `describe('issuing')`: thêm `it` này ngay trước `it('is wiped with the data of its branch', …)`:

```ts
    it('creates, lists and issues an invoice without a bill', async () => {
      const free = { amount: 0, lines: [] };
      await as('tn1_cs1').post('/einvoices?branch=cs2', free).expect(403);
      await as('admin').post('/einvoices', free).expect(400);
      await as('hdqt_hddt').post('/einvoices?branch=cs1', free).expect(403);
      const drafts = async () =>
        (
          (await as('tn1_cs1').get('/einvoices/summary').expect(200))
            .body as Json
        ).draftCount as number;
      const before = await drafts();
      const created = (
        await as('tn1_cs1').post('/einvoices?branch=cs1', free).expect(201)
      ).body as Json;
      expect(created).toMatchObject({
        status: 'DRAFT',
        orderId: null,
        order: null,
      });
      expect(await drafts()).toBe(before + 1);
      const id = created.id as number;
      await as('tn1_cs1')
        .patch(`/einvoices/${id}`, {
          amount: 1000000,
          ...buyer,
          lines: [filler(909091)],
        })
        .expect(200);
      const listed = (
        await as('tn1_cs1').get('/einvoices?free=1&status=DRAFT').expect(200)
      ).body as Json[];
      expect(listed.map((e) => e.id)).toEqual([id]);
      const body = (await issue(id).expect(200)).body as Json;
      expect(body).toMatchObject({
        status: 'ISSUED',
        orderId: null,
        draft: null,
      });
      expect(body.invoiceNumber).toEqual(expect.any(Number));
    });
```

- [ ] **Step 9: Chạy e2e**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add 502-backend/prisma/schema.prisma 502-backend/prisma/migrations/20261004000000_free_einvoices 502-backend/src/einvoice 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): hóa đơn điện tử không theo bill

Thêm cột orderId cho phép null, POST /einvoices?branch= không orderId, lọc free=1.
Không đụng luồng bán hàng, pool kết nối hay cấu hình database nên không chạy lại test/load (docs/resource-rules.md §6).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ngày hóa đơn lưu cùng nháp

Spec §2 (Ngày hóa đơn), §3 (Ý nghĩa mới của `invoiceDate`), §4 (`POST`/`PATCH` `invoiceDate`, kết thúc `DRAFT` và `resolve {found: false}` giữ ngày).

**Files:**
- Modify: `502-backend/src/einvoice/dto/einvoice.dto.ts` (`EinvoiceDraftDto.invoiceDate`)
- Modify: `502-backend/src/einvoice/einvoices.service.ts` (`create`, `update`, `writeOutcome`, `resolve`, `assertInvoiceDate`)
- Test: `502-backend/src/einvoice/einvoices.service.spec.ts`, `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Consumes: `creating()` và `dataOf()` từ Task 2 (`einvoices.service.spec.ts`).
- Produces:
  - `POST /einvoices` lưu `invoiceDate`: ngày gửi lên, nếu không thì `toDateString(order.endTime)` với hóa đơn của bill, hoặc hôm nay với hóa đơn tự do.
  - `PATCH /einvoices/:id` có `invoiceDate` thì đổi, không có thì giữ.
  - Một lần gửi kết thúc bằng `DRAFT`, và `resolve {found: false}`, giữ `invoiceDate`.

- [ ] **Step 1: Viết test hỏng (unit)**

Trong `502-backend/src/einvoice/einvoices.service.spec.ts`, thêm vào cuối file:

```ts
describe('EinvoicesService invoice dates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('dates a new draft by the calendar day its bill was paid, not its business day', async () => {
    const { service, einvoice, order } = creating();
    order.findUnique.mockResolvedValue({
      id: 5,
      branchId: 1,
      status: 'COMPLETED',
      businessDate: toDbDate('2026-09-29'),
      endTime: new Date(2026, 8, 30, 0, 24),
    });
    await service.create(user, { orderId: 5, amount: 0, lines: [] });
    expect(dataOf(einvoice.create)).toMatchObject({
      businessDate: toDbDate('2026-09-29'),
      invoiceDate: toDbDate('2026-09-30'),
    });
  });

  it('dates a free invoice today, or as asked', async () => {
    const { service, einvoice } = creating();
    await service.create(user, { amount: 0, lines: [] }, 'cs1');
    await service.create(
      user,
      { amount: 0, lines: [], invoiceDate: '2026-12-31' },
      'cs1',
    );
    expect(dataOf(einvoice.create, 0).invoiceDate).toEqual(
      toDbDate(toDateString(new Date())),
    );
    expect(dataOf(einvoice.create, 1).invoiceDate).toEqual(
      toDbDate('2026-12-31'),
    );
  });

  it('changes the date of a draft only when one is sent', async () => {
    const { service, einvoice } = creating();
    await service.update(user, 40, {
      amount: 0,
      lines: [],
      invoiceDate: '2026-10-02',
    });
    await service.update(user, 40, { amount: 0, lines: [] });
    expect(dataOf(einvoice.updateMany, 0).invoiceDate).toEqual(
      toDbDate('2026-10-02'),
    );
    expect(dataOf(einvoice.updateMany, 1)).not.toHaveProperty('invoiceDate');
    await expect(
      service.update(user, 40, {
        amount: 0,
        lines: [],
        invoiceDate: '2026-02-30',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the date of a send that ends as a draft', async () => {
    const { service, einvoice } = setup({
      kind: 'failed',
      message: 'Minvoice từ chối',
    });
    await service.issue(user, 12, dto);
    const data = dataOf(einvoice.update);
    expect(data).toMatchObject({ status: 'DRAFT', symbolCode: null });
    expect(data).not.toHaveProperty('invoiceDate');
  });
});
```

Trong `describe('EinvoicesService.resolve')`, `it('sends back to draft once the send is old enough, checked in the write', …)`, thêm sau dòng `expect(data).toMatchObject({ status: 'DRAFT', sendingAt: null });`:

```ts
    // The date stays: on a draft it is the date planned.
    expect(data).not.toHaveProperty('invoiceDate');
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `cd 502-backend && npx jest src/einvoice/einvoices.service.spec.ts`
Expected: FAIL. TypeScript báo `invoiceDate` không có trong DTO; sau đó các `it` về ngày hỏng.

- [ ] **Step 3: DTO**

Trong `502-backend/src/einvoice/dto/einvoice.dto.ts`, `EinvoiceDraftDto`: thêm sau trường `amount`:

```ts
  @ApiProperty({
    required: false,
    description:
      'Ngày hóa đơn dự kiến YYYY-MM-DD (ngày lịch, không phải ngày kinh doanh); bỏ trống khi sửa là giữ nguyên',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  invoiceDate?: string;
```

- [ ] **Step 4: Service**

Trong `502-backend/src/einvoice/einvoices.service.ts`:

(a) Ngay dưới hàm `dbDay`, thêm:

```ts
const INVALID_INVOICE_DATE = 'Ngày hóa đơn không hợp lệ';
```

Trong `assertInvoiceDate`, đổi `dbDay(dto.invoiceDate, 'Ngày hóa đơn không hợp lệ');` thành `dbDay(dto.invoiceDate, INVALID_INVOICE_DATE);`.

(b) Trong `create`:
- Nhánh hóa đơn tự do: thêm vào `data`, sau `businessDate`:

```ts
          // The calendar day, never the business day (spec §2).
          invoiceDate: dbDay(
            dto.invoiceDate ?? toDateString(new Date()),
            INVALID_INVOICE_DATE,
          ),
```

- Nhánh có bill: `select` của `order.findUnique` thêm `endTime: true`. Thêm vào `data`, sau `businessDate: order.businessDate,`:

```ts
        // The calendar day the bill was paid: a bill paid at 00:24 belongs
        // to the business day before but is invoiced on its own date (spec §2).
        invoiceDate: dbDay(
          dto.invoiceDate ?? toDateString(order.endTime ?? new Date()),
          INVALID_INVOICE_DATE,
        ),
```

(c) Thay hàm `update` bằng:

```ts
  async update(user: AuthUser, id: number, dto: EinvoiceDraftDto) {
    await this.assertAccess(user, id);
    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: EinvoiceStatus.DRAFT },
      data: {
        ...draftData(dto),
        // Left out: the date planned stays (spec §4).
        ...(dto.invoiceDate
          ? { invoiceDate: dbDay(dto.invoiceDate, INVALID_INVOICE_DATE) }
          : {}),
        lastError: null,
        updatedById: user.id,
      },
    });
    if (count === 0) throw new ConflictException('Chỉ sửa được hóa đơn nháp');
    return this.findOne(user, id);
  }
```

(d) Trong `writeOutcome`, nhánh `outcome.kind === 'failed'`: xóa dòng `invoiceDate: null,`, và thêm comment ngay trên dòng `sellerTaxCode: null,`:

```ts
          // The date stays: on a draft it is the date planned (spec §3).
```

(e) Trong `resolve`, nhánh `found: false` (khối có `status: EinvoiceStatus.DRAFT`): xóa dòng `invoiceDate: null,`, và thêm comment ngay trên dòng `sellerTaxCode: null,`:

```ts
          // The date stays: on a draft it is the date planned (spec §3).
```

- [ ] **Step 5: Chạy unit test**

Run: `cd 502-backend && npx jest src/einvoice`
Expected: PASS.

- [ ] **Step 6: Viết và sửa test e2e**

Trong `502-backend/test/einvoice.e2e-spec.ts`:
- Thêm `import { toDateString } from '../src/common/dates';` cạnh các import khác.
- `describe('drafts')`: thêm `it` này ngay sau `it('are created and edited by the sales roles of the branch', …)`:

```ts
    it('keeps an invoice date of its own, the calendar day the bill was paid', async () => {
      const today = toDateString(new Date());
      const draft = (
        await as('tn1_cs1').get(`/einvoices/${draftId}`).expect(200)
      ).body as Json;
      expect(draft.invoiceDate).toBe(today);
      const body = { amount: 1000000, ...buyer, lines: [beer, filler] };
      const moved = (
        await as('tn1_cs1')
          .patch(`/einvoices/${draftId}`, { ...body, invoiceDate: '2026-12-31' })
          .expect(200)
      ).body as Json;
      expect(moved.invoiceDate).toBe('2026-12-31');
      const kept = (
        await as('tn1_cs1').patch(`/einvoices/${draftId}`, body).expect(200)
      ).body as Json;
      expect(kept.invoiceDate).toBe('2026-12-31');
      await as('tn1_cs1')
        .patch(`/einvoices/${draftId}`, { ...body, invoiceDate: '2026-02-30' })
        .expect(400);
      await as('tn1_cs1')
        .patch(`/einvoices/${draftId}`, { ...body, invoiceDate: today })
        .expect(200);
    });
```

- `describe('issuing')`, `it('gives up after a second refusal and keeps the draft', …)`: đổi

```ts
      expect(body).toMatchObject({
        status: 'DRAFT',
        symbolCode: null,
        invoiceDate: null,
      });
```

  thành

```ts
      // The header goes, the date planned stays.
      expect(body).toMatchObject({
        status: 'DRAFT',
        symbolCode: null,
        invoiceDate: today(),
      });
```

- `it('does not resend a date Minvoice refuses', …)`: thêm sau `expect(body.status).toBe('DRAFT');`:

```ts
      expect(body.invoiceDate).toBe(today());
```

- [ ] **Step 7: Chạy e2e**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src/einvoice 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): ngày hóa đơn lưu cùng nháp, mặc định ngày thanh toán bill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /einvoices/bills` theo khoảng ngày và trạng thái hóa đơn

Spec §4 (`/bills`), §6 (Index).

**Files:**
- Modify: `502-backend/src/einvoice/dto/einvoice.dto.ts` (`EinvoiceBillsQuery`)
- Modify: `502-backend/src/einvoice/einvoices.service.ts` (hàm mới `statusWhere`, `listWhere`, `bills`)
- Test: `502-backend/src/einvoice/einvoices.service.spec.ts`, `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `GET /einvoices/bills?branch&from&to&billNumber&status`, mỗi dòng có thêm `cancelledAt: string | null`.
  - Bỏ tham số `businessDate`.

- [ ] **Step 1: Viết test hỏng (unit)**

Trong `502-backend/src/einvoice/einvoices.service.spec.ts`, thêm vào cuối file:

```ts
describe('EinvoicesService.bills', () => {
  const listing = () => {
    const order = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const service = new EinvoicesService(
      { order, einvoice: { groupBy: jest.fn() } } as never,
      {} as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      {} as never,
      {} as never,
    );
    const whereOf = () =>
      (order.findMany.mock.calls[0] as [{ where: unknown }])[0].where;
    return { service, whereOf };
  };
  const september = {
    gte: toDbDate('2026-09-01'),
    lte: toDbDate('2026-09-30'),
  };

  it('lists the paid bills of a range of days', async () => {
    const { service, whereOf } = listing();
    await service.bills(user, { from: '2026-09-01', to: '2026-09-30' });
    expect(whereOf()).toEqual({
      branchId: 1,
      status: 'COMPLETED',
      businessDate: september,
    });
  });

  it('lists the bills holding pending work whatever their day, voided ones too', async () => {
    const { service, whereOf } = listing();
    await service.bills(user, {
      status: 'UNCERTAIN',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(whereOf()).toEqual({
      branchId: 1,
      einvoices: {
        some: { branchId: 1, status: { in: ['SENDING', 'UNCERTAIN'] } },
      },
    });
  });

  it('dates issued invoices, not their bills', async () => {
    const { service, whereOf } = listing();
    await service.bills(user, {
      status: 'ISSUED',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(whereOf()).toEqual({
      branchId: 1,
      einvoices: {
        some: { branchId: 1, status: 'ISSUED', businessDate: september },
      },
    });
  });

  it('refuses a range that ends before it starts', async () => {
    const { service } = listing();
    await expect(
      service.bills(user, { from: '2026-09-30', to: '2026-09-01' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `cd 502-backend && npx jest src/einvoice/einvoices.service.spec.ts -t "bills"`
Expected: FAIL (`from`/`to`/`status` không có trong `EinvoiceBillsQuery`).

- [ ] **Step 3: DTO**

Trong `502-backend/src/einvoice/dto/einvoice.dto.ts`, thay toàn bộ `EinvoiceBillsQuery` bằng:

```ts
export class EinvoiceBillsQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    required: false,
    enum: ['DRAFT', 'ERROR', 'UNCERTAIN', 'ISSUED'],
    description: 'Chỉ bill có hóa đơn ở trạng thái này',
  })
  @IsOptional()
  @IsIn(['DRAFT', 'ERROR', 'UNCERTAIN', 'ISSUED'])
  status?: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED';

  @ApiProperty({
    required: false,
    description: 'Từ ngày kinh doanh; bỏ trống cả hai là hôm nay',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from?: string;

  @ApiProperty({ required: false, description: 'Đến ngày kinh doanh' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to?: string;

  @ApiProperty({
    required: false,
    description: 'Tìm theo đầu số bill, mọi ngày',
  })
  @IsOptional()
  @Matches(BILL_NUMBER_RE, { message: 'Số bill chỉ gồm chữ số' })
  billNumber?: string;
}
```

- [ ] **Step 4: Service**

Trong `502-backend/src/einvoice/einvoices.service.ts`:

(a) Ngay dưới dòng `const NOT_SETTLED = { in: [EinvoiceStatus.SENDING, EinvoiceStatus.UNCERTAIN] };`, thêm:

```ts
// The invoices of a tab: "Lỗi" is a draft with an error, "Không rõ" also
// holds sends still in flight or cut off.
function statusWhere(
  status: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED',
): Prisma.EinvoiceWhereInput {
  if (status === 'DRAFT') {
    return { status: EinvoiceStatus.DRAFT, lastError: null };
  }
  if (status === 'ERROR') {
    return { status: EinvoiceStatus.DRAFT, lastError: { not: null } };
  }
  if (status === 'UNCERTAIN') return { status: NOT_SETTLED };
  return { status: EinvoiceStatus.ISSUED };
}
```

(b) Trong `listWhere`, thay đoạn từ `const where: Prisma.EinvoiceWhereInput = { branchId };` đến hết khối `else if (query.status) { … }` bằng:

```ts
    const where: Prisma.EinvoiceWhereInput = {
      branchId,
      ...(query.status ? statusWhere(query.status) : {}),
    };
```

Giữ nguyên dòng `if (query.free) where.orderId = null;` (từ Task 2) và phần ngày/số bill bên dưới.

(c) Thay toàn bộ hàm `bills` (kể cả comment trên nó) bằng:

```ts
  // The bills of the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §4):
  // the paid ones of a range of business days, or those holding an invoice of
  // a status. Pending work (drafts, errors, uncertain) is every day and keeps
  // voided bills, so their uncertain invoices can still be settled.
  async bills(user: AuthUser, query: EinvoiceBillsQuery) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const today = toDbDate(businessDateOf(new Date()));
    const days = dateRange(query.from, query.to) ?? { gte: today, lte: today };
    const where: Prisma.OrderWhereInput = { branchId };
    if (query.billNumber) {
      where.billNumber = billNumberPrefixRange(query.billNumber);
    }
    if (query.status) {
      // Einvoice(branchId, status, createdAt) or (branchId, businessDate).
      where.einvoices = {
        some: {
          branchId,
          ...statusWhere(query.status),
          ...(query.status === 'ISSUED' && !query.billNumber
            ? { businessDate: days }
            : {}),
        },
      };
    } else {
      where.status = OrderStatus.COMPLETED;
      if (!query.billNumber) where.businessDate = days;
    }
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          billNumber: true,
          finalAmount: true,
          endTime: true,
          cancelledAt: true,
          room: { select: { name: true } },
        },
        orderBy: { endTime: 'desc' },
        take: 500,
      }),
      this.prisma.order.count({ where }),
    ]);
    // Einvoice(orderId) index.
    const sums =
      orders.length === 0
        ? []
        : await this.prisma.einvoice.groupBy({
            by: ['orderId'],
            where: { orderId: { in: orders.map((o) => o.id) } },
            _sum: { amount: true },
            _count: { _all: true },
          });
    const byOrder = new Map(sums.map((sum) => [sum.orderId, sum]));
    const rows = orders.map((order) => ({
      orderId: order.id,
      billNumber: order.billNumber,
      roomName: order.room?.name ?? null,
      endTime: order.endTime,
      cancelledAt: order.cancelledAt,
      finalAmount: order.finalAmount,
      allocated: Number(byOrder.get(order.id)?._sum.amount ?? 0),
      einvoiceCount: byOrder.get(order.id)?._count._all ?? 0,
    }));
    return [rows, total] as [typeof rows, number];
  }
```

- [ ] **Step 5: Chạy unit test**

Run: `cd 502-backend && npx jest src/einvoice`
Expected: PASS. `it('lists invoices being sent with the uncertain ones', …)` cũ vẫn pass, vì `where` vẫn là `{ branchId: 1, status: pending }`.

- [ ] **Step 6: Viết và sửa test e2e**

Trong `502-backend/test/einvoice.e2e-spec.ts`, `describe('drafts')`:

- `it('refuses a day that does not exist', …)`: thay khối

```ts
      await as('tn1_cs1')
        .get('/einvoices/bills?businessDate=2026-02-30')
        .expect(400);
```

  bằng

```ts
      await as('tn1_cs1').get('/einvoices/bills?from=2026-02-30').expect(400);
      await as('tn1_cs1')
        .get('/einvoices/bills?from=2026-05-02&to=2026-05-01')
        .expect(400);
```

- Thêm `it` này ngay sau `it('shows a bill with its invoices and how much is split', …)`:

```ts
    it('lists bills by day and by the status of their invoices', async () => {
      const ids = async (query: string) =>
        (
          (await as('tn1_cs1').get(`/einvoices/bills${query}`).expect(200))
            .body as Json[]
        ).map((b) => b.orderId);
      expect(await ids('')).toContain(orderId);
      expect(await ids('?from=2020-01-01&to=2020-01-02')).toEqual([]);
      expect(await ids('?status=DRAFT&from=2020-01-01&to=2020-01-02')).toContain(
        orderId,
      );
      expect(await ids('?status=ISSUED')).not.toContain(orderId);

      // A voided bill keeps its drafts in the pending tabs, not in the day's bills.
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'HĐĐT-4', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      const voided = (
        (await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201))
          .body as Json
      ).id as number;
      await as('tn1_cs1')
        .post(`/orders/${voided}/checkout`, { paymentMethod: 'CASH' })
        .expect(200);
      const draft = (
        (
          await as('tn1_cs1')
            .post('/einvoices', { orderId: voided, amount: 0, lines: [] })
            .expect(201)
        ).body as Json
      ).id as number;
      await as('admin')
        .post(`/orders/${voided}/void`, { reason: 'Nhập nhầm phòng' })
        .expect(200);
      expect(await ids('')).not.toContain(voided);
      const pending = (
        await as('tn1_cs1').get('/einvoices/bills?status=DRAFT').expect(200)
      ).body as Json[];
      expect(pending.find((b) => b.orderId === voided)?.cancelledAt).toEqual(
        expect.any(String),
      );
      await as('tn1_cs1').delete(`/einvoices/${draft}`).expect(200);
    });
```

- [ ] **Step 7: Chạy e2e**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src/einvoice 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): danh sách bill theo khoảng ngày và theo trạng thái hóa đơn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dòng hàng VAT 10%, cột "Thành tiền trước VAT"

Spec §5.4.

**Files:**
- Modify: `502-frontend/src/lib/einvoice.ts`
- Modify (thay toàn bộ): `502-frontend/src/components/einvoices/einvoice-lines.tsx`
- Modify: `502-frontend/src/components/einvoices/einvoice-editor.tsx` (bỏ `defaultRate`)

**Interfaces:**
- Produces:
  - `EINVOICE_VAT_RATE: VatRate` trong `lib/einvoice.ts`.
  - `EinvoiceLines` có props `{ lines, bill: EinvoiceBillDetail["order"] | null, missing, disabled, onChange }` (không còn `defaultRate`).

- [ ] **Step 1: `lib/einvoice.ts`**

Thay hàm `defaultVatRate` (và comment của nó nếu có) bằng:

```ts
// Every line made on the page carries the venue's VAT; there is no rate to
// choose (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.4).
export const EINVOICE_VAT_RATE: VatRate = 10;
```

Xóa luôn hàm `defaultVatRate` ở backend (`502-backend/src/einvoice/einvoice-math.ts`) và `it('defaults a line to the VAT of the bill when it is a legal rate', …)` cùng tên `defaultVatRate` trong import của `einvoice-math.spec.ts`, để hai bản vẫn khớp nhau. Xóa các import không còn dùng nếu lint báo.

Run: `grep -rn "defaultVatRate" 502-backend/src 502-frontend/src`
Expected: chỉ còn `502-frontend/src/components/einvoices/einvoice-editor.tsx` (Step 3 sẽ xóa).

- [ ] **Step 2: Thay toàn bộ `einvoice-lines.tsx`**

```tsx
"use client";

import { ListPlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DecimalInput, MoneyInput } from "@/components/einvoices/number-input";
import { EINVOICE_VAT_RATE, fillerLine, lineAmountOf, MAX_LINES } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EinvoiceBillDetail, EinvoiceLine } from "@/lib/types";

// One row per line from the panel's @container/einvoice width up (fixed
// columns, so the rows line up under the header); below it each line is a
// card of two columns with the labels shown.
const LINE_GRID =
  "grid-cols-2 gap-2 @2xl/einvoice:grid-cols-[minmax(0,1fr)_4rem_4.5rem_7rem_8rem_2rem] @2xl/einvoice:items-center";
const NARROW_LABEL = "text-xs font-normal text-muted-foreground @2xl/einvoice:hidden";

// Dòng hàng of a small invoice: typed freely, taken from the bill, or a filler
// line that brings the total to the amount. Every new line carries
// EINVOICE_VAT_RATE; there is no rate to choose (spec
// 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.4).
export function EinvoiceLines({
  lines,
  bill,
  missing,
  disabled,
  onChange,
}: {
  lines: EinvoiceLine[];
  // Null for a free invoice: nothing to take from.
  bill: EinvoiceBillDetail["order"] | null;
  missing: number;
  disabled: boolean;
  onChange: (lines: EinvoiceLine[]) => void;
}) {
  const full = lines.length >= MAX_LINES;

  // A change of price or quantity drops the fixed VAT of a filler line.
  const set = (index: number, patch: Partial<EinvoiceLine>) =>
    onChange(
      lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.unitPrice !== undefined || patch.quantity !== undefined) delete next.vatAmount;
        return next;
      }),
    );

  const fromBill: { label: string; line: EinvoiceLine }[] = !bill
    ? []
    : [
        ...(bill.billedHours > 0 && Number(bill.pricePerHour) > 0
          ? [
              {
                label: `Tiền giờ ${bill.billedHours.toLocaleString("vi-VN")} giờ × ${formatMoney(bill.pricePerHour)}`,
                line: {
                  name: `Tiền giờ phòng ${bill.room?.name ?? ""}`.trim(),
                  unit: "Giờ",
                  quantity: bill.billedHours,
                  unitPrice: Math.round(Number(bill.pricePerHour)),
                  vatRate: EINVOICE_VAT_RATE,
                },
              },
            ]
          : []),
        ...bill.items.map((item) => ({
          label: `${item.name} × ${item.quantity} (${formatMoney(item.price)})`,
          line: {
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: Math.round(Number(item.price)),
            vatRate: EINVOICE_VAT_RATE,
          },
        })),
      ];

  return (
    <FieldSet className="min-w-0 gap-3">
      <FieldLegend variant="label">Dòng hàng</FieldLegend>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full}
          onClick={() =>
            onChange([...lines, { name: "", unit: "", quantity: 1, unitPrice: 0, vatRate: EINVOICE_VAT_RATE }])
          }
        >
          <PlusIcon data-icon="inline-start" />
          Thêm dòng
        </Button>
        {bill && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={disabled || full || fromBill.length === 0}>
                <ListPlusIcon data-icon="inline-start" />
                Lấy món từ bill
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-80 max-w-(--radix-dropdown-menu-content-available-width) overflow-y-auto"
            >
              {fromBill.map((entry, index) => (
                <DropdownMenuItem key={index} onSelect={() => onChange([...lines, entry.line])}>
                  {entry.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full || missing <= 0}
          onClick={() => {
            const filler = fillerLine(missing, EINVOICE_VAT_RATE);
            if (filler) onChange([...lines, filler]);
          }}
        >
          Thêm dòng bù phần còn thiếu
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dòng hàng.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            aria-hidden
            className={cn(LINE_GRID, "hidden border-b pb-2 text-xs font-medium text-muted-foreground @2xl/einvoice:grid")}
          >
            <span>Tên hàng, dịch vụ</span>
            <span>ĐVT</span>
            <span>SL</span>
            <span>Đơn giá trước VAT</span>
            <span className="text-right">Thành tiền trước VAT</span>
            <span />
          </div>
          <ul className="flex flex-col gap-3 @2xl/einvoice:gap-2">
            {lines.map((line, index) => (
              <li
                key={index}
                className={cn(LINE_GRID, "grid rounded-md border p-2 @2xl/einvoice:border-0 @2xl/einvoice:p-0")}
              >
                <Input
                  aria-label={`Tên hàng dòng ${index + 1}`}
                  placeholder="Tên hàng, dịch vụ"
                  maxLength={300}
                  value={line.name}
                  disabled={disabled}
                  onChange={(e) => set(index, { name: e.target.value })}
                  className="col-span-2 @2xl/einvoice:col-span-1"
                />
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-unit`} className={NARROW_LABEL}>
                    ĐVT
                  </FieldLabel>
                  <Input
                    id={`einvoice-line-${index}-unit`}
                    aria-label={`ĐVT dòng ${index + 1}`}
                    maxLength={30}
                    value={line.unit}
                    disabled={disabled}
                    onChange={(e) => set(index, { unit: e.target.value })}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-quantity`} className={NARROW_LABEL}>
                    Số lượng
                  </FieldLabel>
                  <DecimalInput
                    id={`einvoice-line-${index}-quantity`}
                    aria-label={`Số lượng dòng ${index + 1}`}
                    className="text-right tabular-nums"
                    value={line.quantity}
                    disabled={disabled}
                    onChange={(quantity) => set(index, { quantity })}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor={`einvoice-line-${index}-price`} className={NARROW_LABEL}>
                    Đơn giá trước VAT
                  </FieldLabel>
                  <MoneyInput
                    id={`einvoice-line-${index}-price`}
                    aria-label={`Đơn giá trước VAT dòng ${index + 1}`}
                    className="text-right tabular-nums"
                    value={line.unitPrice}
                    disabled={disabled}
                    onChange={(unitPrice) => set(index, { unitPrice: unitPrice ?? 0 })}
                  />
                </Field>
                <div className="flex flex-col gap-1 text-sm tabular-nums @2xl/einvoice:items-end">
                  <span className={NARROW_LABEL}>Thành tiền trước VAT</span>
                  <span className="flex h-9 items-center @2xl/einvoice:h-auto">{formatMoney(lineAmountOf(line))}</span>
                  {/* A line saved before rates were fixed keeps its own; it shows. */}
                  {line.vatRate !== EINVOICE_VAT_RATE && (
                    <span className="text-xs text-muted-foreground">VAT {line.vatRate}%</span>
                  )}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Xóa dòng ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  className="col-span-2 justify-self-end @2xl/einvoice:col-span-1"
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FieldSet>
  );
}
```

- [ ] **Step 3: Editor không còn `defaultRate`**

Trong `502-frontend/src/components/einvoices/einvoice-editor.tsx`:
- Bỏ `defaultVatRate` khỏi import `@/lib/einvoice`.
- Xóa dòng `const defaultRate = defaultVatRate(bill.taxPercent);`.
- Xóa prop `defaultRate={defaultRate}` của `<EinvoiceLines …>`.

- [ ] **Step 4: Kiểm tra**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint && cd ../502-backend && npx jest src/einvoice`
Expected: không lỗi, PASS.

- [ ] **Step 5: Commit**

```bash
git add 502-frontend/src/lib/einvoice.ts 502-frontend/src/components/einvoices/einvoice-lines.tsx 502-frontend/src/components/einvoices/einvoice-editor.tsx 502-backend/src/einvoice/einvoice-math.ts 502-backend/src/einvoice/einvoice-math.spec.ts
git commit -m "feat(web): dòng hàng HĐĐT luôn VAT 10%, cột Thành tiền trước VAT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Trang hai cột

Spec §5.1–5.3, §5.5. Task lớn nhất, vì cột trái, cột phải và trang phải đổi cùng lúc mới biên dịch được. Mỗi step là một file.

**Files:**
- Modify: `502-frontend/src/hooks/use-api-data.ts` (`url` được là `null`)
- Modify: `502-frontend/src/lib/types.ts` (`EinvoiceRow`, `EinvoiceBill`)
- Modify: `502-frontend/src/lib/einvoice.ts` (`symbolYearOf`, `invoiceDateProblem`, `defaultInvoiceDate`, `isEmptyDraft`)
- Modify (thay toàn bộ): `502-frontend/src/components/einvoices/issue-controls.tsx`, `einvoice-editor.tsx`, `502-frontend/src/app/[branch]/sales/einvoices/page.tsx`
- Create: `502-frontend/src/components/einvoices/einvoice-issue-panel.tsx`, `einvoice-row.tsx`, `bill-split.tsx`, `einvoice-bill-list.tsx`
- Delete: `502-frontend/src/components/einvoices/einvoice-list.tsx`, `bill-picker-dialog.tsx`, `bill-einvoices-panel.tsx`
- Modify (cục bộ, không commit): `.claude/launch.json` (chạy thử với Minvoice giả)

**Interfaces:**
- Consumes:
  - từ Task 2–4: `POST /einvoices?branch` không `orderId`, `GET /einvoices?free=1`, `GET /einvoices/bills?status&from&to` với `cancelledAt`, `PATCH` có `invoiceDate`;
  - từ Task 5: `EINVOICE_VAT_RATE`, `EinvoiceLines` với `bill` được là `null`.
- Produces (chỉ trong task này):
  - `useApiData(url: string | null, …)`;
  - `EinvoiceIssuePanel`, `buyerOf`;
  - `EinvoiceRow`, `BillSplit`, `EinvoiceBillList`, các kiểu `EinvoiceTab` và `Creating`.

- [ ] **Step 1: `useApiData` nhận `url = null`**

Trong `502-frontend/src/hooks/use-api-data.ts`:
- Đổi comment đầu hàm và chữ ký:

```ts
// GET `url` with `params`, refetching when they change or on reload(). A null
// `url` fetches nothing (a panel with nothing chosen): `data` keeps the last
// answer, so a caller checks it belongs to what it asked for.
// Failures show a toast with the server message (or `errorMessage`).
export function useApiData<T>(
  url: string | null,
  params: Record<string, unknown>,
  initial: T,
  errorMessage: string,
) {
```

- Thay hai dòng `requestKey` và `loading`:

```ts
  const requestKey = url === null ? null : `${url}:${paramsKey}:${version}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = requestKey !== null && loadedKey !== requestKey;
```

- Dòng đầu của `useEffect` thêm:

```ts
    if (url === null || requestKey === null) return;
```

- [ ] **Step 2: Kiểu dữ liệu**

Trong `502-frontend/src/lib/types.ts`:
- `EinvoiceRow`: `orderId: number;` đổi thành `orderId: number | null; // null: a free invoice, made without a bill`. Kiểu `order: { … };` đổi thành `order: { … } | null;` (giữ nguyên các trường bên trong).
- `EinvoiceBill`: đổi comment thành `// GET /einvoices/bills: the bills of the left column.` và thêm `cancelledAt: string | null;` sau `endTime`.

- [ ] **Step 3: Các hàm hỗ trợ trong `lib/einvoice.ts`**

- Đổi import đầu file thành:

```ts
import { formatDate, toDateInput } from "@/lib/format";
import type { EinvoiceConfigView, EinvoiceDraft, EinvoiceLine, EinvoiceRow, VatRate } from "@/lib/types";
```

- Thêm vào cuối file:

```ts
// 1C26MTT: characters 3–4 are the year (Thông tư 78/2021), as the backend reads it.
export function symbolYearOf(symbolCode: string): number | null {
  const yy = Number(symbolCode.slice(2, 4));
  return Number.isInteger(yy) ? 2000 + yy : null;
}

// Why the invoice date of a draft blocks its issue, or null. The server checks
// the same when it is issued; a date after today is confirmed at Xuất.
export function invoiceDateProblem(
  date: string,
  config: Pick<EinvoiceConfigView, "minInvoiceDate" | "symbolCode"> | null,
): string | null {
  if (config?.minInvoiceDate && date < config.minInvoiceDate) {
    return `Ngày hóa đơn phải từ ${formatDate(config.minInvoiceDate)} trở đi`;
  }
  const year = config?.symbolCode ? symbolYearOf(config.symbolCode) : null;
  if (year !== null && Number(date.slice(0, 4)) !== year) {
    return `Ký hiệu ${config?.symbolCode} là của năm ${year}, ngày hóa đơn là ${formatDate(date)}`;
  }
  return null;
}

// The date shown for a draft saved before drafts kept one: the calendar day
// its bill was paid (never the business day), or today without a bill.
export function defaultInvoiceDate(billEndTime: string | null | undefined): string {
  return toDateInput(billEndTime ? new Date(billEndTime) : new Date());
}

// Nothing typed in it yet (amount 0, no buyer, no line): deleted without
// asking. A list row carries no lines; its VAT, 0 without a priced line,
// stands in for them.
export function isEmptyDraft(row: EinvoiceRow & { draft?: EinvoiceDraft | null }): boolean {
  if (row.status !== "DRAFT" || Number(row.amount) !== 0 || row.buyerTaxCode || row.buyerName) return false;
  return row.draft ? row.draft.lines.length === 0 : Number(row.vatAmount) === 0;
}
```

- [ ] **Step 4: Thay toàn bộ `issue-controls.tsx`**

```tsx
"use client";

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api, { isBadRequest, isSessionEnded } from "@/lib/api";
import { invoiceDateProblem, UNKNOWN_RESULT_MESSAGE } from "@/lib/einvoice";
import { formatDate, toDateInput } from "@/lib/format";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// Xuất (chain manager, spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §2, §5.3):
// a draft dated today goes out at once; any other date first asks whether to
// issue it today instead. Keeping a date after today is the confirmation the
// server wants (confirmFutureDate). The answer is always the row: ISSUED,
// DRAFT with the error, or UNCERTAIN. Rendered inside the panel's
// @container/einvoice.
export function IssueControls({
  einvoice,
  invoiceDate,
  config,
  problem,
  busy,
  onIssued,
}: {
  einvoice: EinvoiceDetail;
  // YYYY-MM-DD, the calendar day saved with the draft.
  invoiceDate: string;
  config: EinvoiceConfigView | null;
  // Why the draft cannot go out yet (unsaved, lines not matching…), or null.
  problem: string | null;
  // The panel is reloading after a write: nothing more is sent meanwhile.
  busy: boolean;
  onIssued: (row: EinvoiceDetail) => void;
}) {
  const notify = useNotify();
  // The calendar day, not the business day.
  const today = toDateInput();
  const [issuing, setIssuing] = useState(false);
  const [asking, setAsking] = useState(false);
  const blocked = !config?.configured ? "Minvoice chưa được cấu hình cho cơ sở này" : problem;
  // An answer whose date the server would refuse is not offered.
  const keepProblem = invoiceDateProblem(invoiceDate, config);
  const todayProblem = invoiceDateProblem(today, config);

  const send = async (date: string) => {
    setIssuing(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/issue`, {
        invoiceDate: date,
        confirmFutureDate: date > today,
      });
      const row = res.data;
      if (row.status === "ISSUED") {
        // Issued, but Minvoice's number clashed with one of ours: no number yet.
        if (row.lastError) notify.warning(row.lastError);
        else notify.success(`Đã xuất hóa đơn số ${row.invoiceNumber ?? "?"}`);
      } else if (row.status === "UNCERTAIN") {
        notify.warning("Không rõ Minvoice đã tạo hóa đơn chưa. Hãy đối chiếu trên Minvoice.");
      } else toast.error(row.lastError ?? "Minvoice từ chối hóa đơn");
      onIssued(row);
      return true;
    } catch (error) {
      // A 400 is a refusal before anything was sent. Anything else may have
      // reached Minvoice, so the row is reloaded instead of calling it failed.
      if (isBadRequest(error) || isSessionEnded(error)) {
        notify.error(error, "Không xuất được hóa đơn");
        return false;
      }
      notify.warning(UNKNOWN_RESULT_MESSAGE);
      onIssued(einvoice);
      return true;
    } finally {
      setIssuing(false);
    }
  };

  // One answer of the question: a refusal before anything was sent (400)
  // keeps it open, anything else closes it.
  const answer = async (date: string) => {
    if (await send(date)) setAsking(false);
  };

  return (
    <div className="flex w-full flex-col gap-1 @md/einvoice:ml-auto @md/einvoice:w-auto @md/einvoice:items-end">
      <Button
        className="self-start @md/einvoice:self-end"
        onClick={() => (invoiceDate === today ? void send(today) : setAsking(true))}
        disabled={issuing || busy || !!blocked}
      >
        {issuing ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
        Xuất
      </Button>
      {blocked && <span className="text-xs text-muted-foreground @md/einvoice:text-right">{blocked}</span>}
      <AlertDialog open={asking} onOpenChange={(open) => !issuing && setAsking(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đổi ngày hóa đơn về hôm nay?</AlertDialogTitle>
            <AlertDialogDescription>
              Ngày hóa đơn đang là {formatDate(invoiceDate)}, không phải hôm nay ({formatDate(today)}).
              {keepProblem
                ? ` Không giữ được ngày này: ${keepProblem}.`
                : invoiceDate > today &&
                  ` Giữ ngày này thì mọi hóa đơn sau cùng ký hiệu ${config?.symbolCode ?? ""} phải mang ngày từ ${formatDate(invoiceDate)} trở đi.`}
              {todayProblem && ` Không đổi về hôm nay được: ${todayProblem}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={issuing}>Hủy bỏ</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              disabled={issuing || !!keepProblem}
              onClick={(e) => {
                e.preventDefault();
                void answer(invoiceDate);
              }}
            >
              Giữ {formatDate(invoiceDate)}
            </AlertDialogAction>
            <AlertDialogAction
              disabled={issuing || !!todayProblem}
              onClick={(e) => {
                e.preventDefault();
                void answer(today);
              }}
            >
              {issuing && <Spinner data-icon="inline-start" />}
              Đổi về hôm nay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

Ghi chú:
- `send` vẫn trả `true`/`false` như bản cũ: `false` khi bị từ chối 400 trước lúc gửi, `true` khi đã có kết quả hoặc kết quả không rõ.
- Chọn "Đổi về hôm nay" không cần `PATCH` riêng: lúc khóa để gửi, server ghi `invoiceDate` của request vào hóa đơn, và một lần gửi kết thúc bằng `DRAFT` giữ ngày đó (Task 3).
- `e.preventDefault()` giữ hộp mở trong lúc gửi; `answer` tự đóng khi xong.

- [ ] **Step 5: Thay toàn bộ `einvoice-editor.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { DatePicker } from "@/components/date-range-picker";
import { BuyerFields, type BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceLines } from "@/components/einvoices/einvoice-lines";
import { IssueControls } from "@/components/einvoices/issue-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { defaultInvoiceDate, invoiceDateProblem, issueProblem, totalsOf } from "@/lib/einvoice";
import { formatDate, formatMoney, toDateInput } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail, EinvoiceLine } from "@/lib/types";

interface FormState extends BuyerValue {
  invoiceDate: string;
  lines: EinvoiceLine[];
}

const formOf = (einvoice: EinvoiceDetail, fallbackDate: string): FormState => ({
  invoiceDate: einvoice.invoiceDate ?? fallbackDate,
  buyerTaxCode: einvoice.buyerTaxCode ?? "",
  buyerName: einvoice.buyerName ?? "",
  buyerAddress: einvoice.draft?.buyerAddress ?? "",
  buyerEmail: einvoice.draft?.buyerEmail ?? "",
  lines: einvoice.draft?.lines ?? [],
});

const buyerOf = (form: FormState): BuyerValue => ({
  buyerTaxCode: form.buyerTaxCode,
  buyerName: form.buyerName,
  buyerAddress: form.buyerAddress,
  buyerEmail: form.buyerEmail,
});

// One draft in the right column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.3): its invoice date, buyer and lines. The amount is typed in the left
// column and read from the saved row, so a change there never resets what is
// typed here. Rendered inside the panel's @container/einvoice.
export function EinvoiceEditor({
  bill,
  einvoice,
  previous,
  config,
  onSaved,
  onDirtyChange,
  busy,
}: {
  // Null for a free invoice.
  bill: EinvoiceBillDetail["order"] | null;
  einvoice: EinvoiceDetail;
  previous: BuyerValue | null;
  config: EinvoiceConfigView | null;
  onSaved: (row: EinvoiceDetail) => void;
  onDirtyChange: (dirty: boolean) => void;
  // The page is reloading after a write: saving or issuing waits for the new row.
  busy: boolean;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  // A voided bill takes no changed or issued invoice (the server refuses);
  // its drafts are deleted in the left column.
  const billStands = !bill || bill.status === "COMPLETED";
  const canEdit = can(user, "einvoices.write") && billStands;
  const canIssue = can(user, "einvoices.issue") && billStands;
  const fallbackDate = defaultInvoiceDate(bill?.endTime);
  const saved = useMemo(() => formOf(einvoice, fallbackDate), [einvoice, fallbackDate]);
  const [form, setForm] = useState<FormState>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const amount = Number(einvoice.amount);
  const totals = totalsOf(form.lines);
  const missing = amount - totals.total;
  const problem = issueProblem(amount, form.lines);
  // A warning only: Xuất offers to issue it today instead (spec §2).
  const dateProblem = invoiceDateProblem(form.invoiceDate, config);

  const save = async () => {
    if (form.lines.some((line) => !line.name.trim())) {
      notify.warning("Dòng hàng nào cũng cần tên");
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}`, {
        amount,
        invoiceDate: form.invoiceDate,
        buyerTaxCode: form.buyerTaxCode.trim() || null,
        buyerName: form.buyerName.trim() || null,
        buyerAddress: form.buyerAddress.trim() || null,
        buyerEmail: form.buyerEmail.trim() || null,
        lines: form.lines.map((line) => ({ ...line, name: line.name.trim(), unit: line.unit.trim() })),
      });
      notify.success("Đã lưu hóa đơn nháp");
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không lưu được hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {einvoice.lastError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Lần gửi gần nhất bị lỗi</AlertTitle>
          <AlertDescription className="wrap-anywhere">{einvoice.lastError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Ngày hóa đơn</span>
        {canEdit ? (
          <DatePicker
            value={form.invoiceDate}
            onChange={(invoiceDate) => setForm((f) => ({ ...f, invoiceDate }))}
            min={config?.minInvoiceDate ?? undefined}
            today={toDateInput()}
            label="Ngày hóa đơn"
            className="w-fit"
          />
        ) : (
          <span className="text-sm">{formatDate(form.invoiceDate)}</span>
        )}
        {config?.minInvoiceDate && (
          <span className="text-xs text-muted-foreground">
            Từ {formatDate(config.minInvoiceDate)} trở đi (hóa đơn số {config.latestInvoiceNumber ?? "?"} cùng ký
            hiệu mang ngày này)
          </span>
        )}
        {dateProblem && <span className="text-xs text-warning">{dateProblem}</span>}
      </div>
      {/* Functional updates: a lookup answers after a while and must not undo
          the lines typed meanwhile. */}
      <BuyerFields
        value={buyerOf(form)}
        previous={previous}
        disabled={!canEdit}
        onChange={(buyer) => setForm((f) => ({ ...f, ...buyer }))}
      />
      <EinvoiceLines
        lines={form.lines}
        bill={bill}
        missing={missing}
        disabled={!canEdit}
        onChange={(lines) => setForm((f) => ({ ...f, lines }))}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums @md/einvoice:ml-auto @md/einvoice:w-72">
        <dt className="text-muted-foreground">Trước thuế</dt>
        <dd className="text-right">{formatMoney(totals.amountWithoutVat)}</dd>
        <dt className="text-muted-foreground">VAT</dt>
        <dd className="text-right">{formatMoney(totals.vatAmount)}</dd>
        <dt className="font-medium">Tổng</dt>
        <dd className="text-right font-medium">{formatMoney(totals.total)}</dd>
        {missing !== 0 && (
          <>
            <dt className="text-destructive">{missing > 0 ? "Còn thiếu" : "Thừa"}</dt>
            <dd className="text-right text-destructive">{formatMoney(Math.abs(missing))}</dd>
          </>
        )}
      </dl>
      {problem && (amount < 1 || missing === 0) && <p className="text-sm text-destructive">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button onClick={save} disabled={saving || busy || !dirty}>
            {saving && <Spinner data-icon="inline-start" />}
            Lưu nháp
          </Button>
        )}
        {dirty && <span className="text-sm text-muted-foreground">Có thay đổi chưa lưu</span>}
        {canIssue && (
          <IssueControls
            einvoice={einvoice}
            invoiceDate={form.invoiceDate}
            config={config}
            problem={dirty ? "Lưu nháp trước khi xuất" : problem}
            busy={busy}
            onIssued={onSaved}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Tạo `einvoice-issue-panel.tsx`**

```tsx
"use client";

import type { BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceEditor } from "@/components/einvoices/einvoice-editor";
import { IssuedView } from "@/components/einvoices/issued-view";
import { UncertainBox } from "@/components/einvoices/uncertain-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { billLabel, formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The buyer of the invoice before, for "Chép từ HĐ trước" (none when it was a
// khách lẻ: there is nothing to copy). An issued one has no draft left, so
// only its MST and name.
export const buyerOf = (einvoice: EinvoiceDetail | undefined): BuyerValue | null => {
  if (!einvoice) return null;
  const buyer = {
    buyerTaxCode: einvoice.buyerTaxCode ?? "",
    buyerName: einvoice.buyerName ?? "",
    buyerAddress: einvoice.draft?.buyerAddress ?? "",
    buyerEmail: einvoice.draft?.buyerEmail ?? "",
  };
  return Object.values(buyer).some(Boolean) ? buyer : null;
};

// What the editor starts from. A save that changes it remounts the editor
// clean; an amount typed in the left column does not, so unsaved edits stay
// (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.3).
const editorKey = (einvoice: EinvoiceDetail) =>
  `${einvoice.id}:${JSON.stringify([einvoice.invoiceDate, einvoice.buyerTaxCode, einvoice.buyerName, einvoice.draft])}`;

// Right column: one invoice, to fill and issue. Rendered both inline in
// @container/main and in the phone Sheet (portaled outside it), so it is its
// own container.
export function EinvoiceIssuePanel({
  einvoice,
  bill,
  label,
  previous,
  config,
  busy,
  onChanged,
  onReload,
  onDirtyChange,
}: {
  einvoice: EinvoiceDetail;
  // Its bill; null for a free invoice.
  bill: EinvoiceBillDetail["order"] | null;
  // "HĐ 2" within its bill, or "HĐ tự do #12".
  label: string;
  previous: BuyerValue | null;
  config: EinvoiceConfigView | null;
  busy: boolean;
  onChanged: (row: EinvoiceDetail) => void;
  onReload: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const badge = einvoiceStatusBadge(einvoice.status, einvoice.lastError);
  return (
    <div className="@container/einvoice flex min-w-0 flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">
            {label}
            {bill && ` · Bill ${billLabel(bill)} · ${bill.room?.name ?? "—"}`}
          </div>
          <div className="text-sm text-muted-foreground">
            Số tiền (đã gồm VAT):{" "}
            <span className="font-medium text-foreground tabular-nums">{formatMoney(einvoice.amount)}</span> · sửa ở
            cột trái
          </div>
        </div>
        <Badge variant={badge.variant}>
          {badge.label}
          {einvoice.invoiceNumber ? ` · số ${einvoice.invoiceNumber}` : ""}
        </Badge>
      </div>
      {einvoice.status === "ISSUED" ? (
        <IssuedView einvoice={einvoice} onChanged={onChanged} />
      ) : einvoice.status === "UNCERTAIN" ? (
        <UncertainBox
          einvoice={einvoice}
          config={config}
          billCompleted={!bill || bill.status === "COMPLETED"}
          busy={busy}
          onChanged={onChanged}
        />
      ) : einvoice.status === "SENDING" ? (
        // The server turns a send that never answered into "Không rõ" when it
        // is read, so a reload is all this row ever needs.
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Spinner data-icon="inline-start" />
          Đang gửi lên Minvoice…
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReload}>
            Tải lại
          </Button>
        </div>
      ) : (
        <EinvoiceEditor
          key={editorKey(einvoice)}
          bill={bill}
          einvoice={einvoice}
          previous={previous}
          config={config}
          onSaved={onChanged}
          onDirtyChange={onDirtyChange}
          busy={busy}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Tạo `einvoice-row.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MoneyInput } from "@/components/einvoices/number-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { isEmptyDraft } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { EinvoiceDetail, EinvoiceRow as EinvoiceListRow } from "@/lib/types";

// One small invoice in the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.2): its amount is typed here and saved on Enter or when the box is left;
// a draft is deleted here, at once when nothing was typed in it. Rendered
// inside @container/main.
export function EinvoiceRow({
  einvoice,
  label,
  selected,
  editable,
  autoFocus = false,
  forceConfirm = false,
  onSelect,
  onSaved,
  onDeleted,
}: {
  // A row of the open bill (with its draft) or of the free list (without).
  einvoice: EinvoiceListRow | EinvoiceDetail;
  label: string;
  selected: boolean;
  // Its bill stands, or it has none: the amount of a draft may change.
  editable: boolean;
  // Just created: the cursor goes to its amount.
  autoFocus?: boolean;
  // The panel holds unsaved edits of it: deleting it always asks.
  forceConfirm?: boolean;
  onSelect: () => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const canWrite = can(user, "einvoices.write");
  const isDraft = einvoice.status === "DRAFT";
  const savedAmount = Number(einvoice.amount);
  const [typed, setTyped] = useState<number | null>(savedAmount);
  const [shown, setShown] = useState(savedAmount);
  // A reload with another amount shows it; adjusted during render, so typing
  // never loses the focus.
  if (savedAmount !== shown) {
    setShown(savedAmount);
    setTyped(savedAmount);
  }
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // PATCH replaces the whole draft: the saved buyer and lines go with the new
  // amount (a free row is read first, as the list leaves its lines out). The
  // date is left out, so it stays.
  const saveAmount = async () => {
    if (typed === null) {
      setTyped(savedAmount);
      return;
    }
    if (typed === savedAmount || saving) return;
    setSaving(true);
    try {
      const current =
        "draft" in einvoice ? einvoice : (await api.get<EinvoiceDetail>(`/einvoices/${einvoice.id}`)).data;
      const res = await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}`, {
        amount: typed,
        buyerTaxCode: current.buyerTaxCode,
        buyerName: current.buyerName,
        buyerAddress: current.draft?.buyerAddress ?? null,
        buyerEmail: current.draft?.buyerEmail ?? null,
        lines: current.draft?.lines ?? [],
      });
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không lưu được số tiền");
      setTyped(savedAmount);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/einvoices/${einvoice.id}`);
      notify.success("Đã xóa hóa đơn nháp");
      onDeleted();
    } catch (error) {
      notify.error(error, "Không xóa được hóa đơn");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const badge = einvoiceStatusBadge(einvoice.status, einvoice.lastError);
  return (
    <>
      <li
        onClick={(e) => {
          // The amount box and the buttons do their own thing.
          if (!(e.target as HTMLElement).closest("input, button")) onSelect();
        }}
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm",
          selected ? "bg-muted" : "hover:bg-muted/50",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
          className="shrink-0 font-medium tabular-nums"
        >
          {label}
        </button>
        {canWrite && isDraft && editable ? (
          <MoneyInput
            aria-label={`Số tiền ${label}`}
            autoFocus={autoFocus}
            className="h-8 w-32 text-right tabular-nums"
            value={typed}
            disabled={saving}
            onChange={setTyped}
            onBlur={() => void saveAmount()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <span className="tabular-nums">{formatMoney(einvoice.amount)}</span>
        )}
        {saving && <Spinner />}
        <Badge variant={badge.variant}>
          {badge.label}
          {einvoice.invoiceNumber ? ` · số ${einvoice.invoiceNumber}` : ""}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{einvoice.buyerName ?? "Khách lẻ"}</span>
        {canWrite && isDraft && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Xóa ${label}`}
            disabled={deleting}
            onClick={() => (forceConfirm || !isEmptyDraft(einvoice) ? setConfirmOpen(true) : void remove())}
          >
            <Trash2Icon />
          </Button>
        )}
      </li>
      {/* Outside the row: clicks in a portal still bubble through React to
          its parent, and must not select the row. */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xóa hóa đơn nháp?"
        description="Nháp và các dòng hàng của nó bị xóa hẳn."
        confirmLabel="Xóa"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
```

- [ ] **Step 8: Tạo `bill-split.tsx`**

```tsx
"use client";

import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { EinvoiceBillDetail, EinvoiceDetail } from "@/lib/types";

// The open bill in the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.2): what is split, what to watch, and its small invoices HĐ 1, HĐ 2…
// (by id) with their amounts.
export function BillSplit({
  detail,
  selectedId,
  focusId,
  dirtyId,
  onSelect,
  onSaved,
  onDeleted,
}: {
  detail: EinvoiceBillDetail;
  selectedId: number | null;
  focusId: number | null;
  // The invoice whose unsaved edits the panel holds.
  dirtyId: number | null;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
}) {
  const { order, einvoices, allocated } = detail;
  const billTotal = Number(order.finalAmount);
  const editedAfter = !!order.editedAt && einvoices.some((e) => e.createdAt < (order.editedAt as string));
  const discounted = Number(order.discountAmount) > 0 || Number(order.hourlyDiscountAmount) > 0;
  return (
    <div className="flex flex-col gap-1 border-t py-2">
      <p className="px-3 text-xs text-muted-foreground tabular-nums">
        VAT {formatMoney(order.taxAmount)}
        {discounted &&
          ` · giảm món ${formatMoney(order.discountAmount)}, giờ ${formatMoney(order.hourlyDiscountAmount)}`}
        {` · đã chia ${formatMoney(allocated)} · `}
        {allocated > billTotal ? `vượt ${formatMoney(allocated - billTotal)}` : `còn ${formatMoney(billTotal - allocated)}`}
      </p>
      {allocated > billTotal && <p className="px-3 text-xs text-warning">Tổng các hóa đơn vượt tổng bill.</p>}
      {order.cancelledAt && (
        <p className="px-3 text-xs text-warning">Bill đã hủy lúc {formatDateTime(order.cancelledAt)}.</p>
      )}
      {editedAfter && (
        <p className="px-3 text-xs text-warning">
          Bill đã sửa lúc {formatDateTime(order.editedAt)}, sau khi tạo hóa đơn.
        </p>
      )}
      {einvoices.length === 0 ? (
        <p className="px-3 py-1 text-sm text-muted-foreground">Chưa có hóa đơn nhỏ.</p>
      ) : (
        <ul>
          {einvoices.map((einvoice, index) => (
            <EinvoiceRow
              key={einvoice.id}
              einvoice={einvoice}
              label={`HĐ ${index + 1}`}
              selected={selectedId === einvoice.id}
              editable={order.status === "COMPLETED"}
              autoFocus={focusId === einvoice.id}
              forceConfirm={dirtyId === einvoice.id}
              onSelect={() => onSelect(einvoice.id)}
              onSaved={onSaved}
              onDeleted={() => onDeleted(einvoice.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Tạo `einvoice-bill-list.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { BillSplit } from "@/components/einvoices/bill-split";
import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type {
  EinvoiceBill,
  EinvoiceBillDetail,
  EinvoiceDetail,
  EinvoiceRow as EinvoiceListRow,
  EinvoiceSummary,
} from "@/lib/types";

// "BILLS" lists the paid bills of the days; the others the bills holding an
// invoice of that status (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
export type EinvoiceTab = "BILLS" | "DRAFT" | "ERROR" | "UNCERTAIN" | "ISSUED";
// What a new draft is being made for: a bill, or "free" (no bill).
export type Creating = number | "free" | null;

const TABS: { value: EinvoiceTab; label: string; count?: keyof EinvoiceSummary }[] = [
  { value: "BILLS", label: "Bill" },
  { value: "DRAFT", label: "Nháp", count: "draftCount" },
  { value: "ERROR", label: "Lỗi", count: "errorCount" },
  // With the sends still in flight or cut off (badge "Đang gửi").
  { value: "UNCERTAIN", label: "Không rõ", count: "uncertainCount" },
  { value: "ISSUED", label: "Đã xuất", count: "issuedCount" },
];

// Left column: the bills, each opened in place to split it, and the invoices
// without a bill on top. Rendered inside @container/main, so its responsive
// classes are container variants.
export function EinvoiceBillList({
  version,
  openOrderId,
  openBill,
  selectedId,
  focusId,
  dirtyId,
  creating,
  onToggleBill,
  onSelect,
  onCreate,
  onSaved,
  onDeleted,
}: {
  // Bumped after every write: the lists and counts reload.
  version: number;
  openOrderId: number | null;
  // The open bill once loaded (null meanwhile).
  openBill: EinvoiceBillDetail | null;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  creating: Creating;
  onToggleBill: (orderId: number, tab: EinvoiceTab) => void;
  onSelect: (orderId: number | null, einvoiceId: number) => void;
  // A new draft at once: for a bill with what is left of it, or free at 0.
  onCreate: (orderId: number | null, amount: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (orderId: number | null, einvoiceId: number) => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const canWrite = can(user, "einvoices.write");
  const [tab, setTab] = useState<EinvoiceTab>("BILLS");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  // A bill number searches every day (the server ignores the dates then).
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  // Drafts, errors and uncertain ones are work still to do: every day.
  const dated = tab === "BILLS" || tab === "ISSUED";
  const status = tab === "BILLS" ? undefined : tab;
  const days = dated && !billNumber ? range : {};

  const bills = useApiData<EinvoiceBill[]>(
    "/einvoices/bills",
    { branch, status, billNumber: billNumber || undefined, ...days },
    [],
    "Không thể tải danh sách bill",
  );
  // A bill number never matches a free invoice: the group is not asked for then.
  const free = useApiData<EinvoiceListRow[]>(
    billNumber ? null : "/einvoices",
    { branch, free: 1, status, ...days },
    [],
    "Không thể tải hóa đơn không theo bill",
  );
  // The tab counts: pending work of every day, issued ones of the chosen days
  // (summed in SQL, never from a capped list).
  const summary = useApiData<EinvoiceSummary | null>(
    "/einvoices/summary",
    { branch, ...range },
    null,
    "Không thể tải số hóa đơn",
  );
  const reloadBills = bills.reload;
  const reloadFree = free.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (version === 0) return;
    reloadBills();
    reloadFree();
    reloadSummary();
  }, [version, reloadBills, reloadFree, reloadSummary]);

  const freeRows = billNumber ? [] : free.data;
  // Over more than one day a bill shows its date too.
  const showDate = !dated || !!billNumber || range.from !== range.to;
  const emptyText = billNumber
    ? "Không có bill nào khớp số này."
    : tab === "BILLS"
      ? "Không có bill đã thanh toán trong khoảng ngày này."
      : tab === "ISSUED"
        ? "Không có hóa đơn đã xuất trong khoảng ngày này."
        : "Không có hóa đơn nào ở trạng thái này.";

  const createFree = () => {
    // A new draft shows in the Nháp tab and in the Bill tab of its day;
    // from the other tabs the list moves to Nháp.
    if (tab !== "BILLS" && tab !== "DRAFT") setTab("DRAFT");
    onCreate(null, 0);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tabs value={tab} onValueChange={(value) => setTab(value as EinvoiceTab)}>
        {/* The list's own h-9 is set for the horizontal orientation, so the override carries the same variant. */}
        <TabsList className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
          {TABS.map((t) => {
            const count = t.count && summary.data ? summary.data[t.count] : 0;
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {count ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        {dated && !billNumber ? (
          <DateRangePicker value={range} onChange={setRange} />
        ) : (
          <span className="text-sm text-muted-foreground">Mọi ngày</span>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 @md/main:flex-none">
          <Input
            type="search"
            inputMode="numeric"
            placeholder="Tìm số bill…"
            aria-label="Tìm theo số bill"
            maxLength={15}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 @md/main:w-44 @md/main:flex-none"
          />
          {canWrite && (
            <Button
              size="icon"
              variant="outline"
              aria-label="Thêm hóa đơn không theo bill"
              title="Thêm hóa đơn không theo bill"
              disabled={creating === "free"}
              onClick={createFree}
            >
              {creating === "free" ? <Spinner /> : <PlusIcon />}
            </Button>
          )}
        </div>
      </div>
      {freeRows.length > 0 && (
        <section className="rounded-xl border">
          <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-sm">
            <span className="font-medium">Hóa đơn không theo bill</span>
            <span className="tabular-nums text-muted-foreground">{free.total ?? freeRows.length}</span>
          </div>
          <ListLimitNotice shown={freeRows.length} total={free.total} noun="hóa đơn" hint="Chọn khoảng ngày ngắn hơn." />
          <ul>
            {freeRows.map((row) => (
              <EinvoiceRow
                key={row.id}
                einvoice={row}
                label={`HĐ #${row.id}`}
                selected={selectedId === row.id}
                editable
                autoFocus={focusId === row.id}
                forceConfirm={dirtyId === row.id}
                onSelect={() => onSelect(null, row.id)}
                onSaved={onSaved}
                onDeleted={() => onDeleted(null, row.id)}
              />
            ))}
          </ul>
        </section>
      )}
      <ListLimitNotice
        shown={bills.data.length}
        total={bills.total}
        noun="bill"
        hint="Chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
      />
      {/* Skeleton only before the first answer: a reload after a write keeps
          the list, so an open bill and a focused amount box stay put. */}
      {bills.loading && bills.data.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : bills.data.length === 0 ? (
        freeRows.length === 0 && (
          <EmptyState icon={FileCheck2Icon} title="Không có bill" description={emptyText} className="rounded-xl border" />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.data.map((bill) => (
            <BillItem
              key={bill.orderId}
              bill={bill}
              open={openOrderId === bill.orderId}
              detail={openBill?.order.id === bill.orderId ? openBill : null}
              showDate={showDate}
              canWrite={canWrite}
              creating={creating === bill.orderId}
              selectedId={selectedId}
              focusId={focusId}
              dirtyId={dirtyId}
              onToggle={() => onToggleBill(bill.orderId, tab)}
              onCreate={onCreate}
              onSelect={(einvoiceId) => onSelect(bill.orderId, einvoiceId)}
              onSaved={onSaved}
              onDeleted={(einvoiceId) => onDeleted(bill.orderId, einvoiceId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BillItem({
  bill,
  open,
  detail,
  showDate,
  canWrite,
  creating,
  selectedId,
  focusId,
  dirtyId,
  onToggle,
  onCreate,
  onSelect,
  onSaved,
  onDeleted,
}: {
  bill: EinvoiceBill;
  open: boolean;
  detail: EinvoiceBillDetail | null;
  showDate: boolean;
  canWrite: boolean;
  creating: boolean;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  onToggle: () => void;
  onCreate: (orderId: number, amount: number) => void;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
}) {
  const total = Number(bill.finalAmount);
  // The open bill, once loaded, is fresher than the list.
  const allocated = detail ? detail.allocated : bill.allocated;
  const count = detail ? detail.einvoices.length : bill.einvoiceCount;
  const label = billLabel({ id: bill.orderId, billNumber: bill.billNumber });
  return (
    <li className="rounded-xl border">
      <div className="flex items-center gap-2 py-1 pr-2 pl-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted/50"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {label} · {bill.roomName ?? "—"}
            </span>
            <span
              className={cn(
                "block truncate text-xs text-muted-foreground tabular-nums",
                allocated > total && "text-warning",
              )}
            >
              {showDate ? formatDateTime(bill.endTime) : formatTime(bill.endTime)} ·{" "}
              {count ? `Đã chia ${formatMoney(allocated)} · ${count} HĐ` : "Chưa có HĐĐT"}
            </span>
          </span>
          {bill.cancelledAt && <Badge variant="warning">Đã hủy</Badge>}
          <span className="shrink-0 tabular-nums">{formatMoney(bill.finalAmount)}</span>
        </button>
        {canWrite && !bill.cancelledAt && (
          <Button
            size="icon"
            variant="outline"
            aria-label={`Thêm hóa đơn nhỏ cho bill ${label}`}
            title="Thêm hóa đơn nhỏ"
            disabled={creating}
            className={cn(open && "border-primary")}
            onClick={() => onCreate(bill.orderId, Math.max(0, total - allocated))}
          >
            {creating ? <Spinner /> : <PlusIcon />}
          </Button>
        )}
      </div>
      {open &&
        (detail ? (
          <BillSplit
            detail={detail}
            selectedId={selectedId}
            focusId={focusId}
            dirtyId={dirtyId}
            onSelect={onSelect}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <div className="border-t p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
    </li>
  );
}
```

- [ ] **Step 10: Thay toàn bộ `app/[branch]/sales/einvoices/page.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { FileCheck2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { EinvoiceBillList, type Creating, type EinvoiceTab } from "@/components/einvoices/einvoice-bill-list";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { buyerOf, EinvoiceIssuePanel } from "@/components/einvoices/einvoice-issue-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The invoice in the right column; orderId null is a free invoice.
interface Selection {
  orderId: number | null;
  einvoiceId: number;
}

// The invoice a bill opens on: the first of the tab it was opened from, else
// the first not issued, else the first (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
function firstOf(detail: EinvoiceBillDetail, tab: EinvoiceTab): number | null {
  const matches = (e: EinvoiceDetail) =>
    tab === "DRAFT"
      ? e.status === "DRAFT" && !e.lastError
      : tab === "ERROR"
        ? e.status === "DRAFT" && !!e.lastError
        : tab === "UNCERTAIN"
          ? e.status === "UNCERTAIN" || e.status === "SENDING"
          : tab === "ISSUED"
            ? e.status === "ISSUED"
            : false;
  const { einvoices } = detail;
  return (einvoices.find(matches) ?? einvoices.find((e) => e.status !== "ISSUED") ?? einvoices[0])?.id ?? null;
}

export default function EinvoicesPage() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const notify = useNotify();
  const isMobile = useIsMobile();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  // The tab the open bill was opened from: it decides the invoice shown first.
  const [openedFrom, setOpenedFrom] = useState<EinvoiceTab>("BILLS");
  const [selected, setSelected] = useState<Selection | null>(null);
  // Phones show the panel in a Sheet, opened only by tapping an invoice.
  const [sheetOpen, setSheetOpen] = useState(false);
  // A draft just made: the cursor goes to its amount.
  const [focusId, setFocusId] = useState<number | null>(null);
  const [creating, setCreating] = useState<Creating>(null);
  // Bumped after every write so the lists and counts reload.
  const [listVersion, setListVersion] = useState(0);
  // Unsaved edits in the panel. Closing or reloading the tab asks through
  // beforeunload, and every switch inside the page through run(); leaving
  // through the sidebar is not guarded.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // One read of the open bill serves both columns.
  const bill = useApiData<EinvoiceBillDetail | null>(
    openOrderId === null ? null : `/einvoices/bill/${openOrderId}`,
    {},
    null,
    "Không thể tải bill",
  );
  // The answer may still be the previous bill's while the next one loads.
  const billDetail = openOrderId !== null && bill.data?.order.id === openOrderId ? bill.data : null;
  const explicit = selected && (selected.orderId === null || selected.orderId === openOrderId) ? selected : null;
  const firstId = !explicit && billDetail && !bill.loading ? firstOf(billDetail, openedFrom) : null;
  // The first invoice of a bill becomes the pick as soon as it shows, so a
  // reload or a change of status never moves the panel (adjusted during render).
  if (firstId !== null && openOrderId !== null) setSelected({ orderId: openOrderId, einvoiceId: firstId });
  const shown: Selection | null =
    explicit ?? (firstId !== null && openOrderId !== null ? { orderId: openOrderId, einvoiceId: firstId } : null);
  const freeId = shown?.orderId === null ? shown.einvoiceId : null;
  const free = useApiData<EinvoiceDetail | null>(
    freeId === null ? null : `/einvoices/${freeId}`,
    {},
    null,
    "Không thể tải hóa đơn",
  );
  const freeDetail = freeId !== null && free.data?.id === freeId ? free.data : null;

  // Every switch of bill or invoice asks first while the panel holds unsaved edits.
  const run = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };

  // The panel sits beside the list from @4xl/main up and under it below that
  // (the list can be long): there a pick brings the panel into view.
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollToPanel = () => {
    const list = gridRef.current?.firstElementChild;
    const panelBox = panelRef.current;
    if (!list || !panelBox) return;
    const stacked = panelBox.getBoundingClientRect().top > list.getBoundingClientRect().top + 1;
    if (stacked) panelBox.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleBill = (orderId: number, tab: EinvoiceTab) =>
    run(() => {
      setOpenOrderId((current) => (current === orderId ? null : orderId));
      setOpenedFrom(tab);
      setSelected(null);
      setFocusId(null);
    });

  const select = (orderId: number | null, einvoiceId: number) => {
    const open = () => {
      setSelected({ orderId, einvoiceId });
      if (isMobile) setSheetOpen(true);
      else requestAnimationFrame(scrollToPanel);
    };
    if (shown?.einvoiceId === einvoiceId) open();
    else run(open);
  };

  // After any write: the lists, the counts and what is open reload.
  const changed = (row: EinvoiceDetail) => {
    setListVersion((v) => v + 1);
    if (row.orderId === null) {
      if (row.id === freeId) free.reload();
    } else if (row.orderId === openOrderId) bill.reload();
  };
  const panelChanged = (row: EinvoiceDetail) => {
    changed(row);
    // Issuing moves the lower bound of the next invoice date.
    config.reload();
  };

  // + makes a draft at once, many in a row if wanted (spec §5.2). The panel
  // follows it unless it holds unsaved edits; + on a bill other than the open
  // one is a switch of bill, so that one asks first.
  const create = (orderId: number | null, amount: number) => {
    const switching = orderId !== null && orderId !== openOrderId;
    const go = async () => {
      setCreating(orderId ?? "free");
      try {
        const res = await api.post<EinvoiceDetail>(
          "/einvoices",
          { ...(orderId === null ? {} : { orderId }), amount, lines: [] },
          { params: { branch } },
        );
        const row = res.data;
        setListVersion((v) => v + 1);
        setFocusId(row.id);
        if (orderId !== null) {
          if (orderId === openOrderId) bill.reload();
          else {
            setOpenOrderId(orderId);
            setOpenedFrom("BILLS");
          }
        }
        if (!dirty || switching) setSelected({ orderId, einvoiceId: row.id });
      } catch (error) {
        notify.error(error, "Không tạo được hóa đơn");
      } finally {
        setCreating(null);
      }
    };
    if (switching) run(() => void go());
    else void go();
  };

  const deleted = (orderId: number | null, einvoiceId: number) => {
    setListVersion((v) => v + 1);
    if (shown?.einvoiceId === einvoiceId) {
      // The edits of a deleted invoice go with it (its delete asked first).
      setDirty(false);
      const siblings = orderId !== null ? (billDetail?.einvoices ?? []) : [];
      const index = siblings.findIndex((e) => e.id === einvoiceId);
      const next = siblings[index + 1] ?? siblings[index - 1];
      setSelected(next ? { orderId, einvoiceId: next.id } : null);
      if (!next) setSheetOpen(false);
    }
    if (orderId !== null) bill.reload();
  };

  const panelEinvoice =
    shown === null
      ? null
      : shown.orderId === null
        ? freeDetail
        : (billDetail?.einvoices.find((e) => e.id === shown.einvoiceId) ?? null);
  const index =
    shown !== null && shown.orderId !== null && billDetail
      ? billDetail.einvoices.findIndex((e) => e.id === shown.einvoiceId)
      : -1;
  const panelBusy = bill.loading || free.loading;
  const panel =
    shown === null ? null : panelEinvoice ? (
      <EinvoiceIssuePanel
        key={panelEinvoice.id}
        einvoice={panelEinvoice}
        bill={shown.orderId === null ? null : (billDetail?.order ?? null)}
        label={shown.orderId === null ? `HĐ tự do #${panelEinvoice.id}` : `HĐ ${index + 1}`}
        previous={index > 0 && billDetail ? buyerOf(billDetail.einvoices[index - 1]) : null}
        config={config.data}
        busy={panelBusy}
        onChanged={panelChanged}
        onReload={() => (shown.orderId === null ? free.reload() : bill.reload())}
        onDirtyChange={setDirty}
      />
    ) : panelBusy ? (
      <Skeleton className="h-96 w-full rounded-xl" />
    ) : (
      <EmptyState
        icon={FileCheck2Icon}
        title="Hóa đơn không còn"
        description="Chọn một hóa đơn khác."
        className="rounded-xl border"
      />
    );
  const emptyBill = billDetail !== null && billDetail.einvoices.length === 0;
  const emptyPanel = (
    <EmptyState
      icon={FileCheck2Icon}
      title={emptyBill ? "Bill chưa có hóa đơn nhỏ" : "Chọn một hóa đơn"}
      description={
        !can(user, "einvoices.write")
          ? "Mở một bill ở cột trái."
          : emptyBill
            ? "Bấm + trên dòng bill để thêm hóa đơn nhỏ."
            : "Mở một bill ở cột trái, hoặc bấm + cạnh ô tìm để tạo hóa đơn không theo bill."
      }
      className="rounded-xl border"
    />
  );

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description="Chia bill đã thanh toán thành các hóa đơn nhỏ ở cột trái, điền và xuất lên Minvoice ở cột phải."
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <div ref={gridRef} className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EinvoiceBillList
            version={listVersion}
            openOrderId={openOrderId}
            openBill={billDetail}
            selectedId={shown?.einvoiceId ?? null}
            focusId={focusId}
            dirtyId={dirty ? (shown?.einvoiceId ?? null) : null}
            creating={creating}
            onToggleBill={toggleBill}
            onSelect={select}
            onCreate={create}
            onSaved={changed}
            onDeleted={deleted}
          />
          {!isMobile && (
            <div ref={panelRef} className="min-w-0 scroll-mt-[calc(var(--header-height)+1rem)]">
              {panel ?? emptyPanel}
            </div>
          )}
        </div>
      </div>
      {isMobile && (
        <Sheet open={sheetOpen && panel !== null} onOpenChange={(value) => !value && run(() => setSheetOpen(false))}>
          {/* The panel scrolls under a fixed title row, which keeps the close
              button clear of the panel's header. */}
          <SheetContent side="bottom" className="h-[100dvh] gap-0 p-0">
            <SheetHeader className="border-b py-3 pr-12">
              <SheetTitle>Xuất hóa đơn điện tử</SheetTitle>
              <SheetDescription className="sr-only">Ngày, người mua, dòng hàng và xuất hóa đơn đang chọn</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          setDirty(false);
          pending?.();
          setPending(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 11: Xóa các file cũ**

```bash
git rm 502-frontend/src/components/einvoices/einvoice-list.tsx 502-frontend/src/components/einvoices/bill-picker-dialog.tsx 502-frontend/src/components/einvoices/bill-einvoices-panel.tsx
grep -rn "einvoice-list\|bill-picker-dialog\|bill-einvoices-panel\|BillPickerDialog\|BillEinvoicesPanel" 502-frontend/src
```

Expected: `grep` không in gì.

- [ ] **Step 12: Biên dịch, lint, build**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run build`
Expected: không lỗi.
- Nếu lint báo `setState` trong lúc render ở `page.tsx` (`setSelected` khi `firstId`) hoặc ở `einvoice-row.tsx` (`setShown`): đây là mẫu "adjusting state during render" có sẵn trong `number-input.tsx` (`DecimalInput`), nên dùng cùng cách tắt cảnh báo như ở đó, nếu ở đó có.
- Không được chuyển sang `useEffect`.

- [ ] **Step 13: Chạy thử trên trình duyệt với Minvoice giả**

1. Trong `.claude/launch.json` (file cục bộ, không commit):
   - cấu hình `backend-preview`: thêm `MINVOICE_URL_TEMPLATE=http://127.0.0.1:4555/{taxCode}` vào trước `node -r ts-node/register src/main.ts`;
   - thêm cấu hình:

   ```json
   {
     "name": "fake-minvoice",
     "runtimeExecutable": "sh",
     "runtimeArgs": ["-c", "cd 502-backend && npx ts-node test/fake-minvoice.ts 4555"],
     "port": 4555
   }
   ```

2. Seed DB test: `cd 502-backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/karaoke_test npx prisma migrate reset --force` (gồm seed).
3. Mở `fake-minvoice`, `backend-preview`, `frontend-preview` bằng `preview_start`. Đọc mật khẩu Minvoice giả trong log của `fake-minvoice` (`preview_logs`).
4. Đăng nhập `admin` / `12345678` (tài khoản seed của app chạy local).
   - Ở **Quản trị → Cơ sở**, đặt MST `0107811836` cho cơ sở 5.
   - Ở `/cs5/sales/einvoices`, đăng nhập Minvoice bằng `admin` và mật khẩu giả vừa đọc, rồi chọn ký hiệu.
5. Ở `/cs5/sales/rooms`, mở một phòng, gọi vài món, thanh toán. Làm hai bill.
6. Kiểm tra ở `/cs5/sales/einvoices`, desktop (rộng mặc định):
   - Tab Bill hiện hai bill. Bấm + trên bill thứ nhất ba lần liền:
     - nháp HĐ 1 mang phần còn lại, HĐ 2 và HĐ 3 mang 0;
     - con trỏ ở ô số tiền của dòng mới;
     - panel phải hiện hóa đơn mới.
   - Xóa HĐ 3 bằng thùng rác: không có hộp xác nhận (nháp trống).
   - Panel phải của HĐ 1:
     - ngày hóa đơn là ngày thanh toán bill;
     - không có ô chọn thuế suất; cột "Thành tiền trước VAT" có hiện;
     - gõ tên người mua (chưa lưu). Sửa số tiền HĐ 1 ở cột trái rồi bấm Enter: tên vừa gõ bên phải **vẫn còn**, và "Còn thiếu" đổi theo.
   - Ngày hóa đơn: **trước khi xuất hóa đơn nào**, làm sẵn ba nháp ở bill thứ hai, mỗi nháp có số tiền và dòng bù. Đổi ngày cả ba sang **hôm qua** rồi Lưu nháp. DB vừa reset, chưa có hóa đơn nào được xuất, nên ô ngày cho chọn hôm qua. Rồi xuất lần lượt:
     - nháp 1: Xuất hỏi "Đổi ngày hóa đơn về hôm nay?". **Giữ** xuất với ngày hôm qua.
     - nháp 2: **Đổi về hôm nay**. Hóa đơn mang ngày hôm nay, giới hạn thành hôm nay.
     - nháp 3: ô ngày hiện cảnh báo vàng "Ngày hóa đơn phải từ … trở đi" nhưng nút Xuất vẫn bấm được. Câu hỏi có nút Giữ bị tắt kèm lý do. **Hủy bỏ** thì không gửi gì. **Đổi về hôm nay** thì xuất.
   - Sau đó, HĐ 1 của bill thứ nhất (ngày mặc định là hôm nay): Lấy món từ bill, Thêm dòng bù, Lưu nháp, Xuất. Hóa đơn được gửi luôn, không hỏi, thành `Đã xuất`, có số.
   - Bấm + cạnh ô tìm: nhóm "Hóa đơn không theo bill" hiện "HĐ #…". Nhập số tiền, điền dòng bù, Lưu nháp, Xuất.
   - Các tab Nháp, Lỗi, Không rõ, Đã xuất đổi danh sách bill và số đếm. Mở bill từ tab Đã xuất thì panel chọn sẵn hóa đơn đã xuất.
   - Đang có thay đổi chưa lưu mà bấm sang bill khác: hỏi "Bỏ thay đổi chưa lưu?".
7. Chạy `resize_window` preset `mobile` (375px), tải lại trang:
   - không cuộn ngang;
   - bấm + thêm nháp không mở Sheet; chạm vào dòng HĐ thì mở Sheet toàn màn hình;
   - đóng Sheet khi có thay đổi chưa lưu thì hỏi.
8. Chạy `resize_window` với `colorScheme: "dark"` và xem lại một lượt. Sau đó đặt lại preset `desktop`.
9. `read_console_messages` với `onlyErrors: true`: không có lỗi.
10. Chụp màn hình desktop và điện thoại làm bằng chứng.

- [ ] **Step 14: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(web): trang hóa đơn điện tử hai cột — bill bên trái, panel xuất bên phải

Thêm/xóa nháp tức thì, hóa đơn không theo bill, ngày hóa đơn trong panel.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tài liệu

Spec §8.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `DEPLOYMENT.md` (thêm §6.19)

- [ ] **Step 1: `CLAUDE.md` — dòng migration**

Thay `` `20261003000000_einvoices` adds `Branch.taxCode`, `EinvoiceConfig` and `Einvoice` with the `EinvoiceStatus` enum and their indexes (§6.18) `` bằng:

```markdown
`20261003000000_einvoices` adds `Branch.taxCode`, `EinvoiceConfig` and `Einvoice` with the `EinvoiceStatus` enum and their indexes (§6.18); `20261004000000_free_einvoices` lets `Einvoice.orderId` be null (free invoices, §6.19)
```

- [ ] **Step 2: `CLAUDE.md` — phần E-invoices của backend**

Thay từng đoạn sau, đúng nguyên văn:

1. `a paid bill is split into **small invoices** (`Einvoice`; each belongs to exactly one bill, its amount is typed by the user and includes VAT)` →

```markdown
a paid bill is split into **small invoices** (`Einvoice`; each belongs to one bill, or to none for a **free invoice** (`orderId` null: `POST /einvoices?branch=` without `orderId`, on the business day it is made; spec `docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`); its amount is typed by the user, includes VAT, and may be 0 on a draft while issuing needs ≥ 1)
```

2. Ngay sau đoạn `` `draft` (JSON `{buyerAddress, buyerEmail, lines[]}`, at most 50 lines, always read back through `parseDraft`) is **set to null in the same write that makes it `ISSUED`**, which keeps only the header (bill, symbol, date, number, `minvoiceId`, amount, VAT, buyer MST and name, who and when); ``, chèn:

```markdown
a draft keeps its own **invoice date** in `invoiceDate` (the calendar day in server time, never the business day: by default the day its bill was paid, `toDateString(endTime)`, or today for a free invoice; `PATCH` changes it only when one is sent), and a send that ends as a `DRAFT`, like `resolve {found: false}`, keeps it;
```

3. `the bill is not voided, the config is complete` → `the bill (if any) is not voided, the config is complete`.
4. `` `DRAFT` with `lastError` — the four header fields cleared —, or `UNCERTAIN` `` → `` `DRAFT` with `lastError` — the seller, symbol and range cleared, the date kept —, or `UNCERTAIN` ``.
5. `` Lists: `GET /einvoices` (newest 500, `X-Total-Count`; `DRAFT`/`ERROR`/`UNCERTAIN` ignore `from`/`to`, since they are work still to do) `` →

```markdown
Lists: `GET /einvoices` (newest 500, `X-Total-Count`; `DRAFT`/`ERROR`/`UNCERTAIN` ignore `from`/`to`, since they are work still to do; `free=1` keeps the free invoices only)
```

6. `` `GET /einvoices/bills` (the picker: paid bills of a business day or a bill-number prefix with what is already split, `allocated`, 500, `X-Total-Count`) `` →

```markdown
`GET /einvoices/bills` (the left column: the paid bills of a range of business days `from`/`to`, default today, or of a bill-number prefix; with `status` the bills holding an invoice of that status, every day for `DRAFT`/`ERROR`/`UNCERTAIN` and voided bills included, by the invoice's day for `ISSUED`; each with what is already split, `allocated`, and `cancelledAt`; 500, `X-Total-Count`)
```

- [ ] **Step 3: `CLAUDE.md` — phần Hóa đơn điện tử của frontend**

Thay cả gạch đầu dòng bắt đầu bằng `- **Hóa đơn điện tử** (\`/[branch]/sales/einvoices\`` và kết thúc bằng `The page does no polling: it reloads after each write.` bằng:

```markdown
- **Hóa đơn điện tử** (`/[branch]/sales/einvoices`, `components/einvoices/*`, sidebar item under Bán hàng right after Quản lý bán hàng, `layout.tsx` for the tab title; permissions `einvoices.view` (readers), `einvoices.write` (managers, cashier), `einvoices.issue` and `einvoices.config` (chain manager); spec `docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`). On top, the Minvoice card (`einvoice-config-card.tsx`): the chain manager sees `MST <Branch.taxCode>`, the username, a password box that is never filled in (`autoComplete="new-password"`), **Đăng nhập** and the dropdown of the year's symbols (loaded after the login; choosing one calls `PUT symbol`), and only the seller's **company name** is shown; a changed MST or a `loginError` asks to log in again, a branch without an MST links to the Cơ sở page, everyone else sees one status line. **Left column** (`einvoice-bill-list.tsx`): `Tabs` **Bill** | Nháp | Lỗi | Không rõ | Đã xuất (counts of `GET /einvoices/summary`) filter the **bills** of `GET /einvoices/bills`: Bill = the paid bills of a `DateRangePicker` range of business days (default `businessDate()`), Đã xuất = the bills with an invoice issued in that range, Nháp/Lỗi/Không rõ = the bills holding such an invoice on any day (the picker is off; voided bills included, badge Đã hủy); a bill-number search works in every tab; `ListLimitNotice` at 500. Next to the search an icon **+** (`einvoices.write`) creates a **free invoice** at once; the free invoices of the tab and range (`GET /einvoices?free=1`) sit on top under "Hóa đơn không theo bill" (hidden while a bill number is searched). Each bill row has its own icon **+** (not on a voided bill) that creates a draft at once with what is left of the bill (0 when nothing is), so several can be added in a row; clicking a bill opens it in place (`bill-split.tsx`: VAT, discounts, đã chia, còn lại / vượt, warnings for a voided bill or one edited after its invoices, then **HĐ n** by `id`). Every invoice row (`einvoice-row.tsx`, of a bill or free) has its **amount** box (drafts only; saved on Enter or blur through `PATCH` with the saved buyer and lines — a free row reads `GET /einvoices/:id` first, as the list leaves the draft out), its status badge, the buyer, and a bin that deletes a draft (at once when it is empty — amount 0, no buyer, no line, `isEmptyDraft` — otherwise after a confirm). **Right column** (a full-screen `Sheet` on a phone, opened only by tapping an invoice), `einvoice-issue-panel.tsx`: "HĐ n · Bill … · phòng" or "HĐ tự do #id", the status, the amount (read only), then by status: `einvoice-editor.tsx` for a draft (**Ngày hóa đơn**, a `DatePicker` with `min` = `minInvoiceDate` and `today` = the calendar day (`toDateInput()`), saved with the draft, `defaultInvoiceDate` showing the day the bill was paid for an older draft without one; `buyer-fields.tsx` with **Tra** and, for a bill's invoice, **Chép từ HĐ trước**, which copies MST and name as a pair; `einvoice-lines.tsx`: Tên, ĐVT, SL, Đơn giá trước VAT, **Thành tiền trước VAT**, no rate to choose since every new line is `EINVOICE_VAT_RATE` (10%) and an older line of another rate shows "VAT x%", **Lấy món từ bill** for a bill's invoice and **Thêm dòng bù phần còn thiếu**; totals with Còn thiếu / Thừa; **Lưu nháp**; `invoiceDateProblem` warns, under the date and without blocking anything, of a date before `minInvoiceDate` or outside the symbol's year; `issue-controls.tsx` with **Xuất**, which sends a draft dated today at once and otherwise first asks "Đổi ngày hóa đơn về hôm nay?" — Hủy bỏ / **Giữ <ngày>** / **Đổi về hôm nay**, keeping a later date being the `confirmFutureDate` (there is no other confirm), an answer whose date `invoiceDateProblem` refuses disabled with the reason, and the date sent written into the invoice by the issue itself), `uncertain-box.tsx` for `UNCERTAIN` ("Lần gửi lúc …" from `sendingAt`, **Kiểm tra lại**, **Đã có — nhập số**, **Chưa có — gửi lại**, the last one disabled until 3 min after the send, `STALE_SENDING_MS` in `lib/einvoice.ts`), `issued-view.tsx` for `ISSUED` (read only; the chain manager edits the number in `edit-number-dialog.tsx`), a manual Tải lại for `SENDING`. The page owns the selection: it reads `GET /einvoices/bill/:orderId` of the open bill once for both columns (`useApiData` with a null url fetches nothing) and `GET /einvoices/:id` of a chosen free invoice; opening a bill picks the first invoice of the tab it was opened from, else the first not issued, and that pick then stays through reloads. The editor is keyed by the invoice and its saved date, buyer and lines (not `updatedAt`), so an amount typed in the left column never resets unsaved edits on the right while a save remounts it clean; every switch of bill or invoice asks "Bỏ thay đổi chưa lưu?" (`run()` in the page), as does `beforeunload`; a new draft is shown on the right only when the panel holds no unsaved edits. Any error but a 400 from issuing or **Kiểm tra lại** reloads and warns that the result is unknown, since Minvoice may have created the invoice. `lib/einvoice.ts` is the copy of `einvoice-math.ts`; `DatePicker` got `min` and `today` props; the Cơ sở page has an optional **Mã số thuế** box (send `null` to clear it); the bill sheet's cancel and correct dialogs warn "Bill có N hóa đơn điện tử" (never block). The page does no polling: it reloads after each write.
```

- [ ] **Step 4: `DEPLOYMENT.md` §6.19**

Thêm ngay trước dòng `## 7. Xử lý sự cố`:

```markdown
### 6.19. Hóa đơn điện tử: bố cục hai cột, hóa đơn không theo bill (migration `20261004000000_free_einvoices`)

- **Migration** tự chạy khi backend khởi động: cột `Einvoice.orderId` được để trống, để có hóa đơn không theo bill. Không đụng dữ liệu cũ, chạy trong tích tắc. Không đổi `.env` hay `docker-compose.yml`.
- **Trang Hóa đơn điện tử** đổi bố cục:
  - Cột trái là danh sách bill. Bấm **+** trên một bill là có ngay một hóa đơn nhỏ, bấm nhiều lần thì có nhiều. Số tiền nhập ngay trên dòng hóa đơn. Nháp xóa bằng thùng rác.
  - **+** cạnh ô tìm số bill tạo hóa đơn không theo bill.
  - Cột phải để điền ngày hóa đơn, người mua, dòng hàng và xuất.
  - Mọi dòng hàng mới có VAT 10%.
- **Ngày hóa đơn** giờ lưu cùng nháp. Mặc định là ngày (theo lịch, không phải ngày kinh doanh) bill được thanh toán.
  - Nháp tạo trước bản cập nhật chưa có ngày: trang hiện ngày thanh toán bill và ghi lại khi lưu nháp.
  - Bấm **Xuất** khi ngày hóa đơn khác hôm nay thì trang hỏi có đổi về hôm nay không (**Giữ** ngày cũ hoặc **Đổi về hôm nay**).
  - Một lần xuất bị Minvoice từ chối thì nháp giữ ngày đã chọn.
```

- [ ] **Step 5: Kiểm tra không còn chỗ nhắc giao diện cũ**

Run: `grep -rn "Tạo HĐĐT mới\|bill-picker-dialog\|bill-einvoices-panel\|einvoice-list.tsx" CLAUDE.md DEPLOYMENT.md README.md 502-frontend/README.md 502-backend/README.md docs/*.md`
Expected: không in gì. Nếu còn, sửa theo giao diện mới.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md DEPLOYMENT.md
git commit -m "docs: hóa đơn điện tử hai cột, hóa đơn không theo bill, ngày theo nháp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Kiểm tra cuối (tài nguyên, toàn bộ test)

Spec §6, §7.

**Files:** không sửa file nào, trừ khi các bước dưới đây tìm ra lỗi.

- [ ] **Step 1: Truy vấn có đường đi qua index**

Sau khi e2e của Task 4 chạy xong, DB test vẫn còn dữ liệu. Chạy:

```bash
docker exec kara502-pg psql -U postgres -d karaoke_test -c "SET enable_seqscan = off; EXPLAIN SELECT o.id FROM \"Order\" o WHERE o.\"branchId\" = 1 AND o.id IN (SELECT e.\"orderId\" FROM \"Einvoice\" e WHERE e.\"branchId\" = 1 AND e.status IN ('SENDING','UNCERTAIN') AND e.\"orderId\" IS NOT NULL) ORDER BY o.\"endTime\" DESC LIMIT 500;"
docker exec kara502-pg psql -U postgres -d karaoke_test -c "SET enable_seqscan = off; EXPLAIN SELECT id FROM \"Einvoice\" WHERE \"branchId\" = 1 AND \"orderId\" IS NULL AND \"businessDate\" BETWEEN '2026-09-01' AND '2026-09-30' ORDER BY \"businessDate\" DESC LIMIT 500;"
```

Expected:
- Lệnh thứ nhất có `Index Scan` hoặc `Bitmap Index Scan` trên `Einvoice_branchId_status_createdAt_idx`, và trên khóa chính hoặc index của `Order`.
- Lệnh thứ hai dùng `Einvoice_branchId_businessDate_idx`.

Bảng test nhỏ nên `enable_seqscan = off` chỉ kiểm tra rằng có đường đi qua index.

- [ ] **Step 2: Checklist `docs/resource-rules.md` §5**

Đi qua từng dòng và ghi kết quả vào mô tả PR:
- Truy vấn mới có `take` 500 và `select` (`/bills`, `?free=1`). Màn hình có `ListLimitNotice` (bill và nhóm tự do).
- Không cộng từ danh sách có trần: "đã chia" là `groupBy`, số đếm lấy từ `summary`.
- Không đụng luồng bán hàng. Không có báo cáo mới. Không có `Map`/cache mới. Không có polling (trang chỉ tải lại sau mỗi lần ghi). Không có thư viện mới.
- Không cần chạy lại `test/load`: không đổi luồng bán hàng, pool kết nối hay cấu hình database.

- [ ] **Step 3: Toàn bộ test và build**

Run:

```bash
cd 502-backend && npm run lint && npm test && npm run build
npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand
npx jest --config ./test/jest-e2e.json test/foundation.e2e-spec.ts --runInBand
cd ../502-frontend && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run build
```

Expected: mọi lệnh đều PASS. `npm run lint` của backend có `--fix`: nếu nó sửa file thì commit phần sửa với message `style: lint`.

- [ ] **Step 4: Kết thúc nhánh**

Dùng skill `superpowers:finishing-a-development-branch` để chọn cách đưa nhánh `feat/einvoice-layout` vào `main` (PR hay merge). Hỏi người dùng trước khi push hoặc mở PR.
