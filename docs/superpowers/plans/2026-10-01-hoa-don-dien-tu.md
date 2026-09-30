# Hóa đơn điện tử qua Minvoice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi cơ sở cấu hình tài khoản Minvoice (MST, đăng nhập, ký hiệu). Thu ngân và quản lý cơ sở chia một bill đã thanh toán thành nhiều hóa đơn nhỏ rồi lưu nháp. Quản lý hệ thống xuất từng hóa đơn lên Minvoice; sau khi xuất, database chỉ còn phần đầu hóa đơn và số Minvoice cấp.

**Architecture:**
- Module NestJS mới `src/einvoice`, gồm:
  - hàm thuần: tiền (`einvoice-math`), payload (`minvoice-payload`), phân loại lỗi (`classify-send-error`), mã hóa (`einvoice-secret`);
  - client HTTP gọi API web của Minvoice (`minvoice-client`, dùng `fetch` có sẵn, có cookie jar);
  - các service: cấu hình (đăng nhập lại chạy một luồng một lúc), gửi (quy tắc đăng nhập lại, lấy lại dải, gửi lại một lần), hóa đơn (nháp, xuất, đối chiếu, sửa số), tra MST (cổng thuế rồi xinvoice, có bộ đệm).
- Database thêm `Branch.taxCode`, `EinvoiceConfig`, `Einvoice`.
- Frontend thêm trang `/[branch]/sales/einvoices` (khung Minvoice, danh sách gom theo bill, dialog chọn bill, panel sửa và xuất), ô MST ở trang Cơ sở, và cảnh báo trong dialog Hủy/Sửa bill.
- E2E chạy với một server Minvoice giả (`test/fake-minvoice.ts`).

**Tech Stack:** NestJS 11, Prisma 5.22 (PostgreSQL 17), Jest (unit và e2e với supertest), Node 22 (`fetch`, `AbortSignal.timeout`, `Headers.getSetCookie`, `node:crypto`), Next.js 16 App Router, React 19, shadcn/ui (radix-ui), Tailwind 4. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md`. Đọc toàn bộ spec trước Task 1. Mỗi task ghi các mục spec liên quan.

**Tham chiếu request Minvoice:** `/Users/linhsayshii/Documents/PetProject/me beo/minvoice-hddt-sender` gồm `docs/api-integration.md`, `src/minvoice-session.js` (đăng nhập), `src/minvoice-client.js` (payload, số thành chữ), `src/minvoice-seller.js`, `src/minvoice-config.js`, `src/buyer-lookup.js`.

## Global Constraints

- **Quyền thực hiện (người dùng, 01/10/2026):** làm toàn bộ kế hoạch mà không hỏi lại, kể cả:
  - tải các file công khai của web Minvoice (Task 0);
  - gửi hóa đơn thật (Task 18).

  **Ngoại lệ duy nhất:** agent không bao giờ tự nhập mật khẩu Minvoice. Người dùng tự gõ mật khẩu ở Task 18 Step 2. Mật khẩu không được ghi vào repo, log, lệnh shell, chat hay file kế hoạch.
- **Dữ liệu kiểm tra với Minvoice thật:** MST `0107811836`, ký hiệu (dải hóa đơn) `1C26MTT`, tài khoản Minvoice `admin`. Test tự động và Minvoice giả cũng dùng MST này và ký hiệu dạng `1C<yy>MTT`.
- **Chữ và commit:**
  - Chuỗi hiển thị và thông báo lỗi bằng **tiếng Việt**; comment trong code tiếng Anh như code hiện có.
  - Commit tiếng Việt kiểu `feat(einvoice): …`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Làm trên nhánh `feat/einvoice` (đã có commit spec).
- **Quyền (spec §3):**
  - Tạo, sửa, xóa nháp: `SALES` (`CHAIN_MANAGER`, `BRANCH_MANAGER`, `CASHIER`).
  - Xem: `SALES` + `BOARD`.
  - Xuất, đối chiếu, sửa số, đăng nhập Minvoice, chọn ký hiệu: `CHAIN_ONLY`.
  - Tra MST: `SALES`.
  - Phạm vi cơ sở luôn qua `BranchScopeService`.
- **Minvoice (spec §6):**
  - Base URL `https://<MST>.minvoice.net`, MST cơ sở phải khớp `^\d{10}(-\d{3})?$`.
  - Timeout: **10 s cho cả chuỗi đăng nhập**, 10 s mỗi lần đọc, **25 s** cho `POST invoice`. `redirect: 'manual'`.
  - `paymentMethod` **luôn `"TM/CK"`**. Mã đối chiếu `K502-<einvoiceId>`.
- **Tra MST (spec §6.3):**
  - Cổng thuế timeout **8 s**, xinvoice **30 s**.
  - Bộ đệm **1000** MST trong **7 ngày**; xinvoice tối đa **10 lần / 30 s**, vượt thì 429 "Tra cứu nhiều quá, thử lại sau ít giây".
  - MST người mua: `^(\d{10}(-\d{3})?|\d{12})$`.
- **Dữ liệu (spec §4):**
  - Tối đa **50 dòng** mỗi hóa đơn; `name` ≤ 300, `unit` ≤ 30, `buyerAddress` ≤ 400, `buyerEmail` ≤ 200 ký tự; `lastError` ≤ **300** ký tự.
  - `draft = null` khi `ISSUED`, trong cùng lệnh ghi.
- **Tiền (spec §5):** `Math.round` tới đồng; `vatRate ∈ {0, 5, 8, 10}`; dòng bù tên "Dịch vụ karaoke", ĐVT "Lần"; VAT của dòng bù lệch tối đa 1 đồng.
- **Ngày hóa đơn (spec §9.3):** chỉ chặn dưới (ngày của hóa đơn `ISSUED` mới nhất cùng `sellerTaxCode` + `symbolCode`); ngày sau hôm nay cần `confirmFutureDate: true`; năm của ký hiệu (ký tự 3–4 của `symbolCode`) phải trùng năm ngày hóa đơn.
- **Đăng nhập Minvoice:** sai quá **5 lần / 15 phút** mỗi cơ sở thì 429 (tái dùng `LoginThrottle`).
- **`docs/resource-rules.md`:**
  - Mọi danh sách có `take` và `select`, cùng `X-Total-Count` (`withTotalCount`); frontend hiện `ListLimitNotice`.
  - Tổng tính bằng SQL (`summary` trên `ReportPrismaService` + `SharedRequestInterceptor`).
  - Map trong bộ nhớ có trần.
  - Không giữ transaction hay connection database trong lúc gọi ra ngoài.
  - Không thêm polling, không log payload hay bí mật.
- **E2E:** `docker start kara502-pg` trước. Chạy từng bộ một: `cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts`.
- **Frontend:** container query trên `@container/main`; không được cuộn ngang ở 360–390px; dùng `DatePicker`/`DateRangePicker`/`Tabs` chuẩn, không dùng `<input type="date">` hay nút bật/tắt.

## Quyết định chi tiết (bổ sung spec, cùng mức ràng buộc)

1. **`?branch=` là query param** cho mọi route, kể cả `POST /einvoice/config/login` và `PUT /einvoice/config/symbol` (spec ghi `branch` trong body; đổi theo quy ước "endpoints take an optional `?branch=`" của `CLAUDE.md`).
2. **Lỗi phía Minvoice hoặc tra MST trả HTTP 424** (`Failed Dependency`), không dùng 502. Lý do: Cloudflare thay trang 502/504 từ origin bằng trang lỗi của nó, làm mất thông báo tiếng Việt. Spec §6.3 ghi "502"; chỗ này thay bằng 424.
3. **`needsLogin`** là true khi: không có cấu hình, mật khẩu đã lưu không giải mã được, có `loginError`, hoặc `taxCode ≠ Branch.taxCode`. Chỉ thiếu phiên thì **không** tính, vì server tự đăng nhập lại.
4. **`POST /einvoices/:id/issue` luôn trả 200 kèm dòng hóa đơn** khi đã qua bước khóa. Kết quả nằm ở `status`/`lastError`: `ISSUED`, `DRAFT` có `lastError`, hoặc `UNCERTAIN`. Lỗi kiểm tra trước khi khóa vẫn là 400/409.
5. **Ở bước khóa (`→ SENDING`)** ghi luôn `sellerTaxCode`, `symbolCode`, `registerInvoiceId`, `invoiceDate`, để `resolve {found: true}` biết ký hiệu và ngày đã gửi. Gửi lỗi về `DRAFT` thì xóa bốn trường này.
6. **`POST /einvoices/:id/resolve` luôn có**, kể cả khi bước 0 tìm được API tìm hóa đơn. Khi đó nó là đường dự phòng lúc tìm bị lỗi. Tìm tự động là Task 10, chỉ làm khi bước 0 tìm được.
7. **Nhãn hóa đơn:** danh sách hiện `#<id>` (danh sách lọc theo trạng thái không có đủ hóa đơn của bill để đánh số); panel hiện "HĐ n" theo thứ tự `id` trong bill.
8. **`DatePicker`** thêm hai prop: `min` (ngày sớm nhất chọn được) và `today` (ngày mà nút "Hôm nay" chọn, mặc định `businessDate()`). Ô Ngày HĐ dùng `today = toDateInput()`, tức ngày lịch.
9. **Khóa dev:** `EINVOICE_SECRET` ngoài production mặc định là một khóa 32 byte cố định. Production thiếu khóa hoặc khóa sai độ dài thì không khởi động (`EinvoiceModule.onModuleInit`).
10. **`test/fake-minvoice.ts`** chạy được độc lập (`npx ts-node test/fake-minvoice.ts 4555`) để kiểm tra trên trình duyệt ở Task 17.
11. **`GET /einvoice/config`** trả thêm `latestInvoiceNumber` (số của hóa đơn mới nhất cùng ký hiệu), để panel ghi "hóa đơn số … mang ngày này".
12. **Kiểm tra thật (Task 18)** chạy backend với `EINVOICE_SECRET` ngẫu nhiên, và xóa `EinvoiceConfig` khỏi database test khi xong: khóa dev cố định nằm trong code, không được dùng để mã hóa mật khẩu thật.

## File Structure

Backend (`502-backend/`):

| File | Trách nhiệm |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261003000000_einvoices/migration.sql` | `Branch.taxCode`, `EinvoiceConfig`, `Einvoice`, enum `EinvoiceStatus` |
| `src/common/dates.ts` (+ spec) | thêm `toDbDate`, `fromDbDate` (chuyển từ `pr.service.ts`) |
| `src/branches/dto/create-branch.dto.ts` | `taxCode` |
| `src/data-purge/data-purge.service.ts` | xóa `Einvoice` trước bill |
| `src/config/env.ts` | `einvoiceSecret()` |
| `src/auth/roles.ts` | `EINVOICE_WRITERS`, `EINVOICE_READERS` |
| `src/einvoice/einvoice-types.ts` | `VAT_RATES`, `EinvoiceLine`, `EinvoiceDraft`, `SellerProfile`, `BUYER_TAX_CODE_RE` |
| `src/einvoice/einvoice-secret.ts` (+ spec) | AES-256-GCM |
| `src/einvoice/einvoice-math.ts` (+ spec) | tiền dòng, tổng, điều kiện xuất, dòng bù |
| `src/einvoice/minvoice/vietnamese-words.ts` (+ spec) | số thành chữ |
| `src/einvoice/minvoice/minvoice-payload.ts` (+ spec) | payload `POST invoice` |
| `src/einvoice/minvoice/cookie-jar.ts` (+ spec) | cookie của một phiên |
| `src/einvoice/minvoice/minvoice-errors.ts` | các loại lỗi Minvoice |
| `src/einvoice/minvoice/minvoice-client.ts` (+ spec) | request tới Minvoice |
| `src/einvoice/minvoice/classify-send-error.ts` (+ spec) | bảng §9.1 |
| `src/einvoice/tax-payer.service.ts` (+ spec) | tra MST |
| `src/einvoice/einvoice-config.service.ts`, `einvoice-config.controller.ts`, `dto/config.dto.ts` | cấu hình |
| `src/einvoice/einvoice-sender.ts` (+ spec) | quy tắc gửi lại |
| `src/einvoice/einvoices.service.ts`, `einvoices.controller.ts`, `dto/einvoice.dto.ts`, `einvoice-select.ts` | nháp, danh sách, xuất, đối chiếu, sửa số |
| `src/einvoice/einvoice.module.ts`, `src/app.module.ts` | đăng ký module |
| `src/orders/orders.service.ts` | `findOne` kèm số hóa đơn điện tử |
| `test/fake-minvoice.ts`, `test/einvoice.e2e-spec.ts` | e2e |

Frontend (`502-frontend/src/`):

| File | Trách nhiệm |
|---|---|
| `lib/types.ts` | kiểu dữ liệu của API mới, `Branch.taxCode`, `Order._count/einvoices` |
| `lib/permissions.ts`, `lib/navigation.ts`, `lib/labels.ts` | quyền, mục sidebar, nhãn trạng thái |
| `lib/einvoice.ts` | bản sao `einvoice-math.ts` |
| `components/date-range-picker.tsx` | `DatePicker` thêm `min`, `today` |
| `app/[branch]/admin/branches/page.tsx` | ô Mã số thuế |
| `app/[branch]/sales/einvoices/{layout,page}.tsx` | trang |
| `components/einvoices/einvoice-config-card.tsx` | khung Minvoice |
| `components/einvoices/einvoice-list.tsx`, `bill-picker-dialog.tsx` | cột trái, dialog chọn bill |
| `components/einvoices/bill-einvoices-panel.tsx`, `einvoice-editor.tsx`, `buyer-fields.tsx`, `einvoice-lines.tsx`, `number-input.tsx` | panel và form nháp |
| `components/einvoices/issue-controls.tsx`, `uncertain-box.tsx`, `issued-view.tsx`, `edit-number-dialog.tsx` | xuất, đối chiếu, đã xuất |
| `components/sales/bill-sheet.tsx`, `components/sales/edit-paid-bill-dialog.tsx` | cảnh báo khi bill có hóa đơn điện tử |

Tài liệu: `CLAUDE.md`, `DEPLOYMENT.md` (§6.18), `docs/security-review.md`, `502-backend/.env.example`, `.env.docker.example`, `docker-compose.yml`.

---

### Task 0: Bước 0 — khảo sát Minvoice, chỉ đọc (đã được phép)

Mục đích (spec §12): tìm (a) API tìm hóa đơn và trường chứa mã đối chiếu, (b) mẫu câu lỗi khi ngày hóa đơn sớm hơn hóa đơn mới nhất. Chỉ tải file công khai của web app, **không đăng nhập, không tạo gì**.

**Files:**
- Tạm (scratchpad, **không commit**): `<scratchpad>/minvoice-web/`.
- Sửa: file kế hoạch này, dòng `**Kết quả bước 0:**` ở cuối task.

**Interfaces:**
- Produces:
  - `SEARCH`: đường dẫn, tham số lọc và các trường của response, hoặc "không có";
  - `MARKER_FIELD`: tên trường trong payload, hoặc `null`;
  - `DATE_ORDER_MESSAGE`: câu lỗi, hoặc "không tìm thấy".
  
  Task 4 (`MARKER_FIELD`), Task 5 (`DATE_ORDER_PATTERNS`) và Task 10 (có làm hay không) đọc kết quả này.

- [ ] **Step 1: Không cần xin phép.** Người dùng đã cho phép tải các file công khai của `https://0107811836.minvoice.net/` (01/10/2026). Chỉ tải file công khai, không đăng nhập, không gửi gì lên Minvoice.

- [ ] **Step 2: Tải trang và liệt kê file JS**

```bash
mkdir -p "$SCRATCH/minvoice-web" && cd "$SCRATCH/minvoice-web"
curl -s https://0107811836.minvoice.net/ -o index.html
grep -oE 'src="[^"]+\.js"' index.html | sed 's/src="//;s/"$//' | sort -u > scripts.txt
while read -r src; do case "$src" in http*) url="$src";; *) url="https://0107811836.minvoice.net/${src#/}";; esac; printf '%s ' "$url"; curl -sI "$url" | awk 'tolower($1)=="content-length:"{print $2}'; done < scripts.txt
```

`$SCRATCH` là thư mục scratchpad của phiên. Ghi danh sách file và kích thước vào kết quả của task.

- [ ] **Step 3: Tải các bundle và tìm API hóa đơn**

```bash
while read -r src; do case "$src" in http*) url="$src";; *) url="https://0107811836.minvoice.net/${src#/}";; esac; curl -s "$url" -o "$(basename "$src")"; done < scripts.txt
grep -ohE '"/?api/app/invoice[^"]*"' *.js | sort | uniq -c | sort -rn | head -40
grep -ohE '.{120}api/app/invoice.{200}' *.js | grep -iE 'get|list|filter|search|orderNumber|keyword' | head -20
grep -ohE '.{80}orderNumber.{80}' *.js | head -20
```

Tìm một request `GET` trả danh sách hóa đơn (theo ABP thường là `GET /api/app/invoice` hoặc `.../invoice/list`) có tham số lọc (`Filter`, `Keyword`, `OrderNumber`…). Tìm xem `orderNumber` có được hiển thị hay lọc trong màn danh sách không.

- [ ] **Step 4: Tìm câu lỗi về ngày**

```bash
curl -s 'https://0107811836.minvoice.net/api/api/abp/application-localization?cultureName=vi&onlyDynamics=false' -o localization.json
node -e '
const j = require("./localization.json"); const out = [];
const walk = (o, p) => { for (const [k, v] of Object.entries(o ?? {})) { if (typeof v === "string") { if (/ngày/i.test(v) && /(nhỏ hơn|lớn hơn|trước|sau)/i.test(v) && /hóa đơn/i.test(v)) out.push(p + k + " = " + v); } else if (v && typeof v === "object") walk(v, p + k + "."); } };
walk(j, ""); console.log(out.slice(0, 40).join("\n"));'
grep -ohE '.{60}(nhỏ hơn|lớn hơn)[^"]{0,80}' *.js | grep -i 'ngày' | head -20
```

Endpoint localization trả 404 thì thử `GET /api/api/abp/application-configuration` (phần `localization.values`, xử lý bằng cùng đoạn `node -e`).

- [ ] **Step 5: Ghi kết quả vào kế hoạch.** Thay dòng dưới bằng kết quả thật, ví dụ ``SEARCH = GET /api/api/app/invoice?Filter=<marker>&MaxResultCount=5 → items[].{id, invoiceNumber, invoiceDate}; MARKER_FIELD = orderNumber; DATE_ORDER_MESSAGE = "…"``, hoặc `SEARCH = không có; MARKER_FIELD = null; DATE_ORDER_MESSAGE = không tìm thấy`.

  Không cần commit: file kế hoạch được commit cùng Task 1. Khi không chắc tham số lọc có thật sự lọc theo `MARKER_FIELD` hay không (chỉ xác nhận được khi đã đăng nhập), ghi "chưa xác nhận". Task 10 vẫn làm, và Task 18 xác nhận với Minvoice thật.

**Kết quả bước 0:** _(điền ở Step 5)_

---

### Task 1: Schema, migration, MST cơ sở, xóa dữ liệu

Spec §4, §4.3, §10.4 (trang Cơ sở).

**Files:**
- Modify: `502-backend/prisma/schema.prisma`
- Create: `502-backend/prisma/migrations/20261003000000_einvoices/migration.sql` (sinh bằng `prisma migrate diff`)
- Modify: `502-backend/src/common/dates.ts`, `502-backend/src/common/dates.spec.ts`, `502-backend/src/pr/pr.service.ts:76-77`
- Modify: `502-backend/src/branches/dto/create-branch.dto.ts`
- Modify: `502-backend/src/data-purge/data-purge.service.ts:88-95`
- Modify: `502-backend/test/board.e2e-spec.ts` (kỳ vọng `deleted.einvoices`)

**Interfaces:**
- Produces:
  - Prisma models `EinvoiceConfig`, `Einvoice`, enum `EinvoiceStatus { DRAFT SENDING UNCERTAIN ISSUED }`, `Branch.taxCode: string | null`.
  - `toDbDate(ymd: string): Date` (UTC nửa đêm) và `fromDbDate(date: Date): string` trong `src/common/dates.ts`.
  - `DataPurgeLog.deleted.einvoices`.

- [ ] **Step 1: Test cho `toDbDate` / `fromDbDate`**

Thêm vào cuối `502-backend/src/common/dates.spec.ts`, và thêm `fromDbDate, toDbDate` vào dòng `import { … } from './dates'` đầu file:

```ts
describe('toDbDate / fromDbDate', () => {
  it('stores a YYYY-MM-DD at UTC midnight so a @db.Date column keeps the day', () => {
    expect(toDbDate('2026-10-01').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(fromDbDate(toDbDate('2026-10-01'))).toBe('2026-10-01');
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd 502-backend && npx jest src/common/dates.spec.ts`
Expected: FAIL, `toDbDate` không được export.

- [ ] **Step 3: Chuyển hai hàm vào `dates.ts`**

Thêm vào cuối `502-backend/src/common/dates.ts`:

```ts
// @db.Date columns: Prisma reads and writes the UTC date part, so a
// YYYY-MM-DD is stored as UTC midnight and read back with toISOString().
export const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);
```

Trong `502-backend/src/pr/pr.service.ts`: xóa hai dòng 76–77 (`const toDbDate = …`, `const fromDbDate = …`) và thêm `fromDbDate, toDbDate` vào import từ `'../common/dates'` ở dòng 13:

```ts
import {
  businessDateOf,
  fromDbDate,
  getBusinessDayRange,
  toDbDate,
} from '../common/dates';
```

Run: `npx jest src/common/dates.spec.ts src/pr`
Expected: PASS.

- [ ] **Step 4: Sửa `schema.prisma`**

Trong `model Branch`, thêm sau `address String?`:

```prisma
  // MST, entered on the Cơ sở page: 10 digits or 10-3. Not unique: several
  // branches may belong to one company (spec 2026-10-01 §4).
  taxCode          String?
```

và thêm vào cuối danh sách quan hệ của `Branch` (sau `discountRequests DiscountRequest[]`):

```prisma
  einvoiceConfig   EinvoiceConfig?
  einvoices        Einvoice[]
```

Trong `model Order`, thêm sau `discountRequests DiscountRequest[]`:

```prisma
  einvoices        Einvoice[]
```

Trong `model User`, thêm vào danh sách quan hệ (cạnh các quan hệ `DiscountRequestedBy`/`DiscountDecidedBy`):

```prisma
  einvoiceConfigsUpdated EinvoiceConfig[] @relation("EinvoiceConfigUpdatedBy")
  einvoicesCreated       Einvoice[]       @relation("EinvoiceCreatedBy")
  einvoicesUpdated       Einvoice[]       @relation("EinvoiceUpdatedBy")
  einvoicesIssued        Einvoice[]       @relation("EinvoiceIssuedBy")
  einvoicesNumberEdited  Einvoice[]       @relation("EinvoiceNumberEditedBy")
```

Thêm vào cuối file:

```prisma
// Hóa đơn điện tử (spec 2026-10-01).
enum EinvoiceStatus {
  DRAFT // Nháp: editable, has `draft`; with `lastError` the page shows "Lỗi"
  SENDING // Being sent to Minvoice
  UNCERTAIN // Unknown whether Minvoice created it: check before sending again
  ISSUED // Đã xuất: has its number, `draft` is null
}

// The Minvoice account and symbol of a branch. Apart from Branch because
// Branch is returned everywhere and this row holds secrets.
model EinvoiceConfig {
  id                Int       @id @default(autoincrement())
  branchId          Int       @unique
  branch            Branch    @relation(fields: [branchId], references: [id])
  // MST the account logged in with; differs from Branch.taxCode -> log in again.
  taxCode           String
  username          String
  // AES-256-GCM with EINVOICE_SECRET (einvoice-secret.ts); never returned or logged.
  passwordEnc       String
  // {cookie, token, userName} of the Minvoice session, encrypted the same way.
  sessionEnc        String?
  // Minvoice refused the stored password on a re-login; cleared by a login.
  loginError        String?
  symbolCode        String?
  // GUID of that symbol's current range (register-invoice/using-list).
  registerInvoiceId String?
  currencyId        String?
  // {legalName, address, email, tel, bankAccount, bankName, fax, website}
  seller            Json?
  loggedInAt        DateTime?
  updatedById       Int?
  updatedBy         User?     @relation("EinvoiceConfigUpdatedBy", fields: [updatedById], references: [id])
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

// One small invoice of a paid bill. Its details (`draft`) live until it is
// issued; then only the header and Minvoice's number stay.
model Einvoice {
  id           Int            @id @default(autoincrement())
  branchId     Int
  branch       Branch         @relation(fields: [branchId], references: [id])
  orderId      Int
  order        Order          @relation(fields: [orderId], references: [id])
  // Copied from Order.businessDate so the list filters on its own index.
  businessDate DateTime       @db.Date
  status       EinvoiceStatus @default(DRAFT)
  // VAT included, typed by whoever creates it.
  amount       Decimal
  // Σ VAT of the lines, recomputed on every save.
  vatAmount    Decimal        @default(0)
  buyerTaxCode String?
  buyerName    String?
  // {buyerAddress, buyerEmail, lines[]} (einvoice-types.ts EinvoiceDraft).
  draft        Json?

  // Header, written when it is sent / issued.
  sellerTaxCode     String?
  symbolCode        String?
  registerInvoiceId String?
  invoiceDate       DateTime? @db.Date
  invoiceNumber     Int?
  minvoiceId        String?
  lastError         String?
  sendingAt         DateTime?

  createdById      Int?
  createdBy        User?     @relation("EinvoiceCreatedBy", fields: [createdById], references: [id])
  createdAt        DateTime  @default(now())
  updatedById      Int?
  updatedBy        User?     @relation("EinvoiceUpdatedBy", fields: [updatedById], references: [id])
  updatedAt        DateTime  @updatedAt
  issuedById       Int?
  issuedBy         User?     @relation("EinvoiceIssuedBy", fields: [issuedById], references: [id])
  issuedAt         DateTime?
  numberEditedById Int?
  numberEditedBy   User?     @relation("EinvoiceNumberEditedBy", fields: [numberEditedById], references: [id])
  numberEditedAt   DateTime?

  @@unique([sellerTaxCode, symbolCode, invoiceNumber])
  @@index([branchId, businessDate])
  @@index([branchId, status, createdAt])
  @@index([orderId])
  @@index([sellerTaxCode, symbolCode, invoiceDate])
}
```

- [ ] **Step 5: Sinh migration**

```bash
cd 502-backend
docker start kara502-pg
docker exec kara502-pg psql -U postgres -c "create database karaoke_shadow" 2>/dev/null || true
mkdir -p prisma/migrations/20261003000000_einvoices
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@localhost:5433/karaoke_shadow --script \
  > prisma/migrations/20261003000000_einvoices/migration.sql
npx prisma generate
```

Mở `migration.sql` và kiểm tra nó chỉ có:
- `CREATE TYPE "EinvoiceStatus"`;
- `ALTER TABLE "Branch" ADD COLUMN "taxCode" TEXT`;
- `CREATE TABLE "EinvoiceConfig"`, `CREATE TABLE "Einvoice"`;
- 1 unique index cho `EinvoiceConfig.branchId`, 1 unique index cho `Einvoice(sellerTaxCode, symbolCode, invoiceNumber)`, 4 index thường;
- các khóa ngoại.

Không được có `DROP`. Thêm dòng đầu file `-- Hóa đơn điện tử (spec 2026-10-01): Branch.taxCode, EinvoiceConfig, Einvoice.`

- [ ] **Step 6: MST trong DTO cơ sở**

Trong `502-backend/src/branches/dto/create-branch.dto.ts`, thêm `ValidateIf` vào import từ `class-validator` và thêm field sau `address`:

```ts
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Mã số thuế: 10 số hoặc 10 số kèm -3 số; null để xóa',
  })
  @IsOptional()
  @ValidateIf((dto: CreateBranchDto) => dto.taxCode !== null)
  @Matches(/^\d{10}(-\d{3})?$/, {
    message: 'Mã số thuế phải có 10 số, hoặc 10 số kèm -3 số',
  })
  taxCode?: string | null;
```

`UpdateBranchDto` kế thừa qua `PartialType(OmitType(...))` nên nhận luôn `taxCode`. `BranchesService.create/update` truyền thẳng `dto` vào Prisma nên không phải sửa.

- [ ] **Step 7: Xóa dữ liệu xóa `Einvoice` trước bill**

Trong `502-backend/src/data-purge/data-purge.service.ts`, trong object `counts`, thêm ngay sau `orderEvents: …`:

```ts
          // Before orders: an e-invoice points at its bill.
          einvoices: (await tx.einvoice.deleteMany({ where: own })).count,
```

Trong `502-backend/test/board.e2e-spec.ts`, ngay sau dòng `expect(deleted.fundTransactions).toBe(2);` (khoảng dòng 180), thêm:

```ts
    expect(deleted.einvoices).toBe(0);
```

- [ ] **Step 8: Kiểm tra**

```bash
cd 502-backend
npm run build
npx jest src/common src/pr src/branches
npx jest --config ./test/jest-e2e.json --runInBand test/board.e2e-spec.ts
```

Expected: build ok. Unit PASS. `board.e2e` PASS: migration mới chạy khi `migrate reset`, và xóa dữ liệu trả `einvoices`.

- [ ] **Step 9: Commit**

```bash
git add 502-backend/prisma 502-backend/src/common/dates.ts 502-backend/src/common/dates.spec.ts \
  502-backend/src/pr/pr.service.ts 502-backend/src/branches/dto/create-branch.dto.ts \
  502-backend/src/data-purge/data-purge.service.ts 502-backend/test/board.e2e-spec.ts \
  docs/superpowers/plans/2026-10-01-hoa-don-dien-tu.md
git commit -m "feat(einvoice): bảng hóa đơn điện tử, MST cơ sở

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Khóa mã hóa `EINVOICE_SECRET`

Spec §11.

**Files:**
- Modify: `502-backend/src/config/env.ts`
- Create: `502-backend/src/einvoice/einvoice-secret.ts`, `502-backend/src/einvoice/einvoice-secret.spec.ts`
- Modify: `502-backend/.env.example`, `.env.docker.example`, `docker-compose.yml`

**Interfaces:**
- Produces:
  - `encryptSecret(plain: string): string`, dạng `v1:<iv>:<tag>:<data>`;
  - `decryptSecret(value: string | null | undefined): string | null`, trả null khi bị sửa, sai khóa hoặc rỗng;
  - `assertEinvoiceSecret(): void`, ném lỗi khi khóa không phải 32 byte;
  - `einvoiceSecret(): string` trong `config/env.ts`.

- [ ] **Step 1: Viết test**

`502-backend/src/einvoice/einvoice-secret.spec.ts`:

```ts
import { randomBytes } from 'node:crypto';
import {
  assertEinvoiceSecret,
  decryptSecret,
  encryptSecret,
} from './einvoice-secret';

describe('einvoice-secret', () => {
  const original = process.env.EINVOICE_SECRET;
  afterEach(() => {
    process.env.EINVOICE_SECRET = original;
  });

  it('decrypts what it encrypted, with a new IV each time', () => {
    const a = encryptSecret('Duyen123@');
    const b = encryptSecret('Duyen123@');
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('Duyen123@');
  });

  it('refuses a tampered value', () => {
    const [v, iv, tag, data] = encryptSecret('secret').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toBeNull();
    expect(decryptSecret('garbage')).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it('refuses a value encrypted with another key', () => {
    const value = encryptSecret('secret');
    process.env.EINVOICE_SECRET = randomBytes(32).toString('base64');
    expect(decryptSecret(value)).toBeNull();
  });

  it('checks the key length', () => {
    process.env.EINVOICE_SECRET = Buffer.alloc(16).toString('base64');
    expect(() => assertEinvoiceSecret()).toThrow(/32 byte/);
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd 502-backend && npx jest src/einvoice/einvoice-secret.spec.ts`
Expected: FAIL, không tìm thấy module `./einvoice-secret`.

- [ ] **Step 3: `env.ts`**

Thêm vào cuối `502-backend/src/config/env.ts`:

```ts
// Key of the Minvoice passwords and sessions (AES-256-GCM): 32 bytes, base64,
// e.g. `openssl rand -base64 32`. Required in production; dev and test use a
// fixed key so a fresh checkout runs without setup.
const DEV_EINVOICE_SECRET = Buffer.alloc(32, 7).toString('base64');
export const einvoiceSecret = () =>
  process.env.NODE_ENV === 'production'
    ? requireEnv('EINVOICE_SECRET')
    : process.env.EINVOICE_SECRET || DEV_EINVOICE_SECRET;
```

- [ ] **Step 4: `einvoice-secret.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { einvoiceSecret } from '../config/env';

// Secrets of a third party (the Minvoice password and session) stored in the
// database, encrypted with a key that lives only in the environment
// (spec 2026-10-01 §11). Format: v1:<iv>:<auth tag>:<ciphertext>, base64.
const VERSION = 'v1';

function key(): Buffer {
  const raw = Buffer.from(einvoiceSecret(), 'base64');
  if (raw.length !== 32) {
    throw new Error(
      'EINVOICE_SECRET phải là 32 byte mã hóa base64 (tạo bằng: openssl rand -base64 32)',
    );
  }
  return raw;
}

// Called at start-up so production refuses to run with a missing or bad key.
export function assertEinvoiceSecret(): void {
  key();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join(':');
}

// Null when the value is empty, was tampered with or used another key.
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, iv, tag, data] = value.split(':');
  if (version !== VERSION || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key(),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Chạy test**

Run: `npx jest src/einvoice/einvoice-secret.spec.ts`
Expected: PASS (4 test).

- [ ] **Step 6: Biến môi trường khi triển khai**

`502-backend/.env.example`, thêm cuối file:

```
# Khóa mã hóa mật khẩu/phiên Minvoice: 32 byte base64 (openssl rand -base64 32). Bắt buộc khi NODE_ENV=production.
EINVOICE_SECRET=""
```

`.env.docker.example`, thêm ngay sau dòng `JWT_REFRESH_SECRET=…`:

```
# Khóa mã hóa mật khẩu Minvoice (hóa đơn điện tử): openssl rand -base64 32
EINVOICE_SECRET=
```

`docker-compose.yml`, trong `environment` của service `backend`, thêm ngay sau dòng `JWT_REFRESH_SECRET: …`:

```yaml
      EINVOICE_SECRET: ${EINVOICE_SECRET:?Đặt EINVOICE_SECRET trong .env (openssl rand -base64 32)}
```

- [ ] **Step 7: Commit**

```bash
git add 502-backend/src/config/env.ts 502-backend/src/einvoice/einvoice-secret.ts \
  502-backend/src/einvoice/einvoice-secret.spec.ts 502-backend/.env.example .env.docker.example docker-compose.yml
git commit -m "feat(einvoice): mã hóa mật khẩu và phiên Minvoice bằng EINVOICE_SECRET

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tính tiền hóa đơn (`einvoice-math`)

Spec §4.1, §5.

**Files:**
- Create: `502-backend/src/einvoice/einvoice-types.ts`
- Create: `502-backend/src/einvoice/einvoice-math.ts`, `502-backend/src/einvoice/einvoice-math.spec.ts`

**Interfaces:**
- Produces:
  - Từ `einvoice-types.ts`:
    - `VAT_RATES = [0, 5, 8, 10] as const`, `type VatRate`;
    - `interface EinvoiceLine {name: string; unit: string; quantity: number; unitPrice: number; vatRate: VatRate; vatAmount?: number}`;
    - `interface EinvoiceDraft {buyerAddress: string | null; buyerEmail: string | null; lines: EinvoiceLine[]}`;
    - `interface SellerProfile {legalName, address, email, tel, bankAccount, bankName, fax, website: string}`;
    - `BUYER_TAX_CODE_RE`, `BRANCH_TAX_CODE_RE`.
  - Từ `einvoice-math.ts`:
    - `MAX_LINES = 50`, `FILLER_NAME = 'Dịch vụ karaoke'`;
    - `roundToDong(n)`, `lineAmountOf(line)`, `computedVatOf(amount, rate)`, `lineVatOf(line)`;
    - `totalsOf(lines): {amountWithoutVat, vatAmount, total}`;
    - `issueProblem(amount, lines): string | null`;
    - `fillerLine(missing, rate): EinvoiceLine | null`;
    - `defaultVatRate(taxPercent): VatRate`.

- [ ] **Step 1: Kiểu dùng chung**

`502-backend/src/einvoice/einvoice-types.ts`:

```ts
// Shapes shared by the e-invoice services (spec 2026-10-01 §4.1).

export const VAT_RATES = [0, 5, 8, 10] as const;
export type VatRate = (typeof VAT_RATES)[number];

export interface EinvoiceLine {
  name: string;
  unit: string;
  quantity: number;
  // Whole đồng, before VAT.
  unitPrice: number;
  vatRate: VatRate;
  // Only on a filler line whose VAT takes the đồng no price can reach (§5).
  vatAmount?: number;
}

// Einvoice.draft: the details that are deleted once the invoice is issued.
export interface EinvoiceDraft {
  buyerAddress: string | null;
  buyerEmail: string | null;
  lines: EinvoiceLine[];
}

// EinvoiceConfig.seller, from Minvoice's tenant-company.
export interface SellerProfile {
  legalName: string;
  address: string;
  email: string;
  tel: string;
  bankAccount: string;
  bankName: string;
  fax: string;
  website: string;
}

// A branch's MST is part of the Minvoice host name: companies only.
export const BRANCH_TAX_CODE_RE = /^\d{10}(-\d{3})?$/;
// A buyer may also be a person, whose MST is the 12-digit citizen id (07/2025).
export const BUYER_TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12})$/;
```

- [ ] **Step 2: Viết test**

`502-backend/src/einvoice/einvoice-math.spec.ts`:

```ts
import {
  computedVatOf,
  defaultVatRate,
  fillerLine,
  issueProblem,
  lineAmountOf,
  lineVatOf,
  totalsOf,
} from './einvoice-math';
import type { EinvoiceLine } from './einvoice-types';

const line = (over: Partial<EinvoiceLine> = {}): EinvoiceLine => ({
  name: 'Bia Heineken',
  unit: 'Lon',
  quantity: 1,
  unitPrice: 0,
  vatRate: 10,
  ...over,
});

describe('einvoice-math', () => {
  it('rounds a line and its VAT to the đồng', () => {
    expect(lineAmountOf({ quantity: 1.38, unitPrice: 300000 })).toBe(414000);
    expect(lineAmountOf({ quantity: 0.333, unitPrice: 1000 })).toBe(333);
    expect(computedVatOf(909091, 10)).toBe(90909);
    // Float noise must not tip the rounding (187,000 × 8% = 14,960.000000000002).
    expect(computedVatOf(187000, 8)).toBe(14960);
  });

  it('uses the stored VAT of a filler line', () => {
    expect(lineVatOf(line({ unitPrice: 909095, vatAmount: 90909 }))).toBe(90909);
    expect(lineVatOf(line({ unitPrice: 909095 }))).toBe(90910);
  });

  it('sums the lines', () => {
    expect(
      totalsOf([
        line({ quantity: 10, unitPrice: 35000 }),
        line({ unitPrice: 559091 }),
      ]),
    ).toEqual({ amountWithoutVat: 909091, vatAmount: 90909, total: 1000000 });
  });

  it('says why a draft cannot be issued', () => {
    expect(issueProblem(1000000, [])).toBe('Hóa đơn chưa có dòng hàng');
    expect(issueProblem(1, Array.from({ length: 51 }, () => line()))).toBe(
      'Tối đa 50 dòng hàng',
    );
    expect(issueProblem(100, [line({ unitPrice: 91, vatAmount: 5 })])).toBe(
      'Dòng 1: tiền thuế lệch quá 1 đồng so với thuế suất',
    );
    expect(issueProblem(1000000, [line({ unitPrice: 900000 })])).toBe(
      'Còn thiếu 10.000 đồng',
    );
    expect(issueProblem(1000000, [line({ unitPrice: 1000000 })])).toBe(
      'Thừa 100.000 đồng',
    );
    expect(issueProblem(1000000, [line({ unitPrice: 909091 })])).toBeNull();
  });

  it('builds a filler line that reaches the amount', () => {
    expect(fillerLine(1000000, 10)).toEqual({
      name: 'Dịch vụ karaoke',
      unit: 'Lần',
      quantity: 1,
      unitPrice: 909091,
      vatRate: 10,
    });
    expect(fillerLine(0, 10)).toBeNull();
    expect(fillerLine(-5, 10)).toBeNull();
  });

  it('lets the filler VAT take the đồng no single price reaches', () => {
    // 909,094 + 90,909 = 1,000,003 and 909,095 + 90,910 = 1,000,005.
    const filler = fillerLine(1000004, 10)!;
    expect(filler.unitPrice).toBe(909095);
    expect(filler.vatAmount).toBe(90909);
    expect(issueProblem(1000004, [filler])).toBeNull();
  });

  it('defaults a line to the VAT of the bill when it is a legal rate', () => {
    expect(defaultVatRate(8)).toBe(8);
    expect(defaultVatRate(0)).toBe(0);
    expect(defaultVatRate(7)).toBe(10);
  });
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `npx jest src/einvoice/einvoice-math.spec.ts`
Expected: FAIL, không tìm thấy module `./einvoice-math`.

- [ ] **Step 4: `einvoice-math.ts`**

```ts
import { EinvoiceLine, VAT_RATES, VatRate } from './einvoice-types';

// Money of an e-invoice (spec 2026-10-01 §5). The frontend mirrors this file
// in lib/einvoice.ts: keep them in sync. Rounded to the đồng (Math.round),
// unlike bills (billing.ts rounds VAT up).

export const MAX_LINES = 50;
export const FILLER_NAME = 'Dịch vụ karaoke';

// Float noise is dropped first, as in billing.ts roundUpToDong.
export const roundToDong = (value: number) =>
  Math.round(Math.round(value * 1000) / 1000);

export const lineAmountOf = (line: Pick<EinvoiceLine, 'quantity' | 'unitPrice'>) =>
  roundToDong(line.quantity * line.unitPrice);

export const computedVatOf = (amount: number, rate: number) =>
  roundToDong((amount * rate) / 100);

export const lineVatOf = (line: EinvoiceLine) =>
  line.vatAmount ?? computedVatOf(lineAmountOf(line), line.vatRate);

export interface EinvoiceTotals {
  amountWithoutVat: number;
  vatAmount: number;
  total: number;
}

export function totalsOf(lines: EinvoiceLine[]): EinvoiceTotals {
  let amountWithoutVat = 0;
  let vatAmount = 0;
  for (const line of lines) {
    amountWithoutVat += lineAmountOf(line);
    vatAmount += lineVatOf(line);
  }
  return { amountWithoutVat, vatAmount, total: amountWithoutVat + vatAmount };
}

const dong = (value: number) => value.toLocaleString('vi-VN');

// Why a draft cannot be issued yet, or null when it can: its lines must add
// up to the amount typed, to the đồng.
export function issueProblem(amount: number, lines: EinvoiceLine[]): string | null {
  if (lines.length === 0) return 'Hóa đơn chưa có dòng hàng';
  if (lines.length > MAX_LINES) return `Tối đa ${MAX_LINES} dòng hàng`;
  for (const [index, line] of lines.entries()) {
    if (
      line.vatAmount !== undefined &&
      Math.abs(line.vatAmount - computedVatOf(lineAmountOf(line), line.vatRate)) > 1
    ) {
      return `Dòng ${index + 1}: tiền thuế lệch quá 1 đồng so với thuế suất`;
    }
  }
  const { total } = totalsOf(lines);
  if (total < amount) return `Còn thiếu ${dong(amount - total)} đồng`;
  if (total > amount) return `Thừa ${dong(total - amount)} đồng`;
  return null;
}

// A line that brings the total up by `missing` at `rate`. Rounding means
// some totals cannot be reached by one price; then its VAT takes the one
// đồng left (spec §5).
export function fillerLine(missing: number, rate: VatRate): EinvoiceLine | null {
  if (missing <= 0) return null;
  const base = roundToDong(missing / (1 + rate / 100));
  const filler = { name: FILLER_NAME, unit: 'Lần', quantity: 1, vatRate: rate };
  for (const price of [base, base - 1, base + 1]) {
    if (price >= 0 && price + computedVatOf(price, rate) === missing) {
      return { ...filler, unitPrice: price };
    }
  }
  return { ...filler, unitPrice: base, vatAmount: missing - base };
}

export function defaultVatRate(taxPercent: number): VatRate {
  return (VAT_RATES as readonly number[]).includes(taxPercent)
    ? (taxPercent as VatRate)
    : 10;
}
```

- [ ] **Step 5: Chạy test**

Run: `npx jest src/einvoice/einvoice-math.spec.ts`
Expected: PASS (7 test).

- [ ] **Step 6: Commit**

```bash
git add 502-backend/src/einvoice/einvoice-types.ts 502-backend/src/einvoice/einvoice-math.ts 502-backend/src/einvoice/einvoice-math.spec.ts
git commit -m "feat(einvoice): tính tiền dòng, tổng và dòng bù của hóa đơn điện tử

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Số thành chữ và payload Minvoice

Spec §6.2. Tham chiếu: `buildInvoicePayload`, `numberToVietnameseCurrency` trong `minvoice-hddt-sender/src/minvoice-client.js`.

**Files:**
- Create: `502-backend/src/einvoice/minvoice/vietnamese-words.ts`, `vietnamese-words.spec.ts`
- Create: `502-backend/src/einvoice/minvoice/minvoice-payload.ts`, `minvoice-payload.spec.ts`

**Interfaces:**
- Consumes: `EinvoiceLine`, `SellerProfile` (Task 3), `lineAmountOf`, `lineVatOf` (Task 3).
- Produces:
  - `numberToVietnameseCurrency(value: number): string`;
  - `MARKER_FIELD: string | null`;
  - `interface PayloadInput {taxCode, symbolCode, registerInvoiceId, currencyId: string; seller: SellerProfile; invoiceDate: string; buyer: {taxCode, name, address, email: string | null}; lines: EinvoiceLine[]; marker: string}`;
  - `buildMinvoicePayload(input: PayloadInput): Record<string, unknown>`.

- [ ] **Step 1: Test số thành chữ**

`vietnamese-words.spec.ts`:

```ts
import { numberToVietnameseCurrency } from './vietnamese-words';

describe('numberToVietnameseCurrency', () => {
  it.each([
    [0, 'Không đồng'],
    [15, 'Mười lăm đồng'],
    [21, 'Hai mươi mốt đồng'],
    [1005, 'Một nghìn không trăm linh năm đồng'],
    [476800, 'Bốn trăm bảy mươi sáu nghìn tám trăm đồng'],
    [1000000, 'Một triệu đồng'],
    [4332400, 'Bốn triệu ba trăm ba mươi hai nghìn bốn trăm đồng'],
  ])('%d -> %s', (value, words) => {
    expect(numberToVietnameseCurrency(value)).toBe(words);
  });

  it('refuses a negative amount', () => {
    expect(() => numberToVietnameseCurrency(-1)).toThrow();
  });
});
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `npx jest src/einvoice/minvoice/vietnamese-words.spec.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: `vietnamese-words.ts`**

```ts
// Amount in words for totalAmountToWord (port of the minvoice-hddt-sender
// helper that Minvoice accepted).

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

export function numberToVietnameseCurrency(value: number): string {
  const amount = Math.round(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Số tiền không hợp lệ: ${value}`);
  }
  const words = toWords(amount);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} đồng`;
}

function toWords(amount: number): string {
  if (amount === 0) return 'không';
  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) {
    groups.push(rest % 1000);
  }
  const parts: string[] = [];
  for (let scale = groups.length - 1; scale >= 0; scale -= 1) {
    const group = groups[scale];
    if (group === 0) continue;
    const readZeroHundreds = parts.length > 0 && group < 100;
    parts.push([groupWords(group, readZeroHundreds), SCALES[scale]].filter(Boolean).join(' '));
  }
  return parts.join(' ');
}

function groupWords(group: number, readZeroHundreds: boolean): string {
  const hundreds = Math.floor(group / 100);
  const tens = Math.floor((group % 100) / 10);
  const ones = group % 10;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${DIGITS[hundreds]} trăm`);
  else if (readZeroHundreds && (tens > 0 || ones > 0)) parts.push('không trăm');

  if (tens === 0 && ones > 0) {
    parts.push(hundreds > 0 || readZeroHundreds ? `linh ${DIGITS[ones]}` : DIGITS[ones]);
  } else if (tens === 1) {
    parts.push('mười');
    if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(DIGITS[ones]);
  } else if (tens > 1) {
    parts.push(`${DIGITS[tens]} mươi`);
    if (ones === 1) parts.push('mốt');
    else if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(DIGITS[ones]);
  }
  return parts.join(' ');
}
```

Run: `npx jest src/einvoice/minvoice/vietnamese-words.spec.ts`
Expected: PASS.

- [ ] **Step 4: Test payload**

`minvoice-payload.spec.ts`:

```ts
import { buildMinvoicePayload, MARKER_FIELD, PayloadInput } from './minvoice-payload';

const input: PayloadInput = {
  taxCode: '0107811836',
  symbolCode: '1C26MTT',
  registerInvoiceId: 'range-1',
  currencyId: 'vnd-id',
  seller: {
    legalName: 'CÔNG TY CP THƯƠNG MẠI VÀ DỊCH VỤ PHƯƠNG LÂM',
    address: 'Số nhà 45A đường Hoàng Liệt, Phường Hoàng Liệt, TP Hà Nội',
    email: 'ketoan@example.com',
    tel: '',
    bankAccount: '0123456789',
    bankName: 'Ngân hàng thử',
    fax: '',
    website: '',
  },
  invoiceDate: '2026-10-01',
  buyer: { taxCode: '0107068321', name: 'CÔNG TY HOÀNG GIA', address: 'Số 26, phố Nhổn', email: null },
  lines: [
    { name: 'Tiền giờ phòng P409', unit: 'Giờ', quantity: 1.38, unitPrice: 300000, vatRate: 10 },
    { name: 'Dịch vụ karaoke', unit: 'Lần', quantity: 1, unitPrice: 909095, vatRate: 10, vatAmount: 90909 },
  ],
  marker: 'K502-7',
};

describe('buildMinvoicePayload', () => {
  const payload = buildMinvoicePayload(input);

  it('always pays TM/CK and pairs the serial with its own range', () => {
    expect(payload.paymentMethod).toBe('TM/CK');
    expect(payload.invoiceSerial).toBe('1C26MTT');
    expect(payload.registerInvoiceId).toBe('range-1');
    expect(payload.currencyId).toBe('vnd-id');
    expect(payload.currencyCode).toBe('VND');
    expect(payload.exchangeRate).toBe('1');
    expect(payload.invoiceDate).toBe('2026-10-01');
  });

  it('maps the lines and adds them up', () => {
    const detail = payload.invoiceDetail as Record<string, unknown>[];
    expect(detail[0]).toMatchObject({
      formulaType: 'TX',
      orders: 1,
      ordinalNumber: '1',
      isShowOrder: true,
      productCode: '',
      productName: 'Tiền giờ phòng P409',
      unitCode: 'Giờ',
      quantity: 1.38,
      unitPrice: 300000,
      amount: 414000,
      discountRate: null,
      discountAmount: 0,
      amountWithoutVAT: 414000,
      vatCode: '10',
      vatAmount: 41400,
      totalAmount: 455400,
      property: 1,
    });
    expect(detail[1]).toMatchObject({ amount: 909095, vatAmount: 90909, totalAmount: 1000004 });
    expect(payload).toMatchObject({
      amount: 1323095,
      totalAmountWithoutVAT: 1323095,
      totalDiscountAmount: 0,
      vatAmount: 132309,
      totalAmount: 1455404,
      totalAmountToWord: 'Một triệu bốn trăm năm mươi lăm nghìn bốn trăm linh bốn đồng',
      relatedInvoiceIds: [],
    });
  });

  it('maps seller and buyer, empty values as null', () => {
    expect(payload).toMatchObject({
      sellerTaxCode: '0107811836',
      sellerLegalName: 'CÔNG TY CP THƯƠNG MẠI VÀ DỊCH VỤ PHƯƠNG LÂM',
      sellBankAccount: '0123456789',
      sellerBankName: 'Ngân hàng thử',
      sellerTel: null,
      buyerTaxCode: '0107068321',
      buyerLegalName: 'CÔNG TY HOÀNG GIA',
      buyerAddress: 'Số 26, phố Nhổn',
      buyerEmail: null,
      buyerCode: null,
    });
  });

  it('puts the reference only in the field found by Task 0', () => {
    if (MARKER_FIELD) expect(payload[MARKER_FIELD]).toBe('K502-7');
    else expect(Object.values(payload)).not.toContain('K502-7');
  });
});
```

(Tổng: 414.000 + 909.095 = 1.323.095; VAT 41.400 + 90.909 = 132.309; tổng 1.455.404.)

- [ ] **Step 5: Chạy, thấy lỗi**

Run: `npx jest src/einvoice/minvoice/minvoice-payload.spec.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 6: `minvoice-payload.ts`**

Đặt `MARKER_FIELD` theo **Kết quả bước 0**: là chuỗi tên trường (ví dụ `'orderNumber'`) nếu có, còn không thì `null`.

```ts
import { lineAmountOf, lineVatOf } from '../einvoice-math';
import type { EinvoiceLine, SellerProfile } from '../einvoice-types';
import { numberToVietnameseCurrency } from './vietnamese-words';

// Payload field that carries our K502-<id> reference so an invoice whose
// send had no answer can be found again (plan Task 0); null: none is sent.
export const MARKER_FIELD: string | null = null;

export interface PayloadInput {
  taxCode: string;
  symbolCode: string;
  registerInvoiceId: string;
  currencyId: string;
  seller: SellerProfile;
  invoiceDate: string;
  buyer: {
    taxCode: string | null;
    name: string | null;
    address: string | null;
    email: string | null;
  };
  lines: EinvoiceLine[];
  marker: string;
}

// Fields the Minvoice web app sends as null on a new invoice.
const NULL_FIELDS = {
  invoiceNumber: null,
  orderNumber: null,
  invoiceListNumber: null,
  invoiceListDate: null,
  securityNo: null,
  fieldName7: null,
  fieldName5: null,
  relatedInvoiceProperty: null,
  relatedInvoiceType: null,
  relatedInvoiceListDate: null,
  relatedInvoiceDate: null,
  relatedInvoiceListNumber: null,
  relatedTemplateCode: null,
  relatedInvoiceSerial: null,
  relatedInvoiceNumber: null,
  invoiceNote: null,
  invoiceListId: null,
  invoiceStatus: null,
};

const orNull = (value: string | null | undefined) => (value ? value : null);

// POST /api/api/app/invoice body, the shape the Minvoice web app sends
// (spec 2026-10-01 §6.2). paymentMethod is always TM/CK.
export function buildMinvoicePayload(input: PayloadInput): Record<string, unknown> {
  const invoiceDetail = input.lines.map((line, index) => {
    const amount = lineAmountOf(line);
    const vatAmount = lineVatOf(line);
    return {
      formulaType: 'TX',
      orders: index + 1,
      isShowOrder: true,
      ordinalNumber: String(index + 1),
      productCode: '',
      productName: line.name,
      unitCode: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount,
      discountRate: null,
      discountAmount: 0,
      amountWithoutVAT: amount,
      vatCode: String(line.vatRate),
      vatAmount,
      totalAmount: amount + vatAmount,
      property: 1,
    };
  });
  const amount = invoiceDetail.reduce((sum, line) => sum + line.amount, 0);
  const vatAmount = invoiceDetail.reduce((sum, line) => sum + line.vatAmount, 0);
  const totalAmount = amount + vatAmount;
  const { seller, buyer } = input;

  return {
    invoiceDetail,
    invoiceSerial: input.symbolCode,
    invoiceDate: input.invoiceDate,
    ...NULL_FIELDS,
    ...(MARKER_FIELD ? { [MARKER_FIELD]: input.marker } : {}),
    currencyCode: 'VND',
    exchangeRate: '1',
    paymentMethod: 'TM/CK',
    sellerTaxCode: input.taxCode,
    sellerLegalName: seller.legalName,
    sellerAddress: seller.address,
    sellerEmail: orNull(seller.email),
    sellerTel: orNull(seller.tel),
    sellBankAccount: orNull(seller.bankAccount),
    sellerBankName: orNull(seller.bankName),
    sellerFax: orNull(seller.fax),
    sellerWebsite: orNull(seller.website),
    buyerTaxCode: orNull(buyer.taxCode),
    buyerCode: null,
    buyerLegalName: orNull(buyer.name),
    buyerAddress: orNull(buyer.address),
    buyerDisplayName: null,
    buyerEmail: orNull(buyer.email),
    buyerTel: null,
    buyerIdentityCard: null,
    buyerBankAccount: null,
    buyerBankName: null,
    passportNumber: null,
    buyerBudgetUnitCode: null,
    amount,
    totalDiscountAmount: 0,
    totalAmountWithoutVAT: amount,
    vatAmount,
    totalAmount,
    totalAmountToWord: numberToVietnameseCurrency(totalAmount),
    relatedInvoiceIds: [],
    registerInvoiceId: input.registerInvoiceId,
    currencyId: input.currencyId,
  };
}
```

- [ ] **Step 7: Chạy test**

Run: `npx jest src/einvoice/minvoice`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src/einvoice/minvoice/vietnamese-words.ts 502-backend/src/einvoice/minvoice/vietnamese-words.spec.ts \
  502-backend/src/einvoice/minvoice/minvoice-payload.ts 502-backend/src/einvoice/minvoice/minvoice-payload.spec.ts
git commit -m "feat(einvoice): payload hóa đơn Minvoice và số tiền bằng chữ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client Minvoice, cookie, phân loại lỗi

Spec §6.1, §9.1. Tham chiếu: `minvoice-hddt-sender/src/minvoice-session.js` (`loginMinvoice`, `CookieJar`), `src/minvoice-seller.js` (`normalizeSellerProfile`, `unwrapTenantCompany`), `src/minvoice-config.js`.

**Files:**
- Create: `502-backend/src/einvoice/minvoice/cookie-jar.ts`, `cookie-jar.spec.ts`
- Create: `502-backend/src/einvoice/minvoice/minvoice-errors.ts`
- Create: `502-backend/src/einvoice/minvoice/minvoice-client.ts`, `minvoice-client.spec.ts`
- Create: `502-backend/src/einvoice/minvoice/classify-send-error.ts`, `classify-send-error.spec.ts`

**Interfaces:**
- Consumes: `SellerProfile`, `BRANCH_TAX_CODE_RE` (Task 3).
- Produces:
  - `class CookieJar {constructor(header?: string); store(setCookies: string[]); set(name, value); get(name): string | undefined; header(): string}`.
  - Lỗi:
    - `MinvoiceHttpError {status: number; body: string}`;
    - `MinvoiceNetworkError {sent: boolean}`;
    - `MinvoiceLoginError {reason: 'password' | 'tenant'}`;
    - `MinvoiceUnexpectedResponse`;
    - `minvoiceMessage(body: string): string`.
  - `minvoiceBaseUrl(taxCode: string): string`.
  - `interface MinvoiceSession {cookie: string; token: string; userName: string}`.
  - `interface InvoiceSymbol {registerInvoiceId: string; symbolCode: string; invoiceTypeName: string | null; invoiceYear: number | null; creationTime: string | null}`.
  - `@Injectable() class MinvoiceClient`:
    - `login(taxCode, username, password): Promise<MinvoiceSession>`;
    - `getSeller(taxCode, session): Promise<SellerProfile>`;
    - `listSymbols(taxCode, session, year?: number): Promise<InvoiceSymbol[]>`;
    - `getVndCurrencyId(taxCode, session): Promise<string>`;
    - `createInvoice(taxCode, session, payload): Promise<{id: string; invoiceNumber: number}>`.
  - `type SendFailure = {kind: 'retry' | 'date-order' | 'uncertain'; message: string}`, `classifySendError(error: unknown): SendFailure`, `DATE_ORDER_PATTERNS: RegExp[]`.

- [ ] **Step 1: Test cookie jar**

`cookie-jar.spec.ts`:

```ts
import { CookieJar } from './cookie-jar';

describe('CookieJar', () => {
  it('keeps the last value of each cookie and drops expired ones', () => {
    const jar = new CookieJar('__tenant=t1');
    jar.store([
      'XSRF-TOKEN=a; path=/',
      '.AspNetCore.Identity.Application=s1; path=/; httponly',
      'XSRF-TOKEN=b; path=/',
    ]);
    expect(jar.get('XSRF-TOKEN')).toBe('b');
    jar.store(['.AspNetCore.Identity.Application=; expires=Thu, 01 Jan 1970 00:00:00 GMT']);
    expect(jar.get('.AspNetCore.Identity.Application')).toBeUndefined();
    expect(jar.header()).toBe('__tenant=t1; XSRF-TOKEN=b');
  });
});
```

- [ ] **Step 2: `cookie-jar.ts`**

```ts
// Cookies of one Minvoice session (port of the minvoice-hddt-sender CookieJar).
export class CookieJar {
  private cookies = new Map<string, string>();

  constructor(header = '') {
    for (const part of header.split(';')) {
      const at = part.indexOf('=');
      if (at > 0) this.cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
    }
  }

  // Set-Cookie headers of a response (Headers.getSetCookie()).
  store(setCookies: string[]) {
    for (const cookie of setCookies) {
      const pair = cookie.split(';')[0];
      const at = pair.indexOf('=');
      if (at <= 0) continue;
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (value === '' || /max-age=0/i.test(cookie) || isExpired(cookie)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function isExpired(cookie: string): boolean {
  const match = /expires=([^;]+)/i.exec(cookie);
  if (!match) return false;
  const time = Date.parse(match[1]);
  return Number.isFinite(time) && time <= Date.now();
}
```

Run: `npx jest src/einvoice/minvoice/cookie-jar.spec.ts`
Expected: PASS.

- [ ] **Step 3: `minvoice-errors.ts`**

```ts
// Failures of the Minvoice web API, sorted so the sender can tell a request
// Minvoice surely refused from one whose outcome is unknown (spec §9.1).

// Minvoice answered with a status >= 300, or with a web page instead of JSON.
export class MinvoiceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
  }
}

// No answer. `sent` is false only when the connection itself failed, so the
// request surely never reached Minvoice.
export class MinvoiceNetworkError extends Error {
  constructor(
    readonly sent: boolean,
    message: string,
  ) {
    super(message);
  }
}

// Wrong username/password, or no active tenant for the MST.
export class MinvoiceLoginError extends Error {
  constructor(
    readonly reason: 'password' | 'tenant',
    message: string,
  ) {
    super(message);
  }
}

// A 200 without what it must carry (e.g. an invoice without its number).
export class MinvoiceUnexpectedResponse extends Error {}

// The message inside an ABP error body ({error: {message, details}}), or the
// text of a page, cut to 300 characters.
export function minvoiceMessage(body: string): string {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; details?: string };
      message?: string;
      description?: string;
    };
    const text = [json.error?.message ?? json.message ?? json.description, json.error?.details]
      .filter(Boolean)
      .join(' — ');
    if (text) return text.slice(0, 300);
  } catch {
    // Not JSON: a page.
  }
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}
```

- [ ] **Step 4: Test client**

`minvoice-client.spec.ts`. `fetch` được thay bằng một hàm trả object giả có đúng những gì client dùng (`status`, `headers.getSetCookie()`, `text()`):

```ts
import { MinvoiceClient, minvoiceBaseUrl } from './minvoice-client';
import {
  MinvoiceHttpError,
  MinvoiceLoginError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
} from './minvoice-errors';

type Call = { url: string; init: RequestInit };
const reply = (body: unknown, status = 200, cookies: string[] = []) =>
  ({
    status,
    headers: { getSetCookie: () => cookies },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

describe('MinvoiceClient', () => {
  const client = new MinvoiceClient();
  const session = { cookie: 'a=b', token: 'tok', userName: 'admin' };
  let calls: Call[];
  let replies: Array<Response | Error>;

  beforeEach(() => {
    calls = [];
    replies = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return next!;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const header = (call: Call, name: string) =>
    (call.init.headers as Record<string, string>)[name];

  it('logs in: tenant cookie, XSRF token, login, then the token of the user', async () => {
    replies.push(
      reply({ success: true, tenantId: 't1', isActive: true }),
      reply({}, 200, ['XSRF-TOKEN=anon; path=/']),
      reply({ result: 1 }, 200, ['.AspNetCore.Identity.Application=s1; path=/; httponly']),
      reply({ currentUser: { isAuthenticated: true } }, 200, ['XSRF-TOKEN=user%3Dtok; path=/']),
    );
    const result = await client.login('0107811836', 'admin', 'pw');

    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/api/abp/multi-tenancy/tenants/by-name/0107811836',
      '/api/api/abp/application-configuration',
      '/api/api/account/login',
      '/api/api/abp/application-configuration',
    ]);
    expect(new URL(calls[0].url).host).toBe('0107811836.minvoice.net');
    expect(header(calls[1], 'cookie')).toBe('__tenant=t1');
    expect(header(calls[2], 'RequestVerificationToken')).toBe('anon');
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      userNameOrEmailAddress: 'admin',
      password: 'pw',
      rememberMe: false,
    });
    expect(calls.every((c) => c.init.redirect === 'manual')).toBe(true);
    expect(result).toEqual({
      cookie: '__tenant=t1; XSRF-TOKEN=user%3Dtok; .AspNetCore.Identity.Application=s1',
      token: 'user=tok',
      userName: 'admin',
    });
  });

  it('tells a wrong password from a missing tenant', async () => {
    replies.push(reply({ success: false }));
    await expect(client.login('0107811836', 'admin', 'pw')).rejects.toMatchObject({ reason: 'tenant' });
    replies.push(
      reply({ success: true, tenantId: 't1', isActive: true }),
      reply({}, 200, ['XSRF-TOKEN=anon']),
      reply({ result: 2, description: 'Invalid username or password!' }),
    );
    const error = await client.login('0107811836', 'admin', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MinvoiceLoginError);
    expect(error).toMatchObject({ reason: 'password' });
  });

  it('sends an invoice with the session and reads its number', async () => {
    replies.push(reply({ id: 'inv-1', invoiceNumber: 1015, invoiceStatus: 0 }));
    await expect(client.createInvoice('0107811836', session, { a: 1 })).resolves.toEqual({
      id: 'inv-1',
      invoiceNumber: 1015,
    });
    expect(calls[0].init.method).toBe('POST');
    expect(header(calls[0], 'cookie')).toBe('a=b');
    expect(header(calls[0], 'RequestVerificationToken')).toBe('tok');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ a: 1 });
  });

  it('sorts the failures of a send', async () => {
    replies.push(reply({ id: 'inv-1' }));
    await expect(client.createInvoice('0107811836', session, {})).rejects.toBeInstanceOf(
      MinvoiceUnexpectedResponse,
    );
    replies.push(reply({ error: { message: 'Unauthorized' } }, 401));
    await expect(client.createInvoice('0107811836', session, {})).rejects.toMatchObject({
      status: 401,
    });
    replies.push(reply('<html>login</html>', 200));
    await expect(client.createInvoice('0107811836', session, {})).rejects.toBeInstanceOf(
      MinvoiceHttpError,
    );
    replies.push(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    await expect(client.createInvoice('0107811836', session, {})).rejects.toMatchObject({
      sent: false,
    });
    replies.push(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } }));
    await expect(client.createInvoice('0107811836', session, {})).rejects.toMatchObject({
      sent: true,
    });
    replies.push(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    const error = await client.createInvoice('0107811836', session, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MinvoiceNetworkError);
    expect(error).toMatchObject({ sent: true });
  });

  it('lists the symbols of a year, newest first, in use only', async () => {
    replies.push(
      reply({
        items: [
          { id: 'old', symbolCode: '1C25MTT', invoiceYear: 25, use: true, creationTime: '2025-01-01T00:00:00+07:00' },
          { id: 'tms', symbolCode: '1C26TMS', invoiceYear: 26, use: true, invoiceTypeName: 'Hóa đơn giá trị gia tăng', creationTime: '2026-01-02T11:09:23+07:00' },
          { id: 'mms', symbolCode: '1C26MTT', invoiceYear: 26, use: true, creationTime: '2026-01-02T11:09:22+07:00' },
          { id: 'off', symbolCode: '1C26OFF', invoiceYear: 26, use: false, creationTime: '2026-02-01T00:00:00+07:00' },
        ],
      }),
    );
    const symbols = await client.listSymbols('0107811836', session, 2026);
    expect(symbols.map((s) => s.symbolCode)).toEqual(['1C26TMS', '1C26MTT']);
    expect(symbols[0]).toEqual({
      registerInvoiceId: 'tms',
      symbolCode: '1C26TMS',
      invoiceTypeName: 'Hóa đơn giá trị gia tăng',
      invoiceYear: 26,
      creationTime: '2026-01-02T11:09:23+07:00',
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/api/api/app/register-invoice/using-list');
    expect(url.searchParams.get('userName')).toBe('admin');
    expect(url.searchParams.get('Sorting')).toBe('creationTime');
    expect(url.searchParams.get('SortType')).toBe('DESCEND');
  });

  it('checks the MST before building a host name', () => {
    expect(() => minvoiceBaseUrl('evil.com/x')).toThrow();
    expect(minvoiceBaseUrl('0107811836')).toBe('https://0107811836.minvoice.net');
  });
});
```

- [ ] **Step 5: Chạy, thấy lỗi**

Run: `npx jest src/einvoice/minvoice/minvoice-client.spec.ts`
Expected: FAIL, không tìm thấy module `./minvoice-client`.

- [ ] **Step 6: `minvoice-client.ts`**

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { BRANCH_TAX_CODE_RE, type SellerProfile } from '../einvoice-types';
import { CookieJar } from './cookie-jar';
import {
  MinvoiceHttpError,
  MinvoiceLoginError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
  minvoiceMessage,
} from './minvoice-errors';

// The Minvoice web app's own API (no public API exists), as mapped by
// minvoice-hddt-sender/docs/api-integration.md (spec 2026-10-01 §6.1).

const LOGIN_TIMEOUT_MS = 10_000; // the whole login sequence
const READ_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 25_000;

// Connection failures where the request never reached Minvoice.
const NOT_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export interface MinvoiceSession {
  cookie: string;
  // RequestVerificationToken header (the XSRF-TOKEN cookie of the logged-in user).
  token: string;
  userName: string;
}

export interface InvoiceSymbol {
  registerInvoiceId: string;
  symbolCode: string;
  invoiceTypeName: string | null;
  invoiceYear: number | null;
  creationTime: string | null;
}

// https://<MST>.minvoice.net. Tests point it at a fake server with
// MINVOICE_URL_TEMPLATE (ignored in production). The MST is checked before
// it becomes part of a host name.
export function minvoiceBaseUrl(taxCode: string): string {
  if (!BRANCH_TAX_CODE_RE.test(taxCode)) {
    throw new BadRequestException('Mã số thuế của cơ sở không hợp lệ');
  }
  const template =
    process.env.NODE_ENV === 'production' ? undefined : process.env.MINVOICE_URL_TEMPLATE;
  return (template || 'https://{taxCode}.minvoice.net').replace('{taxCode}', taxCode);
}

interface CallInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

@Injectable()
export class MinvoiceClient {
  async login(taxCode: string, username: string, password: string): Promise<MinvoiceSession> {
    const base = minvoiceBaseUrl(taxCode);
    const signal = AbortSignal.timeout(LOGIN_TIMEOUT_MS);
    const jar = new CookieJar();

    const tenant = (await this.call(
      `${base}/api/api/abp/multi-tenancy/tenants/by-name/${encodeURIComponent(taxCode)}`,
      { signal },
      jar,
    )) as { success?: boolean; tenantId?: string; isActive?: boolean } | null;
    if (!tenant?.success || !tenant.tenantId || !tenant.isActive) {
      throw new MinvoiceLoginError('tenant', `MST ${taxCode} chưa có hoặc chưa kích hoạt trên Minvoice`);
    }
    jar.set('__tenant', tenant.tenantId);

    await this.call(`${base}/api/api/abp/application-configuration`, { signal }, jar);
    const anonymousToken = decodeURIComponent(jar.get('XSRF-TOKEN') ?? '');
    if (!anonymousToken) throw new MinvoiceUnexpectedResponse('Minvoice không cấp XSRF-TOKEN');

    const result = (await this.call(
      `${base}/api/api/account/login`,
      {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', RequestVerificationToken: anonymousToken },
        body: JSON.stringify({ userNameOrEmailAddress: username, password, rememberMe: false }),
      },
      jar,
    )) as { result?: number } | null;
    if (result?.result !== 1) {
      throw new MinvoiceLoginError('password', 'Sai tên đăng nhập hoặc mật khẩu Minvoice');
    }

    // The anti-forgery token is bound to the user: fetch the logged-in one.
    await this.call(`${base}/api/api/abp/application-configuration`, { signal }, jar);
    return {
      cookie: jar.header(),
      token: decodeURIComponent(jar.get('XSRF-TOKEN') ?? anonymousToken),
      userName: username,
    };
  }

  async getSeller(taxCode: string, session: MinvoiceSession): Promise<SellerProfile> {
    const raw = await this.authed(taxCode, session, '/api/api/app/tenant-company/');
    const source = unwrap(raw);
    const text = (...values: unknown[]) =>
      values.map((v) => String(v ?? '').trim()).find(Boolean) ?? '';
    return {
      legalName: text(source.name, source.legalName, source.companyName),
      address: text(source.address, source.companyAddress),
      email: text(source.email),
      tel: text(source.tel, source.mobile, source.phone),
      bankAccount: text(source.bankAccount, source.sellBankAccount),
      bankName: text(source.bankName),
      fax: text(source.fax),
      website: text(source.webSite, source.website),
    };
  }

  // Symbols the logged-in user may use, newest first, `use !== false`; of one
  // year (4 digits) when given (the same query as the Minvoice web app).
  async listSymbols(taxCode: string, session: MinvoiceSession, year?: number): Promise<InvoiceSymbol[]> {
    const data = (await this.authed(taxCode, session, '/api/api/app/register-invoice/using-list', {
      maxResultCount: '1000',
      userName: session.userName,
      Sorting: 'creationTime',
      SortType: 'DESCEND',
    })) as { items?: Record<string, unknown>[] } | null;
    const twoDigits = year === undefined ? undefined : year % 100;
    return (data?.items ?? [])
      .filter((item) => item.use !== false && typeof item.id === 'string')
      .filter((item) => twoDigits === undefined || Number(item.invoiceYear) === twoDigits)
      .map((item) => ({
        registerInvoiceId: item.id as string,
        symbolCode: String(item.symbolCode ?? ''),
        invoiceTypeName: (item.invoiceTypeName as string | undefined) ?? null,
        invoiceYear: item.invoiceYear == null ? null : Number(item.invoiceYear),
        creationTime: (item.creationTime as string | undefined) ?? null,
      }))
      .sort((a, b) => (Date.parse(b.creationTime ?? '') || 0) - (Date.parse(a.creationTime ?? '') || 0));
  }

  async getVndCurrencyId(taxCode: string, session: MinvoiceSession): Promise<string> {
    const data = (await this.authed(taxCode, session, '/api/api/app/currency', {
      maxResultCount: '1000',
    })) as { items?: Record<string, unknown>[] } | null;
    const vnd = (data?.items ?? []).find(
      (item) => String(item.code ?? item.currencyCode ?? '').toUpperCase() === 'VND',
    );
    if (typeof vnd?.id !== 'string') throw new MinvoiceUnexpectedResponse('Tenant Minvoice không có tiền tệ VND');
    return vnd.id;
  }

  async createInvoice(
    taxCode: string,
    session: MinvoiceSession,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; invoiceNumber: number }> {
    const base = minvoiceBaseUrl(taxCode);
    const body = (await this.call(`${base}/api/api/app/invoice`, {
      method: 'POST',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: { ...authHeaders(base, session), 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })) as { id?: unknown; invoiceNumber?: unknown } | null;
    const invoiceNumber = Number(body?.invoiceNumber);
    if (typeof body?.id !== 'string' || !Number.isInteger(invoiceNumber) || invoiceNumber < 1) {
      throw new MinvoiceUnexpectedResponse('Minvoice trả về hóa đơn không có id hoặc số hóa đơn');
    }
    return { id: body.id, invoiceNumber };
  }

  private authed(
    taxCode: string,
    session: MinvoiceSession,
    path: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const base = minvoiceBaseUrl(taxCode);
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return this.call(url.toString(), {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      headers: authHeaders(base, session),
    });
  }

  private async call(url: string, init: CallInit, jar?: CookieJar): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      ...(init.headers ?? {}),
    };
    const cookie = jar?.header();
    if (cookie) headers.cookie = cookie;

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, redirect: 'manual' });
    } catch (error) {
      throw networkError(error);
    }
    jar?.store(response.headers.getSetCookie());

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw networkError(error, true);
    }
    if (response.status >= 300) {
      throw new MinvoiceHttpError(
        response.status,
        text.slice(0, 2000),
        `Minvoice trả lỗi HTTP ${response.status}: ${minvoiceMessage(text)}`,
      );
    }
    try {
      return text ? (JSON.parse(text) as unknown) : null;
    } catch {
      throw new MinvoiceHttpError(
        response.status,
        text.slice(0, 2000),
        'Minvoice trả về trang web thay vì dữ liệu (phiên đăng nhập có thể đã hết)',
      );
    }
  }
}

function authHeaders(base: string, session: MinvoiceSession): Record<string, string> {
  return {
    cookie: session.cookie,
    RequestVerificationToken: session.token,
    origin: new URL(base).origin,
    referer: `${new URL(base).origin}/`,
  };
}

function networkError(error: unknown, sentKnown?: boolean): MinvoiceNetworkError {
  const e = error as { name?: string; cause?: { code?: string } } | undefined;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return new MinvoiceNetworkError(true, 'Minvoice không trả lời kịp');
  }
  const code = e?.cause?.code;
  const sent = sentKnown ?? !(code && NOT_SENT_CODES.has(code));
  return new MinvoiceNetworkError(sent, `Không kết nối được Minvoice${code ? ` (${code})` : ''}`);
}

// tenant-company answers an object, a list or {result|data: …} depending on
// the tenant (minvoice-seller.js unwrapTenantCompany).
function unwrap(raw: unknown): Record<string, unknown> {
  const value = raw as Record<string, unknown> | unknown[] | null;
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? {};
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value.items)) return (value.items[0] as Record<string, unknown>) ?? {};
  for (const key of ['result', 'data']) {
    if (value[key] && typeof value[key] === 'object') return unwrap(value[key]);
  }
  return value;
}
```

Run: `npx jest src/einvoice/minvoice/minvoice-client.spec.ts`
Expected: PASS.

- [ ] **Step 7: Test phân loại lỗi**

`classify-send-error.spec.ts`:

```ts
import { classifySendError } from './classify-send-error';
import {
  MinvoiceHttpError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
} from './minvoice-errors';

describe('classifySendError (spec §9.1)', () => {
  const http = (status: number, message: string) =>
    new MinvoiceHttpError(status, JSON.stringify({ error: { message } }), `HTTP ${status}: ${message}`);

  it('resends after an answer Minvoice refused', () => {
    expect(classifySendError(http(401, 'Unauthorized')).kind).toBe('retry');
    expect(classifySendError(http(400, 'Dải hóa đơn không hợp lệ')).kind).toBe('retry');
    expect(classifySendError(http(500, 'Internal error')).kind).toBe('retry');
  });

  it('resends when the request never left', () => {
    expect(classifySendError(new MinvoiceNetworkError(false, 'ECONNREFUSED')).kind).toBe('retry');
  });

  it('never resends a date refused for its order', () => {
    expect(classifySendError(http(400, 'Ngày hóa đơn nhỏ hơn ngày hóa đơn mới nhất')).kind).toBe(
      'date-order',
    );
  });

  it('marks as uncertain what may have been created', () => {
    expect(classifySendError(new MinvoiceNetworkError(true, 'timeout')).kind).toBe('uncertain');
    expect(classifySendError(new MinvoiceUnexpectedResponse('no number')).kind).toBe('uncertain');
    expect(classifySendError(new Error('bug')).kind).toBe('uncertain');
  });
});
```

- [ ] **Step 8: `classify-send-error.ts`**

Nếu **Kết quả bước 0** có `DATE_ORDER_MESSAGE`, thêm một `RegExp` khớp câu đó (bỏ phần thay đổi như ngày hay số, ví dụ `/Ngày hóa đơn phải lớn hơn hoặc bằng/i`) vào `DATE_ORDER_PATTERNS`, **trước** mẫu chung.

```ts
import {
  MinvoiceHttpError,
  MinvoiceNetworkError,
  minvoiceMessage,
} from './minvoice-errors';

// How a failed POST invoice is handled (spec 2026-10-01 §9.1):
// - retry: Minvoice refused it or it never left: log in again, fetch the
//   symbol's range again and resend once (the user's rule);
// - date-order: dated before the newest invoice of the symbol: resending
//   cannot help;
// - uncertain: it may have been created: never resend blindly.
export type SendFailure = {
  kind: 'retry' | 'date-order' | 'uncertain';
  message: string;
};

// Minvoice's message for an invoice dated before the newest one of its
// symbol (plan Task 0), then a general fallback.
export const DATE_ORDER_PATTERNS: RegExp[] = [
  /ngày hóa đơn[^.]*(nhỏ hơn|lớn hơn|trước|sau)/i,
];

export function classifySendError(error: unknown): SendFailure {
  if (error instanceof MinvoiceHttpError) {
    const text = minvoiceMessage(error.body);
    if (DATE_ORDER_PATTERNS.some((pattern) => pattern.test(text))) {
      return { kind: 'date-order', message: text };
    }
    return { kind: 'retry', message: error.message };
  }
  if (error instanceof MinvoiceNetworkError) {
    return { kind: error.sent ? 'uncertain' : 'retry', message: error.message };
  }
  return {
    kind: 'uncertain',
    message: error instanceof Error ? error.message : 'Lỗi không xác định khi gửi Minvoice',
  };
}
```

Run: `npx jest src/einvoice/minvoice`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add 502-backend/src/einvoice/minvoice
git commit -m "feat(einvoice): client Minvoice (đăng nhập, ký hiệu, người bán, gửi) và phân loại lỗi gửi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tra MST người mua

Spec §6.3. Tham chiếu: `minvoice-hddt-sender/src/buyer-lookup.js`.

**Files:**
- Create: `502-backend/src/einvoice/tax-payer.service.ts`, `tax-payer.service.spec.ts`

**Interfaces:**
- Consumes: `BUYER_TAX_CODE_RE` (Task 3).
- Produces:
  - `interface TaxPayer {taxCode: string; name: string; address: string; status: string; active: boolean; source: 'gdt' | 'xinvoice'}`;
  - `@Injectable() class TaxPayerService {lookup(taxCode: string): Promise<TaxPayer>; now: () => number}`.

- [ ] **Step 1: Viết test**

`tax-payer.service.spec.ts`:

```ts
import { HttpException } from '@nestjs/common';
import { TaxPayerService } from './tax-payer.service';

const reply = (status: number, body: unknown) =>
  ({ ok: status < 300, status, text: async () => JSON.stringify(body) }) as unknown as Response;

const gdtBody = {
  mst: '0107068321',
  tennnt: 'CÔNG TY CỔ PHẦN ĐẦU TƯ THƯƠNG MẠI VÀ DỊCH VỤ GIẢI TRÍ HOÀNG GIA',
  tthai: '00',
  dctsdchi: 'Số 26, phố Nhổn',
  dctsxaten: 'Phường Tây Tựu',
  dctstinhten: 'TP Hà Nội',
};
const xinvoiceBody = {
  taxID: '0107068321',
  name: 'CÔNG TY CỔ PHẦN ĐẦU TƯ THƯƠNG MẠI VÀ DỊCH VỤ GIẢI TRÍ HOÀNG GIA',
  address: 'Số 26, phố Nhổn, Phường Tây Tựu, TP Hà Nội',
  status: 'NNT đang hoạt động',
};
const blocked = { status: 403, message: 'Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.' };

describe('TaxPayerService', () => {
  let service: TaxPayerService;
  let hosts: string[];
  let answers: Record<string, () => Response>;

  beforeEach(() => {
    service = new TaxPayerService();
    hosts = [];
    answers = {};
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const host = new URL(String(url)).host;
      hosts.push(host);
      return answers[host]();
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the tax portal first', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(200, gdtBody);
    await expect(service.lookup('0107068321')).resolves.toEqual({
      taxCode: '0107068321',
      name: gdtBody.tennnt,
      address: 'Số 26, phố Nhổn, Phường Tây Tựu, TP Hà Nội',
      status: 'NNT đang hoạt động',
      active: true,
      source: 'gdt',
    });
    expect(hosts).toEqual(['hoadondientu.gdt.gov.vn']);
  });

  it('falls back to xinvoice when the portal blocks, and caches the answer', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(403, blocked);
    answers['api.xinvoice.vn'] = () => reply(200, xinvoiceBody);
    const first = await service.lookup('0107068321');
    expect(first).toMatchObject({ source: 'xinvoice', active: true, address: xinvoiceBody.address });
    await service.lookup('0107068321');
    expect(hosts).toEqual(['hoadondientu.gdt.gov.vn', 'api.xinvoice.vn']);
  });

  it('shares one lookup between concurrent requests', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(200, gdtBody);
    await Promise.all([service.lookup('0107068321'), service.lookup('0107068321')]);
    expect(hosts).toHaveLength(1);
  });

  it('forgets an answer after 7 days', async () => {
    let now = 0;
    service.now = () => now;
    answers['hoadondientu.gdt.gov.vn'] = () => reply(200, gdtBody);
    await service.lookup('0107068321');
    now = 7 * 24 * 3600 * 1000 + 1;
    await service.lookup('0107068321');
    expect(hosts).toHaveLength(2);
  });

  it('answers 404 when neither knows the tax code, 424 when both fail', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(403, blocked);
    answers['api.xinvoice.vn'] = () => reply(404, { success: false, message: 'Tax not found' });
    await expect(service.lookup('0100000000')).rejects.toMatchObject({ status: 404 });
    answers['api.xinvoice.vn'] = () => reply(500, {});
    await expect(service.lookup('0100000001')).rejects.toMatchObject({ status: 424 });
  });

  it('keeps xinvoice under 10 calls per 30 s', async () => {
    let now = 0;
    service.now = () => now;
    answers['hoadondientu.gdt.gov.vn'] = () => reply(403, blocked);
    answers['api.xinvoice.vn'] = () => reply(200, xinvoiceBody);
    for (let i = 0; i < 10; i++) await service.lookup(`01070683${String(i).padStart(2, '0')}`);
    const error = await service.lookup('0107068399').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    now = 30_001;
    await expect(service.lookup('0107068399')).resolves.toMatchObject({ source: 'xinvoice' });
  });

  it('checks the format before calling out', async () => {
    await expect(service.lookup('12345')).rejects.toMatchObject({ status: 400 });
    expect(hosts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `npx jest src/einvoice/tax-payer.service.spec.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: `tax-payer.service.ts`**

```ts
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BUYER_TAX_CODE_RE } from './einvoice-types';

// Buyer lookup by MST (spec 2026-10-01 §6.3): the GDT tax portal first, then
// api.xinvoice.vn, which answers when the portal blocks the server (seen
// 01/10/2026). Neither has a contract: a failed lookup never stops an invoice,
// the buyer is typed by hand.

export interface TaxPayer {
  taxCode: string;
  name: string;
  address: string;
  status: string;
  active: boolean;
  source: 'gdt' | 'xinvoice';
}

const GDT_URL = 'https://hoadondientu.gdt.gov.vn/api/category/public/dsdkts';
const XINVOICE_URL = 'https://api.xinvoice.vn/gdt-api/tax-payer';
const GDT_TIMEOUT_MS = 8_000;
// A tax code xinvoice has not seen takes it ~20 s.
const XINVOICE_TIMEOUT_MS = 30_000;
const CACHE_MAX = 1000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
// xinvoice's own limit (ratelimit-policy "10-in-30sec"), shared by the chain.
const XINVOICE_MAX_CALLS = 10;
const XINVOICE_WINDOW_MS = 30_000;

class LookupFailed extends Error {
  constructor(readonly notFound: boolean, message: string) {
    super(message);
  }
}

@Injectable()
export class TaxPayerService {
  // Capped (resource rules): the oldest entry goes first when full.
  private cache = new Map<string, { value: TaxPayer; at: number }>();
  // Lookups in flight, one per tax code; at most one per concurrent request.
  private inflight = new Map<string, Promise<TaxPayer>>();
  private xinvoiceCalls: number[] = [];
  now = () => Date.now();

  lookup(raw: string): Promise<TaxPayer> {
    const taxCode = raw.trim();
    if (!BUYER_TAX_CODE_RE.test(taxCode)) {
      return Promise.reject(new BadRequestException('MST phải có 10 số, 10 số kèm -3 số, hoặc 12 số'));
    }
    const hit = this.cache.get(taxCode);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value);

    const running = this.inflight.get(taxCode);
    if (running) return running;
    const promise = this.fetchEither(taxCode)
      .then((value) => {
        this.remember(taxCode, value);
        return value;
      })
      .finally(() => this.inflight.delete(taxCode));
    this.inflight.set(taxCode, promise);
    return promise;
  }

  private async fetchEither(taxCode: string): Promise<TaxPayer> {
    let portalError: LookupFailed;
    try {
      return await this.fromGdt(taxCode);
    } catch (error) {
      portalError = asFailure(error);
    }
    this.takeXinvoiceSlot();
    try {
      return await this.fromXinvoice(taxCode);
    } catch (error) {
      const fallback = asFailure(error);
      if (fallback.notFound) throw new NotFoundException(`Không tìm thấy MST ${taxCode}`);
      throw new HttpException(
        `Không tra được MST ${taxCode}. Cổng thuế: ${portalError.message}. xinvoice: ${fallback.message}`,
        HttpStatus.FAILED_DEPENDENCY,
      );
    }
  }

  private async fromGdt(taxCode: string): Promise<TaxPayer> {
    const body = (await getJson(`${GDT_URL}/${encodeURIComponent(taxCode)}/manager`, GDT_TIMEOUT_MS)) as Record<
      string,
      string | undefined
    >;
    if (!body?.mst) throw new LookupFailed(true, 'không có dữ liệu');
    const address = [body.dctsdchi, body.dctsxaten || body.dctstxa, body.dctshuyenten || body.dctsthuyen, body.dctstinhten || body.dctstinh]
      .map((part) => String(part ?? '').trim())
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join(', ');
    const active = body.tthai === '00';
    return {
      taxCode: body.mst,
      name: body.tennnt ?? '',
      address,
      status: active ? 'NNT đang hoạt động' : `Mã trạng thái ${body.tthai ?? '?'}`,
      active,
      source: 'gdt',
    };
  }

  private async fromXinvoice(taxCode: string): Promise<TaxPayer> {
    const body = (await getJson(`${XINVOICE_URL}/${encodeURIComponent(taxCode)}`, XINVOICE_TIMEOUT_MS)) as Record<
      string,
      string | undefined
    >;
    if (!body?.taxID) throw new LookupFailed(true, 'không có dữ liệu');
    const status = body.status ?? '';
    return {
      taxCode: body.taxID,
      name: body.name ?? '',
      address: String(body.address ?? '').trim(),
      status,
      active: /^NNT đang hoạt động/i.test(status),
      source: 'xinvoice',
    };
  }

  // Sliding window over the last 30 s.
  private takeXinvoiceSlot() {
    const now = this.now();
    this.xinvoiceCalls = this.xinvoiceCalls.filter((time) => now - time < XINVOICE_WINDOW_MS);
    if (this.xinvoiceCalls.length >= XINVOICE_MAX_CALLS) {
      throw new HttpException('Tra cứu nhiều quá, thử lại sau ít giây', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.xinvoiceCalls.push(now);
  }

  private remember(taxCode: string, value: TaxPayer) {
    this.cache.delete(taxCode);
    this.cache.set(taxCode, { value, at: this.now() });
    while (this.cache.size > CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
  }
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new LookupFailed(false, name === 'TimeoutError' ? 'quá thời gian chờ' : 'không kết nối được');
  }
  const text = await response.text().catch(() => '');
  if (response.status === 404) throw new LookupFailed(true, 'không tìm thấy');
  if (!response.ok) throw new LookupFailed(false, `HTTP ${response.status}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LookupFailed(false, 'dữ liệu không đọc được');
  }
}

function asFailure(error: unknown): LookupFailed {
  return error instanceof LookupFailed ? error : new LookupFailed(false, String((error as Error)?.message ?? error));
}
```

- [ ] **Step 4: Chạy test**

Run: `npx jest src/einvoice/tax-payer.service.spec.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add 502-backend/src/einvoice/tax-payer.service.ts 502-backend/src/einvoice/tax-payer.service.spec.ts
git commit -m "feat(einvoice): tra MST người mua qua cổng thuế, dự phòng xinvoice, có bộ đệm và giới hạn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Cấu hình Minvoice theo cơ sở (API và e2e với Minvoice giả)

Spec §3, §7.1, §7.2, §9.1 (đăng nhập), §11.

**Files:**
- Modify: `502-backend/src/auth/roles.ts`
- Create: `502-backend/src/einvoice/dto/config.dto.ts`
- Create: `502-backend/src/einvoice/einvoice-config.service.ts`, `einvoice-config.controller.ts`, `einvoice.module.ts`
- Modify: `502-backend/src/app.module.ts`
- Create: `502-backend/test/fake-minvoice.ts`, `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `MinvoiceClient`, `MinvoiceSession`, `InvoiceSymbol`, `MinvoiceHttpError`, `MinvoiceLoginError` (Task 5);
  - `TaxPayerService` (Task 6);
  - `encryptSecret`, `decryptSecret`, `assertEinvoiceSecret` (Task 2);
  - `SellerProfile` (Task 3); `fromDbDate` (Task 1).
- Produces:
  - `EINVOICE_WRITERS`, `EINVOICE_READERS` trong `roles.ts`.
  - `interface EinvoiceConfigView {branchTaxCode, username, symbolCode, registerInvoiceId, sellerName, loginError, minInvoiceDate: string | null; latestInvoiceNumber: number | null; needsLogin: boolean; configured: boolean}`.
  - `interface IssueConfig {branchId: number; taxCode, symbolCode, registerInvoiceId, currencyId: string; seller: SellerProfile; session: MinvoiceSession | null}`.
  - `class EinvoiceConfigService`:
    - `view(user, branchCode?)`, `viewOf(branchId)`;
    - `login(user, branchCode, dto)`, `symbols(user, branchCode, year?)`, `selectSymbol(user, branchCode, dto)`;
    - `latestIssued(taxCode, symbolCode): Promise<{invoiceDate: string; invoiceNumber: number | null} | null>`;
    - `readyForIssue(branchId): Promise<IssueConfig>`;
    - `relogin(branchId): Promise<MinvoiceSession>`;
    - `refreshRange(config: IssueConfig, session): Promise<IssueConfig>`.
  - `minvoiceUnavailable(error): HttpException` (424).
  - `class FakeMinvoice`: `start(port?)`, `stop()`, `expireSessions()`, `symbolCode(yearOffset?)`; các thuộc tính `password`, `rangeId`, `behaviours: ('ok' | 'drop' | 'date-order' | 'reject')[]`, `delayMs`, `logins`, `posts`, `invoices`.

- [ ] **Step 1: Nhóm quyền**

Thêm vào cuối `502-backend/src/auth/roles.ts`:

```ts
// Hóa đơn điện tử (spec 2026-10-01 §3): drafts by the sales roles, read by
// them and HĐQT; issuing, numbers and the Minvoice account are CHAIN_ONLY.
export const EINVOICE_WRITERS: Role[] = SALES;
export const EINVOICE_READERS: Role[] = SALES_READERS;
```

- [ ] **Step 2: Server Minvoice giả**

`502-backend/test/fake-minvoice.ts`:

```ts
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

// A stand-in for the Minvoice web API, answering the requests of
// src/einvoice/minvoice/minvoice-client.ts. Used by test/einvoice.e2e-spec.ts
// and for a manual browser check:
//   npx ts-node test/fake-minvoice.ts 4555
//   MINVOICE_URL_TEMPLATE=http://127.0.0.1:4555/{taxCode} (backend, not production)

export type SendBehaviour = 'ok' | 'drop' | 'date-order' | 'reject';

export class FakeMinvoice {
  password = 'minvoice-pass';
  // Current range of the symbol: change it to make an old id fail.
  rangeId = 'range-1';
  // One entry per POST invoice, used in order; nothing left = 'ok'.
  behaviours: SendBehaviour[] = [];
  delayMs = 0;
  logins = 0;
  posts = 0;
  invoices: Record<string, unknown>[] = [];
  private sessions = new Set<string>();
  private nextNumber = 1001;
  private server?: Server;

  // 1C<yy>MTT of this year (0) or of an earlier one (-1).
  symbolCode(yearOffset = 0) {
    const year = (new Date().getFullYear() + yearOffset) % 100;
    return `1C${String(year).padStart(2, '0')}MTT`;
  }

  expireSessions() {
    this.sessions.clear();
  }

  async start(port = 0): Promise<string> {
    const server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server = server;
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    const { port: actual } = server.address() as AddressInfo;
    return `http://127.0.0.1:${actual}/{taxCode}`;
  }

  async stop() {
    const server = this.server;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://fake');
    const [, taxCode, ...rest] = url.pathname.split('/');
    const path = `/${rest.join('/')}`;
    const cookies = new Map(
      (req.headers.cookie ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)] as const),
    );
    const session = cookies.get('.AspNetCore.Identity.Application');
    const loggedIn = !!session && this.sessions.has(session);
    const token = req.headers['requestverificationtoken'];
    const authed = loggedIn && token === `xsrf-${session}`;
    const body = req.method === 'POST' ? await readBody(req) : null;
    const json = (status: number, data: unknown, setCookies: string[] = []) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        ...(setCookies.length ? { 'set-cookie': setCookies } : {}),
      });
      res.end(JSON.stringify(data));
    };
    const year = new Date().getFullYear();

    if (path === `/api/api/abp/multi-tenancy/tenants/by-name/${taxCode}`) {
      return json(200, { success: true, tenantId: `tenant-${taxCode}`, name: taxCode, isActive: true });
    }
    if (path === '/api/api/abp/application-configuration') {
      const xsrf = loggedIn ? `xsrf-${session}` : 'xsrf-anon';
      return json(200, { currentUser: { isAuthenticated: loggedIn } }, [`XSRF-TOKEN=${xsrf}; path=/`]);
    }
    if (path === '/api/api/account/login' && req.method === 'POST') {
      if (token !== 'xsrf-anon') {
        return json(400, { error: { message: 'The required antiforgery request token was not provided' } });
      }
      if ((body as { password?: string }).password !== this.password) {
        return json(200, { result: 2, description: 'Invalid username or password!' });
      }
      const id = `sess-${++this.logins}`;
      this.sessions.add(id);
      return json(200, { result: 1 }, [`.AspNetCore.Identity.Application=${id}; path=/; httponly`]);
    }
    if (!authed) {
      return json(401, { error: { message: 'Current user did not login to the application!' } });
    }
    if (path === '/api/api/app/tenant-company/') {
      return json(200, {
        taxCode,
        name: 'CÔNG TY TNHH KARAOKE THỬ NGHIỆM',
        address: 'Số 1 Phố Thử, Hà Nội',
        email: 'ketoan@example.com',
        tel: '',
        bankAccount: '0123456789',
        bankName: 'ACB',
        fax: '',
        webSite: '',
      });
    }
    if (path === '/api/api/app/register-invoice/using-list') {
      return json(200, {
        items: [
          {
            id: this.rangeId,
            symbolCode: this.symbolCode(),
            invoiceYear: year % 100,
            use: true,
            invoiceTypeName: 'Hóa đơn giá trị gia tăng - Máy tính tiền',
            creationTime: `${year}-01-02T11:09:22+07:00`,
          },
          {
            id: 'range-old',
            symbolCode: this.symbolCode(-1),
            invoiceYear: (year - 1) % 100,
            use: true,
            invoiceTypeName: 'Hóa đơn giá trị gia tăng - Máy tính tiền',
            creationTime: `${year - 1}-01-02T11:09:22+07:00`,
          },
        ],
      });
    }
    if (path === '/api/api/app/currency') {
      return json(200, { items: [{ id: 'usd-id', code: 'USD' }, { id: 'vnd-id', code: 'VND' }] });
    }
    if (path === '/api/api/app/invoice' && req.method === 'POST') {
      this.posts += 1;
      const behaviour = this.behaviours.shift() ?? 'ok';
      if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      if (behaviour === 'drop') {
        req.socket.destroy();
        return;
      }
      if (behaviour === 'date-order') {
        return json(400, { error: { message: 'Ngày hóa đơn nhỏ hơn ngày hóa đơn mới nhất của ký hiệu' } });
      }
      if (behaviour === 'reject') return json(400, { error: { message: 'ModelState is not valid' } });
      const invoice = body as Record<string, unknown>;
      if (invoice.registerInvoiceId !== this.rangeId) {
        return json(400, { error: { message: 'Dải hóa đơn không hợp lệ' } });
      }
      this.invoices.push(invoice);
      const number = this.nextNumber++;
      return json(200, { id: `inv-${number}`, invoiceNumber: number, invoiceStatus: 0, sendTaxStatus: 1 });
    }
    return json(404, { error: { message: `No route ${req.method} ${path}` } });
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as unknown) : {};
}

if (require.main === module) {
  const fake = new FakeMinvoice();
  void fake.start(Number(process.argv[2] ?? 4555)).then((template) => {
    console.log(`Minvoice giả: MINVOICE_URL_TEMPLATE=${template} — mật khẩu ${fake.password}`);
  });
}
```

- [ ] **Step 3: E2E cấu hình (chưa có code, sẽ fail)**

`502-backend/test/einvoice.e2e-spec.ts`:

```ts
// test/einvoice.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FakeMinvoice } from './fake-minvoice';

// Hóa đơn điện tử (spec 2026-10-01) against a fake Minvoice
// (test/fake-minvoice.ts). The `it`s build on each other: run the whole file.

type Json = Record<string, unknown>;
const TAX_CODE = '0107811836';
// What must never leave the server: the Minvoice password, cookie and token.
const SECRETS = ['minvoice-pass', 'sess-', 'xsrf-'];

describe('E-invoices (e2e)', () => {
  let app: INestApplication<App>;
  const fake = new FakeMinvoice();
  const tokens: Record<string, string> = {};
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
      delete: (url: string) => api().delete(`/api${url}`).set('Authorization', auth),
    };
  };
  const login = async (username: string) => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username, password: '12345678' })
      .expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };
  const noSecrets = (body: unknown) => {
    const text = JSON.stringify(body);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  };

  beforeAll(async () => {
    process.env.MINVOICE_URL_TEMPLATE = await fake.start();
    execSync('npx prisma migrate reset --force --skip-generate', {
      env: { ...process.env, SEED_DEMO: '1' },
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
    for (const name of ['admin', 'ql1_cs1', 'tn1_cs1', 'ql1_cs2']) await login(name);
    await as('admin')
      .post('/users', { username: 'hdqt_hddt', fullName: 'HĐQT', role: 'BOARD', password: '12345678' })
      .expect(201);
    await login('hdqt_hddt');
    const branches = (await as('admin').get('/branches').expect(200)).body as Json[];
    cs1Id = branches.find((b) => b.code === 'cs1')!.id as number;
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
    delete process.env.MINVOICE_URL_TEMPLATE;
  });

  describe('config', () => {
    it('needs a tax code on the branch', async () => {
      const res = await as('admin')
        .post('/einvoice/config/login?branch=cs1', { username: 'admin', password: fake.password })
        .expect(400);
      expect((res.body as Json).message).toMatch(/mã số thuế/);
      await as('admin').patch(`/branches/${cs1Id}`, { taxCode: '12' }).expect(400);
      await as('admin').patch(`/branches/${cs1Id}`, { taxCode: TAX_CODE }).expect(200);
    });

    it('is for the chain manager only', async () => {
      for (const name of ['ql1_cs1', 'tn1_cs1', 'hdqt_hddt']) {
        await as(name)
          .post('/einvoice/config/login?branch=cs1', { username: 'admin', password: fake.password })
          .expect(403);
        await as(name).get('/einvoice/config/symbols?branch=cs1').expect(403);
      }
      await as('hdqt_hddt').get('/einvoice/config?branch=cs1').expect(200);
    });

    it('refuses a wrong password and keeps nothing', async () => {
      const res = await as('admin')
        .post('/einvoice/config/login?branch=cs1', { username: 'admin', password: 'sai' })
        .expect(400);
      expect((res.body as Json).message).toBe('Sai tên đăng nhập hoặc mật khẩu Minvoice');
      const view = (await as('admin').get('/einvoice/config?branch=cs1').expect(200)).body as Json;
      expect(view).toMatchObject({ needsLogin: true, username: null, configured: false });
    });

    it('logs in, lists the symbols of the year and fills the seller', async () => {
      await as('admin')
        .post('/einvoice/config/login?branch=cs1', { username: 'admin', password: fake.password })
        .expect(200);
      const { symbols } = (await as('admin').get('/einvoice/config/symbols?branch=cs1').expect(200))
        .body as { symbols: Json[] };
      expect(symbols.map((s) => s.symbolCode)).toEqual([fake.symbolCode()]);
      const view = (
        await as('admin')
          .put('/einvoice/config/symbol?branch=cs1', { registerInvoiceId: symbols[0].registerInvoiceId })
          .expect(200)
      ).body as Json;
      expect(view).toMatchObject({
        branchTaxCode: TAX_CODE,
        username: 'admin',
        symbolCode: fake.symbolCode(),
        registerInvoiceId: 'range-1',
        sellerName: 'CÔNG TY TNHH KARAOKE THỬ NGHIỆM',
        needsLogin: false,
        configured: true,
        minInvoiceDate: null,
      });
      noSecrets(view);
      noSecrets((await as('tn1_cs1').get('/einvoice/config').expect(200)).body);
    });

    it('logs in again by itself when the session expired', async () => {
      fake.expireSessions();
      const logins = fake.logins;
      await as('admin').get('/einvoice/config/symbols?branch=cs1').expect(200);
      expect(fake.logins).toBe(logins + 1);
    });

    it('checks a buyer tax code before looking it up', async () => {
      await as('tn1_cs1').get('/einvoice/tax-payers/12345').expect(400);
      await as('hdqt_hddt').get('/einvoice/tax-payers/0107068321').expect(403);
    });
  });
});
```

Run: `cd 502-backend && docker start kara502-pg && npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts`
Expected: FAIL, các route `/einvoice/*` trả 404.

- [ ] **Step 4: DTO cấu hình**

`502-backend/src/einvoice/dto/config.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class EinvoiceBranchQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class SymbolsQuery extends EinvoiceBranchQuery {
  @ApiProperty({ required: false, description: 'Năm 4 chữ số; mặc định năm nay' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

export class MinvoiceLoginDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class SelectSymbolDto {
  @ApiProperty({ description: 'registerInvoiceId của ký hiệu chọn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  registerInvoiceId: string;
}
```

- [ ] **Step 5: `einvoice-config.service.ts`**

```ts
import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import { LoginThrottle } from '../auth/login-throttle';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { fromDbDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './einvoice-secret';
import type { SellerProfile } from './einvoice-types';
import { MinvoiceClient, type InvoiceSymbol, type MinvoiceSession } from './minvoice/minvoice-client';
import { MinvoiceHttpError, MinvoiceLoginError } from './minvoice/minvoice-errors';
import { MinvoiceLoginDto, SelectSymbolDto } from './dto/config.dto';

// What the page may know about the Minvoice account of a branch: never the
// password, the cookie or the token (spec 2026-10-01 §7.1).
export interface EinvoiceConfigView {
  branchTaxCode: string | null;
  username: string | null;
  symbolCode: string | null;
  registerInvoiceId: string | null;
  sellerName: string | null;
  loginError: string | null;
  // Date of the newest issued invoice of the symbol: the lowest date allowed.
  minInvoiceDate: string | null;
  latestInvoiceNumber: number | null;
  needsLogin: boolean;
  configured: boolean;
}

// Everything an issue needs, decrypted (spec §8).
export interface IssueConfig {
  branchId: number;
  taxCode: string;
  symbolCode: string;
  registerInvoiceId: string;
  currencyId: string;
  seller: SellerProfile;
  session: MinvoiceSession | null;
}

// Minvoice (or the network to it) failed. 424, not 502: Cloudflare replaces an
// origin's 502 page with its own and the message would be lost.
export const minvoiceUnavailable = (error: unknown) =>
  new HttpException(
    `Không kết nối được Minvoice: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
    HttpStatus.FAILED_DEPENDENCY,
  );

const NO_TAX_CODE = 'Cơ sở chưa có mã số thuế. Nhập ở trang Cơ sở trước.';
const PASSWORD_CHANGED = 'Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại';
const PASSWORD_UNREADABLE =
  'Không đọc được mật khẩu Minvoice đã lưu (khóa EINVOICE_SECRET đã đổi?), quản lý hệ thống cần đăng nhập lại';

function parseSession(text: string | null): MinvoiceSession | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<MinvoiceSession>;
    return typeof value.cookie === 'string' &&
      typeof value.token === 'string' &&
      typeof value.userName === 'string'
      ? (value as MinvoiceSession)
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class EinvoiceConfigService {
  // Five wrong Minvoice passwords in 15 minutes lock the branch's login for
  // 15 minutes, before Minvoice locks the account itself.
  private throttle = new LoginThrottle();
  // One re-login per branch at a time; at most one entry per branch.
  private relogins = new Map<number, Promise<MinvoiceSession>>();

  constructor(
    private prisma: PrismaService,
    private scope: BranchScopeService,
    private client: MinvoiceClient,
  ) {}

  async view(user: AuthUser, branchCode?: string): Promise<EinvoiceConfigView> {
    return this.viewOf(await this.scope.resolveBranchId(user, branchCode));
  }

  async viewOf(branchId: number): Promise<EinvoiceConfigView> {
    const [branch, config] = await Promise.all([
      this.prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { taxCode: true } }),
      this.prisma.einvoiceConfig.findUnique({ where: { branchId } }),
    ]);
    const needsLogin =
      !config ||
      decryptSecret(config.passwordEnc) === null ||
      config.loginError !== null ||
      config.taxCode !== branch.taxCode;
    // JSON column: cast through unknown (an interface is not a JsonObject).
    const seller = (config?.seller ?? null) as unknown as SellerProfile | null;
    const latest = config?.symbolCode ? await this.latestIssued(config.taxCode, config.symbolCode) : null;
    return {
      branchTaxCode: branch.taxCode,
      username: config?.username ?? null,
      symbolCode: config?.symbolCode ?? null,
      registerInvoiceId: config?.registerInvoiceId ?? null,
      sellerName: seller?.legalName || null,
      loginError: config?.loginError ?? null,
      minInvoiceDate: latest?.invoiceDate ?? null,
      latestInvoiceNumber: latest?.invoiceNumber ?? null,
      needsLogin,
      configured:
        !needsLogin && !!(config?.symbolCode && config.registerInvoiceId && config.currencyId && seller),
    };
  }

  // The newest issued invoice of a tenant + symbol; later invoices may not be
  // dated before it (spec §9.3). Einvoice(sellerTaxCode, symbolCode, invoiceDate).
  async latestIssued(taxCode: string, symbolCode: string) {
    const row = await this.prisma.einvoice.findFirst({
      where: { sellerTaxCode: taxCode, symbolCode, status: EinvoiceStatus.ISSUED, invoiceDate: { not: null } },
      orderBy: { invoiceDate: 'desc' },
      select: { invoiceDate: true, invoiceNumber: true },
    });
    return row?.invoiceDate ? { invoiceDate: fromDbDate(row.invoiceDate), invoiceNumber: row.invoiceNumber } : null;
  }

  async login(user: AuthUser, branchCode: string | undefined, dto: MinvoiceLoginDto) {
    const branchId = await this.scope.resolveBranchId(user, branchCode);
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { taxCode: true } });
    if (!branch.taxCode) throw new BadRequestException(NO_TAX_CODE);
    const key = `einvoice:${branchId}`;
    this.throttle.assertAllowed(key, 'Đăng nhập Minvoice sai');

    const username = dto.username.trim();
    let session: MinvoiceSession;
    try {
      session = await this.client.login(branch.taxCode, username, dto.password);
    } catch (error) {
      if (error instanceof MinvoiceLoginError) {
        if (error.reason === 'password') this.throttle.recordFailure(key);
        throw new BadRequestException(error.message);
      }
      throw minvoiceUnavailable(error);
    }
    this.throttle.recordSuccess(key);

    const previous = await this.prisma.einvoiceConfig.findUnique({ where: { branchId }, select: { taxCode: true } });
    const account = {
      taxCode: branch.taxCode,
      username,
      passwordEnc: encryptSecret(dto.password),
      sessionEnc: encryptSecret(JSON.stringify(session)),
      loginError: null,
      loggedInAt: new Date(),
      updatedById: user.id,
    };
    // Another tenant: the symbol, seller and currency of the old one do not apply.
    const reset =
      previous && previous.taxCode !== branch.taxCode
        ? { symbolCode: null, registerInvoiceId: null, currencyId: null, seller: Prisma.DbNull }
        : {};
    await this.prisma.einvoiceConfig.upsert({
      where: { branchId },
      create: { branchId, ...account },
      update: { ...account, ...reset },
    });
    return this.viewOf(branchId);
  }

  async symbols(user: AuthUser, branchCode: string | undefined, year?: number) {
    const branchId = await this.scope.resolveBranchId(user, branchCode);
    const symbols = await this.withSession(branchId, (taxCode, session) =>
      this.client.listSymbols(taxCode, session, year ?? new Date().getFullYear()),
    );
    return { symbols };
  }

  async selectSymbol(user: AuthUser, branchCode: string | undefined, dto: SelectSymbolDto) {
    const branchId = await this.scope.resolveBranchId(user, branchCode);
    const symbols = await this.withSession(branchId, (taxCode, session) =>
      this.client.listSymbols(taxCode, session),
    );
    const symbol = symbols.find((s) => s.registerInvoiceId === dto.registerInvoiceId);
    if (!symbol) throw new BadRequestException('Ký hiệu không có trong danh sách của tài khoản Minvoice');
    const [seller, currencyId] = await this.withSession(branchId, (taxCode, session) =>
      Promise.all([this.client.getSeller(taxCode, session), this.client.getVndCurrencyId(taxCode, session)]),
    );
    await this.prisma.einvoiceConfig.update({
      where: { branchId },
      data: {
        symbolCode: symbol.symbolCode,
        registerInvoiceId: symbol.registerInvoiceId,
        currencyId,
        seller: seller as unknown as Prisma.InputJsonObject,
        updatedById: user.id,
      },
    });
    return this.viewOf(branchId);
  }

  async readyForIssue(branchId: number): Promise<IssueConfig> {
    const config = await this.account(branchId);
    const seller = config.seller as unknown as SellerProfile | null;
    if (!config.symbolCode || !config.registerInvoiceId || !config.currencyId || !seller) {
      throw new BadRequestException('Chưa chọn ký hiệu hóa đơn cho cơ sở này');
    }
    if (decryptSecret(config.passwordEnc) === null) throw new BadRequestException(PASSWORD_UNREADABLE);
    return {
      branchId,
      taxCode: config.taxCode,
      symbolCode: config.symbolCode,
      registerInvoiceId: config.registerInvoiceId,
      currencyId: config.currencyId,
      seller,
      session: parseSession(decryptSecret(config.sessionEnc)),
    };
  }

  // The current range of the same symbol after a re-login (the user's rule,
  // spec §9.1); stored so the next issue starts from it.
  async refreshRange(config: IssueConfig, session: MinvoiceSession): Promise<IssueConfig> {
    let symbols: InvoiceSymbol[];
    try {
      symbols = await this.client.listSymbols(config.taxCode, session);
    } catch (error) {
      throw minvoiceUnavailable(error);
    }
    const symbol = symbols.find((s) => s.symbolCode === config.symbolCode);
    if (!symbol) {
      throw new BadRequestException(`Ký hiệu ${config.symbolCode} không còn dùng được, chọn ký hiệu khác`);
    }
    if (symbol.registerInvoiceId !== config.registerInvoiceId) {
      await this.prisma.einvoiceConfig.update({
        where: { branchId: config.branchId },
        data: { registerInvoiceId: symbol.registerInvoiceId },
      });
    }
    return { ...config, registerInvoiceId: symbol.registerInvoiceId, session };
  }

  // Logs the branch in again with the stored password, one at a time per branch.
  relogin(branchId: number): Promise<MinvoiceSession> {
    const running = this.relogins.get(branchId);
    if (running) return running;
    const promise = this.loginAgain(branchId).finally(() => this.relogins.delete(branchId));
    this.relogins.set(branchId, promise);
    return promise;
  }

  // Runs a read with the stored session, logging in again once when Minvoice
  // refuses it (reads are safe to repeat).
  private async withSession<T>(
    branchId: number,
    read: (taxCode: string, session: MinvoiceSession) => Promise<T>,
  ): Promise<T> {
    const config = await this.account(branchId);
    const stored = parseSession(decryptSecret(config.sessionEnc));
    if (stored) {
      try {
        return await read(config.taxCode, stored);
      } catch (error) {
        if (!(error instanceof MinvoiceHttpError)) throw minvoiceUnavailable(error);
      }
    }
    const fresh = await this.relogin(branchId);
    try {
      return await read(config.taxCode, fresh);
    } catch (error) {
      throw minvoiceUnavailable(error);
    }
  }

  private async loginAgain(branchId: number): Promise<MinvoiceSession> {
    const config = await this.account(branchId);
    const password = decryptSecret(config.passwordEnc);
    if (password === null) throw new BadRequestException(PASSWORD_UNREADABLE);
    try {
      const session = await this.client.login(config.taxCode, config.username, password);
      await this.prisma.einvoiceConfig.update({
        where: { branchId },
        data: { sessionEnc: encryptSecret(JSON.stringify(session)), loginError: null, loggedInAt: new Date() },
      });
      return session;
    } catch (error) {
      if (error instanceof MinvoiceLoginError) {
        const message = error.reason === 'password' ? PASSWORD_CHANGED : error.message;
        await this.prisma.einvoiceConfig.update({
          where: { branchId },
          data: { loginError: message, sessionEnc: null },
        });
        throw new BadRequestException(message);
      }
      throw minvoiceUnavailable(error);
    }
  }

  // The branch's config when it may talk to Minvoice at all.
  private async account(branchId: number) {
    const [branch, config] = await Promise.all([
      this.prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { taxCode: true } }),
      this.prisma.einvoiceConfig.findUnique({ where: { branchId } }),
    ]);
    if (!branch.taxCode) throw new BadRequestException(NO_TAX_CODE);
    if (!config) throw new BadRequestException('Chưa đăng nhập Minvoice cho cơ sở này');
    if (config.taxCode !== branch.taxCode) {
      throw new BadRequestException('MST của cơ sở đã đổi, quản lý hệ thống cần đăng nhập Minvoice lại');
    }
    if (config.loginError) throw new BadRequestException(config.loginError);
    return config;
  }
}
```

- [ ] **Step 6: Controller và module**

`502-backend/src/einvoice/einvoice-config.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CHAIN_ONLY, EINVOICE_READERS, EINVOICE_WRITERS } from '../auth/roles';
import { EinvoiceBranchQuery, MinvoiceLoginDto, SelectSymbolDto, SymbolsQuery } from './dto/config.dto';
import { EinvoiceConfigService } from './einvoice-config.service';
import { TaxPayerService } from './tax-payer.service';

@ApiTags('einvoice')
@ApiBearerAuth()
@Controller('einvoice')
export class EinvoiceConfigController {
  constructor(
    private readonly config: EinvoiceConfigService,
    private readonly taxPayers: TaxPayerService,
  ) {}

  @Get('config')
  @Roles(...EINVOICE_READERS)
  view(@CurrentUser() user: AuthUser, @Query() query: EinvoiceBranchQuery) {
    return this.config.view(user, query.branch);
  }

  @Post('config/login')
  @HttpCode(200)
  @Roles(...CHAIN_ONLY)
  login(@CurrentUser() user: AuthUser, @Query() query: EinvoiceBranchQuery, @Body() dto: MinvoiceLoginDto) {
    return this.config.login(user, query.branch, dto);
  }

  @Get('config/symbols')
  @Roles(...CHAIN_ONLY)
  symbols(@CurrentUser() user: AuthUser, @Query() query: SymbolsQuery) {
    return this.config.symbols(user, query.branch, query.year);
  }

  @Put('config/symbol')
  @Roles(...CHAIN_ONLY)
  selectSymbol(@CurrentUser() user: AuthUser, @Query() query: EinvoiceBranchQuery, @Body() dto: SelectSymbolDto) {
    return this.config.selectSymbol(user, query.branch, dto);
  }

  @Get('tax-payers/:taxCode')
  @Roles(...EINVOICE_WRITERS)
  taxPayer(@Param('taxCode') taxCode: string) {
    return this.taxPayers.lookup(taxCode);
  }
}
```

`502-backend/src/einvoice/einvoice.module.ts`:

```ts
import { Module, OnModuleInit } from '@nestjs/common';
import { EinvoiceConfigController } from './einvoice-config.controller';
import { EinvoiceConfigService } from './einvoice-config.service';
import { assertEinvoiceSecret } from './einvoice-secret';
import { MinvoiceClient } from './minvoice/minvoice-client';
import { TaxPayerService } from './tax-payer.service';

// Hóa đơn điện tử through Minvoice (spec 2026-10-01).
@Module({
  controllers: [EinvoiceConfigController],
  providers: [MinvoiceClient, TaxPayerService, EinvoiceConfigService],
})
export class EinvoiceModule implements OnModuleInit {
  // Production refuses to start without a valid EINVOICE_SECRET (spec §11).
  onModuleInit() {
    assertEinvoiceSecret();
  }
}
```

`502-backend/src/app.module.ts`: thêm `import { EinvoiceModule } from './einvoice/einvoice.module';` và `EinvoiceModule,` ngay sau `DiscountsModule,` trong `imports`.

- [ ] **Step 7: Chạy e2e**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts`
Expected: PASS (6 test trong `config`).

- [ ] **Step 8: Lint, build, commit**

```bash
cd 502-backend && npm run lint && npm run build && npx jest src/einvoice
git add 502-backend/src/auth/roles.ts 502-backend/src/einvoice 502-backend/src/app.module.ts \
  502-backend/test/fake-minvoice.ts 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): đăng nhập Minvoice, chọn ký hiệu và người bán theo cơ sở

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Nháp hóa đơn, danh sách, bill và số hóa đơn điện tử trong bill sheet

Spec §4.1, §7.3 (trừ issue/resolve/number), §10.4 (`_count`), §13.

**Files:**
- Create: `502-backend/src/einvoice/dto/einvoice.dto.ts`
- Create: `502-backend/src/einvoice/einvoice-select.ts`
- Create: `502-backend/src/einvoice/einvoice-draft.ts`, `einvoice-draft.spec.ts`
- Create: `502-backend/src/einvoice/einvoices.service.ts`, `einvoices.controller.ts`
- Modify: `502-backend/src/einvoice/einvoice.module.ts`
- Modify: `502-backend/src/orders/orders.service.ts` (`findOne`)
- Modify: `502-backend/test/einvoice.e2e-spec.ts` (thêm `describe('drafts')`)

**Interfaces:**
- Consumes: `totalsOf` (Task 3), `EinvoiceLine`, `EinvoiceDraft`, `VAT_RATES`, `BUYER_TAX_CODE_RE` (Task 3), `toDbDate`, `fromDbDate` (Task 1), `billNumberPrefixRange` (`orders/bill-number.ts`), `billedHoursOf` (`orders/billing.ts`), `staffRef` (`orders/order-include.ts`), `withTotalCount`.
- Produces:
  - DTO:
    - `EinvoiceLineDto`, `EinvoiceDraftDto {amount, buyerTaxCode?, buyerName?, buyerAddress?, buyerEmail?, lines}`, `CreateEinvoiceDto extends EinvoiceDraftDto {orderId}`;
    - `EinvoiceListQuery {branch?, status?: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED', from?, to?, billNumber?}`, `EinvoiceBillsQuery {branch?, businessDate?, billNumber?}`;
    - `IssueEinvoiceDto`, `ResolveEinvoiceDto`, `EinvoiceNumberDto` (dùng ở Task 9).
  - `einvoiceListSelect`, `einvoiceDetailSelect`, `toEinvoiceRow(row)` (đổi `invoiceDate` thành `YYYY-MM-DD`).
  - `parseDraft(value: Prisma.JsonValue | null): EinvoiceDraft`.
  - `class EinvoicesService`: `list`, `summary`, `bills`, `billDetail`, `findOne`, `create`, `update`, `remove`.
  - Response `GET /orders/:id` thêm `_count: {einvoices: number}` và `einvoices: {id}[]` (chỉ hóa đơn đã xuất).

- [ ] **Step 1: Test `parseDraft`**

`502-backend/src/einvoice/einvoice-draft.spec.ts`:

```ts
import { parseDraft } from './einvoice-draft';

const line = { name: 'Bia', unit: 'Lon', quantity: 2, unitPrice: 35000, vatRate: 10 };

describe('parseDraft', () => {
  it('reads a stored draft', () => {
    expect(parseDraft({ buyerAddress: 'HN', buyerEmail: null, lines: [line] })).toEqual({
      buyerAddress: 'HN',
      buyerEmail: null,
      lines: [line],
    });
  });

  it('refuses what the DTO would refuse', () => {
    expect(() => parseDraft(null)).toThrow('Hóa đơn không có nội dung nháp');
    expect(() => parseDraft({ lines: [{ ...line, vatRate: 7 }] })).toThrow(/không hợp lệ/);
    expect(() => parseDraft({ lines: [{ ...line, unitPrice: 1.5 }] })).toThrow(/không hợp lệ/);
    expect(() => parseDraft({ lines: [{ ...line, name: '' }] })).toThrow(/không hợp lệ/);
  });
});
```

- [ ] **Step 2: `einvoice-draft.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EinvoiceDraft, EinvoiceLine, VAT_RATES } from './einvoice-types';

// Einvoice.draft read back through the rules of EinvoiceLineDto, so JSON of a
// wrong shape never reaches a Minvoice payload (spec §4.1).
export function parseDraft(value: Prisma.JsonValue | null): EinvoiceDraft {
  const draft = value as unknown as Partial<EinvoiceDraft> | null;
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.lines)) {
    throw new BadRequestException('Hóa đơn không có nội dung nháp');
  }
  if (!draft.lines.every(isLine)) {
    throw new BadRequestException('Nội dung nháp không hợp lệ, hãy sửa và lưu lại hóa đơn');
  }
  return {
    buyerAddress: typeof draft.buyerAddress === 'string' ? draft.buyerAddress : null,
    buyerEmail: typeof draft.buyerEmail === 'string' ? draft.buyerEmail : null,
    lines: draft.lines,
  };
}

function isLine(value: unknown): value is EinvoiceLine {
  const line = value as EinvoiceLine;
  return (
    typeof line?.name === 'string' &&
    line.name.length > 0 &&
    line.name.length <= 300 &&
    typeof line.unit === 'string' &&
    line.unit.length <= 30 &&
    typeof line.quantity === 'number' &&
    line.quantity > 0 &&
    Number.isInteger(line.unitPrice) &&
    line.unitPrice >= 0 &&
    (VAT_RATES as readonly number[]).includes(line.vatRate) &&
    (line.vatAmount === undefined || (Number.isInteger(line.vatAmount) && line.vatAmount >= 0))
  );
}
```

Run: `npx jest src/einvoice/einvoice-draft.spec.ts`
Expected: PASS.

- [ ] **Step 3: DTO**

`502-backend/src/einvoice/dto/einvoice.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BUYER_TAX_CODE_RE, VAT_RATES, type VatRate } from '../einvoice-types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải có dạng YYYY-MM-DD';
const BILL_NUMBER_RE = /^\d{1,15}$/;

export class EinvoiceLineDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name: string;

  @ApiProperty({ maxLength: 30 })
  @IsString()
  @MaxLength(30)
  unit: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1_000_000)
  quantity: number;

  @ApiProperty({ description: 'Đơn giá trước VAT, đồng' })
  @IsInt()
  @Min(0)
  @Max(100_000_000_000)
  unitPrice: number;

  @ApiProperty({ enum: VAT_RATES })
  @IsIn(VAT_RATES)
  vatRate: VatRate;

  @ApiProperty({ required: false, description: 'Chỉ dòng bù: tiền thuế lệch tối đa 1 đồng' })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatAmount?: number;
}

// The whole draft: PATCH replaces it (like the items of an order).
export class EinvoiceDraftDto {
  @ApiProperty({ description: 'Số tiền đã gồm VAT, đồng' })
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  amount: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((dto: EinvoiceDraftDto) => !!dto.buyerTaxCode)
  @Matches(BUYER_TAX_CODE_RE, { message: 'MST người mua phải có 10 số, 10 số kèm -3 số, hoặc 12 số' })
  buyerTaxCode?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  buyerName?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 400 })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  buyerAddress?: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 200 })
  @IsOptional()
  @ValidateIf((dto: EinvoiceDraftDto) => !!dto.buyerEmail)
  @IsEmail({}, { message: 'Email người mua không hợp lệ' })
  @MaxLength(200)
  buyerEmail?: string | null;

  @ApiProperty({ type: [EinvoiceLineDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EinvoiceLineDto)
  lines: EinvoiceLineDto[];
}

export class CreateEinvoiceDto extends EinvoiceDraftDto {
  @ApiProperty({ description: 'Bill đã thanh toán' })
  @IsInt()
  orderId: number;
}

export class EinvoiceListQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false, enum: ['DRAFT', 'ERROR', 'UNCERTAIN', 'ISSUED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'ERROR', 'UNCERTAIN', 'ISSUED'])
  status?: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED';

  @ApiProperty({ required: false, description: 'Từ ngày kinh doanh của bill' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from?: string;

  @ApiProperty({ required: false, description: 'Đến ngày kinh doanh của bill' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to?: string;

  @ApiProperty({ required: false, description: 'Tìm theo đầu số bill, mọi ngày' })
  @IsOptional()
  @Matches(BILL_NUMBER_RE, { message: 'Số bill chỉ gồm chữ số' })
  billNumber?: string;
}

export class EinvoiceBillsQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false, description: 'Ngày kinh doanh; mặc định hôm nay' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  businessDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(BILL_NUMBER_RE, { message: 'Số bill chỉ gồm chữ số' })
  billNumber?: string;
}

export class IssueEinvoiceDto {
  @ApiProperty({ description: 'Ngày hóa đơn YYYY-MM-DD' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  invoiceDate: string;

  @ApiProperty({ required: false, description: 'Bắt buộc khi ngày hóa đơn sau hôm nay' })
  @IsOptional()
  @IsBoolean()
  confirmFutureDate?: boolean;
}

export class ResolveEinvoiceDto {
  @ApiProperty({ description: 'true: hóa đơn đã có trên Minvoice' })
  @IsBoolean()
  found: boolean;

  @ApiProperty({ required: false, description: 'Số hóa đơn trên Minvoice, khi found' })
  @ValidateIf((dto: ResolveEinvoiceDto) => dto.found)
  @IsInt()
  @Min(1)
  invoiceNumber?: number;
}

export class EinvoiceNumberDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  invoiceNumber: number;
}
```

- [ ] **Step 4: `einvoice-select.ts`**

```ts
import { Prisma } from '@prisma/client';
import { fromDbDate } from '../common/dates';
import { staffRef } from '../orders/order-include';

// Only what the list shows: it returns up to 500 invoices.
export const einvoiceListSelect = {
  id: true,
  branchId: true,
  orderId: true,
  status: true,
  amount: true,
  vatAmount: true,
  buyerTaxCode: true,
  buyerName: true,
  symbolCode: true,
  invoiceDate: true,
  invoiceNumber: true,
  lastError: true,
  createdAt: true,
  issuedAt: true,
  createdBy: staffRef,
  issuedBy: staffRef,
  order: {
    select: {
      id: true,
      billNumber: true,
      finalAmount: true,
      endTime: true,
      cancelledAt: true,
      editedAt: true,
      room: { select: { name: true } },
    },
  },
} satisfies Prisma.EinvoiceSelect;

// One invoice as the panel shows it: the list fields plus its draft.
export const einvoiceDetailSelect = {
  ...einvoiceListSelect,
  draft: true,
  sellerTaxCode: true,
  minvoiceId: true,
  updatedAt: true,
  updatedBy: staffRef,
  numberEditedAt: true,
  numberEditedBy: staffRef,
} satisfies Prisma.EinvoiceSelect;

// invoiceDate is a @db.Date: sent as YYYY-MM-DD.
export function toEinvoiceRow<T extends { invoiceDate: Date | null }>(row: T) {
  return { ...row, invoiceDate: row.invoiceDate ? fromDbDate(row.invoiceDate) : null };
}
```

- [ ] **Step 5: E2E nháp (sẽ fail)**

Trong `502-backend/test/einvoice.e2e-spec.ts`, thêm `let orderId: number;` và `let draftId: number;` ngay dưới `let cs1Id: number;` (các task sau dùng chung), rồi thêm sau khối `describe('config', …)`:

```ts
  describe('drafts', () => {
    const buyer = {
      buyerTaxCode: '0107068321',
      buyerName: 'CÔNG TY HOÀNG GIA',
      buyerAddress: 'Số 26, phố Nhổn',
      buyerEmail: '',
    };
    const beer = { name: 'Bia Heineken', unit: 'Lon', quantity: 10, unitPrice: 35000, vatRate: 10 };
    const filler = { name: 'Dịch vụ karaoke', unit: 'Lần', quantity: 1, unitPrice: 559091, vatRate: 10 };

    it('are for paid bills only', async () => {
      const room = (await as('ql1_cs1').post('/rooms', { name: 'HĐĐT-1', pricePerHour: 100000 }).expect(201))
        .body as Json;
      const order = (await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201)).body as Json;
      await as('tn1_cs1').post('/einvoices', { orderId: order.id, amount: 1000, lines: [] }).expect(400);
      const products = (await as('tn1_cs1').get('/products').expect(200)).body as Json[];
      await as('tn1_cs1')
        .patch(`/orders/${order.id as number}`, { items: [{ productId: products[0].id, quantity: 2 }] })
        .expect(200);
      await as('tn1_cs1').post(`/orders/${order.id as number}/checkout`, { paymentMethod: 'CASH' }).expect(200);
      orderId = order.id as number;
    });

    it('are created and edited by the sales roles of the branch', async () => {
      const created = (
        await as('tn1_cs1').post('/einvoices', { orderId, amount: 1000000, ...buyer, lines: [beer] }).expect(201)
      ).body as Json;
      expect(created).toMatchObject({
        status: 'DRAFT',
        amount: '1000000',
        vatAmount: '35000',
        buyerName: 'CÔNG TY HOÀNG GIA',
        draft: { buyerAddress: 'Số 26, phố Nhổn', buyerEmail: null, lines: [beer] },
      });
      draftId = created.id as number;
      const edited = (
        await as('ql1_cs1')
          .patch(`/einvoices/${draftId}`, { amount: 1000000, ...buyer, lines: [beer, filler] })
          .expect(200)
      ).body as Json;
      expect(edited.vatAmount).toBe('90909');

      await as('hdqt_hddt').post('/einvoices', { orderId, amount: 1, lines: [] }).expect(403);
      await as('ql1_cs2').get(`/einvoices/bill/${orderId}`).expect(403);
      await as('ql1_cs2').patch(`/einvoices/${draftId}`, { amount: 1, lines: [] }).expect(403);
      await as('tn1_cs1')
        .post('/einvoices', { orderId, amount: 1, lines: [{ ...beer, vatRate: 7 }] })
        .expect(400);
      await as('tn1_cs1')
        .post('/einvoices', { orderId, amount: 1, buyerTaxCode: '123', lines: [] })
        .expect(400);
    });

    it('shows a bill with its invoices and how much is split', async () => {
      const detail = (await as('tn1_cs1').get(`/einvoices/bill/${orderId}`).expect(200)).body as Json;
      expect(detail.allocated).toBe(1000000);
      expect((detail.einvoices as Json[]).map((e) => e.id)).toEqual([draftId]);
      expect((detail.order as Json).items).toHaveLength(1);
      const res = await as('tn1_cs1').get('/einvoices/bills').expect(200);
      expect(res.headers['x-total-count']).toBeDefined();
      expect((res.body as Json[]).find((b) => b.orderId === orderId)).toMatchObject({
        allocated: 1000000,
        einvoiceCount: 1,
      });
    });

    it('lists drafts whatever their day, and counts them', async () => {
      const drafts = (await as('hdqt_hddt').get('/einvoices?branch=cs1&status=DRAFT').expect(200)).body as Json[];
      expect(drafts.map((d) => d.id)).toContain(draftId);
      const old = (await as('tn1_cs1').get('/einvoices?from=2020-01-01&to=2020-01-02').expect(200)).body as Json[];
      expect(old).toHaveLength(0);
      const summary = (await as('tn1_cs1').get('/einvoices/summary?from=2020-01-01&to=2020-01-02').expect(200))
        .body as Json;
      expect(summary).toMatchObject({
        draftCount: 1,
        errorCount: 0,
        uncertainCount: 0,
        issuedCount: 0,
        issuedAmount: 0,
      });
    });

    it('deletes a draft', async () => {
      const extra = (await as('tn1_cs1').post('/einvoices', { orderId, amount: 5000, lines: [] }).expect(201))
        .body as Json;
      await as('tn1_cs1').delete(`/einvoices/${extra.id as number}`).expect(200);
      await as('tn1_cs1').delete(`/einvoices/${extra.id as number}`).expect(404);
    });

    it('tells the bill sheet how many e-invoices a bill has', async () => {
      const order = (await as('admin').get(`/orders/${orderId}`).expect(200)).body as Json;
      expect(order._count).toEqual({ einvoices: 1 });
      expect(order.einvoices).toEqual([]);
    });
  });
```

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts`
Expected: FAIL, `/einvoices` trả 404.

- [ ] **Step 6: `einvoices.service.ts` (phần nháp)**

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EinvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf, toDbDate } from '../common/dates';
import { billNumberPrefixRange } from '../orders/bill-number';
import { billedHoursOf } from '../orders/billing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { CreateEinvoiceDto, EinvoiceBillsQuery, EinvoiceDraftDto, EinvoiceListQuery } from './dto/einvoice.dto';
import { totalsOf } from './einvoice-math';
import { einvoiceDetailSelect, einvoiceListSelect, toEinvoiceRow } from './einvoice-select';
import type { EinvoiceDraft, EinvoiceLine } from './einvoice-types';

const clean = (value: string | null | undefined) => value?.trim() || null;

// The columns a saved draft writes (spec §4.1): the details go in `draft`.
function draftData(dto: EinvoiceDraftDto) {
  const lines: EinvoiceLine[] = dto.lines.map((line) => ({
    name: line.name.trim(),
    unit: line.unit.trim(),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    ...(line.vatAmount === undefined ? {} : { vatAmount: line.vatAmount }),
  }));
  const draft: EinvoiceDraft = {
    buyerAddress: clean(dto.buyerAddress),
    buyerEmail: clean(dto.buyerEmail),
    lines,
  };
  return {
    amount: dto.amount,
    vatAmount: totalsOf(lines).vatAmount,
    buyerTaxCode: clean(dto.buyerTaxCode),
    buyerName: clean(dto.buyerName),
    draft: draft as unknown as Prisma.InputJsonObject,
  };
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  if (from && to && from > to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  return { ...(from ? { gte: toDbDate(from) } : {}), ...(to ? { lte: toDbDate(to) } : {}) };
}

@Injectable()
export class EinvoicesService {
  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
    private scope: BranchScopeService,
  ) {}

  // Newest bills first, the newest 500 (spec §7.3).
  async list(user: AuthUser, query: EinvoiceListQuery) {
    const where = await this.listWhere(user, query);
    const [rows, total] = await Promise.all([
      this.prisma.einvoice.findMany({
        where,
        select: einvoiceListSelect,
        orderBy: [{ businessDate: 'desc' }, { orderId: 'desc' }, { id: 'asc' }],
        take: 500,
      }),
      this.prisma.einvoice.count({ where }),
    ]);
    const mapped = rows.map(toEinvoiceRow);
    return [mapped, total] as [typeof mapped, number];
  }

  // Pending work counts every day; issued ones the chosen days. Summed in SQL
  // on the report pool.
  async summary(user: AuthUser, query: EinvoiceListQuery) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const businessDate = dateRange(query.from, query.to);
    const [draftCount, errorCount, uncertainCount, issued] = await Promise.all([
      this.reportDb.einvoice.count({ where: { branchId, status: EinvoiceStatus.DRAFT, lastError: null } }),
      this.reportDb.einvoice.count({
        where: { branchId, status: EinvoiceStatus.DRAFT, lastError: { not: null } },
      }),
      this.reportDb.einvoice.count({ where: { branchId, status: EinvoiceStatus.UNCERTAIN } }),
      this.reportDb.einvoice.aggregate({
        where: { branchId, status: EinvoiceStatus.ISSUED, businessDate },
        _count: { _all: true },
        _sum: { amount: true, vatAmount: true },
      }),
    ]);
    return {
      draftCount,
      errorCount,
      uncertainCount,
      issuedCount: issued._count._all,
      issuedAmount: Number(issued._sum.amount ?? 0),
      issuedVat: Number(issued._sum.vatAmount ?? 0),
    };
  }

  // Paid bills of a business day for the picker, with what is split already.
  async bills(user: AuthUser, query: EinvoiceBillsQuery) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const where: Prisma.OrderWhereInput = { branchId, status: OrderStatus.COMPLETED };
    if (query.billNumber) where.billNumber = billNumberPrefixRange(query.billNumber);
    else where.businessDate = toDbDate(query.businessDate ?? businessDateOf(new Date()));
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: { id: true, billNumber: true, finalAmount: true, endTime: true, room: { select: { name: true } } },
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
      finalAmount: order.finalAmount,
      allocated: Number(byOrder.get(order.id)?._sum.amount ?? 0),
      einvoiceCount: byOrder.get(order.id)?._count._all ?? 0,
    }));
    return [rows, total] as [typeof rows, number];
  }

  // A bill with its e-invoices (and their drafts) for the panel.
  async billDetail(user: AuthUser, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        branchId: true,
        status: true,
        billNumber: true,
        startTime: true,
        endTime: true,
        finalAmount: true,
        taxAmount: true,
        taxPercent: true,
        pricePerHour: true,
        hourlyFee: true,
        discountAmount: true,
        hourlyDiscountAmount: true,
        cancelledAt: true,
        editedAt: true,
        room: { select: { name: true } },
        items: {
          select: { quantity: true, price: true, product: { select: { name: true, unit: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.scope.assertBranchAccess(user, order.branchId);
    if (order.status === OrderStatus.PENDING) throw new BadRequestException('Phòng chưa thanh toán');

    const [einvoices, allocated] = await Promise.all([
      // A bill split into more than 200 invoices is not a real case; the cap
      // keeps the answer bounded.
      this.prisma.einvoice.findMany({
        where: { orderId },
        select: einvoiceDetailSelect,
        orderBy: { id: 'asc' },
        take: 200,
      }),
      this.prisma.einvoice.aggregate({ where: { orderId }, _sum: { amount: true } }),
    ]);
    const minutes =
      order.startTime && order.endTime
        ? Math.max(0, Math.ceil((order.endTime.getTime() - order.startTime.getTime()) / 60_000))
        : 0;
    const { items, ...bill } = order;
    return {
      order: {
        ...bill,
        billedHours: billedHoursOf(minutes),
        items: items.map((item) => ({
          name: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          price: item.price,
        })),
      },
      einvoices: einvoices.map(toEinvoiceRow),
      allocated: Number(allocated._sum.amount ?? 0),
    };
  }

  async findOne(user: AuthUser, id: number) {
    const row = await this.prisma.einvoice.findUnique({ where: { id }, select: einvoiceDetailSelect });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    return toEinvoiceRow(row);
  }

  async create(user: AuthUser, dto: CreateEinvoiceDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, branchId: true, status: true, businessDate: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.scope.assertBranchAccess(user, order.branchId);
    if (order.status !== OrderStatus.COMPLETED || !order.businessDate) {
      throw new BadRequestException('Chỉ tạo hóa đơn điện tử cho bill đã thanh toán và chưa hủy');
    }
    const created = await this.prisma.einvoice.create({
      data: {
        branchId: order.branchId,
        orderId: order.id,
        businessDate: order.businessDate,
        createdById: user.id,
        updatedById: user.id,
        ...draftData(dto),
      },
      select: { id: true },
    });
    return this.findOne(user, created.id);
  }

  async update(user: AuthUser, id: number, dto: EinvoiceDraftDto) {
    await this.assertAccess(user, id);
    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: EinvoiceStatus.DRAFT },
      data: { ...draftData(dto), lastError: null, updatedById: user.id },
    });
    if (count === 0) throw new ConflictException('Chỉ sửa được hóa đơn nháp');
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: number) {
    await this.assertAccess(user, id);
    const { count } = await this.prisma.einvoice.deleteMany({ where: { id, status: EinvoiceStatus.DRAFT } });
    if (count === 0) throw new ConflictException('Chỉ xóa được hóa đơn nháp');
    return { id };
  }

  private async listWhere(user: AuthUser, query: EinvoiceListQuery): Promise<Prisma.EinvoiceWhereInput> {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const where: Prisma.EinvoiceWhereInput = { branchId };
    if (query.status === 'DRAFT') {
      where.status = EinvoiceStatus.DRAFT;
      where.lastError = null;
    } else if (query.status === 'ERROR') {
      where.status = EinvoiceStatus.DRAFT;
      where.lastError = { not: null };
    } else if (query.status) {
      where.status = query.status;
    }
    // Pending work (drafts, errors, uncertain) is listed whatever its day.
    const dated = !query.status || query.status === 'ISSUED';
    if (query.billNumber) {
      where.order = { is: { billNumber: billNumberPrefixRange(query.billNumber) } };
    } else if (dated) {
      where.businessDate = dateRange(query.from, query.to);
    }
    return where;
  }

  private async assertAccess(user: AuthUser, id: number) {
    const row = await this.prisma.einvoice.findUnique({ where: { id }, select: { branchId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
  }
}
```

- [ ] **Step 7: `einvoices.controller.ts` và module**

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth-user';
import { EINVOICE_READERS, EINVOICE_WRITERS } from '../auth/roles';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import { withTotalCount } from '../common/total-count';
import { CreateEinvoiceDto, EinvoiceBillsQuery, EinvoiceDraftDto, EinvoiceListQuery } from './dto/einvoice.dto';
import { EinvoicesService } from './einvoices.service';

@ApiTags('einvoices')
@ApiBearerAuth()
@Controller('einvoices')
export class EinvoicesController {
  constructor(private readonly einvoices: EinvoicesService) {}

  // `summary`, `bills` and `bill/:orderId` are declared before `:id`: Nest
  // matches in declaration order.

  @Get()
  @Roles(...EINVOICE_READERS)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceListQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.einvoices.list(user, query));
  }

  @Get('summary')
  @Roles(...EINVOICE_READERS)
  @UseInterceptors(SharedRequestInterceptor)
  summary(@CurrentUser() user: AuthUser, @Query() query: EinvoiceListQuery) {
    return this.einvoices.summary(user, query);
  }

  @Get('bills')
  @Roles(...EINVOICE_WRITERS)
  bills(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBillsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.einvoices.bills(user, query));
  }

  @Get('bill/:orderId')
  @Roles(...EINVOICE_READERS)
  billDetail(@CurrentUser() user: AuthUser, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.einvoices.billDetail(user, orderId);
  }

  @Get(':id')
  @Roles(...EINVOICE_READERS)
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.einvoices.findOne(user, id);
  }

  @Post()
  @Roles(...EINVOICE_WRITERS)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEinvoiceDto) {
    return this.einvoices.create(user, dto);
  }

  @Patch(':id')
  @Roles(...EINVOICE_WRITERS)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: EinvoiceDraftDto) {
    return this.einvoices.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(...EINVOICE_WRITERS)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.einvoices.remove(user, id);
  }
}
```

Trong `einvoice.module.ts`: thêm `EinvoicesController` vào `controllers` và `EinvoicesService` vào `providers` (kèm import).

- [ ] **Step 8: `GET /orders/:id` báo số hóa đơn điện tử**

Trong `502-backend/src/orders/orders.service.ts`, `findOne` (khoảng dòng 262), thay `include: orderDetailInclude,` bằng:

```ts
      include: {
        ...orderDetailInclude,
        // For the warning of the edit / void dialogs (Einvoice(orderId) index).
        _count: { select: { einvoices: true } },
        einvoices: { where: { status: 'ISSUED' }, select: { id: true }, take: 50 },
      },
```

- [ ] **Step 9: Chạy test**

```bash
cd 502-backend
npx jest src/einvoice src/orders
npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts
```

Expected: PASS hết. `approvals` chứng minh response `/orders/:id` thêm trường vẫn không làm hỏng luồng bán hàng.

- [ ] **Step 10: Lint, commit**

```bash
npm run lint && npm run build
git add 502-backend/src/einvoice 502-backend/src/orders/orders.service.ts 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): nháp hóa đơn điện tử, danh sách, chọn bill, số HĐĐT trong bill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Xuất, đối chiếu "Không rõ", sửa số, dọn lần gửi bị cắt ngang

Spec §7.3 (issue/resolve/number), §8, §9, §9.2 (nhánh không tìm được), §9.3, §9.4, §4.3 (xóa dữ liệu).

**Files:**
- Create: `502-backend/src/einvoice/einvoice-sender.ts`, `einvoice-sender.spec.ts`
- Modify: `502-backend/src/einvoice/einvoices.service.ts`, `einvoices.controller.ts`, `einvoice.module.ts`
- Modify: `502-backend/test/einvoice.e2e-spec.ts` (thêm `describe('issuing')`)

**Interfaces:**
- Consumes:
  - `EinvoiceConfigService.readyForIssue`, `relogin`, `refreshRange`, `latestIssued`, `IssueConfig` (Task 7);
  - `MinvoiceClient.createInvoice` (Task 5), `classifySendError` (Task 5);
  - `buildMinvoicePayload` (Task 4);
  - `issueProblem`, `totalsOf` (Task 3), `parseDraft` (Task 8);
  - `IssueEinvoiceDto`, `ResolveEinvoiceDto`, `EinvoiceNumberDto` (Task 8).
- Produces:
  - `type SendOutcome = {kind: 'issued'; minvoiceId: string; invoiceNumber: number; config: IssueConfig} | {kind: 'failed'; message: string; dateOrder?: boolean} | {kind: 'uncertain'; message: string}`;
  - `class EinvoiceSender {send(ready: IssueConfig, build: (config: IssueConfig) => Record<string, unknown>): Promise<SendOutcome>}`;
  - `EinvoicesService.issue(user, id, dto)`, `resolve(user, id, dto)`, `editNumber(user, id, dto)`, `onApplicationBootstrap()`.

- [ ] **Step 1: Test quy tắc gửi lại**

`502-backend/src/einvoice/einvoice-sender.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { IssueConfig } from './einvoice-config.service';
import { EinvoiceSender } from './einvoice-sender';
import { MinvoiceHttpError, MinvoiceNetworkError } from './minvoice/minvoice-errors';

const session = { cookie: 'c', token: 't', userName: 'admin' };
const ready: IssueConfig = {
  branchId: 1,
  taxCode: '0107811836',
  symbolCode: '1C26MTT',
  registerInvoiceId: 'range-1',
  currencyId: 'vnd-id',
  seller: {} as IssueConfig['seller'],
  session,
};
const build = (config: IssueConfig) => ({ registerInvoiceId: config.registerInvoiceId });
const refused = () => new MinvoiceHttpError(401, '{}', 'Minvoice trả lỗi HTTP 401');
const ok = (invoiceNumber: number) => ({ id: `inv-${invoiceNumber}`, invoiceNumber });

function setup(results: Array<{ id: string; invoiceNumber: number } | Error>) {
  const client = {
    createInvoice: jest.fn(async (...args: unknown[]) => {
      void args;
      const next = results.shift()!;
      if (next instanceof Error) throw next;
      return next;
    }),
  };
  const config = {
    relogin: jest.fn(async () => ({ ...session, token: 'fresh' })),
    refreshRange: jest.fn(async (c: IssueConfig, s: typeof session) => ({
      ...c,
      registerInvoiceId: 'range-2',
      session: s,
    })),
  };
  return { sender: new EinvoiceSender(client as never, config as never), client, config };
}

describe('EinvoiceSender (spec §9.1)', () => {
  it('issues on the first try without logging in', async () => {
    const { sender, config } = setup([ok(5)]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({ kind: 'issued', invoiceNumber: 5 });
    expect(config.relogin).not.toHaveBeenCalled();
  });

  it('logs in first when no session is stored', async () => {
    const { sender, config } = setup([ok(5)]);
    await sender.send({ ...ready, session: null }, build);
    expect(config.relogin).toHaveBeenCalledTimes(1);
  });

  it('logs in again, takes the new range and resends once', async () => {
    const { sender, client, config } = setup([refused(), ok(6)]);
    const outcome = await sender.send(ready, build);
    expect(outcome).toMatchObject({ kind: 'issued', invoiceNumber: 6, config: { registerInvoiceId: 'range-2' } });
    expect(config.relogin).toHaveBeenCalledTimes(1);
    expect(config.refreshRange).toHaveBeenCalledTimes(1);
    expect(client.createInvoice.mock.calls.map((call) => call[2])).toEqual([
      { registerInvoiceId: 'range-1' },
      { registerInvoiceId: 'range-2' },
    ]);
  });

  it('gives up after the second refusal', async () => {
    const { sender, client } = setup([refused(), refused()]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({ kind: 'failed' });
    expect(client.createInvoice).toHaveBeenCalledTimes(2);
  });

  it('resends when the request never left', async () => {
    const { sender } = setup([new MinvoiceNetworkError(false, 'ECONNREFUSED'), ok(7)]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({ kind: 'issued', invoiceNumber: 7 });
  });

  it('never resends what may have been created', async () => {
    const { sender, client, config } = setup([new MinvoiceNetworkError(true, 'timeout')]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({ kind: 'uncertain' });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
    expect(config.relogin).not.toHaveBeenCalled();
  });

  it('never resends a date refused for its order', async () => {
    const dateRefused = new MinvoiceHttpError(
      400,
      JSON.stringify({ error: { message: 'Ngày hóa đơn nhỏ hơn ngày hóa đơn mới nhất' } }),
      'Minvoice trả lỗi HTTP 400',
    );
    const { sender, client } = setup([dateRefused]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({ kind: 'failed', dateOrder: true });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('stops when the stored password is refused on the re-login', async () => {
    const { sender, config } = setup([refused()]);
    config.relogin.mockRejectedValueOnce(
      new BadRequestException('Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại'),
    );
    await expect(sender.send(ready, build)).resolves.toEqual({
      kind: 'failed',
      message: 'Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại',
    });
  });
});
```

Run: `npx jest src/einvoice/einvoice-sender.spec.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 2: `einvoice-sender.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { EinvoiceConfigService, type IssueConfig } from './einvoice-config.service';
import { classifySendError } from './minvoice/classify-send-error';
import { MinvoiceClient, type MinvoiceSession } from './minvoice/minvoice-client';

export type SendOutcome =
  | { kind: 'issued'; minvoiceId: string; invoiceNumber: number; config: IssueConfig }
  | { kind: 'failed'; message: string; dateOrder?: boolean }
  | { kind: 'uncertain'; message: string };

type Attempt = SendOutcome | { kind: 'retry'; message: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Sends one invoice with the user's rule (spec 2026-10-01 §9.1): when
// Minvoice surely created nothing, log in again for a fresh cookie and token,
// fetch the symbol's current range and resend once. What may have been
// created is never resent.
@Injectable()
export class EinvoiceSender {
  constructor(
    private client: MinvoiceClient,
    private config: EinvoiceConfigService,
  ) {}

  async send(ready: IssueConfig, build: (config: IssueConfig) => Record<string, unknown>): Promise<SendOutcome> {
    let config = ready;
    let session: MinvoiceSession;
    try {
      session = config.session ?? (await this.config.relogin(config.branchId));
    } catch (error) {
      return { kind: 'failed', message: messageOf(error) };
    }

    const first = await this.attempt(config, session, build);
    if (first.kind !== 'retry') return first;

    try {
      session = await this.config.relogin(config.branchId);
      config = await this.config.refreshRange(config, session);
    } catch (error) {
      return { kind: 'failed', message: messageOf(error) };
    }
    const second = await this.attempt(config, session, build);
    return second.kind === 'retry' ? { kind: 'failed', message: second.message } : second;
  }

  private async attempt(
    config: IssueConfig,
    session: MinvoiceSession,
    build: (config: IssueConfig) => Record<string, unknown>,
  ): Promise<Attempt> {
    try {
      const created = await this.client.createInvoice(config.taxCode, session, build(config));
      return { kind: 'issued', minvoiceId: created.id, invoiceNumber: created.invoiceNumber, config };
    } catch (error) {
      const failure = classifySendError(error);
      if (failure.kind === 'date-order') return { kind: 'failed', message: failure.message, dateOrder: true };
      if (failure.kind === 'uncertain') return { kind: 'uncertain', message: failure.message };
      return { kind: 'retry', message: failure.message };
    }
  }
}
```

Trong `einvoice.module.ts`: thêm `EinvoiceSender` vào `providers`.

Run: `npx jest src/einvoice/einvoice-sender.spec.ts`
Expected: PASS (8 test).

- [ ] **Step 3: E2E xuất hóa đơn (sẽ fail)**

Trong `502-backend/test/einvoice.e2e-spec.ts`, thêm các import sau lên đầu file:

```ts
import { PrismaService } from '../src/prisma/prisma.service';
import { EinvoicesService } from '../src/einvoice/einvoices.service';
```

rồi thêm sau khối `describe('drafts', …)`:

```ts
  describe('issuing', () => {
    const today = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const buyer = { buyerTaxCode: '0107068321', buyerName: 'CÔNG TY HOÀNG GIA', buyerAddress: null, buyerEmail: null };
    const filler = (unitPrice: number) => ({ name: 'Dịch vụ karaoke', unit: 'Lần', quantity: 1, unitPrice, vatRate: 10 });
    const newDraft = async (unitPrice = 909091) =>
      (
        (await as('tn1_cs1').post('/einvoices', { orderId, amount: 1000000, ...buyer, lines: [filler(unitPrice)] }).expect(201))
          .body as Json
      ).id as number;
    const issue = (id: number, body: Json = { invoiceDate: today() }) => as('admin').post(`/einvoices/${id}/issue`, body);
    let laterId: number;

    it('is for the chain manager only', async () => {
      for (const name of ['tn1_cs1', 'ql1_cs1', 'hdqt_hddt']) {
        await as(name).post(`/einvoices/${draftId}/issue`, { invoiceDate: today() }).expect(403);
      }
    });

    it('refuses a draft whose lines do not add up', async () => {
      const id = await newDraft(900000);
      expect(((await issue(id).expect(400)).body as Json).message).toBe('Còn thiếu 10.000 đồng');
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('issues: Minvoice number kept, details deleted', async () => {
      const body = (await issue(draftId).expect(200)).body as Json;
      expect(body).toMatchObject({
        status: 'ISSUED',
        invoiceNumber: 1001,
        symbolCode: fake.symbolCode(),
        sellerTaxCode: TAX_CODE,
        invoiceDate: today(),
        draft: null,
        lastError: null,
      });
      noSecrets(body);
      expect(fake.invoices.at(-1)).toMatchObject({
        paymentMethod: 'TM/CK',
        invoiceSerial: fake.symbolCode(),
        registerInvoiceId: 'range-1',
        currencyId: 'vnd-id',
        buyerTaxCode: '0107068321',
        buyerAddress: 'Số 26, phố Nhổn',
        totalAmount: 1000000,
        totalAmountToWord: 'Một triệu đồng',
      });
      await issue(draftId).expect(409);
      await as('tn1_cs1').patch(`/einvoices/${draftId}`, { amount: 1, lines: [] }).expect(409);
      const config = (await as('admin').get('/einvoice/config?branch=cs1').expect(200)).body as Json;
      expect(config).toMatchObject({ minInvoiceDate: today(), latestInvoiceNumber: 1001 });
    });

    it('keeps invoice dates in order and in the year of the symbol', async () => {
      laterId = await newDraft();
      expect(((await issue(laterId, { invoiceDate: '2020-01-01' }).expect(400)).body as Json).message).toMatch(
        /phải từ/,
      );
      const nextYear = `${new Date().getFullYear() + 1}-01-01`;
      expect(((await issue(laterId, { invoiceDate: nextYear }).expect(400)).body as Json).message).toMatch(
        /xác nhận/,
      );
      expect(
        ((await issue(laterId, { invoiceDate: nextYear, confirmFutureDate: true }).expect(400)).body as Json).message,
      ).toMatch(/năm/);
    });

    it('logs in again and takes the new range when Minvoice refuses', async () => {
      fake.expireSessions();
      fake.rangeId = 'range-2';
      const logins = fake.logins;
      const posts = fake.posts;
      const body = (await issue(laterId).expect(200)).body as Json;
      expect(body.status).toBe('ISSUED');
      expect(fake.posts).toBe(posts + 2);
      expect(fake.logins).toBe(logins + 1);
      expect(fake.invoices.at(-1)!.registerInvoiceId).toBe('range-2');
      expect(((await as('admin').get('/einvoice/config?branch=cs1').expect(200)).body as Json).registerInvoiceId).toBe(
        'range-2',
      );
    });

    it('gives up after a second refusal and keeps the draft', async () => {
      const id = await newDraft();
      fake.behaviours = ['reject', 'reject'];
      const posts = fake.posts;
      const body = (await issue(id).expect(200)).body as Json;
      expect(body).toMatchObject({ status: 'DRAFT', symbolCode: null, invoiceDate: null });
      expect(body.lastError).toMatch(/ModelState/);
      expect((body.draft as Json).lines).toHaveLength(1);
      expect(fake.posts).toBe(posts + 2);
      const errors = (await as('tn1_cs1').get('/einvoices?status=ERROR').expect(200)).body as Json[];
      expect(errors.map((e) => e.id)).toContain(id);
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('does not resend a date Minvoice refuses', async () => {
      const id = await newDraft();
      fake.behaviours = ['date-order'];
      const posts = fake.posts;
      const body = (await issue(id).expect(200)).body as Json;
      expect(body.status).toBe('DRAFT');
      expect(body.lastError).toMatch(/Ngày hóa đơn/);
      expect(fake.posts).toBe(posts + 1);
      await as('tn1_cs1').delete(`/einvoices/${id}`).expect(200);
    });

    it('marks a send without an answer as uncertain, then resolves it', async () => {
      const id = await newDraft();
      fake.behaviours = ['drop'];
      const posts = fake.posts;
      expect(((await issue(id).expect(200)).body as Json).status).toBe('UNCERTAIN');
      expect(fake.posts).toBe(posts + 1);
      await issue(id).expect(409);
      await as('tn1_cs1').post(`/einvoices/${id}/resolve`, { found: false }).expect(403);
      const back = (await as('admin').post(`/einvoices/${id}/resolve`, { found: false }).expect(200)).body as Json;
      expect(back).toMatchObject({ status: 'DRAFT', symbolCode: null, invoiceDate: null });
      fake.behaviours = ['drop'];
      await issue(id).expect(200);
      const found = (
        await as('admin').post(`/einvoices/${id}/resolve`, { found: true, invoiceNumber: 1500 }).expect(200)
      ).body as Json;
      expect(found).toMatchObject({ status: 'ISSUED', invoiceNumber: 1500, draft: null, invoiceDate: today() });
    });

    it('lets one of two simultaneous issues win', async () => {
      const id = await newDraft();
      fake.delayMs = 300;
      const [a, b] = await Promise.all([issue(id), issue(id)]);
      fake.delayMs = 0;
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('edits the number of an issued invoice, never to a taken one', async () => {
      await as('tn1_cs1').patch(`/einvoices/${draftId}/number`, { invoiceNumber: 2001 }).expect(403);
      await as('admin').patch(`/einvoices/${draftId}/number`, { invoiceNumber: 1500 }).expect(409);
      const edited = (await as('admin').patch(`/einvoices/${draftId}/number`, { invoiceNumber: 2001 }).expect(200))
        .body as Json;
      expect(edited.invoiceNumber).toBe(2001);
      expect(edited.numberEditedAt).not.toBeNull();
    });

    it('turns a send cut off by a restart into uncertain', async () => {
      const id = await newDraft();
      await app.get(PrismaService).einvoice.update({ where: { id }, data: { status: 'SENDING' } });
      await app.get(EinvoicesService).onApplicationBootstrap();
      expect(((await as('admin').get(`/einvoices/${id}`).expect(200)).body as Json).status).toBe('UNCERTAIN');
    });

    it('is wiped with the data of its branch', async () => {
      const res = await as('hdqt_hddt')
        .post('/admin/purge', { scope: 'branch', branch: 'cs1', password: '12345678' })
        .expect(200);
      expect(((res.body as Json).deleted as Record<string, number>).einvoices).toBeGreaterThan(0);
    });
  });
```

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts`
Expected: FAIL, route `/einvoices/:id/issue` trả 404.

- [ ] **Step 4: Xuất, đối chiếu, sửa số trong `einvoices.service.ts`**

Thêm import:

```ts
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { fromDbDate, toDateString } from '../common/dates';
import { EinvoiceConfigService, type IssueConfig } from './einvoice-config.service';
import { parseDraft } from './einvoice-draft';
import { issueProblem } from './einvoice-math';
import { EinvoiceSender, type SendOutcome } from './einvoice-sender';
import { buildMinvoicePayload } from './minvoice/minvoice-payload';
import { EinvoiceNumberDto, IssueEinvoiceDto, ResolveEinvoiceDto } from './dto/einvoice.dto';
```

(`Logger`, `OnApplicationBootstrap` gộp vào dòng import `@nestjs/common` có sẵn; `fromDbDate`, `toDateString` gộp vào dòng import `../common/dates`; `issueProblem` gộp vào dòng import `./einvoice-math`; ba DTO gộp vào dòng import `./dto/einvoice.dto`.)

Thêm hai hàm cấp module, dưới `dateRange`:

```ts
const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

// 1C26MTT: characters 3–4 are the year (Thông tư 78/2021).
function symbolYearOf(symbolCode: string): number | null {
  const yy = Number(symbolCode.slice(2, 4));
  return Number.isInteger(yy) ? 2000 + yy : null;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
```

Đổi khai báo lớp và constructor:

```ts
@Injectable()
export class EinvoicesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EinvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
    private scope: BranchScopeService,
    private config: EinvoiceConfigService,
    private sender: EinvoiceSender,
  ) {}

  // One backend process: at start-up no send is still running, so a row left
  // SENDING was cut off (spec §8). Runs once per start on a small table.
  async onApplicationBootstrap() {
    await this.prisma.einvoice.updateMany({
      where: { status: EinvoiceStatus.SENDING },
      data: {
        status: EinvoiceStatus.UNCERTAIN,
        lastError: 'Server khởi động lại khi đang gửi; hãy đối chiếu trên Minvoice',
      },
    });
  }
```

Thêm các method, trước `private async listWhere`:

```ts
  // Spec §8. Answers 200 with the row once it is locked: the outcome is its
  // status (ISSUED, DRAFT with lastError, UNCERTAIN); checks before the lock
  // answer 400 / 409.
  async issue(user: AuthUser, id: number, dto: IssueEinvoiceDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: {
        branchId: true,
        status: true,
        amount: true,
        buyerTaxCode: true,
        buyerName: true,
        draft: true,
        order: { select: { status: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    if (row.status !== EinvoiceStatus.DRAFT) {
      throw new ConflictException(
        row.status === EinvoiceStatus.ISSUED
          ? 'Hóa đơn đã xuất'
          : 'Hóa đơn đang được gửi hoặc chưa rõ kết quả; đối chiếu trên Minvoice trước khi gửi lại',
      );
    }
    if (row.order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Bill đã hủy, không xuất được hóa đơn');
    }
    const draft = parseDraft(row.draft);
    const problem = issueProblem(Number(row.amount), draft.lines);
    if (problem) throw new BadRequestException(problem);
    const ready = await this.config.readyForIssue(row.branchId);
    await this.assertInvoiceDate(ready, dto);

    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: EinvoiceStatus.DRAFT },
      data: {
        status: EinvoiceStatus.SENDING,
        sendingAt: new Date(),
        lastError: null,
        sellerTaxCode: ready.taxCode,
        symbolCode: ready.symbolCode,
        registerInvoiceId: ready.registerInvoiceId,
        invoiceDate: toDbDate(dto.invoiceDate),
      },
    });
    if (count === 0) throw new ConflictException('Hóa đơn đang được gửi hoặc đã xuất');

    let outcome: SendOutcome;
    try {
      outcome = await this.sender.send(ready, (config) =>
        buildMinvoicePayload({
          ...config,
          invoiceDate: dto.invoiceDate,
          buyer: {
            taxCode: row.buyerTaxCode,
            name: row.buyerName,
            address: draft.buyerAddress,
            email: draft.buyerEmail,
          },
          lines: draft.lines,
          marker: `K502-${id}`,
        }),
      );
    } catch (error) {
      // A bug after the request may have left: never guess, check on Minvoice.
      outcome = { kind: 'uncertain', message: error instanceof Error ? error.message : String(error) };
    }
    await this.record(user, id, ready, draft.lines, outcome);
    return this.findOne(user, id);
  }

  // Spec §9.2 (without a search): the chain manager looked on Minvoice.
  async resolve(user: AuthUser, id: number, dto: ResolveEinvoiceDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { branchId: true, draft: true, sellerTaxCode: true, symbolCode: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    const data: Prisma.EinvoiceUncheckedUpdateManyInput = dto.found
      ? {
          status: EinvoiceStatus.ISSUED,
          invoiceNumber: dto.invoiceNumber,
          vatAmount: totalsOf(parseDraft(row.draft).lines).vatAmount,
          draft: Prisma.DbNull,
          issuedById: user.id,
          issuedAt: new Date(),
          lastError: null,
          sendingAt: null,
        }
      : {
          status: EinvoiceStatus.DRAFT,
          lastError: null,
          sendingAt: null,
          sellerTaxCode: null,
          symbolCode: null,
          registerInvoiceId: null,
          invoiceDate: null,
        };
    let count: number;
    try {
      ({ count } = await this.prisma.einvoice.updateMany({ where: { id, status: EinvoiceStatus.UNCERTAIN }, data }));
    } catch (error) {
      if (isUniqueViolation(error)) throw await this.numberTaken(row, dto.invoiceNumber!);
      throw error;
    }
    if (count === 0) throw new ConflictException('Hóa đơn không ở trạng thái "Không rõ"');
    return this.findOne(user, id);
  }

  async editNumber(user: AuthUser, id: number, dto: EinvoiceNumberDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { branchId: true, sellerTaxCode: true, symbolCode: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    let count: number;
    try {
      ({ count } = await this.prisma.einvoice.updateMany({
        where: { id, status: EinvoiceStatus.ISSUED },
        data: {
          invoiceNumber: dto.invoiceNumber,
          lastError: null,
          numberEditedById: user.id,
          numberEditedAt: new Date(),
        },
      }));
    } catch (error) {
      if (isUniqueViolation(error)) throw await this.numberTaken(row, dto.invoiceNumber);
      throw error;
    }
    if (count === 0) throw new ConflictException('Chỉ sửa số của hóa đơn đã xuất');
    return this.findOne(user, id);
  }

  // Spec §9.3: not before the newest invoice of the symbol, a future date
  // confirmed, and in the year of the symbol.
  private async assertInvoiceDate(ready: IssueConfig, dto: IssueEinvoiceDto) {
    const date = toDbDate(dto.invoiceDate);
    if (Number.isNaN(date.getTime()) || fromDbDate(date) !== dto.invoiceDate) {
      throw new BadRequestException('Ngày hóa đơn không hợp lệ');
    }
    const latest = await this.config.latestIssued(ready.taxCode, ready.symbolCode);
    if (latest && dto.invoiceDate < latest.invoiceDate) {
      throw new BadRequestException(
        `Ngày hóa đơn phải từ ${dmy(latest.invoiceDate)} trở đi (hóa đơn số ${latest.invoiceNumber ?? '?'} cùng ký hiệu ${ready.symbolCode} mang ngày này)`,
      );
    }
    if (dto.invoiceDate > toDateString(new Date()) && !dto.confirmFutureDate) {
      throw new BadRequestException('Ngày hóa đơn sau hôm nay: cần xác nhận trước khi xuất');
    }
    const year = symbolYearOf(ready.symbolCode);
    if (year !== null && Number(dto.invoiceDate.slice(0, 4)) !== year) {
      throw new BadRequestException(
        `Ký hiệu ${ready.symbolCode} là của năm ${year}, ngày hóa đơn là ${dmy(dto.invoiceDate)}`,
      );
    }
  }

  private async record(
    user: AuthUser,
    id: number,
    ready: IssueConfig,
    lines: EinvoiceLine[],
    outcome: SendOutcome,
  ) {
    if (outcome.kind === 'failed') {
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          status: EinvoiceStatus.DRAFT,
          lastError: (outcome.dateOrder
            ? `Minvoice từ chối ngày hóa đơn: phải từ ngày của hóa đơn mới nhất cùng ký hiệu ${ready.symbolCode} trở đi. ${outcome.message}`
            : outcome.message
          ).slice(0, 300),
          sendingAt: null,
          sellerTaxCode: null,
          symbolCode: null,
          registerInvoiceId: null,
          invoiceDate: null,
        },
      });
      return;
    }
    if (outcome.kind === 'uncertain') {
      await this.prisma.einvoice.update({
        where: { id },
        data: { status: EinvoiceStatus.UNCERTAIN, lastError: outcome.message.slice(0, 300) },
      });
      return;
    }
    // Issued: the header stays, the details go (spec §4).
    const header = {
      status: EinvoiceStatus.ISSUED,
      minvoiceId: outcome.minvoiceId,
      sellerTaxCode: outcome.config.taxCode,
      symbolCode: outcome.config.symbolCode,
      registerInvoiceId: outcome.config.registerInvoiceId,
      vatAmount: totalsOf(lines).vatAmount,
      draft: Prisma.DbNull,
      issuedById: user.id,
      issuedAt: new Date(),
      sendingAt: null,
    };
    try {
      await this.prisma.einvoice.update({
        where: { id },
        data: { ...header, invoiceNumber: outcome.invoiceNumber, lastError: null },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        // The row stays SENDING and becomes UNCERTAIN at the next start-up.
        this.logger.error(
          `Einvoice ${id}: Minvoice issued number ${outcome.invoiceNumber} (id ${outcome.minvoiceId}) but saving it failed`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }
      const holder = await this.prisma.einvoice.findFirst({
        where: {
          sellerTaxCode: outcome.config.taxCode,
          symbolCode: outcome.config.symbolCode,
          invoiceNumber: outcome.invoiceNumber,
        },
        select: { id: true },
      });
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          ...header,
          invoiceNumber: null,
          lastError: `Số ${outcome.invoiceNumber} trùng hóa đơn #${holder?.id ?? '?'}, kiểm tra và sửa số`,
        },
      });
    }
  }

  private async numberTaken(
    row: { sellerTaxCode: string | null; symbolCode: string | null },
    invoiceNumber: number,
  ) {
    const holder = await this.prisma.einvoice.findFirst({
      where: { sellerTaxCode: row.sellerTaxCode, symbolCode: row.symbolCode, invoiceNumber },
      select: { id: true },
    });
    return new ConflictException(`Số ${invoiceNumber} đã có ở hóa đơn #${holder?.id ?? '?'}`);
  }
```

- [ ] **Step 5: Route**

Trong `einvoices.controller.ts`, thêm `HttpCode` vào import `@nestjs/common`, `CHAIN_ONLY` vào import `../auth/roles`, `EinvoiceNumberDto, IssueEinvoiceDto, ResolveEinvoiceDto` vào import DTO. Thêm cuối lớp:

```ts
  @Post(':id/issue')
  @HttpCode(200)
  @Roles(...CHAIN_ONLY)
  issue(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: IssueEinvoiceDto) {
    return this.einvoices.issue(user, id, dto);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Roles(...CHAIN_ONLY)
  resolve(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ResolveEinvoiceDto) {
    return this.einvoices.resolve(user, id, dto);
  }

  @Patch(':id/number')
  @Roles(...CHAIN_ONLY)
  editNumber(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: EinvoiceNumberDto) {
    return this.einvoices.editNumber(user, id, dto);
  }
```

- [ ] **Step 6: Chạy test**

```bash
cd 502-backend
npx jest src/einvoice
npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts
```

Expected: PASS hết, gồm cả `issuing` (12 test).

- [ ] **Step 7: Lint, commit**

```bash
npm run lint && npm run build
git add 502-backend/src/einvoice 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): xuất lên Minvoice (đăng nhập lại, lấy lại dải, gửi lại một lần), đối chiếu, sửa số

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Tìm hóa đơn theo mã đối chiếu (chỉ làm khi bước 0 tìm được)

Spec §9.2 (nhánh "tìm được"), §9.3 (ngày mới nhất từ Minvoice).

**Bỏ qua cả task này** nếu **Kết quả bước 0** ghi `SEARCH = không có` hoặc `MARKER_FIELD = null`. Khi đó hóa đơn "Không rõ" chỉ đối chiếu bằng tay (Task 9) và giới hạn ngày chỉ lấy từ database. Ghi "Task 10: bỏ qua (bước 0 không tìm được API tìm hóa đơn)" vào mô tả commit của Task 16.

**Files:**
- Modify: `502-backend/src/einvoice/minvoice/minvoice-client.ts` (+ spec)
- Modify: `502-backend/src/einvoice/einvoices.service.ts`, `einvoice-config.service.ts`
- Modify: `502-backend/test/fake-minvoice.ts`, `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Consumes: kết quả bước 0: `SEARCH_PATH` (ví dụ `/api/api/app/invoice`), `SEARCH_PARAM` (tham số lọc theo `MARKER_FIELD`, ví dụ `Filter`), tên các trường `id`, `invoiceNumber`, `invoiceDate`, `invoiceSerial` trong mỗi phần tử `items[]`.
- Produces:
  - `MinvoiceClient.findByMarker(taxCode, session, marker): Promise<{id: string; invoiceNumber: number; invoiceDate: string} | null>`;
  - `MinvoiceClient.latestInvoiceDate(taxCode, session, symbolCode): Promise<string | null>`.

- [ ] **Step 1: Test client (thay tên đường dẫn và tham số theo bước 0)**

Thêm vào `minvoice-client.spec.ts`:

```ts
  it('finds an invoice by our reference', async () => {
    replies.push(reply({ items: [{ id: 'inv-9', invoiceNumber: 1009, invoiceDate: '2026-10-01T00:00:00', invoiceSerial: '1C26MTT' }] }));
    await expect(client.findByMarker('0107811836', session, 'K502-7')).resolves.toEqual({
      id: 'inv-9',
      invoiceNumber: 1009,
      invoiceDate: '2026-10-01',
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(SEARCH_PATH);
    expect(url.searchParams.get(SEARCH_PARAM)).toBe('K502-7');
    replies.push(reply({ items: [] }));
    await expect(client.findByMarker('0107811836', session, 'K502-8')).resolves.toBeNull();
  });
```

và `import { SEARCH_PARAM, SEARCH_PATH } from './minvoice-client';`.

- [ ] **Step 2: Code client**

Thêm vào `minvoice-client.ts` (đặt `SEARCH_PATH`, `SEARCH_PARAM` theo bước 0):

```ts
// Invoice list of the Minvoice web app and its filter (plan Task 0).
export const SEARCH_PATH = '/api/api/app/invoice';
export const SEARCH_PARAM = 'Filter';
```

và trong lớp `MinvoiceClient`:

```ts
  // The invoice carrying `marker` (MARKER_FIELD), or null (spec §9.2).
  async findByMarker(taxCode: string, session: MinvoiceSession, marker: string) {
    const data = (await this.authed(taxCode, session, SEARCH_PATH, {
      [SEARCH_PARAM]: marker,
      MaxResultCount: '5',
    })) as { items?: Record<string, unknown>[] } | null;
    const item = (data?.items ?? []).find((row) => Object.values(row).includes(marker)) ?? data?.items?.[0];
    if (!item || typeof item.id !== 'string') return null;
    const invoiceNumber = Number(item.invoiceNumber);
    if (!Number.isInteger(invoiceNumber)) return null;
    return { id: item.id, invoiceNumber, invoiceDate: String(item.invoiceDate ?? '').slice(0, 10) };
  }

  // Date of the newest invoice of a symbol on Minvoice, including those made
  // outside Karaoke 502 (spec §9.3).
  async latestInvoiceDate(taxCode: string, session: MinvoiceSession, symbolCode: string) {
    const data = (await this.authed(taxCode, session, SEARCH_PATH, {
      [SEARCH_PARAM]: symbolCode,
      Sorting: 'invoiceDate desc',
      MaxResultCount: '1',
    })) as { items?: Record<string, unknown>[] } | null;
    const date = String(data?.items?.[0]?.invoiceDate ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  }
```

Nếu bước 0 cho thấy đường dẫn nhận tham số khác (ví dụ `InvoiceSerial` cho ký hiệu, `Sorting` theo cú pháp khác), dùng đúng tham số đó.

- [ ] **Step 3: Xuất hóa đơn "Không rõ" bằng cách tìm trước**

Trong `einvoices.service.ts`, `issue()`:

1. Đổi điều kiện `if (row.status !== EinvoiceStatus.DRAFT)` thành `if (row.status !== EinvoiceStatus.DRAFT && row.status !== EinvoiceStatus.UNCERTAIN)`.
2. Đổi `where: { id, status: EinvoiceStatus.DRAFT }` của bước khóa thành `where: { id, status: row.status }`.
3. Ngay sau bước khóa, trước `let outcome`, thêm:

```ts
    if (row.status === EinvoiceStatus.UNCERTAIN) {
      // Look before resending (spec §9.2): found -> issued; a failed search
      // leaves it uncertain.
      let found: { id: string; invoiceNumber: number; invoiceDate: string } | null;
      try {
        const session = ready.session ?? (await this.config.relogin(row.branchId));
        found = await this.client.findByMarker(ready.taxCode, session, `K502-${id}`);
      } catch (error) {
        await this.record(user, id, ready, draft.lines, {
          kind: 'uncertain',
          message: `Không kiểm tra được trên Minvoice: ${error instanceof Error ? error.message : String(error)}`,
        });
        return this.findOne(user, id);
      }
      if (found) {
        await this.record(user, id, ready, draft.lines, {
          kind: 'issued',
          minvoiceId: found.id,
          invoiceNumber: found.invoiceNumber,
          config: ready,
        });
        return this.findOne(user, id);
      }
    }
```

4. Inject `MinvoiceClient` vào constructor của `EinvoicesService` (`private client: MinvoiceClient`).

Trong `EinvoiceConfigService.viewOf`: nếu `configured`, lấy thêm `latestInvoiceDate` từ Minvoice qua `withSession`, bắt mọi lỗi và bỏ qua (giữ ngày từ database). Dùng ngày muộn hơn làm `minInvoiceDate`. Làm tương tự trong `EinvoicesService.assertInvoiceDate`.

- [ ] **Step 4: Minvoice giả và e2e**

Trong `fake-minvoice.ts`, thêm route `GET ${SEARCH_PATH}` (sau kiểm tra `authed`): lọc `this.invoices` có `MARKER_FIELD` hoặc `invoiceSerial` bằng tham số `SEARCH_PARAM`, trả `{items: [{id, invoiceNumber, invoiceDate, invoiceSerial}]}`. Để có id và số, lưu chúng vào `this.invoices` lúc tạo: `this.invoices.push({ ...invoice, id: `inv-${number}`, invoiceNumber: number })`. Thêm behaviour `'drop-after-create'`: lưu hóa đơn như `'ok'` rồi mới `req.socket.destroy()`.

Trong `einvoice.e2e-spec.ts`, test `'marks a send without an answer as uncertain, then resolves it'`: thay dòng `await issue(id).expect(409);` bằng:

```ts
      // Nothing was created: searching finds nothing and it is sent again.
      expect(((await issue(id).expect(200)).body as Json).status).toBe('ISSUED');
```

và bỏ phần `resolve` ở cuối test đó. Thêm test mới:

```ts
    it('finds an invoice created by a send whose answer was lost', async () => {
      const id = await newDraft();
      fake.behaviours = ['drop-after-create'];
      expect(((await issue(id).expect(200)).body as Json).status).toBe('UNCERTAIN');
      const posts = fake.posts;
      const body = (await issue(id).expect(200)).body as Json;
      expect(body.status).toBe('ISSUED');
      expect(fake.posts).toBe(posts);
    });
```

(`expect(fake.posts).toBe(posts)`: lần xuất thứ hai tìm thấy hóa đơn, không gửi lại.)

- [ ] **Step 5: Chạy test, commit**

```bash
cd 502-backend
npx jest src/einvoice
npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts
npm run lint && npm run build
git add 502-backend/src/einvoice 502-backend/test/fake-minvoice.ts 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(einvoice): tìm hóa đơn Không rõ trên Minvoice theo mã đối chiếu trước khi gửi lại

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Frontend nền tảng — kiểu dữ liệu, quyền, sidebar, tiền, `DatePicker`, MST cơ sở

Spec §3, §5, §10.1 (vị trí), §10.4 (trang Cơ sở).

**Files:**
- Modify: `502-frontend/src/lib/types.ts`, `lib/permissions.ts`, `lib/navigation.ts`, `lib/labels.ts`
- Create: `502-frontend/src/lib/einvoice.ts`
- Modify: `502-frontend/src/components/date-range-picker.tsx` (`DatePicker`)
- Modify: `502-frontend/src/app/[branch]/admin/branches/page.tsx`

**Interfaces:**
- Produces:
  - Kiểu (`lib/types.ts`): `EinvoiceStatus`, `VatRate`, `EinvoiceLine`, `EinvoiceDraft`, `EinvoiceRow`, `EinvoiceDetail`, `EinvoiceBill`, `EinvoiceBillDetail`, `EinvoiceSummary`, `EinvoiceConfigView`, `InvoiceSymbol`, `TaxPayer`; `Branch.taxCode`; `Order._count?`, `Order.einvoices?`.
  - Quyền `einvoices.view` / `.write` / `.issue` / `.config`.
  - `einvoiceStatusBadge(status, lastError): {label, variant}`.
  - `lib/einvoice.ts`: bản sao `einvoice-math.ts` (cùng tên hàm), cùng `VAT_RATES`.
  - `DatePicker` nhận thêm `min?: string` và `today?: string`.

- [ ] **Step 1: Kiểu dữ liệu**

Trong `lib/types.ts`, thêm `taxCode: string | null;` vào `interface Branch` (sau `address`). Trong `interface Order`, thêm:

```ts
  // GET /orders/:id only: e-invoices of the bill, for the edit / void dialogs.
  _count?: { einvoices: number };
  einvoices?: { id: number }[];
```

Thêm vào cuối file:

```ts
// Hóa đơn điện tử (spec 2026-10-01).
export type EinvoiceStatus = "DRAFT" | "SENDING" | "UNCERTAIN" | "ISSUED";
export type VatRate = 0 | 5 | 8 | 10;

export interface EinvoiceLine {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number; // whole đồng, before VAT
  vatRate: VatRate;
  vatAmount?: number; // filler line only
}

export interface EinvoiceDraft {
  buyerAddress: string | null;
  buyerEmail: string | null;
  lines: EinvoiceLine[];
}

// GET /einvoices (newest 500).
export interface EinvoiceRow {
  id: number;
  branchId: number;
  orderId: number;
  status: EinvoiceStatus;
  amount: string;
  vatAmount: string;
  buyerTaxCode: string | null;
  buyerName: string | null;
  symbolCode: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  invoiceNumber: number | null;
  lastError: string | null;
  createdAt: string;
  issuedAt: string | null;
  createdBy: StaffRef | null;
  issuedBy: StaffRef | null;
  order: {
    id: number;
    billNumber: string | null;
    finalAmount: string;
    endTime: string | null;
    cancelledAt: string | null;
    editedAt: string | null;
    room: { name: string } | null;
  };
}

// One invoice with its draft (null once issued).
export interface EinvoiceDetail extends EinvoiceRow {
  draft: EinvoiceDraft | null;
  sellerTaxCode: string | null;
  minvoiceId: string | null;
  updatedAt: string;
  updatedBy: StaffRef | null;
  numberEditedAt: string | null;
  numberEditedBy: StaffRef | null;
}

// GET /einvoices/bills: paid bills of a day for the picker.
export interface EinvoiceBill {
  orderId: number;
  billNumber: string | null;
  roomName: string | null;
  endTime: string | null;
  finalAmount: string;
  allocated: number;
  einvoiceCount: number;
}

// GET /einvoices/bill/:orderId.
export interface EinvoiceBillDetail {
  order: {
    id: number;
    status: OrderStatus;
    billNumber: string | null;
    startTime: string | null;
    endTime: string | null;
    finalAmount: string;
    taxAmount: string;
    taxPercent: number;
    pricePerHour: string;
    hourlyFee: string;
    discountAmount: string;
    hourlyDiscountAmount: string;
    cancelledAt: string | null;
    editedAt: string | null;
    billedHours: number;
    room: { name: string } | null;
    items: { name: string; unit: string; quantity: number; price: string }[];
  };
  einvoices: EinvoiceDetail[];
  allocated: number;
}

export interface EinvoiceSummary {
  draftCount: number;
  errorCount: number;
  uncertainCount: number;
  issuedCount: number;
  issuedAmount: number;
  issuedVat: number;
}

// GET /einvoice/config: never the password, cookie or token.
export interface EinvoiceConfigView {
  branchTaxCode: string | null;
  username: string | null;
  symbolCode: string | null;
  registerInvoiceId: string | null;
  sellerName: string | null;
  loginError: string | null;
  minInvoiceDate: string | null;
  latestInvoiceNumber: number | null;
  needsLogin: boolean;
  configured: boolean;
}

export interface InvoiceSymbol {
  registerInvoiceId: string;
  symbolCode: string;
  invoiceTypeName: string | null;
  invoiceYear: number | null;
  creationTime: string | null;
}

export interface TaxPayer {
  taxCode: string;
  name: string;
  address: string;
  status: string;
  active: boolean;
  source: "gdt" | "xinvoice";
}
```

- [ ] **Step 2: Quyền và sidebar**

`lib/permissions.ts`: thêm vào union `Permission` (trước `| "live"`):

```ts
  | "einvoices.view" // Hóa đơn điện tử (read; HĐQT too)
  | "einvoices.write" // create, edit, delete drafts
  | "einvoices.issue" // send to Minvoice, resolve "Không rõ", edit numbers
  | "einvoices.config" // the branch's Minvoice account and symbol
```

vào `MATRIX` (trước `live:`):

```ts
  "einvoices.view": [...MANAGERS, "CASHIER", "BOARD"],
  "einvoices.write": [...MANAGERS, "CASHIER"],
  "einvoices.issue": ["CHAIN_MANAGER"],
  "einvoices.config": ["CHAIN_MANAGER"],
```

và vào `ROUTE_PERMISSIONS`, ngay trước `["/sales/settings", "catalog.view"],`:

```ts
  ["/sales/einvoices", "einvoices.view"],
```

`lib/navigation.ts`: thêm `FileCheck2,` vào import `lucide-react` (trước `FileDown,`) và mục sau "Hóa đơn" trong nhóm "Bán hàng":

```ts
      { title: "Hóa đơn điện tử", path: "/sales/einvoices", icon: FileCheck2, permission: "einvoices.view" },
```

- [ ] **Step 3: Nhãn trạng thái**

`lib/labels.ts`: thêm `EinvoiceStatus` vào dòng `import type` và thêm cuối file:

```ts
// Hóa đơn điện tử: "Lỗi" is a draft whose last send failed.
export function einvoiceStatusBadge(
  status: EinvoiceStatus,
  lastError: string | null,
): { label: string; variant: "secondary" | "destructive" | "warning" | "success" } {
  if (status === "DRAFT") return lastError ? { label: "Lỗi", variant: "destructive" } : { label: "Nháp", variant: "secondary" };
  if (status === "SENDING") return { label: "Đang gửi", variant: "warning" };
  if (status === "UNCERTAIN") return { label: "Không rõ", variant: "warning" };
  return { label: "Đã xuất", variant: "success" };
}
```

- [ ] **Step 4: `lib/einvoice.ts` (bản sao của backend)**

```ts
import type { EinvoiceLine, VatRate } from "@/lib/types";

// Mirror of the backend's src/einvoice/einvoice-math.ts (spec §5): keep the
// two in sync. Rounded to the đồng with Math.round.

export const VAT_RATES: VatRate[] = [0, 5, 8, 10];
export const MAX_LINES = 50;
export const FILLER_NAME = "Dịch vụ karaoke";

export const roundToDong = (value: number) => Math.round(Math.round(value * 1000) / 1000);

export const lineAmountOf = (line: Pick<EinvoiceLine, "quantity" | "unitPrice">) =>
  roundToDong(line.quantity * line.unitPrice);

export const computedVatOf = (amount: number, rate: number) => roundToDong((amount * rate) / 100);

export const lineVatOf = (line: EinvoiceLine) =>
  line.vatAmount ?? computedVatOf(lineAmountOf(line), line.vatRate);

export interface EinvoiceTotals {
  amountWithoutVat: number;
  vatAmount: number;
  total: number;
}

export function totalsOf(lines: EinvoiceLine[]): EinvoiceTotals {
  let amountWithoutVat = 0;
  let vatAmount = 0;
  for (const line of lines) {
    amountWithoutVat += lineAmountOf(line);
    vatAmount += lineVatOf(line);
  }
  return { amountWithoutVat, vatAmount, total: amountWithoutVat + vatAmount };
}

const dong = (value: number) => value.toLocaleString("vi-VN");

export function issueProblem(amount: number, lines: EinvoiceLine[]): string | null {
  if (lines.length === 0) return "Hóa đơn chưa có dòng hàng";
  if (lines.length > MAX_LINES) return `Tối đa ${MAX_LINES} dòng hàng`;
  for (const [index, line] of lines.entries()) {
    if (
      line.vatAmount !== undefined &&
      Math.abs(line.vatAmount - computedVatOf(lineAmountOf(line), line.vatRate)) > 1
    ) {
      return `Dòng ${index + 1}: tiền thuế lệch quá 1 đồng so với thuế suất`;
    }
  }
  const { total } = totalsOf(lines);
  if (total < amount) return `Còn thiếu ${dong(amount - total)} đồng`;
  if (total > amount) return `Thừa ${dong(total - amount)} đồng`;
  return null;
}

export function fillerLine(missing: number, rate: VatRate): EinvoiceLine | null {
  if (missing <= 0) return null;
  const base = roundToDong(missing / (1 + rate / 100));
  const filler = { name: FILLER_NAME, unit: "Lần", quantity: 1, vatRate: rate };
  for (const price of [base, base - 1, base + 1]) {
    if (price >= 0 && price + computedVatOf(price, rate) === missing) return { ...filler, unitPrice: price };
  }
  return { ...filler, unitPrice: base, vatAmount: missing - base };
}

export function defaultVatRate(taxPercent: number): VatRate {
  return (VAT_RATES as number[]).includes(taxPercent) ? (taxPercent as VatRate) : 10;
}
```

- [ ] **Step 5: `DatePicker` nhận `min` và `today`**

Trong `components/date-range-picker.tsx`, hàm `DatePicker`:

1. Thêm vào destructuring và kiểu props:

```ts
  min,
  today: todayProp,
```

```ts
  // First day that can be picked (YYYY-MM-DD), e.g. the date of the newest e-invoice.
  min?: string;
  // The day "Hôm nay" picks; default today's business day (e-invoice dates use the calendar day).
  today?: string;
```

2. Đổi `const today = parseISO(businessDate());` (trong `DatePicker`) thành `const today = parseISO(todayProp ?? businessDate());`.
3. Trên `<Button>` của mỗi preset thêm `disabled={(!!min && preset.day < min) || (!!max && preset.day > max)}`.
4. Đổi prop `disabled` của `<Calendar>` thành:

```tsx
            disabled={[
              ...(max ? [{ after: parseISO(max) }] : []),
              ...(min ? [{ before: parseISO(min) }] : []),
            ]}
```

- [ ] **Step 6: Ô Mã số thuế ở trang Cơ sở**

Trong `app/[branch]/admin/branches/page.tsx`:
- `interface BranchForm` thêm `taxCode: string;`.
- Hai chỗ khởi tạo form: `{ code: "", name: "", address: "", taxCode: "" }` và `{ code: branch.code, name: branch.name, address: branch.address ?? "", taxCode: branch.taxCode ?? "" }`, kể cả `useState<BranchForm>(…)`.
- Thêm dưới `const nameInvalid = …`:

```ts
  const TAX_CODE_RE = /^\d{10}(-\d{3})?$/;
  const taxCodeInvalid = submitted && !!form.taxCode.trim() && !TAX_CODE_RE.test(form.taxCode.trim());
```

- Trong `save`, đổi dòng `if (!form.name.trim() || …) return;` thành:

```ts
    if (
      !form.name.trim() ||
      (isNew && !CODE_RE.test(form.code.trim().toLowerCase())) ||
      (!!form.taxCode.trim() && !/^\d{10}(-\d{3})?$/.test(form.taxCode.trim()))
    )
      return;
```

- `api.post("/branches", …)` thêm `taxCode: form.taxCode.trim() || undefined,`. `api.patch` đổi thành `{ name: form.name.trim(), address: form.address.trim(), taxCode: form.taxCode.trim() || null }`.
- Thêm `Field` sau ô Địa chỉ:

```tsx
              <Field data-invalid={taxCodeInvalid || undefined}>
                <FieldLabel htmlFor="branch-tax-code">Mã số thuế</FieldLabel>
                <Input
                  id="branch-tax-code"
                  inputMode="numeric"
                  placeholder="vd: 0107811836"
                  value={form.taxCode}
                  aria-invalid={taxCodeInvalid || undefined}
                  onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
                />
                {taxCodeInvalid ? (
                  <FieldError>10 số, hoặc 10 số kèm -3 số (MST chi nhánh)</FieldError>
                ) : (
                  <FieldDescription>Dùng cho hóa đơn điện tử. Đổi MST thì phải đăng nhập Minvoice lại.</FieldDescription>
                )}
              </Field>
```

- [ ] **Step 7: Lint, build, commit**

```bash
cd 502-frontend && npm run lint && npm run build
git add 502-frontend/src/lib 502-frontend/src/components/date-range-picker.tsx "502-frontend/src/app/[branch]/admin/branches/page.tsx"
git commit -m "feat(web): nền tảng hóa đơn điện tử (kiểu, quyền, tiền), MST cơ sở, DatePicker có ngày sớm nhất

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: lint và build không lỗi. Mục sidebar chưa có trang: mở ra sẽ 404, trang có ở Task 12.

---

### Task 12: Trang Hóa đơn điện tử và khung Minvoice

Spec §10.1 (khung Minvoice: chỉ hiện tên công ty).

**Files:**
- Create: `502-frontend/src/app/[branch]/sales/einvoices/layout.tsx`, `page.tsx`
- Create: `502-frontend/src/components/einvoices/einvoice-config-card.tsx`

**Interfaces:**
- Consumes: `EinvoiceConfigView`, `InvoiceSymbol` (Task 11), `useApiData`, `useNotify`, `useBranchCode`, `can`.
- Produces:
  - `EinvoiceConfigCard({config: EinvoiceConfigView | null; loading: boolean; onChanged: () => void})`;
  - trang `/[branch]/sales/einvoices` sở hữu `selected: {orderId, einvoiceId: number | "new"} | null`, `dirty`, `listVersion`.
  
  Task 13 và 14 cắm `EinvoiceList`, `BillPickerDialog`, `BillEinvoicesPanel` vào đây. Ở task này dùng chỗ trống tạm như Step 3 ghi.

- [ ] **Step 1: `layout.tsx`**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hóa đơn điện tử" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: `einvoice-config-card.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { can } from "@/lib/permissions";
import type { EinvoiceConfigView, InvoiceSymbol } from "@/lib/types";

// The Minvoice account of the branch (spec §10.1): the chain manager logs in,
// then picks the symbol from the dropdown beside it; only the company name of
// the seller is shown. Everyone else sees one status line.
export function EinvoiceConfigCard({
  config,
  loading,
  onChanged,
}: {
  config: EinvoiceConfigView | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const notify = useNotify();
  const editable = can(user, "einvoices.config");
  const [loggingIn, setLoggingIn] = useState(false);
  const [symbols, setSymbols] = useState<InvoiceSymbol[] | null>(null);
  const [savingSymbol, setSavingSymbol] = useState(false);

  const loadSymbols = useCallback(() => {
    api
      .get<{ symbols: InvoiceSymbol[] }>("/einvoice/config/symbols", { params: { branch } })
      .then((res) => setSymbols(res.data.symbols))
      .catch((error) => notify.error(error, "Không tải được danh sách ký hiệu"));
  }, [branch, notify]);

  const canLoadSymbols = editable && !!config && !config.needsLogin;
  useEffect(() => {
    if (canLoadSymbols) loadSymbols();
  }, [canLoadSymbols, loadSymbols]);

  const login = async (username: string, password: string) => {
    setLoggingIn(true);
    try {
      await api.post("/einvoice/config/login", { username, password }, { params: { branch } });
      notify.success("Đã đăng nhập Minvoice");
      onChanged();
      loadSymbols();
      return true;
    } catch (error) {
      notify.error(error, "Không đăng nhập được Minvoice");
      return false;
    } finally {
      setLoggingIn(false);
    }
  };

  const selectSymbol = async (registerInvoiceId: string) => {
    setSavingSymbol(true);
    try {
      await api.put("/einvoice/config/symbol", { registerInvoiceId }, { params: { branch } });
      notify.success("Đã chọn ký hiệu hóa đơn");
      onChanged();
    } catch (error) {
      notify.error(error, "Không chọn được ký hiệu");
    } finally {
      setSavingSymbol(false);
    }
  };

  if (loading && !config) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (!config) return null;

  if (!config.branchTaxCode) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>Cơ sở chưa có mã số thuế</AlertTitle>
        <AlertDescription>
          {can(user, "branches") ? (
            <span>
              Nhập MST ở trang{" "}
              <Link className="underline" href={`/${branch}/admin/branches`}>
                Cơ sở
              </Link>{" "}
              trước khi đăng nhập Minvoice.
            </span>
          ) : (
            "Quản lý hệ thống cần nhập MST của cơ sở trước."
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!editable) {
    return (
      <Card className="py-3">
        <CardContent className="flex items-center gap-2 px-4 text-sm">
          {config.configured ? (
            <CircleCheckIcon className="size-4 shrink-0 text-success" />
          ) : (
            <TriangleAlertIcon className="size-4 shrink-0 text-warning" />
          )}
          <span className="min-w-0 truncate">
            {config.configured
              ? `Minvoice: ${config.username} · ${config.symbolCode} · ${config.sellerName}`
              : "Chưa cấu hình Minvoice. Quản lý hệ thống cần đăng nhập và chọn ký hiệu."}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <LoginForm
            key={config.username ?? ""}
            taxCode={config.branchTaxCode}
            initialUsername={config.username ?? ""}
            busy={loggingIn}
            onLogin={login}
          />
          <Select
            value={config.registerInvoiceId ?? undefined}
            onValueChange={selectSymbol}
            disabled={!symbols || savingSymbol || config.needsLogin}
          >
            <SelectTrigger className="w-full @lg/main:w-56" aria-label="Ký hiệu hóa đơn">
              <SelectValue placeholder={config.symbolCode ?? (symbols ? "Chọn ký hiệu" : "Đăng nhập để chọn ký hiệu")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(symbols ?? []).map((symbol) => (
                  <SelectItem key={symbol.registerInvoiceId} value={symbol.registerInvoiceId}>
                    {symbol.symbolCode}
                    {symbol.invoiceTypeName ? ` — ${symbol.invoiceTypeName}` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {config.configured && <CircleCheckIcon className="size-4 text-success" aria-label="Đã cấu hình" />}
        </div>
        {config.needsLogin && config.username && (
          <p className="text-sm text-warning">
            {config.loginError ?? "Cần đăng nhập Minvoice lại (MST của cơ sở đã đổi hoặc mật khẩu đã lưu không đọc được)."}
          </p>
        )}
        {config.sellerName && <p className="text-sm font-medium">{config.sellerName}</p>}
      </CardContent>
    </Card>
  );
}

// Username + password + Đăng nhập. Keyed by the saved username, so the box
// starts from it without an effect; the password is never filled in.
function LoginForm({
  taxCode,
  initialUsername,
  busy,
  onLogin,
}: {
  taxCode: string;
  initialUsername: string;
  busy: boolean;
  onLogin: (username: string, password: string) => Promise<boolean>;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (await onLogin(username.trim(), password)) setPassword("");
  };
  return (
    <form onSubmit={submit} className="contents">
      <span className="text-sm text-muted-foreground">MST {taxCode}</span>
      <Input
        aria-label="Tên đăng nhập Minvoice"
        placeholder="Tên đăng nhập"
        autoComplete="off"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full @lg/main:w-40"
      />
      <Input
        aria-label="Mật khẩu Minvoice"
        type="password"
        placeholder="Mật khẩu"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full @lg/main:w-40"
      />
      <Button type="submit" disabled={busy || !username.trim() || !password}>
        {busy && <Spinner data-icon="inline-start" />}
        Đăng nhập
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: `page.tsx` (bản đầu: khung Minvoice và chỗ cho danh sách/panel)**

```tsx
"use client";

import { useEffect, useState } from "react";
import { FileCheck2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { PageHeader } from "@/components/layout/page-header";
import { useApiData } from "@/hooks/use-api-data";
import { useBranchCode } from "@/lib/branch";
import type { EinvoiceConfigView } from "@/lib/types";

// A bill open in the panel, and which of its invoices ("new": not saved yet).
interface EinvoiceSelection {
  orderId: number;
  einvoiceId: number | "new";
}

export default function EinvoicesPage() {
  const branch = useBranchCode();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [selected, setSelected] = useState<EinvoiceSelection | null>(null);
  // Unsaved edits in the panel: switching bills or leaving asks first.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<EinvoiceSelection | null | undefined>(undefined);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Used by the list and the picker (Task 13).
  const select = (next: EinvoiceSelection | null) => {
    if (dirty) setPending(next);
    else setSelected(next);
  };
  void select;

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description="Chia bill đã thanh toán thành các hóa đơn nhỏ, lưu nháp và xuất lên Minvoice."
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <EmptyState
          icon={FileCheck2Icon}
          title={selected ? `Bill #${selected.orderId}` : "Chọn một hóa đơn"}
          description="Hoặc bấm Tạo HĐĐT mới để chia một bill."
          className="rounded-xl border"
        />
      </div>
      <ConfirmDialog
        open={pending !== undefined}
        onOpenChange={(open) => !open && setPending(undefined)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          setDirty(false);
          setSelected(pending ?? null);
          setPending(undefined);
        }}
      />
    </>
  );
}
```

- [ ] **Step 4: Chạy thử**

```bash
cd 502-frontend && npm run lint && npm run build
```

Chạy backend và frontend (xem Task 17 Step 2), đăng nhập `admin`, mở `/cs1/sales/einvoices`.
- Chưa có MST: thấy cảnh báo và link trang Cơ sở.
- Có MST và Minvoice giả: đăng nhập, dropdown ký hiệu tải được, chọn xong hiện tên công ty.
- Đăng nhập `tn1_cs1`: chỉ thấy dòng trạng thái.

- [ ] **Step 5: Commit**

```bash
git add "502-frontend/src/app/[branch]/sales/einvoices" 502-frontend/src/components/einvoices/einvoice-config-card.tsx
git commit -m "feat(web): trang Hóa đơn điện tử và khung đăng nhập Minvoice, chọn ký hiệu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Danh sách hóa đơn và dialog chọn bill

Spec §10.1 (cột trái, dialog chọn bill), §13 (`ListLimitNotice`).

**Files:**
- Create: `502-frontend/src/components/einvoices/einvoice-list.tsx`, `bill-picker-dialog.tsx`
- Modify: `502-frontend/src/app/[branch]/sales/einvoices/page.tsx`

**Interfaces:**
- Consumes: `EinvoiceRow`, `EinvoiceSummary`, `EinvoiceBill`, `einvoiceStatusBadge` (Task 11), `DatePicker`, `DateRangePicker`.
- Produces:
  - `EinvoiceList({version: number; selectedId: number | null; onSelect: (orderId: number, einvoiceId: number) => void; onCreate: () => void})`;
  - `BillPickerDialog({open: boolean; onOpenChange: (open: boolean) => void; onPick: (orderId: number) => void})`.

- [ ] **Step 1: `einvoice-list.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { EinvoiceRow, EinvoiceSummary } from "@/lib/types";

type Tab = "all" | "DRAFT" | "ERROR" | "UNCERTAIN" | "ISSUED";
const TABS: { value: Tab; label: string; count?: keyof EinvoiceSummary }[] = [
  { value: "all", label: "Tất cả" },
  { value: "DRAFT", label: "Nháp", count: "draftCount" },
  { value: "ERROR", label: "Lỗi", count: "errorCount" },
  { value: "UNCERTAIN", label: "Không rõ", count: "uncertainCount" },
  { value: "ISSUED", label: "Đã xuất", count: "issuedCount" },
];

// Left column (spec §10.1): Tạo HĐĐT mới on top, the invoices below grouped
// by bill. Nháp / Lỗi / Không rõ are pending work: every day, no date box.
export function EinvoiceList({
  version,
  selectedId,
  onSelect,
  onCreate,
}: {
  version: number;
  selectedId: number | null;
  onSelect: (orderId: number, einvoiceId: number) => void;
  onCreate: () => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const [tab, setTab] = useState<Tab>("all");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  const billNumber = search.replace(/\D/g, "");
  const dated = tab === "all" || tab === "ISSUED";

  const list = useApiData<EinvoiceRow[]>(
    "/einvoices",
    {
      branch,
      status: tab === "all" ? undefined : tab,
      billNumber: billNumber || undefined,
      ...(dated && !billNumber ? range : {}),
    },
    [],
    "Không thể tải danh sách hóa đơn điện tử",
  );
  const summary = useApiData<EinvoiceSummary | null>(
    "/einvoices/summary",
    { branch, ...range },
    null,
    "Không thể tải số hóa đơn",
  );
  const reloadList = list.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (version === 0) return;
    reloadList();
    reloadSummary();
  }, [version, reloadList, reloadSummary]);

  const groups = useMemo(() => {
    const byOrder = new Map<number, EinvoiceRow[]>();
    for (const row of list.data) {
      const group = byOrder.get(row.orderId);
      if (group) group.push(row);
      else byOrder.set(row.orderId, [row]);
    }
    return [...byOrder.values()];
  }, [list.data]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {can(user, "einvoices.write") && (
        <Button onClick={onCreate} className="self-start">
          <PlusIcon data-icon="inline-start" />
          Tạo HĐĐT mới
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {dated && !billNumber ? (
          <DateRangePicker value={range} onChange={setRange} />
        ) : (
          <span className="text-sm text-muted-foreground">Mọi ngày</span>
        )}
        <Input
          type="search"
          inputMode="numeric"
          placeholder="Tìm số bill…"
          aria-label="Tìm theo số bill"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full @md/main:w-44"
        />
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="h-auto flex-wrap">
          {TABS.map((t) => {
            const count = t.count && summary.data ? summary.data[t.count] : 0;
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {count ? <span className="ml-1 tabular-nums text-muted-foreground">{count}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <ListLimitNotice
        shown={list.data.length}
        total={list.total}
        noun="hóa đơn"
        hint="Chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
      />
      {list.loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FileCheck2Icon}
          title="Không có hóa đơn điện tử"
          description={dated ? "Chưa có hóa đơn nào cho các bill trong khoảng ngày này." : "Không có hóa đơn nào ở trạng thái này."}
          className="rounded-xl border"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((rows) => (
            <BillGroup key={rows[0].orderId} rows={rows} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BillGroup({
  rows,
  selectedId,
  onSelect,
}: {
  rows: EinvoiceRow[];
  selectedId: number | null;
  onSelect: (orderId: number, einvoiceId: number) => void;
}) {
  const order = rows[0].order;
  return (
    <li className="rounded-xl border">
      <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-medium">
          {billLabel(order)} · {order.room?.name ?? "—"}
        </span>
        <span className="shrink-0 tabular-nums">{formatMoney(order.finalAmount)}</span>
      </div>
      <ul>
        {rows.map((row) => {
          const badge = einvoiceStatusBadge(row.status, row.lastError);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.orderId, row.id)}
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/50",
                  selectedId === row.id && "bg-muted",
                )}
              >
                <span className="tabular-nums text-muted-foreground">#{row.id}</span>
                <span className="tabular-nums">{formatMoney(row.amount)}</span>
                <Badge variant={badge.variant}>
                  {badge.label}
                  {row.invoiceNumber ? ` · số ${row.invoiceNumber}` : ""}
                </Badge>
                <span className="ml-auto min-w-0 truncate text-muted-foreground">
                  {row.buyerName ?? "Khách lẻ"}
                  {row.createdBy ? ` · ${row.createdBy.fullName}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
```

- [ ] **Step 2: `bill-picker-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ReceiptTextIcon } from "lucide-react";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DatePicker } from "@/components/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { useBranchCode } from "@/lib/branch";
import { billLabel, businessDate, formatMoney, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EinvoiceBill } from "@/lib/types";

// "Tạo HĐĐT mới": pick a paid bill of a business day, or find one by number.
export function BillPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (orderId: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chọn bill để xuất hóa đơn</DialogTitle>
          <DialogDescription>Bill đã thanh toán của một ngày kinh doanh, hoặc tìm theo số bill.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the list loads when the dialog opens. */}
        {open && <PickerBody onPick={onPick} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({ onPick }: { onPick: (orderId: number) => void }) {
  const branch = useBranchCode();
  const [day, setDay] = useState(businessDate());
  const [search, setSearch] = useState("");
  const billNumber = search.replace(/\D/g, "");
  const { data, total, loading } = useApiData<EinvoiceBill[]>(
    "/einvoices/bills",
    billNumber ? { branch, billNumber } : { branch, businessDate: day },
    [],
    "Không thể tải danh sách bill",
  );
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!billNumber && <DatePicker value={day} onChange={setDay} max={businessDate()} label="Ngày kinh doanh" />}
        <Input
          type="search"
          inputMode="numeric"
          placeholder="Tìm số bill…"
          aria-label="Tìm theo số bill"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-44"
        />
      </div>
      <ListLimitNotice shown={data.length} total={total} noun="bill" hint="Tìm theo số bill để thấy bill khác." />
      <div className="max-h-[60dvh] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={ReceiptTextIcon} title="Không có bill đã thanh toán" />
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {data.map((bill) => {
              const billTotal = Number(bill.finalAmount);
              const over = bill.allocated > billTotal;
              return (
                <li key={bill.orderId}>
                  <button
                    type="button"
                    onClick={() => onPick(bill.orderId)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{billLabel({ id: bill.orderId, billNumber: bill.billNumber })}</span>
                    <span className="text-muted-foreground">
                      {bill.roomName ?? "—"} · {formatTime(bill.endTime)}
                    </span>
                    <span className="ml-auto tabular-nums">{formatMoney(bill.finalAmount)}</span>
                    <span className={cn("w-full text-xs text-muted-foreground tabular-nums", over && "text-warning")}>
                      {bill.einvoiceCount
                        ? `Đã chia ${formatMoney(bill.allocated)} vào ${bill.einvoiceCount} hóa đơn${
                            over ? " (vượt bill)" : bill.allocated === billTotal ? " (đủ)" : ""
                          }`
                        : "Chưa có hóa đơn điện tử"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Cắm vào trang**

Trong `page.tsx`:
- Thêm import `EinvoiceList`, `BillPickerDialog`.
- Thêm state:

```ts
  const [pickerOpen, setPickerOpen] = useState(false);
  // Bumped after a save / issue so the list and its counts reload (the setter
  // is added in Task 14, where the panel reports changes).
  const [listVersion] = useState(0);
```

- Xóa dòng `void select;`.
- Thay khối `<EmptyState … />` trong `<div className="flex flex-col gap-4">` bằng:

```tsx
        <div className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EinvoiceList
            version={listVersion}
            selectedId={selected && selected.einvoiceId !== "new" ? selected.einvoiceId : null}
            onSelect={(orderId, einvoiceId) => select({ orderId, einvoiceId })}
            onCreate={() => setPickerOpen(true)}
          />
          <EmptyState
            icon={FileCheck2Icon}
            title={selected ? `Bill #${selected.orderId}` : "Chọn một hóa đơn"}
            description="Hoặc bấm Tạo HĐĐT mới để chia một bill."
            className="rounded-xl border"
          />
        </div>
```

- Trước `<ConfirmDialog`, thêm:

```tsx
      <BillPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(orderId) => {
          setPickerOpen(false);
          select({ orderId, einvoiceId: "new" });
        }}
      />
```

(Task 14 đổi `const [listVersion] = useState(0);` thành `const [listVersion, setListVersion] = useState(0);`.)

- [ ] **Step 4: Chạy thử, commit**

```bash
cd 502-frontend && npm run lint && npm run build
```

Trên trình duyệt:
- Danh sách trống có `EmptyState`.
- Tab Nháp đổi ô ngày thành "Mọi ngày".
- "Tạo HĐĐT mới" mở dialog, liệt kê bill hôm nay kèm "Chưa có hóa đơn điện tử"; chọn một bill thì dialog đóng.
- Ở 375px không có thanh cuộn ngang.

```bash
git add 502-frontend/src/components/einvoices "502-frontend/src/app/[branch]/sales/einvoices/page.tsx"
git commit -m "feat(web): danh sách hóa đơn điện tử gom theo bill và dialog chọn bill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Panel bill và form nháp (người mua, dòng hàng, lưu/xóa)

Spec §10.2 (trừ phần xuất), §10.3, §5.

**Files:**
- Create: `502-frontend/src/components/einvoices/number-input.tsx`, `buyer-fields.tsx`, `einvoice-lines.tsx`, `einvoice-editor.tsx`, `bill-einvoices-panel.tsx`
- Modify: `502-frontend/src/app/[branch]/sales/einvoices/page.tsx`

**Interfaces:**
- Consumes: `lib/einvoice.ts` (Task 11), `EinvoiceBillDetail`, `EinvoiceDetail`, `TaxPayer`, `EinvoiceConfigView`.
- Produces:
  - `MoneyInput({value: number | null; onChange})`, `DecimalInput({value: number; onChange})`.
  - `BuyerFields({value: BuyerValue; previous: BuyerValue | null; disabled; onChange})`, với `BuyerValue = {buyerTaxCode, buyerName, buyerAddress, buyerEmail: string}`.
  - `EinvoiceLines({lines; bill: EinvoiceBillDetail["order"]; defaultRate: VatRate; missing: number; disabled; onChange})`.
  - `EinvoiceEditor({bill, einvoice: EinvoiceDetail | null, previous: BuyerValue | null, config, onSaved: (row) => void, onDeleted: (id: number | null) => void, onDirtyChange: (dirty: boolean) => void, actions?: ReactNode})`. `actions` là chỗ Task 15 cắm nút Xuất.
  - `BillEinvoicesPanel({orderId, initialEinvoiceId, config, onChanged, onDirtyChange})`.

- [ ] **Step 1: `number-input.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type InputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode">;

// Whole đồng with thousands separators while typing.
export function MoneyInput({
  value,
  onChange,
  ...props
}: InputProps & { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      value={value === null ? "" : value.toLocaleString("vi-VN")}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
        onChange(digits ? Number(digits) : null);
      }}
    />
  );
}

// A quantity (up to 3 decimals, "," or "."): the text is kept while typing
// ("1," is not a number yet); key it by its value so an outside change shows.
export function DecimalInput({
  value,
  onChange,
  ...props
}: InputProps & { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => String(value).replace(".", ","));
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d,.]/g, "");
        setText(next);
        const number = Number(next.replace(",", "."));
        if (Number.isFinite(number) && number > 0) onChange(Math.round(number * 1000) / 1000);
      }}
      onBlur={() => setText(String(value).replace(".", ","))}
    />
  );
}
```

- [ ] **Step 2: `buyer-fields.tsx`**

```tsx
"use client";

import { useState } from "react";
import { CopyIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TaxPayer } from "@/lib/types";

export interface BuyerValue {
  buyerTaxCode: string;
  buyerName: string;
  buyerAddress: string;
  buyerEmail: string;
}

// Người mua of one small invoice (spec §10.2). Tra looks the MST up (tax
// portal, then xinvoice); it may fail, then the fields are typed by hand.
// Empty = khách lẻ.
export function BuyerFields({
  value,
  previous,
  disabled,
  onChange,
}: {
  value: BuyerValue;
  previous: BuyerValue | null;
  disabled: boolean;
  onChange: (value: BuyerValue) => void;
}) {
  const notify = useNotify();
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<TaxPayer | null>(null);

  const lookup = async () => {
    const taxCode = value.buyerTaxCode.trim();
    if (!taxCode) return;
    setLooking(true);
    try {
      const res = await api.get<TaxPayer>(`/einvoice/tax-payers/${encodeURIComponent(taxCode)}`);
      setFound(res.data);
      onChange({ ...value, buyerTaxCode: res.data.taxCode, buyerName: res.data.name, buyerAddress: res.data.address });
    } catch (error) {
      setFound(null);
      notify.error(error, "Không tra được MST, hãy nhập tay tên và địa chỉ");
    } finally {
      setLooking(false);
    }
  };

  return (
    <FieldSet>
      <FieldLegend variant="label">Người mua</FieldLegend>
      <FieldGroup className="gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-full sm:w-56">
            <FieldLabel htmlFor="buyer-tax-code">MST</FieldLabel>
            <Input
              id="buyer-tax-code"
              inputMode="numeric"
              value={value.buyerTaxCode}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, buyerTaxCode: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup();
                }
              }}
            />
          </Field>
          <Button type="button" variant="outline" onClick={lookup} disabled={disabled || looking || !value.buyerTaxCode.trim()}>
            {looking ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
            Tra
          </Button>
          {previous && (
            <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange(previous)}>
              <CopyIcon data-icon="inline-start" />
              Chép từ HĐ trước
            </Button>
          )}
        </div>
        {found && (
          <p className={cn("text-xs", found.active ? "text-muted-foreground" : "text-warning")}>
            {found.active
              ? `Đã tra (${found.source === "gdt" ? "cổng thuế" : "xinvoice"}): ${found.status}`
              : `Cảnh báo: ${found.status}`}
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="buyer-name">Tên đơn vị</FieldLabel>
          <Input
            id="buyer-name"
            placeholder="Bỏ trống: khách lẻ"
            maxLength={400}
            value={value.buyerName}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, buyerName: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="buyer-address">Địa chỉ</FieldLabel>
          <Input
            id="buyer-address"
            maxLength={400}
            value={value.buyerAddress}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, buyerAddress: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="buyer-email">Email</FieldLabel>
          <Input
            id="buyer-email"
            type="email"
            maxLength={200}
            value={value.buyerEmail}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, buyerEmail: e.target.value })}
          />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
```

- [ ] **Step 3: `einvoice-lines.tsx`**

```tsx
"use client";

import { ListPlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DecimalInput, MoneyInput } from "@/components/einvoices/number-input";
import { fillerLine, lineAmountOf, MAX_LINES, VAT_RATES } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import type { EinvoiceBillDetail, EinvoiceLine, VatRate } from "@/lib/types";

// Dòng hàng of a small invoice (spec §10.2): typed freely, taken from the
// bill, or a filler line that brings the total to the amount.
export function EinvoiceLines({
  lines,
  bill,
  defaultRate,
  missing,
  disabled,
  onChange,
}: {
  lines: EinvoiceLine[];
  bill: EinvoiceBillDetail["order"];
  defaultRate: VatRate;
  missing: number;
  disabled: boolean;
  onChange: (lines: EinvoiceLine[]) => void;
}) {
  const full = lines.length >= MAX_LINES;

  // A change of price, quantity or rate drops the fixed VAT of a filler line.
  const set = (index: number, patch: Partial<EinvoiceLine>) =>
    onChange(
      lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.unitPrice !== undefined || patch.quantity !== undefined || patch.vatRate !== undefined) {
          delete next.vatAmount;
        }
        return next;
      }),
    );

  const fromBill: { label: string; line: EinvoiceLine }[] = [
    ...(bill.billedHours > 0 && Number(bill.pricePerHour) > 0
      ? [
          {
            label: `Tiền giờ ${bill.billedHours.toLocaleString("vi-VN")} giờ × ${formatMoney(bill.pricePerHour)}`,
            line: {
              name: `Tiền giờ phòng ${bill.room?.name ?? ""}`.trim(),
              unit: "Giờ",
              quantity: bill.billedHours,
              unitPrice: Math.round(Number(bill.pricePerHour)),
              vatRate: defaultRate,
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
        vatRate: defaultRate,
      },
    })),
  ];

  return (
    <FieldSet>
      <FieldLegend variant="label">Dòng hàng</FieldLegend>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full}
          onClick={() => onChange([...lines, { name: "", unit: "", quantity: 1, unitPrice: 0, vatRate: defaultRate }])}
        >
          <PlusIcon data-icon="inline-start" />
          Thêm dòng
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={disabled || full || fromBill.length === 0}>
              <ListPlusIcon data-icon="inline-start" />
              Lấy món từ bill
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            {fromBill.map((entry, index) => (
              <DropdownMenuItem key={index} onSelect={() => onChange([...lines, entry.line])}>
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full || missing <= 0}
          onClick={() => {
            const filler = fillerLine(missing, defaultRate);
            if (filler) onChange([...lines, filler]);
          }}
        >
          Thêm dòng bù phần còn thiếu
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dòng hàng.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <li
              key={index}
              className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_5rem_7.5rem_6rem_auto] sm:items-center sm:border-0 sm:p-0"
            >
              <Input
                aria-label={`Tên hàng dòng ${index + 1}`}
                placeholder="Tên hàng, dịch vụ"
                maxLength={300}
                value={line.name}
                disabled={disabled}
                onChange={(e) => set(index, { name: e.target.value })}
                className="col-span-2 sm:col-span-1"
              />
              <Input
                aria-label={`ĐVT dòng ${index + 1}`}
                placeholder="ĐVT"
                maxLength={30}
                value={line.unit}
                disabled={disabled}
                onChange={(e) => set(index, { unit: e.target.value })}
              />
              <DecimalInput
                key={`${index}:${line.quantity}`}
                aria-label={`Số lượng dòng ${index + 1}`}
                value={line.quantity}
                disabled={disabled}
                onChange={(quantity) => set(index, { quantity })}
              />
              <MoneyInput
                aria-label={`Đơn giá trước VAT dòng ${index + 1}`}
                value={line.unitPrice}
                disabled={disabled}
                onChange={(unitPrice) => set(index, { unitPrice: unitPrice ?? 0 })}
              />
              <Select
                value={String(line.vatRate)}
                disabled={disabled}
                onValueChange={(rate) => set(index, { vatRate: Number(rate) as VatRate })}
              >
                <SelectTrigger aria-label={`Thuế suất dòng ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {VAT_RATES.map((rate) => (
                      <SelectItem key={rate} value={String(rate)}>
                        VAT {rate}%
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <span className="text-sm tabular-nums">{formatMoney(lineAmountOf(line))}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Xóa dòng ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FieldSet>
  );
}
```

- [ ] **Step 4: `einvoice-editor.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BuyerFields, type BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceLines } from "@/components/einvoices/einvoice-lines";
import { MoneyInput } from "@/components/einvoices/number-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { defaultVatRate, issueProblem, totalsOf } from "@/lib/einvoice";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail, EinvoiceLine } from "@/lib/types";

interface FormState extends BuyerValue {
  amount: number | null;
  lines: EinvoiceLine[];
}

const formOf = (einvoice: EinvoiceDetail | null): FormState => ({
  amount: einvoice ? Number(einvoice.amount) : null,
  buyerTaxCode: einvoice?.buyerTaxCode ?? "",
  buyerName: einvoice?.buyerName ?? "",
  buyerAddress: einvoice?.draft?.buyerAddress ?? "",
  buyerEmail: einvoice?.draft?.buyerEmail ?? "",
  lines: einvoice?.draft?.lines ?? [],
});

// One draft (or a new, unsaved one) of a bill (spec §10.2). It is remounted
// per invoice (key), so the form starts from the saved draft.
export function EinvoiceEditor({
  bill,
  einvoice,
  previous,
  config,
  onSaved,
  onDeleted,
  onDirtyChange,
  actions,
}: {
  bill: EinvoiceBillDetail["order"];
  einvoice: EinvoiceDetail | null;
  previous: BuyerValue | null;
  config: EinvoiceConfigView | null;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (id: number | null) => void;
  onDirtyChange: (dirty: boolean) => void;
  // Task 15: the issue controls, given the problem that blocks issuing.
  actions?: (state: { dirty: boolean; problem: string | null }) => React.ReactNode;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const canWrite = can(user, "einvoices.write") && bill.status === "COMPLETED";
  const saved = useMemo(() => formOf(einvoice), [einvoice]);
  const [form, setForm] = useState<FormState>(saved);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const defaultRate = defaultVatRate(bill.taxPercent);
  const totals = totalsOf(form.lines);
  const missing = (form.amount ?? 0) - totals.total;
  const problem = form.amount ? issueProblem(form.amount, form.lines) : "Nhập số tiền của hóa đơn";
  void config;

  const body = () => ({
    amount: form.amount,
    buyerTaxCode: form.buyerTaxCode.trim() || null,
    buyerName: form.buyerName.trim() || null,
    buyerAddress: form.buyerAddress.trim() || null,
    buyerEmail: form.buyerEmail.trim() || null,
    lines: form.lines.map((line) => ({ ...line, name: line.name.trim(), unit: line.unit.trim() })),
  });

  const save = async () => {
    if (!form.amount) return notify.warning("Nhập số tiền của hóa đơn");
    if (form.lines.some((line) => !line.name.trim())) return notify.warning("Dòng hàng nào cũng cần tên");
    setSaving(true);
    try {
      const res = einvoice
        ? await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}`, body())
        : await api.post<EinvoiceDetail>("/einvoices", { orderId: bill.id, ...body() });
      notify.success("Đã lưu hóa đơn nháp");
      onSaved(res.data);
    } catch (error) {
      notify.error(error, "Không lưu được hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!einvoice) return;
    try {
      await api.delete(`/einvoices/${einvoice.id}`);
      notify.success("Đã xóa hóa đơn nháp");
      onDeleted(einvoice.id);
    } catch (error) {
      notify.error(error, "Không xóa được hóa đơn");
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {einvoice?.lastError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Lần gửi gần nhất bị lỗi</AlertTitle>
          <AlertDescription>{einvoice.lastError}</AlertDescription>
        </Alert>
      )}
      <Field className="max-w-60">
        <FieldLabel htmlFor="einvoice-amount">Số tiền (đã gồm VAT)</FieldLabel>
        <MoneyInput
          id="einvoice-amount"
          value={form.amount}
          disabled={!canWrite}
          onChange={(amount) => setForm({ ...form, amount })}
        />
      </Field>
      <BuyerFields value={form} previous={previous} disabled={!canWrite} onChange={(buyer) => setForm({ ...form, ...buyer })} />
      <EinvoiceLines
        lines={form.lines}
        bill={bill}
        defaultRate={defaultRate}
        missing={missing}
        disabled={!canWrite}
        onChange={(lines) => setForm({ ...form, lines })}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums sm:ml-auto sm:w-72">
        <dt className="text-muted-foreground">Trước thuế</dt>
        <dd className="text-right">{formatMoney(totals.amountWithoutVat)}</dd>
        <dt className="text-muted-foreground">VAT</dt>
        <dd className="text-right">{formatMoney(totals.vatAmount)}</dd>
        <dt className="font-medium">Tổng</dt>
        <dd className="text-right font-medium">{formatMoney(totals.total)}</dd>
        {form.amount !== null && missing !== 0 && (
          <>
            <dt className="text-destructive">{missing > 0 ? "Còn thiếu" : "Thừa"}</dt>
            <dd className="text-right text-destructive">{formatMoney(Math.abs(missing))}</dd>
          </>
        )}
      </dl>
      {problem && missing === 0 && <p className="text-sm text-destructive">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <Button onClick={save} disabled={saving || !dirty}>
            {saving && <Spinner data-icon="inline-start" />}
            Lưu nháp
          </Button>
        )}
        {canWrite &&
          (einvoice ? (
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              Xóa
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onDeleted(null)}>
              Bỏ
            </Button>
          ))}
        {dirty && <span className="text-sm text-muted-foreground">Có thay đổi chưa lưu</span>}
        {einvoice && actions?.({ dirty, problem })}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Xóa hóa đơn nháp?"
        description="Nháp và các dòng hàng của nó bị xóa hẳn."
        confirmLabel="Xóa"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
```

(`void config;` giữ tham số cho Task 15. Task 15 dùng `config` và xóa dòng này.)

- [ ] **Step 5: `bill-einvoices-panel.tsx`**

```tsx
"use client";

import { useCallback, useState } from "react";
import { FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import type { BuyerValue } from "@/components/einvoices/buyer-fields";
import { EinvoiceEditor } from "@/components/einvoices/einvoice-editor";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { billLabel, formatDateTime, formatMoney } from "@/lib/format";
import { einvoiceStatusBadge } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { EinvoiceBillDetail, EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

const buyerOf = (einvoice: EinvoiceDetail | undefined): BuyerValue | null =>
  einvoice
    ? {
        buyerTaxCode: einvoice.buyerTaxCode ?? "",
        buyerName: einvoice.buyerName ?? "",
        buyerAddress: einvoice.draft?.buyerAddress ?? "",
        buyerEmail: einvoice.draft?.buyerEmail ?? "",
      }
    : null;

const DOT: Record<string, string> = {
  secondary: "bg-muted-foreground",
  destructive: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
};

// A bill and its small invoices (spec §10.2): the header with what is split,
// HĐ 1, HĐ 2… and + to add one, then the chosen invoice.
export function BillEinvoicesPanel({
  orderId,
  initialEinvoiceId,
  config,
  onChanged,
  onDirtyChange,
}: {
  orderId: number;
  initialEinvoiceId: number | "new";
  config: EinvoiceConfigView | null;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { user } = useAuth();
  const { data, loading, reload } = useApiData<EinvoiceBillDetail | null>(
    `/einvoices/bill/${orderId}`,
    {},
    null,
    "Không thể tải bill",
  );
  const [activeId, setActiveId] = useState<number | "new">(initialEinvoiceId);
  const [dirty, setDirty] = useState(false);
  const [pendingId, setPendingId] = useState<number | "new" | null>(null);

  const handleDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  const choose = (id: number | "new") => {
    if (id === activeId) return;
    if (dirty) setPendingId(id);
    else setActiveId(id);
  };
  const afterChange = (id: number | "new") => {
    reload();
    onChanged();
    setActiveId(id);
  };

  if (!data) {
    return loading ? <Skeleton className="h-96 w-full rounded-xl" /> : null;
  }
  const { order, einvoices, allocated } = data;
  const index = activeId === "new" ? einvoices.length : einvoices.findIndex((e) => e.id === activeId);
  const active = activeId === "new" ? null : (einvoices[index] ?? null);
  const billTotal = Number(order.finalAmount);
  const editedAfter =
    !!order.editedAt && einvoices.some((e) => e.createdAt < (order.editedAt as string));
  const canAdd = can(user, "einvoices.write") && order.status === "COMPLETED";

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold">
            Bill {billLabel(order)} · {order.room?.name ?? "—"}
          </div>
          <div className="text-sm text-muted-foreground">Thanh toán {formatDateTime(order.endTime)}</div>
        </div>
        <div className="text-sm tabular-nums sm:text-right">
          <div>
            Tổng {formatMoney(order.finalAmount)} (VAT {formatMoney(order.taxAmount)})
          </div>
          <div className="text-muted-foreground">
            Đã chia {formatMoney(allocated)} · Còn {formatMoney(billTotal - allocated)}
          </div>
        </div>
      </div>
      {(Number(order.discountAmount) > 0 || Number(order.hourlyDiscountAmount) > 0) && (
        <p className="text-xs text-muted-foreground">
          Giảm giá trên bill: món {formatMoney(order.discountAmount)}, giờ {formatMoney(order.hourlyDiscountAmount)}.
        </p>
      )}
      {allocated > billTotal && (
        <p className="text-sm text-warning">
          Tổng các hóa đơn ({formatMoney(allocated)}) vượt tổng bill ({formatMoney(order.finalAmount)}).
        </p>
      )}
      {order.cancelledAt && <p className="text-sm text-warning">Bill đã hủy lúc {formatDateTime(order.cancelledAt)}.</p>}
      {editedAfter && (
        <p className="text-sm text-warning">Bill đã sửa lúc {formatDateTime(order.editedAt)}, sau khi tạo hóa đơn.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={String(activeId)} onValueChange={(value) => choose(value === "new" ? "new" : Number(value))}>
          <TabsList className="h-auto flex-wrap">
            {einvoices.map((einvoice, i) => {
              const badge = einvoiceStatusBadge(einvoice.status, einvoice.lastError);
              return (
                <TabsTrigger key={einvoice.id} value={String(einvoice.id)} title={badge.label}>
                  <span className={cn("size-2 rounded-full", DOT[badge.variant])} aria-hidden />
                  HĐ {i + 1}
                </TabsTrigger>
              );
            })}
            {activeId === "new" && <TabsTrigger value="new">HĐ {einvoices.length + 1} (mới)</TabsTrigger>}
          </TabsList>
        </Tabs>
        {canAdd && (
          <Button size="icon" variant="outline" aria-label="Thêm hóa đơn nhỏ" disabled={activeId === "new"} onClick={() => choose("new")}>
            <PlusIcon />
          </Button>
        )}
      </div>
      <Separator />

      {activeId !== "new" && !active ? (
        loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <EmptyState icon={FileCheck2Icon} title="Hóa đơn không còn" description="Chọn một hóa đơn khác của bill." />
        )
      ) : active && active.status !== "DRAFT" ? (
        <p className="text-sm text-muted-foreground">Hóa đơn {active.status === "ISSUED" ? "đã xuất" : "đang chờ đối chiếu"}.</p>
      ) : (
        <EinvoiceEditor
          key={String(activeId)}
          bill={order}
          einvoice={active}
          previous={buyerOf(einvoices[index - 1] ?? (activeId === "new" ? einvoices.at(-1) : undefined))}
          config={config}
          onSaved={(row) => afterChange(row.id)}
          onDeleted={(id) => afterChange(einvoices.find((e) => e.id !== id)?.id ?? "new")}
          onDirtyChange={handleDirty}
        />
      )}

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && setPendingId(null)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          handleDirty(false);
          if (pendingId !== null) setActiveId(pendingId);
          setPendingId(null);
        }}
      />
    </div>
  );
}
```

(Dòng `active && active.status !== "DRAFT"` là chỗ tạm. Task 15 thay bằng `IssuedView` và `UncertainBox`.)

- [ ] **Step 6: Cắm panel vào trang (điện thoại dùng `Sheet`)**

Trong `page.tsx`:
- Thêm import: `BillEinvoicesPanel`, `useIsMobile` (`@/hooks/use-mobile`) và `Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle` (`@/components/ui/sheet`).
- Đổi `const [listVersion] = useState(0);` thành `const [listVersion, setListVersion] = useState(0);`.
- Thêm `const isMobile = useIsMobile();` và:

```tsx
  const changed = () => {
    setListVersion((v) => v + 1);
    config.reload();
  };
  const panel = selected && (
    <BillEinvoicesPanel
      key={selected.orderId}
      orderId={selected.orderId}
      initialEinvoiceId={selected.einvoiceId}
      config={config.data}
      onChanged={changed}
      onDirtyChange={setDirty}
    />
  );
```

- Trong lưới, thay `<EmptyState … title={selected ? … } … />` bằng:

```tsx
          {!isMobile &&
            (panel ?? (
              <EmptyState
                icon={FileCheck2Icon}
                title="Chọn một hóa đơn"
                description="Hoặc bấm Tạo HĐĐT mới để chia một bill."
                className="rounded-xl border"
              />
            ))}
```

- Sau khối `<div className="flex flex-col gap-4">…</div>`, thêm:

```tsx
      {isMobile && (
        <Sheet open={!!selected} onOpenChange={(open) => !open && select(null)}>
          <SheetContent side="bottom" className="h-[100dvh] gap-0 overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Hóa đơn điện tử của bill</SheetTitle>
              <SheetDescription>Sửa, lưu nháp và xuất các hóa đơn nhỏ của bill</SheetDescription>
            </SheetHeader>
            <div className="p-2">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
```

- [ ] **Step 7: Chạy thử, commit**

```bash
cd 502-frontend && npm run lint && npm run build
```

Trên trình duyệt, với tài khoản `tn1_cs1`:
- **Tạo và sửa:** Tạo HĐĐT mới, chọn bill; nhập số tiền 1.000.000; Tra MST (thành công hoặc lỗi đều cho nhập tay); Lấy món từ bill; Thêm dòng bù. Tổng khớp 1.000.000 thì dòng "Còn thiếu" biến mất.
- **Lưu và xóa:** Lưu nháp thì hóa đơn hiện ở danh sách (tab Nháp). Thêm HĐ 2 bằng nút **+**, sửa rồi bấm HĐ 1 thì được hỏi "Bỏ thay đổi chưa lưu?". Xóa HĐ 2.
- **Điện thoại (375px):** panel mở thành sheet toàn màn hình, các dòng hàng xếp thành thẻ, không cuộn ngang.

```bash
git add 502-frontend/src/components/einvoices "502-frontend/src/app/[branch]/sales/einvoices/page.tsx"
git commit -m "feat(web): panel bill với các hóa đơn nhỏ, người mua, dòng hàng, dòng bù, lưu nháp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Xuất, "Không rõ", đã xuất, sửa số và cảnh báo trong bill sheet

Spec §10.2 (nút theo quyền, hóa đơn lỗi / không rõ / đã xuất), §9.2, §9.3 (ô Ngày HĐ), §10.4 (bill sheet).

**Files:**
- Create: `502-frontend/src/components/einvoices/issue-controls.tsx`, `uncertain-box.tsx`, `issued-view.tsx`, `edit-number-dialog.tsx`
- Modify: `502-frontend/src/components/einvoices/einvoice-editor.tsx`, `bill-einvoices-panel.tsx`
- Modify: `502-frontend/src/components/sales/bill-sheet.tsx`, `502-frontend/src/components/sales/edit-paid-bill-dialog.tsx`

**Interfaces:**
- Consumes: `EinvoiceDetail`, `EinvoiceConfigView`, `DatePicker` với `min`/`today` (Task 11).
- Produces:
  - `IssueControls({einvoice, config, problem, onIssued})`;
  - `UncertainBox({einvoice, onChanged})`;
  - `IssuedView({einvoice, onChanged})`;
  - `EditNumberDialog({einvoice, open, onOpenChange, onSaved})`;
  - `EditPaidBillDialog` nhận thêm `warning?: string | null`.

- [ ] **Step 1: `issue-controls.tsx`**

```tsx
"use client";

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { formatDate, toDateInput } from "@/lib/format";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// Ngày HĐ + Xuất (chain manager, spec §9.3): the date cannot be before the
// newest invoice of the symbol, has no upper bound, and a date after today
// is confirmed first. The answer is always the row: ISSUED, DRAFT with the
// error, or UNCERTAIN.
export function IssueControls({
  einvoice,
  config,
  problem,
  onIssued,
}: {
  einvoice: EinvoiceDetail;
  config: EinvoiceConfigView | null;
  problem: string | null;
  onIssued: (row: EinvoiceDetail) => void;
}) {
  const notify = useNotify();
  const today = toDateInput();
  const min = config?.minInvoiceDate ?? undefined;
  const [date, setDate] = useState(() => (min && today < min ? min : today));
  const [issuing, setIssuing] = useState(false);
  const [confirmFuture, setConfirmFuture] = useState(false);
  const blocked = !config?.configured ? "Minvoice chưa được cấu hình cho cơ sở này" : problem;

  const send = async () => {
    setIssuing(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/issue`, {
        invoiceDate: date,
        confirmFutureDate: date > today,
      });
      const row = res.data;
      if (row.status === "ISSUED") notify.success(`Đã xuất hóa đơn số ${row.invoiceNumber ?? "?"}`);
      else if (row.status === "UNCERTAIN") notify.warning("Không rõ Minvoice đã tạo hóa đơn chưa. Hãy đối chiếu trên Minvoice.");
      else toast.error(row.lastError ?? "Minvoice từ chối hóa đơn");
      onIssued(row);
      return true;
    } catch (error) {
      notify.error(error, "Không xuất được hóa đơn");
      return false;
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1 sm:ml-auto sm:w-auto sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker value={date} onChange={setDate} min={min} today={today} label="Ngày hóa đơn" align="end" />
        <Button onClick={() => (date > today ? setConfirmFuture(true) : void send())} disabled={issuing || !!blocked}>
          {issuing ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          Xuất
        </Button>
      </div>
      {min && (
        <span className="text-xs text-muted-foreground">
          Từ {formatDate(min)} trở đi (hóa đơn số {config?.latestInvoiceNumber ?? "?"} cùng ký hiệu mang ngày này)
        </span>
      )}
      {blocked && <span className="text-xs text-muted-foreground">{blocked}</span>}
      <ConfirmDialog
        open={confirmFuture}
        onOpenChange={setConfirmFuture}
        title="Xuất với ngày sau hôm nay?"
        description={`Mọi hóa đơn sau cùng ký hiệu ${config?.symbolCode ?? ""} sẽ phải mang ngày từ ${formatDate(date)} trở đi.`}
        confirmLabel="Xuất"
        onConfirm={send}
      />
    </div>
  );
}
```

- [ ] **Step 2: `uncertain-box.tsx`**

```tsx
"use client";

import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceDetail } from "@/lib/types";

// "Không rõ" (spec §9.2): the send got no answer. The chain manager looks on
// Minvoice and either types the number found or sends it back to draft.
export function UncertainBox({
  einvoice,
  onChanged,
}: {
  einvoice: EinvoiceDetail;
  onChanged: (row: EinvoiceDetail) => void;
}) {
  const { user } = useAuth();
  const notify = useNotify();
  const [number, setNumber] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notSentOpen, setNotSentOpen] = useState(false);

  const resolve = async (body: { found: boolean; invoiceNumber?: number }) => {
    setBusy(true);
    try {
      const res = await api.post<EinvoiceDetail>(`/einvoices/${einvoice.id}/resolve`, body);
      notify.success(body.found ? `Đã ghi số hóa đơn ${body.invoiceNumber}` : "Đã đưa về nháp, có thể xuất lại");
      onChanged(res.data);
      return true;
    } catch (error) {
      notify.error(error, "Không cập nhật được hóa đơn");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert className="border-warning">
      <TriangleAlertIcon className="text-warning" />
      <AlertTitle>Không rõ Minvoice đã tạo hóa đơn chưa</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          Lần gửi ngày {formatDate(einvoice.invoiceDate)}, ký hiệu {einvoice.symbolCode ?? "—"} không nhận được trả lời.
          Mở Minvoice, tìm hóa đơn {formatMoney(einvoice.amount)} của {einvoice.buyerName ?? "khách lẻ"} rồi chọn một
          trong hai.
        </p>
        {einvoice.lastError && <p className="text-xs">{einvoice.lastError}</p>}
        {can(user, "einvoices.issue") && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              inputMode="numeric"
              aria-label="Số hóa đơn trên Minvoice"
              placeholder="Số hóa đơn"
              className="w-36"
              value={number ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                setNumber(digits ? Number(digits) : null);
              }}
            />
            <Button size="sm" disabled={busy || !number} onClick={() => number && resolve({ found: true, invoiceNumber: number })}>
              Đã có — nhập số
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setNotSentOpen(true)}>
              Chưa có — gửi lại
            </Button>
          </div>
        )}
      </AlertDescription>
      <ConfirmDialog
        open={notSentOpen}
        onOpenChange={setNotSentOpen}
        title="Minvoice chưa có hóa đơn này?"
        description="Hóa đơn về lại nháp để xuất lần nữa. Nếu thật ra Minvoice đã tạo, xuất lại sẽ sinh hóa đơn trùng."
        confirmLabel="Về nháp"
        onConfirm={() => resolve({ found: false })}
      />
    </Alert>
  );
}
```

- [ ] **Step 3: `edit-number-dialog.tsx` và `issued-view.tsx`**

`edit-number-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import type { EinvoiceDetail } from "@/lib/types";

// Sửa số: when the number was changed by hand on Minvoice (spec §7.3).
export function EditNumberDialog({
  einvoice,
  open,
  onOpenChange,
  onSaved,
}: {
  einvoice: EinvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: EinvoiceDetail) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open && (
          <NumberForm
            einvoice={einvoice}
            onCancel={() => onOpenChange(false)}
            onDone={(row) => {
              onOpenChange(false);
              onSaved(row);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NumberForm({
  einvoice,
  onCancel,
  onDone,
}: {
  einvoice: EinvoiceDetail;
  onCancel: () => void;
  onDone: (row: EinvoiceDetail) => void;
}) {
  const notify = useNotify();
  const [value, setValue] = useState(einvoice.invoiceNumber ? String(einvoice.invoiceNumber) : "");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoiceNumber = Number(value);
    if (!Number.isInteger(invoiceNumber) || invoiceNumber < 1) return;
    setSaving(true);
    try {
      const res = await api.patch<EinvoiceDetail>(`/einvoices/${einvoice.id}/number`, { invoiceNumber });
      notify.success(`Đã sửa số hóa đơn thành ${invoiceNumber}`);
      onDone(res.data);
    } catch (error) {
      notify.error(error, "Không sửa được số hóa đơn");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Sửa số hóa đơn</DialogTitle>
        <DialogDescription>Chỉ dùng khi số trên Minvoice đã bị sửa tay. Số mới phải khớp với Minvoice.</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="einvoice-number">Số hóa đơn</FieldLabel>
        <Input
          id="einvoice-number"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 9))}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Hủy
        </Button>
        <Button type="submit" disabled={saving || !value}>
          {saving && <Spinner data-icon="inline-start" />}
          Lưu
        </Button>
      </DialogFooter>
    </form>
  );
}
```

`issued-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PencilIcon, TriangleAlertIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EditNumberDialog } from "@/components/einvoices/edit-number-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { EinvoiceDetail } from "@/lib/types";

// An issued invoice: only its header is kept (spec §4).
export function IssuedView({
  einvoice,
  onChanged,
}: {
  einvoice: EinvoiceDetail;
  onChanged: (row: EinvoiceDetail) => void;
}) {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {einvoice.lastError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{einvoice.lastError}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Số hóa đơn</dt>
        <dd className="flex items-center gap-2 font-medium tabular-nums">
          {einvoice.invoiceNumber ?? "—"}
          {can(user, "einvoices.issue") && (
            <Button size="icon" variant="ghost" className="size-7" aria-label="Sửa số hóa đơn" onClick={() => setEditOpen(true)}>
              <PencilIcon />
            </Button>
          )}
        </dd>
        <dt className="text-muted-foreground">Ký hiệu</dt>
        <dd>{einvoice.symbolCode ?? "—"}</dd>
        <dt className="text-muted-foreground">Ngày hóa đơn</dt>
        <dd>{formatDate(einvoice.invoiceDate)}</dd>
        <dt className="text-muted-foreground">Người mua</dt>
        <dd>
          {einvoice.buyerName ?? "Khách lẻ"}
          {einvoice.buyerTaxCode ? ` · MST ${einvoice.buyerTaxCode}` : ""}
        </dd>
        <dt className="text-muted-foreground">Số tiền</dt>
        <dd className="tabular-nums">
          {formatMoney(einvoice.amount)} (VAT {formatMoney(einvoice.vatAmount)})
        </dd>
        <dt className="text-muted-foreground">Người xuất</dt>
        <dd>
          {einvoice.issuedBy?.fullName ?? "—"} · {formatDateTime(einvoice.issuedAt)}
        </dd>
        {einvoice.numberEditedAt && (
          <>
            <dt className="text-muted-foreground">Sửa số</dt>
            <dd>
              {einvoice.numberEditedBy?.fullName ?? "—"} · {formatDateTime(einvoice.numberEditedAt)}
            </dd>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">Chi tiết dòng hàng xem trên Minvoice.</p>
      <EditNumberDialog einvoice={einvoice} open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} />
    </div>
  );
}
```

- [ ] **Step 4: Cắm vào editor và panel**

`einvoice-editor.tsx`: xóa dòng `void config;`, thêm import `IssueControls` từ `@/components/einvoices/issue-controls`, xóa prop `actions` (cả trong kiểu props) và thay dòng `{einvoice && actions?.({ dirty, problem })}` bằng:

```tsx
        {einvoice && can(user, "einvoices.issue") && (
          <IssueControls
            einvoice={einvoice}
            config={config}
            problem={dirty ? "Lưu nháp trước khi xuất" : problem}
            onIssued={onSaved}
          />
        )}
```

`bill-einvoices-panel.tsx`: thêm import `IssuedView`, `UncertainBox`, và thay khối tạm:

```tsx
      ) : active && active.status !== "DRAFT" ? (
        <p className="text-sm text-muted-foreground">Hóa đơn {active.status === "ISSUED" ? "đã xuất" : "đang chờ đối chiếu"}.</p>
      ) : (
```

bằng:

```tsx
      ) : active?.status === "ISSUED" ? (
        <IssuedView einvoice={active} onChanged={(row) => afterChange(row.id)} />
      ) : active?.status === "UNCERTAIN" ? (
        <UncertainBox einvoice={active} onChanged={(row) => afterChange(row.id)} />
      ) : active?.status === "SENDING" ? (
        <p className="text-sm text-muted-foreground">Đang gửi lên Minvoice…</p>
      ) : (
```

- [ ] **Step 5: Cảnh báo trong bill sheet**

`components/sales/edit-paid-bill-dialog.tsx`:
- Thêm `warning?: string | null;` vào props của `EditPaidBillDialog` (kiểu và destructuring), truyền `warning={warning}` xuống `<EditForm …>`.
- Thêm `warning` vào props của `function EditForm`.
- Ngay sau `</DialogDescription>` (khoảng dòng 310) thêm:

```tsx
        {warning && <p className="text-sm text-warning">{warning}</p>}
```

`components/sales/bill-sheet.tsx`, trong `BillDetail`, trước `return`:

```ts
  // Voiding or correcting a bill never touches its e-invoices on Minvoice.
  const einvoiceCount = order?._count?.einvoices ?? 0;
  const einvoiceNote = einvoiceCount
    ? `Bill có ${einvoiceCount} hóa đơn điện tử (${order?.einvoices?.length ?? 0} đã xuất).`
    : null;
```

- `<EditPaidBillDialog …>` thêm `warning={einvoiceNote && `${einvoiceNote} Sửa bill không sửa hóa đơn trên Minvoice.`}` và đổi `setOrder(saved);` thành `setOrder((prev) => ({ ...saved, _count: prev?._count, einvoices: prev?.einvoices }));`, vì response sửa bill không mang hai trường này.
- `<ReasonDialog …>` của Hủy hóa đơn: đổi `description` thành:

```tsx
        description={
          <>
            {`Hàng đã bán được hoàn lại kho, phiếu thu ${formatMoney(order?.finalAmount)} bị hủy và doanh thu giảm tương ứng. Hóa đơn vẫn được lưu để đối chiếu.`}
            {einvoiceNote && (
              <span className="mt-2 block text-warning">{`${einvoiceNote} Hủy bill không hủy hóa đơn trên Minvoice.`}</span>
            )}
          </>
        }
```

- [ ] **Step 6: Chạy thử, commit**

```bash
cd 502-frontend && npm run lint && npm run build
```

Trên trình duyệt với backend nối Minvoice giả (Task 17 Step 2), tài khoản `admin`:
- **Xuất một nháp đã khớp tổng:** toast "Đã xuất hóa đơn số 1001"; panel chuyển sang phần đầu hóa đơn; danh sách hiện "Đã xuất · số 1001".
- **Ngày HĐ:** nháp khác có ô ngày không chọn được ngày trước hôm nay; chọn ngày mai thì phải xác nhận.
- **Sửa số:** trùng thì toast lỗi 409, không trùng thì lưu được.
- **"Không rõ":** Minvoice giả trả `drop` thì hóa đơn thành "Không rõ". "Chưa có — gửi lại" đưa về nháp; "Đã có — nhập số" ghi số.
- **Bill sheet:** bill có hóa đơn điện tử thì dialog Sửa và Hủy hiện dòng cảnh báo.

```bash
git add 502-frontend/src/components
git commit -m "feat(web): xuất hóa đơn điện tử, đối chiếu Không rõ, sửa số, cảnh báo khi sửa/hủy bill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Tài liệu và rà quy tắc tài nguyên

Spec §11, §13, §15.

**Files:**
- Modify: `CLAUDE.md`, `DEPLOYMENT.md`, `docs/security-review.md`
- Modify (nếu có quy ước mới): `docs/resource-rules.md`

- [ ] **Step 1: `CLAUDE.md`**

- **Phần "Implemented"** (đoạn liệt kê tính năng): thêm "hóa đơn điện tử qua Minvoice (chia bill thành hóa đơn nhỏ, nháp, xuất bởi quản lý hệ thống)".
- **Danh sách migration:** thêm `` `20261003000000_einvoices` adds `Branch.taxCode`, `EinvoiceConfig` and `Einvoice` (§6.18) ``.
- **Backend architecture:** thêm một mục **E-invoices** (`src/einvoice`, `EinvoiceModule`) mô tả:
  - quyền: `EINVOICE_WRITERS`/`EINVOICE_READERS`/`CHAIN_ONLY`;
  - `EinvoiceConfig` mã hóa bằng `EINVOICE_SECRET`, `needsLogin`;
  - client `minvoice-client.ts` (API web không chính thức; `MINVOICE_URL_TEMPLATE` chỉ ngoài production);
  - quy tắc gửi lại trong `einvoice-sender.ts` và `classify-send-error.ts` (đăng nhập lại, lấy lại dải, gửi lại một lần; `UNCERTAIN` không bao giờ tự gửi lại; lỗi ngày không thử lại);
  - `issue` trả 200 kèm dòng; `SENDING` → `UNCERTAIN` khi khởi động;
  - `draft = null` khi `ISSUED`;
  - ngày hóa đơn chỉ chặn dưới;
  - `paymentMethod` luôn `TM/CK`;
  - tra MST cổng thuế rồi xinvoice (bộ đệm 1000/7 ngày, 10 lần/30 s);
  - lỗi phía ngoài trả 424 (vì Cloudflare);
  - `GET /orders/:id` kèm `_count.einvoices`;
  - xóa dữ liệu ghi `einvoices`;
  - e2e `test/einvoice.e2e-spec.ts` với `test/fake-minvoice.ts`.
- **Frontend architecture:** thêm một mục **Hóa đơn điện tử** mô tả:
  - trang `/[branch]/sales/einvoices`, khung Minvoice (chỉ tên công ty);
  - danh sách gom theo bill (tab Nháp/Lỗi/Không rõ bỏ qua ngày);
  - dialog chọn bill, panel "HĐ n" + **+**;
  - `lib/einvoice.ts` bản sao `einvoice-math.ts`;
  - `DatePicker` `min`/`today`; ô MST ở trang Cơ sở.
- **Commands:** thêm dòng `npx ts-node test/fake-minvoice.ts 4555  # Minvoice giả để thử trên trình duyệt`.

- [ ] **Step 2: `DEPLOYMENT.md`**

Thêm mục `### 6.18. Hóa đơn điện tử (migration \`20261003000000_einvoices\`)` sau §6.17, gồm:
1. Trước khi cập nhật: thêm `EINVOICE_SECRET=` vào `.env` gốc, giá trị từ `openssl rand -base64 32`. Thiếu biến này thì `docker compose up` báo lỗi và dừng. **Không đổi khóa sau này**: đổi khóa thì mọi cơ sở phải đăng nhập Minvoice lại. Sao lưu khóa cùng chỗ với các bí mật khác; bản sao lưu database không có khóa thì không đọc được mật khẩu Minvoice.
2. Migration tự chạy khi backend khởi động (thêm cột và hai bảng, không động dữ liệu cũ).
3. Server phải gọi ra được `https://*.minvoice.net`, `https://hoadondientu.gdt.gov.vn` và `https://api.xinvoice.vn` (HTTPS ra ngoài; Cloudflare Tunnel không ảnh hưởng chiều ra).
4. Sau khi cập nhật:
   - Quản lý hệ thống nhập MST từng cơ sở ở trang Cơ sở.
   - Vào Bán hàng › Hóa đơn điện tử, đăng nhập tài khoản Minvoice, chọn ký hiệu.
   - Nên dùng tài khoản Minvoice chỉ có quyền tạo hóa đơn.

- [ ] **Step 3: `docs/security-review.md`**

Thêm mục "Hóa đơn điện tử (Minvoice)":
- Bí mật của bên thứ ba: mật khẩu và phiên Minvoice, mã hóa AES-256-GCM, khóa trong môi trường, không bao giờ nằm trong response hay log.
- API không chính thức có thể đổi.
- Ba địa chỉ gọi ra ngoài, MST kiểm tra định dạng trước khi ghép vào tên miền (chống bị lợi dụng gọi sang nơi khác), tắt tự đi theo redirect.
- Khóa tạm đăng nhập Minvoice theo cơ sở.
- xinvoice chỉ nhận MST người mua.
- Rủi ro còn lại: ai có cả database lẫn `.env` thì đọc được mật khẩu Minvoice.

- [ ] **Step 4: Rà checklist `docs/resource-rules.md` §5**

Mở `docs/resource-rules.md`, đi qua từng dòng của §5 với các file mới, và ghi kết quả vào mô tả commit. Kỳ vọng:
- danh sách có `take` và `select`;
- `X-Total-Count` ở `/einvoices` và `/einvoices/bills`, `ListLimitNotice` ở danh sách và dialog;
- `summary` trên pool báo cáo;
- index cho mọi truy vấn;
- map có trần (`TaxPayerService.cache` 1000, `inflight`, `xinvoiceCalls`, `relogins` theo cơ sở, `LoginThrottle`);
- không polling, không thư viện mới, không service Docker mới;
- log chỉ ghi lỗi;
- không load test (lý do: không đụng luồng bán hàng, pool hay cấu hình database).

Nếu gặp một quy ước mới chưa có trong file (ví dụ "lỗi của dịch vụ bên ngoài trả 424 vì Cloudflare"), thêm một dòng vào mục phù hợp.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md DEPLOYMENT.md docs/security-review.md docs/resource-rules.md
git commit -m "docs: hóa đơn điện tử (kiến trúc, triển khai, bảo mật, tài nguyên)

Rà docs/resource-rules.md §5: <ghi kết quả Step 4>. Task 10: <đã làm | bỏ qua, lý do>.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Kiểm tra toàn bộ và chạy thử trên trình duyệt với Minvoice giả

**Files:** không sửa code (trừ khi phát hiện lỗi; khi đó sửa, chạy lại test liên quan, commit riêng).

- [ ] **Step 1: Test và build**

```bash
docker start kara502-pg
cd 502-backend
npm run lint && npm run build && npm test
npx jest --config ./test/jest-e2e.json --runInBand test/einvoice.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/board.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts
cd ../502-frontend && npm run lint && npm run build
```

Expected: tất cả PASS, lint và build sạch. Chạy các bộ e2e **lần lượt từng bộ** (CLAUDE.md).

- [ ] **Step 2: Chạy Minvoice giả và app**

1. Terminal riêng: `cd 502-backend && npx ts-node test/fake-minvoice.ts 4555`. Nó in `MINVOICE_URL_TEMPLATE=http://127.0.0.1:4555/{taxCode}` và mật khẩu `minvoice-pass`.
2. Trong `.claude/launch.json` của repo, cấu hình `backend-preview` thêm `MINVOICE_URL_TEMPLATE=http://127.0.0.1:4555/{taxCode}` vào đầu lệnh `sh -c` (cùng chỗ `DATABASE_URL=…`). File này không được commit.
3. Chạy `backend-preview` và `frontend-preview` bằng công cụ preview.
4. Nạp dữ liệu demo nếu database test đang trống: `cd 502-backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/karaoke_test SEED_DEMO=1 npx prisma db seed`.

- [ ] **Step 3: Kịch bản trên trình duyệt** (`http://localhost:3002`)

1. **Cấu hình:** `admin` → trang Cơ sở → sửa cs1, MST `0107811836` → Bán hàng › Hóa đơn điện tử → đăng nhập `admin` / `minvoice-pass` → chọn ký hiệu → thấy tên "CÔNG TY TNHH KARAOKE THỬ NGHIỆM".
2. **Lập nháp:** `tn1_cs1` → mở phòng, gọi món, thanh toán → Hóa đơn điện tử → Tạo HĐĐT mới → chọn bill:
   - HĐ 1 là 1.000.000, người mua nhập tay, "Lấy món từ bill" + "Thêm dòng bù", Lưu nháp;
   - **+** HĐ 2 là số tiền bất kỳ, chép người mua, Lưu nháp.
3. **Xuất:** `admin` → tab Nháp → chọn HĐ 1 → Xuất → "Đã xuất hóa đơn số 1001". Xuất HĐ 2 với ngày mai: có hộp xác nhận.
4. **Bill sheet:** Quản lý bán hàng → mở bill → Hủy hóa đơn: có dòng "Bill có 2 hóa đơn điện tử (2 đã xuất)…" (bấm Hủy bỏ, không hủy thật).
5. **Điện thoại:** `resize_window` preset `mobile` (375 × 812): danh sách, dialog chọn bill, sheet panel không cuộn ngang. Chụp màn hình làm bằng chứng. Xong thì trả về preset `desktop`.
6. **Giao diện tối:** `resize_window colorScheme: dark`, xem lại trang và panel.

- [ ] **Step 4: Báo kết quả.** Nếu có lỗi thì sửa theo `superpowers:systematic-debugging`, rồi commit `fix(einvoice): …` hoặc `fix(web): …`.

---

### Task 18: Kiểm tra với Minvoice thật (MST 0107811836, ký hiệu 1C26MTT)

Spec §12 ("Sau khi code xong"). Người dùng đã cho phép gửi hóa đơn thật (01/10/2026). Hai hóa đơn ở task này là **hóa đơn thật của MST 0107811836**: có số thật, không xóa được, chỉ hủy hoặc điều chỉnh được trên Minvoice. Chỉ gửi đúng hai hóa đơn dưới đây.

**Files:**
- Tạm, **không commit**: `.claude/launch.json` (lệnh `backend-preview`).
- Sửa khi cần (Step 7): `502-backend/src/einvoice/einvoice-math.ts` (+ spec), `502-frontend/src/lib/einvoice.ts`, `502-frontend/src/components/einvoices/einvoice-lines.tsx`.

- [ ] **Step 1: Chạy app nối Minvoice thật, với khóa riêng**

1. Trong `.claude/launch.json`, lệnh `sh -c` của `backend-preview`:
   - **bỏ** `MINVOICE_URL_TEMPLATE=…` (nếu Task 17 đã thêm);
   - thêm `EINVOICE_SECRET=$(openssl rand -base64 32)` vào đầu lệnh.

   Lý do: khóa dev cố định nằm ngay trong code, ai có database test cũng giải mã được mật khẩu thật. Khóa ngẫu nhiên chỉ sống trong process này.
2. Chạy `backend-preview` và `frontend-preview`.
3. Đăng nhập Karaoke 502 bằng `admin` (mật khẩu seed `12345678` của database test, không phải mật khẩu Minvoice). Ở trang Cơ sở, đặt MST của cs1 là `0107811836`.

- [ ] **Step 2: Người dùng tự đăng nhập Minvoice (bước duy nhất cần người dùng)**

1. Mở `/cs1/sales/einvoices` trong khung trình duyệt. Agent được gõ tên đăng nhập `admin` vào ô Tên đăng nhập.
2. Nhắn người dùng: "Bạn gõ mật khẩu Minvoice của MST 0107811836 vào ô Mật khẩu trong khung trình duyệt rồi bấm Đăng nhập, xong thì báo mình."
3. Chờ người dùng báo xong. **Agent không gõ mật khẩu, không đọc lại nó từ đâu, không đưa nó vào lệnh nào.**

- [ ] **Step 3: Kiểm tra các API đọc**

1. Dropdown ký hiệu có `1C26MTT`. Chọn nó; khung hiện tên công ty mà Minvoice trả về (theo tra MST thì là "CÔNG TY CP THƯƠNG MẠI VÀ DỊCH VỤ PHƯƠNG LÂM").
2. `GET /api/einvoice/config?branch=cs1` (qua `read_network_requests` của trang) có `configured: true`, `symbolCode: "1C26MTT"`, và không chứa mật khẩu, cookie hay token.
3. Nếu Task 10 đã làm, `minInvoiceDate` là ngày của hóa đơn mới nhất của `1C26MTT` trên Minvoice.

- [ ] **Step 4: Hóa đơn A — luồng chính**

1. Ở cs1: mở một phòng thử, gọi 1 món, thanh toán.
2. Hóa đơn điện tử → Tạo HĐĐT mới → chọn bill đó.
3. Nhập:
   - Số tiền **10.000**;
   - người mua để trống (khách lẻ);
   - bấm **Thêm dòng bù phần còn thiếu** (được 9.091 + VAT 909 = 10.000).
4. Lưu nháp → Ngày HĐ để hôm nay → Xuất.
5. Kỳ vọng: toast "Đã xuất hóa đơn số …", trạng thái `ISSUED`. Ghi lại số hóa đơn.
6. Nếu Minvoice từ chối (`DRAFT` có `lastError`), ghi nguyên văn lỗi, sửa code theo lỗi (payload hoặc cách phân loại), chạy lại test và thử lại **cùng hóa đơn A**. Không tạo thêm hóa đơn khác.

- [ ] **Step 5: Hóa đơn B — VAT của dòng bù lệch 1 đồng**

Cùng bill:
1. Bấm **+**, Số tiền **10.004**, người mua để trống.
2. Thêm dòng bù: được 9.095 + VAT 909, lệch 1 đồng so với 10% của 9.095.
3. Lưu nháp → Xuất.

Kết quả:
- `ISSUED`: Minvoice chấp nhận, giữ nguyên code.
- `DRAFT` có `lastError`: Minvoice không chấp nhận, làm Step 7.

- [ ] **Step 6: Dọn**

1. Xóa cấu hình Minvoice (mật khẩu đã mã hóa) khỏi database test:

   ```bash
   docker exec kara502-pg psql -U postgres -d karaoke_test -c 'DELETE FROM "EinvoiceConfig";'
   ```

2. Dừng `backend-preview` (khóa ngẫu nhiên mất theo process).
3. Trả `.claude/launch.json` về như cũ.

- [ ] **Step 7: Chỉ khi Minvoice từ chối hóa đơn B**

1. Sửa `fillerLine` ở `einvoice-math.ts` và `lib/einvoice.ts` để trả `null` khi không có đơn giá nào đạt đúng tổng.
2. Sửa test `'lets the filler VAT take the đồng no single price reaches'` thành `expect(fillerLine(1000004, 10)).toBeNull()`.
3. Trong `einvoice-lines.tsx`, khi `fillerLine` trả `null` thì báo "Không khớp được đến từng đồng bằng một dòng, thêm hoặc sửa dòng khác" (`notify.warning`).
4. Chạy lại unit test và e2e, rồi commit `fix(einvoice): …`.

Hóa đơn B nằm lại ở trạng thái Lỗi và được xóa như nháp bình thường.

- [ ] **Step 8: Báo kết quả cho người dùng**

Báo:
- số của hóa đơn A (và B, nếu được xuất) trên MST 0107811836;
- Minvoice có chấp nhận VAT lệch 1 đồng không;
- mọi sửa đổi đã làm.

Nhắc người dùng rằng đây là hóa đơn thật. Việc hủy hay điều chỉnh chúng trên Minvoice là quyết định của người dùng và nằm ngoài phạm vi hệ thống. Ghi kết quả vào `CLAUDE.md` (mục E-invoices) nếu hành vi đã đổi, rồi commit.
