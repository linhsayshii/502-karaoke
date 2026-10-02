# Trang báo cáo tính theo từng hóa đơn điện tử — thiết kế

Ngày: 02/10/2026. Trạng thái: đã duyệt và đã triển khai (kế hoạch `docs/superpowers/plans/2026-10-02-bao-cao-theo-tung-hddt.md`).

Spec này sửa `2026-10-02-trang-bao-cao-hddt-design.md` (gọi tắt là **spec trang báo cáo**):

- **Ngày tính.** Bỏ dòng "HĐĐT tính vào ngày nào" ở §2 và mục "Ngày" ở §5.1. Từ nay mỗi HĐĐT tính vào **ngày hóa đơn** của nó (§2 dưới đây).
- **Số bill thêm tay.** Bỏ dòng "Số của bill thêm tay" ở §2 và đoạn "Lấy số bill" ở §4.1. Bill thêm tay không còn lấy số từ `BillCounter` nữa (§4).
- **Số bill trong báo cáo.** Bỏ "số bill" ở §5.1 và ô "Số bill" ở §7.4, §7.6.
- **Quản lý bán hàng của trang báo cáo.** §7.4 liệt kê theo từng HĐĐT thay cho từng bill (§5).

## 1. Mục tiêu

1. Ở Quản lý bán hàng của trang chính, thu ngân bấm một nút để lưu nháp HĐĐT cho cả bill. Bill đó lên trang báo cáo.
2. Trang báo cáo tính theo **từng HĐĐT** (gọi là "hóa đơn nhỏ"). Một hóa đơn nhỏ có thể là:
   - phần chia từ một bill;
   - hóa đơn thu ngân gửi sang;
   - hóa đơn của bill thêm tay.
3. Mỗi HĐĐT tính vào ngày hóa đơn của nó. Một bill chia thành 3 HĐĐT mang 3 ngày khác nhau thì nằm ở 3 ngày báo cáo khác nhau.
4. Mỗi HĐĐT có một **số hóa đơn nội bộ** của trang báo cáo:
   - cùng dạng với số bill: ngày + phòng + số thứ tự;
   - đếm riêng cho từng cơ sở và từng ngày, không dùng chung bộ đếm với bán hàng;
   - HĐĐT nào được thêm trước thì nhận số trước.

## 2. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Nút của thu ngân nằm ở đâu | Chân `BillSheet` trong Quản lý bán hàng của trang chính, tên **Thêm hóa đơn vào báo cáo**. |
| Nút tạo ra gì | Một nháp cho cả bill: số tiền = `finalAmount`, người mua "Bán cho người tiêu dùng", các dòng gồm dòng **Dịch vụ tính theo giờ** (ĐVT Giờ) cộng các món. |
| Dòng hàng không khớp tiền bill (bill có chiết khấu, hoặc thuế khác 10%) | Giữ nguyên số tiền = tiền bill và giá gốc của các dòng. Nháp hiện Còn thiếu/Thừa, người ở trang báo cáo sửa tay trước khi xuất. |
| Bill đã có HĐĐT | Không gửi được nữa: nút bị khóa và có dòng "Đã có trong báo cáo (N hóa đơn)". Server trả 409. |
| Ngày của HĐĐT trên trang báo cáo | Luôn là `Einvoice.invoiceDate`, cho mọi trạng thái. Nút của thu ngân đặt sẵn ngày này = ngày kinh doanh của bill. |
| Màn nào liệt kê theo từng HĐĐT | Quản lý bán hàng của trang báo cáo. Trang HĐĐT vẫn gom theo bill để chia, nhưng tab Bill và tab Đã xuất lọc theo ngày HĐ. |
| Số bill trong báo cáo | Bỏ, vì một bill có thể trải trên nhiều ngày. Chỉ còn Số HĐĐT. |
| Số hóa đơn nội bộ | Dạng `DDMM` + mã phòng (4 chữ số) + số thứ tự (ít nhất 3 chữ số). Bộ đếm `ReportCounter` riêng theo (cơ sở, ngày). Cấp lúc tạo HĐĐT, không bao giờ đổi. Số của nháp đã xóa bỏ trống, không cấp lại. |
| Ngày trong số nội bộ | Ngày HĐ lúc tạo. Ngày HĐ đổi sau đó thì báo cáo đi theo ngày mới, còn số giữ nguyên. |
| Số của bill thêm tay | Bằng số của HĐĐT đầu tiên của nó. Bill thêm tay đã có trước bản này giữ số cũ. |
| Dòng giờ của "Lấy món từ bill" | Đổi tên thành "Dịch vụ tính theo giờ", để giống dòng giờ nút của thu ngân tạo ra. |
| Trang chính | Không đổi, trừ nút của thu ngân và tên dòng giờ. Trang chính không hiện số nội bộ. |

**Ngoài phạm vi:**
- Chia chiết khấu vào các dòng hàng.
- Đánh lại số khi ngày HĐ đổi.
- Hiện số nội bộ ở trang chính.
- Liệt kê theo từng HĐĐT ở trang HĐĐT.

## 3. Ngày của HĐĐT

### 3.1. Dữ liệu

- `Einvoice.invoiceDate` thành `NOT NULL` (migration §6).
- Thêm `@@index([branchId, invoiceDate])`.
- Giữ `@@index([branchId, businessDate])`, vì trang chính vẫn lọc theo `businessDate`.
- Mọi lệnh tạo đã ghi `invoiceDate`, kể cả `POST /einvoices`, bill thêm tay và nút của thu ngân. Lệnh sửa chỉ ghi khi có gửi giá trị. Lệnh xuất ghi ngày được gửi đi. Không lệnh nào xóa giá trị này.
- Bỏ `defaultInvoiceDate` ở frontend (`lib/einvoice.ts` và editor): mọi HĐĐT đều có ngày, nên không còn gì để mặc định. Kiểu `invoiceDate` trong `lib/types.ts` thành `string`.

### 3.2. Số liệu của trang báo cáo

- `countedWhere` (`report-site/einvoice-sql.ts`) lọc theo `e."invoiceDate"` thay cho `e."businessDate"`. Quy tắc "HĐĐT được tính" (`COUNTED_SQL`) giữ nguyên.
- Hệ quả: `GET /report-site/bills/summary` và ba báo cáo Doanh thu, Phòng, Hàng hóa đều tính theo ngày HĐ.
- Báo cáo Doanh thu chia kỳ theo `e."invoiceDate"`.
- Bỏ `billCount` khỏi `EINVOICE_SUM_COLUMNS`, `EinvoiceSums` và `toEinvoiceMetrics`, cùng mọi ô, cột và dòng Excel "Bill" của trang báo cáo:
  - Quản lý bán hàng;
  - Doanh thu;
  - Phòng;
  - `einvoice-metric-cells.tsx`;
  - `report-sheets.ts`.

### 3.3. Danh sách bill của trang HĐĐT (`GET /report-site/bills`)

- Tab Bill (không có `status`, không có `billNumber`) gồm:
  - các bill có ít nhất một HĐĐT với `invoiceDate` trong khoảng ngày;
  - cộng mọi bill thêm tay có `businessDate` trong khoảng, để vẫn tìm thấy bill thêm tay đã hết HĐĐT.
- Tab Đã xuất (`status=ISSUED`): các bill có HĐĐT đã xuất với `invoiceDate` trong khoảng ngày.
- Nháp, Lỗi, Không rõ và tìm theo số bill giữ nguyên, tức là lấy trên mọi ngày.
- **Truy vấn** cho tab Bill và tab Đã xuất. Bỏ điều kiện `Order.businessDate`, vì nó chỉ đúng khi ngày của HĐĐT là ngày của bill. Thay bằng:
  1. **Chọn bill** bằng một câu `$queryRaw`:
     - lấy các bill riêng biệt (`orderId`, `manualBillId`) có HĐĐT trong khoảng ngày theo `(branchId, invoiceDate)`, kèm `status` khi có;
     - tab Bill hợp (`UNION`) thêm các bill thêm tay có `businessDate` trong khoảng;
     - đọc `businessDate` và `billSeq` của từng bill qua `LEFT JOIN LATERAL (… LIMIT 1)` theo khóa chính;
     - xếp theo hai cột đó giảm dần và `LIMIT 500`.

     Một câu `COUNT` riêng, cùng điều kiện, cho `X-Total-Count`.
  2. **Đọc chi tiết** (tối đa 500 id) bằng Prisma `findMany` theo id, như hiện nay, rồi xếp lại theo thứ tự của bước 1.

  Không dùng bộ lọc quan hệ `einvoices: { some }` của Prisma cho bước 1, vì nó sinh `IN (SELECT …)` và có thể quét cả bảng `Order`.
- Các tab Nháp, Lỗi, Không rõ và tìm theo số bill giữ truy vấn hiện có.
- Thứ tự giữ nguyên: ngày kinh doanh của bill, rồi số thứ tự, giảm dần.

## 4. Số hóa đơn nội bộ

### 4.1. Dữ liệu

```prisma
// Bộ đếm số hóa đơn của trang báo cáo (spec 2026-10-02-bao-cao-theo-tung-hddt
// §4), riêng với BillCounter: số của trang báo cáo không làm nhảy số bill.
model ReportCounter {
  branchId Int
  branch   Branch   @relation(fields: [branchId], references: [id])
  date     DateTime @db.Date
  lastSeq  Int

  @@id([branchId, date])
}
```

`Einvoice` có thêm:

```prisma
  // Số hóa đơn của trang báo cáo: ngày HĐ lúc tạo + phòng của bill + số thứ
  // tự (formatBillNumber), cấp lúc tạo, không bao giờ đổi.
  reportDate   DateTime @db.Date
  reportSeq    Int
  reportNumber String

  @@unique([branchId, reportDate, reportSeq])
  @@index([branchId, reportNumber])
```

`reportDate` cần có vì `DDMM` lặp lại mỗi năm, nên chỉ chuỗi số thôi thì không đủ để không trùng.

### 4.2. Cấp số

- Thêm `nextReportNumber(tx, branchId, date, roomName)` vào `orders/bill-number.ts`. Hàm này dùng cùng câu `INSERT … ON CONFLICT … RETURNING` như `nextBillNumberOn`, nhưng trên `ReportCounter`, và định dạng bằng `formatBillNumber`. Phần chung của hai hàm được tách ra để không viết lặp.
- **Mọi lệnh tạo `Einvoice` gọi hàm này trong cùng transaction với lệnh insert.** Dòng bộ đếm bị khóa tới khi commit, nên không bao giờ có hai HĐĐT cùng số. Transaction bị hủy thì số được trả lại.
  - `EinvoicesService.create` của bill thanh toán: hiện chưa nằm trong transaction, nay bọc lại. Ngày = `invoiceDate` của nháp, phòng = phòng của bill.
  - `createForManualBill`: đã có transaction. Phòng = phòng của bill thêm tay; bill không phòng có mã `0000`.
  - `ManualBillsService.create`: thôi gọi `nextBillNumberOn`. Bill thêm tay lấy `billSeq`/`billNumber` từ số của HĐĐT đầu tiên, trong cùng lần tăng bộ đếm.
  - Nút của thu ngân (§5.1).
- "Gửi lại" và nút + đi qua `POST /einvoices`, nên tự nhận số.
- **`ManualBill`.** Bỏ `@@unique([branchId, businessDate, billSeq])` và thay bằng `@@index([branchId, businessDate])`. Lý do: số cũ (từ `BillCounter`) và số mới (từ `ReportCounter`) của cùng một ngày có thể trùng `billSeq`. Số không trùng đã được bảo đảm bởi UNIQUE trên `Einvoice`.

### 4.3. Trả về và hiển thị

- `reportNumber` có trong `einvoiceRowSelect`, nên mọi màn đọc HĐĐT đều nhận được. Trang chính nhận nhưng không hiện.
- **Trang HĐĐT của trang báo cáo:** mỗi dòng HĐ trong bill (`bill-split.tsx`) và đầu panel (`einvoices-page.tsx`) hiện `reportNumber` thay cho "HĐ n". Trang chính vẫn hiện "HĐ n".

### 4.4. Xóa dữ liệu (HĐQT)

`DataPurgeService` xóa `ReportCounter` trong phạm vi, cùng chỗ với `BillCounter`. Số dòng không cần ghi vào nhật ký, giống `BillCounter`.

## 5. Màn hình và API

### 5.1. Nút "Thêm hóa đơn vào báo cáo" (trang chính)

**`POST /einvoices/bill/:orderId/report`** (`EINVOICE_WRITERS`). Route khai báo trước `:id`. Trong một transaction:

1. Khóa bill: `SELECT … FROM "Order" WHERE id = … FOR UPDATE`.
2. Không có bill thì 404. Kiểm tra cơ sở bằng `assertBranchAccess`.
3. Bill không ở `COMPLETED` hoặc đã hủy thì 400 "Chỉ tạo hóa đơn điện tử cho bill đã thanh toán và chưa hủy".
4. Bill đã có HĐĐT (đếm theo `Einvoice(orderId)`) thì 409 "Bill đã có trong báo cáo".
5. Lấy số nội bộ (§4.2), ngày = `businessDate` của bill.
6. Tạo nháp:
   - `amount` = `Order.finalAmount`;
   - `buyerName` = "Bán cho người tiêu dùng", `buyerTaxCode` = null;
   - `invoiceDate` = `businessDate` của bill;
   - `lines` = `billLines(order)`;
   - `vatAmount` tính qua `draftData`, như mọi nháp.

Trả về HĐĐT vừa tạo, giống `POST /einvoices`.

**`billLines`** là hàm thuần trong `einvoice/bill-lines.ts`, có unit test:
- Khi `hourlyFee > 0`, thêm một dòng `{name: "Dịch vụ tính theo giờ", unit: "Giờ", quantity: billedHoursOf(phút), unitPrice: round(pricePerHour), vatRate: 10}`. Số phút tính như `computeBill`, từ `startTime`/`endTime`.
- Mỗi món của bill thêm một dòng `{name, unit, quantity, unitPrice: round(price), vatRate: 10}`, giữ thứ tự của bill.
- Tối đa `MAX_LINES` (50) dòng. Phần bị cắt nằm trong Còn thiếu.

Khóa bill trong bước 1 làm hai lần bấm gần như cùng lúc phải chờ nhau, nên lần sau nhận 409.

**Frontend (`components/sales/bill-sheet.tsx`):**
- Hiện nút **Thêm hóa đơn vào báo cáo** khi bill `COMPLETED`, chưa hủy và người dùng có `einvoices.write`.
- Khi `_count.einvoices > 0`: nút bị khóa, kèm dòng "Đã có trong báo cáo (N hóa đơn)".
- Bấm xong: toast "Đã thêm hóa đơn vào báo cáo", rồi tải lại bill để cập nhật `_count`. Lỗi 409 hiện thông báo của server.
- Chân sheet hiện cho cả thu ngân (hiện tại chỉ hiện khi có quyền sửa hoặc hủy bill).

**"Lấy món từ bill"** (`einvoice-lines.tsx`): dòng giờ đổi tên từ "Tiền giờ phòng X" thành "Dịch vụ tính theo giờ".

### 5.2. Quản lý bán hàng của trang báo cáo: mỗi HĐĐT là một dòng

**`GET /report-site/einvoices?branch&from&to&number`** (`READERS`, `ReportSiteGuard`, chạy trên `ReportPrismaService`):
- **Các dòng:** HĐĐT được tính (`countedWhere`), theo ngày HĐ. Có `number` thì tìm theo đầu `reportNumber` (`billNumberPrefixRange`) trên mọi ngày, vẫn chỉ trong các HĐĐT được tính.
- **Mỗi dòng có:**
  - `id`, `reportNumber`, `invoiceDate`, `status` (cộng `hasError` khi là `DRAFT` có `lastError`), `invoiceNumber` (số Minvoice), `buyerName`, `amount`, `vatAmount`;
  - `orderId` hoặc `manualBillId`;
  - số bill: `Order.billNumber`, hoặc `ManualBill.billNumber` kèm cờ thêm tay;
  - tên phòng;
  - `cancelledAt` của bill.
- **SQL** viết tay bằng `$queryRaw`. Cột của bill đọc qua `LEFT JOIN LATERAL (… LIMIT 1)` theo khóa chính, như báo cáo Phòng, không join thẳng `"Order"` (lý do ở `einvoice-sql.ts`).
- Xếp theo `invoiceDate` giảm dần, rồi `reportSeq` giảm dần. Tối đa 500 dòng, có `X-Total-Count`.

**Frontend (`app/report/[branch]/sales/bills/page.tsx`):**
- Ô số (từ `GET /report-site/bills/summary`): Số HĐĐT, Tổng tiền, VAT, Đã xuất / Chưa xuất.
- Bảng: Số hóa đơn (nhãn Thêm tay, Đã hủy), Ngày HĐ, Bill, Phòng, Người mua, Trạng thái, Trước VAT, VAT, Tổng. Cột phụ ẩn trên điện thoại (`SHOW_FROM`). Hiện `ListLimitNotice` khi bị cắt.
- Ô tìm theo số hóa đơn nội bộ.
- Excel theo đúng các cột của bảng, có builder mới thay cho builder theo bill trong `lib/report-sheets.ts`.
- Bấm một dòng: mở trang HĐĐT với `?bill=`/`?manualBill=`, `?day=<ngày HĐ>` và `?einvoice=<id>`. Trang HĐĐT chọn sẵn HĐĐT đó khi mở bill, thay vì chọn HĐĐT đầu tiên.
- Nút **Thêm hóa đơn** giữ nguyên.
- Nút **Hủy** bill thêm tay bỏ khỏi màn này (§5.3).

### 5.3. Hủy bill thêm tay

Nút **Hủy bill** (quyền `einvoices.write`, `ReasonDialog`, gọi `POST /report-site/manual-bills/:id/cancel`) chuyển vào `ManualBillSplit` (`bill-split.tsx`) của trang HĐĐT. Lý do: bill thêm tay đã xóa hết nháp không còn dòng nào ở Quản lý bán hàng. Route và các quy tắc hủy không đổi.

## 6. Migration `20261006000000_report_einvoice_numbers` (viết tay)

1. **Điền `invoiceDate` còn trống:**
   - HĐĐT của bill thanh toán: ngày dương lịch theo giờ `Asia/Ho_Chi_Minh` của `Order.endTime`, đúng ngày `defaultInvoiceDate` đang hiện. Không có `endTime` thì lấy `businessDate`.
   - HĐĐT của bill thêm tay: `ManualBill.businessDate`.
2. `ALTER COLUMN "invoiceDate" SET NOT NULL`. Tạo index `(branchId, invoiceDate)`.
3. Tạo bảng `ReportCounter`.
4. **Cấp số cho mọi HĐĐT đang có:**
   - `reportDate = invoiceDate`;
   - `reportSeq = row_number() OVER (PARTITION BY branchId, invoiceDate ORDER BY id)`;
   - `reportNumber` = `DDMM` + mã phòng + số thứ tự. Mã phòng làm cùng quy tắc `roomCode`: dãy chữ số cuối của tên phòng, thêm 0 bên phải cho đủ 4 hoặc lấy 4 số cuối, không có thì `0000`. Viết bằng SQL, có comment trỏ về `roomCode`.
5. Ghi `ReportCounter` = `max(reportSeq)` theo (cơ sở, ngày).
6. `reportDate`, `reportSeq`, `reportNumber` thành `NOT NULL`. Tạo UNIQUE `(branchId, reportDate, reportSeq)` và index `(branchId, reportNumber)`.
7. `ManualBill`: bỏ UNIQUE `(branchId, businessDate, billSeq)`, tạo index `(branchId, businessDate)`.

Kiểm tra mã phòng của bước 4 bằng một test so kết quả SQL với `roomCode` trên vài tên phòng: `P401`, `Phòng 8888`, `VIP`, `12345`.

## 7. Bảo mật

- Route mới của trang chính nằm trên `EINVOICE_WRITERS`, kiểm tra cơ sở. Thu ngân chỉ làm được ở cơ sở của mình. HĐQT nhận 403.
- `GET /report-site/einvoices` nằm sau `ReportSiteGuard` như mọi route `/report-site/`.
- SQL chỉ dùng `$queryRaw` dạng template có tham số. `number` chỉ nhận chữ số, kiểm tra ở DTO như `billNumber`.
- Dòng trả về không có địa chỉ, email người mua hay `draft`.

## 8. Tài nguyên (`docs/resource-rules.md` §5)

- Không thêm container, process hay thư viện.
- `ReportCounter` tăng một dòng mỗi cơ sở mỗi ngày có HĐĐT. Ba cột mới của `Einvoice` thêm khoảng 30 byte mỗi dòng, cộng hai index.
- Danh sách mới tối đa 500 dòng (`X-Total-Count`, `ListLimitNotice`). Ô tổng lấy từ summary, không cộng từ danh sách.
- Chạy `EXPLAIN ANALYZE` trên khoảng 100 nghìn HĐĐT cho: `GET /report-site/einvoices` theo ngày và theo số; bước 1 của `GET /report-site/bills`; summary; ba báo cáo. Truy vấn theo một cơ sở phải dùng `(branchId, invoiceDate)` hoặc `(branchId, reportNumber)`, không Seq Scan `Einvoice` hay `Order`.
- Tạo HĐĐT nay giữ dòng `ReportCounter` của ngày tới khi commit. Transaction ngắn (một insert), nên không ảnh hưởng thanh toán: thanh toán dùng `BillCounter`, là một bộ đếm khác.

## 9. Test

**Unit**
- `billLines`: có giờ và món; không có tiền giờ; quá 50 dòng; giá lẻ được làm tròn.
- Định dạng số nội bộ (`formatBillNumber` đã có test). `nextReportNumber` dùng bảng `ReportCounter`.
- `toEinvoiceMetrics` không còn `billCount`.

**e2e** (`test/report-site.e2e-spec.ts`, `test/einvoice.e2e-spec.ts`)
- **Nút của thu ngân:**
  - thu ngân tạo được nháp: đúng tiền, đúng người mua, đúng dòng giờ và dòng món, `invoiceDate` = ngày kinh doanh, có số nội bộ;
  - lần gửi thứ hai trả 409;
  - bill đã hủy trả 400;
  - bill của cơ sở khác trả 403;
  - HĐQT trả 403.
- **Ngày:** một bill có 3 HĐĐT mang 3 ngày HĐ khác nhau thì nằm ở 3 ngày của summary, báo cáo Doanh thu và `GET /report-site/einvoices`. Đổi ngày HĐ của một nháp thì nháp đó chuyển ngày.
- **Số nội bộ:**
  - tăng theo thứ tự tạo trong cùng (cơ sở, ngày) và độc lập giữa các cơ sở;
  - bill thêm tay không làm nhảy số bill của trang chính;
  - số của bill thêm tay bằng số HĐĐT đầu tiên;
  - nháp đã xóa thì số không được cấp lại.
- **Danh sách:** `GET /report-site/einvoices` lọc theo ngày và theo đầu số, có trần 500, bỏ HĐĐT chưa xuất của bill đã hủy.
- **Trang HĐĐT:** tab Bill và tab Đã xuất lọc theo ngày HĐ.
- **Phá quyền:** thêm hai route mới vào e2e "thử phá quyền" của spec trang báo cáo §8.

## 10. Tài liệu

Cập nhật:
- `502-backend/CLAUDE.md` (Report site);
- `502-backend/src/einvoice/CLAUDE.md`;
- `502-frontend/CLAUDE.md`;
- `502-frontend/src/components/einvoices/CLAUDE.md`;
- root `CLAUDE.md`: đoạn Report site không còn nói bill thêm tay "numbered in the day's sequence of the branch, so the main site's numbers skip them".
