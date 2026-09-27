# Thiết kế hệ thống báo cáo — Karaoke 502

Ngày: 2026-09-27 · Trạng thái: đã duyệt thiết kế, chờ duyệt spec

## 1. Bối cảnh

Hiện có hai màn hình báo cáo:
- **Doanh thu** (`/[branch]/sales/statistics`): một dòng mỗi ngày kinh doanh, lấy từ `GET /orders/statistics`.
- **Sổ quỹ** (`/[branch]/funds`).

Còn thiếu:
- Báo cáo theo nhân viên, phòng, hàng hóa, khung giờ, cơ sở.
- Báo cáo lãi lỗ.
- Chế độ xem toàn chuỗi.
- Xuất file.

Ngoài ra có hai điểm cần sửa:
- "Doanh thu" hiện là `finalAmount`, tức là **đã gồm VAT**.
- Hệ thống chưa có giá vốn hàng bán. `Product.costPrice` là giá của lần nhập gần nhất, và không có chỗ nào lưu giá vốn tại thời điểm bán.

Mục tiêu: một phân hệ báo cáo đầy đủ cho quản lý hệ thống và quản lý cơ sở.

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Phạm vi | Cả bốn nhóm: doanh thu, nhân viên (CSKH, phục vụ, thu ngân), phòng & hàng hóa, kế toán (lãi lỗ, nhập–xuất–tồn, quỹ). |
| VAT | **Luôn tách riêng** trên mọi thống kê, doanh thu và báo cáo. "Doanh thu" là số **chưa VAT**, VAT là một dòng riêng, "Tổng thu" = doanh thu + VAT. |
| Ghi công nhân viên | Mỗi hóa đơn tính **trọn** cho CSKH của nó, và cũng trọn cho phục vụ của nó (hai bảng xếp hạng riêng). Không có hoa hồng. |
| Thời gian | Gộp theo ngày, tuần, tháng, quý hoặc năm; so với kỳ trước; biểu đồ nhiệt theo giờ × thứ. |
| Toàn chuỗi | Quản lý hệ thống xem được "Toàn chuỗi" và có báo cáo so sánh các cơ sở. |
| Giá vốn | **Bình quân gia quyền**, chụp lại vào dòng hàng khi thanh toán. |
| Xuất file | Chỉ Excel, tạo trong trình duyệt. |
| Dữ liệu cũ | Chưa có dữ liệu thật, nên không cần bù dữ liệu lịch sử. |
| Cách tính | SQL gộp theo (ngày kinh doanh, chiều phân tích). TypeScript gộp tiếp thành kỳ và tính so sánh. |
| Khoản mục chi | Danh sách cố định. |

Ba phương án đã cân nhắc cho cách tính:
1. **SQL theo ngày + TS theo kỳ (đã chọn).** Nhanh ngay cả khi xem nhiều năm trên toàn chuỗi, và phần gộp kỳ là hàm thuần nên dễ unit test.
2. **Toàn bộ bằng TS.** Giống cách làm hiện nay, nhưng khi xem 1–5 năm toàn chuỗi thì phải nạp hàng trăm nghìn dòng vào bộ nhớ.
3. **Bảng tổng hợp ghi sẵn.** Đọc nhanh nhất, nhưng mọi luồng ghi (thanh toán, hủy, nhập, xuất) đều phải cập nhật bảng này, nên dễ lệch số.

## 3. Định nghĩa chung

Các chỉ số doanh thu được tính trên các hóa đơn **đã thanh toán** (`status = COMPLETED`), theo **thời điểm thanh toán** `endTime`, và theo ngày kinh doanh D = [D 06:00, D+1 06:00) (`src/common/dates.ts`).

| Trường | Tên hiển thị | Công thức |
|---|---|---|
| `roomFee` | Tiền giờ | Σ `hourlyFee` (trước giảm giá) |
| `productSales` | Tiền hàng | Σ `totalProductPrice` (trước giảm giá) |
| `roomDiscount` | Giảm tiền giờ | Σ `hourlyDiscountAmount` |
| `productDiscount` | Giảm tiền hàng | Σ `discountAmount` |
| `serviceFee` | Phí dịch vụ | Σ `serviceFeeAmount` |
| **`revenue`** | **Doanh thu (chưa VAT)** | roomFee + productSales − roomDiscount − productDiscount + serviceFee = Σ(`finalAmount` − `taxAmount`) |
| **`vat`** | **VAT** | Σ `taxAmount` |
| `collected` | Tổng thu | revenue + vat = Σ `finalAmount`, bằng `salesIncome` của sổ quỹ |
| `cash`, `transfer` | Tiền mặt, Chuyển khoản | `collected` tách theo `paymentMethod` (null được tính là tiền mặt) |
| `orderCount` | Số hóa đơn | số hóa đơn |
| `roomMinutes` | Giờ phòng | Σ số phút từ `startTime` đến `endTime` |
| `avgRevenue` | TB/hóa đơn | revenue / orderCount |
| `voidedCount`, `voidedAmount` | Hóa đơn đã hủy | hóa đơn `CANCELLED` còn giữ `paymentMethod` (đã thanh toán rồi mới hủy); chỉ để tham khảo, không cộng vào tổng |

**Bất biến:** tổng theo nhân viên (có dòng "Chưa gán"), theo phòng, theo hàng hóa (sau khi phân bổ giảm giá, cộng với phần tiền giờ và phí dịch vụ), hay theo cơ sở đều phải bằng tổng của báo cáo doanh thu cùng kỳ. Các bài e2e kiểm tra bất biến này.

**Kỳ gộp:**
- Tuần theo ISO, bắt đầu từ thứ Hai.
- Nhãn tiếng Việt: "27/09/2026", "Tuần 39 (21/09–27/09)", "T9/2026", "Q3/2026", "2026".
- Một kỳ bị khoảng lọc cắt ngang chỉ tính phần nằm trong khoảng; `from`/`to` trả về là giới hạn thực tế của kỳ đó.

**Kỳ trước:** khoảng có cùng số ngày, nằm ngay trước khoảng đang xem. Ví dụ, 01–27/09 được so với 05–31/08.

**Độ dài khoảng:** báo cáo cho tối đa 1830 ngày (5 năm), qua hằng mới `MAX_REPORT_RANGE_DAYS`. Các endpoint khác vẫn giữ 366 ngày.

## 4. Kiến trúc

### 4.1 Backend: module `src/reports/`

| File | Vai trò |
|---|---|
| `reports.module.ts`, `reports.controller.ts` | `@Roles(...MANAGERS)` trên class; `/reports/branches` chỉ cho `CHAIN_MANAGER`. |
| `dto/report-query.ts` | `ReportQuery { branch?, from, to, groupBy?: 'day'\|'week'\|'month'\|'quarter'\|'year' (mặc định day), compare?: boolean }`. |
| `reports.service.ts` | Xác định cơ sở, chạy SQL, gọi các hàm thuần. |
| `report-sql.ts` | Các đoạn SQL cho `$queryRaw` (tagged template, có tham số, không nối chuỗi). |
| `buckets.ts` | Hàm thuần `bucketOf(date, groupBy)`, `bucketsBetween(from, to, groupBy)`, `previousRange(from, to)`, `rollUp(rows, groupBy)`. |
| `revenue-metrics.ts` | Hàm thuần: `emptyMetrics()`, `addMetrics(a, b)`, `finalize(m)` (tính `revenue`, `avgRevenue`…), `delta(cur, prev)`. |

**Phạm vi cơ sở** dùng `BranchScopeService.resolveOptionalBranchId`:
- Quản lý hệ thống không truyền `branch` → xem toàn chuỗi.
- Mọi tài khoản khác luôn bị ghim vào cơ sở của mình. Truyền mã cơ sở khác → 403.

**Ngày kinh doanh trong SQL:** `businessDateSql(col)`
= `(((col) AT TIME ZONE 'UTC') AT TIME ZONE ${tz} - interval '6 hours')::date`.
- `tz` lấy từ `process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone`, giống hệt `businessDateOf`. Dùng trực tiếp `process.env.TZ` khi có (thay vì chỉ dựa vào `Intl`), vì ICU chuẩn hoá `Asia/Ho_Chi_Minh` thành `Asia/Saigon` — một tên mà Postgres có thể không nhận ra.
- Prisma lưu `DateTime` dạng `timestamp(3)` theo UTC.
- Mệnh đề WHERE vẫn lọc bằng các mốc của `businessDayRange()` để dùng được index `[branchId, endTime]`.

**Luồng xử lý:**
1. SQL `GROUP BY business_date [, dimension]` → mỗi ngày một dòng cho mỗi chiều phân tích.
2. `rollUp` gộp thành kỳ và điền 0 cho kỳ trống.
3. Nếu `compare`, chạy lại truy vấn trên `previousRange`, chỉ lấy tổng.
4. Số tiền trả về dạng `number` (VND nguyên), không dùng chuỗi Decimal.

Bỏ `GET /orders/statistics` (`OrdersService.getStatistics`, DTO `StatisticsQuery`); thay bằng `GET /reports/revenue`.

### 4.2 Frontend

**Sidebar** (`lib/navigation.ts`): nhóm mới **"Báo cáo"** gồm Doanh thu, Nhân viên, Phòng, Hàng hóa, Khung giờ, So sánh cơ sở, Lãi lỗ, Nhập–xuất–tồn. Mục nào chưa làm thì chưa thêm vào.
- "Doanh thu" chuyển từ nhóm Bán hàng sang nhóm này; `/sales/statistics` chỉ còn chuyển hướng tới `/reports/revenue`.
- "Hóa đơn" ở lại nhóm Bán hàng.

**Quyền** (`lib/permissions.ts`):
- `reports` cho MANAGERS, `reports.chain` cho CHAIN_MANAGER.
- `ROUTE_PERMISSIONS`: `/reports/branches` → `reports.chain`, đặt **trước** `/reports` → `reports`.

**Thành phần dùng chung** (`components/reports/`):
- `report-toolbar.tsx`: DateRangePicker, Select kỳ gộp (Ngày/Tuần/Tháng/Quý/Năm), Switch "So kỳ trước", ToggleGroup "Cơ sở này / Toàn chuỗi" (chỉ quản lý hệ thống thấy), nút "Xuất Excel".
- `stat-tile.tsx`: thay hai bản chép ở trang Doanh thu và Sổ quỹ; có badge Δ% (xanh khi tăng, đỏ khi giảm, "—" khi kỳ trước bằng 0).
- `heatmap.tsx`: CSS grid 7 × 24, cường độ màu theo `--chart-1`, không thêm thư viện.

**Trạng thái bộ lọc:** `hooks/use-report-filters.ts` giữ `from`, `to`, `groupBy`, `compare`, `scope` trên URL search params, nên chia sẻ được link và tải lại không mất bộ lọc. Dữ liệu lấy qua `useApiData`, và cần `Suspense` vì dùng `useSearchParams`.

**Bộ chọn ngày:** `components/date-range-picker.tsx` thêm các lựa chọn nhanh Quý này, Quý trước, Năm nay, Năm trước.

**Xuất Excel:** `lib/excel-export.ts`
- `exportWorkbook({ fileName, sheets: [{ name, columns: [{ header, key, type: 'text'|'money'|'number'|'percent' }], rows, totals? }] })`.
- Nạp `xlsx` động như `lib/excel-import/workbook.ts`.
- Tiền ghi dạng số với định dạng `#,##0`; phần trăm ghi `0.0%`.
- Tên file: `<báo-cáo>_<cs1|toan-chuoi>_<from>_<to>.xlsx`.

**Giao diện:**
- Biểu đồ dùng `components/ui/chart.tsx` và recharts, theo mẫu trang Doanh thu hiện tại.
- Bảng dùng `SHOW_FROM` / `ONLY_NARROW`. Mọi trang phải kiểm tra ở độ rộng 360–390px, không được cuộn ngang.

## 5. Giai đoạn 1 — Nền tảng + Doanh thu theo thời gian (+ VAT tách riêng)

**Backend**
- Khung module báo cáo cùng `buckets.ts`, `revenue-metrics.ts`, `report-sql.ts`.
- `GET /reports/revenue` trả về:
  ```ts
  {
    branchId: number | null,                              // null = toàn chuỗi
    range: { from, to }, groupBy,
    totals: Metrics,                                      // gồm cả cash/transfer
    previous: { from, to, totals: Metrics } | null,       // khi compare
    buckets: ({ key, label, from, to } & Metrics)[],
    byBranch: ({ branchId, code, name } & Metrics)[] | null, // chỉ khi xem toàn chuỗi
    voided: { count, amount }                             // hóa đơn thanh toán rồi bị hủy
  }
  ```
- `GET /funds/summary`: thêm `salesVat`, là tổng `taxAmount` của các hóa đơn có phiếu thu còn hiệu lực trong kỳ (theo `occurredAt`).
- Bỏ `/orders/statistics`; chuyển các khẳng định thống kê trong `test/foundation.e2e-spec.ts` sang `/reports/revenue` (`revenue + vat = collected = salesIncome`).

**Frontend** — trang `/reports/revenue`:
- Ô tổng: Doanh thu (chưa VAT); VAT; Tổng thu (tiền mặt / CK); Hóa đơn (TB/HĐ); Giờ phòng. Mỗi ô có Δ% khi so kỳ trước.
- Biểu đồ cột chồng theo kỳ (tiền giờ thuần, tiền hàng thuần, phí DV). Kết quả so kỳ trước chỉ hiện trên các ô tổng (Δ%), không vẽ lên biểu đồ vì các kỳ của hai khoảng không khớp nhau từng cột.
- Bảng theo kỳ: Tiền giờ, Tiền hàng, Giảm giá, Phí DV, Doanh thu, VAT, Tổng thu, có dòng tổng; mỗi dòng mở trang Hóa đơn của kỳ đó.
- Khi xem toàn chuỗi, thêm bảng nhỏ theo cơ sở.
- Nút Xuất Excel: sheet "Theo kỳ", cộng sheet "Theo cơ sở" khi xem toàn chuỗi.

**VAT ở các màn hình khác**
- Trang Hóa đơn (`sales/statistics/bills`): phần tổng ghi Doanh thu / VAT / Tổng thu.
- Sổ quỹ: ô Thu ghi thêm "trong đó VAT bán hàng …".

**Kiểu dữ liệu:** `lib/types.ts` thêm `ReportMetrics`, `RevenueReport`; bỏ `DailyStat`.

## 6. Giai đoạn 2 — Nhân viên, Phòng, Hàng hóa, Khung giờ, So sánh cơ sở

| Endpoint | Mỗi dòng | Ghi chú |
|---|---|---|
| `GET /reports/staff?role=cskh\|server\|cashier` | nhân viên, orderCount, roomMinutes, roomFee, productSales, discount, revenue, vat, avgRevenue | cskh → `cskhId`, server → `serverId`, cashier → `checkedOutById`. Hóa đơn không có người được gom vào dòng "Chưa gán". Trang có 3 tab và biểu đồ top 10. |
| `GET /reports/rooms?by=room\|type` | phòng (loại), orderCount, roomMinutes, occupancy, roomFee thuần, productSales thuần, revenue | occupancy = roomMinutes / (số ngày × `VENUE_OPEN_MINUTES` = 1110). Hóa đơn không có phòng vào dòng "Không phòng". |
| `GET /reports/products?by=product\|category` | sản phẩm/danh mục, số lượng, thành tiền (qty × price), giảm giá phân bổ, doanh thu thuần | Giảm giá phân bổ = (dòng / `totalProductPrice`) × `discountAmount`, tính trong SQL. Tổng doanh thu thuần = productSales − productDiscount. |
| `GET /reports/hours?metric=sessions\|revenue` | thứ (theo ngày kinh doanh, T2–CN) × giờ bắt đầu (0–23): số lượt, doanh thu | Vẽ bằng heatmap. Giờ lấy từ `startTime` theo giờ địa phương. |
| `GET /reports/branches` | mỗi cơ sở: Metrics, tỷ trọng doanh thu, chuỗi số theo kỳ | Chỉ quản lý hệ thống, còn lại 403. Có biểu đồ đường nhiều cơ sở và bảng so sánh. |

- Mỗi báo cáo có một trang `/reports/<tên>` với toolbar và nút Xuất Excel.
- Migration thêm index `OrderItem(orderId)`.

## 7. Giai đoạn 3 — Giá vốn, Lãi lỗ, Nhập–xuất–tồn, Khoản mục chi

### 7.1 Schema (migration `reports_costing`)
- `OrderItem.unitCost Decimal @default(0)`: giá vốn đơn vị tại lúc thanh toán.
- `StockMovement.unitCost Decimal @default(0)`: giá vốn đơn vị của lần biến động.
- `StockMovement.costAfter Decimal @default(0)`: giá vốn bình quân sau lần biến động.

### 7.2 Bình quân gia quyền — `src/inventory/costing.ts` (hàm thuần)
- `receive(stockBefore, avg, qty, unitCost)`:
  - Nếu `unitCost <= 0`, giữ `avg`.
  - Nếu `stockBefore <= 0`, trả `unitCost`.
  - Còn lại: `(stockBefore × avg + qty × unitCost) / (stockBefore + qty)`.
- `unreceive(stockBefore, avg, qty, unitCost)`, dùng khi hủy phiếu nhập:
  - Nếu phần còn lại `stockBefore − qty <= 0`, giữ `avg`.
  - Còn lại: `(stockBefore × avg − qty × unitCost) / (stockBefore − qty)`, không để âm.
- Mọi giá vốn làm tròn 2 chữ số thập phân.

### 7.3 `InventoryService.applyMovement`
Thêm tham số `unitCost?`. Trên cùng khóa dòng sản phẩm, hàm này cập nhật `costPrice` và ghi `unitCost` / `costAfter` vào `StockMovement`:

| Biến động | `unitCost` | `costPrice` sau |
|---|---|---|
| IMPORT | giá dòng phiếu | `receive` |
| SALE, EXPORT | bình quân hiện tại | giữ nguyên |
| REVERSAL của SALE / EXPORT | `unitCost` của biến động gốc | `receive` |
| REVERSAL của IMPORT | giá dòng phiếu | `unreceive` |

Hai đoạn code cũ bị bỏ vì logic này đã chuyển vào `applyMovement`:
- đoạn cập nhật `costPrice` trong `writeDocument`;
- đoạn "lấy giá lần nhập còn lại gần nhất" trong `cancelDocument`.

**Thanh toán:** ghi `OrderItem.unitCost` = `costPrice` của sản phẩm trước khi trừ kho. Sản phẩm `trackStock = false` có giá vốn 0.

### 7.4 Khoản mục chi — `src/funds/fund-categories.ts`
- Chi: Lương, Mặt bằng, Điện nước, Sửa chữa – bảo trì, Marketing, Vật tư tiêu hao, Thuế – phí, Khác.
- Thu (thủ công): Thu khác.
- `CreateFundTransactionDto.category` được kiểm tra bằng `@IsIn` theo loại phiếu, mặc định "Khác" / "Thu khác".
- Phiếu tự động giữ "Bán hàng" / "Nhập hàng".
- Frontend chép danh sách sang `lib/labels.ts`; hộp thoại lập phiếu dùng Select.

### 7.5 `GET /reports/profit` — Lãi lỗ
Bảng có các dòng khoản mục × các cột kỳ (thường là tháng), kèm cột Tổng:
1. Doanh thu (chưa VAT), với các dòng con tiền giờ / tiền hàng / phí DV / giảm giá.
2. Giá vốn hàng bán = Σ quantity × `OrderItem.unitCost`.
3. **Lãi gộp**, kèm % trên doanh thu.
4. Chi phí hoạt động, tách theo khoản mục: phiếu chi thủ công (`stockDocumentId` null, chưa hủy), theo `occurredAt`.
5. Hàng xuất kho / hao hụt = Σ |quantity| × `unitCost` của các biến động EXPORT thuộc phiếu chưa hủy.
6. Thu khác: phiếu thu thủ công (`orderId` null, chưa hủy).
7. **Lợi nhuận** = 3 − 4 − 5 + 6.

Hai dòng thông tin nằm ngoài lợi nhuận:
- VAT phải nộp.
- Tiền nhập hàng trong kỳ: không phải chi phí vì hàng nhập thành hàng tồn.

### 7.6 `GET /reports/inventory` — Nhập–xuất–tồn
Mỗi sản phẩm (khi xem toàn chuỗi, có thêm cột cơ sở) có:
- **Tồn đầu** (số lượng, giá trị): `balanceAfter` × `costAfter` của biến động cuối cùng trước `from`.
- **Nhập**: IMPORT.
- **Bán**: SALE.
- **Xuất**: EXPORT.
- **Hoàn/điều chỉnh**: REVERSAL, ADJUSTMENT.
- **Tồn cuối**.

Giá trị mỗi cột = Σ quantity × `unitCost`. Bảng có lọc theo danh mục.

### 7.7 Báo cáo Hàng hóa
Thêm các cột Giá vốn, Lãi gộp và % biên lợi nhuận.

## 8. Xử lý lỗi

Mọi thông báo đều bằng tiếng Việt.
- **400**: sai định dạng ngày, `from > to`, khoảng quá 1830 ngày (từ `dates.ts`), `groupBy`/`role`/`by` không hợp lệ (ValidationPipe).
- **403**: tài khoản không phải quản lý; quản lý cơ sở truyền `branch` của cơ sở khác; quản lý cơ sở mở `/reports/branches`.
- **404**: mã cơ sở không tồn tại.
- **Frontend**: lỗi hiện toast qua `useNotify`/`apiErrorMessage`. Khoảng không có dữ liệu hiện `EmptyState`. Khi đang tải, ô tổng và biểu đồ hiện skeleton.

## 9. Kiểm thử

**Unit** (`npm test`):
- `buckets.spec.ts`: tuần ISO vắt qua năm mới (29/12/2025–04/01/2026), quý, kỳ bị khoảng lọc cắt, `previousRange`, kỳ trống.
- `revenue-metrics.spec.ts`: `revenue + vat = collected`, `delta` khi kỳ trước bằng 0.
- `costing.spec.ts`: nhập 10@10.000 rồi 10@20.000 → 15.000; tồn âm; giá nhập 0; `unreceive`.

**E2E** — file mới `test/reports.e2e-spec.ts`, tự reset DB như `foundation`. Thêm `--runInBand` vào script `test:e2e` (hiện chưa có) để hai file không reset DB đè nhau:
- Thanh toán vài hóa đơn có CSKH/phục vụ, giảm giá, phí DV và VAT, rồi kiểm tra:
  - `revenue + vat = collected = salesIncome`;
  - tổng theo nhân viên, phòng, hàng hóa (cộng tiền giờ và phí DV) và cơ sở bằng tổng doanh thu;
  - hóa đơn bị hủy sau khi thanh toán rời khỏi mọi tổng.
- Ngày kinh doanh tính bằng SQL khớp `businessDateOf` quanh mốc 06:00 (chèn trực tiếp các `endTime` 05:59 và 06:00).
- Phân quyền:
  - thu ngân → 403;
  - `ql_cs1` truyền `?branch=cs2` → 403;
  - `ql_cs1` mở `/reports/branches` → 403;
  - `admin` không truyền `branch` → thấy toàn chuỗi (cs1 + cs2).
- Giai đoạn 3:
  - nhập hai lô → bình quân đúng; thanh toán → `OrderItem.unitCost` đúng;
  - hủy hóa đơn → hàng về kho với giá gốc;
  - hủy phiếu nhập → `costPrice` đúng;
  - lãi lỗ = doanh thu − giá vốn − chi phí − hao hụt + thu khác.

**Frontend:**
- `npm run lint && npm run build`.
- Chạy với `SEED_DEMO=1`, kiểm tra mỗi trang ở 1280px và 375px (không cuộn ngang).
- Mở thử file Excel đã xuất.
- `admin` chuyển sang "Toàn chuỗi"; `ql_cs1` không thấy nút chọn phạm vi và không thấy mục "So sánh cơ sở".

**Tài liệu:** cập nhật `CLAUDE.md`, gồm phần Implemented, module reports, định nghĩa VAT/doanh thu và giá vốn bình quân.

## 10. Ngoài phạm vi

Không làm trong đợt này:
- Hoa hồng nhân viên.
- Xuất PDF / bản in.
- Bảng tổng hợp ghi sẵn.
- Báo cáo theo khách hàng.
- Ngân sách, kế hoạch doanh thu.
- Lịch gửi báo cáo tự động.
