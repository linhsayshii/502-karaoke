# Báo cáo — Giai đoạn 1: Nền tảng + Doanh thu theo kỳ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay trang "Doanh thu" hiện tại bằng module báo cáo mới `/reports/revenue`, có:
- gộp theo ngày/tuần/tháng/quý/năm và so với kỳ trước;
- xem toàn chuỗi (chỉ quản lý hệ thống);
- xuất Excel;
- **VAT tách riêng ở mọi nơi**: báo cáo, trang Hóa đơn, Sổ quỹ.

**Architecture:**
- Backend có module Nest mới `src/reports`.
- SQL (`$queryRaw`) gộp hóa đơn đã thanh toán theo ngày kinh doanh, tức `endTime` quy về giờ server, lùi 6 giờ.
- Các hàm TypeScript thuần gộp tiếp theo kỳ (`buckets.ts`) và tính các chỉ số (`revenue-metrics.ts`).
- Frontend có trang client mới. Bộ lọc nằm trên URL; toolbar, StatTile và bộ xuất Excel là thành phần dùng chung.

**Tech Stack:** NestJS 11, Prisma 5.22 (`$queryRaw`, `Prisma.sql`), PostgreSQL, Jest + supertest; Next.js 16 App Router, React 19, shadcn/ui, recharts, SheetJS (`xlsx`, đã có sẵn).

**Spec:** `docs/superpowers/specs/2026-09-27-reporting-design.md`. Kế hoạch này làm mục 3, 4 và 5 của spec.

## Global Constraints

- Mọi chữ hiển thị và thông báo lỗi bằng **tiếng Việt**. Comment trong code bằng tiếng Anh, theo đúng giọng văn hiện có.
- "Doanh thu" = **chưa VAT** = Σ(`finalAmount` − `taxAmount`); "VAT" = Σ `taxAmount`; "Tổng thu" = Σ `finalAmount`, và phải bằng `salesIncome` của sổ quỹ.
- Chỉ tính hóa đơn `status = COMPLETED`, theo `endTime`. Ngày kinh doanh D = [D 06:00, D+1 06:00) theo giờ server (`src/common/dates.ts`).
- Báo cáo cho khoảng tối đa **1830 ngày** (`MAX_REPORT_RANGE_DAYS`); các endpoint khác vẫn giữ `MAX_REPORT_DAYS = 366`.
- Phạm vi cơ sở đi qua `BranchScopeService.resolveOptionalBranchId`: quản lý hệ thống không truyền `branch` = toàn chuỗi; mọi tài khoản khác luôn bị ghim vào cơ sở của mình (mã khác → 403).
- Báo cáo chỉ cho `MANAGERS` (`CHAIN_MANAGER`, `BRANCH_MANAGER`).
- SQL luôn có tham số (tagged template `Prisma.sql`), không nối chuỗi từ dữ liệu người dùng.
- Frontend: bố cục theo container query `@container/main`, cột phụ ẩn bằng `SHOW_FROM`. Ở 360–390px không trang nào được cuộn ngang. Không thêm thư viện mới; component shadcn mới (nếu cần) thêm bằng `npx shadcn@latest add`.
- Không có test frontend. Kiểm tra bằng `npm run lint` và `npm run build`, rồi xem thủ công.
- Commit message theo kiểu repo (`feat(backend): …`, tiếng Việt) và kết thúc bằng:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

Lệnh chạy từ gốc repo:
- Backend: `cd 502-backend`, rồi `npm test` (unit) hoặc `npm run test:e2e` (cần Postgres test ở cổng 5433, xem `test/e2e.env`).
- Frontend: `cd 502-frontend`, rồi `npm run lint` và `npm run build`.

---

## File Structure

**Backend — tạo mới**

| File | Trách nhiệm |
|---|---|
| `502-backend/src/reports/buckets.ts` | Hàm thuần: kỳ gộp (`bucketOf`, `bucketsBetween`, `previousRange`, `rollUp`, `addDays`, `dayCount`) |
| `502-backend/src/reports/buckets.spec.ts` | Unit test cho kỳ |
| `502-backend/src/reports/revenue-metrics.ts` | Hàm thuần: `RevenueSums`, `RevenueMetrics`, `emptySums`, `addSums`, `sumAll`, `toMetrics` |
| `502-backend/src/reports/revenue-metrics.spec.ts` | Unit test cho chỉ số |
| `502-backend/src/reports/report-sql.ts` | Mảnh SQL: `businessDateSql`, `paidOrdersWhere`, `REVENUE_COLUMNS` |
| `502-backend/src/reports/dto/report-query.ts` | `ReportQuery` |
| `502-backend/src/reports/reports.service.ts` | `ReportsService.revenue()`, type `RevenueReport` |
| `502-backend/src/reports/reports.controller.ts` | `GET /reports/revenue` |
| `502-backend/src/reports/reports.module.ts` | Module |
| `502-backend/test/reports.e2e-spec.ts` | E2E cho báo cáo |

**Backend — sửa**

| File | Thay đổi |
|---|---|
| `src/common/dates.ts` (+ `dates.spec.ts`) | `MAX_REPORT_RANGE_DAYS`; `businessDatesBetween(from, to, maxDays)` |
| `src/app.module.ts` | Đăng ký `ReportsModule` |
| `src/orders/orders.controller.ts`, `orders.service.ts`, `dto/order-queries.ts` | Bỏ `/orders/statistics` |
| `src/funds/funds.service.ts` | Thêm `salesVat` vào summary |
| `test/foundation.e2e-spec.ts` | Chuyển các khẳng định thống kê sang `/reports/revenue` |
| `package.json` | `test:e2e` chạy `--runInBand` |

**Frontend — tạo mới** (dưới `502-frontend/src/`)

| File | Trách nhiệm |
|---|---|
| `lib/reports.ts` | `GROUP_BYS`, `delta()`, `reportFileName()` |
| `lib/excel-export.ts` | `ExportColumn`, `toSheet()`, `exportWorkbook()` |
| `components/stat-tile.tsx` | `StatTile` + `DeltaBadge` dùng chung |
| `hooks/use-report-filters.ts` | Bộ lọc báo cáo trên URL + `reportParams()` |
| `components/reports/report-toolbar.tsx` | Thanh công cụ báo cáo |
| `app/[branch]/reports/page.tsx` | Chuyển hướng tới `/reports/revenue` |
| `app/[branch]/reports/revenue/layout.tsx`, `page.tsx` | Trang Doanh thu |

**Frontend — sửa**

| File | Thay đổi |
|---|---|
| `lib/types.ts` | Kiểu báo cáo; bỏ `DailyStat`; `FundSummary.salesVat` |
| `lib/labels.ts` | `GROUP_BY_LABELS` |
| `lib/format.ts` | `formatHours` |
| `lib/permissions.ts` | Quyền `reports`, `reports.chain` |
| `lib/navigation.ts` | Nhóm "Báo cáo" |
| `components/date-range-picker.tsx` | Lựa chọn nhanh theo quý và năm |
| `app/[branch]/sales/statistics/page.tsx`, `…/cskh/page.tsx`, `…/revenue/page.tsx`, `app/[branch]/sales/overview/page.tsx` | Chuyển hướng tới `/reports/revenue` |
| `app/[branch]/sales/statistics/bills/page.tsx` | Tách VAT ở phần tổng |
| `app/[branch]/funds/page.tsx` | Dùng `StatTile` chung; hiện VAT bán hàng |

**Tài liệu:** `CLAUDE.md`.

---

### Task 1: Cho phép khoảng báo cáo dài hơn trong `dates.ts`

**Files:**
- Modify: `502-backend/src/common/dates.ts` (hằng ở dòng ~11-12, `businessDatesBetween` ở dòng ~66-86)
- Test: `502-backend/src/common/dates.spec.ts`

**Interfaces:**
- Produces:
  - `export const MAX_REPORT_RANGE_DAYS = 1830;`
  - `businessDatesBetween(from: string, to: string, maxDays = MAX_REPORT_DAYS): string[]`, với thông báo lỗi `Chỉ xem được tối đa ${maxDays} ngày một lần`.

- [ ] **Step 1: Viết test (sẽ fail)** — thêm vào cuối `502-backend/src/common/dates.spec.ts`, và thêm `MAX_REPORT_RANGE_DAYS` vào import ở đầu file:

```ts
describe('businessDatesBetween with a longer limit', () => {
  it('accepts up to maxDays days', () => {
    // 2024 is a leap year: 366 + 365 days.
    expect(
      businessDatesBetween('2024-01-01', '2025-12-31', MAX_REPORT_RANGE_DAYS),
    ).toHaveLength(731);
    expect(() => businessDatesBetween('2024-01-01', '2025-12-31')).toThrow(
      'Chỉ xem được tối đa 366 ngày một lần',
    );
    expect(() =>
      businessDatesBetween('2020-01-01', '2025-12-31', MAX_REPORT_RANGE_DAYS),
    ).toThrow('Chỉ xem được tối đa 1830 ngày một lần');
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `cd 502-backend && npx jest src/common/dates.spec.ts`
Expected: FAIL. TypeScript báo `MAX_REPORT_RANGE_DAYS` không được export.

- [ ] **Step 3: Sửa code** trong `502-backend/src/common/dates.ts`. Thay khối hằng:

```ts
// Longest period a report may span.
export const MAX_REPORT_DAYS = 366;
```

bằng:

```ts
// Longest period a list or report may span.
export const MAX_REPORT_DAYS = 366;

// Longest period of the reports module (grouped by week … year).
export const MAX_REPORT_RANGE_DAYS = 1830;
```

Và thay `businessDatesBetween` bằng:

```ts
// Every business date from..to, both included.
export function businessDatesBetween(
  from: string,
  to: string,
  maxDays = MAX_REPORT_DAYS,
): string[] {
  const current = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (current > end) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
  const dates: string[] = [];
  while (current <= end) {
    dates.push(toDateString(current));
    if (dates.length > maxDays) {
      throw new BadRequestException(
        `Chỉ xem được tối đa ${maxDays} ngày một lần`,
      );
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
```

- [ ] **Step 4: Chạy test để thấy pass**

Run: `cd 502-backend && npx jest src/common/dates.spec.ts`
Expected: PASS (mọi test cũ vẫn xanh).

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/common/dates.ts 502-backend/src/common/dates.spec.ts
git commit -m "feat(backend): giới hạn 1830 ngày cho báo cáo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kỳ gộp — `buckets.ts`

**Files:**
- Create: `502-backend/src/reports/buckets.ts`
- Test: `502-backend/src/reports/buckets.spec.ts`

**Interfaces:**
- Produces:
  - `GROUP_BYS: readonly ['day','week','month','quarter','year']`
  - `type GroupBy`
  - `interface Bucket { key: string; label: string; from: string; to: string }`
  - `addDays(date: string, days: number): string`
  - `dayCount(from: string, to: string): number`
  - `bucketOf(date: string, groupBy: GroupBy): Bucket`
  - `bucketsBetween(from: string, to: string, groupBy: GroupBy): Bucket[]`
  - `previousRange(from: string, to: string): { from: string; to: string }`
  - `rollUp<R extends { date: string }, A>(buckets: Bucket[], groupBy: GroupBy, rows: R[], empty: () => A, add: (acc: A, row: R) => void): { bucket: Bucket; value: A }[]`

- [ ] **Step 1: Viết test (sẽ fail)** — `502-backend/src/reports/buckets.spec.ts`:

```ts
import {
  addDays,
  bucketOf,
  bucketsBetween,
  dayCount,
  previousRange,
  rollUp,
} from './buckets';

describe('bucketOf', () => {
  it('labels days, months, quarters and years in Vietnamese', () => {
    expect(bucketOf('2026-09-27', 'day')).toEqual({
      key: '2026-09-27',
      label: '27/09/2026',
      from: '2026-09-27',
      to: '2026-09-27',
    });
    expect(bucketOf('2026-02-10', 'month')).toEqual({
      key: '2026-02',
      label: 'T2/2026',
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(bucketOf('2024-02-10', 'month').to).toBe('2024-02-29');
    expect(bucketOf('2026-08-15', 'quarter')).toEqual({
      key: '2026-Q3',
      label: 'Q3/2026',
      from: '2026-07-01',
      to: '2026-09-30',
    });
    expect(bucketOf('2026-12-31', 'quarter').from).toBe('2026-10-01');
    expect(bucketOf('2026-12-31', 'year')).toEqual({
      key: '2026',
      label: '2026',
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('uses ISO weeks: Monday to Sunday, in the year of their Thursday', () => {
    // 2026-09-27 is a Sunday.
    expect(bucketOf('2026-09-27', 'week')).toEqual({
      key: '2026-W39',
      label: 'Tuần 39 (21/09–27/09)',
      from: '2026-09-21',
      to: '2026-09-27',
    });
    // 1 Jan 2026 is a Thursday: week 1 starts on Monday 29 Dec 2025.
    expect(bucketOf('2025-12-29', 'week')).toMatchObject({
      key: '2026-W01',
      from: '2025-12-29',
      to: '2026-01-04',
    });
    // 1 Jan 2027 (a Friday) still belongs to week 53 of 2026.
    expect(bucketOf('2027-01-01', 'week').key).toBe('2026-W53');
  });
});

describe('bucketsBetween', () => {
  it('clips the first and the last bucket to the range', () => {
    expect(
      bucketsBetween('2026-08-15', '2026-10-05', 'month').map((b) => [
        b.key,
        b.from,
        b.to,
      ]),
    ).toEqual([
      ['2026-08', '2026-08-15', '2026-08-31'],
      ['2026-09', '2026-09-01', '2026-09-30'],
      ['2026-10', '2026-10-01', '2026-10-05'],
    ]);
  });

  it('covers every day of the range, in order', () => {
    expect(
      bucketsBetween('2026-09-01', '2026-09-03', 'day').map((b) => b.key),
    ).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(
      bucketsBetween('2026-09-27', '2026-09-28', 'week').map((b) => b.key),
    ).toEqual(['2026-W39', '2026-W40']);
    expect(
      bucketsBetween('2025-11-20', '2026-02-01', 'year').map((b) => [
        b.key,
        b.from,
        b.to,
      ]),
    ).toEqual([
      ['2025', '2025-11-20', '2025-12-31'],
      ['2026', '2026-01-01', '2026-02-01'],
    ]);
  });
});

describe('date arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayCount('2024-01-01', '2024-12-31')).toBe(366);
    expect(dayCount('2026-09-27', '2026-09-27')).toBe(1);
  });

  it('gives the period of the same length right before', () => {
    expect(previousRange('2026-09-01', '2026-09-27')).toEqual({
      from: '2026-08-05',
      to: '2026-08-31',
    });
    expect(previousRange('2026-03-01', '2026-03-01')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });
});

describe('rollUp', () => {
  it('sums rows into their bucket and keeps empty buckets', () => {
    const buckets = bucketsBetween('2026-09-01', '2026-10-31', 'month');
    const rows = [
      { date: '2026-09-03', n: 2 },
      { date: '2026-09-20', n: 3 },
    ];
    const result = rollUp(
      buckets,
      'month',
      rows,
      () => ({ n: 0 }),
      (acc, row) => {
        acc.n += row.n;
      },
    );
    expect(result.map((r) => [r.bucket.key, r.value.n])).toEqual([
      ['2026-09', 5],
      ['2026-10', 0],
    ]);
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `cd 502-backend && npx jest src/reports/buckets.spec.ts`
Expected: FAIL với `Cannot find module './buckets'`.

- [ ] **Step 3: Viết code** — `502-backend/src/reports/buckets.ts`:

```ts
// Report periods: business dates (YYYY-MM-DD) grouped by day, ISO week,
// month, quarter or year. Pure calendar arithmetic on the date strings (in
// UTC), so the server time zone never shifts a day.

export const GROUP_BYS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export interface Bucket {
  key: string;
  label: string;
  // First and last business date of the bucket (within the range when the
  // bucket comes from bucketsBetween).
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
// Date.UTC normalises overflow: day 0 is the last day of the previous month.
const ymd = (year: number, month: number, day: number) =>
  fromUtc(Date.UTC(year, month - 1, day));
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

// Number of dates from..to, both included.
export function dayCount(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1;
}

// ISO 8601 week: starts on Monday and belongs to the year of its Thursday.
function isoWeek(date: string) {
  const weekday = (new Date(toUtc(date)).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(date, -weekday);
  const thursday = addDays(monday, 3);
  const year = Number(thursday.slice(0, 4));
  const week =
    Math.floor((toUtc(thursday) - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return { monday, year, week };
}

// The whole bucket a date falls in (not clipped to any range).
export function bucketOf(date: string, groupBy: GroupBy): Bucket {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  switch (groupBy) {
    case 'day':
      return {
        key: date,
        label: `${dayMonth(date)}/${year}`,
        from: date,
        to: date,
      };
    case 'week': {
      const { monday, year: weekYear, week } = isoWeek(date);
      const sunday = addDays(monday, 6);
      return {
        key: `${weekYear}-W${String(week).padStart(2, '0')}`,
        label: `Tuần ${week} (${dayMonth(monday)}–${dayMonth(sunday)})`,
        from: monday,
        to: sunday,
      };
    }
    case 'month':
      return {
        key: date.slice(0, 7),
        label: `T${month}/${year}`,
        from: ymd(year, month, 1),
        to: ymd(year, month + 1, 0),
      };
    case 'quarter': {
      const quarter = Math.ceil(month / 3);
      return {
        key: `${year}-Q${quarter}`,
        label: `Q${quarter}/${year}`,
        from: ymd(year, quarter * 3 - 2, 1),
        to: ymd(year, quarter * 3 + 1, 0),
      };
    }
    case 'year':
      return {
        key: String(year),
        label: String(year),
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      };
  }
}

// The buckets covering from..to in order; the first and the last one are
// clipped to the range.
export function bucketsBetween(
  from: string,
  to: string,
  groupBy: GroupBy,
): Bucket[] {
  const buckets: Bucket[] = [];
  for (let date = from; date <= to; ) {
    const bucket = bucketOf(date, groupBy);
    buckets.push({ ...bucket, from: date, to: bucket.to < to ? bucket.to : to });
    date = addDays(bucket.to, 1);
  }
  return buckets;
}

// The period of the same number of days right before from..to.
export function previousRange(from: string, to: string) {
  const days = dayCount(from, to);
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

// Adds rows that carry a business `date` into their bucket; buckets without
// rows keep `empty()`.
export function rollUp<R extends { date: string }, A>(
  buckets: Bucket[],
  groupBy: GroupBy,
  rows: R[],
  empty: () => A,
  add: (acc: A, row: R) => void,
): { bucket: Bucket; value: A }[] {
  const byKey = new Map(
    buckets.map((bucket) => [bucket.key, { bucket, value: empty() }]),
  );
  for (const row of rows) {
    const entry = byKey.get(bucketOf(row.date, groupBy).key);
    if (entry) add(entry.value, row);
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4: Chạy test để thấy pass**

Run: `cd 502-backend && npx jest src/reports/buckets.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/reports/buckets.ts 502-backend/src/reports/buckets.spec.ts
git commit -m "feat(backend): gộp ngày kinh doanh theo tuần/tháng/quý/năm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Chỉ số doanh thu — `revenue-metrics.ts`

**Files:**
- Create: `502-backend/src/reports/revenue-metrics.ts`
- Test: `502-backend/src/reports/revenue-metrics.spec.ts`

**Interfaces:**
- Produces:
  - `interface RevenueSums { orderCount; roomMinutes; roomFee; productSales; roomDiscount; productDiscount; serviceFee; vat; collected; cash; transfer }` (tất cả kiểu `number`)
  - `interface RevenueMetrics extends RevenueSums { revenue: number; avgRevenue: number }`
  - `emptySums(): RevenueSums`
  - `addSums(acc: RevenueSums, row: RevenueSums): void` (cộng dồn vào `acc`)
  - `sumAll(rows: RevenueSums[]): RevenueSums`
  - `toMetrics(sums: RevenueSums): RevenueMetrics` (chỉ lấy các trường của `RevenueSums`, bỏ cột thừa như `date`)

- [ ] **Step 1: Viết test (sẽ fail)** — `502-backend/src/reports/revenue-metrics.spec.ts`:

```ts
import {
  addSums,
  emptySums,
  RevenueSums,
  sumAll,
  toMetrics,
} from './revenue-metrics';

const bill = (fields: Partial<RevenueSums>): RevenueSums => ({
  ...emptySums(),
  orderCount: 1,
  ...fields,
});

describe('revenue metrics', () => {
  it('keeps VAT out of revenue', () => {
    const metrics = toMetrics(
      sumAll([
        // (100,000 + 50,000 − 5,000) + 10% VAT
        bill({
          roomFee: 100000,
          productSales: 50000,
          productDiscount: 5000,
          vat: 14500,
          collected: 159500,
          cash: 159500,
        }),
        bill({ roomFee: 60000, collected: 60000, transfer: 60000 }),
      ]),
    );
    expect(metrics).toMatchObject({
      orderCount: 2,
      revenue: 205000,
      vat: 14500,
      collected: 219500,
      cash: 159500,
      transfer: 60000,
      avgRevenue: 102500,
    });
    expect(metrics.revenue).toBe(
      metrics.roomFee -
        metrics.roomDiscount +
        metrics.productSales -
        metrics.productDiscount +
        metrics.serviceFee,
    );
  });

  it('has no average without bills', () => {
    expect(toMetrics(emptySums())).toMatchObject({ revenue: 0, avgRevenue: 0 });
  });

  it('drops extra columns of a SQL row', () => {
    const row = { date: '2026-09-27', ...bill({ collected: 1000 }) };
    expect(toMetrics(row)).not.toHaveProperty('date');
  });

  it('adds into the accumulator', () => {
    const acc = emptySums();
    addSums(acc, bill({ roomMinutes: 90 }));
    addSums(acc, bill({ roomMinutes: 30 }));
    expect(acc).toMatchObject({ orderCount: 2, roomMinutes: 120 });
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `cd 502-backend && npx jest src/reports/revenue-metrics.spec.ts`
Expected: FAIL với `Cannot find module './revenue-metrics'`.

- [ ] **Step 3: Viết code** — `502-backend/src/reports/revenue-metrics.ts`:

```ts
// Revenue of a set of paid bills. VAT is always kept apart: `revenue` is
// before VAT, and `collected` = revenue + vat is what the guests paid (the
// same as the fund's sales receipts).
export interface RevenueSums {
  orderCount: number;
  roomMinutes: number;
  roomFee: number; // tiền giờ, before its discount
  productSales: number; // tiền hàng, before its discount
  roomDiscount: number;
  productDiscount: number;
  serviceFee: number;
  vat: number;
  collected: number; // Σ finalAmount
  cash: number;
  transfer: number;
}

export interface RevenueMetrics extends RevenueSums {
  revenue: number; // doanh thu chưa VAT
  avgRevenue: number; // revenue per bill
}

const SUM_FIELDS = [
  'orderCount',
  'roomMinutes',
  'roomFee',
  'productSales',
  'roomDiscount',
  'productDiscount',
  'serviceFee',
  'vat',
  'collected',
  'cash',
  'transfer',
] as const satisfies readonly (keyof RevenueSums)[];

export function emptySums(): RevenueSums {
  return Object.fromEntries(
    SUM_FIELDS.map((field) => [field, 0]),
  ) as unknown as RevenueSums;
}

export function addSums(acc: RevenueSums, row: RevenueSums): void {
  for (const field of SUM_FIELDS) acc[field] += Number(row[field]);
}

export function sumAll(rows: RevenueSums[]): RevenueSums {
  const acc = emptySums();
  for (const row of rows) addSums(acc, row);
  return acc;
}

export function toMetrics(sums: RevenueSums): RevenueMetrics {
  const clean = sumAll([sums]);
  const revenue = clean.collected - clean.vat;
  return {
    ...clean,
    revenue,
    avgRevenue: clean.orderCount ? Math.round(revenue / clean.orderCount) : 0,
  };
}
```

- [ ] **Step 4: Chạy test để thấy pass**

Run: `cd 502-backend && npx jest src/reports/revenue-metrics.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/reports/revenue-metrics.ts 502-backend/src/reports/revenue-metrics.spec.ts
git commit -m "feat(backend): chỉ số doanh thu tách riêng VAT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Endpoint `GET /reports/revenue`

**Files:**
- Create: `502-backend/src/reports/report-sql.ts`
- Create: `502-backend/src/reports/dto/report-query.ts`
- Create: `502-backend/src/reports/reports.service.ts`
- Create: `502-backend/src/reports/reports.controller.ts`
- Create: `502-backend/src/reports/reports.module.ts`
- Modify: `502-backend/src/app.module.ts` (import + mảng `imports`)
- Modify: `502-backend/package.json` (script `test:e2e`)
- Test: `502-backend/test/reports.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `bucketsBetween`, `previousRange`, `rollUp`, `GroupBy`, `GROUP_BYS`, `Bucket` (Task 2)
  - `RevenueSums`, `RevenueMetrics`, `emptySums`, `addSums`, `sumAll`, `toMetrics` (Task 3)
  - `businessDatesBetween(from, to, MAX_REPORT_RANGE_DAYS)` (Task 1)
- Produces:
  - `GET /api/reports/revenue?branch&from&to&groupBy&compare` → `RevenueReport`:
    ```ts
    {
      branchId: number | null;
      range: { from: string; to: string };
      groupBy: GroupBy;
      totals: RevenueMetrics;
      previous: { from: string; to: string; totals: RevenueMetrics } | null;
      buckets: (Bucket & RevenueMetrics)[];
      byBranch: ({ branchId: number; code: string; name: string } & RevenueMetrics)[] | null;
      voided: { count: number; amount: number };
    }
    ```
  - Từ `report-sql.ts`: `businessDateSql(column: Prisma.Sql): Prisma.Sql`, `paidOrdersWhere(branchId: number | undefined, from: string, to: string): Prisma.Sql`, `REVENUE_COLUMNS: Prisma.Sql` (bảng `"Order"` có alias `o`). Giai đoạn 2 sẽ dùng lại.

- [ ] **Step 1: Chạy e2e tuần tự** — hai file e2e đều reset cùng một DB. Trong `502-backend/package.json` đổi:

```json
    "test:e2e": "jest --config ./test/jest-e2e.json"
```

thành:

```json
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
```

- [ ] **Step 2: Viết e2e (sẽ fail)** — `502-backend/test/reports.e2e-spec.ts`:

```ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Reports against a fresh database seeded with the demo accounts
// (SEED_DEMO=1). Every total must add up with the bills and the fund.

type Json = Record<string, unknown>;
type Metrics = Record<string, number>;
interface Report {
  branchId: number | null;
  totals: Metrics;
  previous: { from: string; to: string; totals: Metrics } | null;
  buckets: {
    key: string;
    from: string;
    to: string;
    collected: number;
    roomMinutes: number;
  }[];
  byBranch: { code: string; collected: number }[] | null;
  voided: { count: number; amount: number };
}

describe('Reports (e2e)', () => {
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const as = (username: string) => ({
    get: (url: string) =>
      api()
        .get(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`),
    post: (url: string, body: Json = {}) =>
      api()
        .post(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`)
        .send(body),
    patch: (url: string, body: Json = {}) =>
      api()
        .patch(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[username]}`)
        .send(body),
  });

  const login = async (username: string, password = 'demo123') => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysFromToday = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  };
  // Yesterday → tomorrow always holds the business day of "now".
  const period = `from=${ymd(daysFromToday(-1))}&to=${ymd(daysFromToday(1))}`;
  const report = async (username: string, query = '') =>
    (await as(username).get(`/reports/revenue?${period}${query}`).expect(200))
      .body as Report;

  // Opens a room, orders 2 beers, applies `adjustments` and pays.
  const payBill = async (
    cashier: string,
    roomName: string,
    adjustments: Json,
    paymentMethod: 'CASH' | 'TRANSFER',
  ) => {
    const rooms = (await as(cashier).get('/rooms').expect(200)).body as Json[];
    const products = (await as(cashier).get('/products').expect(200))
      .body as Json[];
    const roomId = rooms.find((r) => r.name === roomName)!.id;
    const beerId = products.find((p) => p.name === 'Bia Tiger')!.id;
    const opened = (await as(cashier).post('/orders', { roomId }).expect(201))
      .body as Json;
    await as(cashier)
      .patch(`/orders/${opened.id as number}`, {
        items: [{ productId: beerId, quantity: 2 }],
        ...adjustments,
      })
      .expect(200);
    return (
      await as(cashier)
        .post(`/orders/${opened.id as number}/checkout`, { paymentMethod })
        .expect(200)
    ).body as Json;
  };

  beforeAll(async () => {
    const env = { ...process.env, SEED_DEMO: '1' };
    execSync('npx prisma migrate reset --force --skip-generate', {
      env,
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();

    await login('admin', 'admin123');
    for (const u of ['ql_cs1', 'tn_cs1', 'ql_cs2', 'tn_cs2']) await login(u);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('access', () => {
    it('is for managers only, within their own branch', async () => {
      await as('tn_cs1').get(`/reports/revenue?${period}`).expect(403);
      await as('ql_cs1').get(`/reports/revenue?${period}&branch=cs2`).expect(403);
      await as('admin')
        .get(`/reports/revenue?${period}&branch=khong-co`)
        .expect(404);
    });

    it('validates the query', async () => {
      await as('ql_cs1').get('/reports/revenue').expect(400);
      await as('ql_cs1')
        .get(`/reports/revenue?${period}&groupBy=hour`)
        .expect(400);
      await as('ql_cs1')
        .get('/reports/revenue?from=2020-01-01&to=2026-01-01')
        .expect(400);
      await as('ql_cs1')
        .get('/reports/revenue?from=2026-02-01&to=2026-01-01')
        .expect(400);
    });
  });

  describe('revenue', () => {
    it('keeps VAT apart from revenue', async () => {
      const bill = await payBill(
        'tn_cs1',
        'P101',
        { serviceFeePercent: 5, taxPercent: 10 },
        'CASH',
      );
      const vat = Number(bill.taxAmount);
      const paid = Number(bill.finalAmount);
      expect(vat).toBeGreaterThan(0);

      const { totals } = await report('ql_cs1');
      expect(totals).toMatchObject({
        orderCount: 1,
        vat,
        collected: paid,
        revenue: paid - vat,
        cash: paid,
        transfer: 0,
      });
      expect(totals.revenue).toBe(
        totals.roomFee -
          totals.roomDiscount +
          totals.productSales -
          totals.productDiscount +
          totals.serviceFee,
      );
    });

    it('adds up the whole chain for the chain manager only', async () => {
      const cs2Bill = await payBill('tn_cs2', 'P201', {}, 'TRANSFER');
      const cs2Paid = Number(cs2Bill.finalAmount);

      const cs1 = await report('ql_cs1');
      expect(cs1.byBranch).toBeNull();
      expect(cs1.branchId).not.toBeNull();

      const chain = await report('admin');
      expect(chain.branchId).toBeNull();
      expect(chain.totals.collected).toBe(cs1.totals.collected + cs2Paid);
      expect(chain.byBranch!.map((b) => b.code)).toEqual([
        'cs1',
        'cs2',
        'cs3',
        'cs4',
      ]);
      expect(chain.byBranch!.reduce((s, b) => s + b.collected, 0)).toBe(
        chain.totals.collected,
      );
      expect((await report('admin', '&branch=cs2')).totals.transfer).toBe(
        cs2Paid,
      );
    });

    it('groups by period and compares with the period before', async () => {
      const from = ymd(daysFromToday(-40));
      const to = ymd(daysFromToday(1));
      const res = (
        await as('ql_cs1')
          .get(
            `/reports/revenue?from=${from}&to=${to}&groupBy=month&compare=1`,
          )
          .expect(200)
      ).body as Report;
      expect(res.buckets.length).toBeGreaterThanOrEqual(2);
      expect(res.buckets[0].from).toBe(from);
      expect(res.buckets[res.buckets.length - 1].to).toBe(to);
      expect(res.buckets.reduce((s, b) => s + b.collected, 0)).toBe(
        res.totals.collected,
      );
      expect(res.previous).toMatchObject({
        to: ymd(daysFromToday(-41)),
        totals: { orderCount: 0 },
      });
      expect((await report('ql_cs1')).previous).toBeNull();
    });

    it('puts a bill on the business day of its payment (06:00 → 06:00)', async () => {
      const prisma = app.get(PrismaService);
      const cs3 = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs3' },
      });
      const paidAt = (time: string, amount: number) =>
        prisma.order.create({
          data: {
            branchId: cs3.id,
            status: 'COMPLETED',
            startTime: new Date('2026-01-09T22:00:00'),
            endTime: new Date(`2026-01-10T${time}`),
            finalAmount: amount,
            paymentMethod: 'CASH',
          },
        });
      await paidAt('05:59:59', 100000);
      await paidAt('06:00:00', 200000);

      const res = (
        await as('admin')
          .get('/reports/revenue?branch=cs3&from=2026-01-09&to=2026-01-10')
          .expect(200)
      ).body as Report;
      expect(res.buckets.map((b) => [b.key, b.collected])).toEqual([
        ['2026-01-09', 100000],
        ['2026-01-10', 200000],
      ]);
      // 22:00 → 05:59:59 is 480 started minutes.
      expect(res.buckets[0].roomMinutes).toBe(480);
    });

    it('leaves voided bills out of every total', async () => {
      const bill = await payBill('tn_cs1', 'P102', {}, 'CASH');
      const before = await report('ql_cs1');
      await as('ql_cs1')
        .post(`/orders/${bill.id as number}/void`, { reason: 'nhập nhầm' })
        .expect(200);
      const after = await report('ql_cs1');
      expect(after.totals.collected).toBe(
        before.totals.collected - Number(bill.finalAmount),
      );
      expect(after.totals.orderCount).toBe(before.totals.orderCount - 1);
      expect(after.voided).toEqual({
        count: 1,
        amount: Number(bill.finalAmount),
      });
    });
  });
});
```

- [ ] **Step 3: Chạy e2e để thấy fail**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts`
Expected: FAIL. `/reports/revenue` trả 404 thay vì 403/200. (Cần Postgres test đang chạy, xem `test/e2e.env`.)

- [ ] **Step 4: Viết các mảnh SQL** — `502-backend/src/reports/report-sql.ts`:

```ts
import { Prisma } from '@prisma/client';
import { BUSINESS_DAY_START_HOUR, businessDayRange } from '../common/dates';

// SQL pieces of the reports, for $queryRaw (always parameterised).
// Prisma stores DateTime as UTC `timestamp(3)`, so a column is moved to the
// time zone the server computes business days in (common/dates.ts works in
// the process's local time) before its date is taken.

// The time zone of JS local time, i.e. of businessDateOf().
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// A JS Date as a UTC `timestamp` (the cast drops the ISO "Z").
const utcTimestamp = (date: Date) =>
  Prisma.sql`${date.toISOString()}::timestamp`;

const DAY_START = Prisma.raw(`interval '${BUSINESS_DAY_START_HOUR} hours'`);

// YYYY-MM-DD business day of a timestamp column.
export function businessDateSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char(((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${localTimeZone()}) - ${DAY_START}, 'YYYY-MM-DD')`;
}

// Paid bills (`"Order" o`) of the business days from..to, by payment time;
// every branch when branchId is undefined.
export function paidOrdersWhere(
  branchId: number | undefined,
  from: string,
  to: string,
): Prisma.Sql {
  const range = businessDayRange(from, to);
  const branch =
    branchId === undefined
      ? Prisma.empty
      : Prisma.sql`AND o."branchId" = ${branchId}`;
  return Prisma.sql`o."status" = 'COMPLETED'
    AND o."endTime" >= ${utcTimestamp(range.gte!)}
    AND o."endTime" < ${utcTimestamp(range.lt!)}
    ${branch}`;
}

// The RevenueSums columns of a group of `"Order" o` rows. Room minutes are
// started minutes, as the bill counts them.
export const REVENUE_COLUMNS = Prisma.sql`
  COUNT(*)::int AS "orderCount",
  COALESCE(SUM(CEIL(EXTRACT(EPOCH FROM (o."endTime" - o."startTime")) / 60)), 0)::float8 AS "roomMinutes",
  COALESCE(SUM(o."hourlyFee"), 0)::float8 AS "roomFee",
  COALESCE(SUM(o."totalProductPrice"), 0)::float8 AS "productSales",
  COALESCE(SUM(o."hourlyDiscountAmount"), 0)::float8 AS "roomDiscount",
  COALESCE(SUM(o."discountAmount"), 0)::float8 AS "productDiscount",
  COALESCE(SUM(o."serviceFeeAmount"), 0)::float8 AS "serviceFee",
  COALESCE(SUM(o."taxAmount"), 0)::float8 AS "vat",
  COALESCE(SUM(o."finalAmount"), 0)::float8 AS "collected",
  COALESCE(SUM(o."finalAmount") FILTER (WHERE o."paymentMethod" IS DISTINCT FROM 'TRANSFER'), 0)::float8 AS "cash",
  COALESCE(SUM(o."finalAmount") FILTER (WHERE o."paymentMethod" = 'TRANSFER'), 0)::float8 AS "transfer"`;
```

- [ ] **Step 5: Viết DTO** — `502-backend/src/reports/dto/report-query.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { GROUP_BYS, type GroupBy } from '../buckets';

export class ReportQuery {
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
```

- [ ] **Step 6: Viết service** — `502-backend/src/reports/reports.service.ts`:

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
import { ReportQuery } from './dto/report-query';

export interface RevenueReport {
  branchId: number | null; // null: the whole chain
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: { from: string; to: string; totals: RevenueMetrics } | null;
  buckets: (Bucket & RevenueMetrics)[];
  byBranch:
    | ({ branchId: number; code: string; name: string } & RevenueMetrics)[]
    | null;
  // Bills paid and then voided (not in any total).
  voided: { count: number; amount: number };
}

// Reports of paid bills, by business day of payment. The SQL groups by day
// (and a dimension); the periods and totals are added up here.
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  async revenue(user: AuthUser, query: ReportQuery): Promise<RevenueReport> {
    const branchId = await this.branchScope.resolveOptionalBranchId(
      user,
      query.branch,
    );
    // Validates the dates and the length of the range.
    businessDatesBetween(query.from, query.to, MAX_REPORT_RANGE_DAYS);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare
      ? previousRange(query.from, query.to)
      : null;

    const [daily, previousDaily, byBranch, voided] = await Promise.all([
      this.dailyRevenue(branchId, query.from, query.to),
      previous
        ? this.dailyRevenue(branchId, previous.from, previous.to)
        : Promise.resolve([]),
      branchId === undefined
        ? this.revenueByBranch(query.from, query.to)
        : Promise.resolve(null),
      this.voided(branchId, query.from, query.to),
    ]);

    const buckets = rollUp(
      bucketsBetween(query.from, query.to, groupBy),
      groupBy,
      daily,
      emptySums,
      addSums,
    ).map(({ bucket, value }) => ({ ...bucket, ...toMetrics(value) }));

    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      groupBy,
      totals: toMetrics(sumAll(daily)),
      previous: previous && {
        ...previous,
        totals: toMetrics(sumAll(previousDaily)),
      },
      buckets,
      byBranch,
      voided,
    };
  }

  private dailyRevenue(branchId: number | undefined, from: string, to: string) {
    return this.prisma.$queryRaw<(RevenueSums & { date: string })[]>`
      SELECT ${businessDateSql(Prisma.sql`o."endTime"`)} AS "date", ${REVENUE_COLUMNS}
      FROM "Order" o
      WHERE ${paidOrdersWhere(branchId, from, to)}
      GROUP BY 1`;
  }

  // Every active branch (and inactive ones that still sold in the period).
  private async revenueByBranch(from: string, to: string) {
    const [branches, rows] = await Promise.all([
      this.prisma.branch.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, active: true },
      }),
      this.prisma.$queryRaw<(RevenueSums & { branchId: number })[]>`
        SELECT o."branchId" AS "branchId", ${REVENUE_COLUMNS}
        FROM "Order" o
        WHERE ${paidOrdersWhere(undefined, from, to)}
        GROUP BY o."branchId"`,
    ]);
    return branches.flatMap((branch) => {
      const row = rows.find((r) => r.branchId === branch.id);
      if (!branch.active && !row) return [];
      return [
        {
          branchId: branch.id,
          code: branch.code,
          name: branch.name,
          ...toMetrics(row ?? emptySums()),
        },
      ];
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

- [ ] **Step 7: Viết controller và module**

`502-backend/src/reports/reports.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { ReportsService } from './reports.service';
import { ReportQuery } from './dto/report-query';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Revenue (before VAT, VAT apart) per period; the whole chain when the
  // chain manager leaves out ?branch.
  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.reportsService.revenue(user, query);
  }
}
```

`502-backend/src/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

Trong `502-backend/src/app.module.ts`, thêm `import { ReportsModule } from './reports/reports.module';` sau import của `ImportsModule`, và thêm `ReportsModule,` sau `ImportsModule,` trong mảng `imports`.

- [ ] **Step 8: Chạy e2e để thấy pass**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts`
Expected: PASS cả 7 test.

Nếu test "business day" fail, kiểm tra:
- `TZ=Asia/Ho_Chi_Minh` trong `test/e2e.env`;
- giá trị `Intl.DateTimeFormat().resolvedOptions().timeZone` trong tiến trình Jest phải trùng múi giờ mà `new Date('2026-01-10T06:00:00')` đang dùng.

- [ ] **Step 9: Lint và unit test**

Run: `cd 502-backend && npm run lint && npm test`
Expected: không lỗi lint, mọi unit test PASS.

- [ ] **Step 10: Commit**

```bash
git add 502-backend/src/reports 502-backend/src/app.module.ts 502-backend/test/reports.e2e-spec.ts 502-backend/package.json
git commit -m "feat(backend): API báo cáo doanh thu theo kỳ, toàn chuỗi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bỏ `GET /orders/statistics`

**Files:**
- Modify: `502-backend/src/orders/orders.controller.ts` (dòng 18 import, dòng 40-47 route)
- Modify: `502-backend/src/orders/orders.service.ts` (import dòng ~21-22 và ~29; method `getStatistics` dòng ~499-555)
- Modify: `502-backend/src/orders/dto/order-queries.ts` (class `StatisticsQuery`)
- Test: `502-backend/test/foundation.e2e-spec.ts` (dòng ~148-150, ~336-346, ~489-494, ~627-632)

**Interfaces:**
- Consumes: `GET /reports/revenue` (Task 4); `totals.orderCount`, `totals.collected`, `totals.transfer`.

- [ ] **Step 1: Chuyển test foundation sang API mới** trong `502-backend/test/foundation.e2e-spec.ts`:

(a) Trong `it('keeps cashiers to cashier work')`, thay

```ts
      await as('tn_cs1')
        .get('/orders/statistics?from=2026-01-01&to=2026-01-02')
        .expect(403);
```

bằng

```ts
      await as('tn_cs1')
        .get('/reports/revenue?from=2026-01-01&to=2026-01-02')
        .expect(403);
```

(b) Trong `it('reports revenue to managers')`, thay phần từ `const res = await as('ql_cs1')` tới hết khẳng định bằng:

```ts
      const res = await as('ql_cs1')
        .get(`/reports/revenue?from=${ymd(yesterday)}&to=${ymd(today)}`)
        .expect(200);
      const report = res.body as { totals: { orderCount: number } };
      expect(report.totals.orderCount).toBe(1);
```

(c) Thay helper `revenue` (ở khối có `const period = ...`) bằng:

```ts
    const revenueTotals = async () =>
      (
        (await as('ql_cs2').get(`/reports/revenue?${period}`).expect(200))
          .body as { totals: { collected: number; transfer: number } }
      ).totals;
    // What the guests paid (VAT included), as the fund's sales receipts.
    const revenue = async () => (await revenueTotals()).collected;
```

(d) Trong `it('writes the fund receipt at checkout and matches revenue')`, thay

```ts
      const days = (
        await as('ql_cs2').get(`/orders/statistics?${period}`).expect(200)
      ).body as Json[];
      expect(days.reduce((s, d) => s + (d.transfer as number), 0)).toBe(
        finalAmount,
      );
```

bằng

```ts
      expect((await revenueTotals()).transfer).toBe(finalAmount);
```

- [ ] **Step 2: Bỏ route và code cũ**

- `orders.controller.ts`:
  - xóa khối `@Get('statistics') … getStatistics(…) { … }`;
  - sửa import thành `import { ListOrdersQuery } from './dto/order-queries';`.
- `orders.service.ts`:
  - xóa toàn bộ method `getStatistics` cùng comment phía trên nó ("Revenue of paid bills per business day of payment…");
  - sửa import thành `import { ListOrdersQuery } from './dto/order-queries';`;
  - xóa `businessDateOf` và `businessDatesBetween` khỏi import của `'../common/dates'` (giữ các tên khác đang dùng, vd `businessDayRange`).
- `dto/order-queries.ts`: xóa class `StatisticsQuery`.

- [ ] **Step 3: Kiểm tra không còn tham chiếu**

Run: `cd 502-backend && grep -rn "getStatistics\|StatisticsQuery\|orders/statistics" src test`
Expected: không có kết quả.

- [ ] **Step 4: Lint và test**

Run: `cd 502-backend && npm run lint && npm test && npm run test:e2e`
Expected: lint sạch (không còn import thừa); unit PASS; cả hai file e2e PASS.

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/orders 502-backend/test/foundation.e2e-spec.ts
git commit -m "refactor(backend): bỏ /orders/statistics, dùng /reports/revenue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: VAT bán hàng trong sổ quỹ (`salesVat`)

**Files:**
- Modify: `502-backend/src/funds/funds.service.ts` (method `summary`, dòng ~110-182)
- Test: `502-backend/test/reports.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /funds/summary` có thêm `salesVat: number`, là Σ `Order.taxAmount` của các hóa đơn có phiếu thu còn hiệu lực trong kỳ (theo `occurredAt`).

- [ ] **Step 1: Viết test (sẽ fail)** — trong `test/reports.e2e-spec.ts`, ở cuối `it('keeps VAT apart from revenue')`, thêm:

```ts
      const fund = (
        await as('ql_cs1').get(`/funds/summary?${period}`).expect(200)
      ).body as Json;
      expect(fund).toMatchObject({ salesIncome: paid, salesVat: vat });
```

Và ở cuối `it('leaves voided bills out of every total')`, thêm:

```ts
      const fund = (
        await as('ql_cs1').get(`/funds/summary?${period}`).expect(200)
      ).body as Json;
      expect(fund.salesIncome).toBe(after.totals.collected);
      expect(fund.salesVat).toBe(after.totals.vat);
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts`
Expected: FAIL. `salesVat` là `undefined`.

- [ ] **Step 3: Sửa code** trong `FundsService.summary`:

(a) Đổi `const [inPeriod, before, linked] = await Promise.all([` thành `const [inPeriod, before, linked, salesTax] = await Promise.all([`, và thêm phần tử thứ tư vào cuối mảng (sau `groupBy` của `linked`):

```ts
      // VAT inside the sales receipts: the tax of the bills they belong to.
      this.prisma.order.aggregate({
        where: {
          fundTransaction: {
            is: { branchId, cancelledAt: null, occurredAt: period },
          },
        },
        _sum: { taxAmount: true },
      }),
```

(b) Trong object trả về, ngay sau `salesIncome: linkedSum(TransactionType.INCOME),` thêm:

```ts
      salesVat: Number(salesTax._sum.taxAmount ?? 0),
```

- [ ] **Step 4: Chạy để thấy pass**

Run: `cd 502-backend && npm run lint && npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/funds/funds.service.ts 502-backend/test/reports.e2e-spec.ts
git commit -m "feat(backend): sổ quỹ tách VAT của phiếu thu bán hàng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Nền tảng frontend — kiểu, nhãn, định dạng, Excel, StatTile, ngày

**Files:**
- Modify: `502-frontend/src/lib/types.ts` (xóa `DailyStat` dòng ~153-165; sửa `FundSummary`)
- Modify: `502-frontend/src/lib/labels.ts`
- Modify: `502-frontend/src/lib/format.ts`
- Create: `502-frontend/src/lib/reports.ts`
- Create: `502-frontend/src/lib/excel-export.ts`
- Create: `502-frontend/src/components/stat-tile.tsx`
- Modify: `502-frontend/src/app/[branch]/funds/page.tsx` (bỏ `StatTile` cục bộ ở dòng ~92-101)
- Modify: `502-frontend/src/components/date-range-picker.tsx` (`presets()`)

**Interfaces:**
- Produces:
  - Kiểu:
    ```ts
    type GroupBy = "day" | "week" | "month" | "quarter" | "year";
    interface RevenueMetrics { orderCount; roomMinutes; roomFee; productSales; roomDiscount; productDiscount; serviceFee; vat; collected; cash; transfer; revenue; avgRevenue } // number
    interface ReportBucket { key; label; from; to } // string
    interface RevenueReport { branchId; range; groupBy; totals; previous; buckets; byBranch; voided } // như Task 4
    ```
    `FundSummary.salesVat: number`.
  - `GROUP_BY_LABELS: Record<GroupBy, string>` (labels.ts)
  - `formatHours(minutes: number): string` (format.ts)
  - `GROUP_BYS: GroupBy[]`, `delta(current: number, previous: number | undefined): number | null`, `reportFileName(report: string, scope: string, from: string, to: string): string` (reports.ts)
  - `ExportColumn<R>`, `ExportTable`, `toSheet<R>(name, columns, rows, totals?)`, `exportWorkbook(fileName, tables)` (excel-export.ts)
  - `StatTile({ label, value, footer?, delta? })`, `DeltaBadge({ value })` (stat-tile.tsx). `delta` `undefined` = không hiện badge; `null` = hiện "—".

- [ ] **Step 1: Kiểu** — trong `502-frontend/src/lib/types.ts`, xóa cả khối `// GET /orders/statistics: one business day.` cùng `interface DailyStat {…}`, rồi thêm vào chỗ đó:

```ts
// Reports (GET /reports/*): revenue is before VAT, VAT apart,
// collected = revenue + VAT = what was paid.
export type GroupBy = "day" | "week" | "month" | "quarter" | "year";

export interface RevenueMetrics {
  orderCount: number;
  roomMinutes: number;
  roomFee: number;
  productSales: number;
  roomDiscount: number;
  productDiscount: number;
  serviceFee: number;
  vat: number;
  collected: number;
  cash: number;
  transfer: number;
  revenue: number;
  avgRevenue: number;
}

export interface ReportBucket {
  key: string;
  label: string;
  from: string;
  to: string;
}

// GET /reports/revenue
export interface RevenueReport {
  branchId: number | null; // null: whole chain
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: { from: string; to: string; totals: RevenueMetrics } | null;
  buckets: (ReportBucket & RevenueMetrics)[];
  byBranch: ({ branchId: number; code: string; name: string } & RevenueMetrics)[] | null;
  voided: { count: number; amount: number };
}
```

Trong `interface FundSummary`, thêm sau `salesIncome: number;`:

```ts
  salesVat: number; // VAT inside salesIncome
```

- [ ] **Step 2: Nhãn và định dạng**

Thêm vào cuối `502-frontend/src/lib/labels.ts` (thêm `GroupBy` vào import kiểu `@/lib/types` đã có ở đầu file; nếu chưa có thì thêm `import type { GroupBy } from "@/lib/types";`):

```ts
export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};
```

Thêm vào `502-frontend/src/lib/format.ts`, ngay sau `formatDuration`:

```ts
const hoursFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

// Room time in hours: 150 minutes → "2,5 giờ".
export function formatHours(minutes: number) {
  return `${hoursFormat.format(minutes / 60)} giờ`;
}
```

- [ ] **Step 3: Tiện ích báo cáo** — `502-frontend/src/lib/reports.ts`:

```ts
import type { GroupBy } from "@/lib/types";

export const GROUP_BYS: GroupBy[] = ["day", "week", "month", "quarter", "year"];

// Change against the previous period (0.12 = +12%); null when the previous
// value is 0 (nothing to compare with).
export function delta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

// doanh-thu_cs1_2026-09-01_2026-09-27.xlsx
export function reportFileName(report: string, scope: string, from: string, to: string) {
  return `${report}_${scope}_${from}_${to}.xlsx`;
}
```

- [ ] **Step 4: Xuất Excel** — `502-frontend/src/lib/excel-export.ts`:

```ts
// Report exports with SheetJS, loaded only when needed (as the Excel import).
// Amounts are written as numbers with a number format, so they add up in
// Excel.

export type ColumnType = "text" | "number" | "decimal" | "money" | "percent";

export interface ExportColumn<R> {
  header: string;
  value: (row: R) => string | number | null;
  type?: ColumnType;
}

// A sheet ready to write: the header row, the cells, a format per column.
export interface ExportTable {
  name: string;
  headers: string[];
  formats: (string | undefined)[];
  rows: (string | number | null)[][];
}

const FORMATS: Record<ColumnType, string | undefined> = {
  text: undefined,
  number: "#,##0",
  decimal: "#,##0.0",
  money: "#,##0",
  percent: "0.0%",
};

// `totals`, when given, becomes the last row.
export function toSheet<R>(name: string, columns: ExportColumn<R>[], rows: R[], totals?: R): ExportTable {
  return {
    name,
    headers: columns.map((c) => c.header),
    formats: columns.map((c) => FORMATS[c.type ?? "text"]),
    rows: [...rows, ...(totals ? [totals] : [])].map((row) => columns.map((c) => c.value(row))),
  };
}

export async function exportWorkbook(fileName: string, tables: ExportTable[]) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const table of tables) {
    const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
    table.rows.forEach((row, r) =>
      row.forEach((value, c) => {
        const format = table.formats[c];
        const cell = sheet[XLSX.utils.encode_cell({ r: r + 1, c })];
        if (format && cell && typeof value === "number") cell.z = format;
      }),
    );
    sheet["!cols"] = table.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    // Excel limits sheet names to 31 characters.
    XLSX.utils.book_append_sheet(workbook, sheet, table.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, fileName);
}
```

- [ ] **Step 5: StatTile dùng chung** — `502-frontend/src/components/stat-tile.tsx`:

```tsx
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// Change against the previous period; "—" when there is nothing to compare.
export function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    );
  }
  const up = value >= 0;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <Badge variant="outline" className={cn("tabular-nums", up ? "text-success" : "text-destructive")}>
      <Icon />
      {up && "+"}
      {percent.format(value)}
    </Badge>
  );
}

// A total at the top of a report. `delta` undefined: not comparing.
export function StatTile({
  label,
  value,
  footer,
  delta,
}: {
  label: string;
  value: string;
  footer?: React.ReactNode;
  delta?: number | null;
}) {
  return (
    <Card className="@container/card gap-2">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {delta !== undefined && (
          <CardAction>
            <DeltaBadge value={delta} />
          </CardAction>
        )}
      </CardHeader>
      {footer && <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
```

- [ ] **Step 6: Sổ quỹ dùng StatTile chung và hiện VAT** — trong `502-frontend/src/app/[branch]/funds/page.tsx`:
  - xóa `function StatTile(…) { … }` cục bộ;
  - thêm `import { StatTile } from "@/components/stat-tile";`;
  - nếu `CardFooter` không còn dùng ở chỗ khác trong file thì bỏ khỏi import `@/components/ui/card` (`npm run lint` sẽ báo).

  Thay footer của ô "Tổng thu":

```tsx
            footer={`Trong đó bán hàng ${formatMoney(summary.salesIncome)}`}
```

thành

```tsx
            footer={`Trong đó bán hàng ${formatMoney(summary.salesIncome)} (VAT ${formatMoney(summary.salesVat)})`}
```

- [ ] **Step 7: Lựa chọn nhanh theo quý và năm** — trong `502-frontend/src/components/date-range-picker.tsx`, đổi import date-fns thành:

```ts
import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
} from "date-fns";
```

và thay `presets()` bằng:

```ts
function presets(): { label: string; range: DateRangeValue }[] {
  const today = parseISO(businessDate());
  const lastMonth = subMonths(today, 1);
  const lastQuarter = subQuarters(today, 1);
  const lastYear = subYears(today, 1);
  return [
    { label: "Hôm nay", range: { from: ymd(today), to: ymd(today) } },
    { label: "Hôm qua", range: { from: ymd(subDays(today, 1)), to: ymd(subDays(today, 1)) } },
    { label: "7 ngày qua", range: { from: ymd(subDays(today, 6)), to: ymd(today) } },
    { label: "Tháng này", range: { from: ymd(startOfMonth(today)), to: ymd(today) } },
    {
      label: "Tháng trước",
      range: { from: ymd(startOfMonth(lastMonth)), to: ymd(endOfMonth(lastMonth)) },
    },
    { label: "Quý này", range: { from: ymd(startOfQuarter(today)), to: ymd(today) } },
    {
      label: "Quý trước",
      range: { from: ymd(startOfQuarter(lastQuarter)), to: ymd(endOfQuarter(lastQuarter)) },
    },
    { label: "Năm nay", range: { from: ymd(startOfYear(today)), to: ymd(today) } },
    {
      label: "Năm trước",
      range: { from: ymd(startOfYear(lastYear)), to: ymd(endOfYear(lastYear)) },
    },
  ];
}
```

- [ ] **Step 8: Lint** (build sẽ fail cho tới Task 9, vì trang Doanh thu cũ vẫn import `DailyStat`)

Run: `cd 502-frontend && npm run lint`
Expected: chỉ có lỗi ở `app/[branch]/sales/statistics/page.tsx` (thiếu `DailyStat`), không có lỗi ở chỗ khác. Trang này sẽ được thay ở Task 9.

- [ ] **Step 9: Commit**

```bash
git add 502-frontend/src/lib 502-frontend/src/components/stat-tile.tsx 502-frontend/src/components/date-range-picker.tsx "502-frontend/src/app/[branch]/funds/page.tsx"
git commit -m "feat(frontend): nền tảng báo cáo: kiểu, xuất Excel, StatTile chung

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Quyền, menu, bộ lọc trên URL, toolbar

**Files:**
- Modify: `502-frontend/src/lib/permissions.ts`
- Modify: `502-frontend/src/lib/navigation.ts` (`NAV_GROUPS`)
- Create: `502-frontend/src/hooks/use-report-filters.ts`
- Create: `502-frontend/src/components/reports/report-toolbar.tsx`

**Interfaces:**
- Consumes: `GROUP_BYS` (Task 7), `GROUP_BY_LABELS` (Task 7), `DateRangePicker`, `useAuth()` (trả `{ user, branches, … }`), `can()`.
- Produces:
  - Quyền `"reports"` (MANAGERS) và `"reports.chain"` (CHAIN_MANAGER).
  - `interface ReportFilters { from: string; to: string; groupBy: GroupBy; compare: boolean; chain: boolean }`
  - `useReportFilters(): { filters: ReportFilters; setFilters: (patch: Partial<ReportFilters>) => void }` (dùng `useSearchParams`, nên trang phải bọc `Suspense`)
  - `reportParams(branch: string, filters: ReportFilters): Record<string, string>`
  - `ReportToolbar({ filters, onChange, onExport? })`

- [ ] **Step 1: Quyền** — trong `502-frontend/src/lib/permissions.ts`:

(a) Trong `type Permission`, thêm sau dòng `| "sales.reports"`:

```ts
  | "reports" // Báo cáo (managers)
  | "reports.chain" // whole-chain reports and branch comparison
```

(b) Trong `MATRIX`, thêm sau `"sales.reports": MANAGERS,`:

```ts
  reports: MANAGERS,
  "reports.chain": ["CHAIN_MANAGER"],
```

(c) Trong `ROUTE_PERMISSIONS`, thêm ở **đầu** mảng:

```ts
  ["/reports/branches", "reports.chain"],
  ["/reports", "reports"],
```

- [ ] **Step 2: Menu** — trong `502-frontend/src/lib/navigation.ts`:

(a) Trong nhóm "Bán hàng", xóa dòng:

```ts
      { title: "Doanh thu", path: "/sales/statistics", icon: ChartColumnBig, permission: "sales.reports" },
```

(b) Thêm nhóm mới ngay sau nhóm "Bán hàng" (trước nhóm "Kho"):

```ts
  {
    label: "Báo cáo",
    items: [{ title: "Doanh thu", path: "/reports/revenue", icon: ChartColumnBig, permission: "reports" }],
  },
```

- [ ] **Step 3: Bộ lọc trên URL** — `502-frontend/src/hooks/use-report-filters.ts`:

```ts
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
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
      const params = new URLSearchParams({ from: next.from, to: next.to, groupBy: next.groupBy });
      if (next.compare) params.set("compare", "1");
      if (next.chain) params.set("scope", "chain");
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [filters, pathname, router],
  );

  return { filters, setFilters };
}

// Query of a report request: no branch means the whole chain.
export function reportParams(branch: string, filters: ReportFilters): Record<string, string> {
  return {
    ...(filters.chain ? {} : { branch }),
    from: filters.from,
    to: filters.to,
    groupBy: filters.groupBy,
    ...(filters.compare ? { compare: "1" } : {}),
  };
}
```

- [ ] **Step 4: Toolbar** — `502-frontend/src/components/reports/report-toolbar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth-provider";
import { DateRangePicker } from "@/components/date-range-picker";
import type { ReportFilters } from "@/hooks/use-report-filters";
import { useNotify } from "@/hooks/use-notify";
import { GROUP_BY_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { GROUP_BYS } from "@/lib/reports";
import type { GroupBy } from "@/lib/types";

// Filters shared by the reports: period, grouping, comparison, scope and
// the Excel export. `onExport` undefined disables the export (no data yet).
export function ReportToolbar({
  filters,
  onChange,
  onExport,
}: {
  filters: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
  onExport?: () => Promise<void>;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const [exporting, setExporting] = useState(false);

  const runExport = async () => {
    if (!onExport) return;
    setExporting(true);
    try {
      await onExport();
    } catch (error) {
      notify.error(error, "Không thể xuất file Excel");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker value={{ from: filters.from, to: filters.to }} onChange={(range) => onChange(range)} />
      <Select value={filters.groupBy} onValueChange={(value) => onChange({ groupBy: value as GroupBy })}>
        <SelectTrigger className="w-28" aria-label="Gộp theo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUP_BYS.map((groupBy) => (
            <SelectItem key={groupBy} value={groupBy}>
              {GROUP_BY_LABELS[groupBy]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label className="flex items-center gap-2 px-1 text-sm font-normal">
        <Switch checked={filters.compare} onCheckedChange={(compare) => onChange({ compare })} />
        So kỳ trước
      </Label>
      {can(user, "reports.chain") && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filters.chain ? "chain" : "branch"}
          onValueChange={(value) => value && onChange({ chain: value === "chain" })}
          aria-label="Phạm vi"
        >
          <ToggleGroupItem value="branch">Cơ sở này</ToggleGroupItem>
          <ToggleGroupItem value="chain">Toàn chuỗi</ToggleGroupItem>
        </ToggleGroup>
      )}
      <Button variant="outline" className="@xl/main:ml-auto" onClick={runExport} disabled={!onExport || exporting}>
        <DownloadIcon data-icon="inline-start" />
        Xuất Excel
      </Button>
    </div>
  );
}
```

Kiểm tra `useNotify()` có method `error(error, fallback)` (xem `hooks/use-notify.ts`; trang Doanh thu cũ đã gọi `notify.error(error, "…")`).

- [ ] **Step 5: Lint**

Run: `cd 502-frontend && npm run lint`
Expected: như sau Task 7, chỉ còn lỗi ở trang Doanh thu cũ.

- [ ] **Step 6: Commit**

```bash
git add 502-frontend/src/lib/permissions.ts 502-frontend/src/lib/navigation.ts 502-frontend/src/hooks/use-report-filters.ts 502-frontend/src/components/reports
git commit -m "feat(frontend): nhóm Báo cáo, bộ lọc báo cáo trên URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Trang Doanh thu `/reports/revenue` và các chuyển hướng

**Files:**
- Create: `502-frontend/src/app/[branch]/reports/revenue/layout.tsx`
- Create: `502-frontend/src/app/[branch]/reports/revenue/page.tsx`
- Create: `502-frontend/src/app/[branch]/reports/page.tsx`
- Modify (thay bằng chuyển hướng): `502-frontend/src/app/[branch]/sales/statistics/page.tsx`, `…/sales/statistics/cskh/page.tsx`, `…/sales/statistics/revenue/page.tsx`, `…/sales/overview/page.tsx`

**Interfaces:**
- Consumes:
  - `RevenueReport`, `RevenueMetrics`, `ReportBucket`, `GroupBy` (Task 7)
  - `StatTile` (Task 7), `delta`, `reportFileName` (Task 7), `toSheet`, `exportWorkbook`, `ExportColumn` (Task 7)
  - `formatHours` (Task 7), `useReportFilters`, `reportParams` (Task 8), `ReportToolbar` (Task 8)
  - `useApiData(url, params, initial, errorMessage)`
  - `GET /reports/revenue` (Task 4)

- [ ] **Step 1: Layout (tên tab)** — `502-frontend/src/app/[branch]/reports/revenue/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Doanh thu" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Trang** — `502-frontend/src/app/[branch]/reports/revenue/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ChartColumnBigIcon, ChevronRightIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/components/auth-provider";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { reportParams, useReportFilters } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatDate, formatHours, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { delta, reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { GroupBy, ReportBucket, RevenueMetrics, RevenueReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = {
  roomNet: { label: "Tiền giờ", color: "var(--chart-1)" },
  productNet: { label: "Tiền hàng", color: "var(--chart-2)" },
  serviceFee: { label: "Phí dịch vụ", color: "var(--chart-3)" },
} satisfies ChartConfig;

const NUM = "text-right tabular-nums";
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// After their discounts.
const roomNet = (m: RevenueMetrics) => m.roomFee - m.roomDiscount;
const productNet = (m: RevenueMetrics) => m.productSales - m.productDiscount;

type PeriodRow = ReportBucket & RevenueMetrics;
type BranchRow = { name: string } & RevenueMetrics;

const metricColumns: ExportColumn<RevenueMetrics>[] = [
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

const periodColumns: ExportColumn<PeriodRow>[] = [
  { header: "Kỳ", value: (r) => r.label },
  { header: "Từ ngày", value: (r) => formatDate(r.from) },
  { header: "Đến ngày", value: (r) => formatDate(r.to) },
  ...metricColumns,
];

const branchColumns: ExportColumn<BranchRow>[] = [{ header: "Cơ sở", value: (r) => r.name }, ...metricColumns];

// Short label of a period on the chart axis.
function tickLabel(bucket: ReportBucket, groupBy: GroupBy) {
  if (groupBy === "day") return formatDate(bucket.key).slice(0, 5);
  if (groupBy === "week") return bucket.label.split(" (")[0];
  return bucket.label;
}

// Revenue of paid bills by business day of payment (06:00 → 06:00), before
// VAT with VAT apart; the fund's sales receipts cover the same bills.
function RevenueView() {
  const branch = useBranchCode();
  const { branches } = useAuth();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<RevenueReport | null>(
    "/reports/revenue",
    reportParams(branch, filters),
    null,
    "Không thể tải báo cáo doanh thu",
  );

  const scopeName = filters.chain
    ? "Toàn chuỗi"
    : (branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase());
  const billsHref = (from: string, to: string) => `/${branch}/sales/statistics/bills?from=${from}&to=${to}`;

  const exportExcel = async () => {
    if (!data) return;
    const tables = [
      toSheet("Theo kỳ", periodColumns, data.buckets, {
        key: "",
        label: "Tổng",
        from: data.range.from,
        to: data.range.to,
        ...data.totals,
      }),
    ];
    if (data.byBranch) {
      tables.push(toSheet("Theo cơ sở", branchColumns, data.byBranch, { name: "Tổng", ...data.totals }));
    }
    await exportWorkbook(
      reportFileName("doanh-thu", filters.chain ? "toan-chuoi" : branch, data.range.from, data.range.to),
      tables,
    );
  };

  const t = data?.totals;
  // Undefined while not comparing: the tiles then show no badge.
  const change = (pick: (m: RevenueMetrics) => number) =>
    data?.previous && t ? delta(pick(t), pick(data.previous.totals)) : undefined;
  // Periods with sales, newest first (the chart shows every period).
  const rows = [...(data?.buckets ?? [])].filter((b) => b.orderCount > 0).reverse();
  const chartData = (data?.buckets ?? []).map((b) => ({
    tick: tickLabel(b, filters.groupBy),
    label: b.label,
    roomNet: roomNet(b),
    productNet: productNet(b),
    serviceFee: b.serviceFee,
  }));

  return (
    <>
      <PageHeader
        title="Doanh thu"
        description={`${scopeName} · Doanh thu chưa gồm VAT, VAT tính riêng. Theo giờ thanh toán; hóa đơn đã hủy không được tính. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data ? exportExcel : undefined} />

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-5">
            <StatTile
              label="Doanh thu (chưa VAT)"
              value={formatMoney(t.revenue)}
              delta={change((m) => m.revenue)}
              footer={`Tiền giờ ${formatMoney(roomNet(t))} · tiền hàng ${formatMoney(productNet(t))}`}
            />
            <StatTile
              label="VAT"
              value={formatMoney(t.vat)}
              delta={change((m) => m.vat)}
              footer="Thuế GTGT trên hóa đơn, không tính vào doanh thu"
            />
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
              footer={`TB ${formatMoney(t.avgRevenue)} / hóa đơn${data.voided.count ? ` · ${data.voided.count} đã hủy` : ""}`}
            />
            <StatTile
              label="Giờ phòng"
              value={formatHours(t.roomMinutes)}
              delta={change((m) => m.roomMinutes)}
              footer={
                t.orderCount
                  ? `TB ${formatNumber(Math.round(t.roomMinutes / t.orderCount))} phút / hóa đơn`
                  : "Chưa có hóa đơn"
              }
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
                  <BarChart data={chartData} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(value: number) => compact.format(value)}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {(["roomNet", "productNet", "serviceFee"] as const).map((key, i, all) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="revenue"
                        fill={`var(--color-${key})`}
                        stroke="var(--card)"
                        strokeWidth={2}
                        maxBarSize={32}
                        radius={i === all.length - 1 ? [4, 4, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết theo kỳ</CardTitle>
              <CardDescription>
                Các kỳ có doanh thu
                {!filters.chain && "; bấm mũi tên để xem hóa đơn của kỳ đó"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {t.orderCount === 0 ? (
                <EmptyState
                  icon={ChartColumnBigIcon}
                  title="Chưa có doanh thu"
                  description={`Không có hóa đơn đã thanh toán trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kỳ</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.xs)}>Hóa đơn</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền giờ</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tiền hàng</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Phí DV</TableHead>
                      <TableHead className="text-right">Doanh thu</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng thu</TableHead>
                      {!filters.chain && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">
                          {filters.groupBy === "day" ? formatDate(row.key) : row.label}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{row.orderCount}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(row.roomFee)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(row.productSales)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>
                          {formatNumber(row.roomDiscount + row.productDiscount)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(row.serviceFee)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatNumber(row.revenue)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.collected)}</TableCell>
                        {!filters.chain && (
                          <TableCell className="px-1">
                            <Button variant="ghost" size="icon-sm" asChild>
                              <Link href={billsHref(row.from, row.to)} aria-label={`Hóa đơn ${row.label}`}>
                                <ChevronRightIcon />
                              </Link>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{t.orderCount}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(t.roomFee)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(t.productSales)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>
                          {formatNumber(t.roomDiscount + t.productDiscount)}
                        </TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(t.serviceFee)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(t.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.collected)}</TableCell>
                        {!filters.chain && (
                          <TableCell className="px-1">
                            <Button variant="ghost" size="icon-sm" asChild>
                              <Link href={billsHref(data.range.from, data.range.to)} aria-label="Tất cả hóa đơn trong kỳ">
                                <ChevronRightIcon />
                              </Link>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>

          {data.byBranch && (
            <Card>
              <CardHeader>
                <CardTitle>Theo cơ sở</CardTitle>
                <CardDescription>Tỷ trọng tính trên doanh thu chưa VAT của toàn chuỗi.</CardDescription>
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
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tỷ trọng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byBranch.map((b) => (
                      <TableRow key={b.branchId}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>{b.orderCount}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(b.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(b.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(b.collected)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.md)}>
                          {t.revenue ? percent.format(b.revenue / t.revenue) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function RevenueReportPage() {
  return (
    <Suspense>
      <RevenueView />
    </Suspense>
  );
}
```

Ghi chú khi triển khai:
- Nếu kiểu của `labelFormatter` trong `ChartTooltipContent` (`components/ui/chart.tsx`) không nhận `payload?.[0]?.payload?.label`, ép kiểu: `(payload?.[0]?.payload as { label?: string } | undefined)?.label ?? ""`.
- Nếu `Button` không có size `icon-sm`, dùng đúng size mà trang Doanh thu cũ đang dùng; trang cũ có `size="icon-sm"` nên chắc chắn có.

- [ ] **Step 3: Chuyển hướng các địa chỉ cũ.** Bốn file dưới đây dùng chung một nội dung:
  - `502-frontend/src/app/[branch]/sales/statistics/page.tsx` (ghi đè toàn bộ trang cũ);
  - `502-frontend/src/app/[branch]/sales/statistics/cskh/page.tsx`;
  - `502-frontend/src/app/[branch]/sales/statistics/revenue/page.tsx`;
  - `502-frontend/src/app/[branch]/sales/overview/page.tsx`.

```tsx
import { redirect } from "next/navigation";

// Old address; the revenue report now lives at /reports/revenue.
export default async function Page({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/reports/revenue`);
}
```

Tạo `502-frontend/src/app/[branch]/reports/page.tsx` cũng với đúng nội dung đó, nhưng comment đổi thành `// The reports start at Doanh thu.`

Giữ `sales/statistics/layout.tsx` như cũ: nó là layout cha của trang Hóa đơn, và trang Hóa đơn có `layout.tsx` riêng đặt tên tab.

- [ ] **Step 4: Lint và build**

Run: `cd 502-frontend && npm run lint && npm run build`
Expected: cả hai thành công, không còn tham chiếu `DailyStat`.

Run: `grep -rn "DailyStat\|orders/statistics" 502-frontend/src`
Expected: không có kết quả.

- [ ] **Step 5: Kiểm tra thủ công**

Chạy DB dev đã seed demo (`SEED_DEMO=1 npx prisma db seed`), rồi `npm run start:dev` ở backend và `npm run dev` ở frontend.

1. Đăng nhập `admin`/`admin123`. Mở `/cs1/sales/statistics`: phải chuyển sang `/cs1/reports/revenue`. Menu có nhóm "Báo cáo" chứa "Doanh thu"; nhóm "Bán hàng" không còn "Doanh thu".
2. Thanh toán một hóa đơn có VAT 10% ở cs1. Ô "Doanh thu (chưa VAT)" + ô "VAT" phải bằng ô "Tổng thu".
3. Đổi kỳ gộp sang Tháng/Quý/Năm; bật "So kỳ trước" để thấy badge Δ%; chọn "Toàn chuỗi" để thấy bảng "Theo cơ sở" và các mũi tên sang Hóa đơn biến mất. Tải lại trang: bộ lọc vẫn giữ nguyên.
4. Bấm "Xuất Excel" và mở file `doanh-thu_toan-chuoi_….xlsx`: có 2 sheet, cột tiền là số có dấu phân cách, dòng cuối là "Tổng".
5. Đăng nhập `ql_cs1`/`demo123`: không có nút "Cơ sở này / Toàn chuỗi". Đăng nhập `tn_cs1`: không thấy nhóm "Báo cáo", mở `/cs1/reports/revenue` thì thấy trang Forbidden.
6. DevTools, độ rộng 375px: không cuộn ngang; toolbar xuống dòng; ô tổng xếp một cột.

- [ ] **Step 6: Commit**

```bash
git add "502-frontend/src/app/[branch]/reports" "502-frontend/src/app/[branch]/sales"
git commit -m "feat(frontend): trang báo cáo doanh thu theo kỳ, toàn chuỗi, xuất Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: VAT tách riêng trên trang Hóa đơn

**Files:**
- Modify: `502-frontend/src/app/[branch]/sales/statistics/bills/page.tsx` (dòng ~72-74 và `CardDescription` ~dòng 86-89)

**Interfaces:**
- Consumes: `Order.finalAmount`, `Order.taxAmount` (`string | number`, có trong `lib/types.ts`).

- [ ] **Step 1: Sửa phần tổng** — thay:

```ts
  const revenue = paid.reduce((sum, o) => sum + Number(o.finalAmount), 0);
```

bằng:

```ts
  // What was paid (VAT included) and the VAT in it; revenue is before VAT.
  const collected = paid.reduce((sum, o) => sum + Number(o.finalAmount), 0);
  const vat = paid.reduce((sum, o) => sum + Number(o.taxAmount), 0);
```

và thay:

```tsx
            {paid.length} hóa đơn đã thanh toán · doanh thu {formatMoney(revenue)}
```

bằng:

```tsx
            {paid.length} hóa đơn đã thanh toán · doanh thu {formatMoney(collected - vat)} · VAT {formatMoney(vat)} ·
            tổng thu {formatMoney(collected)}
```

- [ ] **Step 2: Lint và build**

Run: `cd 502-frontend && npm run lint && npm run build`
Expected: thành công.

- [ ] **Step 3: Kiểm tra thủ công** — mở Hóa đơn của hôm nay, với hóa đơn VAT 10% ở Task 9. Doanh thu + VAT phải bằng Tổng thu, và bằng ô "Tổng thu" của báo cáo Doanh thu trong cùng ngày.

- [ ] **Step 4: Commit**

```bash
git add "502-frontend/src/app/[branch]/sales/statistics/bills/page.tsx"
git commit -m "feat(frontend): trang Hóa đơn tách VAT khỏi doanh thu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Tài liệu và kiểm tra cuối

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Cập nhật `CLAUDE.md`**

(a) Trong đoạn "Implemented:", thay `revenue per business day` bằng:

```
revenue reports (`/reports/revenue`: before VAT with VAT apart, grouped by day/week/month/quarter/year, compared with the previous period, whole chain for the chain manager, Excel export)
```

và thay `Not yet: accounting reports beyond that (staff statistics, P&L, exports).` bằng:

```
Not yet: reports by staff/room/product/hour/branch, cost of goods and P&L (phases 2–3 of `docs/superpowers/specs/2026-09-27-reporting-design.md`).
```

(b) Trong gạch đầu dòng **Business day**, thay `` and `GET /orders/statistics?from&to` (by **payment time** `endTime`) `` bằng `` and `GET /reports/*` (by **payment time** `endTime`) ``.

(c) Thêm gạch đầu dòng mới sau **Funds** trong "Backend architecture":

```
- **Reports** (`src/reports`, managers): **revenue is always before VAT** — `revenue` = Σ(`finalAmount` − `taxAmount`), `vat` = Σ `taxAmount`, `collected` = Σ `finalAmount` (= the fund's `salesIncome`; `GET /funds/summary` also returns `salesVat`). `report-sql.ts` holds the `$queryRaw` pieces: `businessDateSql` (UTC column → the process's time zone − 6 h, the same day as `businessDateOf`), `paidOrdersWhere`, `REVENUE_COLUMNS`. The SQL groups by business day (and a dimension); `buckets.ts` rolls days into day/week (ISO)/month/quarter/year periods and gives the `previousRange`, and `revenue-metrics.ts` turns sums into metrics — both pure and unit-tested. Queries are `ReportQuery {branch?, from, to, groupBy?, compare?}`, ranges up to `MAX_REPORT_RANGE_DAYS` (1830). Scope goes through `resolveOptionalBranchId`: the chain manager without `branch` gets the whole chain (plus `byBranch`).
```

(d) Trong "Frontend architecture", ở gạch đầu dòng đầu tiên, thêm `/[branch]/reports/...` vào danh sách route. Sau đó thêm gạch đầu dòng:

```
- **Reports** pages (`app/[branch]/reports/*`) keep their filters in the URL (`hooks/use-report-filters.ts`: `from`, `to`, `groupBy`, `compare=1`, `scope=chain` for the chain manager) and share `components/reports/report-toolbar.tsx`, `components/stat-tile.tsx` (with the Δ% badge) and `lib/excel-export.ts` (`toSheet` + `exportWorkbook`, SheetJS loaded on demand). Permissions `reports` (managers) and `reports.chain` (chain manager). `/sales/statistics` and the older addresses redirect to `/reports/revenue`; Hóa đơn stays at `/sales/statistics/bills`.
```

(e) Ở cuối gạch đầu dòng về các địa chỉ cũ (`Old addresses …`), sửa để ghi rõ chúng chuyển hướng tới `/reports/revenue`.

- [ ] **Step 2: Kiểm tra toàn bộ**

Run:
```bash
cd 502-backend && npm run lint && npm test && npm run build && npm run test:e2e
cd ../502-frontend && npm run lint && npm run build
```
Expected: tất cả thành công; `reports.e2e-spec.ts` và `foundation.e2e-spec.ts` đều PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mô tả module báo cáo và quy tắc VAT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Đối chiếu với spec (giai đoạn 1)

| Yêu cầu trong spec | Task |
|---|---|
| Module `src/reports`, `buckets.ts`, `revenue-metrics.ts`, `report-sql.ts` | 2, 3, 4 |
| Định nghĩa chỉ số (§3), bất biến tổng | 3, 4 (e2e) |
| `MAX_REPORT_RANGE_DAYS = 1830` | 1 |
| Toàn chuỗi qua `resolveOptionalBranchId`, `byBranch` | 4 |
| `GET /reports/revenue` với `compare`, `groupBy`, `voided` | 4 |
| Bỏ `/orders/statistics`, cập nhật e2e foundation | 5 |
| `--runInBand` | 4 |
| `salesVat` trong sổ quỹ | 6 |
| Quyền `reports` / `reports.chain`, nhóm menu "Báo cáo" | 8 |
| Toolbar, bộ lọc trên URL, StatTile chung với Δ%, preset quý/năm | 7, 8 |
| Xuất Excel | 7, 9 |
| Trang `/reports/revenue` (ô tổng, biểu đồ, bảng, theo cơ sở) | 9 |
| Chuyển hướng địa chỉ cũ | 9 |
| VAT trên Hóa đơn và Sổ quỹ | 10, 7 |
| Kiểm thử phân quyền, ngày kinh doanh 06:00, hóa đơn hủy | 4 |
| Kiểm tra 375px, file Excel, tài khoản `ql_cs1` / `tn_cs1` | 9 |
| Cập nhật `CLAUDE.md` | 11 |

`VENUE_OPEN_MINUTES` và index `OrderItem(orderId)` thuộc giai đoạn 2, nên không nằm trong kế hoạch này.
