# Trang báo cáo theo từng HĐĐT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nút "Thêm hóa đơn vào báo cáo" cho thu ngân; trang báo cáo tính mỗi HĐĐT theo ngày hóa đơn của nó, liệt kê Quản lý bán hàng theo từng HĐĐT, và đánh số hóa đơn nội bộ riêng.

**Architecture:** `Einvoice.invoiceDate` (NOT NULL) là ngày báo cáo; `ReportCounter` cấp `reportNumber` lúc tạo mọi HĐĐT (cùng định dạng `formatBillNumber`). Route mới `POST /einvoices/bill/:orderId/report` (trang chính) và `GET /report-site/einvoices` (trang báo cáo). SQL của trang báo cáo đổi cột ngày, bỏ `billCount`.

**Tech Stack:** NestJS 11 + Prisma 5.22 + PostgreSQL 17; Next.js 16 + React 19 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-02-bao-cao-theo-tung-hddt-design.md` (sửa `2026-10-02-trang-bao-cao-hddt-design.md`).

## Global Constraints

- Chuỗi giao diện và thông báo lỗi bằng tiếng Việt.
- `docs/resource-rules.md`: mọi danh sách có `take` + `select` tối thiểu, danh sách có trần gửi `X-Total-Count` và màn hiện `ListLimitNotice`; tổng không cộng từ danh sách có trần; truy vấn đọc của trang báo cáo chạy trên `ReportPrismaService`; truy vấn theo cơ sở dùng index.
- SQL viết tay chỉ `$queryRaw` dạng template có tham số; không join thẳng `"Order"` trong SQL trang báo cáo (dùng `LEFT JOIN LATERAL (… LIMIT 1)` hoặc subquery vô hướng).
- Không `prisma db push`; migration viết tay. Không chạy backend thứ hai vào DB production.
- e2e chỉ chạy trên `karaoke_test` (container `kara502-pg`, cổng 5433), không chạy song song với phiên khác.
- Bản sao phải đồng bộ: `einvoice-math.ts` ↔ `lib/einvoice.ts`.
- Mỗi commit kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Schema + migration

**Files:**
- Modify: `502-backend/prisma/schema.prisma` (Einvoice, ManualBill, Branch, model mới ReportCounter)
- Create: `502-backend/prisma/migrations/20261006000000_report_einvoice_numbers/migration.sql`

**Interfaces — Produces:** `Einvoice.invoiceDate: Date` (không null), `Einvoice.reportDate/reportSeq/reportNumber`, `ReportCounter(branchId, date, lastSeq)`.

- [ ] Schema: `invoiceDate DateTime @db.Date`; thêm `reportDate DateTime @db.Date`, `reportSeq Int`, `reportNumber String`, `@@unique([branchId, reportDate, reportSeq])`, `@@index([branchId, reportNumber])`, `@@index([branchId, invoiceDate])`. `ManualBill`: thay `@@unique([branchId, businessDate, billSeq])` bằng `@@index([branchId, businessDate])`. `Branch.reportCounters ReportCounter[]`. Model `ReportCounter` như spec §4.1.
- [ ] Migration SQL:

```sql
-- 1. Every e-invoice has an invoice date (spec 2026-10-02-bao-cao-theo-tung-hddt §6).
UPDATE "Einvoice" e SET "invoiceDate" = COALESCE(
  (SELECT (o."endTime" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date FROM "Order" o WHERE o."id" = e."orderId"),
  (SELECT m."businessDate" FROM "ManualBill" m WHERE m."id" = e."manualBillId"),
  e."businessDate")
WHERE e."invoiceDate" IS NULL;
ALTER TABLE "Einvoice" ALTER COLUMN "invoiceDate" SET NOT NULL;
CREATE INDEX "Einvoice_branchId_invoiceDate_idx" ON "Einvoice"("branchId", "invoiceDate");

-- 2. Report site numbers.
CREATE TABLE "ReportCounter" (... PRIMARY KEY ("branchId","date"), FK Branch);
ALTER TABLE "Einvoice" ADD COLUMN "reportDate" DATE, ADD COLUMN "reportSeq" INTEGER, ADD COLUMN "reportNumber" TEXT;
WITH numbered AS (
  SELECT e."id", e."invoiceDate",
    row_number() OVER (PARTITION BY e."branchId", e."invoiceDate" ORDER BY e."id") AS seq,
    substring(COALESCE(
      (SELECT r."name" FROM "Order" o JOIN "Room" r ON r."id" = o."roomId" WHERE o."id" = e."orderId"),
      (SELECT r."name" FROM "ManualBill" m JOIN "Room" r ON r."id" = m."roomId" WHERE m."id" = e."manualBillId"),
      '') from '(\d+)\D*$') AS digits
  FROM "Einvoice" e)
UPDATE "Einvoice" e SET "reportDate" = n."invoiceDate", "reportSeq" = n.seq,
  "reportNumber" = to_char(n."invoiceDate", 'DDMM')
    || CASE WHEN n.digits IS NULL THEN '0000'
            WHEN length(n.digits) >= 4 THEN right(n.digits, 4)
            ELSE rpad(n.digits, 4, '0') END   -- = roomCode() in orders/bill-number.ts
    || lpad(n.seq::text, GREATEST(3, length(n.seq::text)), '0')
FROM numbered n WHERE n."id" = e."id";
INSERT INTO "ReportCounter" SELECT "branchId", "reportDate", max("reportSeq") FROM "Einvoice" GROUP BY 1, 2;
ALTER ... SET NOT NULL (3 cột); CREATE UNIQUE INDEX ... (branchId, reportDate, reportSeq); CREATE INDEX ... (branchId, reportNumber);

-- 3. ManualBill numbers no longer come from BillCounter.
DROP INDEX "ManualBill_branchId_businessDate_billSeq_key";
CREATE INDEX "ManualBill_branchId_businessDate_idx" ON "ManualBill"("branchId", "businessDate");
```

- [ ] Kiểm tra: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <karaoke_test shadow> --script` ra rỗng; `npx prisma generate`.
- [ ] Kiểm tra mã phòng SQL bằng psql trên `karaoke_test`: `P401`→`4010`, `Phòng 8888`→`8888`, `VIP`→`0000`, `12345`→`2345`, giống `roomCode`.
- [ ] Commit `feat(db): ngày hóa đơn bắt buộc, số hóa đơn nội bộ của trang báo cáo`.

### Task 2: Cấp số nội bộ khi tạo HĐĐT

**Files:**
- Modify: `502-backend/src/orders/bill-number.ts` (thêm `nextReportNumber`, tách câu đếm chung)
- Modify: `502-backend/src/einvoice/einvoices.service.ts` (`create`, `createForManualBill`)
- Modify: `502-backend/src/report-site/manual-bills.service.ts` (`create`)
- Modify: `502-backend/src/einvoice/einvoice-select.ts` (`reportNumber`)

**Interfaces — Produces:**
```ts
export async function nextReportNumber(tx: Tx, branchId: number, date: string, roomName?: string | null):
  Promise<{ reportDate: Date; reportSeq: number; reportNumber: string }>
```

- [ ] `nextReportNumber`: `INSERT INTO "ReportCounter" ("branchId","date","lastSeq") VALUES (…, ${date}::date, 1) ON CONFLICT ("branchId","date") DO UPDATE SET "lastSeq" = "ReportCounter"."lastSeq" + 1 RETURNING "lastSeq"`, rồi `formatBillNumber(date, roomName, lastSeq)`.
- [ ] `create` (bill thanh toán): đọc thêm `room: { select: { name } }`; ngày = `dto.invoiceDate ?? toDateString(endTime)` (kiểm `dbDay`); `$transaction` gồm `nextReportNumber` + `einvoice.create({... reportDate, reportSeq, reportNumber })`.
- [ ] `createForManualBill`: SELECT thêm tên phòng (`LEFT JOIN "Room"`), cấp số trong transaction có sẵn.
- [ ] `ManualBillsService.create`: bỏ `nextBillNumberOn`; `nextReportNumber(tx, branchId, dto.businessDate, room.name)`; `manualBill.create({ businessDate, billSeq: n.reportSeq, billNumber: n.reportNumber, ... })`; nháp mang cùng `reportDate/reportSeq/reportNumber`.
- [ ] `einvoiceListSelect` thêm `reportNumber: true`.
- [ ] `npx tsc --noEmit -p tsconfig.json` sạch; `npx jest src/einvoice src/report-site` qua (sửa mock nếu cần).
- [ ] Commit `feat(einvoice): mỗi HĐĐT có số nội bộ của trang báo cáo`.

### Task 3: Nút của thu ngân (backend)

**Files:**
- Create: `502-backend/src/einvoice/bill-lines.ts`, `502-backend/src/einvoice/bill-lines.spec.ts`
- Modify: `einvoices.service.ts` (`reportBill`), `einvoices.controller.ts` (route `bill/:orderId/report` trước `:id`)

**Interfaces — Produces:**
```ts
export const HOURLY_LINE_NAME = 'Dịch vụ tính theo giờ';
export const RETAIL_BUYER = 'Bán cho người tiêu dùng';
export function billLines(bill: { minutes: number; hourlyFee: number; pricePerHour: number;
  items: { name: string; unit: string; quantity: number; price: number }[] }): EinvoiceLine[]
// POST /einvoices/bill/:orderId/report → EinvoiceRow (như POST /einvoices)
```

- [ ] Test trước (`bill-lines.spec.ts`): giờ + món (dòng giờ đầu, `quantity = billedHoursOf(83) = 1.38`, `unitPrice = 150000`); `hourlyFee = 0` → không có dòng giờ; 60 món → 50 dòng; giá `12345.6` → `12346`.
- [ ] Chạy `npx jest src/einvoice/bill-lines.spec.ts` → FAIL; viết `billLines`; chạy lại → PASS.
- [ ] `reportBill(user, orderId)`: `$transaction`: `SELECT "branchId","status","businessDate","startTime","endTime","finalAmount","hourlyFee","pricePerHour","roomId" FROM "Order" WHERE id FOR UPDATE`; 404/`assertBranchAccess`/400 (không `COMPLETED` hoặc không `businessDate`)/409 "Bill đã có trong báo cáo" (`tx.einvoice.count({where:{orderId}})`); đọc món (`orderItem.findMany` select product name/unit, `orderBy id`) và tên phòng; `nextReportNumber(tx, branchId, businessDate, roomName)`; `tx.einvoice.create({ branchId, orderId, businessDate, invoiceDate: businessDate, ...số, createdById, updatedById, ...draftData({ amount: Math.round(finalAmount), buyerName: RETAIL_BUYER, lines: billLines(...) }) })`. Trả `findOne`.
- [ ] Controller: `@Post('bill/:orderId/report') @Roles(...EINVOICE_WRITERS)`.
- [ ] Commit `feat(einvoice): thu ngân thêm cả bill vào báo cáo bằng một nút`.

### Task 4: Trang báo cáo tính theo ngày hóa đơn, bỏ số bill

**Files:**
- Modify: `502-backend/src/report-site/einvoice-sql.ts`, `einvoice-metrics.ts` (+ spec), `einvoice-reports.service.ts` (`daily`), `src/einvoice/einvoices.service.ts` (`summary` site report: `invoiceDate`)

- [ ] `countedWhere`: `e."invoiceDate" BETWEEN …`; comment cập nhật (index `(branchId, invoiceDate)`).
- [ ] `EINVOICE_SUM_COLUMNS`, `EinvoiceSums`, `emptyEinvoiceSums`, `addEinvoiceSums`, `toEinvoiceMetrics`: bỏ `billCount`; sửa spec của metrics.
- [ ] `daily`: `to_char(e."invoiceDate", 'YYYY-MM-DD')`.
- [ ] `summary(…, 'report')`: tổng đã xuất lọc `invoiceDate` thay `businessDate`.
- [ ] `npx jest src/report-site` qua. Commit `feat(report-site): HĐĐT tính vào ngày hóa đơn, bỏ số bill`.

### Task 5: Danh sách bill của trang HĐĐT theo ngày hóa đơn

**Files:** Modify `502-backend/src/report-site/report-site-bills.service.ts` (+ spec)

- [ ] Khi `byDay` (tab Bill hoặc Đã xuất, không tìm số): chọn bill bằng `$queryRaw`:

```sql
WITH bills AS (
  SELECT DISTINCT e."orderId", e."manualBillId" FROM "Einvoice" e
  WHERE e."branchId" = ${branchId} AND e."invoiceDate" BETWEEN ${from}::date AND ${to}::date
    [AND e."status" = 'ISSUED']
  [UNION SELECT NULL, m."id" FROM "ManualBill" m WHERE m."branchId" = … AND m."businessDate" BETWEEN …]  -- tab Bill
)
SELECT b."orderId", b."manualBillId", COUNT(*) OVER ()::int AS "total"
FROM bills b
LEFT JOIN LATERAL (SELECT o."businessDate", o."billSeq" FROM "Order" o WHERE o."id" = b."orderId" LIMIT 1) o ON true
LEFT JOIN LATERAL (SELECT m."businessDate", m."billSeq" FROM "ManualBill" m WHERE m."id" = b."manualBillId" LIMIT 1) m ON true
ORDER BY COALESCE(o."businessDate", m."businessDate") DESC, COALESCE(o."billSeq", m."billSeq") DESC
LIMIT 500
```
  rồi `order.findMany({ where: { id: { in } } })` / `manualBill.findMany(...)` với select hiện có, giữ thứ tự; tổng = `total` (0 khi rỗng). Nhánh status khác/tìm số giữ code cũ.
- [ ] `dateRange` vẫn kiểm `from/to` trước khi đưa vào SQL.
- [ ] Sửa `report-site-bills.service.spec.ts` theo mock mới. Commit `feat(report-site): trang HĐĐT lọc bill theo ngày hóa đơn`.

### Task 6: `GET /report-site/einvoices`

**Files:** Create `502-backend/src/report-site/report-site-einvoices.service.ts`, `dto/report-site-einvoices.dto.ts`; Modify `report-site.controller.ts`, `report-site.module.ts`

**Interfaces — Produces:**
```ts
interface ReportSiteEinvoice { id: number; reportNumber: string; invoiceDate: string; status: EinvoiceStatus;
  hasError: boolean; invoiceNumber: number | null; buyerName: string | null; amount: number; vatAmount: number;
  orderId: number | null; manualBillId: number | null; billNumber: string | null; roomName: string | null;
  billCancelledAt: Date | null }
// GET /report-site/einvoices?branch&from&to&number → ReportSiteEinvoice[] + X-Total-Count (≤ 500)
```

- [ ] Query DTO: `branch?`, `from?`, `to?` (DATE_RE), `number?` (`^\d{1,15}$`, "Số hóa đơn chỉ gồm chữ số").
- [ ] Service (ReportPrismaService): `where` = `number` ? `e."branchId" = … AND e."reportNumber" >= … AND e."reportNumber" < … AND COUNTED_SQL` : `countedWhere(branchId, from, to)`; SELECT cột + `b."billNumber", b."roomName", b."cancelledAt"` từ `LEFT JOIN LATERAL (SELECT o."billNumber", r."name" AS "roomName", o."cancelledAt" FROM "Order" o LEFT JOIN "Room" r ON r."id" = o."roomId" WHERE o."id" = e."orderId" LIMIT 1)` và tương tự cho ManualBill; `ORDER BY e."invoiceDate" DESC, e."reportSeq" DESC LIMIT 500`; `COUNT(*)` riêng. Branch theo `resolveBranchId` (trang báo cáo luôn một cơ sở như `bills`).
- [ ] Controller `@Get('einvoices')` dùng `withTotalCount`. Commit `feat(report-site): danh sách theo từng HĐĐT`.

### Task 7: Xóa dữ liệu xóa `ReportCounter`

- [ ] `data-purge.service.ts`: `await tx.reportCounter.deleteMany({ where: own })` cạnh `billCounter`, trả kèm `reportCounters` trong counts như `billCounters`. Commit cùng Task 8.

### Task 8: e2e

**Files:** Modify `502-backend/test/report-site.e2e-spec.ts`, `test/einvoice.e2e-spec.ts`

- [ ] Sửa assertion cũ: số bill thêm tay (không còn nối dãy `BillCounter`), `billCount` bị bỏ, ngày tính theo `invoiceDate`.
- [ ] Thêm: nút thu ngân (thu ngân 201 đúng tiền/người mua/dòng/ngày/số; lần 2 409; bill đã hủy 400; cơ sở khác 403; HĐQT 403); ba HĐĐT ba ngày → ba ngày ở summary, revenue, `GET /report-site/einvoices`; sửa ngày nháp → chuyển ngày; số tăng theo thứ tự, độc lập cơ sở; bill thêm tay không làm nhảy số bill; số bill thêm tay = số HĐĐT đầu; nháp xóa không cấp lại số; danh sách lọc theo đầu số, bỏ nháp của bill đã hủy; tab Bill/Đã xuất lọc theo ngày HĐ; hai route mới vào phần phá quyền.
- [ ] `docker start kara502-pg`; kiểm không có e2e khác đang chạy; `npm run test:e2e -- test/report-site.e2e-spec.ts` rồi `test/einvoice.e2e-spec.ts` → PASS. `npm run lint`, `npm test`.
- [ ] Commit `test(report-site): nút thu ngân, ngày hóa đơn, số nội bộ`.

### Task 9: Frontend — nút thu ngân, kiểu dữ liệu, dòng giờ

**Files:** Modify `502-frontend/src/lib/types.ts`, `components/sales/bill-sheet.tsx`, `components/einvoices/einvoice-lines.tsx`, `components/einvoices/einvoice-editor.tsx`, `lib/einvoice.ts`

- [ ] `types.ts`: `EinvoiceRow.invoiceDate: string`, `reportNumber: string`; bỏ `billCount` ở `ReportSiteSummary`/metrics; thêm `ReportSiteEinvoice`.
- [ ] `bill-sheet.tsx`: nút "Thêm hóa đơn vào báo cáo" (`can(user, "einvoices.write")`, `order.status === "COMPLETED"`), khóa khi `einvoiceCount > 0` kèm "Đã có trong báo cáo (N hóa đơn)"; `api.post(`/einvoices/bill/${order.id}/report`)` → `notify.success("Đã thêm hóa đơn vào báo cáo")`, tải lại order (`GET /orders/:id`) để `_count` mới; footer hiện khi có bất kỳ nút nào.
- [ ] `einvoice-lines.tsx`: tên dòng giờ "Dịch vụ tính theo giờ".
- [ ] Bỏ `defaultInvoiceDate` (`lib/einvoice.ts`, editor dùng `einvoice.invoiceDate`); kiểm backend `einvoice-math.ts` không có bản sao của nó.
- [ ] `npx tsc --noEmit`, `npm run lint`. Commit `feat(web): nút Thêm hóa đơn vào báo cáo ở bill`.

### Task 10: Frontend — Quản lý bán hàng của trang báo cáo theo từng HĐĐT

**Files:** Modify `app/report/[branch]/sales/bills/page.tsx`, `lib/report-sheets.ts`, `app/report/[branch]/reports/revenue/page.tsx`, `rooms/page.tsx`, `components/report-site/einvoice-metric-cells.tsx`

- [ ] Trang: `useApiData<ReportSiteEinvoice[]>("/report-site/einvoices", { branch, ...(number ? { number } : range) })`; ô số: Số HĐĐT / Tổng tiền / VAT / Đã xuất; bảng: Số hóa đơn (Thêm tay, Đã hủy), Ngày HĐ, Bill, Phòng, Người mua, Trạng thái, Trước VAT, VAT, Tổng; bấm dòng → `/${branch}/sales/einvoices?bill|manualBill=…&day=<invoiceDate>&einvoice=<id>`; bỏ nút Hủy và `ReasonDialog`; `ListLimitNotice noun="hóa đơn"`.
- [ ] `report-sheets.ts`: `reportSiteEinvoicesSheet(rows)` thay `reportSiteBillsSheet`; bỏ cột "Bill" ở sheet metrics.
- [ ] Revenue/Rooms/metric cells: bỏ ô và cột "Bill".
- [ ] Commit `feat(web): Quản lý bán hàng trang báo cáo liệt kê từng hóa đơn`.

### Task 11: Frontend — trang HĐĐT của trang báo cáo

**Files:** Modify `components/einvoices/einvoices-page.tsx`, `einvoice-bill-list.tsx`, `bill-split.tsx`

- [ ] `?einvoice=<id>` cùng `?bill|manualBill` khởi tạo `selected`.
- [ ] `site` truyền tới `BillSplit`/`ManualBillSplit`; nhãn HĐ = `einvoice.reportNumber` khi `site === "report"`; đầu panel cũng vậy.
- [ ] `ManualBillSplit`: nút "Hủy bill" (`einvoices.write`, bill chưa hủy) mở `ReasonDialog`, gọi `POST /report-site/manual-bills/:id/cancel`, rồi `onCancelled()` → trang tải lại danh sách và bill.
- [ ] Mô tả của tab/trang: "theo ngày hóa đơn".
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` (với `NEXT_PUBLIC_API_URL=http://localhost:4000/api`). Commit `feat(web): trang HĐĐT báo cáo hiện số nội bộ, hủy bill thêm tay trong bill`.

### Task 12: Kiểm tra trên trình duyệt, tài nguyên, tài liệu

- [ ] Chạy backend dev trên DB local (không phải production) + fake Minvoice, frontend dev; kiểm: nút ở bill sheet (thu ngân), Quản lý bán hàng trang báo cáo (`baocao.localhost:3000`), mở HĐĐT từ dòng, hủy bill thêm tay.
- [ ] `EXPLAIN ANALYZE` các truy vấn mới trên dữ liệu `test/load/generate.sql` (hoặc ghi rõ nếu không đủ dữ liệu); không Seq Scan `Einvoice`/`Order` theo cơ sở.
- [ ] Cập nhật `CLAUDE.md` (root, backend, `src/einvoice`, frontend, `components/einvoices`), `docs/resource-rules.md` nếu đổi trần/dung lượng. Commit `docs: báo cáo theo từng HĐĐT`.
