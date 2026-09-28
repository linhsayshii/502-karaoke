# Báo cáo — Giai đoạn 3: Giá vốn, Lãi lỗ, Nhập–xuất–tồn, Khoản mục chi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Giá vốn bình quân gia quyền cho mọi biến động kho.
- Giá vốn chụp lại trên từng dòng hóa đơn.
- Khoản mục chi cố định.
- Hai báo cáo mới: `/reports/profit` (Lãi lỗ) và `/reports/inventory` (Nhập – xuất – tồn).
- Báo cáo Hàng hóa có thêm cột giá vốn, lãi gộp và % biên.

**Architecture:**
- **Giá vốn.** Hàm thuần `src/inventory/costing.ts` (`receive`, `unreceive`, `costMovement`) quyết định giá của mỗi biến động. `InventoryService.applyMovement` gọi nó trên cùng khóa dòng sản phẩm, ghi `StockMovement.unitCost` / `costAfter` và cập nhật `Product.costPrice`. Đây là nơi **duy nhất** thay đổi giá vốn.
- **Hóa đơn.** Hóa đơn chụp giá vốn của phần hàng nó đã lấy khỏi kho vào `OrderItem.unitCost`. Việc chụp diễn ra lúc thanh toán và mỗi lần sửa hóa đơn đã thanh toán.
- **Lãi lỗ.** Gộp theo ngày kinh doanh từ bốn nguồn: hóa đơn (doanh thu, giá vốn), sổ quỹ (chi phí, thu khác), phiếu xuất (hao hụt), phiếu nhập (tiền nhập hàng). Sau đó cuộn lên các kỳ bằng `rollUp` như báo cáo Doanh thu.
- **Nhập – xuất – tồn.** Đọc sổ kho `StockMovement`: tồn đầu/cuối là số dư của biến động cuối cùng trước mốc, các cột giữa = Σ số lượng × `unitCost` theo loại biến động.

**Tech Stack:** NestJS 11, Prisma 5.22 (`$queryRaw`, `Prisma.sql`), PostgreSQL, Jest + supertest; Next.js 16 App Router, React 19, shadcn/ui, recharts, SheetJS (`xlsx`, đã có sẵn).

**Spec:** `docs/superpowers/specs/2026-09-27-reporting-design.md`. Kế hoạch này làm mục 7 của spec, dựa trên mục 3, 4 và 8–9. Kế hoạch trước: `docs/superpowers/plans/2026-09-27-reporting-phase-2.md`.

## Global Constraints

**Ngôn ngữ**
- Mọi chữ hiển thị và thông báo lỗi bằng **tiếng Việt**.
- Comment trong code bằng tiếng Anh, theo đúng giọng văn hiện có.

**Định nghĩa số liệu**
- "Doanh thu" = **chưa VAT** = Σ(`finalAmount` − `taxAmount`); "VAT" = Σ `taxAmount`. Hóa đơn chỉ tính khi `status = COMPLETED`, lọc và gộp theo **`endTime`**, không bao giờ theo `Order.businessDate`.
- Ngày kinh doanh D = [D 06:00, D+1 06:00) theo giờ server (`src/common/dates.ts`).
- Không còn phí dịch vụ (commit 1ebd002): không thêm dòng/cột phí DV ở bất kỳ đâu.
- **Giá vốn bình quân gia quyền** (spec §7.2), mọi giá vốn làm tròn **2 chữ số thập phân**:
  - `receive(stockBefore, avg, qty, unitCost)`: `unitCost <= 0` → giữ `avg`; `stockBefore <= 0` → `unitCost`; còn lại `(stockBefore × avg + qty × unitCost) / (stockBefore + qty)`.
  - `unreceive(stockBefore, avg, qty, unitCost)`: phần còn lại `stockBefore − qty <= 0` → giữ `avg`; còn lại `(stockBefore × avg − qty × unitCost) / (stockBefore − qty)`, không âm.
- **Giá vốn hàng bán** = Σ `OrderItem.quantity` × `OrderItem.unitCost` của hóa đơn đã thanh toán. Sản phẩm `trackStock = false` có giá vốn 0.
- **Lợi nhuận** = lãi gộp − chi phí hoạt động − hàng xuất kho/hao hụt + thu khác. VAT phải nộp và tiền nhập hàng là dòng thông tin, không vào lợi nhuận.
- **Khoản mục chi** (spec §7.4), đúng chính tả và dấu gạch "–" (en dash):
  - Chi: `Lương`, `Mặt bằng`, `Điện nước`, `Sửa chữa – bảo trì`, `Marketing`, `Vật tư tiêu hao`, `Thuế – phí`, `Khác`.
  - Thu thủ công: `Thu khác`.
  - Phiếu tự động giữ `Bán hàng` / `Nhập hàng`.

**Phạm vi và phân quyền**
- Khoảng báo cáo tối đa **1830 ngày**: dùng `reportScope()` của `src/reports/report-scope.ts`.
- Quản lý hệ thống không truyền `branch` là xem toàn chuỗi. Mọi tài khoản khác luôn bị ghim vào cơ sở của mình; truyền mã khác → 403.
- Báo cáo chỉ cho `MANAGERS` (đã khai báo trên class `ReportsController`).

**SQL**
- Luôn có tham số (tagged template `Prisma.sql`), không nối chuỗi từ dữ liệu người dùng.
- Truy vấn nối `OrderItem` **không được** dùng `REVENUE_COLUMNS`.
- `GROUP BY` luôn dùng vị trí cột (`GROUP BY 1, 2`).

**Kho**
- `Product.stockQuantity` và `Product.costPrice` chỉ đổi qua `InventoryService.applyMovement`, luôn trong transaction của nơi gọi.
- Dòng sản phẩm luôn bị khóa theo thứ tự `productId` tăng dần.

**Frontend**
- Bố cục theo container query `@container/main`; cột phụ ẩn bằng `SHOW_FROM`. Ở 360–390px không trang nào được cuộn ngang. Riêng bảng xoay chiều của Lãi lỗ được cuộn ngang **bên trong** thẻ của nó.
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
- Backend: `npm --prefix 502-backend test` (unit) hoặc `npm --prefix 502-backend run test:e2e`.
  - E2E cần Postgres test ở cổng 5433: container `kara502-pg`, bật bằng `docker start kara502-pg`, xem `502-backend/test/e2e.env`.
  - Chạy một file e2e: `cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts`.
- Nếu unit test báo `Cannot convert undefined or null to object` ở một `@IsEnum` thì Prisma client đã cũ: chạy `npx prisma generate`, và sau mỗi lần sửa `schema.prisma` cũng chạy lệnh này.
- Frontend: `npm --prefix 502-frontend run lint` và `npm --prefix 502-frontend run build`.

---

## File Structure

**Backend — tạo mới**

| File | Trách nhiệm |
|---|---|
| `502-backend/prisma/migrations/20260928000000_reports_costing/migration.sql` | Cột `OrderItem.unitCost`, `StockMovement.unitCost`, `StockMovement.costAfter` |
| `502-backend/src/inventory/costing.ts` (+ `.spec.ts`) | Hàm thuần: `roundCost`, `receive`, `unreceive`, `costMovement` |
| `502-backend/src/funds/fund-categories.ts` (+ `.spec.ts`) | Danh sách khoản mục, `manualCategory`, `expenseCategoryOf` |
| `502-backend/src/reports/profit.ts` (+ `.spec.ts`) | Hàm thuần của Lãi lỗ: `emptyProfit`, `addProfit`, `sumProfit`, `toProfitMetrics` |
| `502-backend/src/reports/accounting-reports.service.ts` | `AccountingReportsService`: `profit`, `inventory` |
| `502-backend/test/costing.e2e-spec.ts` | E2E giá vốn, khoản mục, Lãi lỗ, Nhập – xuất – tồn (ở cs3, số liệu biết trước) |

**Backend — sửa**

| File | Thay đổi |
|---|---|
| `502-backend/prisma/schema.prisma` | 3 cột mới, comment `costPrice` |
| `502-backend/src/inventory/inventory.service.ts` | `applyMovement` tính giá vốn; bỏ cập nhật `costPrice` ở `writeDocument` và đoạn "lần nhập còn lại gần nhất" ở `cancelDocument` |
| `502-backend/src/orders/orders.service.ts` | `stockTakenBy` trả số lượng + giá trị; `snapshotItemCosts`; hủy/sửa hóa đơn trả hàng theo giá vốn của hóa đơn |
| `502-backend/src/funds/dto/create-fund-transaction.dto.ts`, `src/funds/funds.service.ts` | Kiểm tra khoản mục |
| `502-backend/src/reports/report-sql.ts` | `utcTimestamp`, `branchWhere`, `periodWhere` (export) |
| `502-backend/src/reports/reports.service.ts` | `daily()` thành public |
| `502-backend/src/reports/breakdown-reports.service.ts` | Báo cáo hàng hóa: `cost`, `grossProfit`, `margin` |
| `502-backend/src/reports/reports.controller.ts`, `reports.module.ts` | Route `profit`, `inventory` |
| `502-backend/test/foundation.e2e-spec.ts` | Kỳ vọng `costPrice` sau khi hủy phiếu nhập (Ruling 6) |

**Frontend — tạo mới**

| File | Trách nhiệm |
|---|---|
| `502-frontend/src/lib/profit.ts` | `profitLines()`: các dòng của báo cáo Lãi lỗ |
| `502-frontend/src/app/[branch]/reports/profit/{layout,page}.tsx` | Trang Lãi lỗ |
| `502-frontend/src/app/[branch]/reports/inventory/{layout,page}.tsx` | Trang Nhập – xuất – tồn |

**Frontend — sửa:**
- `lib/types.ts`, `lib/labels.ts`, `lib/format.ts` (`formatAmount`), `lib/navigation.ts`.
- `hooks/use-report-filters.ts` (mặc định `groupBy`), `components/reports/report-toolbar.tsx` (prop `compare`).
- `app/[branch]/funds/page.tsx` (Select khoản mục), `app/[branch]/reports/products/page.tsx` (cột giá vốn).

**Tài liệu:** `CLAUDE.md`, `DEPLOYMENT.md` (§6.10), `README.md`.

## Rulings (quyết định khi spec chưa nói rõ)

1. **Giá của hàng vào không có giá** (dòng nhập giá 0, hoặc hàng trả lại mà không biết giá): biến động được định giá bằng **bình quân hiện tại** chứ không phải 0, và bình quân giữ nguyên. Nhờ vậy giá trị trong Nhập – xuất – tồn vẫn cân.
2. **Hủy phiếu nhập** dùng `unitCost` của chính biến động IMPORT gốc. Với biến động cũ (trước migration, `unitCost` = 0) thì lấy giá dòng phiếu.
3. **Chiều của REVERSAL xác định bằng dấu:**
   - REVERSAL âm = hủy phiếu nhập → `unreceive`.
   - REVERSAL dương = hàng quay về kho (hủy hóa đơn, sửa hóa đơn bớt món, hủy phiếu xuất) → `receive`.
   - ADJUSTMENT chưa có nơi nào ghi. Nếu có thì theo dấu: vào theo giá truyền vào (hoặc bình quân), ra theo bình quân.
4. `unreceive` với `unitCost <= 0` giữ nguyên bình quân, đối xứng với `receive`.
5. **Giá vốn của một hóa đơn theo từng sản phẩm** = giá trị hàng hóa đơn đã lấy thực (Σ −số lượng × `unitCost` các biến động của hóa đơn) / số lượng thực, làm tròn 2 số lẻ.
   - Sửa hóa đơn lấy thêm: phần thêm ra kho theo bình quân hiện tại.
   - Sửa hóa đơn trả bớt, hoặc hủy hóa đơn: hàng về kho theo giá vốn của chính hóa đơn.
   - Spec viết "`unitCost` của biến động gốc"; khi một hóa đơn có nhiều biến động SALE thì giá bình quân của hóa đơn là lựa chọn nhất quán duy nhất.
6. **Hủy phiếu nhập làm tồn về 0:** `costPrice` **giữ** bình quân cũ (quy tắc `unreceive` của spec) thay vì về 0 như trước. Bài `foundation.e2e-spec.ts` "cancels a stock document by reversing it" đổi kỳ vọng từ `0` thành `12000`.
7. **Lãi lỗ** có gộp kỳ (`groupBy`) nhưng không có "so kỳ trước": API bỏ qua `compare`, toolbar ẩn công tắc đó. Trang Lãi lỗ mặc định gộp **theo tháng**; các trang khác vẫn mặc định theo ngày.
8. Dòng con của Doanh thu trong Lãi lỗ là tiền giờ và tiền hàng **sau giảm giá**. Spec còn ghi phí DV, nhưng phí DV đã bị bỏ ở 1ebd002.
9. **Phiếu chi cũ** có khoản mục tự do hoặc trống được tính vào "Khác". "Thu khác" = mọi phiếu thu thủ công chưa hủy, không xét khoản mục.
10. **Tiền nhập hàng** (dòng thông tin) = Σ `totalAmount` của phiếu nhập chưa hủy, theo `createdAt` của phiếu.
11. **Làm tròn giá vốn và lãi gộp:**
    - API giữ 2 số lẻ.
    - Trang hiển thị làm tròn tới đồng (`formatAmount` / `formatMoney`).
    - Excel giữ số chính xác, định dạng `#,##0`.
    - Không dùng `roundToTotal` cho giá vốn.
12. **Nhập – xuất – tồn:**
    - **Tồn cuối** lấy đúng sổ kho: số dư × `costAfter` của biến động cuối cùng.
    - Các cột Nhập / Bán / Xuất / Hoàn–điều chỉnh = Σ số lượng × `unitCost`.
    - Số lượng luôn cân. Giá trị có thể lệch vài xu do làm tròn bình quân, hoặc lệch nhiều hơn khi tồn âm rồi nhập lại (bình quân bắt đầu lại). Không thêm dòng "chênh lệch".
    - Nhập, Bán, Xuất trả về số dương. "Hoàn / điều chỉnh" có dấu.
13. **Lọc danh mục của Nhập – xuất – tồn** làm ở trình duyệt:
    - API trả mọi sản phẩm có tồn đầu hoặc tồn cuối ≠ 0, hoặc có biến động trong kỳ.
    - Trang tính lại tổng theo bộ lọc.
14. **Khoản mục được kiểm tra hai lớp:**
    - DTO `@IsIn` theo danh sách đầy đủ (chi + thu).
    - Service kiểm tra khoản mục đúng loại phiếu (400) và đặt mặc định "Khác" / "Thu khác" khi bỏ trống.
15. **Bảng Lãi lỗ xoay chiều** (dòng khoản mục × cột kỳ) cuộn ngang bên trong thẻ, với cột khoản mục dính bên trái. Các khoản mục chi bằng 0 suốt khoảng được ẩn trên trang nhưng vẫn có trong Excel.
16. **Không tính lại quá khứ** (người dùng đã chốt): hóa đơn cũ có giá vốn 0, biến động cũ có giá trị 0. DEPLOYMENT §6.10 ghi rõ điều này.
17. E2E của giai đoạn này ở **file mới** `test/costing.e2e-spec.ts`, chạy ở cs3 (không có dữ liệu demo), để mọi con số tính tay được. File này được tự nhận vì `testRegex` là `.e2e-spec.ts$`.

---

### Task 1: Cột giá vốn trong schema + hàm thuần bình quân gia quyền

**Files:**
- Modify: `502-backend/prisma/schema.prisma` (models `Product`, `OrderItem`, `StockMovement`)
- Create: `502-backend/prisma/migrations/20260928000000_reports_costing/migration.sql`
- Create: `502-backend/src/inventory/costing.ts`
- Test: `502-backend/src/inventory/costing.spec.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `roundCost(value: number): number`
  - `receive(stockBefore, average, quantity, unitCost): number`
  - `unreceive(stockBefore, average, quantity, unitCost): number`
  - `interface MovementCost { unitCost: number; costAfter: number }`
  - `costMovement(m: { type: StockMovementType; quantity: number; stockBefore: number; average: number; unitCost?: number }): MovementCost`
  - Prisma: `OrderItem.unitCost`, `StockMovement.unitCost`, `StockMovement.costAfter` (đều `Decimal @default(0)`).

- [ ] **Step 1: Viết unit test (thất bại)**

`502-backend/src/inventory/costing.spec.ts`:

```ts
import { StockMovementType } from '@prisma/client';
import { costMovement, receive, roundCost, unreceive } from './costing';

describe('receive', () => {
  it('averages two batches by quantity', () => {
    const first = receive(0, 0, 10, 10000);
    expect(first).toBe(10000);
    expect(receive(10, first, 10, 20000)).toBe(15000);
  });

  it('starts over from the new cost when nothing (or less) is in stock', () => {
    expect(receive(0, 15000, 5, 12000)).toBe(12000);
    expect(receive(-3, 15000, 5, 12000)).toBe(12000);
  });

  it('keeps the average for a line without a cost', () => {
    expect(receive(10, 15000, 5, 0)).toBe(15000);
    expect(receive(0, 15000, 5, 0)).toBe(15000);
  });

  it('rounds to 2 decimals', () => {
    expect(receive(2, 10, 1, 11)).toBe(10.33);
  });
});

describe('unreceive', () => {
  it('takes a cancelled batch back out of the average', () => {
    expect(unreceive(20, 15000, 10, 20000)).toBe(10000);
    expect(unreceive(24, 17500, 4, 30000)).toBe(15000);
  });

  it('keeps the average when nothing is left', () => {
    expect(unreceive(10, 15000, 10, 20000)).toBe(15000);
    expect(unreceive(4, 15000, 6, 20000)).toBe(15000);
  });

  it('keeps the average for a batch without a cost', () => {
    expect(unreceive(20, 15000, 5, 0)).toBe(15000);
  });

  it('never goes below zero', () => {
    expect(unreceive(5, 1000, 4, 5000)).toBe(0);
  });
});

describe('costMovement', () => {
  const at = (
    type: StockMovementType,
    quantity: number,
    stockBefore: number,
    average: number,
    unitCost?: number,
  ) => costMovement({ type, quantity, stockBefore, average, unitCost });

  it('values an import at its line cost', () => {
    expect(at(StockMovementType.IMPORT, 10, 10, 10000, 20000)).toEqual({
      unitCost: 20000,
      costAfter: 15000,
    });
  });

  it('values an import without a cost at the average (Ruling 1)', () => {
    expect(at(StockMovementType.IMPORT, 5, 10, 15000, 0)).toEqual({
      unitCost: 15000,
      costAfter: 15000,
    });
  });

  it('lets sales and exports leave at the average', () => {
    expect(at(StockMovementType.SALE, -4, 20, 15000)).toEqual({
      unitCost: 15000,
      costAfter: 15000,
    });
    expect(at(StockMovementType.EXPORT, -1, 20, 15000, 99999)).toEqual({
      unitCost: 15000,
      costAfter: 15000,
    });
  });

  it('receives goods put back at the cost they left at', () => {
    expect(at(StockMovementType.REVERSAL, 4, 20, 18000, 15000)).toEqual({
      unitCost: 15000,
      costAfter: 17500,
    });
  });

  it('takes a cancelled import back out at its own cost', () => {
    expect(at(StockMovementType.REVERSAL, -4, 24, 17500, 30000)).toEqual({
      unitCost: 30000,
      costAfter: 15000,
    });
  });

  it('rounds costs to 2 decimals', () => {
    expect(roundCost(17979.999)).toBe(17980);
    // (23 × 18,460 + 3 × 17,980) / 26 = 18,404.615…
    expect(at(StockMovementType.REVERSAL, 3, 23, 18460, 17980)).toEqual({
      unitCost: 17980,
      costAfter: 18404.62,
    });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `cd 502-backend && npx jest src/inventory/costing.spec.ts`
Expected: FAIL, `Cannot find module './costing'`.

- [ ] **Step 3: Viết `costing.ts`**

`502-backend/src/inventory/costing.ts`:

```ts
import { StockMovementType } from '@prisma/client';

// Weighted average cost (giá vốn bình quân gia quyền) of a product's stock.
// Costs are per unit, rounded to 2 decimals.

export const roundCost = (value: number) => Math.round(value * 100) / 100;

// Average after `quantity` units come in at `unitCost`. A line without a
// cost keeps the average; with nothing (or less) in stock there is nothing
// to average with, so the new cost is the average.
export function receive(
  stockBefore: number,
  average: number,
  quantity: number,
  unitCost: number,
): number {
  if (unitCost <= 0) return average;
  if (stockBefore <= 0) return roundCost(unitCost);
  return roundCost(
    (stockBefore * average + quantity * unitCost) / (stockBefore + quantity),
  );
}

// Average after a cancelled import takes `quantity` units at `unitCost`
// back out. Nothing left: the average stays. Never below zero.
export function unreceive(
  stockBefore: number,
  average: number,
  quantity: number,
  unitCost: number,
): number {
  const remaining = stockBefore - quantity;
  if (remaining <= 0 || unitCost <= 0) return average;
  return Math.max(
    0,
    roundCost((stockBefore * average - quantity * unitCost) / remaining),
  );
}

export interface MovementCost {
  unitCost: number; // what one unit of the movement is valued at
  costAfter: number; // the product's average cost after it
}

// Valuation of one stock movement (quantity signed: + in, − out):
// - goods in (an import, goods put back by a voided or corrected bill or a
//   cancelled export) come in at `unitCost`, or at the average when there
//   is none;
// - a cancelled import (a REVERSAL out) goes back out at its own cost;
// - every other movement out (sale, export) leaves at the average.
export function costMovement(m: {
  type: StockMovementType;
  quantity: number;
  stockBefore: number;
  average: number;
  unitCost?: number;
}): MovementCost {
  const given =
    m.unitCost !== undefined && m.unitCost > 0
      ? roundCost(m.unitCost)
      : undefined;
  if (m.quantity > 0) {
    return {
      unitCost: given ?? m.average,
      costAfter: receive(m.stockBefore, m.average, m.quantity, given ?? 0),
    };
  }
  if (m.quantity < 0 && m.type === StockMovementType.REVERSAL) {
    return {
      unitCost: given ?? m.average,
      costAfter: unreceive(m.stockBefore, m.average, -m.quantity, given ?? 0),
    };
  }
  return { unitCost: m.average, costAfter: m.average };
}
```

- [ ] **Step 4: Chạy test, xác nhận qua**

Run: `cd 502-backend && npx jest src/inventory/costing.spec.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Sửa schema**

Trong `502-backend/prisma/schema.prisma`:

1. `model Product`: thay comment của `costPrice`

```prisma
  // Latest import unit cost (giá vốn); updated by import receipts.
  costPrice          Decimal             @default(0)
```

bằng

```prisma
  // Weighted average cost (giá vốn bình quân); changed only by stock
  // movements (InventoryService.applyMovement, inventory/costing.ts).
  costPrice          Decimal             @default(0)
```

2. `model OrderItem`: thêm sau dòng `price`

```prisma
  // Cost per unit of what the bill took from stock (weighted average), set
  // at checkout and on corrections; 0 for products without stock tracking.
  unitCost  Decimal @default(0)
```

3. `model StockMovement`: thêm sau dòng `balanceAfter Int`

```prisma
  // What one unit of the movement is valued at, and the product's weighted
  // average cost after it (inventory/costing.ts).
  unitCost     Decimal           @default(0)
  costAfter    Decimal           @default(0)
```

- [ ] **Step 6: Viết migration**

`502-backend/prisma/migrations/20260928000000_reports_costing/migration.sql`:

```sql
-- Cost of goods (weighted average): the cost a bill's lines left stock at,
-- and the valuation of every stock movement. Existing rows keep 0 (no
-- backfill, see DEPLOYMENT.md §6.10).

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "costAfter" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0;
```

- [ ] **Step 7: Kiểm tra migration khớp schema, sinh lại client**

Run (với container `kara502-pg` đang chạy; shadow DB là một DB tạm trên đó):

```bash
cd 502-backend
docker exec kara502-pg psql -U postgres -c 'CREATE DATABASE karaoke_shadow_p3' || true
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:postgres@localhost:5433/karaoke_shadow_p3" --script
docker exec kara502-pg psql -U postgres -c 'DROP DATABASE karaoke_shadow_p3'
npx prisma generate
```

Expected: `migrate diff` in ra `-- This is an empty migration.` (không có câu lệnh nào). Nếu người dùng/mật khẩu Postgres khác, lấy chúng từ `DATABASE_URL` trong `test/e2e.env`.

- [ ] **Step 8: Chạy toàn bộ unit test**

Run: `cd 502-backend && npm test`
Expected: PASS (tất cả).

- [ ] **Step 9: Commit**

```bash
git add 502-backend/prisma/schema.prisma 502-backend/prisma/migrations/20260928000000_reports_costing 502-backend/src/inventory/costing.ts 502-backend/src/inventory/costing.spec.ts
git commit -m "feat(backend): cột giá vốn và hàm bình quân gia quyền

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 2: `applyMovement` tính giá vốn; phiếu nhập/xuất và hủy phiếu dùng nó

**Files:**
- Modify: `502-backend/src/inventory/inventory.service.ts` (`MovementInput`, `applyMovement`, `writeDocument`, `cancelDocument`)
- Modify: `502-backend/test/foundation.e2e-spec.ts` (khoảng dòng 856)
- Create: `502-backend/test/costing.e2e-spec.ts`

**Interfaces:**
- Consumes: `costMovement`, `MovementCost` (Task 1).
- Produces:
  - `MovementInput.unitCost?: number`.
  - `applyMovement(tx, m): Promise<{ balanceAfter: number } & MovementCost>`. Trước đây trả `number`; các nơi gọi trong `orders.service.ts` không dùng giá trị trả về.
  - Khung file e2e `test/costing.e2e-spec.ts`, các task sau thêm `describe` vào **cuối** file:
    - helper: `get`, `post`, `patch`, `period`, `ymd`, `daysFromToday`, `stockOf`, `costOf`, `lastMovement`, `importBeer`, `exportBeer`, `cancelDocument`;
    - biến `beerId`, `feeId`, `roomId`, `prisma`.

- [ ] **Step 1: Viết file e2e mới (thất bại)**

`502-backend/test/costing.e2e-spec.ts`:

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

// Cost of goods (weighted average), expense categories, profit and loss and
// the stock ledger report, in cs3: the seed puts nothing there, so every
// number below is worked out by hand. The `it`s build on each other (stock,
// bills, fund entries): run the whole file, never with `-t`.

type Json = Record<string, unknown>;

describe('Costing and accounting reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  let beerId: number;
  let feeId: number;
  let roomId: number;

  const api = () => request(app.getHttpServer());
  // Every request in cs3, as the chain manager unless `as` says otherwise.
  const cs3 = (url: string) =>
    `/api${url}${url.includes('?') ? '&' : '?'}branch=cs3`;
  const get = (url: string, as = 'admin') =>
    api().get(cs3(url)).set('Authorization', `Bearer ${tokens[as]}`);
  const post = (url: string, body: Json = {}) =>
    api()
      .post(cs3(url))
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(body);
  const patch = (url: string, body: Json = {}) =>
    api()
      .patch(cs3(url))
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send(body);

  const login = async (username: string) => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password: '12345678' })
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

  const stockOf = async (id: number) =>
    ((await get('/inventory/stock').expect(200)).body as Json[]).find(
      (p) => p.id === id,
    )!;
  const costOf = async () => Number((await stockOf(beerId)).costPrice);
  // Newest first.
  const lastMovement = async () =>
    (
      (await get(`/inventory/movements?productId=${beerId}`).expect(200))
        .body as Json[]
    )[0];
  const importBeer = async (
    quantity: number,
    unitCost: number,
    paymentMethod?: 'CASH',
  ) =>
    (
      await post('/inventory/documents', {
        type: 'IMPORT',
        lines: [{ productId: beerId, quantity, unitCost }],
        ...(paymentMethod && { paymentMethod }),
      }).expect(201)
    ).body as Json;
  const exportBeer = async (quantity: number) =>
    (
      await post('/inventory/documents', {
        type: 'EXPORT',
        note: 'Hao hụt',
        lines: [{ productId: beerId, quantity }],
      }).expect(201)
    ).body as Json;
  const cancelDocument = (id: number) =>
    post(`/inventory/documents/${id}/cancel`, { reason: 'Sai phiếu' }).expect(
      200,
    );

  beforeAll(async () => {
    execSync('npx prisma migrate reset --force --skip-generate', {
      env: process.env,
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await login('admin');
    await login('tn1_cs1');

    beerId = (
      (
        await post('/products', {
        name: 'Bia Sài Gòn',
        price: 30000,
        unit: 'chai',
      }).expect(201)
      ).body as Json
    ).id as number;
    feeId = (
      (
        await post('/products', {
        name: 'Phụ thu',
        price: 50000,
        unit: 'lần',
        trackStock: false,
      }).expect(201)
      ).body as Json
    ).id as number;
    roomId = (
      (
        await post('/rooms', { name: 'P301', pricePerHour: 100000 }).expect(201)
      ).body as Json
    ).id as number;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('weighted average cost', () => {
    it('averages the import batches', async () => {
      await importBeer(10, 10000, 'CASH');
      expect(await costOf()).toBe(10000);
      await importBeer(10, 20000);
      expect(await costOf()).toBe(15000);

      const movement = await lastMovement();
      expect(movement).toMatchObject({
        type: 'IMPORT',
        quantity: 10,
        balanceAfter: 20,
      });
      expect(Number(movement.unitCost)).toBe(20000);
      expect(Number(movement.costAfter)).toBe(15000);
    });

    it('takes a cancelled import back out of the average', async () => {
      const doc = await importBeer(4, 30000);
      // (20 × 15,000 + 4 × 30,000) / 24
      expect(await costOf()).toBe(17500);
      await cancelDocument(doc.id as number);
      // (24 × 17,500 − 4 × 30,000) / 20
      expect(await costOf()).toBe(15000);

      const movement = await lastMovement();
      expect(movement).toMatchObject({
        type: 'REVERSAL',
        quantity: -4,
        balanceAfter: 20,
      });
      expect(Number(movement.unitCost)).toBe(30000);
      expect(Number(movement.costAfter)).toBe(15000);
    });
  });
});
```

- [ ] **Step 2: Chạy e2e, xác nhận thất bại**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts`
Expected: FAIL. `averages the import batches` báo cost 20000 thay vì 15000, vì code cũ ghi đè `costPrice` bằng giá lần nhập cuối.

- [ ] **Step 3: Sửa `applyMovement`**

Trong `502-backend/src/inventory/inventory.service.ts`:

1. Import: thêm dòng `import { costMovement, MovementCost } from './costing';` sau dòng import `fund-ledger`.

2. Thêm vào `MovementInput`, sau `createdById?: number;`:

```ts
  // Goods coming in, and cancelled imports: the unit cost they move at (see
  // costMovement). Sales and exports ignore it: they leave at the average.
  unitCost?: number;
```

3. Thay toàn bộ `applyMovement` (từ comment `// The only way stockQuantity changes` đến hết hàm) bằng:

```ts
  // The only way stockQuantity and costPrice change: atomic increment + one
  // ledger row, the weighted average cost moved on under the same row lock.
  // Must run inside the caller's transaction.
  async applyMovement(
    tx: Prisma.TransactionClient,
    m: MovementInput,
  ): Promise<{ balanceAfter: number } & MovementCost> {
    const product = await tx.product.update({
      where: { id: m.productId },
      data: { stockQuantity: { increment: m.quantity } },
      select: { name: true, stockQuantity: true, costPrice: true },
    });
    if (!m.allowNegative && m.quantity < 0 && product.stockQuantity < 0) {
      throw new BadRequestException(
        `Không đủ tồn kho cho "${product.name}" (còn ${product.stockQuantity - m.quantity})`,
      );
    }
    const average = Number(product.costPrice);
    const cost = costMovement({
      type: m.type,
      quantity: m.quantity,
      stockBefore: product.stockQuantity - m.quantity,
      average,
      unitCost: m.unitCost,
    });
    if (cost.costAfter !== average) {
      await tx.product.update({
        where: { id: m.productId },
        data: { costPrice: cost.costAfter },
      });
    }
    await tx.stockMovement.create({
      data: {
        branchId: m.branchId,
        productId: m.productId,
        type: m.type,
        quantity: m.quantity,
        balanceAfter: product.stockQuantity,
        unitCost: cost.unitCost,
        costAfter: cost.costAfter,
        documentId: m.documentId,
        orderId: m.orderId,
        createdById: m.createdById,
      },
    });
    return { balanceAfter: product.stockQuantity, ...cost };
  }
```

- [ ] **Step 4: Sửa `writeDocument`**

1. Đổi comment trên hàm thành:

```ts
  // Writes a validated document with its movements (which move the cost
  // price on) and, for a paid import, its phiếu chi. Must run inside the
  // caller's transaction; the Excel import calls it after creating the
  // products it needs.
```

2. Trong vòng `for (const line of byProduct)`: thêm `unitCost: line.unitCost,` vào đối tượng truyền cho `applyMovement` (ngay sau `quantity: …`). Xóa hẳn khối:

```ts
      if (isImport && line.unitCost > 0) {
        await tx.product.update({
          where: { id: line.productId },
          data: { costPrice: line.unitCost },
        });
      }
```

- [ ] **Step 5: Sửa `cancelDocument`**

1. Đổi comment trên hàm thành:

```ts
  // Cancels a document: its stock movements are reversed (an import can only
  // be cancelled while its goods are still in stock) at the cost each line
  // moved at, so a cancelled import comes back out of the average cost, and
  // its fund payment is cancelled.
```

2. Ngay trước `const isImport = document.type === StockDocType.IMPORT;`, thêm:

```ts
        // The cost each line moved at. Movements from before costing have
        // none (0): an import falls back to its line cost (Ruling 2).
        const moved = await tx.stockMovement.findMany({
          where: {
            documentId: document.id,
            type: { in: [StockMovementType.IMPORT, StockMovementType.EXPORT] },
          },
          select: { productId: true, unitCost: true },
        });
        const movedAt = new Map(
          moved.map((mv) => [mv.productId, Number(mv.unitCost)]),
        );
```

3. Trong vòng `for (const line of document.lines)`, thêm vào đối tượng truyền cho `applyMovement`, sau `quantity: …`:

```ts
              unitCost: movedAt.get(line.productId) || Number(line.unitCost),
```

4. Xóa hẳn khối `if (isImport) { for (const line of document.lines) { const latest = … } }`, tức toàn bộ phần "latest remaining import".

- [ ] **Step 6: Sửa kỳ vọng ở `foundation.e2e-spec.ts`**

Trong test `'cancels a stock document by reversing it'`, thay

```ts
      const beer = await stockOf(beerId);
      expect(beer.stockQuantity).toBe(0);
      expect(Number(beer.costPrice)).toBe(0);
```

bằng

```ts
      const beer = await stockOf(beerId);
      expect(beer.stockQuantity).toBe(0);
      // Nothing left to average with: the average cost stays.
      expect(Number(beer.costPrice)).toBe(12000);
```

- [ ] **Step 7: Chạy test**

Run:
```bash
cd 502-backend
npm test
npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts
npm run test:e2e
```
Expected: tất cả PASS. Lỗi "socket hang up" hoặc 403 lẻ tẻ có thể do tiến trình khác đang giữ kết nối tới DB e2e dùng chung; chạy lại một lần.

- [ ] **Step 8: Lint và commit**

```bash
cd 502-backend && npm run lint && cd ..
git add 502-backend/src/inventory/inventory.service.ts 502-backend/test/costing.e2e-spec.ts 502-backend/test/foundation.e2e-spec.ts
git commit -m "feat(backend): giá vốn bình quân gia quyền cho mọi biến động kho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 3: Hóa đơn chụp giá vốn; hủy/sửa hóa đơn trả hàng theo giá của hóa đơn

**Files:**
- Modify: `502-backend/src/orders/orders.service.ts` (`checkout`, `voidPaid`, `editPaid`, `stockTakenBy`, `syncSoldStock`, helper mới `snapshotItemCosts`)
- Test: `502-backend/test/costing.e2e-spec.ts` (thêm `describe` ở cuối)

**Interfaces:**
- Consumes:
  - `applyMovement(tx, { …, unitCost? })` (Task 2);
  - `roundCost` (Task 1);
  - helpers của file e2e (Task 2).
- Produces:
  - `OrderItem.unitCost` luôn được đặt cho hóa đơn đã thanh toán. Task 5 (báo cáo Hàng hóa) và Task 6 (Lãi lỗ) đọc nó.
  - Trạng thái e2e sau task này: tồn bia 26, bình quân 18404.62. Hóa đơn 1 đã hủy. Hóa đơn 2 có 1 bia (giá vốn 17980) và 1 phụ thu (giá vốn 0).

- [ ] **Step 1: Viết e2e (thất bại)**

Thêm vào **cuối** `describe('Costing and accounting reports (e2e)')` trong `test/costing.e2e-spec.ts`, ngay trước dấu `});` đóng describe ngoài cùng:

```ts
  describe('cost of the bills', () => {
    let firstBill: Json;
    let secondBill: Json;

    const payBill = async (beers: number) => {
      const order = (await post('/orders', { roomId }).expect(201))
        .body as Json;
      await patch(`/orders/${order.id as number}`, {
        items: [{ productId: beerId, quantity: beers }],
      }).expect(200);
      return (
        await post(`/orders/${order.id as number}/checkout`, {
          paymentMethod: 'CASH',
        }).expect(200)
      ).body as Json;
    };
    const itemCost = (order: Json, productId: number) =>
      Number(
        (order.items as Json[]).find((i) => i.productId === productId)!
          .unitCost,
      );

    it('snapshots the average cost on the bill at checkout', async () => {
      firstBill = await payBill(4);
      expect(itemCost(firstBill, beerId)).toBe(15000);
      expect(await costOf()).toBe(15000);
      expect((await stockOf(beerId)).stockQuantity).toBe(16);
    });

    it('puts a voided bill back at the cost it left at', async () => {
      await importBeer(4, 30000);
      // (16 × 15,000 + 4 × 30,000) / 20
      expect(await costOf()).toBe(18000);
      await post(`/orders/${firstBill.id as number}/void`, {
        reason: 'Khách trả lại',
      }).expect(200);
      // (20 × 18,000 + 4 × 15,000) / 24
      expect(await costOf()).toBe(17500);
      const movement = await lastMovement();
      expect(movement).toMatchObject({ type: 'REVERSAL', quantity: 4 });
      expect(Number(movement.unitCost)).toBe(15000);
    });

    it('follows a corrected bill: more at the current average, less at the bill’s own cost', async () => {
      secondBill = await payBill(2);
      expect(itemCost(secondBill, beerId)).toBe(17500);
      await importBeer(3, 25500);
      // (22 × 17,500 + 3 × 25,500) / 25
      expect(await costOf()).toBe(18460);

      const more = (
        await patch(`/orders/${secondBill.id as number}/paid`, {
          reason: 'Thêm bia',
          items: [{ productId: beerId, quantity: 4 }],
        }).expect(200)
      ).body as Json;
      // (2 × 17,500 + 2 × 18,460) / 4
      expect(itemCost(more, beerId)).toBe(17980);
      expect(await costOf()).toBe(18460);

      const less = (
        await patch(`/orders/${secondBill.id as number}/paid`, {
          reason: 'Trả bớt',
          items: [
            { productId: beerId, quantity: 1 },
            { productId: feeId, quantity: 1 },
          ],
        }).expect(200)
      ).body as Json;
      expect(itemCost(less, beerId)).toBe(17980);
      expect(itemCost(less, feeId)).toBe(0);
      // (23 × 18,460 + 3 × 17,980) / 26 = 18,404.615…
      expect(await costOf()).toBe(18404.62);
      expect((await stockOf(beerId)).stockQuantity).toBe(26);
    });
  });
```

- [ ] **Step 2: Chạy e2e, xác nhận thất bại**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts`
Expected: FAIL. `snapshots the average cost…` nhận `unitCost` 0.

- [ ] **Step 3: Sửa `orders.service.ts`**

1. Import: thêm `import { roundCost } from '../inventory/costing';` cạnh import `InventoryService`.

2. Thêm hàm thuần ở cấp module, ngay trên `@Injectable()`:

```ts
// Cost per unit of what a bill took of a product (0 when it took none).
function unitCostOf(taken?: { quantity: number; value: number }): number {
  return taken && taken.quantity > 0
    ? roundCost(taken.value / taken.quantity)
    : 0;
}
```

3. `checkout`: ngay sau vòng `for (const [productId, quantity] of soldByProduct) { … }`, thêm:

```ts
        await this.snapshotItemCosts(tx, order.id);
```

4. `voidPaid`: thay vòng

```ts
        const taken = await this.stockTakenBy(tx, id);
        for (const [productId, quantity] of taken) {
          if (quantity <= 0) continue;
          await this.inventory.applyMovement(tx, {
            branchId: order.branchId,
            productId,
            type: StockMovementType.REVERSAL,
            quantity,
            orderId: id,
            createdById: user.id,
          });
        }
```

bằng

```ts
        // at the cost it left at.
        const taken = await this.stockTakenBy(tx, id);
        for (const [productId, entry] of taken) {
          if (entry.quantity <= 0) continue;
          await this.inventory.applyMovement(tx, {
            branchId: order.branchId,
            productId,
            type: StockMovementType.REVERSAL,
            quantity: entry.quantity,
            unitCost: unitCostOf(entry),
            orderId: id,
            createdById: user.id,
          });
        }
```

Dòng `// at the cost it left at.` nối tiếp comment có sẵn ngay phía trên (`// Put back exactly what the bill took out (checkout and later // corrections).`).

5. `editPaid`: ngay sau `await this.syncSoldStock(tx, order.branchId, id, user.id);`, thêm:

```ts
        await this.snapshotItemCosts(tx, id);
```

6. Thay toàn bộ `stockTakenBy` (cả comment) bằng:

```ts
  // What a bill took from stock, per product in id order: the net quantity
  // and its cost (Σ −quantity × unitCost of the bill's movements).
  private async stockTakenBy(tx: Db, orderId: number) {
    const movements = await tx.stockMovement.findMany({
      where: { orderId },
      select: { productId: true, quantity: true, unitCost: true },
      orderBy: [{ productId: 'asc' }, { id: 'asc' }],
    });
    const taken = new Map<number, { quantity: number; value: number }>();
    for (const m of movements) {
      const entry = taken.get(m.productId) ?? { quantity: 0, value: 0 };
      entry.quantity -= m.quantity;
      entry.value -= m.quantity * Number(m.unitCost);
      taken.set(m.productId, entry);
    }
    return taken;
  }

  // Puts on each line of a bill the cost per unit of what the bill took from
  // stock (0 for products without stock tracking), so the reports' cost of
  // goods sold is Σ quantity × unitCost.
  private async snapshotItemCosts(tx: Db, orderId: number) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true },
    });
    const taken = await this.stockTakenBy(tx, orderId);
    for (const productId of new Set(items.map((item) => item.productId))) {
      await tx.orderItem.updateMany({
        where: { orderId, productId },
        data: { unitCost: unitCostOf(taken.get(productId)) },
      });
    }
  }
```

7. `syncSoldStock`:

a. Đổi comment trên hàm thành:

```ts
  // Brings the stock taken by a paid bill in line with its items: more of a
  // product is sold (SALE, at the current average), less is put back
  // (REVERSAL, at the cost the bill took it at). Products that are no longer
  // stock-tracked are left alone. Locks rows by product id, as checkout
  // does.
```

b. Trong vòng, thay

```ts
      const delta = (wanted.get(productId) ?? 0) - (taken.get(productId) ?? 0);
```

bằng

```ts
      const delta =
        (wanted.get(productId) ?? 0) - (taken.get(productId)?.quantity ?? 0);
```

c. Thêm `unitCost: unitCostOf(taken.get(productId)),` vào đối tượng truyền cho `applyMovement`, ngay sau `quantity: -delta,`. Với SALE, `costMovement` bỏ qua giá này và lấy bình quân.

- [ ] **Step 4: Chạy test**

Run:
```bash
cd 502-backend
npm test
npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts
npm run test:e2e
```
Expected: tất cả PASS.

- [ ] **Step 5: Lint và commit**

```bash
cd 502-backend && npm run lint && cd ..
git add 502-backend/src/orders/orders.service.ts 502-backend/test/costing.e2e-spec.ts
git commit -m "feat(backend): chụp giá vốn trên hóa đơn, trả hàng theo giá của hóa đơn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 4: Khoản mục chi cố định (backend + hộp thoại lập phiếu)

**Files:**
- Create: `502-backend/src/funds/fund-categories.ts`
- Test: `502-backend/src/funds/fund-categories.spec.ts`
- Modify: `502-backend/src/funds/dto/create-fund-transaction.dto.ts`, `502-backend/src/funds/funds.service.ts` (`create`)
- Modify: `502-frontend/src/lib/labels.ts`, `502-frontend/src/app/[branch]/funds/page.tsx`
- Test: `502-backend/test/costing.e2e-spec.ts` (thêm `describe` ở cuối)

**Interfaces:**
- Consumes: helpers của file e2e (Task 2).
- Produces:
  - `EXPENSE_CATEGORIES` (8 khoản mục, thứ tự như Global Constraints);
  - `type ExpenseCategory`;
  - `INCOME_CATEGORIES`, `MANUAL_CATEGORIES`, `OTHER_EXPENSE = 'Khác'`, `OTHER_INCOME = 'Thu khác'`;
  - `manualCategory(type, category?)`, `expenseCategoryOf(category: string | null): ExpenseCategory`;
  - frontend: `FUND_CATEGORIES`, `DEFAULT_FUND_CATEGORY` trong `lib/labels.ts`.
  - Trạng thái e2e sau task này, các phiếu thủ công ở cs3:
    - chi Điện nước 500.000;
    - chi Lương 1.000.000 (CK);
    - chi không ghi khoản mục 20.000 → Khác;
    - chi Marketing 300.000, đã hủy;
    - chi cũ "Chi linh tinh" 10.000, chèn thẳng vào DB → Khác;
    - thu 200.000 → Thu khác.
  - Ngoài ra có phiếu chi "Nhập hàng" 100.000 của lô nhập đầu tiên (Task 2).

- [ ] **Step 1: Viết unit test (thất bại)**

`502-backend/src/funds/fund-categories.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryOf,
  manualCategory,
} from './fund-categories';

describe('fund categories', () => {
  it('lists the fixed expense categories, "Khác" last', () => {
    expect(EXPENSE_CATEGORIES).toEqual([
      'Lương',
      'Mặt bằng',
      'Điện nước',
      'Sửa chữa – bảo trì',
      'Marketing',
      'Vật tư tiêu hao',
      'Thuế – phí',
      'Khác',
    ]);
  });

  it('defaults a manual entry to "Khác" / "Thu khác"', () => {
    expect(manualCategory(TransactionType.EXPENSE)).toBe('Khác');
    expect(manualCategory(TransactionType.INCOME, '')).toBe('Thu khác');
  });

  it('only takes the categories of the entry type', () => {
    expect(manualCategory(TransactionType.EXPENSE, 'Điện nước')).toBe(
      'Điện nước',
    );
    expect(() => manualCategory(TransactionType.INCOME, 'Lương')).toThrow(
      BadRequestException,
    );
    expect(() => manualCategory(TransactionType.EXPENSE, 'Thu khác')).toThrow(
      BadRequestException,
    );
  });

  it('counts entries from before the fixed list as "Khác"', () => {
    expect(expenseCategoryOf('Marketing')).toBe('Marketing');
    expect(expenseCategoryOf('Chi linh tinh')).toBe('Khác');
    expect(expenseCategoryOf(null)).toBe('Khác');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `cd 502-backend && npx jest src/funds/fund-categories.spec.ts`
Expected: FAIL, `Cannot find module './fund-categories'`.

- [ ] **Step 3: Viết `fund-categories.ts`**

`502-backend/src/funds/fund-categories.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';

// Khoản mục of the manual phiếu thu / phiếu chi: a fixed list, so the profit
// report can split the operating expenses. Entries written by sales and
// imports keep SALES_CATEGORY / PURCHASE_CATEGORY (fund-ledger.ts).
export const EXPENSE_CATEGORIES = [
  'Lương',
  'Mặt bằng',
  'Điện nước',
  'Sửa chữa – bảo trì',
  'Marketing',
  'Vật tư tiêu hao',
  'Thuế – phí',
  'Khác',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const INCOME_CATEGORIES = ['Thu khác'] as const;

export const MANUAL_CATEGORIES: readonly string[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];

export const OTHER_EXPENSE: ExpenseCategory = 'Khác';
export const OTHER_INCOME = 'Thu khác';

const CATEGORIES_OF: Record<TransactionType, readonly string[]> = {
  EXPENSE: EXPENSE_CATEGORIES,
  INCOME: INCOME_CATEGORIES,
};

// The category of a new manual entry: one of its type's, or the type's
// default when left out.
export function manualCategory(
  type: TransactionType,
  category?: string,
): string {
  if (!category) {
    return type === TransactionType.EXPENSE ? OTHER_EXPENSE : OTHER_INCOME;
  }
  if (!CATEGORIES_OF[type].includes(category)) {
    throw new BadRequestException(
      `Khoản mục "${category}" không dùng cho phiếu ${
        type === TransactionType.EXPENSE ? 'chi' : 'thu'
      }`,
    );
  }
  return category;
}

// The profit report line a phiếu chi counts in: entries from before the
// fixed list (free text, or none) count as "Khác".
export function expenseCategoryOf(category: string | null): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')
    ? (category as ExpenseCategory)
    : OTHER_EXPENSE;
}
```

- [ ] **Step 4: Chạy test, xác nhận qua**

Run: `cd 502-backend && npx jest src/funds/fund-categories.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Kiểm tra ở DTO và service**

1. `502-backend/src/funds/dto/create-fund-transaction.dto.ts`:
   - Thêm `IsIn` vào import từ `class-validator`.
   - Thêm `import { MANUAL_CATEGORIES } from '../fund-categories';`.
   - Thay khối của `category` bằng:

```ts
  @ApiProperty({
    required: false,
    enum: MANUAL_CATEGORIES,
    description:
      'Khoản mục: chi theo danh sách cố định, thu là "Thu khác". Mặc định "Khác" / "Thu khác".',
  })
  @IsOptional()
  @IsIn(MANUAL_CATEGORIES, { message: 'Khoản mục không hợp lệ' })
  category?: string;
```

2. `502-backend/src/funds/funds.service.ts`, trong `create`:
   - Thêm `import { manualCategory } from './fund-categories';`.
   - Thay `category: dto.category?.trim() || null,` bằng `category: manualCategory(dto.type, dto.category),`.
   - Đổi comment `// Manual phiếu thu / phiếu chi.` thành `// Manual phiếu thu / phiếu chi, under a fixed category (fund-categories.ts).`

- [ ] **Step 6: Viết e2e**

Thêm vào **cuối** describe ngoài cùng của `test/costing.e2e-spec.ts`:

```ts
  describe('expense categories', () => {
    it('takes only the fixed categories of the entry type', async () => {
      await post('/funds', {
        type: 'EXPENSE',
        amount: 500000,
        category: 'Điện nước',
      }).expect(201);
      await post('/funds', {
        type: 'EXPENSE',
        method: 'TRANSFER',
        amount: 1000000,
        category: 'Lương',
      }).expect(201);
      const other = (
        await post('/funds', { type: 'EXPENSE', amount: 20000 }).expect(201)
      ).body as Json;
      expect(other.category).toBe('Khác');
      const income = (
        await post('/funds', { type: 'INCOME', amount: 200000 }).expect(201)
      ).body as Json;
      expect(income.category).toBe('Thu khác');

      await post('/funds', {
        type: 'EXPENSE',
        amount: 1000,
        category: 'Mua đá',
      }).expect(400);
      await post('/funds', {
        type: 'INCOME',
        amount: 1000,
        category: 'Lương',
      }).expect(400);

      // Cancelled: out of every total.
      const marketing = (
        await post('/funds', {
          type: 'EXPENSE',
          amount: 300000,
          category: 'Marketing',
        }).expect(201)
      ).body as Json;
      await post(`/funds/${marketing.id as number}/cancel`, {
        reason: 'Ghi nhầm',
      }).expect(200);

      // An entry from before the fixed list (free text).
      const branch = await prisma.branch.findUniqueOrThrow({
        where: { code: 'cs3' },
      });
      await prisma.fundTransaction.create({
        data: {
          branchId: branch.id,
          type: 'EXPENSE',
          amount: 10000,
          category: 'Chi linh tinh',
        },
      });
    });
  });
```

- [ ] **Step 7: Frontend — danh sách khoản mục**

Trong `502-frontend/src/lib/labels.ts`, thêm sau `FUND_TYPE_LABELS`:

```ts
// Khoản mục of manual phiếu thu / chi: the backend's funds/fund-categories.ts.
export const FUND_CATEGORIES: Record<FundType, string[]> = {
  EXPENSE: ["Lương", "Mặt bằng", "Điện nước", "Sửa chữa – bảo trì", "Marketing", "Vật tư tiêu hao", "Thuế – phí", "Khác"],
  INCOME: ["Thu khác"],
};

export const DEFAULT_FUND_CATEGORY: Record<FundType, string> = { EXPENSE: "Khác", INCOME: "Thu khác" };
```

- [ ] **Step 8: Frontend — hộp thoại lập phiếu dùng Select**

Trong `502-frontend/src/app/[branch]/funds/page.tsx`:

1. Xóa hằng `CATEGORY_SUGGESTIONS` (cả khối).
2. Import thêm `DEFAULT_FUND_CATEGORY, FUND_CATEGORIES` từ `@/lib/labels`. Dòng đó đã import `BUSINESS_DAY_HINT, DOC_TYPE_LABELS, FUND_TYPE_LABELS, PAYMENT_METHOD_LABELS`; giữ thứ tự chữ cái.
3. `openForm`: đổi `category: ""` thành `category: DEFAULT_FUND_CATEGORY[fundType]`.
4. Trong `save`: đổi `category: form.category.trim() || undefined,` thành `category: form.category,`.
5. ToggleGroup "Loại phiếu": đổi `onValueChange` thành

```tsx
                    onValueChange={(v) =>
                      v && setForm({ ...form, type: v as FundType, category: DEFAULT_FUND_CATEGORY[v as FundType] })
                    }
```

6. Thay toàn bộ `<Field>` của khoản mục (từ `<FieldLabel htmlFor="fund-category">` đến hết `</datalist>` và `</Field>` đóng) bằng:

```tsx
                  <Field>
                    <FieldLabel htmlFor="fund-category">Khoản mục</FieldLabel>
                    <Select value={form.category} onValueChange={(category) => setForm({ ...form, category })}>
                      <SelectTrigger id="fund-category" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FUND_CATEGORIES[form.type].map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
```

`Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` đã được import sẵn trong file. Nếu lint báo `Input` không còn dùng thì **không** xóa: ô "Thời gian" vẫn dùng `Input`.

- [ ] **Step 9: Chạy kiểm tra**

Run:
```bash
cd 502-backend && npm test && npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts && npm run test:e2e && npm run lint && cd ..
npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build
```
Expected: tất cả PASS / không lỗi. Bài `foundation` tạo phiếu chi không ghi khoản mục; nay phiếu đó nhận "Khác" và vẫn qua.

- [ ] **Step 10: Commit**

```bash
git add 502-backend/src/funds 502-backend/test/costing.e2e-spec.ts 502-frontend/src/lib/labels.ts "502-frontend/src/app/[branch]/funds/page.tsx"
git commit -m "feat: khoản mục thu chi cố định

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 5: Báo cáo Hàng hóa có giá vốn, lãi gộp và % biên

**Files:**
- Modify: `502-backend/src/reports/breakdown-reports.service.ts` (`ProductSales`, `products()`)
- Test: `502-backend/test/costing.e2e-spec.ts` (thêm `describe` ở cuối)
- Modify: `502-frontend/src/lib/types.ts` (`ProductSales`), `502-frontend/src/lib/format.ts` (`formatAmount`), `502-frontend/src/app/[branch]/reports/products/page.tsx`

**Interfaces:**
- Consumes:
  - `OrderItem.unitCost` (Task 3), `roundCost` (Task 1);
  - trạng thái e2e sau Task 3: hóa đơn 2 có 1 bia giá vốn 17980, 1 phụ thu giá vốn 0.
- Produces:
  - `ProductSales` có thêm `cost`, `grossProfit`, `margin: number | null`, ở cả hàng và `totals`;
  - frontend: `formatAmount(value: number): string`.

- [ ] **Step 1: Viết e2e (thất bại)**

Thêm vào **cuối** describe ngoài cùng của `test/costing.e2e-spec.ts`:

```ts
  describe('products report', () => {
    it('adds the cost of goods, the gross profit and the margin', async () => {
      const res = (await get(`/reports/products?${period}`).expect(200))
        .body as { totals: Json; rows: Json[] };
      const beer = res.rows.find((r) => r.id === beerId)!;
      expect(beer).toMatchObject({
        quantity: 1,
        gross: 30000,
        net: 30000,
        cost: 17980,
        grossProfit: 12020,
      });
      expect(beer.margin as number).toBeCloseTo(12020 / 30000, 6);
      expect(res.rows.find((r) => r.id === feeId)).toMatchObject({
        quantity: 1,
        cost: 0,
        grossProfit: 50000,
        margin: 1,
      });
      expect(res.totals).toMatchObject({
        net: 80000,
        cost: 17980,
        grossProfit: 62020,
      });
    });
  });
```

- [ ] **Step 2: Chạy e2e, xác nhận thất bại**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts`
Expected: FAIL, `cost` không có trong hàng.

- [ ] **Step 3: Sửa `breakdown-reports.service.ts`**

1. Import: thêm `import { roundCost } from '../inventory/costing';`.

2. Thay interface `ProductSales` (cả comment) bằng:

```ts
// What a set of lines sold: `gross` = Σ quantity × price, `discount` = its
// share of the bills' product discount, `net` = gross − discount (before
// VAT), `cost` = Σ quantity × unitCost (cost of goods sold), `grossProfit`
// = net − cost and `margin` = grossProfit / net (null when net is 0).
export interface ProductSales {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
  cost: number;
  grossProfit: number;
  margin: number | null;
}
```

3. Trong `products()`, câu SQL: thêm cột `cost` và kiểu tương ứng:

```ts
    const lines = await this.prisma.$queryRaw<
      {
        productId: number;
        quantity: number;
        gross: number;
        discount: number;
        cost: number;
      }[]
    >`
      SELECT i."productId" AS "productId",
        SUM(i."quantity")::int AS "quantity",
        SUM(i."quantity" * i."price")::float8 AS "gross",
        COALESCE(SUM(i."quantity" * i."price" * o."discountAmount"
          / NULLIF(o."totalProductPrice", 0)), 0)::float8 AS "discount",
        COALESCE(SUM(i."quantity" * i."unitCost"), 0)::float8 AS "cost"
      FROM "OrderItem" i
      JOIN "Order" o ON o."id" = i."orderId"
      WHERE ${paidOrdersWhere(branchId, query.from, query.to)}
      GROUP BY 1`;
```

4. Kiểu của `groups`: đổi thành

```ts
    const groups = new Map<
      number | null,
      Omit<ProductRow, 'net' | 'share' | 'grossProfit' | 'margin'>
    >();
```

5. Thêm `cost: 0,` vào **cả hai** đối tượng khởi tạo nhóm, sau `discount: 0,`. Sau `group.discount += line.discount;` thêm `group.cost += line.cost;`.

6. Thay đoạn từ `const quantity = list.reduce(` đến hết `return { … }` của hàm bằng:

```ts
    const quantity = list.reduce((sum, group) => sum + group.quantity, 0);
    const gross = list.reduce((sum, group) => sum + group.gross, 0);
    const discount = discounts.reduce((sum, value) => sum + value, 0);
    const net = gross - discount;
    const cost = roundCost(list.reduce((sum, group) => sum + group.cost, 0));
    const rows = list.map((group, i): ProductRow => {
      const rowNet = group.gross - discounts[i];
      const rowCost = roundCost(group.cost);
      const grossProfit = roundCost(rowNet - rowCost);
      return {
        ...group,
        discount: discounts[i],
        net: rowNet,
        cost: rowCost,
        grossProfit,
        margin: rowNet ? grossProfit / rowNet : null,
        share: net ? rowNet / net : null,
      };
    });
    const grossProfit = roundCost(net - cost);
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      totals: {
        quantity,
        gross,
        discount,
        net,
        cost,
        grossProfit,
        margin: net ? grossProfit / net : null,
      },
      rows: rank(rows, (r) => r.net),
    };
```

- [ ] **Step 4: Chạy test backend**

Run:
```bash
cd 502-backend
npm test
npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts
npm run test:e2e
npm run lint
```
Expected: tất cả PASS. `reports.e2e-spec.ts` so `byCategory.totals` với `res.totals` bằng `toEqual`; ở đó giá vốn đều bằng 0 nên hai bên vẫn bằng nhau.

- [ ] **Step 5: Frontend — kiểu và `formatAmount`**

1. `502-frontend/src/lib/types.ts`: thay `ProductSales` bằng

```ts
export interface ProductSales {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
  cost: number; // giá vốn: Σ quantity × unit cost at checkout (may carry cents)
  grossProfit: number; // net − cost
  margin: number | null; // grossProfit / net; null when net is 0
}
```

2. `502-frontend/src/lib/format.ts`: thêm sau `formatNumber`:

```ts
// An amount that may carry cents (costs), to the đồng.
export const formatAmount = (value: number) => (Math.round(value) || 0).toLocaleString("vi-VN");
```

- [ ] **Step 6: Frontend — cột mới ở trang Hàng hóa**

Trong `502-frontend/src/app/[branch]/reports/products/page.tsx`:

1. Import thêm `formatAmount` từ `@/lib/format`.

2. `columnsFor`: thêm ba cột sau cột "Doanh thu thuần (chưa VAT)":

```ts
    { header: "Giá vốn", type: "money", value: (r) => r.cost },
    { header: "Lãi gộp", type: "money", value: (r) => r.grossProfit },
    { header: "% biên", type: "percent", value: (r) => r.margin },
```

3. Thay `SalesCells` bằng:

```tsx
function SalesCells({ m, share }: { m: ProductSales; share: number | null }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.quantity)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.gross)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.discount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.net)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatAmount(m.cost)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatAmount(m.grossProfit)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatPercent(m.margin)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatPercent(share)}</TableCell>
    </>
  );
}
```

4. Đầu bảng: thay các `TableHead` sau cột đầu tiên bằng (đúng thứ tự của `SalesCells`):

```tsx
                        <TableHead className={cn("text-right", SHOW_FROM.xs)}>SL</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.lg)}>Thành tiền</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.lg)}>Giảm giá</TableHead>
                        <TableHead className="text-right">Doanh thu</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.md)}>Giá vốn</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.sm)}>Lãi gộp</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.md)}>% biên</TableHead>
                        <TableHead className={cn("text-right", SHOW_FROM.lg)}>Tỷ trọng</TableHead>
```

5. Ô tổng: trong hàng tổng của `exportExcel`, spread `...data.totals` đã mang `cost`, `grossProfit`, `margin`, nên không cần sửa.

6. Thẻ số liệu:
   - Đổi lưới thành `grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-5` (cả lưới skeleton, với `length: 5`).
   - Thêm thẻ thứ hai, ngay sau thẻ "Doanh thu thuần":

```tsx
            <StatTile
              label="Lãi gộp"
              value={formatMoney(t.grossProfit)}
              footer={`Giá vốn ${formatMoney(t.cost)} · biên ${formatPercent(t.margin)}`}
            />
```

7. `PageHeader` description: thêm câu `Giá vốn là giá bình quân lúc bán.` ngay trước `${BUSINESS_DAY_HINT}`.

- [ ] **Step 7: Kiểm tra frontend**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src/reports/breakdown-reports.service.ts 502-backend/test/costing.e2e-spec.ts 502-frontend/src/lib/types.ts 502-frontend/src/lib/format.ts "502-frontend/src/app/[branch]/reports/products/page.tsx"
git commit -m "feat: giá vốn, lãi gộp và % biên trong báo cáo hàng hóa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 6: `GET /reports/profit` — Lãi lỗ theo kỳ

**Files:**
- Modify: `502-backend/src/reports/report-sql.ts` (export `utcTimestamp`, thêm `branchWhere`, `periodWhere`; `paidOrdersWhere` dùng `periodWhere`)
- Modify: `502-backend/src/reports/reports.service.ts` (`daily` thành public)
- Create: `502-backend/src/reports/profit.ts`, `502-backend/src/reports/profit.spec.ts`
- Create: `502-backend/src/reports/accounting-reports.service.ts`
- Modify: `502-backend/src/reports/reports.controller.ts`, `502-backend/src/reports/reports.module.ts`
- Test: `502-backend/test/costing.e2e-spec.ts` (thêm `describe` ở cuối)

**Interfaces:**
- Consumes:
  - `EXPENSE_CATEGORIES`, `ExpenseCategory`, `expenseCategoryOf` (Task 4);
  - `RevenueSums`, `toMetrics` (`revenue-metrics.ts`);
  - `bucketsBetween`, `rollUp`, `Bucket`, `GroupBy` (`buckets.ts`);
  - `reportScope`; `ReportQuery`;
  - `ReportsService.daily(branchId, from, to)`, rows `RevenueSums & { date: string; branchId: number }`.
- Produces:
  - `utcTimestamp(date: Date): Prisma.Sql`
  - `branchWhere(column: Prisma.Sql, branchId: number | undefined): Prisma.Sql` — `AND col = id`, hoặc rỗng khi toàn chuỗi
  - `periodWhere(column, branchColumn, branchId, from, to): Prisma.Sql`
  - `ProfitSums`, `ProfitMetrics`, `ProfitDay`, `emptyProfit`, `addProfit`, `sumProfit`, `toProfitMetrics`
  - `AccountingReportsService.profit(user, query: ReportQuery): Promise<ProfitReport>`, với
    ```ts
    interface ProfitReport {
      branchId: number | null;
      range: Range;
      groupBy: GroupBy;
      categories: ExpenseCategory[];
      totals: ProfitMetrics;
      buckets: (Bucket & ProfitMetrics)[];
    }
    ```
  - Task 7 thêm `inventory()` vào cùng service.

- [ ] **Step 1: Viết unit test cho `profit.ts` (thất bại)**

`502-backend/src/reports/profit.spec.ts`:

```ts
import { addProfit, emptyProfit, sumProfit, toProfitMetrics } from './profit';
import { emptySums, RevenueSums } from './revenue-metrics';

const sales = (patch: Partial<RevenueSums>): RevenueSums => ({
  ...emptySums(),
  ...patch,
});

describe('profit', () => {
  it('is gross profit − expenses − losses + other income', () => {
    const m = toProfitMetrics(
      sumProfit([
        {
          date: '2026-09-01',
          sales: sales({
            orderCount: 2,
            roomFee: 400000,
            productSales: 700000,
            productDiscount: 100000,
            vat: 100000,
            collected: 1100000,
          }),
        },
        { date: '2026-09-01', cogs: 300000 },
        {
          date: '2026-09-02',
          expense: { category: 'Điện nước', amount: 200000 },
        },
        {
          date: '2026-09-02',
          expense: { category: 'Chi linh tinh', amount: 50000 },
        },
        { date: '2026-09-02', losses: 25000.5 },
        { date: '2026-09-03', otherIncome: 10000 },
        { date: '2026-09-03', purchases: 999000 },
      ]),
    );
    expect(m).toMatchObject({
      revenue: 1000000,
      vat: 100000,
      roomFee: 400000,
      productSales: 700000,
      productDiscount: 100000,
      cogs: 300000,
      grossProfit: 700000,
      grossMargin: 0.7,
      expenseTotal: 250000,
      losses: 25000.5,
      otherIncome: 10000,
      purchases: 999000,
      profit: 434999.5,
    });
    expect(m.expenses['Điện nước']).toBe(200000);
    expect(m.expenses['Khác']).toBe(50000);
    expect(m.expenses['Lương']).toBe(0);
    expect(m.profitMargin).toBeCloseTo(0.4349995, 6);
  });

  it('has no margins without revenue', () => {
    const m = toProfitMetrics(emptyProfit());
    expect(m.grossMargin).toBeNull();
    expect(m.profitMargin).toBeNull();
    expect(m.profit).toBe(0);
    expect(Object.keys(m.expenses)).toHaveLength(8);
  });

  it('rounds sums to the cent', () => {
    const acc = emptyProfit();
    addProfit(acc, { date: '2026-09-01', cogs: 0.1 });
    addProfit(acc, { date: '2026-09-01', cogs: 0.2 });
    expect(toProfitMetrics(acc).cogs).toBe(0.3);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `cd 502-backend && npx jest src/reports/profit.spec.ts`
Expected: FAIL, `Cannot find module './profit'`.

- [ ] **Step 3: Viết `profit.ts`**

`502-backend/src/reports/profit.ts`:

```ts
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  expenseCategoryOf,
} from '../funds/fund-categories';
import { RevenueSums, toMetrics } from './revenue-metrics';

// Profit and loss (lãi lỗ) of a period:
//   revenue (before VAT) − cost of goods sold = gross profit,
//   − operating expenses (manual phiếu chi, by category)
//   − goods exported (hao hụt) + other income (manual phiếu thu) = profit.
// VAT (owed to the state) and the purchases (bought goods become stock, a
// cost only once sold or exported) are shown apart.
export interface ProfitSums {
  roomFee: number;
  roomDiscount: number;
  productSales: number;
  productDiscount: number;
  revenue: number;
  vat: number;
  cogs: number;
  expenses: Record<ExpenseCategory, number>;
  losses: number;
  otherIncome: number;
  purchases: number;
}

export interface ProfitMetrics extends ProfitSums {
  grossProfit: number;
  grossMargin: number | null; // of revenue; null without revenue
  expenseTotal: number;
  profit: number;
  profitMargin: number | null;
}

// One row of one of the profit report's queries, on a business day.
export interface ProfitDay {
  date: string;
  sales?: RevenueSums;
  cogs?: number;
  expense?: { category: string | null; amount: number };
  otherIncome?: number;
  losses?: number;
  purchases?: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

export function emptyProfit(): ProfitSums {
  return {
    roomFee: 0,
    roomDiscount: 0,
    productSales: 0,
    productDiscount: 0,
    revenue: 0,
    vat: 0,
    cogs: 0,
    expenses: Object.fromEntries(
      EXPENSE_CATEGORIES.map((category) => [category, 0]),
    ) as Record<ExpenseCategory, number>,
    losses: 0,
    otherIncome: 0,
    purchases: 0,
  };
}

export function addProfit(acc: ProfitSums, day: ProfitDay): void {
  if (day.sales) {
    const sales = toMetrics(day.sales);
    acc.roomFee += sales.roomFee;
    acc.roomDiscount += sales.roomDiscount;
    acc.productSales += sales.productSales;
    acc.productDiscount += sales.productDiscount;
    acc.revenue += sales.revenue;
    acc.vat += sales.vat;
  }
  if (day.expense) {
    acc.expenses[expenseCategoryOf(day.expense.category)] += Number(
      day.expense.amount,
    );
  }
  acc.cogs += Number(day.cogs ?? 0);
  acc.losses += Number(day.losses ?? 0);
  acc.otherIncome += Number(day.otherIncome ?? 0);
  acc.purchases += Number(day.purchases ?? 0);
}

export function sumProfit(days: ProfitDay[]): ProfitSums {
  const acc = emptyProfit();
  for (const day of days) addProfit(acc, day);
  return acc;
}

export function toProfitMetrics(sums: ProfitSums): ProfitMetrics {
  const expenses = Object.fromEntries(
    Object.entries(sums.expenses).map(([category, value]) => [
      category,
      cents(value),
    ]),
  ) as Record<ExpenseCategory, number>;
  const revenue = cents(sums.revenue);
  const cogs = cents(sums.cogs);
  const losses = cents(sums.losses);
  const otherIncome = cents(sums.otherIncome);
  const grossProfit = cents(revenue - cogs);
  const expenseTotal = cents(
    Object.values(expenses).reduce((sum, value) => sum + value, 0),
  );
  const profit = cents(grossProfit - expenseTotal - losses + otherIncome);
  return {
    roomFee: cents(sums.roomFee),
    roomDiscount: cents(sums.roomDiscount),
    productSales: cents(sums.productSales),
    productDiscount: cents(sums.productDiscount),
    revenue,
    vat: cents(sums.vat),
    cogs,
    expenses,
    losses,
    otherIncome,
    purchases: cents(sums.purchases),
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : null,
    expenseTotal,
    profit,
    profitMargin: revenue ? profit / revenue : null,
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận qua**

Run: `cd 502-backend && npx jest src/reports/profit.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Mảnh SQL dùng chung trong `report-sql.ts`**

1. Đổi `const utcTimestamp = (date: Date) =>` thành `export const utcTimestamp = (date: Date) =>` (giữ comment).

2. Thay toàn bộ `paidOrdersWhere` (cả comment) bằng:

```ts
// `AND <column> = branchId`; nothing for the whole chain (undefined).
export function branchWhere(
  column: Prisma.Sql,
  branchId: number | undefined,
): Prisma.Sql {
  return branchId === undefined
    ? Prisma.empty
    : Prisma.sql`AND ${column} = ${branchId}`;
}

// Rows dated by the timestamp `column` within the business days from..to,
// of one branch (`branchColumn`) or of every branch when branchId is
// undefined.
export function periodWhere(
  column: Prisma.Sql,
  branchColumn: Prisma.Sql,
  branchId: number | undefined,
  from: string,
  to: string,
): Prisma.Sql {
  const range = businessDayRange(from, to);
  return Prisma.sql`${column} >= ${utcTimestamp(range.gte!)}
    AND ${column} < ${utcTimestamp(range.lt!)}
    ${branchWhere(branchColumn, branchId)}`;
}

// Paid bills (`"Order" o`) of the business days from..to, by payment time;
// every branch when branchId is undefined.
export function paidOrdersWhere(
  branchId: number | undefined,
  from: string,
  to: string,
): Prisma.Sql {
  return Prisma.sql`o."status" = 'COMPLETED'
    AND ${periodWhere(Prisma.sql`o."endTime"`, Prisma.sql`o."branchId"`, branchId, from, to)}`;
}
```

- [ ] **Step 6: `ReportsService.daily` thành public**

Trong `502-backend/src/reports/reports.service.ts`:
- Đổi `type DailyRow = RevenueSums & { date: string; branchId: number };` thành `export type DailyRow = …` (cùng nội dung). `tsconfig.json` có `declaration: true`, nên method public không được trả về kiểu không export (lỗi TS4053).
- Xóa từ khóa `private` trước `daily(`.
- Nối vào cuối comment ngay trên hàm (`// … One query per // range, so a report's totals, periods and branches always agree.`) dòng:

```ts
  // Also the sales lines of the profit report (AccountingReportsService).
```

- [ ] **Step 7: Viết `accounting-reports.service.ts`**

`502-backend/src/reports/accounting-reports.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
} from '../funds/fund-categories';
import { Bucket, bucketsBetween, GroupBy, rollUp } from './buckets';
import {
  addProfit,
  emptyProfit,
  ProfitDay,
  ProfitMetrics,
  sumProfit,
  toProfitMetrics,
} from './profit';
import { businessDateSql, paidOrdersWhere, periodWhere } from './report-sql';
import { reportScope } from './report-scope';
import { ReportsService } from './reports.service';
import { ReportQuery } from './dto/report-query';

interface Range {
  from: string;
  to: string;
}

export interface ProfitReport {
  branchId: number | null; // null: the whole chain
  range: Range;
  groupBy: GroupBy;
  categories: ExpenseCategory[]; // the expense lines, in order
  totals: ProfitMetrics;
  buckets: (Bucket & ProfitMetrics)[];
}

// Accounting reports: profit and loss, and the stock ledger. Like the
// revenue report, the SQL sums per business day and the periods are
// rolled up here.
@Injectable()
export class AccountingReportsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
    private reports: ReportsService,
  ) {}

  // Profit and loss per period. Sales and their cost by payment time,
  // manual fund entries by their time (cancelled ones and those written by
  // sales and imports left out), exports of documents still standing and
  // the imports' amounts by the document's time. `compare` is not used
  // (Ruling 7).
  async profit(user: AuthUser, query: ReportQuery): Promise<ProfitReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const groupBy = query.groupBy ?? 'day';
    const { from, to } = query;

    const [sales, cogs, fund, losses, purchases] = await Promise.all([
      this.reports.daily(branchId, from, to),
      this.prisma.$queryRaw<{ date: string; cogs: number }[]>`
        SELECT ${businessDateSql(Prisma.sql`o."endTime"`)} AS "date",
          COALESCE(SUM(i."quantity" * i."unitCost"), 0)::float8 AS "cogs"
        FROM "OrderItem" i
        JOIN "Order" o ON o."id" = i."orderId"
        WHERE ${paidOrdersWhere(branchId, from, to)}
        GROUP BY 1`,
      this.prisma.$queryRaw<
        {
          date: string;
          type: TransactionType;
          category: string | null;
          amount: number;
        }[]
      >`
        SELECT ${businessDateSql(Prisma.sql`f."occurredAt"`)} AS "date",
          f."type" AS "type", f."category" AS "category",
          SUM(f."amount")::float8 AS "amount"
        FROM "FundTransaction" f
        WHERE f."cancelledAt" IS NULL
          AND f."orderId" IS NULL
          AND f."stockDocumentId" IS NULL
          AND ${periodWhere(Prisma.sql`f."occurredAt"`, Prisma.sql`f."branchId"`, branchId, from, to)}
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<{ date: string; losses: number }[]>`
        SELECT ${businessDateSql(Prisma.sql`m."createdAt"`)} AS "date",
          SUM(-m."quantity" * m."unitCost")::float8 AS "losses"
        FROM "StockMovement" m
        JOIN "StockDocument" d ON d."id" = m."documentId"
        WHERE m."type" = 'EXPORT'
          AND d."cancelledAt" IS NULL
          AND ${periodWhere(Prisma.sql`m."createdAt"`, Prisma.sql`m."branchId"`, branchId, from, to)}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ date: string; purchases: number }[]>`
        SELECT ${businessDateSql(Prisma.sql`d."createdAt"`)} AS "date",
          SUM(d."totalAmount")::float8 AS "purchases"
        FROM "StockDocument" d
        WHERE d."type" = 'IMPORT'
          AND d."cancelledAt" IS NULL
          AND ${periodWhere(Prisma.sql`d."createdAt"`, Prisma.sql`d."branchId"`, branchId, from, to)}
        GROUP BY 1`,
    ]);

    const days: ProfitDay[] = [
      ...sales.map((row) => ({ date: row.date, sales: row })),
      ...cogs.map((row) => ({ date: row.date, cogs: row.cogs })),
      ...fund.map((row) =>
        row.type === TransactionType.EXPENSE
          ? {
              date: row.date,
              expense: { category: row.category, amount: row.amount },
            }
          : { date: row.date, otherIncome: row.amount },
      ),
      ...losses.map((row) => ({ date: row.date, losses: row.losses })),
      ...purchases.map((row) => ({
        date: row.date,
        purchases: row.purchases,
      })),
    ];

    return {
      branchId: branchId ?? null,
      range: { from, to },
      groupBy,
      categories: [...EXPENSE_CATEGORIES],
      totals: toProfitMetrics(sumProfit(days)),
      buckets: rollUp(
        bucketsBetween(from, to, groupBy),
        groupBy,
        days,
        emptyProfit,
        (acc, day) => addProfit(acc, day),
      ).map(({ bucket, value }) => ({ ...bucket, ...toProfitMetrics(value) })),
    };
  }
}
```

- [ ] **Step 8: Route và module**

1. `502-backend/src/reports/reports.module.ts`: thêm `AccountingReportsService` vào `providers` (import từ `./accounting-reports.service`).

2. `502-backend/src/reports/reports.controller.ts`:
   - Import `AccountingReportsService`.
   - Thêm `private readonly accounting: AccountingReportsService,` vào constructor.
   - Thêm route sau `hours`:

```ts
  // Profit and loss per period: revenue before VAT − cost of goods sold −
  // operating expenses − goods exported + other income.
  @Get('profit')
  profit(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.accounting.profit(user, query);
  }
```

- [ ] **Step 9: Viết e2e**

Thêm vào **cuối** describe ngoài cùng của `test/costing.e2e-spec.ts`:

```ts
  describe('profit and loss', () => {
    interface Profit {
      branchId: number | null;
      categories: string[];
      totals: Record<string, number> & { expenses: Record<string, number> };
      buckets: { profit: number; cogs: number }[];
    }

    it('counts exports as losses, not the cancelled ones', async () => {
      await exportBeer(2);
      const cancelled = await exportBeer(1);
      await cancelDocument(cancelled.id as number);
      // An export and its cancellation leave the average as it was.
      expect(await costOf()).toBe(18404.62);
      expect((await stockOf(beerId)).stockQuantity).toBe(24);
    });

    it('is revenue − cost of goods − expenses − losses + other income', async () => {
      const revenue = (
        (await get(`/reports/revenue?${period}`).expect(200)).body as {
          totals: Record<string, number>;
        }
      ).totals;
      const res = (await get(`/reports/profit?${period}`).expect(200))
        .body as Profit;
      const t = res.totals;
      expect(res.categories).toEqual([
        'Lương',
        'Mặt bằng',
        'Điện nước',
        'Sửa chữa – bảo trì',
        'Marketing',
        'Vật tư tiêu hao',
        'Thuế – phí',
        'Khác',
      ]);
      expect(t.revenue).toBe(revenue.revenue);
      expect(t.vat).toBe(revenue.vat);
      // The voided first bill is out; the corrected second one took 1 beer.
      expect(t.cogs).toBe(17980);
      expect(t.grossProfit).toBeCloseTo(revenue.revenue - 17980, 2);
      expect(t.expenses).toEqual({
        Lương: 1000000,
        'Mặt bằng': 0,
        'Điện nước': 500000,
        'Sửa chữa – bảo trì': 0,
        Marketing: 0,
        'Vật tư tiêu hao': 0,
        'Thuế – phí': 0,
        Khác: 30000,
      });
      expect(t.expenseTotal).toBe(1530000);
      expect(t.losses).toBeCloseTo(2 * 18404.62, 2);
      expect(t.otherIncome).toBe(200000);
      // Imports of 10 × 10,000, 10 × 20,000, 4 × 30,000 and 3 × 25,500 (the
      // cancelled one left out); the paid import's phiếu chi is no expense.
      expect(t.purchases).toBe(496500);
      expect(t.profit).toBeCloseTo(
        revenue.revenue - 17980 - 1530000 - 2 * 18404.62 + 200000,
        2,
      );
      expect(
        res.buckets.reduce((sum, bucket) => sum + bucket.profit, 0),
      ).toBeCloseTo(t.profit, 2);

      // The products report sees the same cost of goods.
      const products = (await get(`/reports/products?${period}`).expect(200))
        .body as { totals: { cost: number } };
      expect(products.totals.cost).toBe(t.cogs);
    });

    it('covers the whole chain for the chain manager, managers only', async () => {
      const branch = (await get(`/reports/profit?${period}`).expect(200))
        .body as Profit;
      const chain = (
        await api()
          .get(`/api/reports/profit?${period}&groupBy=month`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .expect(200)
      ).body as Profit;
      expect(chain.branchId).toBeNull();
      expect(chain.totals.profit).toBeCloseTo(branch.totals.profit, 2);
      await api()
        .get(`/api/reports/profit?${period}`)
        .set('Authorization', `Bearer ${tokens.tn1_cs1}`)
        .expect(403);
    });
  });
```

- [ ] **Step 10: Chạy test**

Run:
```bash
cd 502-backend
npm test
npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts
npm run test:e2e
npm run lint
```
Expected: tất cả PASS. `reports.e2e-spec.ts` vẫn qua sau khi `paidOrdersWhere` đổi sang `periodWhere` (cùng điều kiện).

- [ ] **Step 11: Commit**

```bash
git add 502-backend/src/reports 502-backend/test/costing.e2e-spec.ts
git commit -m "feat(backend): báo cáo lãi lỗ theo kỳ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 7: `GET /reports/inventory` — Nhập – xuất – tồn

**Files:**
- Modify: `502-backend/src/reports/accounting-reports.service.ts` (thêm `inventory`, `balances`)
- Modify: `502-backend/src/reports/reports.controller.ts` (route `inventory`)
- Test: `502-backend/test/costing.e2e-spec.ts` (thêm `describe` ở cuối)

**Interfaces:**
- Consumes:
  - `utcTimestamp`, `branchWhere`, `periodWhere` (Task 6);
  - `reportScope`, `ReportRangeQuery`;
  - `businessDayRange` (`common/dates.ts`);
  - `roundCost` (Task 1).
- Produces:
  - `StockFlow { quantity: number; value: number }`
  - `InventoryFlows { opening; imports; sales; exports; others; closing: StockFlow }`
  - `InventoryRow extends InventoryFlows { productId: number; name: string; unit: string; categoryId: number | null; categoryName: string | null; branchCode: string }`
  - `InventoryReport { branchId: number | null; range: Range; totals: InventoryFlows; rows: InventoryRow[] }`
  - Quy ước: `imports`, `sales`, `exports` là số dương (lượng ra vẫn ghi dương); `others` = REVERSAL + ADJUSTMENT, có dấu. Hàng xếp theo tên (`localeCompare 'vi'`), rồi theo mã cơ sở.

- [ ] **Step 1: Viết e2e (thất bại)**

Thêm vào **cuối** describe ngoài cùng của `test/costing.e2e-spec.ts`:

```ts
  describe('stock ledger (nhập – xuất – tồn)', () => {
    interface Flow {
      quantity: number;
      value: number;
    }
    type Flows = Record<
      'opening' | 'imports' | 'sales' | 'exports' | 'others' | 'closing',
      Flow
    >;
    interface Ledger {
      branchId: number | null;
      totals: Flows;
      rows: (Flows & { productId: number; name: string; branchCode: string })[];
    }

    it('values each flow at its movements’ cost', async () => {
      const res = (await get(`/reports/inventory?${period}`).expect(200))
        .body as Ledger;
      // The fee is not stock-tracked: it never moves.
      expect(res.rows).toHaveLength(1);
      const beer = res.rows[0];
      expect(beer).toMatchObject({
        productId: beerId,
        name: 'Bia Sài Gòn',
        branchCode: 'cs3',
        opening: { quantity: 0, value: 0 },
        // 10 × 10,000 + 10 × 20,000 + 4 × 30,000 (cancelled later)
        // + 4 × 30,000 + 3 × 25,500
        imports: { quantity: 31, value: 616500 },
        // 4 × 15,000 (voided later) + 2 × 17,500 + 2 × 18,460
        sales: { quantity: 8, value: 131920 },
      });
      expect(beer.exports.quantity).toBe(3);
      expect(beer.exports.value).toBeCloseTo(3 * 18404.62, 2);
      // −4 × 30,000 (cancelled import) + 4 × 15,000 (void) + 3 × 17,980
      // (correction) + 1 × 18,404.62 (cancelled export)
      expect(beer.others.quantity).toBe(4);
      expect(beer.others.value).toBeCloseTo(12344.62, 2);
      expect(beer.closing.quantity).toBe(24);
      expect(beer.closing.value).toBeCloseTo(24 * 18404.62, 2);

      // Quantities always balance; values up to the rounding of the average.
      expect(
        beer.opening.quantity +
          beer.imports.quantity -
          beer.sales.quantity -
          beer.exports.quantity +
          beer.others.quantity,
      ).toBe(beer.closing.quantity);
      expect(
        beer.opening.value +
          beer.imports.value -
          beer.sales.value -
          beer.exports.value +
          beer.others.value,
      ).toBeCloseTo(beer.closing.value, 0);
      expect(res.totals.closing).toEqual(beer.closing);
    });

    it('opens a later day with the closing balance', async () => {
      const day = ymd(daysFromToday(2));
      const res = (
        await get(`/reports/inventory?from=${day}&to=${day}`).expect(200)
      ).body as Ledger;
      const beer = res.rows[0];
      expect(beer).toMatchObject({
        opening: { quantity: 24 },
        imports: { quantity: 0, value: 0 },
        closing: { quantity: 24 },
      });
      expect(beer.opening.value).toBeCloseTo(24 * 18404.62, 2);
    });

    it('covers the whole chain for the chain manager', async () => {
      const chain = (
        await api()
          .get(`/api/reports/inventory?${period}`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .expect(200)
      ).body as Ledger;
      expect(chain.branchId).toBeNull();
      expect(chain.rows.map((r) => r.name)).toEqual(['Bia Sài Gòn']);
    });
  });
```

- [ ] **Step 2: Chạy e2e, xác nhận thất bại**

Run: `cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts`
Expected: FAIL, `/reports/inventory` trả 404.

- [ ] **Step 3: Thêm `inventory` vào `AccountingReportsService`**

Trong `502-backend/src/reports/accounting-reports.service.ts`:

1. Import:
   - `Prisma, StockMovementType, TransactionType` từ `@prisma/client`;
   - `businessDayRange` từ `../common/dates`;
   - `roundCost` từ `../inventory/costing`;
   - `branchWhere`, `utcTimestamp` bổ sung vào import từ `./report-sql`;
   - `ReportRangeQuery` bổ sung vào import từ `./dto/report-query`.

2. Thêm sau interface `ProfitReport`:

```ts
// A quantity and its value at cost.
export interface StockFlow {
  quantity: number;
  value: number;
}

// Nhập – xuất – tồn of a product. imports, sales and exports are positive;
// others (reversals of cancelled documents and bills, adjustments) signed.
export interface InventoryFlows {
  opening: StockFlow;
  imports: StockFlow;
  sales: StockFlow;
  exports: StockFlow;
  others: StockFlow;
  closing: StockFlow;
}

export interface InventoryRow extends InventoryFlows {
  productId: number;
  name: string;
  unit: string;
  categoryId: number | null;
  categoryName: string | null;
  branchCode: string;
}

export interface InventoryReport {
  branchId: number | null;
  range: Range;
  totals: InventoryFlows;
  rows: InventoryRow[];
}

const FLOW_KEYS = [
  'opening',
  'imports',
  'sales',
  'exports',
  'others',
  'closing',
] as const;

// The column each movement type goes to, and its sign there.
const FLOW_OF: Record<
  StockMovementType,
  { flow: keyof InventoryFlows; sign: 1 | -1 }
> = {
  IMPORT: { flow: 'imports', sign: 1 },
  SALE: { flow: 'sales', sign: -1 },
  EXPORT: { flow: 'exports', sign: -1 },
  REVERSAL: { flow: 'others', sign: 1 },
  ADJUSTMENT: { flow: 'others', sign: 1 },
};

const emptyFlows = (): InventoryFlows =>
  Object.fromEntries(
    FLOW_KEYS.map((key) => [key, { quantity: 0, value: 0 }]),
  ) as unknown as InventoryFlows;
```

3. Thêm hai method vào class, sau `profit`:

```ts
  // Nhập – xuất – tồn per product. Opening and closing balances are the
  // ledger's (balance × average cost after the last movement before the
  // range / before its end); the flows in between are Σ quantity × unit
  // cost of the movements, so values may differ from the closing by the
  // rounding of the average (Ruling 12).
  async inventory(
    user: AuthUser,
    query: ReportRangeQuery,
  ): Promise<InventoryReport> {
    const branchId = await reportScope(this.branchScope, user, query);
    const range = businessDayRange(query.from, query.to);
    const [opening, closing, moved] = await Promise.all([
      this.balances(branchId, range.gte!),
      this.balances(branchId, range.lt!),
      this.prisma.$queryRaw<
        {
          productId: number;
          type: StockMovementType;
          quantity: number;
          value: number;
        }[]
      >`
        SELECT m."productId" AS "productId", m."type" AS "type",
          SUM(m."quantity")::int AS "quantity",
          SUM(m."quantity" * m."unitCost")::float8 AS "value"
        FROM "StockMovement" m
        WHERE ${periodWhere(Prisma.sql`m."createdAt"`, Prisma.sql`m."branchId"`, branchId, query.from, query.to)}
        GROUP BY 1, 2`,
    ]);

    const flows = new Map<number, InventoryFlows>();
    const flowsOf = (productId: number) => {
      let entry = flows.get(productId);
      if (!entry) {
        entry = emptyFlows();
        flows.set(productId, entry);
      }
      return entry;
    };
    for (const b of opening) {
      if (b.quantity !== 0) {
        flowsOf(b.productId).opening = {
          quantity: b.quantity,
          value: roundCost(b.quantity * b.cost),
        };
      }
    }
    for (const b of closing) {
      if (b.quantity !== 0) {
        flowsOf(b.productId).closing = {
          quantity: b.quantity,
          value: roundCost(b.quantity * b.cost),
        };
      }
    }
    for (const m of moved) {
      const { flow, sign } = FLOW_OF[m.type];
      const entry = flowsOf(m.productId)[flow];
      entry.quantity += sign * m.quantity;
      entry.value = roundCost(entry.value + sign * m.value);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...flows.keys()] } },
      select: {
        id: true,
        name: true,
        unit: true,
        category: { select: { id: true, name: true } },
        branch: { select: { code: true } },
      },
    });
    const rows = products
      .map(
        (p): InventoryRow => ({
          productId: p.id,
          name: p.name,
          unit: p.unit,
          categoryId: p.category?.id ?? null,
          categoryName: p.category?.name ?? null,
          branchCode: p.branch.code,
          ...flows.get(p.id)!,
        }),
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'vi') ||
          a.branchCode.localeCompare(b.branchCode),
      );

    const totals = emptyFlows();
    for (const row of rows) {
      for (const key of FLOW_KEYS) {
        totals[key].quantity += row[key].quantity;
        totals[key].value = roundCost(totals[key].value + row[key].value);
      }
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      totals,
      rows,
    };
  }

  // Each product's balance and average cost just before `moment`: those
  // after its last movement.
  private balances(branchId: number | undefined, moment: Date) {
    return this.prisma.$queryRaw<
      { productId: number; quantity: number; cost: number }[]
    >`
      SELECT DISTINCT ON (m."productId") m."productId" AS "productId",
        m."balanceAfter" AS "quantity", m."costAfter"::float8 AS "cost"
      FROM "StockMovement" m
      WHERE m."createdAt" < ${utcTimestamp(moment)}
        ${branchWhere(Prisma.sql`m."branchId"`, branchId)}
      ORDER BY m."productId", m."id" DESC`;
  }
```

- [ ] **Step 4: Route**

Trong `502-backend/src/reports/reports.controller.ts`, thêm sau route `profit`:

```ts
  // Nhập – xuất – tồn per product, valued at the movements' cost.
  @Get('inventory')
  inventory(@CurrentUser() user: AuthUser, @Query() query: ReportRangeQuery) {
    return this.accounting.inventory(user, query);
  }
```

- [ ] **Step 5: Chạy test**

Run:
```bash
cd 502-backend
npm test
npx jest --config ./test/jest-e2e.json --runInBand test/costing.e2e-spec.ts
npm run test:e2e
npm run lint
npm run build
```
Expected: tất cả PASS, build không lỗi.

- [ ] **Step 6: Commit**

```bash
git add 502-backend/src/reports 502-backend/test/costing.e2e-spec.ts
git commit -m "feat(backend): báo cáo nhập – xuất – tồn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 8: Trang Lãi lỗ

**Files:**
- Modify: `502-frontend/src/lib/types.ts` (`ProfitMetrics`, `ProfitReport`)
- Create: `502-frontend/src/lib/profit.ts`
- Modify: `502-frontend/src/hooks/use-report-filters.ts` (tham số `defaults`)
- Modify: `502-frontend/src/components/reports/report-toolbar.tsx` (prop `compare`)
- Modify: `502-frontend/src/lib/navigation.ts` (mục "Lãi lỗ")
- Create: `502-frontend/src/app/[branch]/reports/profit/layout.tsx`, `502-frontend/src/app/[branch]/reports/profit/page.tsx`

**Interfaces:**
- Consumes:
  - API `GET /reports/profit?branch&from&to&groupBy` (Task 6), đúng shape `ProfitReport`;
  - `formatAmount` (Task 5);
  - `useApiData`, `rangeParams`, `useReportScope`, `tickLabel`, `reportFileName`, `toSheet`, `exportWorkbook`, `formatPercent`, `formatCompact`.
- Produces:
  - `useReportFilters(defaults?: { groupBy?: GroupBy })`;
  - `ReportToolbar` prop `compare?: boolean` (mặc định `true`);
  - `profitLines(categories)`, `ProfitLine`.

- [ ] **Step 1: Kiểu dữ liệu**

Trong `502-frontend/src/lib/types.ts`, thêm sau `ProductReport`:

```ts
// GET /reports/profit: revenue before VAT − cost of goods sold = gross
// profit; − expenses (by category) − losses + other income = profit. VAT
// and purchases are shown apart.
export interface ProfitMetrics {
  roomFee: number;
  roomDiscount: number;
  productSales: number;
  productDiscount: number;
  revenue: number;
  vat: number;
  cogs: number;
  expenses: Record<string, number>; // by expense category
  losses: number;
  otherIncome: number;
  purchases: number;
  grossProfit: number;
  grossMargin: number | null;
  expenseTotal: number;
  profit: number;
  profitMargin: number | null;
}

export interface ProfitReport {
  branchId: number | null;
  range: { from: string; to: string };
  groupBy: GroupBy;
  categories: string[];
  totals: ProfitMetrics;
  buckets: (ReportBucket & ProfitMetrics)[];
}
```

- [ ] **Step 2: Các dòng của báo cáo**

`502-frontend/src/lib/profit.ts`:

```ts
import type { ProfitMetrics } from "@/lib/types";

export interface ProfitLine {
  key: string;
  label: string;
  value: (m: ProfitMetrics) => number | null;
  kind?: "money" | "percent";
  level?: 0 | 1; // 1: a detail of the line above
  strong?: boolean; // a total (doanh thu, lãi gộp, lợi nhuận)
  info?: boolean; // outside the profit (VAT, purchases)
  optional?: boolean; // hidden on the page when 0 over the whole range
}

// The lines of the profit and loss statement, top to bottom. Costs are
// positive amounts; profit = gross profit − expenses − losses + other
// income.
export function profitLines(categories: string[]): ProfitLine[] {
  return [
    { key: "revenue", label: "Doanh thu (chưa VAT)", strong: true, value: (m) => m.revenue },
    { key: "roomNet", label: "Tiền giờ sau giảm giá", level: 1, value: (m) => m.roomFee - m.roomDiscount },
    { key: "productNet", label: "Tiền hàng sau giảm giá", level: 1, value: (m) => m.productSales - m.productDiscount },
    { key: "cogs", label: "Giá vốn hàng bán", value: (m) => m.cogs },
    { key: "grossProfit", label: "Lãi gộp", strong: true, value: (m) => m.grossProfit },
    { key: "grossMargin", label: "Tỷ suất lãi gộp", level: 1, kind: "percent", value: (m) => m.grossMargin },
    { key: "expenses", label: "Chi phí hoạt động", value: (m) => m.expenseTotal },
    ...categories.map(
      (category): ProfitLine => ({
        key: `expense:${category}`,
        label: category,
        level: 1,
        optional: true,
        value: (m) => m.expenses[category] ?? 0,
      }),
    ),
    { key: "losses", label: "Hàng xuất kho / hao hụt", value: (m) => m.losses },
    { key: "otherIncome", label: "Thu khác", value: (m) => m.otherIncome },
    { key: "profit", label: "Lợi nhuận", strong: true, value: (m) => m.profit },
    { key: "profitMargin", label: "Tỷ suất lợi nhuận", level: 1, kind: "percent", value: (m) => m.profitMargin },
    { key: "vat", label: "VAT phải nộp", info: true, value: (m) => m.vat },
    { key: "purchases", label: "Tiền nhập hàng (thành hàng tồn, không phải chi phí)", info: true, value: (m) => m.purchases },
  ];
}
```

- [ ] **Step 3: Gộp kỳ mặc định cho từng trang**

Trong `502-frontend/src/hooks/use-report-filters.ts`:

1. Đổi chữ ký thành `export function useReportFilters(defaults: { groupBy?: GroupBy } = {}) {`.
2. Trong comment trên hàm, đổi "Default: this month by day, this branch." thành "Default: this month by day (or `defaults.groupBy`), this branch."
3. Thay `groupBy: groupBy && GROUP_BYS.includes(groupBy) ? groupBy : "day",` bằng `groupBy: groupBy && GROUP_BYS.includes(groupBy) ? groupBy : (defaults.groupBy ?? "day"),`.
4. Thêm `defaults.groupBy` vào mảng phụ thuộc của `useMemo`: `[searchParams, user, defaults.groupBy]`.

- [ ] **Step 4: Toolbar có thể ẩn "So kỳ trước"**

Trong `502-frontend/src/components/reports/report-toolbar.tsx`:
1. Thêm prop `compare = true,` sau `periods = true,`.
2. Thêm vào kiểu props, sau `periods?: boolean;`:

```ts
  // false for a time series without a comparison (Lãi lỗ).
  compare?: boolean;
```

3. Bọc khối `<Label …>…So kỳ trước</Label>` bằng `{compare && ( … )}`.

- [ ] **Step 5: Mục điều hướng**

Trong `502-frontend/src/lib/navigation.ts`:
1. Thêm `Scale,` vào danh sách import từ `lucide-react`, giữ thứ tự chữ cái.
2. Thêm vào nhóm "Báo cáo", sau mục "Khung giờ":

```ts
      { title: "Lãi lỗ", path: "/reports/profit", icon: Scale, permission: "reports" },
```

- [ ] **Step 6: Layout**

`502-frontend/src/app/[branch]/reports/profit/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Báo cáo lãi lỗ" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 7: Trang**

`502-frontend/src/app/[branch]/reports/profit/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { ScaleIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatAmount, formatCompact, formatMoney, formatPercent } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { profitLines, type ProfitLine } from "@/lib/profit";
import { reportFileName, tickLabel } from "@/lib/reports";
import type { ProfitMetrics, ProfitReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = { profit: { label: "Lợi nhuận", color: "var(--chart-1)" } } satisfies ChartConfig;

const NUM = "text-right tabular-nums whitespace-nowrap";
// The first column stays in view while the periods scroll sideways.
const STICKY = "sticky left-0 z-10 bg-card";

const cellText = (line: ProfitLine, m: ProfitMetrics) => {
  const value = line.value(m);
  return line.kind === "percent" ? formatPercent(value) : formatAmount(value ?? 0);
};

// Percent lines go to Excel as text: their columns are formatted as money.
const excelValue = (line: ProfitLine, m: ProfitMetrics) =>
  line.kind === "percent" ? formatPercent(line.value(m)) : line.value(m);

const hasFigures = (m: ProfitMetrics) =>
  [m.revenue, m.cogs, m.expenseTotal, m.losses, m.otherIncome, m.purchases].some((value) => value !== 0);

// Profit and loss: revenue before VAT − cost of goods sold (weighted average
// at the sale) − operating expenses (manual phiếu chi) − goods exported +
// other income. Periods as columns, by month by default.
function ProfitView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters({ groupBy: "month" });
  const { data, loading } = useApiData<ProfitReport | null>(
    "/reports/profit",
    { ...rangeParams(branch, filters), groupBy: filters.groupBy },
    null,
    "Không thể tải báo cáo lãi lỗ",
  );
  const scope = useReportScope(data);

  const lines = data ? profitLines(data.categories) : [];
  const shownLines = data ? lines.filter((line) => !line.optional || line.value(data.totals) !== 0) : [];

  const exportExcel = async () => {
    if (!data) return;
    const columns: ExportColumn<ProfitLine>[] = [
      { header: "Khoản mục", value: (line) => (line.level ? `   ${line.label}` : line.label) },
      { header: "Tổng", type: "money", value: (line) => excelValue(line, data.totals) },
      ...data.buckets.map(
        (bucket): ExportColumn<ProfitLine> => ({
          header: bucket.label,
          type: "money",
          value: (line) => excelValue(line, bucket),
        }),
      ),
    ];
    await exportWorkbook(reportFileName("lai-lo", scope.fileScope, data.range.from, data.range.to), [
      toSheet("Lãi lỗ", columns, lines),
    ]);
  };

  const t = data?.totals;
  const chartData = data
    ? data.buckets.map((b) => ({ tick: tickLabel(b, data.groupBy), label: b.label, profit: b.profit }))
    : [];

  return (
    <>
      <PageHeader
        title="Lãi lỗ"
        description={`${scope.name} · Lợi nhuận = doanh thu chưa VAT − giá vốn hàng bán − chi phí − hàng xuất kho + thu khác. Tiền nhập hàng thành hàng tồn nên không tính là chi phí. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar
        filters={filters}
        onChange={setFilters}
        onExport={data && !loading ? exportExcel : undefined}
        compare={false}
      />

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
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} footer={`VAT phải nộp ${formatMoney(t.vat)}`} />
            <StatTile
              label="Lãi gộp"
              value={formatMoney(t.grossProfit)}
              footer={`Giá vốn ${formatMoney(t.cogs)} · biên ${formatPercent(t.grossMargin)}`}
            />
            <StatTile
              label="Chi phí và hao hụt"
              value={formatMoney(t.expenseTotal + t.losses)}
              footer={`Chi phí ${formatMoney(t.expenseTotal)} · xuất kho ${formatMoney(t.losses)}`}
            />
            <StatTile
              label="Lợi nhuận"
              value={formatMoney(t.profit)}
              footer={`Thu khác ${formatMoney(t.otherIncome)} · biên ${formatPercent(t.profitMargin)}`}
            />
          </div>

          {!hasFigures(t) ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={ScaleIcon}
                  title="Chưa có số liệu"
                  description={`Không có doanh thu, chi phí hay nhập xuất kho trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {data.buckets.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Lợi nhuận theo kỳ</CardTitle>
                    <CardDescription>{formatDateRange(data.range)} · đồng</CardDescription>
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
                        <Bar dataKey="profit" maxBarSize={32} radius={[4, 4, 0, 0]}>
                          {chartData.map((point) => (
                            <Cell
                              key={point.label}
                              fill={point.profit < 0 ? "var(--destructive)" : "var(--color-profit)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Báo cáo lãi lỗ</CardTitle>
                  <CardDescription>
                    {formatDateRange(data.range)} · Khoản mục chi bằng 0 được ẩn (vẫn có trong file Excel).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={cn(STICKY, "min-w-40")}>Khoản mục</TableHead>
                        <TableHead className={NUM}>Tổng</TableHead>
                        {data.buckets.length > 1 &&
                          data.buckets.map((bucket) => (
                            <TableHead key={bucket.key} className={NUM}>
                              {bucket.label}
                            </TableHead>
                          ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shownLines.map((line) => (
                        <TableRow
                          key={line.key}
                          className={cn(line.strong && "font-medium", line.info && "text-muted-foreground")}
                        >
                          <TableCell
                            className={cn(STICKY, line.level === 1 && "pl-6 text-muted-foreground")}
                          >
                            {line.label}
                          </TableCell>
                          <TableCell className={NUM}>{cellText(line, data.totals)}</TableCell>
                          {data.buckets.length > 1 &&
                            data.buckets.map((bucket) => (
                              <TableCell key={bucket.key} className={NUM}>
                                {cellText(line, bucket)}
                              </TableCell>
                            ))}
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

export default function ProfitReportPage() {
  return (
    <Suspense>
      <ProfitView />
    </Suspense>
  );
}
```

- [ ] **Step 8: Kiểm tra**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi; route `/[branch]/reports/profit` có trong danh sách build.

Nếu `recharts` báo kiểu cho `Cell`, kiểm tra import: `Cell` là export có sẵn của `recharts`, không phải thư viện mới.

- [ ] **Step 9: Commit**

```bash
git add 502-frontend/src/lib/types.ts 502-frontend/src/lib/profit.ts 502-frontend/src/hooks/use-report-filters.ts 502-frontend/src/components/reports/report-toolbar.tsx 502-frontend/src/lib/navigation.ts "502-frontend/src/app/[branch]/reports/profit"
git commit -m "feat(frontend): trang báo cáo lãi lỗ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 9: Trang Nhập – xuất – tồn

**Files:**
- Modify: `502-frontend/src/lib/types.ts` (`StockFlow`, `InventoryFlows`, `InventoryReportRow`, `InventoryReport`)
- Modify: `502-frontend/src/lib/navigation.ts` (mục "Nhập – xuất – tồn")
- Create: `502-frontend/src/app/[branch]/reports/inventory/layout.tsx`, `502-frontend/src/app/[branch]/reports/inventory/page.tsx`

**Interfaces:**
- Consumes:
  - API `GET /reports/inventory?branch&from&to` (Task 7);
  - `formatAmount` (Task 5);
  - `rangeParams`, `useReportScope`, `ReportToolbar periods={false}`;
  - `NO_CATEGORY` (`lib/labels.ts`).
- Produces: không có (trang cuối).

- [ ] **Step 1: Kiểu dữ liệu**

Trong `502-frontend/src/lib/types.ts`, thêm sau `ProfitReport`:

```ts
// GET /reports/inventory (nhập – xuất – tồn). imports, sales and exports
// are positive; others (reversals, adjustments) signed.
export interface StockFlow {
  quantity: number;
  value: number;
}

export interface InventoryFlows {
  opening: StockFlow;
  imports: StockFlow;
  sales: StockFlow;
  exports: StockFlow;
  others: StockFlow;
  closing: StockFlow;
}

export interface InventoryReportRow extends InventoryFlows {
  productId: number;
  name: string;
  unit: string;
  categoryId: number | null;
  categoryName: string | null;
  branchCode: string;
}

export interface InventoryReport {
  branchId: number | null;
  range: { from: string; to: string };
  totals: InventoryFlows;
  rows: InventoryReportRow[];
}
```

- [ ] **Step 2: Mục điều hướng**

Trong `502-frontend/src/lib/navigation.ts`:
1. Thêm `Warehouse,` vào danh sách import từ `lucide-react`, giữ thứ tự chữ cái.
2. Thêm vào nhóm "Báo cáo", ngay sau mục "Lãi lỗ":

```ts
      { title: "Nhập – xuất – tồn", path: "/reports/inventory", icon: Warehouse, permission: "reports" },
```

- [ ] **Step 3: Layout**

`502-frontend/src/app/[branch]/reports/inventory/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Báo cáo nhập – xuất – tồn" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 4: Trang**

`502-frontend/src/app/[branch]/reports/inventory/page.tsx`:

```tsx
"use client";

import { Suspense, useState } from "react";
import { WarehouseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook, toSheet, type ExportColumn } from "@/lib/excel-export";
import { formatAmount, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_CATEGORY } from "@/lib/labels";
import { reportFileName } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { InventoryFlows, InventoryReport, InventoryReportRow, StockFlow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "all";
const NONE = "none"; // products without a category

// The columns, left to right, and the narrowest width that shows each.
const FLOWS: { key: keyof InventoryFlows; label: string; show?: string }[] = [
  { key: "opening", label: "Tồn đầu", show: SHOW_FROM.sm },
  { key: "imports", label: "Nhập", show: SHOW_FROM.md },
  { key: "sales", label: "Bán", show: SHOW_FROM.md },
  { key: "exports", label: "Xuất kho", show: SHOW_FROM.lg },
  { key: "others", label: "Hoàn / điều chỉnh", show: SHOW_FROM.lg },
  { key: "closing", label: "Tồn cuối" },
];

const categoryKey = (row: InventoryReportRow) => (row.categoryId === null ? NONE : String(row.categoryId));

function sumFlows(rows: InventoryReportRow[]): InventoryFlows {
  const totals = Object.fromEntries(FLOWS.map((f) => [f.key, { quantity: 0, value: 0 }])) as unknown as InventoryFlows;
  for (const row of rows) {
    for (const { key } of FLOWS) {
      totals[key].quantity += row[key].quantity;
      totals[key].value += row[key].value;
    }
  }
  return totals;
}

const columns: ExportColumn<InventoryReportRow>[] = [
  { header: "Món", value: (r) => r.name },
  { header: "Danh mục", value: (r) => (r.productId ? (r.categoryName ?? NO_CATEGORY) : null) },
  { header: "Đơn vị", value: (r) => r.unit || null },
  { header: "Cơ sở", value: (r) => r.branchCode.toUpperCase() || null },
  ...FLOWS.flatMap(({ key, label }): ExportColumn<InventoryReportRow>[] => [
    { header: `${label} – SL`, type: "number", value: (r) => r[key].quantity },
    { header: `${label} – giá trị`, type: "money", value: (r) => r[key].value },
  ]),
];

function FlowCell({ flow, className, strong }: { flow: StockFlow; className?: string; strong?: boolean }) {
  return (
    <TableCell className={cn("text-right tabular-nums", strong && "font-medium", className)}>
      <div>{formatNumber(flow.quantity)}</div>
      <div className="text-xs font-normal text-muted-foreground">{formatAmount(flow.value)}</div>
    </TableCell>
  );
}

// Nhập – xuất – tồn: per product, the opening balance, what came in and
// went out (valued at the weighted average cost of each movement) and the
// closing balance.
function InventoryView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [category, setCategory] = useState(ALL);
  const { data, loading } = useApiData<InventoryReport | null>(
    "/reports/inventory",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo nhập – xuất – tồn",
  );
  const scope = useReportScope(data);

  const categories = new Map<string, string>();
  for (const row of data?.rows ?? []) categories.set(categoryKey(row), row.categoryName ?? NO_CATEGORY);
  // A category that is gone after a reload falls back to all of them.
  const selected = category === ALL || categories.has(category) ? category : ALL;
  const rows = (data?.rows ?? []).filter((row) => selected === ALL || categoryKey(row) === selected);
  const t = sumFlows(rows);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName("nhap-xuat-ton", scope.fileScope, data.range.from, data.range.to), [
      toSheet("Nhập – xuất – tồn", columns, rows, {
        productId: 0,
        name: "Tổng",
        unit: "",
        categoryId: null,
        categoryName: null,
        branchCode: "",
        ...t,
      }),
    ]);
  };

  return (
    <>
      <PageHeader
        title="Nhập – xuất – tồn"
        description={`${scope.name} · Số lượng và giá trị theo giá vốn bình quân của từng lần nhập, bán, xuất. ${BUSINESS_DAY_HINT}`}
      />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} periods={false} />

      {!data ? (
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
            <StatTile label="Tồn đầu" value={formatMoney(t.opening.value)} footer={`${formatNumber(t.opening.quantity)} đơn vị hàng`} />
            <StatTile label="Nhập" value={formatMoney(t.imports.value)} footer={`${formatNumber(t.imports.quantity)} đơn vị hàng`} />
            <StatTile
              label="Bán và xuất kho"
              value={formatMoney(t.sales.value + t.exports.value)}
              footer={`Bán ${formatMoney(t.sales.value)} · xuất ${formatMoney(t.exports.value)}`}
            />
            <StatTile label="Tồn cuối" value={formatMoney(t.closing.value)} footer={`${rows.length} món`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Theo món</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · Mỗi ô: số lượng, dưới là giá trị (đồng). Tồn cuối = tồn đầu + nhập − bán −
                xuất + hoàn/điều chỉnh.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {categories.size > 1 && (
                <Select value={selected} onValueChange={setCategory}>
                  <SelectTrigger className="w-full @md/main:w-56" aria-label="Danh mục">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
                    {[...categories].map(([key, name]) => (
                      <SelectItem key={key} value={key}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {rows.length === 0 ? (
                <EmptyState
                  icon={WarehouseIcon}
                  title="Không có hàng tồn hay biến động"
                  description={`Không có món nào còn tồn hoặc nhập, bán, xuất trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Món</TableHead>
                      {FLOWS.map((flow) => (
                        <TableHead key={flow.key} className={cn("text-right", flow.show)}>
                          {flow.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">
                          <div>{row.name}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {[row.categoryName ?? NO_CATEGORY, row.unit, scope.chain ? row.branchCode.toUpperCase() : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </TableCell>
                        {FLOWS.map((flow) => (
                          <FlowCell key={flow.key} flow={row[flow.key]} className={flow.show} strong={flow.key === "closing"} />
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng giá trị</TableCell>
                        {FLOWS.map((flow) => (
                          <TableCell key={flow.key} className={cn("text-right tabular-nums", flow.show)}>
                            {formatAmount(t[flow.key].value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function InventoryReportPage() {
  return (
    <Suspense>
      <InventoryView />
    </Suspense>
  );
}
```

`SHOW_FROM.sm` và các giá trị khác là chuỗi class (`lib/responsive.ts`), nên kiểu `show?: string` là đúng. Nếu `SHOW_FROM` được khai báo `as const` với kiểu hẹp hơn, vẫn gán được vào `string`.

- [ ] **Step 5: Kiểm tra**

Run: `npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build`
Expected: không lỗi; route `/[branch]/reports/inventory` có trong danh sách build.

- [ ] **Step 6: Commit**

```bash
git add 502-frontend/src/lib/types.ts 502-frontend/src/lib/navigation.ts "502-frontend/src/app/[branch]/reports/inventory"
git commit -m "feat(frontend): trang báo cáo nhập – xuất – tồn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```

---

### Task 10: Tài liệu và kiểm tra cuối

**Files:**
- Modify: `CLAUDE.md`, `DEPLOYMENT.md` (thêm §6.10), `README.md`

**Interfaces:**
- Consumes: mọi task trước.
- Produces: tài liệu khớp với code.

- [ ] **Step 1: `CLAUDE.md`**

1. Đoạn "Implemented: …":
   - Thay câu cuối `Not yet: cost of goods and P&L (phase 3 of \`docs/superpowers/specs/2026-09-27-reporting-design.md\`).` bằng: `cost of goods at the weighted average (snapshotted on each bill line), fixed expense categories, the profit and loss report (\`/reports/profit\`) and the stock ledger report (nhập – xuất – tồn, \`/reports/inventory\`).`
   - Nối câu này ngay sau "…and reports by staff, room, product, hour and branch (`/reports/{staff,rooms,products,hours,branches}`),".

2. Đoạn "Migrations:": sau câu về `20260927180000_report_indexes …(§6.9).` thêm: `\`20260928000000_reports_costing\` adds \`OrderItem.unitCost\` and \`StockMovement.unitCost/costAfter\` (cost of goods, no backfill; §6.10).`

3. Lệnh `npm run test:e2e`: đổi comment thành `# test/{foundation,reports,costing}.e2e-spec.ts --runInBand; resets the DB in test/e2e.env (karaoke_test)`.

4. Bullet **Inventory**:
   - Thay `imports update \`costPrice\`;` bằng: `\`costPrice\` is the **weighted average cost**: \`applyMovement\` values every movement with \`inventory/costing.ts\` (\`costMovement\`: goods in at their cost — an import's line cost, goods put back at the cost they left at — move the average with \`receive\`; a cancelled import comes out with \`unreceive\`; sales and exports leave at the average) and writes \`StockMovement.unitCost\` and \`costAfter\` under the same row lock; nothing else writes \`costPrice\`;`
   - Thay `resets \`costPrice\` to the latest remaining import and cancels the linked phiếu chi` bằng `reverses each line at the cost it moved at and cancels the linked phiếu chi`.

5. Bullet **Orders / billing**, ngay sau câu "`POST /orders/:id/checkout {paymentMethod}` persists the applied amounts, frees the room, writes `SALE` stock movements and the fund receipt in one transaction.": thêm `Each bill line keeps \`OrderItem.unitCost\`: the cost per unit of what the bill took from stock (Σ value / Σ quantity of its movements; 0 without stock tracking), set at checkout and after every correction (\`snapshotItemCosts\`); voiding or correcting puts goods back at that cost.`

6. Bullet **Funds**: sau `Manual entries via \`POST /funds\`;` thêm `their \`category\` is one of the fixed list in \`funds/fund-categories.ts\` (chi: Lương, Mặt bằng, Điện nước, Sửa chữa – bảo trì, Marketing, Vật tư tiêu hao, Thuế – phí, Khác; thu: Thu khác; default Khác / Thu khác; older free-text categories count as Khác in the profit report);`

7. Bullet **Reports**, nối vào cuối bullet:

```
`GET /reports/profit` (`accounting-reports.service.ts`, pure sums in `profit.ts`) is the P&L per period (`groupBy`, no comparison): revenue before VAT − cost of goods sold (Σ quantity × `OrderItem.unitCost`) = gross profit, − manual phiếu chi by category − exports of documents still standing (hao hụt) + manual phiếu thu = profit; VAT and the imports' amounts are shown apart. `GET /reports/inventory` is nhập – xuất – tồn per product: opening/closing = balance × `costAfter` of the last movement before the range / its end, flows = Σ quantity × `unitCost` by type (imports, sales, exports positive; reversals and adjustments signed), so values may differ from the closing by the rounding of the average. The products report adds `cost`, `grossProfit` and `margin`. `report-sql.ts` also has `periodWhere`/`branchWhere` for any dated table.
```

8. Bullet Frontend **Reports**: thêm câu `\`/reports/profit\` (Lãi lỗ: periods as columns, by month by default via \`useReportFilters({ groupBy: "month" })\`, \`ReportToolbar compare={false}\`, lines from \`lib/profit.ts\`) and \`/reports/inventory\` (Nhập – xuất – tồn, category filter in the page) complete the Báo cáo group; amounts that carry cents (costs) are shown with \`formatAmount\`.`

- [ ] **Step 2: `DEPLOYMENT.md` §6.10**

Thêm ngay sau hết mục §6.9, trước mục cấp `##` kế tiếp:

```markdown
### 6.10. Giá vốn bình quân và báo cáo kế toán (migration `20260928000000_reports_costing`)

Migration thêm 3 cột, không sửa dữ liệu cũ:
- `OrderItem.unitCost`: giá vốn một đơn vị của món trên hóa đơn, chụp lúc thanh toán.
- `StockMovement.unitCost` và `StockMovement.costAfter`: giá vốn của lần biến động kho và giá vốn bình quân sau lần đó.

Thêm cột có giá trị mặc định chỉ đổi metadata trên PostgreSQL 11 trở lên, nên chạy ngay, không cần chọn giờ vắng khách.

Sau khi cập nhật:
- `Product.costPrice` giữ giá đang có và trở thành giá vốn bình quân ban đầu. Từ đó mọi phiếu nhập, bán, xuất, hủy phiếu và hủy/sửa hóa đơn đều cập nhật nó theo bình quân gia quyền.
- Không tính lại quá khứ. Hóa đơn thanh toán trước khi cập nhật có giá vốn 0, nên Lãi lỗ và cột Giá vốn của báo cáo Hàng hóa chỉ đúng từ các hóa đơn sau đó. Biến động kho cũ có giá trị 0, nên giá trị "Tồn đầu" của báo cáo Nhập – xuất – tồn chỉ đúng từ biến động đầu tiên sau khi cập nhật.
- Phiếu thu/chi thủ công chỉ nhận các khoản mục cố định:
  - Chi: Lương, Mặt bằng, Điện nước, Sửa chữa – bảo trì, Marketing, Vật tư tiêu hao, Thuế – phí, Khác.
  - Thu: Thu khác.

  Phiếu cũ ghi khoản mục khác vẫn giữ nguyên chữ, và được tính vào "Khác" trong báo cáo Lãi lỗ.
```

- [ ] **Step 3: `README.md`**

Trong bullet **Báo cáo**, nối vào cuối câu cuối: ` Giá vốn bình quân gia quyền chụp trên từng hóa đơn; báo cáo lãi lỗ theo kỳ (doanh thu − giá vốn − chi phí theo khoản mục − hao hụt + thu khác) và nhập – xuất – tồn theo món.`

- [ ] **Step 4: Kiểm tra toàn bộ**

Run:
```bash
cd 502-backend && npm run lint && npm test && npm run build && npm run test:e2e && cd ..
npm --prefix 502-frontend run lint && npm --prefix 502-frontend run build
git status --short
```
Expected:
- Backend: lint sạch; unit PASS; build xong; e2e PASS cả ba file.
- Frontend: lint sạch; build xong.
- `git status` chỉ còn các file tài liệu vừa sửa.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md DEPLOYMENT.md README.md
git commit -m "docs: giá vốn bình quân, lãi lỗ, nhập – xuất – tồn, khoản mục chi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JUrWj3Q16SQTsPfx5ip4RX"
```
