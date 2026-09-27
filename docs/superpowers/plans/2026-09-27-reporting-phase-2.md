# Báo cáo — Giai đoạn 2: Nhân viên, Phòng, Hàng hóa, Khung giờ, So sánh cơ sở — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm năm báo cáo mới cho quản lý, mỗi báo cáo có trang riêng, toolbar và nút xuất Excel:
- `/reports/staff`: theo CSKH / phục vụ / thu ngân;
- `/reports/rooms`: theo phòng hoặc loại phòng, có công suất;
- `/reports/products`: theo món hoặc danh mục, giảm giá được phân bổ;
- `/reports/hours`: biểu đồ nhiệt thứ × giờ;
- `/reports/branches`: so sánh cơ sở, chỉ quản lý hệ thống.

Tổng của mọi báo cáo phải khớp với báo cáo Doanh thu cùng kỳ.

**Architecture:**
- **SQL.** Mỗi báo cáo là một câu `$queryRaw` gộp hóa đơn đã thanh toán (theo `endTime`) theo một chiều: người, phòng, sản phẩm, (thứ, giờ), hoặc (ngày, cơ sở).
- **TypeScript.** Phần gộp nhóm, làm tròn và sắp xếp nằm trong các hàm thuần của `breakdowns.ts`, có unit test. Tên người, phòng và món được nạp bằng Prisma.
- **Revenue và branches.** Báo cáo Doanh thu và So sánh cơ sở dùng chung **một** truy vấn (ngày × cơ sở), nên tổng, kỳ và cơ sở luôn khớp nhau.
- **Frontend.** Mỗi báo cáo có một trang client, dùng lại toolbar, bộ lọc trên URL và bộ xuất Excel của giai đoạn 1. Có thêm hai thành phần mới: biểu đồ xếp hạng và heatmap.

**Tech Stack:** NestJS 11, Prisma 5.22 (`$queryRaw`, `Prisma.sql`), PostgreSQL, Jest + supertest; Next.js 16 App Router, React 19, shadcn/ui, recharts, SheetJS (`xlsx`, đã có sẵn).

**Spec:** `docs/superpowers/specs/2026-09-27-reporting-design.md`. Kế hoạch này làm mục 6 của spec, dựa trên mục 3, 4 và 8–9.

## Global Constraints

**Ngôn ngữ**
- Mọi chữ hiển thị và thông báo lỗi bằng **tiếng Việt**.
- Comment trong code bằng tiếng Anh, theo đúng giọng văn hiện có.

**Định nghĩa số liệu**
- "Doanh thu" = **chưa VAT** = Σ(`finalAmount` − `taxAmount`); "VAT" = Σ `taxAmount`; "Tổng thu" = Σ `finalAmount`.
- Chỉ tính hóa đơn `status = COMPLETED`, lọc và gộp theo **`endTime`**. Không bao giờ dùng `Order.businessDate`: sửa hóa đơn đã thanh toán có thể dời `endTime` sang ngày khác, còn `businessDate` gắn với số hóa đơn.
- Ngày kinh doanh D = [D 06:00, D+1 06:00) theo giờ server (`src/common/dates.ts`).

**Bất biến** (các bài e2e kiểm tra), với cùng phạm vi và cùng khoảng ngày:
- Tổng theo nhân viên (có dòng "Chưa gán"), theo phòng (có dòng "Không phòng"), theo khung giờ và theo cơ sở đều bằng `totals` của `GET /reports/revenue`.
- Theo hàng hóa: doanh thu thuần của hàng + (tiền giờ − giảm tiền giờ) + phí DV = doanh thu.

**Phạm vi và phân quyền**
- Khoảng báo cáo tối đa **1830 ngày** (`MAX_REPORT_RANGE_DAYS`).
- Phạm vi cơ sở đi qua `BranchScopeService.resolveOptionalBranchId`: quản lý hệ thống không truyền `branch` là xem toàn chuỗi; mọi tài khoản khác luôn bị ghim vào cơ sở của mình, truyền mã khác → 403.
- Báo cáo chỉ cho `MANAGERS`. `/reports/branches` chỉ cho `CHAIN_MANAGER`, còn lại 403.

**SQL**
- Luôn có tham số (tagged template `Prisma.sql`), không nối chuỗi từ dữ liệu người dùng. Tên cột động chỉ lấy từ một bảng hằng số (`Prisma.raw` trên chuỗi cố định).
- Truy vấn nối `OrderItem` **không được** dùng `REVENUE_COLUMNS`, vì mỗi hóa đơn sẽ bị nhân lên theo số dòng hàng.
- `GROUP BY` luôn dùng vị trí cột (`GROUP BY 1, 2`), vì các biểu thức ngày giờ có tham số múi giờ.

**Frontend**
- Bố cục theo container query `@container/main`; cột phụ ẩn bằng `SHOW_FROM`. Ở 360–390px không trang nào được cuộn ngang.
- Không thêm thư viện mới.
- Không có test frontend. Kiểm tra bằng `npm run lint` và `npm run build`, rồi xem thủ công.

**Git**
- Commit message theo kiểu repo (`feat(backend): …`, tiếng Việt) và kết thúc bằng:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX
  ```
- Không force-push, không merge.

**Lệnh chạy từ gốc repo**
- Backend: `npm --prefix 502-backend test` (unit) hoặc `npm --prefix 502-backend run test:e2e`. E2E cần Postgres test ở cổng 5433 (container `kara502-pg`, xem `502-backend/test/e2e.env`) và dùng các tài khoản seed `admin`, `ql1_cs1`, `tn1_cs1`, `cskh1_cs1`, `pv1_cs1`, `ql1_cs2`, `tn1_cs2`, mật khẩu `12345678`.
- Frontend: `npm --prefix 502-frontend run lint` và `npm --prefix 502-frontend run build`.

---

## File Structure

**Backend — tạo mới**

| File | Trách nhiệm |
|---|---|
| `502-backend/src/reports/breakdowns.ts` | Hàm thuần: `roundToTotal`, `occupancy`, `rank`, `hourGrid`, type `HourCell` |
| `502-backend/src/reports/breakdowns.spec.ts` | Unit test của các hàm trên |
| `502-backend/src/reports/report-scope.ts` | `reportScope()`: xác định cơ sở và kiểm tra khoảng ngày (dùng chung) |
| `502-backend/src/reports/breakdown-reports.service.ts` | `BreakdownReportsService`: `staff`, `rooms`, `products`, `hours` |
| `502-backend/prisma/migrations/20260927180000_report_indexes/migration.sql` | Index `Order(status, endTime)` và `OrderItem(orderId)` |

**Backend — sửa**

| File | Thay đổi |
|---|---|
| `src/common/dates.ts` | `VENUE_OPEN_MINUTES = 1110` |
| `src/reports/report-sql.ts` | `localTimeSql`, `businessWeekdaySql`, `localHourSql`; `businessDateSql` dựa trên `localTimeSql` |
| `src/reports/dto/report-query.ts` | `ReportRangeQuery`; `ReportQuery extends ReportRangeQuery`; `StaffReportQuery`, `RoomReportQuery`, `ProductReportQuery` |
| `src/reports/reports.service.ts` | Một truy vấn ngày × cơ sở dùng chung; `branches()` |
| `src/reports/reports.controller.ts`, `reports.module.ts` | Các route mới |
| `prisma/schema.prisma` | `@@index([status, endTime])` cho `Order`, `@@index([orderId])` cho `OrderItem` |
| `test/reports.e2e-spec.ts` | E2E cho các báo cáo mới |

**Frontend — tạo mới**

| File | Trách nhiệm |
|---|---|
| `502-frontend/src/lib/report-columns.ts` | `METRIC_COLUMNS`: các cột Excel của chỉ số doanh thu (dùng chung) |
| `502-frontend/src/components/reports/ranking-chart.tsx` | Biểu đồ cột ngang top N |
| `502-frontend/src/components/reports/heatmap.tsx` | Lưới 7 × 24 thứ × giờ |
| `502-frontend/src/app/[branch]/reports/{staff,rooms,products,hours,branches}/{layout,page}.tsx` | Các trang báo cáo |

**Frontend — sửa**

| File | Thay đổi |
|---|---|
| `src/lib/types.ts` | Kiểu dữ liệu của các báo cáo mới |
| `src/lib/labels.ts` | `STAFF_ROLE_LABELS`, `ROOM_TYPE_LABELS`, `roomTypeLabel`, `WEEKDAY_LABELS`, `UNASSIGNED_STAFF`, `NO_ROOM`, `NO_CATEGORY` |
| `src/lib/reports.ts` | `STAFF_ROLES`, `ROOM_GROUPS`, `PRODUCT_GROUPS`, `HOUR_METRICS`, `tickLabel` |
| `src/lib/format.ts` | `formatPercent`, `formatCompact` |
| `src/hooks/use-report-filters.ts` | `setFilters` giữ các tham số khác trên URL; `useReportOption`, `rangeParams`, `useReportScope` |
| `src/components/reports/report-toolbar.tsx` | Prop `periods` và `scope` để ẩn các điều khiển không dùng |
| `src/app/[branch]/reports/revenue/page.tsx` | Dùng `METRIC_COLUMNS`, `tickLabel`, `useReportScope` |
| `src/lib/navigation.ts` | Năm mục mới trong nhóm "Báo cáo" |

**Tài liệu:** `CLAUDE.md`, `README.md` (nếu có liệt kê tính năng), `DEPLOYMENT.md` §6.9.

---

## Rulings (quyết định khi spec chưa nói rõ)

- **`/reports/hours` bỏ tham số `?metric`.** API trả về cả số lượt và doanh thu của từng ô; trang tự chuyển giữa hai chỉ số (lưu trên URL `?metric=`) mà không phải gọi lại API.
- **Giảm giá phân bổ được làm tròn tới đồng** bằng phương pháp phần dư lớn nhất (`roundToTotal`). Nhờ vậy các dòng cộng lại đúng bằng Σ `discountAmount`, và bất biến giữ chính xác.
- **Báo cáo không theo thời gian** (nhân viên, phòng, hàng hóa, khung giờ) không có kỳ gộp và không so kỳ trước. Toolbar ẩn hai điều khiển này, và API bỏ qua `groupBy`/`compare` (ValidationPipe `whitelist` tự loại bỏ chúng).
- **Báo cáo phòng liệt kê mọi phòng** trong phạm vi, kể cả phòng chưa có hóa đơn (công suất 0), để thấy phòng bỏ trống. Công suất theo loại phòng = phút / (số ngày × 1110 × số phòng của loại đó). Báo cáo nhân viên và hàng hóa chỉ liệt kê người và món có phát sinh.
- **Dòng không có đối tượng** ("Chưa gán", "Không phòng", "Không danh mục") được backend trả về với `id: null, name: null`; frontend đặt nhãn. Dòng này luôn nằm cuối.
- **`/reports/branches` bỏ qua `branch`**: báo cáo này luôn là toàn chuỗi.

---

### Task 1: Hàm thuần cho báo cáo phân tích + mảnh SQL giờ địa phương

**Files:**
- Create: `502-backend/src/reports/breakdowns.ts`
- Create: `502-backend/src/reports/breakdowns.spec.ts`
- Modify: `502-backend/src/common/dates.ts` (thêm hằng số sau `MAX_REPORT_RANGE_DAYS`)
- Modify: `502-backend/src/reports/report-sql.ts`

**Interfaces:**
- Produces:
  - `roundToTotal(values: number[], total: number): number[]`
  - `occupancy(roomMinutes: number, days: number, rooms: number): number | null`
  - `rank<T extends { id: unknown; name: string | null }>(rows: T[], value: (row: T) => number): T[]`
  - `interface HourCell { weekday: number; hour: number; sessions: number; revenue: number }`
  - `hourGrid(rows: HourCell[]): HourCell[]`
  - `VENUE_OPEN_MINUTES` (dates.ts)
  - `localTimeSql(column: Prisma.Sql): Prisma.Sql`, `businessWeekdaySql(column: Prisma.Sql): Prisma.Sql`, `localHourSql(column: Prisma.Sql): Prisma.Sql` (report-sql.ts)

- [ ] **Step 1: Viết test thất bại** — `502-backend/src/reports/breakdowns.spec.ts`

```ts
import { hourGrid, occupancy, rank, roundToTotal } from './breakdowns';

describe('roundToTotal', () => {
  it('rounds shares of a whole sum so that they still add up to it', () => {
    // 7 đồng over 50,000 + 10,000: 5.83 + 1.17 → 6 + 1.
    expect(roundToTotal([(50000 * 7) / 60000, (10000 * 7) / 60000], 7)).toEqual([6, 1]);
    expect(roundToTotal([1 / 3, 1 / 3, 1 / 3], 1)).toEqual([1, 0, 0]);
    // Ties go to the first value.
    expect(roundToTotal([2.5, 2.5], 5)).toEqual([3, 2]);
  });

  it('keeps whole values and accepts no values', () => {
    expect(roundToTotal([3, 4], 7)).toEqual([3, 4]);
    expect(roundToTotal([], 0)).toEqual([]);
  });

  it('absorbs floating-point noise', () => {
    expect(roundToTotal([0.1 + 0.2, 0.7], 1)).toEqual([0, 1]);
    expect(roundToTotal([5.9999999999, 1.0000000001], 7)).toEqual([6, 1]);
  });
});

describe('occupancy', () => {
  it('is the share of the opening hours (1110 minutes a day) in use', () => {
    expect(occupancy(1110, 1, 1)).toBe(1);
    expect(occupancy(555, 2, 1)).toBe(0.25);
    expect(occupancy(1110, 1, 2)).toBe(0.5);
  });

  it('is null without rooms', () => {
    expect(occupancy(0, 3, 0)).toBeNull();
  });
});

describe('rank', () => {
  it('puts the highest value first, ties by name, the row without a subject last', () => {
    const rows = [
      { id: null, name: null, value: 9 },
      { id: 1, name: 'B', value: 5 },
      { id: 2, name: 'A', value: 5 },
      { id: 3, name: 'C', value: 7 },
    ];
    expect(rank(rows, (r) => r.value).map((r) => r.id)).toEqual([3, 2, 1, null]);
    // The input is left as it was.
    expect(rows.map((r) => r.id)).toEqual([null, 1, 2, 3]);
  });
});

describe('hourGrid', () => {
  it('has a cell for every weekday × hour, Monday 00:00 first', () => {
    const cells = hourGrid([{ weekday: 5, hour: 22, sessions: 2, revenue: 300 }]);
    expect(cells).toHaveLength(7 * 24);
    expect(cells[0]).toEqual({ weekday: 1, hour: 0, sessions: 0, revenue: 0 });
    expect(cells[167]).toEqual({ weekday: 7, hour: 23, sessions: 0, revenue: 0 });
    expect(cells[4 * 24 + 22]).toEqual({ weekday: 5, hour: 22, sessions: 2, revenue: 300 });
    expect(cells.reduce((s, c) => s + c.sessions, 0)).toBe(2);
  });
});
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `npm --prefix 502-backend test -- src/reports/breakdowns.spec.ts`
Expected: FAIL, "Cannot find module './breakdowns'".

- [ ] **Step 3: Thêm hằng số giờ mở cửa** — trong `502-backend/src/common/dates.ts`, ngay sau dòng `export const MAX_REPORT_RANGE_DAYS = 1830;`:

```ts
// Opening hours of a business day, 11:30 → 06:00 (room occupancy).
export const VENUE_OPEN_MINUTES = 1110;
```

- [ ] **Step 4: Viết `502-backend/src/reports/breakdowns.ts`**

```ts
import { VENUE_OPEN_MINUTES } from '../common/dates';

// Pure helpers of the reports that break the revenue down by a subject
// (staff, room, product, hour).

// Rounds each value to a whole đồng so that the results add up to `total`
// (largest remainder first, ties to the earlier value). The values are the
// exact shares of `total`, e.g. a bill's discount spread over its lines.
export function roundToTotal(values: number[], total: number): number[] {
  const result = values.map((value) => Math.floor(value));
  const order = values
    .map((value, i) => ({ i, fraction: value - result[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  let rest = Math.round(total) - result.reduce((sum, v) => sum + v, 0);
  for (let k = 0; rest > 0 && order.length > 0; k++, rest--) {
    result[order[k % order.length].i] += 1;
  }
  return result;
}

// Share of the opening hours that `rooms` rooms were in use over `days`
// business days; null without rooms.
export function occupancy(
  roomMinutes: number,
  days: number,
  rooms: number,
): number | null {
  const open = days * rooms * VENUE_OPEN_MINUTES;
  return open > 0 ? roomMinutes / open : null;
}

// Highest value first (ties by name); the row without a subject — Chưa gán,
// Không phòng, Không danh mục (id null) — always last.
export function rank<T extends { id: unknown; name: string | null }>(
  rows: T[],
  value: (row: T) => number,
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.id === null) - Number(b.id === null) ||
      value(b) - value(a) ||
      (a.name ?? '').localeCompare(b.name ?? '', 'vi'),
  );
}

// Sessions and revenue (before VAT) started in one hour of one weekday
// (ISO: 1 = Monday … 7 = Sunday, of the business day).
export interface HourCell {
  weekday: number;
  hour: number;
  sessions: number;
  revenue: number;
}

// Every weekday × hour cell, Monday 00:00 first; cells without bills are 0.
export function hourGrid(rows: HourCell[]): HourCell[] {
  const cells: HourCell[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ weekday, hour, sessions: 0, revenue: 0 });
    }
  }
  for (const row of rows) {
    const cell = cells[(row.weekday - 1) * 24 + row.hour];
    cell.sessions += Number(row.sessions);
    cell.revenue += Number(row.revenue);
  }
  return cells;
}
```

- [ ] **Step 5: Chạy test, phải qua**

Run: `npm --prefix 502-backend test -- src/reports/breakdowns.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Thêm các mảnh SQL giờ địa phương** — trong `502-backend/src/reports/report-sql.ts`, thay nguyên hàm `businessDateSql` bằng:

```ts
// Local wall-clock time of a UTC timestamp column (the time zone of
// businessDateOf()).
export function localTimeSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${localTimeZone()})`;
}

// YYYY-MM-DD business day of a timestamp column.
export function businessDateSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char(${localTimeSql(column)} - ${DAY_START}, 'YYYY-MM-DD')`;
}

// ISO weekday (1 = Monday … 7 = Sunday) of the business day of a column:
// a session started at 01:00 on Saturday belongs to Friday.
export function businessWeekdaySql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXTRACT(ISODOW FROM ${localTimeSql(column)} - ${DAY_START})::int`;
}

// Local hour (0–23) of a timestamp column.
export function localHourSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXTRACT(HOUR FROM ${localTimeSql(column)})::int`;
}
```

- [ ] **Step 7: Kiểm tra không có gì hỏng**

Run: `npm --prefix 502-backend test && npm --prefix 502-backend run build && npm --prefix 502-backend run test:e2e`
Expected:
- Unit test qua hết.
- Build không lỗi.
- E2E qua hết. Đặc biệt bài "puts a bill on the business day of its payment (06:00 → 06:00)" vẫn qua, chứng tỏ `businessDateSql` không đổi nghĩa.

- [ ] **Step 8: Lint và commit**

```bash
npm --prefix 502-backend run lint
git add 502-backend/src/reports/breakdowns.ts 502-backend/src/reports/breakdowns.spec.ts 502-backend/src/common/dates.ts 502-backend/src/reports/report-sql.ts
git commit -m "feat(backend): hàm thuần cho báo cáo phân tích và giờ địa phương trong SQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 2: Một truy vấn ngày × cơ sở, `GET /reports/branches`, index báo cáo

**Files:**
- Create: `502-backend/src/reports/report-scope.ts`
- Create: `502-backend/prisma/migrations/20260927180000_report_indexes/migration.sql`
- Modify: `502-backend/prisma/schema.prisma` (model `Order`, model `OrderItem`)
- Modify: `502-backend/src/reports/dto/report-query.ts` (viết lại cả file)
- Modify: `502-backend/src/reports/reports.service.ts` (viết lại cả file)
- Modify: `502-backend/src/reports/reports.controller.ts`
- Test: `502-backend/test/reports.e2e-spec.ts`

**Interfaces:**
- Consumes: `buckets.ts` (`bucketsBetween`, `previousRange`, `rollUp`, `Bucket`, `GroupBy`), `revenue-metrics.ts`, `report-sql.ts` (`businessDateSql`, `paidOrdersWhere`, `REVENUE_COLUMNS`).
- Produces:
  - `reportScope(branchScope: BranchScopeService, user: AuthUser, query: ReportRangeQuery): Promise<number | undefined>`
  - các class `ReportRangeQuery`, `ReportQuery`, `StaffReportQuery`, `RoomReportQuery`, `ProductReportQuery`
  - các hằng và kiểu `STAFF_ROLES`/`StaffRole`, `ROOM_GROUPS`/`RoomGroup`, `PRODUCT_GROUPS`/`ProductGroup`
  - `ReportsService.branches(query: ReportQuery): Promise<BranchesReport>`
  - kiểu `BranchesReport`, dạng JSON:
    ```ts
    {
      range: { from: string; to: string };
      groupBy: GroupBy;
      totals: RevenueMetrics;
      previous: { from: string; to: string; totals: RevenueMetrics } | null;
      buckets: Bucket[];
      branches: ({
        branchId: number;
        code: string;
        name: string;
        share: number | null;
        previous: RevenueMetrics | null;
        series: number[];
      } & RevenueMetrics)[];
    }
    ```

- [ ] **Step 1: Viết test thất bại** — trong `502-backend/test/reports.e2e-spec.ts`:

(a) Thêm các kiểu sau vào ngay dưới `interface Report { … }`:

```ts
interface BranchesReport {
  totals: Metrics;
  previous: { from: string; to: string; totals: Metrics } | null;
  buckets: { key: string }[];
  branches: (Metrics & {
    code: string;
    share: number | null;
    previous: Metrics | null;
    series: number[];
  })[];
}
// A row of a breakdown report: a subject (id null: none) and its numbers.
interface Row {
  id: number | string | null;
  name: string | null;
  [field: string]: number | string | null;
}
```

(b) Thêm helper ngay dưới `const report = async (…) => …;`:

```ts
  const sumOf = (rows: Row[], field: string) =>
    rows.reduce((sum, row) => sum + Number(row[field]), 0);
  // The rows of a breakdown add up to the revenue report's totals.
  const expectSameTotals = (rows: Row[], totals: Metrics) => {
    for (const field of ['orderCount', 'roomMinutes', 'revenue', 'vat', 'collected'])
      expect(sumOf(rows, field)).toBe(totals[field]);
  };
```

(c) Thêm một khối `describe` mới **cuối file**, bên trong `describe('Reports (e2e)', …)`, ngay sau khối `describe('revenue', …)`:

```ts
  describe('branches', () => {
    it('is for the chain manager only', async () => {
      await as('ql1_cs1').get(`/reports/branches?${period}`).expect(403);
      await as('tn1_cs1').get(`/reports/branches?${period}`).expect(403);
    });

    it('compares the branches with the numbers of the revenue report', async () => {
      const res = (
        await as('admin')
          .get(`/reports/branches?${period}&compare=1`)
          .expect(200)
      ).body as BranchesReport;
      const chain = await report('admin');

      expect(res.totals).toEqual(chain.totals);
      expect(res.branches.map((b) => b.code)).toEqual(['cs1', 'cs2', 'cs3', 'cs4']);
      for (const branch of res.branches) {
        const same = chain.byBranch!.find((b) => b.code === branch.code)!;
        expect(branch.revenue).toBe((same as unknown as Metrics).revenue);
        expect(branch.collected).toBe(same.collected);
        expect(branch.series).toHaveLength(res.buckets.length);
        expect(branch.series.reduce((s, v) => s + v, 0)).toBe(branch.revenue);
        expect(branch.previous).toMatchObject({ orderCount: 0 });
      }
      expect(res.branches.reduce((s, b) => s + b.revenue, 0)).toBe(res.totals.revenue);
      expect(res.branches.reduce((s, b) => s + (b.share ?? 0), 0)).toBeCloseTo(1);
      expect(res.previous).toMatchObject({ totals: { orderCount: 0 } });
    });
  });
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `npm --prefix 502-backend run test:e2e -- -t branches`
Expected: FAIL (404 thay vì 403/200, vì route chưa có).

- [ ] **Step 3: Viết lại `502-backend/src/reports/dto/report-query.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { GROUP_BYS, type GroupBy } from '../buckets';

export const STAFF_ROLES = ['cskh', 'server', 'cashier'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ROOM_GROUPS = ['room', 'type'] as const;
export type RoomGroup = (typeof ROOM_GROUPS)[number];
export const PRODUCT_GROUPS = ['product', 'category'] as const;
export type ProductGroup = (typeof PRODUCT_GROUPS)[number];

// Branch and business days of a report.
export class ReportRangeQuery {
  @ApiProperty({
    required: false,
    description:
      'Mã cơ sở, vd cs1. Quản lý hệ thống bỏ trống để xem toàn chuỗi.',
  })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ description: 'Ngày kinh doanh đầu tiên, YYYY-MM-DD' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Ngày kinh doanh cuối cùng, YYYY-MM-DD' })
  @IsString()
  to: string;
}

// A report over time: its periods and the comparison with the period before.
export class ReportQuery extends ReportRangeQuery {
  @ApiProperty({ required: false, enum: GROUP_BYS, default: 'day' })
  @IsOptional()
  @IsIn(GROUP_BYS)
  groupBy?: GroupBy;

  @ApiProperty({
    required: false,
    description: 'So với kỳ liền trước cùng số ngày (1 / true)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  compare?: boolean;
}

export class StaffReportQuery extends ReportRangeQuery {
  @ApiProperty({
    required: false,
    enum: STAFF_ROLES,
    default: 'cskh',
    description: 'cskh: CSKH, server: phục vụ, cashier: người thanh toán',
  })
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;
}

export class RoomReportQuery extends ReportRangeQuery {
  @ApiProperty({ required: false, enum: ROOM_GROUPS, default: 'room' })
  @IsOptional()
  @IsIn(ROOM_GROUPS)
  by?: RoomGroup;
}

export class ProductReportQuery extends ReportRangeQuery {
  @ApiProperty({ required: false, enum: PRODUCT_GROUPS, default: 'product' })
  @IsOptional()
  @IsIn(PRODUCT_GROUPS)
  by?: ProductGroup;
}
```

- [ ] **Step 4: Viết `502-backend/src/reports/report-scope.ts`**

```ts
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDatesBetween, MAX_REPORT_RANGE_DAYS } from '../common/dates';
import { ReportRangeQuery } from './dto/report-query';

// The branch a report covers (undefined: the whole chain, for the chain
// manager without ?branch), after checking the dates and the range length.
export async function reportScope(
  branchScope: BranchScopeService,
  user: AuthUser,
  query: ReportRangeQuery,
): Promise<number | undefined> {
  const branchId = await branchScope.resolveOptionalBranchId(
    user,
    query.branch,
  );
  businessDatesBetween(query.from, query.to, MAX_REPORT_RANGE_DAYS);
  return branchId;
}
```

- [ ] **Step 5: Viết lại `502-backend/src/reports/reports.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  businessDatesBetween,
  businessDayRange,
  MAX_REPORT_RANGE_DAYS,
} from '../common/dates';
import {
  Bucket,
  bucketsBetween,
  GroupBy,
  previousRange,
  rollUp,
} from './buckets';
import {
  addSums,
  emptySums,
  RevenueMetrics,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';
import {
  businessDateSql,
  paidOrdersWhere,
  REVENUE_COLUMNS,
} from './report-sql';
import { reportScope } from './report-scope';
import { ReportQuery } from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

interface BranchInfo {
  branchId: number;
  code: string;
  name: string;
}

export interface RevenueReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: (Range & { totals: RevenueMetrics }) | null;
  buckets: (Bucket & RevenueMetrics)[];
  byBranch: (BranchInfo & RevenueMetrics)[] | null;
  // Bills paid and then voided (not in any total).
  voided: { count: number; amount: number };
}

// GET /reports/branches: the whole chain, branch by branch.
export interface BranchesReport {
  range: Range;
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: (Range & { totals: RevenueMetrics }) | null;
  buckets: Bucket[];
  branches: (BranchInfo &
    RevenueMetrics & {
      share: number | null; // of the chain's revenue; null when it is 0
      previous: RevenueMetrics | null; // when comparing
      series: number[]; // revenue per bucket, in the order of `buckets`
    })[];
}

// Sums of the paid bills of one branch on one business day.
type DailyRow = RevenueSums & { date: string; branchId: number };

interface BranchRecord {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

// Reports of paid bills over time, by business day of payment. The SQL
// groups by day and branch; the periods and totals are added up here.
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  async revenue(user: AuthUser, query: ReportQuery): Promise<RevenueReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare ? previousRange(query.from, query.to) : null;

    const [daily, previousDaily, branches, voided] = await Promise.all([
      this.daily(branchId, query.from, query.to),
      previous
        ? this.daily(branchId, previous.from, previous.to)
        : Promise.resolve([]),
      branchId === undefined ? this.branchList() : Promise.resolve(null),
      this.voided(branchId, query.from, query.to),
    ]);

    // Totals, periods and branches all come from the same rows.
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      groupBy,
      totals: toMetrics(sumAll(daily)),
      previous: previous && {
        ...previous,
        totals: toMetrics(sumAll(previousDaily)),
      },
      buckets: this.periods(
        bucketsBetween(query.from, query.to, groupBy),
        groupBy,
        daily,
      ).map(({ bucket, value }) => ({ ...bucket, ...toMetrics(value) })),
      byBranch:
        branches &&
        this.perBranch(branches, daily, []).map(({ branch, rows }) => ({
          ...branch,
          ...toMetrics(sumAll(rows)),
        })),
      voided,
    };
  }

  // Branch comparison of the whole chain (chain manager only, so ?branch
  // is ignored).
  async branches(query: ReportQuery): Promise<BranchesReport> {
    businessDatesBetween(query.from, query.to, MAX_REPORT_RANGE_DAYS);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare ? previousRange(query.from, query.to) : null;

    const [daily, previousDaily, branches] = await Promise.all([
      this.daily(undefined, query.from, query.to),
      previous
        ? this.daily(undefined, previous.from, previous.to)
        : Promise.resolve([]),
      this.branchList(),
    ]);

    const buckets = bucketsBetween(query.from, query.to, groupBy);
    const totals = toMetrics(sumAll(daily));
    return {
      range: { from: query.from, to: query.to },
      groupBy,
      totals,
      previous: previous && {
        ...previous,
        totals: toMetrics(sumAll(previousDaily)),
      },
      buckets,
      branches: this.perBranch(branches, daily, previousDaily).map(
        ({ branch, rows, previousRows }) => {
          const metrics = toMetrics(sumAll(rows));
          return {
            ...branch,
            ...metrics,
            share: totals.revenue ? metrics.revenue / totals.revenue : null,
            previous: previous ? toMetrics(sumAll(previousRows)) : null,
            series: this.periods(buckets, groupBy, rows).map(
              ({ value }) => toMetrics(value).revenue,
            ),
          };
        },
      ),
    };
  }

  // Sums per business day and branch of the paid bills. One query per
  // range, so a report's totals, periods and branches always agree.
  private daily(branchId: number | undefined, from: string, to: string) {
    return this.prisma.$queryRaw<DailyRow[]>`
      SELECT ${businessDateSql(Prisma.sql`o."endTime"`)} AS "date",
        o."branchId" AS "branchId", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, from, to)}
      GROUP BY 1, 2`;
  }

  // Wrapped in an arrow (not passed by reference): with this tsconfig's
  // default (non-strict) function-parameter variance, TS's generic
  // inference for rollUp's R falls back to its bare constraint when given
  // addSums directly, losing the extra `date` field. A contextually-typed
  // arrow restores correct inference.
  private periods(buckets: Bucket[], groupBy: GroupBy, rows: DailyRow[]) {
    return rollUp(buckets, groupBy, rows, emptySums, (acc, row) =>
      addSums(acc, row),
    );
  }

  private branchList(): Promise<BranchRecord[]> {
    return this.prisma.branch.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, active: true },
    });
  }

  // The rows of each branch: every active branch, and inactive ones that
  // still sold in one of the two periods.
  private perBranch(
    branches: BranchRecord[],
    rows: DailyRow[],
    previousRows: DailyRow[],
  ) {
    return branches.flatMap((branch) => {
      const own = rows.filter((r) => r.branchId === branch.id);
      const ownPrevious = previousRows.filter((r) => r.branchId === branch.id);
      if (!branch.active && own.length === 0 && ownPrevious.length === 0) {
        return [];
      }
      const info: BranchInfo = {
        branchId: branch.id,
        code: branch.code,
        name: branch.name,
      };
      return [{ branch: info, rows: own, previousRows: ownPrevious }];
    });
  }

  private async voided(branchId: number | undefined, from: string, to: string) {
    const result = await this.prisma.order.aggregate({
      where: {
        branchId,
        status: OrderStatus.CANCELLED,
        paymentMethod: { not: null },
        endTime: businessDayRange(from, to),
      },
      _count: { _all: true },
      _sum: { finalAmount: true },
    });
    return {
      count: result._count._all,
      amount: Number(result._sum.finalAmount ?? 0),
    };
  }
}
```

- [ ] **Step 6: Thêm route** — trong `502-backend/src/reports/reports.controller.ts`:
  - thêm `import { Role } from '@prisma/client';`;
  - thêm method sau `revenue(...)`. `@Roles` trên method ghi đè `@Roles` của class (RolesGuard dùng `getAllAndOverride`, handler đứng trước).

```ts
  // Branch comparison: every branch side by side (chain manager only).
  @Get('branches')
  @Roles(Role.CHAIN_MANAGER)
  branches(@Query() query: ReportQuery) {
    return this.reportsService.branches(query);
  }
```

- [ ] **Step 7: Thêm index**
  - `502-backend/prisma/schema.prisma`:
    - trong `model Order`, thêm `@@index([status, endTime])` ngay sau dòng `@@index([branchId, endTime])`;
    - trong `model OrderItem`, thêm một dòng trống rồi `@@index([orderId])` trước dấu `}`.
  - Tạo `502-backend/prisma/migrations/20260927180000_report_indexes/migration.sql`:

```sql
-- Reports: whole-chain queries by payment time, and the lines of the paid bills.

-- CreateIndex
CREATE INDEX "Order_status_endTime_idx" ON "Order"("status", "endTime");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
```

  Kiểm tra migration khớp với schema. Lệnh `migrate diff` phải in ra một script rỗng: không có câu SQL nào, chỉ có thể còn dòng comment `-- This is an empty migration.`

```bash
docker exec kara502-pg psql -U postgres -c 'CREATE DATABASE karaoke_shadow' || true
502-backend/node_modules/.bin/prisma migrate diff --from-migrations 502-backend/prisma/migrations --to-schema-datamodel 502-backend/prisma/schema.prisma --shadow-database-url postgresql://postgres:postgres@localhost:5433/karaoke_shadow --script
502-backend/node_modules/.bin/prisma generate --schema 502-backend/prisma/schema.prisma
```

  (Chạy từ gốc repo; mọi đường dẫn đều tương đối với gốc repo.)

- [ ] **Step 8: Chạy test, phải qua**

Run: `npm --prefix 502-backend run test:e2e`
Expected: PASS hết, gồm hai bài `branches` mới và các bài `revenue` cũ (đặc biệt "adds up the whole chain for the chain manager only", nay chạy trên truy vấn ngày × cơ sở dùng chung).

- [ ] **Step 9: Lint, build, commit**

```bash
npm --prefix 502-backend run lint
npm --prefix 502-backend run build
git add 502-backend/src/reports 502-backend/prisma/schema.prisma 502-backend/prisma/migrations/20260927180000_report_indexes 502-backend/test/reports.e2e-spec.ts
git commit -m "feat(backend): báo cáo so sánh cơ sở và truy vấn ngày × cơ sở dùng chung

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 3: `GET /reports/staff` và `GET /reports/rooms`

**Files:**
- Create: `502-backend/src/reports/breakdown-reports.service.ts`
- Modify: `502-backend/src/reports/reports.controller.ts`
- Modify: `502-backend/src/reports/reports.module.ts`
- Test: `502-backend/test/reports.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `reportScope`, `StaffReportQuery`, `RoomReportQuery`, `StaffRole`, `RoomGroup` (Task 2);
  - `rank`, `occupancy` (Task 1);
  - `dayCount` (buckets.ts);
  - `REVENUE_COLUMNS`, `paidOrdersWhere` (report-sql.ts).
- Produces:
  - `BreakdownReportsService.staff(user, query): Promise<StaffReport>`
  - `BreakdownReportsService.rooms(user, query): Promise<RoomReport>`
  - dạng JSON (Task 6 viết lại các kiểu này ở frontend):
    ```ts
    StaffReport {
      branchId: number | null;
      range: { from; to };
      role: StaffRole;
      totals: RevenueMetrics;
      rows: StaffRow[];
    }
    StaffRow = RevenueMetrics & {
      id: number | null;
      name: string | null;
      username: string | null;
      branchCode: string | null;
    }
    RoomReport {
      branchId: number | null;
      range;
      by: RoomGroup;
      days: number;
      totals: RevenueMetrics;
      occupancy: number | null;
      rows: RoomRow[];
    }
    RoomRow = RevenueMetrics & {
      id: number | string | null; // room id; room type when by=type
      name: string | null;
      type: string | null;
      branchCode: string | null;
      rooms: number;
      occupancy: number | null;
    }
    ```
  - Task 4 và 5 thêm method vào service này.

- [ ] **Step 1: Viết test thất bại** — trong `502-backend/test/reports.e2e-spec.ts`:

(a) Viết lại `payBill` để nhận thêm tùy chọn: người phục vụ khi mở phòng, và danh sách món. Mặc định vẫn là 2 Bia Tiger, nên các lời gọi cũ không phải đổi.

```ts
  // Opens a room (with `open`, e.g. its CSKH/server), orders `items`
  // (default 2 beers), applies `adjustments` and pays.
  const payBill = async (
    cashier: string,
    roomName: string,
    adjustments: Json,
    paymentMethod: 'CASH' | 'TRANSFER',
    {
      open = {},
      items = [['Bia Tiger', 2]],
    }: { open?: Json; items?: [string, number][] } = {},
  ) => {
    const rooms = (await as(cashier).get('/rooms').expect(200)).body as Json[];
    const products = (await as(cashier).get('/products').expect(200))
      .body as Json[];
    const roomId = rooms.find((r) => r.name === roomName)!.id;
    const opened = (
      await as(cashier)
        .post('/orders', { roomId, ...open })
        .expect(201)
    ).body as Json;
    await as(cashier)
      .patch(`/orders/${opened.id as number}`, {
        items: items.map(([name, quantity]) => ({
          productId: products.find((p) => p.name === name)!.id,
          quantity,
        })),
        ...adjustments,
      })
      .expect(200);
    return (
      await as(cashier)
        .post(`/orders/${opened.id as number}/checkout`, { paymentMethod })
        .expect(200)
    ).body as Json;
  };
```

(b) Thêm helper ngay dưới `expectSameTotals`:

```ts
  const idOf = async (username: string) =>
    (
      await app
        .get(PrismaService)
        .user.findUniqueOrThrow({ where: { username } })
    ).id;
  const breakdown = async (username: string, path: string) =>
    (await as(username).get(`${path}${path.includes('?') ? '&' : '?'}${period}`).expect(200))
      .body as { totals: Metrics; rows: Row[]; occupancy?: number | null; days?: number };
```

(c) Thêm hai khối `describe` ngay sau khối `describe('branches', …)`:

```ts
  describe('staff', () => {
    it('is for managers, within their own branch', async () => {
      await as('tn1_cs1').get(`/reports/staff?${period}`).expect(403);
      await as('ql1_cs1').get(`/reports/staff?${period}&branch=cs2`).expect(403);
      await as('ql1_cs1').get(`/reports/staff?${period}&role=boss`).expect(400);
    });

    it('credits each bill in full to its CSKH, its server and its cashier', async () => {
      const cskhId = await idOf('cskh1_cs1');
      const serverId = await idOf('pv1_cs1');
      const cashierId = await idOf('tn1_cs1');
      const bill = await payBill('tn1_cs1', 'P103', {}, 'CASH', {
        open: { cskhId, serverId },
      });
      const { totals } = await report('ql1_cs1');

      for (const [role, id] of [
        ['cskh', cskhId],
        ['server', serverId],
      ] as const) {
        const res = await breakdown('ql1_cs1', `/reports/staff?role=${role}`);
        expect(res.totals).toEqual(totals);
        expectSameTotals(res.rows, totals);
        expect(res.rows[0]).toMatchObject({
          id,
          orderCount: 1,
          collected: Number(bill.finalAmount),
        });
        // Bills without anyone in that role: "Chưa gán", always last.
        expect(res.rows.at(-1)).toMatchObject({
          id: null,
          name: null,
          orderCount: totals.orderCount - 1,
        });
      }

      const cashiers = await breakdown('ql1_cs1', '/reports/staff?role=cashier');
      expectSameTotals(cashiers.rows, totals);
      expect(cashiers.rows).toEqual([
        expect.objectContaining({
          id: cashierId,
          name: 'Thu ngân CS1',
          username: 'tn1_cs1',
          branchCode: 'cs1',
          orderCount: totals.orderCount,
        }),
      ]);
    });
  });

  describe('rooms', () => {
    it('validates the grouping', async () => {
      await as('ql1_cs1').get(`/reports/rooms?${period}&by=floor`).expect(400);
      await as('tn1_cs1').get(`/reports/rooms?${period}`).expect(403);
    });

    it('adds up per room, every room listed, with the occupancy', async () => {
      const { totals } = await report('ql1_cs1');
      const res = await breakdown('ql1_cs1', '/reports/rooms?by=room');
      expect(res.totals).toEqual(totals);
      expectSameTotals(res.rows, totals);
      expect(res.days).toBe(3);
      expect(res.rows.map((r) => r.name).sort()).toEqual(['P101', 'P102', 'P103']);

      const p101 = res.rows.find((r) => r.name === 'P101')!;
      expect(p101).toMatchObject({ type: 'NORMAL', branchCode: 'cs1', rooms: 1 });
      expect(p101.orderCount).toBeGreaterThanOrEqual(1);
      expect(p101.occupancy).toBeCloseTo(Number(p101.roomMinutes) / (3 * 1110));
      // P102's only bill was voided: listed, with nothing.
      expect(res.rows.find((r) => r.name === 'P102')).toMatchObject({
        orderCount: 0,
        revenue: 0,
        occupancy: 0,
      });
      expect(res.occupancy).toBeCloseTo(totals.roomMinutes / (3 * 1110 * 3));
    });

    it('adds up per room type', async () => {
      const { totals } = await report('ql1_cs1');
      const res = await breakdown('ql1_cs1', '/reports/rooms?by=type');
      expectSameTotals(res.rows, totals);
      expect(res.rows.map((r) => [r.id, r.rooms]).sort()).toEqual([
        ['NORMAL', 2],
        ['VIP', 1],
      ]);
      const normal = res.rows.find((r) => r.id === 'NORMAL')!;
      expect(normal.occupancy).toBeCloseTo(
        Number(normal.roomMinutes) / (3 * 1110 * 2),
      );
    });
  });
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `npm --prefix 502-backend run test:e2e -- -t "staff|rooms"`
Expected: FAIL (404, route chưa có).

- [ ] **Step 3: Viết `502-backend/src/reports/breakdown-reports.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { dayCount } from './buckets';
import { occupancy, rank } from './breakdowns';
import {
  addSums,
  emptySums,
  RevenueMetrics,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';
import { paidOrdersWhere, REVENUE_COLUMNS } from './report-sql';
import { reportScope } from './report-scope';
import {
  RoomGroup,
  RoomReportQuery,
  StaffReportQuery,
  StaffRole,
} from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

// id null: the bills nobody was assigned to in that role (Chưa gán).
export interface StaffRow extends RevenueMetrics {
  id: number | null;
  name: string | null;
  username: string | null;
  branchCode: string | null;
}

export interface StaffReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  role: StaffRole;
  totals: RevenueMetrics;
  rows: StaffRow[];
}

// A room (by=room) or a room type (by=type, id = the type); id null: the
// bills without a room (Không phòng).
export interface RoomRow extends RevenueMetrics {
  id: number | string | null;
  name: string | null;
  type: string | null;
  branchCode: string | null; // by=room only
  rooms: number;
  occupancy: number | null;
}

export interface RoomReport {
  branchId: number | null;
  range: Range;
  by: RoomGroup;
  days: number;
  totals: RevenueMetrics;
  occupancy: number | null; // of all the rooms together
  rows: RoomRow[];
}

// The person a bill is credited to in each staff report (fixed column
// names, never user input).
const STAFF_COLUMNS: Record<StaffRole, Prisma.Sql> = {
  cskh: Prisma.raw('o."cskhId"'),
  server: Prisma.raw('o."serverId"'),
  cashier: Prisma.raw('o."checkedOutById"'),
};

// Revenue of the paid bills broken down by a subject. Every report's rows
// add up to the revenue report's totals of the same scope and days.
@Injectable()
export class BreakdownReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Each bill counts in full for its CSKH, its server and its cashier.
  async staff(user: AuthUser, query: StaffReportQuery): Promise<StaffReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const role = query.role ?? 'cskh';
    const sums = await this.prisma.$queryRaw<
      (RevenueSums & { userId: number | null })[]
    >`
      SELECT ${STAFF_COLUMNS[role]} AS "userId", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1`;

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: sums.flatMap((row) => (row.userId === null ? [] : [row.userId])) },
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        branch: { select: { code: true } },
      },
    });
    const userOf = new Map(users.map((u) => [u.id, u]));

    const rows = sums.map((row): StaffRow => {
      const person = row.userId === null ? undefined : userOf.get(row.userId);
      return {
        id: row.userId,
        name: person?.fullName ?? null,
        username: person?.username ?? null,
        branchCode: person?.branch?.code ?? null,
        ...toMetrics(row),
      };
    });
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      role,
      totals: toMetrics(sumAll(sums)),
      rows: rank(rows, (r) => r.revenue),
    };
  }

  // Every room of the scope (also those without bills), or every room type.
  async rooms(user: AuthUser, query: RoomReportQuery): Promise<RoomReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const by = query.by ?? 'room';
    const days = dayCount(query.from, query.to);

    const [sums, rooms] = await Promise.all([
      this.prisma.$queryRaw<(RevenueSums & { roomId: number | null })[]>`
        SELECT o."roomId" AS "roomId", ${REVENUE_COLUMNS}
        FROM "Order" o
        WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
        GROUP BY 1`,
      this.prisma.room.findMany({
        where: { branchId },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          branch: { select: { code: true } },
        },
      }),
    ]);
    const sumsOf = new Map(sums.map((row) => [row.roomId, row]));

    const groups = new Map<
      number | string,
      Omit<RoomRow, keyof RevenueMetrics | 'occupancy'> & { sums: RevenueSums }
    >();
    for (const room of rooms) {
      const id = by === 'room' ? room.id : room.type;
      const group = groups.get(id) ?? {
        id,
        name: by === 'room' ? room.name : room.type,
        type: room.type,
        branchCode: by === 'room' ? room.branch.code : null,
        rooms: 0,
        sums: emptySums(),
      };
      group.rooms += 1;
      addSums(group.sums, sumsOf.get(room.id) ?? emptySums());
      groups.set(id, group);
    }

    const rows: RoomRow[] = [...groups.values()].map(({ sums: own, ...group }) => ({
      ...group,
      occupancy: occupancy(own.roomMinutes, days, group.rooms),
      ...toMetrics(own),
    }));
    const inRooms = sumAll(rows);
    const withoutRoom = sumsOf.get(null);
    if (withoutRoom) {
      rows.push({
        id: null,
        name: null,
        type: null,
        branchCode: null,
        rooms: 0,
        occupancy: null,
        ...toMetrics(withoutRoom),
      });
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      days,
      totals: toMetrics(sumAll(sums)),
      occupancy: occupancy(inRooms.roomMinutes, days, rooms.length),
      rows: rank(rows, (r) => r.revenue),
    };
  }
}
```

- [ ] **Step 4: Đăng ký service và route**
  - `reports.module.ts`: `providers: [ReportsService, BreakdownReportsService]`, thêm import `BreakdownReportsService` từ `./breakdown-reports.service`.
  - `reports.controller.ts`:
    - constructor nhận thêm `private readonly breakdowns: BreakdownReportsService`;
    - import `StaffReportQuery`, `RoomReportQuery` từ `./dto/report-query`;
    - thêm hai route sau `revenue(...)`:

```ts
  // Revenue per CSKH, server or cashier; each bill counts in full for each.
  @Get('staff')
  staff(@CurrentUser() user: AuthUser, @Query() query: StaffReportQuery) {
    return this.breakdowns.staff(user, query);
  }

  // Revenue and occupancy per room or room type.
  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser, @Query() query: RoomReportQuery) {
    return this.breakdowns.rooms(user, query);
  }
```

- [ ] **Step 5: Chạy test, phải qua**

Run: `npm --prefix 502-backend run test:e2e`
Expected: PASS hết.

- [ ] **Step 6: Lint, build, commit**

```bash
npm --prefix 502-backend run lint
npm --prefix 502-backend run build
git add 502-backend/src/reports 502-backend/test/reports.e2e-spec.ts
git commit -m "feat(backend): báo cáo theo nhân viên và theo phòng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 4: `GET /reports/products` — giảm giá phân bổ tới đồng

**Files:**
- Modify: `502-backend/src/reports/breakdown-reports.service.ts`
- Modify: `502-backend/src/reports/reports.controller.ts`
- Test: `502-backend/test/reports.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `roundToTotal`, `rank` (Task 1);
  - `ProductReportQuery`, `ProductGroup` (Task 2);
  - `BreakdownReportsService` (Task 3).
- Produces:
  - `BreakdownReportsService.products(user, query): Promise<ProductReport>`
  - dạng JSON:
    ```ts
    ProductReport {
      branchId: number | null;
      range;
      by: ProductGroup;
      totals: ProductSales;
      rows: ProductRow[];
    }
    ProductSales {
      quantity: number;
      gross: number;
      discount: number;
      net: number;
    }
    ProductRow = ProductSales & {
      id: number | null; // product id; category id when by=category
      name: string | null;
      unit: string | null;
      categoryName: string | null;
      branchCode: string | null;
      share: number | null;
    }
    ```

- [ ] **Step 1: Viết test thất bại** — thêm khối `describe` ngay sau khối `describe('rooms', …)` trong `502-backend/test/reports.e2e-spec.ts`:

```ts
  describe('products', () => {
    const productReport = (query = '') =>
      breakdown('ql1_cs1', `/reports/products${query}`) as unknown as Promise<{
        totals: Record<string, number>;
        rows: Row[];
      }>;
    // Products' net revenue + the room fee after its discount + the service
    // fee = the revenue (before VAT).
    const expectProductTotals = (
      res: { totals: Record<string, number>; rows: Row[] },
      totals: Metrics,
    ) => {
      expect(res.totals).toMatchObject({
        gross: totals.productSales,
        discount: totals.productDiscount,
        net: totals.productSales - totals.productDiscount,
      });
      for (const field of ['quantity', 'gross', 'discount', 'net'])
        expect(sumOf(res.rows, field)).toBe(res.totals[field]);
      for (const row of res.rows) expect(Number.isInteger(row.discount)).toBe(true);
      expect(
        res.totals.net + totals.roomFee - totals.roomDiscount + totals.serviceFee,
      ).toBe(totals.revenue);
    };

    it('validates the grouping', async () => {
      await as('ql1_cs1').get(`/reports/products?${period}&by=brand`).expect(400);
      await as('tn1_cs1').get(`/reports/products?${period}`).expect(403);
    });

    it('spreads the product discount over the lines, to the đồng', async () => {
      // 2 beers (50,000) + 1 water (10,000) with 7 đồng off: 5.83 + 1.17 → 6 + 1.
      const bill = await payBill('tn1_cs1', 'P101', { discountAmount: 7 }, 'CASH', {
        items: [
          ['Bia Tiger', 2],
          ['Nước suối', 1],
        ],
      });
      expect(Number(bill.discountAmount)).toBe(7);

      const { totals } = await report('ql1_cs1');
      const res = await productReport();
      expectProductTotals(res, totals);
      expect(res.rows.find((r) => r.name === 'Nước suối')).toMatchObject({
        quantity: 1,
        gross: 10000,
        discount: 1,
        net: 9999,
        unit: expect.any(String),
        categoryName: 'Đồ uống',
        branchCode: 'cs1',
      });
      expect(res.rows[0].name).toBe('Bia Tiger');

      const byCategory = await productReport('?by=category');
      expect(byCategory.totals).toEqual(res.totals);
      expectProductTotals(byCategory, totals);
      expect(byCategory.rows.map((r) => r.name)).toEqual(['Đồ uống']);
    });

    it('follows a correction of a paid bill', async () => {
      const bills = (await as('ql1_cs1').get(`/orders?${period}`).expect(200))
        .body as Json[];
      const bill = bills.find((b) => Number(b.discountAmount) === 7)!;
      const products = (await as('ql1_cs1').get('/products').expect(200))
        .body as Json[];
      const idOfProduct = (name: string) => products.find((p) => p.name === name)!.id;
      await as('ql1_cs1')
        .patch(`/orders/${bill.id as number}/paid`, {
          reason: 'thêm món',
          items: [
            { productId: idOfProduct('Bia Tiger'), quantity: 2 },
            { productId: idOfProduct('Nước suối'), quantity: 3 },
            { productId: idOfProduct('Phụ thu vệ sinh'), quantity: 1 },
          ],
        })
        .expect(200);

      const { totals } = await report('ql1_cs1');
      const res = await productReport();
      expectProductTotals(res, totals);
      expect(res.rows.find((r) => r.name === 'Nước suối')).toMatchObject({
        quantity: 3,
        gross: 30000,
      });

      // A product without a category: "Không danh mục", last.
      const byCategory = await productReport('?by=category');
      expectProductTotals(byCategory, totals);
      expect(byCategory.rows.at(-1)).toMatchObject({
        id: null,
        name: null,
        quantity: 1,
        gross: 50000,
      });
    });
  });
```

  Lưu ý:
  - Nếu `GET /orders` trả về dạng khác mảng (ví dụ `{ items, … }`), đọc `502-backend/src/orders/orders.controller.ts` và lấy đúng mảng hóa đơn. Mục đích của bước này là tìm hóa đơn vừa tạo, không đổi gì khác.
  - Đếm 3 chai nước đòi hỏi tồn kho không chặn bán. Bán được phép âm kho, nên luôn đi được.

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `npm --prefix 502-backend run test:e2e -- -t products`
Expected: FAIL (404).

- [ ] **Step 3: Thêm `products` vào `BreakdownReportsService`**
  - Mở rộng các import:
    - `roundToTotal` từ `./breakdowns`;
    - `ProductGroup`, `ProductReportQuery` từ `./dto/report-query`.
  - Thêm các kiểu dưới `RoomReport`:

```ts
// What a set of lines sold: `gross` = Σ quantity × price, `discount` = its
// share of the bills' product discount, `net` = gross − discount (before VAT).
export interface ProductSales {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
}

// A product, or a category (by=category; id null: Không danh mục).
export interface ProductRow extends ProductSales {
  id: number | null;
  name: string | null;
  unit: string | null; // by=product only
  categoryName: string | null; // by=product only
  branchCode: string | null;
  share: number | null; // of the net total; null when it is 0
}

export interface ProductReport {
  branchId: number | null;
  range: Range;
  by: ProductGroup;
  totals: ProductSales;
  rows: ProductRow[];
}
```

  - Thêm method sau `rooms(...)`:

```ts
  // Sales per product or category. A bill's product discount is spread over
  // its lines in proportion to their amounts, then rounded to the đồng so
  // the rows still add up to the bills' discounts.
  async products(
    user: AuthUser,
    query: ProductReportQuery,
  ): Promise<ProductReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const by = query.by ?? 'product';
    // One row per line: never REVENUE_COLUMNS here (a bill would count once
    // per line).
    const lines = await this.prisma.$queryRaw<
      { productId: number; quantity: number; gross: number; discount: number }[]
    >`
      SELECT i."productId" AS "productId",
        SUM(i."quantity")::int AS "quantity",
        SUM(i."quantity" * i."price")::float8 AS "gross",
        COALESCE(SUM(i."quantity" * i."price" * o."discountAmount"
          / NULLIF(o."totalProductPrice", 0)), 0)::float8 AS "discount"
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1`;

    const products = await this.prisma.product.findMany({
      where: { id: { in: lines.map((line) => line.productId) } },
      select: {
        id: true,
        name: true,
        unit: true,
        category: { select: { id: true, name: true } },
        branch: { select: { code: true } },
      },
    });
    const productOf = new Map(products.map((p) => [p.id, p]));

    // Discounts not rounded yet: the exact shares.
    const groups = new Map<number | null, Omit<ProductRow, 'net' | 'share'>>();
    for (const line of lines) {
      const product = productOf.get(line.productId)!;
      const id = by === 'product' ? product.id : (product.category?.id ?? null);
      const group =
        groups.get(id) ??
        (by === 'product'
          ? {
              id,
              name: product.name,
              unit: product.unit,
              categoryName: product.category?.name ?? null,
              branchCode: product.branch.code,
              quantity: 0,
              gross: 0,
              discount: 0,
            }
          : {
              id,
              name: product.category?.name ?? null,
              unit: null,
              categoryName: null,
              branchCode: id === null ? null : product.branch.code,
              quantity: 0,
              gross: 0,
              discount: 0,
            });
      group.quantity += line.quantity;
      group.gross += line.gross;
      group.discount += line.discount;
      groups.set(id, group);
    }

    const list = [...groups.values()];
    // The exact shares add up to Σ discountAmount, a whole number.
    const discounts = roundToTotal(
      list.map((group) => group.discount),
      list.reduce((sum, group) => sum + group.discount, 0),
    );
    const quantity = list.reduce((sum, group) => sum + group.quantity, 0);
    const gross = list.reduce((sum, group) => sum + group.gross, 0);
    const discount = discounts.reduce((sum, value) => sum + value, 0);
    const net = gross - discount;
    const rows = list.map((group, i): ProductRow => {
      const rowNet = group.gross - discounts[i];
      return {
        ...group,
        discount: discounts[i],
        net: rowNet,
        share: net ? rowNet / net : null,
      };
    });
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      totals: { quantity, gross, discount, net },
      rows: rank(rows, (r) => r.net),
    };
  }
```

- [ ] **Step 4: Thêm route** — trong `reports.controller.ts`, import `ProductReportQuery` và thêm:

```ts
  // Sales per product or category, with the bills' discounts spread over
  // the lines.
  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() query: ProductReportQuery) {
    return this.breakdowns.products(user, query);
  }
```

- [ ] **Step 5: Chạy test, phải qua**

Run: `npm --prefix 502-backend run test:e2e`
Expected: PASS hết.

- [ ] **Step 6: Lint, build, commit**

```bash
npm --prefix 502-backend run lint
npm --prefix 502-backend run build
git add 502-backend/src/reports 502-backend/test/reports.e2e-spec.ts
git commit -m "feat(backend): báo cáo theo hàng hóa, giảm giá phân bổ theo dòng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 5: `GET /reports/hours` — thứ × giờ bắt đầu

**Files:**
- Modify: `502-backend/src/reports/breakdown-reports.service.ts`
- Modify: `502-backend/src/reports/reports.controller.ts`
- Test: `502-backend/test/reports.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `hourGrid`, `HourCell` (Task 1);
  - `businessWeekdaySql`, `localHourSql` (Task 1);
  - `ReportRangeQuery` (Task 2).
- Produces:
  - `BreakdownReportsService.hours(user, query: ReportRangeQuery): Promise<HoursReport>`
  - dạng JSON:
    ```ts
    HoursReport {
      branchId: number | null;
      range;
      totals: { sessions: number; revenue: number };
      cells: HourCell[]; // 168 ô, T2 00:00 trước
    }
    ```

- [ ] **Step 1: Viết test thất bại** — thêm khối `describe` ngay sau khối `describe('products', …)`:

```ts
  describe('hours', () => {
    interface HoursReport {
      totals: { sessions: number; revenue: number };
      cells: { weekday: number; hour: number; sessions: number; revenue: number }[];
    }

    it('counts sessions by weekday of the business day and hour of start', async () => {
      const prisma = app.get(PrismaService);
      const cs4 = await prisma.branch.findUniqueOrThrow({ where: { code: 'cs4' } });
      const session = (start: string, end: string, paid: number, vat: number) =>
        prisma.order.create({
          data: {
            branchId: cs4.id,
            status: 'COMPLETED',
            startTime: new Date(start),
            endTime: new Date(end),
            finalAmount: paid,
            taxAmount: vat,
            paymentMethod: 'CASH',
          },
        });
      // 2026-01-09 is a Friday (T6).
      await session('2026-01-09T22:10:00', '2026-01-10T00:30:00', 110000, 10000);
      // Saturday 01:00 still belongs to Friday's business day.
      await session('2026-01-10T01:00:00', '2026-01-10T03:00:00', 220000, 20000);
      await session('2026-01-10T12:00:00', '2026-01-10T14:00:00', 55000, 5000);

      const res = (
        await as('admin')
          .get('/reports/hours?branch=cs4&from=2026-01-09&to=2026-01-10')
          .expect(200)
      ).body as HoursReport;
      expect(res.cells).toHaveLength(168);
      expect(
        res.cells
          .filter((c) => c.sessions > 0)
          .map((c) => [c.weekday, c.hour, c.sessions, c.revenue]),
      ).toEqual([
        [5, 1, 1, 200000],
        [5, 22, 1, 100000],
        [6, 12, 1, 50000],
      ]);
      expect(res.totals).toEqual({ sessions: 3, revenue: 350000 });
    });

    it('adds up to the revenue report', async () => {
      await as('tn1_cs1').get(`/reports/hours?${period}`).expect(403);
      const { totals } = await report('ql1_cs1');
      const res = (await as('ql1_cs1').get(`/reports/hours?${period}`).expect(200))
        .body as HoursReport;
      expect(res.totals).toEqual({
        sessions: totals.orderCount,
        revenue: totals.revenue,
      });
    });
  });
```

- [ ] **Step 2: Chạy test, phải thất bại**

Run: `npm --prefix 502-backend run test:e2e -- -t hours`
Expected: FAIL (404).

- [ ] **Step 3: Thêm `hours` vào `BreakdownReportsService`**
  - Mở rộng các import:
    - `hourGrid`, `HourCell` từ `./breakdowns`;
    - `businessWeekdaySql`, `localHourSql` từ `./report-sql`;
    - `ReportRangeQuery` từ `./dto/report-query`.
  - Thêm kiểu dưới `ProductReport`:

```ts
export interface HoursReport {
  branchId: number | null;
  range: Range;
  totals: { sessions: number; revenue: number };
  cells: HourCell[]; // 7 × 24, Monday 00:00 first
}
```

  - Thêm method sau `products(...)`:

```ts
  // Sessions and revenue (before VAT) by weekday of the business day and
  // hour of the start; the bills are still those paid in the range.
  async hours(user: AuthUser, query: ReportRangeQuery): Promise<HoursReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    // A bill without a start time counts at its payment.
    const start = Prisma.sql`COALESCE(o."startTime", o."endTime")`;
    const sums = await this.prisma.$queryRaw<HourCell[]>`
      SELECT ${businessWeekdaySql(start)} AS "weekday",
        ${localHourSql(start)} AS "hour",
        COUNT(*)::int AS "sessions",
        COALESCE(SUM(o."finalAmount" - o."taxAmount"), 0)::float8 AS "revenue"
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1, 2`;
    const cells = hourGrid(sums);
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      totals: {
        sessions: cells.reduce((sum, c) => sum + c.sessions, 0),
        revenue: cells.reduce((sum, c) => sum + c.revenue, 0),
      },
      cells,
    };
  }
```

- [ ] **Step 4: Thêm route** — trong `reports.controller.ts`, import `ReportRangeQuery` và thêm:

```ts
  // Heatmap: weekday of the business day × hour the sessions started.
  @Get('hours')
  hours(@CurrentUser() user: AuthUser, @Query() query: ReportRangeQuery) {
    return this.breakdowns.hours(user, query);
  }
```

- [ ] **Step 5: Chạy toàn bộ test, phải qua**

Run: `npm --prefix 502-backend test && npm --prefix 502-backend run test:e2e`
Expected: PASS hết (unit và e2e).

- [ ] **Step 6: Lint, build, commit**

```bash
npm --prefix 502-backend run lint
npm --prefix 502-backend run build
git add 502-backend/src/reports 502-backend/test/reports.e2e-spec.ts
git commit -m "feat(backend): báo cáo khung giờ theo thứ và giờ bắt đầu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 6: Nền tảng frontend cho các báo cáo mới

**Files:**
- Create: `502-frontend/src/lib/report-columns.ts`
- Create: `502-frontend/src/components/reports/ranking-chart.tsx`
- Create: `502-frontend/src/components/reports/heatmap.tsx`
- Modify: `502-frontend/src/lib/types.ts`
- Modify: `502-frontend/src/lib/labels.ts`
- Modify: `502-frontend/src/lib/reports.ts`
- Modify: `502-frontend/src/lib/format.ts`
- Modify: `502-frontend/src/hooks/use-report-filters.ts` (viết lại cả file)
- Modify: `502-frontend/src/components/reports/report-toolbar.tsx`
- Modify: `502-frontend/src/app/[branch]/reports/revenue/page.tsx`

**Interfaces:**
- Consumes: dạng JSON của Task 2–5.
- Produces (các trang ở Task 7–9 dùng):
  - kiểu: `StaffRole`, `RoomGroup`, `ProductGroup`, `HourMetric`, `StaffReportRow`, `StaffReport`, `RoomReportRow`, `RoomReport`, `ProductSales`, `ProductReportRow`, `ProductReport`, `HourCell`, `HoursReport`, `BranchReportRow`, `BranchesReport`;
  - nhãn: `STAFF_ROLE_LABELS`, `roomTypeLabel(type)`, `WEEKDAY_LABELS`, `UNASSIGNED_STAFF`, `NO_ROOM`, `NO_CATEGORY`;
  - hằng và helper: `STAFF_ROLES`, `ROOM_GROUPS`, `PRODUCT_GROUPS`, `HOUR_METRICS`, `tickLabel(bucket, groupBy)`, `formatPercent(value)`, `formatCompact(value)`, `METRIC_COLUMNS`;
  - hook: `useReportOption(name, options, fallback)`, `rangeParams(branch, filters)`, `useReportScope(data)`;
  - component: `<ReportToolbar periods={false} scope={false} />`, `<RankingChart rows label />`, `<Heatmap cells value format />`.

- [ ] **Step 1: Kiểu dữ liệu** — trong `502-frontend/src/lib/types.ts`, thêm ngay sau `interface RevenueReport { … }`:

```ts
export type StaffRole = "cskh" | "server" | "cashier";
export type RoomGroup = "room" | "type";
export type ProductGroup = "product" | "category";
export type HourMetric = "sessions" | "revenue";

// GET /reports/staff; id null: "Chưa gán".
export interface StaffReportRow extends RevenueMetrics {
  id: number | null;
  name: string | null;
  username: string | null;
  branchCode: string | null;
}

export interface StaffReport {
  branchId: number | null;
  range: { from: string; to: string };
  role: StaffRole;
  totals: RevenueMetrics;
  rows: StaffReportRow[];
}

// GET /reports/rooms; id: room id, or the room type (by=type); null: "Không phòng".
export interface RoomReportRow extends RevenueMetrics {
  id: number | string | null;
  name: string | null;
  type: string | null;
  branchCode: string | null;
  rooms: number;
  occupancy: number | null;
}

export interface RoomReport {
  branchId: number | null;
  range: { from: string; to: string };
  by: RoomGroup;
  days: number;
  totals: RevenueMetrics;
  occupancy: number | null;
  rows: RoomReportRow[];
}

// GET /reports/products: gross = Σ quantity × price, discount = its share of
// the bills' product discount, net = gross − discount (before VAT).
export interface ProductSales {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
}

export interface ProductReportRow extends ProductSales {
  id: number | null; // product id, or category id (by=category; null: "Không danh mục")
  name: string | null;
  unit: string | null;
  categoryName: string | null;
  branchCode: string | null;
  share: number | null;
}

export interface ProductReport {
  branchId: number | null;
  range: { from: string; to: string };
  by: ProductGroup;
  totals: ProductSales;
  rows: ProductReportRow[];
}

// GET /reports/hours: weekday 1 = Monday … 7 = Sunday (of the business day).
export interface HourCell {
  weekday: number;
  hour: number;
  sessions: number;
  revenue: number;
}

export interface HoursReport {
  branchId: number | null;
  range: { from: string; to: string };
  totals: { sessions: number; revenue: number };
  cells: HourCell[];
}

// GET /reports/branches (chain manager only).
export interface BranchReportRow extends RevenueMetrics {
  branchId: number;
  code: string;
  name: string;
  share: number | null;
  previous: RevenueMetrics | null;
  series: number[]; // revenue per bucket
}

export interface BranchesReport {
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: { from: string; to: string; totals: RevenueMetrics } | null;
  buckets: ReportBucket[];
  branches: BranchReportRow[];
}
```

- [ ] **Step 2: Nhãn** — trong `502-frontend/src/lib/labels.ts`:
  - đổi dòng import đầu file thành
    `import type { FundType, GroupBy, OrderStatus, PaymentMethod, StaffRole, StockDocType, StockMovementType } from "@/lib/types";`
  - thêm vào cuối file:

```ts
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  cskh: "CSKH",
  server: "Phục vụ",
  cashier: "Thu ngân",
};

const ROOM_TYPE_LABELS: Record<string, string> = { VIP: "VIP", NORMAL: "Thường" };

export const roomTypeLabel = (type: string | null) => (type ? (ROOM_TYPE_LABELS[type] ?? type) : "—");

// ISO weekdays 1 → 7 (Monday first).
export const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// Report rows without a subject.
export const UNASSIGNED_STAFF = "Chưa gán";
export const NO_ROOM = "Không phòng";
export const NO_CATEGORY = "Không danh mục";
```

- [ ] **Step 3: Hằng và `tickLabel`** — viết lại `502-frontend/src/lib/reports.ts` như sau. Phần cũ giữ nguyên; thêm import, các hằng mới và `tickLabel`:

```ts
import { formatDate } from "@/lib/format";
import type { GroupBy, HourMetric, ProductGroup, ReportBucket, RoomGroup, StaffRole } from "@/lib/types";

export const GROUP_BYS: GroupBy[] = ["day", "week", "month", "quarter", "year"];
export const STAFF_ROLES: StaffRole[] = ["cskh", "server", "cashier"];
export const ROOM_GROUPS: RoomGroup[] = ["room", "type"];
export const PRODUCT_GROUPS: ProductGroup[] = ["product", "category"];
export const HOUR_METRICS: HourMetric[] = ["sessions", "revenue"];

// Change against the previous period (0.12 = +12%); null when the previous
// value is 0 (nothing to compare with).
export function delta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

// Short label of a period on a chart axis.
export function tickLabel(bucket: ReportBucket, groupBy: GroupBy) {
  if (groupBy === "day") return formatDate(bucket.key).slice(0, 5);
  if (groupBy === "week") return bucket.label.split(" (")[0];
  return bucket.label;
}

// doanh-thu_cs1_2026-09-01_2026-09-27.xlsx
export function reportFileName(report: string, scope: string, from: string, to: string) {
  return `${report}_${scope}_${from}_${to}.xlsx`;
}

// GET /orders (Hóa đơn) caps a range at this many days (common/dates.ts MAX_REPORT_DAYS).
export const MAX_BILLS_RANGE_DAYS = 366;

// Number of days between two local YYYY-MM-DD dates, both included.
function dayCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

// Whether from..to fits on the Hóa đơn (bills) page, which caps at
// MAX_BILLS_RANGE_DAYS while a report can span up to 1830 days.
export function withinBillsRange(from: string, to: string): boolean {
  return dayCount(from, to) <= MAX_BILLS_RANGE_DAYS;
}
```

- [ ] **Step 4: Định dạng** — thêm vào cuối `502-frontend/src/lib/format.ts`:

```ts
const percentFormat = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

// 0.125 → "12,5%"; null → "—".
export const formatPercent = (value: number | null) => (value === null ? "—" : percentFormat.format(value));

// 1 250 000 → "1,3 Tr" (chart axes).
export const formatCompact = (value: number) => compactFormat.format(value);
```

- [ ] **Step 5: Cột Excel dùng chung** — tạo `502-frontend/src/lib/report-columns.ts`:

```ts
import type { ExportColumn } from "@/lib/excel-export";
import type { RevenueMetrics } from "@/lib/types";

// The revenue metrics as Excel columns (revenue before VAT, VAT apart),
// shared by the reports.
export const METRIC_COLUMNS: ExportColumn<RevenueMetrics>[] = [
  { header: "Hóa đơn", type: "number", value: (m) => m.orderCount },
  { header: "Giờ phòng", type: "decimal", value: (m) => m.roomMinutes / 60 },
  { header: "Tiền giờ", type: "money", value: (m) => m.roomFee },
  { header: "Giảm tiền giờ", type: "money", value: (m) => m.roomDiscount },
  { header: "Tiền hàng", type: "money", value: (m) => m.productSales },
  { header: "Giảm tiền hàng", type: "money", value: (m) => m.productDiscount },
  { header: "Phí dịch vụ", type: "money", value: (m) => m.serviceFee },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (m) => m.revenue },
  { header: "VAT", type: "money", value: (m) => m.vat },
  { header: "Tổng thu", type: "money", value: (m) => m.collected },
  { header: "Tiền mặt", type: "money", value: (m) => m.cash },
  { header: "Chuyển khoản", type: "money", value: (m) => m.transfer },
];
```

- [ ] **Step 6: Bộ lọc trên URL** — viết lại `502-frontend/src/hooks/use-report-filters.ts`:

```ts
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useBranchCode } from "@/lib/branch";
import { businessDate, firstDayOfMonth } from "@/lib/format";
import { can } from "@/lib/permissions";
import { GROUP_BYS } from "@/lib/reports";
import type { GroupBy } from "@/lib/types";

export interface ReportFilters {
  from: string;
  to: string;
  groupBy: GroupBy;
  compare: boolean;
  chain: boolean; // whole chain (chain manager only)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Report filters kept in the URL (?from&to&groupBy&compare=1&scope=chain), so
// a report can be shared as a link and survives a reload. Default: this
// month by day, this branch.
export function useReportFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const filters = useMemo<ReportFilters>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const validRange = !!from && !!to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to;
    const groupBy = searchParams.get("groupBy") as GroupBy | null;
    return {
      from: validRange ? from : firstDayOfMonth(),
      to: validRange ? to : businessDate(),
      groupBy: groupBy && GROUP_BYS.includes(groupBy) ? groupBy : "day",
      compare: searchParams.get("compare") === "1",
      chain: can(user, "reports.chain") && searchParams.get("scope") === "chain",
    };
  }, [searchParams, user]);

  const setFilters = useCallback(
    (patch: Partial<ReportFilters>) => {
      const next = { ...filters, ...patch };
      // Starts from the current URL so a report's own options (?role, ?by,
      // ?metric) are kept.
      const params = new URLSearchParams(searchParams);
      params.set("from", next.from);
      params.set("to", next.to);
      params.set("groupBy", next.groupBy);
      if (next.compare) params.set("compare", "1");
      else params.delete("compare");
      if (next.chain) params.set("scope", "chain");
      else params.delete("scope");
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [filters, pathname, router, searchParams],
  );

  return { filters, setFilters };
}

// An option of one report, kept in the URL next to the filters (?role=cskh);
// `fallback` when it is missing or unknown.
export function useReportOption<T extends string>(name: string, options: readonly T[], fallback: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = searchParams.get(name);
  const value = options.find((option) => option === current) ?? fallback;

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams);
      params.set(name, next);
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [name, pathname, router, searchParams],
  );

  return [value, setValue] as const;
}

// Query of a report over time: no branch means the whole chain.
export function reportParams(branch: string, filters: ReportFilters): Record<string, string> {
  return {
    ...rangeParams(branch, filters),
    groupBy: filters.groupBy,
    ...(filters.compare ? { compare: "1" } : {}),
  };
}

// Query of a report that is not a time series (no periods, no comparison).
export function rangeParams(branch: string, filters: ReportFilters): Record<string, string> {
  return { ...(filters.chain ? {} : { branch }), from: filters.from, to: filters.to };
}

// Scope of the data shown. It is read from the response, since the filters
// may already be ahead of it while a request is in flight or after it failed.
export function useReportScope(data: { branchId: number | null } | null) {
  const branch = useBranchCode();
  const { branches } = useAuth();
  const chain = data?.branchId === null;
  return {
    chain,
    name: !data ? "" : chain ? "Toàn chuỗi" : (branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase()),
    // Scope part of an export's file name.
    fileScope: chain ? "toan-chuoi" : branch,
  };
}
```

- [ ] **Step 7: Toolbar ẩn được các điều khiển** — trong `502-frontend/src/components/reports/report-toolbar.tsx`:
  - đổi chữ ký hàm thành:

```tsx
export function ReportToolbar({
  filters,
  onChange,
  onExport,
  periods = true,
  scope = true,
}: {
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  onExport?: () => Promise<void>;
  // false for the reports that are not a time series: no grouping, no comparison.
  periods?: boolean;
  // false where the scope is fixed (So sánh cơ sở is always the whole chain).
  scope?: boolean;
}) {
```

  - bọc `<Select …>…</Select>` và `<Label …>…So kỳ trước</Label>` trong `{periods && (<>…</>)}`;
  - đổi `{can(user, "reports.chain") && (` thành `{scope && can(user, "reports.chain") && (`.

- [ ] **Step 8: Biểu đồ xếp hạng** — tạo `502-frontend/src/components/reports/ranking-chart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCompact } from "@/lib/format";

const ROW_HEIGHT = 32;

// The first `limit` rows (already ranked, highest first) as horizontal bars.
export function RankingChart({
  rows,
  label,
  limit = 10,
}: {
  rows: { name: string; value: number }[];
  label: string;
  limit?: number;
}) {
  const data = rows.filter((row) => row.value > 0).slice(0, limit);
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 40 + data.length * ROW_HEIGHT }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCompact(value)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={104}
          tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value)}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 9: Heatmap** — tạo `502-frontend/src/components/reports/heatmap.tsx`:

```tsx
import { Fragment } from "react";
import { WEEKDAY_LABELS } from "@/lib/labels";
import type { HourCell } from "@/lib/types";
import { cn } from "@/lib/utils";

// Columns start at 06:00, the start of the business day, so a night stays
// in one row.
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 6) % 24);

// Weekday (rows, T2 → CN) × hour (columns) grid; the darker, the higher.
// Plain CSS grid: 24 narrow columns still fit a 360px phone.
export function Heatmap({
  cells,
  value,
  format,
}: {
  cells: HourCell[]; // 168, Monday 00:00 first (as the API returns them)
  value: (cell: HourCell) => number;
  format: (value: number) => string;
}) {
  const max = Math.max(0, ...cells.map(value));
  return (
    <div
      role="img"
      aria-label="Biểu đồ nhiệt theo thứ và giờ bắt đầu"
      className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px] text-muted-foreground"
    >
      <div />
      {HOURS.map((hour) => (
        <div key={hour} className="text-center tabular-nums">
          {hour % 3 === 0 ? hour : ""}
        </div>
      ))}
      {WEEKDAY_LABELS.map((label, day) => (
        <Fragment key={label}>
          <div className="self-center pr-1.5 leading-none">{label}</div>
          {HOURS.map((hour) => {
            const cell = cells[day * 24 + hour];
            const v = cell ? value(cell) : 0;
            return (
              <div
                key={hour}
                title={`${label} ${hour}:00–${hour}:59 · ${format(v)}`}
                className={cn("aspect-square rounded-[3px]", v === 0 && "bg-muted")}
                style={
                  v > 0
                    ? {
                        backgroundColor: `color-mix(in oklab, var(--chart-1) ${Math.round(20 + (80 * v) / max)}%, transparent)`,
                      }
                    : undefined
                }
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Trang Doanh thu dùng các phần chung** — trong `502-frontend/src/app/[branch]/reports/revenue/page.tsx`:
  - Xóa hằng `metricColumns` và hàm `tickLabel` của trang.
  - Thêm `import { METRIC_COLUMNS } from "@/lib/report-columns";` và dùng `...METRIC_COLUMNS` ở cả `periodColumns` lẫn `branchColumns`.
  - Đổi import từ `@/lib/reports` thành `delta, reportFileName, tickLabel, withinBillsRange`.
  - Đổi import của hook thành `reportParams, useReportFilters, useReportScope`.
  - Trong `RevenueView`:
    - bỏ `const { branches } = useAuth();`, và bỏ import `useAuth` nếu không còn dùng;
    - thay khối tính `isChainData` và `scopeName` bằng:

```tsx
  const scope = useReportScope(data);
  const isChainData = scope.chain;
  const scopeName = scope.name;
```

    - trong `exportExcel`, đổi `isChainData ? "toan-chuoi" : branch` thành `scope.fileScope`.
  - Xóa các import không còn dùng. Ít nhất là `useAuth`, và `GroupBy` nếu `tickLabel` là nơi duy nhất dùng nó. `npm run lint` sẽ báo nếu còn sót.

- [ ] **Step 11: Kiểm tra**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi, không cảnh báo mới. Nếu `tsc` báo thiếu module trong `.next`, đó là kiểu cũ còn sót; `next build` sẽ tạo lại chúng.

- [ ] **Step 12: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(frontend): nền tảng cho các báo cáo phân tích

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 7: Trang Nhân viên và trang Phòng

**Files:**
- Create: `502-frontend/src/app/[branch]/reports/staff/layout.tsx`, `.../staff/page.tsx`
- Create: `502-frontend/src/app/[branch]/reports/rooms/layout.tsx`, `.../rooms/page.tsx`
- Modify: `502-frontend/src/lib/navigation.ts`

**Interfaces:**
- Consumes: mọi thứ Task 6 cung cấp, và `GET /reports/staff?role=`, `GET /reports/rooms?by=`.

- [ ] **Step 1: Menu** — trong `502-frontend/src/lib/navigation.ts`:
  - thêm `DoorOpen`, `UserRound` vào import từ `lucide-react`;
  - thay mục `items` của nhóm "Báo cáo" bằng:

```ts
    items: [
      { title: "Doanh thu", path: "/reports/revenue", icon: ChartColumnBig, permission: "reports" },
      { title: "Nhân viên", path: "/reports/staff", icon: UserRound, permission: "reports" },
      { title: "Phòng", path: "/reports/rooms", icon: DoorOpen, permission: "reports" },
    ],
```

- [ ] **Step 2: Layout** — `502-frontend/src/app/[branch]/reports/staff/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Báo cáo nhân viên" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

  Tạo `502-frontend/src/app/[branch]/reports/rooms/layout.tsx` giống hệt, chỉ khác `title: "Báo cáo phòng"`.

- [ ] **Step 3: Trang Nhân viên** — `502-frontend/src/app/[branch]/reports/staff/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatHours, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, STAFF_ROLE_LABELS, UNASSIGNED_STAFF } from "@/lib/labels";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import { reportFileName, STAFF_ROLES } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { RevenueMetrics, StaffReport, StaffReportRow, StaffRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

// id null: the bills nobody was assigned to in this role.
const staffName = (row: StaffReportRow) => row.name ?? (row.id === null ? UNASSIGNED_STAFF : `#${row.id}`);

const columns: ExportColumn<StaffReportRow>[] = [
  { header: "Nhân viên", value: staffName },
  { header: "Tài khoản", value: (r) => r.username },
  { header: "Cơ sở", value: (r) => r.branchCode?.toUpperCase() ?? null },
  ...METRIC_COLUMNS,
  { header: "TB/hóa đơn", type: "money", value: (r) => r.avgRevenue },
];

// The number cells of a row (the same for the total).
function MetricCells({ m }: { m: RevenueMetrics }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.orderCount)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatHours(m.roomMinutes)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.roomFee)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.productSales)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.roomDiscount + m.productDiscount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.vat)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.avgRevenue)}</TableCell>
    </>
  );
}

// Revenue per CSKH, server or cashier; each bill counts in full for each of
// them, so every tab adds up to the revenue report.
function StaffView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [role, setRole] = useReportOption<StaffRole>("role", STAFF_ROLES, "cskh");
  const { data, loading } = useApiData<StaffReport | null>(
    "/reports/staff",
    { ...rangeParams(branch, filters), role },
    null,
    "Không thể tải báo cáo nhân viên",
  );
  const scope = useReportScope(data);
  // Labels from the data shown (the tab may be ahead of it while loading).
  const roleLabel = data ? STAFF_ROLE_LABELS[data.role] : "";

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`nhan-vien-${data.role}`, scope.fileScope, data.range.from, data.range.to), [
      toSheet(STAFF_ROLE_LABELS[data.role], columns, data.rows, {
        id: null,
        name: "Tổng",
        username: null,
        branchCode: null,
        ...data.totals,
      }),
    ]);
  };

  const t = data?.totals;
  const chartRows = (data?.rows ?? [])
    .filter((row) => row.id !== null)
    .map((row) => ({ name: staffName(row), value: row.revenue }));

  return (
    <>
      <PageHeader
        title="Nhân viên"
        description={`${scope.name} · Mỗi hóa đơn được tính trọn cho CSKH, phục vụ và thu ngân của nó. Doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} periods={false} />
      <Tabs value={role} onValueChange={(value) => setRole(value as StaffRole)}>
        <TabsList>
          {STAFF_ROLES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {STAFF_ROLE_LABELS[r]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : t.orderCount === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={UsersIcon}
              title="Chưa có hóa đơn"
              description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
            />
          </CardContent>
        </Card>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          {chartRows.some((row) => row.value > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 {roleLabel}</CardTitle>
                <CardDescription>Theo doanh thu chưa VAT (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <RankingChart rows={chartRows} label="Doanh thu" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{roleLabel}</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Dòng &quot;{UNASSIGNED_STAFF}&quot; gom các hóa đơn không ghi {roleLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>Giờ phòng</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.lg)}>Tiền giờ</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.lg)}>Tiền hàng</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>TB/HĐ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id ?? "none"}>
                      <TableCell className="font-medium">
                        <div className={cn(row.id === null && "text-muted-foreground")}>{staffName(row)}</div>
                        {row.username && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {row.username}
                            {scope.chain && row.branchCode && ` · ${row.branchCode.toUpperCase()}`}
                          </div>
                        )}
                      </TableCell>
                      <MetricCells m={row} />
                    </TableRow>
                  ))}
                </TableBody>
                {data.rows.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Tổng</TableCell>
                      <MetricCells m={t} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function StaffReportPage() {
  return (
    <Suspense>
      <StaffView />
    </Suspense>
  );
}
```

- [ ] **Step 4: Trang Phòng** — `502-frontend/src/app/[branch]/reports/rooms/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { DoorOpenIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatHours, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_ROOM, roomTypeLabel } from "@/lib/labels";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import { reportFileName, ROOM_GROUPS } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { RevenueMetrics, RoomGroup, RoomReport, RoomReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const GROUP_LABELS: Record<RoomGroup, string> = { room: "Theo phòng", type: "Theo loại phòng" };

// After their discounts.
const roomNet = (m: RevenueMetrics) => m.roomFee - m.roomDiscount;
const productNet = (m: RevenueMetrics) => m.productSales - m.productDiscount;

// A room, a room type (by=type) or "Không phòng" (id null).
function rowName(row: RoomReportRow, by: RoomGroup) {
  if (row.id === null) return row.name ?? NO_ROOM;
  return by === "type" ? roomTypeLabel(row.type) : (row.name ?? "");
}

function columnsFor(by: RoomGroup): ExportColumn<RoomReportRow>[] {
  return [
    { header: by === "room" ? "Phòng" : "Loại phòng", value: (r) => rowName(r, by) },
    ...(by === "room"
      ? [
          { header: "Loại", value: (r: RoomReportRow) => (r.type ? roomTypeLabel(r.type) : null) },
          { header: "Cơ sở", value: (r: RoomReportRow) => r.branchCode?.toUpperCase() ?? null },
        ]
      : [{ header: "Số phòng", type: "number" as const, value: (r: RoomReportRow) => r.rooms }]),
    { header: "Công suất", type: "percent", value: (r) => r.occupancy },
    ...METRIC_COLUMNS,
  ];
}

function MetricCells({ m, occupancy }: { m: RevenueMetrics; occupancy: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.orderCount)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatHours(m.roomMinutes)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatPercent(occupancy)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(roomNet(m))}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(productNet(m))}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
    </>
  );
}

// Revenue and occupancy per room or room type; every room of the scope is
// listed, also those without guests.
function RoomsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [by, setBy] = useReportOption<RoomGroup>("by", ROOM_GROUPS, "room");
  const { data, loading } = useApiData<RoomReport | null>(
    "/reports/rooms",
    { ...rangeParams(branch, filters), by },
    null,
    "Không thể tải báo cáo phòng",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`phong-${data.by}`, scope.fileScope, data.range.from, data.range.to), [
      // id null + a name: rowName() shows "Tổng".
      toSheet(GROUP_LABELS[data.by], columnsFor(data.by), data.rows, {
        id: null,
        name: "Tổng",
        type: null,
        branchCode: null,
        rooms: data.rows.reduce((sum, r) => sum + r.rooms, 0),
        occupancy: data.occupancy,
        ...data.totals,
      }),
    ]);
  };

  const t = data?.totals;
  const chartRows = data
    ? data.rows.filter((row) => row.id !== null).map((row) => ({ name: rowName(row, data.by), value: row.revenue }))
    : [];

  return (
    <>
      <PageHeader
        title="Phòng"
        description={`${scope.name} · Công suất = giờ có khách / giờ mở cửa (11:30 – 06:00, 18,5 giờ mỗi ngày). Doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} periods={false} />
      <Tabs value={by} onValueChange={(value) => setBy(value as RoomGroup)}>
        <TabsList>
          {ROOM_GROUPS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUP_LABELS[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatTile
              label="Doanh thu (chưa VAT)"
              value={formatMoney(t.revenue)}
              footer={`Tiền giờ ${formatMoney(roomNet(t))} · tiền hàng ${formatMoney(productNet(t))}`}
            />
            <StatTile label="Giờ phòng" value={formatHours(t.roomMinutes)} footer={`${formatNumber(t.orderCount)} hóa đơn`} />
            <StatTile
              label="Công suất"
              value={formatPercent(data.occupancy)}
              footer={`${data.rows.reduce((sum, r) => sum + r.rooms, 0)} phòng · ${data.days} ngày`}
            />
          </div>

          {t.orderCount === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={DoorOpenIcon}
                  title="Chưa có hóa đơn"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            chartRows.some((row) => row.value > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 {data.by === "room" ? "phòng" : "loại phòng"}</CardTitle>
                  <CardDescription>Theo doanh thu chưa VAT (đồng)</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <RankingChart rows={chartRows} label="Doanh thu" />
                </CardContent>
              </Card>
            )
          )}

          <Card>
            <CardHeader>
              <CardTitle>{GROUP_LABELS[data.by]}</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Tiền giờ và tiền hàng đã trừ giảm giá.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{data.by === "room" ? "Phòng" : "Loại phòng"}</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>Giờ phòng</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>Công suất</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền giờ</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền hàng</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id ?? "none"}>
                      <TableCell className="font-medium">
                        <div className={cn(row.id === null && "text-muted-foreground")}>{rowName(row, data.by)}</div>
                        {row.id !== null && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {data.by === "room"
                              ? [roomTypeLabel(row.type), scope.chain ? row.branchCode?.toUpperCase() : null]
                                  .filter(Boolean)
                                  .join(" · ")
                              : `${row.rooms} phòng`}
                          </div>
                        )}
                      </TableCell>
                      <MetricCells m={row} occupancy={row.occupancy} />
                    </TableRow>
                  ))}
                </TableBody>
                {data.rows.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Tổng</TableCell>
                      <MetricCells m={t} occupancy={data.occupancy} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function RoomsReportPage() {
  return (
    <Suspense>
      <RoomsView />
    </Suspense>
  );
}
```

- [ ] **Step 5: Kiểm tra**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi. Trong danh sách route của `next build` có `/[branch]/reports/staff` và `/[branch]/reports/rooms`.

- [ ] **Step 6: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(frontend): trang báo cáo nhân viên và phòng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 8: Trang Hàng hóa và trang Khung giờ

**Files:**
- Create: `502-frontend/src/app/[branch]/reports/products/layout.tsx`, `.../products/page.tsx`
- Create: `502-frontend/src/app/[branch]/reports/hours/layout.tsx`, `.../hours/page.tsx`
- Modify: `502-frontend/src/lib/navigation.ts`

**Interfaces:**
- Consumes: mọi thứ Task 6 cung cấp, và `GET /reports/products?by=`, `GET /reports/hours`.

- [ ] **Step 1: Menu** — trong `502-frontend/src/lib/navigation.ts`:
  - thêm `Clock`, `Package` vào import từ `lucide-react`;
  - thêm hai mục sau "Phòng" trong nhóm "Báo cáo":

```ts
      { title: "Hàng hóa", path: "/reports/products", icon: Package, permission: "reports" },
      { title: "Khung giờ", path: "/reports/hours", icon: Clock, permission: "reports" },
```

- [ ] **Step 2: Layout** — `502-frontend/src/app/[branch]/reports/products/layout.tsx` và `.../hours/layout.tsx`, cùng dạng với layout ở Task 7:
  - Hàng hóa: `title: "Báo cáo hàng hóa"`;
  - Khung giờ: `title: "Báo cáo khung giờ"`.

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Báo cáo hàng hóa" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 3: Trang Hàng hóa** — `502-frontend/src/app/[branch]/reports/products/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { PackageIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_CATEGORY } from "@/lib/labels";
import { PRODUCT_GROUPS, reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { ProductGroup, ProductReport, ProductReportRow, ProductSales } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const GROUP_LABELS: Record<ProductGroup, string> = { product: "Theo món", category: "Theo danh mục" };

// A category row with id null: the products without a category.
const rowName = (row: ProductReportRow) => row.name ?? (row.id === null ? NO_CATEGORY : "");

function columnsFor(by: ProductGroup): ExportColumn<ProductReportRow>[] {
  return [
    { header: by === "product" ? "Món" : "Danh mục", value: rowName },
    ...(by === "product"
      ? [
          { header: "Danh mục", value: (r: ProductReportRow) => (r.id === null ? null : (r.categoryName ?? NO_CATEGORY)) },
          { header: "Đơn vị", value: (r: ProductReportRow) => r.unit },
        ]
      : []),
    { header: "Cơ sở", value: (r) => r.branchCode?.toUpperCase() ?? null },
    { header: "Số lượng", type: "number", value: (r) => r.quantity },
    { header: "Thành tiền", type: "money", value: (r) => r.gross },
    { header: "Giảm giá phân bổ", type: "money", value: (r) => r.discount },
    { header: "Doanh thu thuần (chưa VAT)", type: "money", value: (r) => r.net },
    { header: "Tỷ trọng", type: "percent", value: (r) => r.share },
  ];
}

function SalesCells({ m, share }: { m: ProductSales; share: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.quantity)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.gross)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.discount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.net)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatPercent(share)}</TableCell>
    </>
  );
}

// Sales per product or category. A bill's product discount is spread over
// its lines in proportion to their amounts, so the net adds up to the
// revenue report's product sales after discount.
function ProductsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [by, setBy] = useReportOption<ProductGroup>("by", PRODUCT_GROUPS, "product");
  const { data, loading } = useApiData<ProductReport | null>(
    "/reports/products",
    { ...rangeParams(branch, filters), by },
    null,
    "Không thể tải báo cáo hàng hóa",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`hang-hoa-${data.by}`, scope.fileScope, data.range.from, data.range.to), [
      // id null + a name: rowName() shows "Tổng", the category column stays empty.
      toSheet(GROUP_LABELS[data.by], columnsFor(data.by), data.rows, {
        id: null,
        name: "Tổng",
        unit: null,
        categoryName: null,
        branchCode: null,
        share: data.totals.net ? 1 : null,
        ...data.totals,
      }),
    ]);
  };

  const t = data?.totals;
  const chartRows = (data?.rows ?? []).filter((row) => row.id !== null).map((row) => ({ name: rowName(row), value: row.net }));

  return (
    <>
      <PageHeader
        title="Hàng hóa"
        description={`${scope.name} · Doanh thu thuần = thành tiền − giảm giá của hóa đơn phân bổ theo tỷ lệ tiền từng món; chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} periods={false} />
      <Tabs value={by} onValueChange={(value) => setBy(value as ProductGroup)}>
        <TabsList>
          {PRODUCT_GROUPS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {GROUP_LABELS[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <StatTile label="Doanh thu thuần (chưa VAT)" value={formatMoney(t.net)} footer="Tiền hàng sau giảm giá" />
            <StatTile label="Thành tiền" value={formatMoney(t.gross)} footer="Số lượng × đơn giá" />
            <StatTile label="Giảm giá" value={formatMoney(t.discount)} footer="Giảm tiền hàng của các hóa đơn" />
            <StatTile label="Số lượng bán" value={formatNumber(t.quantity)} footer={`${data.rows.length} ${data.by === "product" ? "món" : "danh mục"}`} />
          </div>

          {data.rows.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={PackageIcon}
                  title="Chưa bán món nào"
                  description={`Không có món nào trên hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {chartRows.some((row) => row.value > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top 10 {data.by === "product" ? "món" : "danh mục"}</CardTitle>
                    <CardDescription>Theo doanh thu thuần chưa VAT (đồng)</CardDescription>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <RankingChart rows={chartRows} label="Doanh thu thuần" />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>{GROUP_LABELS[data.by]}</CardTitle>
                  <CardDescription>{formatDateRange(data.range)} · Tỷ trọng trên doanh thu thuần.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{data.by === "product" ? "Món" : "Danh mục"}</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.xs)}>SL</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.md)}>Thành tiền</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.md)}>Giảm giá</TableHead>
                        <TableHead className="text-right">Doanh thu</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tỷ trọng</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row) => (
                        <TableRow key={row.id ?? "none"}>
                          <TableCell className="font-medium">
                            <div className={cn(row.id === null && "text-muted-foreground")}>{rowName(row)}</div>
                            <div className="text-xs font-normal text-muted-foreground">
                              {[
                                data.by === "product" ? (row.categoryName ?? NO_CATEGORY) : null,
                                data.by === "product" ? row.unit : null,
                                scope.chain ? row.branchCode?.toUpperCase() : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </TableCell>
                          <SalesCells m={row} share={row.share} />
                        </TableRow>
                      ))}
                    </TableBody>
                    {data.rows.length > 1 && (
                      <TableFooter>
                        <TableRow>
                          <TableCell>Tổng</TableCell>
                          <SalesCells m={t} share={t.net ? 1 : null} />
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function ProductsReportPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
```

- [ ] **Step 4: Trang Khung giờ** — `502-frontend/src/app/[branch]/reports/hours/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { ClockIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { Heatmap } from "@/components/reports/heatmap";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, WEEKDAY_LABELS } from "@/lib/labels";
import { HOUR_METRICS, reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { HourCell, HourMetric, HoursReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const METRIC_LABELS: Record<HourMetric, string> = { sessions: "Lượt khách", revenue: "Doanh thu" };

const hourRange = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`;

interface WeekdayRow {
  label: string;
  sessions: number;
  revenue: number;
}

const cellColumns: ExportColumn<HourCell>[] = [
  { header: "Thứ", value: (c) => WEEKDAY_LABELS[c.weekday - 1] },
  { header: "Giờ bắt đầu", value: (c) => hourRange(c.hour) },
  { header: "Lượt khách", type: "number", value: (c) => c.sessions },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (c) => c.revenue },
];

const weekdayColumns: ExportColumn<WeekdayRow>[] = [
  { header: "Thứ", value: (r) => r.label },
  { header: "Lượt khách", type: "number", value: (r) => r.sessions },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (r) => r.revenue },
];

// Totals per weekday of the business day (T2 → CN).
function byWeekday(cells: HourCell[]): WeekdayRow[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const day = cells.filter((c) => c.weekday === i + 1);
    return {
      label,
      sessions: day.reduce((sum, c) => sum + c.sessions, 0),
      revenue: day.reduce((sum, c) => sum + c.revenue, 0),
    };
  });
}

// When the guests come: sessions and revenue (before VAT) by weekday of the
// business day × hour the session started. The bills are those paid in the
// range, as in the revenue report.
function HoursView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [metric, setMetric] = useReportOption<HourMetric>("metric", HOUR_METRICS, "sessions");
  const { data, loading } = useApiData<HoursReport | null>(
    "/reports/hours",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo khung giờ",
  );
  const scope = useReportScope(data);

  const value = (cell: HourCell) => (metric === "sessions" ? cell.sessions : cell.revenue);
  const format = (v: number) => (metric === "sessions" ? `${formatNumber(v)} lượt` : formatMoney(v));
  const weekdays = data ? byWeekday(data.cells) : [];
  const busiest = data?.cells.reduce<HourCell | null>((best, c) => (value(c) > (best ? value(best) : 0) ? c : best), null);

  const exportExcel = async () => {
    if (!data) return;
    const totals = { ...data.totals };
    await exportWorkbook(reportFileName("khung-gio", scope.fileScope, data.range.from, data.range.to), [
      toSheet("Theo thứ", weekdayColumns, weekdays, { label: "Tổng", ...totals }),
      toSheet("Theo giờ", cellColumns, data.cells),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Khung giờ"
        description={`${scope.name} · Theo thứ của ngày kinh doanh và giờ khách vào phòng; doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} periods={false} />
      <Tabs value={metric} onValueChange={(v) => setMetric(v as HourMetric)}>
        <TabsList>
          {HOUR_METRICS.map((m) => (
            <TabsTrigger key={m} value={m}>
              {METRIC_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatTile label="Lượt khách" value={formatNumber(data.totals.sessions)} footer="Số hóa đơn đã thanh toán" />
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(data.totals.revenue)} />
            <StatTile
              label={`Đông nhất (${METRIC_LABELS[metric].toLowerCase()})`}
              value={busiest ? `${WEEKDAY_LABELS[busiest.weekday - 1]} ${String(busiest.hour).padStart(2, "0")}h` : "—"}
              footer={busiest ? format(value(busiest)) : "Chưa có hóa đơn"}
            />
          </div>

          {data.totals.sessions === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={ClockIcon}
                  title="Chưa có hóa đơn"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{METRIC_LABELS[metric]} theo thứ × giờ</CardTitle>
                  <CardDescription>
                    {formatDateRange(data.range)} · Cột là giờ bắt đầu, từ 06:00; di chuột lên ô để xem số.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Heatmap cells={data.cells} value={value} format={format} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Theo thứ</CardTitle>
                  <CardDescription>Thứ của ngày kinh doanh (khách vào sau 0:00 tính cho hôm trước).</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thứ</TableHead>
                        <TableHead className="text-right">Lượt</TableHead>
                        <TableHead className="text-right">Doanh thu</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.sm)}>TB/lượt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weekdays.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className={NUM}>{formatNumber(row.sessions)}</TableCell>
                          <TableCell className={NUM}>{formatNumber(row.revenue)}</TableCell>
                          <TableCell className={cn(NUM, SHOW_FROM.sm)}>
                            {row.sessions ? formatNumber(Math.round(row.revenue / row.sessions)) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function HoursReportPage() {
  return (
    <Suspense>
      <HoursView />
    </Suspense>
  );
}
```

- [ ] **Step 5: Kiểm tra**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi. Có route `/[branch]/reports/products` và `/[branch]/reports/hours`.

- [ ] **Step 6: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(frontend): trang báo cáo hàng hóa và khung giờ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 9: Trang So sánh cơ sở

**Files:**
- Create: `502-frontend/src/app/[branch]/reports/branches/layout.tsx`, `.../branches/page.tsx`
- Modify: `502-frontend/src/lib/navigation.ts`

**Interfaces:**
- Consumes: `BranchesReport` (Task 6), `GET /reports/branches`. `ROUTE_PERMISSIONS` đã có `/reports/branches` → `reports.chain`, đứng trước `/reports`.

- [ ] **Step 1: Menu** — trong `502-frontend/src/lib/navigation.ts`:
  - thêm `ChartLine` vào import từ `lucide-react`;
  - thêm mục cuối của nhóm "Báo cáo" (chỉ quản lý hệ thống thấy):

```ts
      { title: "So sánh cơ sở", path: "/reports/branches", icon: ChartLine, permission: "reports.chain" },
```

- [ ] **Step 2: Layout** — `502-frontend/src/app/[branch]/reports/branches/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "So sánh cơ sở" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 3: Trang** — `502-frontend/src/app/[branch]/reports/branches/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { DeltaBadge, StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { reportParams, useReportFilters } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatCompact, formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import { delta, reportFileName, tickLabel } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { BranchReportRow, BranchesReport, ReportBucket, RevenueMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

function MetricCells({ m, share }: { m: RevenueMetrics; share: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.orderCount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.vat)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.collected)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.avgRevenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatPercent(share)}</TableCell>
    </>
  );
}

// Every branch side by side (chain manager only): the same numbers as the
// revenue report of the whole chain, per branch and per period.
function BranchesView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<BranchesReport | null>(
    "/reports/branches",
    reportParams(branch, { ...filters, chain: true }),
    null,
    "Không thể tải báo cáo so sánh cơ sở",
  );

  const t = data?.totals;
  const change = (pick: (m: RevenueMetrics) => number) =>
    data?.previous && t ? delta(pick(t), pick(data.previous.totals)) : undefined;

  const chartConfig = Object.fromEntries(
    (data?.branches ?? []).map((b, i) => [b.code, { label: b.name, color: `var(--chart-${(i % 5) + 1})` }]),
  ) satisfies ChartConfig;
  const chartData = data
    ? data.buckets.map((bucket, i) => ({
        tick: tickLabel(bucket, data.groupBy),
        label: bucket.label,
        ...Object.fromEntries(data.branches.map((b) => [b.code, b.series[i]])),
      }))
    : [];

  const exportExcel = async () => {
    if (!data) return;
    const branchColumns: ExportColumn<BranchReportRow>[] = [
      { header: "Cơ sở", value: (r) => r.name },
      ...METRIC_COLUMNS,
      { header: "Tỷ trọng doanh thu", type: "percent", value: (r) => r.share },
      ...(data.previous
        ? [{ header: "Doanh thu kỳ trước", type: "money" as const, value: (r: BranchReportRow) => r.previous?.revenue ?? 0 }]
        : []),
    ];
    type PeriodRow = ReportBucket & { values: number[]; total: number };
    const periodColumns: ExportColumn<PeriodRow>[] = [
      { header: "Kỳ", value: (r) => r.label },
      { header: "Từ ngày", value: (r) => formatDate(r.from) },
      { header: "Đến ngày", value: (r) => formatDate(r.to) },
      ...data.branches.map((b, i) => ({ header: b.name, type: "money" as const, value: (r: PeriodRow) => r.values[i] })),
      { header: "Toàn chuỗi", type: "money", value: (r) => r.total },
    ];
    const periods = data.buckets.map((bucket, i) => {
      const values = data.branches.map((b) => b.series[i]);
      return { ...bucket, values, total: values.reduce((sum, v) => sum + v, 0) };
    });
    await exportWorkbook(reportFileName("so-sanh-co-so", "toan-chuoi", data.range.from, data.range.to), [
      toSheet("Theo cơ sở", branchColumns, data.branches, {
        branchId: 0,
        code: "",
        name: "Toàn chuỗi",
        share: data.totals.revenue ? 1 : null,
        previous: data.previous?.totals ?? null,
        series: [],
        ...data.totals,
      }),
      toSheet("Doanh thu theo kỳ", periodColumns, periods, {
        key: "",
        label: "Tổng",
        from: data.range.from,
        to: data.range.to,
        values: data.branches.map((b) => b.revenue),
        total: data.totals.revenue,
      }),
    ]);
  };

  return (
    <>
      <PageHeader
        title="So sánh cơ sở"
        description={`Toàn chuỗi · Doanh thu chưa gồm VAT, VAT tính riêng. Theo giờ thanh toán. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} scope={false} />

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} delta={change((m) => m.revenue)} />
            <StatTile label="VAT" value={formatMoney(t.vat)} delta={change((m) => m.vat)} />
            <StatTile
              label="Tổng thu"
              value={formatMoney(t.collected)}
              delta={change((m) => m.collected)}
              footer={`Tiền mặt ${formatMoney(t.cash)} · CK ${formatMoney(t.transfer)}`}
            />
            <StatTile
              label="Hóa đơn"
              value={formatNumber(t.orderCount)}
              delta={change((m) => m.orderCount)}
              footer={`TB ${formatMoney(t.avgRevenue)} / hóa đơn`}
            />
          </div>
          {data.previous && (
            <p className="text-sm text-muted-foreground">So với kỳ trước: {formatDateRange(data.previous)}</p>
          )}

          {data.buckets.length > 1 && t.orderCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu theo kỳ</CardTitle>
                <CardDescription>{formatDateRange(data.range)} · chưa gồm VAT (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
                  <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(value: number) => formatCompact(value)}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(_, payload) =>
                            (payload?.[0]?.payload as { label?: string } | undefined)?.label ?? ""
                          }
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {data.branches.map((b) => (
                      <Line
                        key={b.code}
                        dataKey={b.code}
                        type="monotone"
                        stroke={`var(--color-${b.code})`}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Theo cơ sở</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Tỷ trọng tính trên doanh thu chưa VAT của toàn chuỗi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cơ sở</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng thu</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.md)}>TB/HĐ</TableHead>
                    <TableHead className={cn("text-right", SHOW_FROM.xs)}>Tỷ trọng</TableHead>
                    {data.previous && <TableHead className={cn("text-right", SHOW_FROM.sm)}>So kỳ trước</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.branches.map((b) => (
                    <TableRow key={b.branchId}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <MetricCells m={b} share={b.share} />
                      {data.previous && (
                        <TableCell className={cn("text-right", SHOW_FROM.sm)}>
                          <DeltaBadge value={delta(b.revenue, b.previous?.revenue)} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Toàn chuỗi</TableCell>
                    <MetricCells m={t} share={t.revenue ? 1 : null} />
                    {data.previous && (
                      <TableCell className={cn("text-right", SHOW_FROM.sm)}>
                        <DeltaBadge value={delta(t.revenue, data.previous.totals.revenue)} />
                      </TableCell>
                    )}
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function BranchesReportPage() {
  return (
    <Suspense>
      <BranchesView />
    </Suspense>
  );
}
```

- [ ] **Step 4: Kiểm tra**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi. Có route `/[branch]/reports/branches`.

- [ ] **Step 5: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(frontend): trang so sánh cơ sở

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 10: Tài liệu và kiểm tra cuối

**Files:**
- Modify: `CLAUDE.md`
- Modify: `DEPLOYMENT.md` (thêm §6.9 sau §6.8)
- Modify: `README.md` (chỉ khi có danh sách tính năng nhắc tới báo cáo)

- [ ] **Step 1: `CLAUDE.md`**
  - **Product direction**, câu "Implemented: …":
    - thay "revenue reports (`/reports/revenue`: …, Excel export)" bằng "revenue reports (`/reports/revenue`: …, Excel export) and reports by staff, room, product, hour and branch (`/reports/{staff,rooms,products,hours,branches}`)";
    - thay "Not yet: reports by staff/room/product/hour/branch, cost of goods and P&L (phases 2–3 …)" bằng "Not yet: cost of goods and P&L (phase 3 of `docs/superpowers/specs/2026-09-27-reporting-design.md`)".
  - **Commands**, dòng Migrations: thêm "`20260927180000_report_indexes` adds the report indexes `Order(status, endTime)` and `OrderItem(orderId)` (§6.9)" sau phần `_bill_number`.
  - **Backend architecture → Reports**, thêm vào cuối gạch đầu dòng:
    > `GET /reports/{staff?role=cskh|server|cashier, rooms?by=room|type, products?by=product|category, hours}` (`breakdown-reports.service.ts`) break the same bills down by subject, and their rows always add up to the revenue report: rows without a subject (id null: Chưa gán, Không phòng, Không danh mục) come last. Staff: each bill counts in full for its CSKH, server and cashier (`checkedOutById`). Rooms list every room of the scope, with occupancy = room minutes / (days × `VENUE_OPEN_MINUTES` 1110 × rooms). Products spread a bill's product discount over its lines in SQL, then `roundToTotal` rounds to the đồng without losing any; queries joining `OrderItem` never use `REVENUE_COLUMNS`. Hours: ISO weekday of the business day × local hour of `startTime`. `GET /reports/branches` (chain manager only) and the revenue report share one day × branch query. The pure helpers are in `breakdowns.ts`; `report-scope.ts` resolves the branch and checks the range.
  - **Frontend architecture → Reports**, thêm vào cuối gạch đầu dòng:
    > The breakdown pages keep their own option in the URL with `useReportOption` (`?role`, `?by`, `?metric`; `setFilters` keeps them), query with `rangeParams` (no periods), hide the period controls with `<ReportToolbar periods={false}>`, and read their scope from the response with `useReportScope`. Shared pieces: `components/reports/{ranking-chart,heatmap}.tsx`, `lib/report-columns.ts` (`METRIC_COLUMNS`). `/reports/branches` is chain-manager only (`reports.chain`).

- [ ] **Step 2: `DEPLOYMENT.md`** — thêm sau §6.8, theo cùng giọng văn tiếng Việt:

```markdown
### 6.9. Báo cáo nhân viên, phòng, hàng hóa, khung giờ, so sánh cơ sở (migration `20260927180000_report_indexes`)

- Chỉ thêm hai index (`Order(status, endTime)` và `OrderItem(orderId)`) để các báo cáo toàn chuỗi và báo cáo hàng hóa chạy nhanh; không đổi dữ liệu. Container backend tự chạy `prisma migrate deploy` khi khởi động.
- Menu **Báo cáo** có thêm Nhân viên, Phòng, Hàng hóa, Khung giờ; quản lý hệ thống có thêm **So sánh cơ sở**. Mọi báo cáo tính doanh thu chưa VAT và cộng lại đúng bằng báo cáo Doanh thu cùng kỳ.
```

- [ ] **Step 3: `README.md`** — chạy `grep -n "Báo cáo\|báo cáo\|Doanh thu" README.md`. Nếu có danh sách tính năng liệt kê báo cáo doanh thu, thêm một ý: "Báo cáo theo nhân viên (CSKH/phục vụ/thu ngân), phòng (công suất), hàng hóa, khung giờ và so sánh cơ sở". Nếu không có danh sách nào, bỏ qua bước này.

- [ ] **Step 4: Kiểm tra toàn bộ**

```bash
npm --prefix 502-backend run lint
npm --prefix 502-backend test
npm --prefix 502-backend run build
npm --prefix 502-backend run test:e2e
npm --prefix 502-frontend run lint
npm --prefix 502-frontend run build
```

Expected: tất cả qua.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md DEPLOYMENT.md README.md
git commit -m "docs: báo cáo nhân viên, phòng, hàng hóa, khung giờ, so sánh cơ sở

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

- [ ] **Step 6: Xem thủ công** (người điều phối làm, không phải subagent)

**Chuẩn bị**
1. Tạo DB `karaoke_ui_check` trên `kara502-pg`, chạy `migrate deploy` và `SEED_DEMO=1 npx prisma db seed`.
2. Chạy backend `PORT=4100 node dist/src/main`.
3. Chạy frontend `next dev -p 3100` với `NEXT_PUBLIC_API_URL=http://localhost:4100/api`.
4. Tạo vài hóa đơn có CSKH/phục vụ ở cs1 và cs2.

**Kiểm tra**
- Mỗi trang `/cs1/reports/{staff,rooms,products,hours,branches}` ở 360, 390 và 1280px: không cuộn ngang, và không có lỗi trang.
- Chuyển tab `role`/`by`/`metric`, rồi đổi khoảng ngày: tab vẫn được giữ trên URL.
- Xuất Excel ở mỗi trang và mở file.
- Đăng nhập `admin` → bật "Toàn chuỗi" ở các trang có công tắc; "So sánh cơ sở" hiện trong menu.
- Đăng nhập `ql1_cs1` → không có công tắc phạm vi, không có mục "So sánh cơ sở"; mở thẳng `/cs1/reports/branches` → trang "không có quyền".
- Đăng nhập `tn1_cs1` → không có nhóm "Báo cáo".
