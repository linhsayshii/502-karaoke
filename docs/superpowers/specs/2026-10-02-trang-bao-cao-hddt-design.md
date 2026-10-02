# Trang báo cáo theo hóa đơn điện tử — thiết kế

Ngày: 02/10/2026. Trạng thái: đã duyệt thiết kế trong chat, chờ duyệt spec.

Spec này sửa hai spec trước:
- `2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`: bỏ **hóa đơn tự do**, gồm §1 mục 3; các dòng "Tạo hóa đơn tự do" và "Hóa đơn tự do: …" ở §2; tham số `free` ở §4; nút + cạnh ô tìm và nhóm "Hóa đơn không theo bill" ở §5. Thay vào đó là **bill thêm tay** trên trang báo cáo.
- `2026-10-01-hoa-don-dien-tu-design.md` §2, dòng "Sau khi xuất": nay **giữ các dòng hàng**. Địa chỉ và email người mua vẫn bị xóa như cũ.

## 1. Mục tiêu

1. **Hai hệ thống báo cáo riêng:**
   - Hệ thống hiện tại tính theo bill bán hàng và nằm ở tên miền chính.
   - Hệ thống mới tính theo hóa đơn điện tử (HĐĐT) và nằm ở một trang riêng, có tên miền bắt đầu bằng `baocao.` hoặc `baocao-`, ví dụ `baocao.<tên miền chính>` (§7.1, §11).
2. **Liên thông:** thu ngân ở trang chính lưu nháp HĐĐT cho những bill cần xuất VAT. Bill đó tự hiện ở trang báo cáo.
3. **Trang báo cáo gồm:** Quản lý bán hàng (có nút **Thêm hóa đơn**), Hóa đơn điện tử, và ba báo cáo Doanh thu, Phòng, Hàng hóa. Mọi số liệu đều tính theo HĐĐT.
4. **Bill thêm tay:** "Thêm hóa đơn" tạo một bill chỉ để xuất HĐĐT.
   - Bill này chỉ tồn tại ở trang báo cáo.
   - Nó mang số bill nối tiếp dãy số của ngày được chọn, theo quy tắc ngày + phòng + số thứ tự.
5. Trang HĐĐT của tên miền chính không tạo được HĐĐT không theo bill nữa.

## 2. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Số liệu lấy từ đâu | **Theo HĐĐT.** Trên trang báo cáo, tiền của một bill là tổng các HĐĐT của nó, và doanh thu, VAT đều cộng từ HĐĐT. Phòng và ngày lấy theo bill. Ví dụ: bill 5.000.000 có hai nháp 3.000.000 và 1.000.000 thì trang báo cáo ghi 4.000.000. |
| HĐĐT tính vào ngày nào | Ngày kinh doanh của bill (`Einvoice.businessDate`), dù HĐĐT được xuất vào ngày nào. Với bill thêm tay là ngày được chọn lúc thêm. |
| Bill nào lên trang báo cáo | Bill bên chính có ít nhất một HĐĐT (ở bất kỳ trạng thái nào), cộng mọi bill thêm tay. Xóa hết HĐĐT của một bill bên chính thì bill đó rời trang báo cáo. |
| HĐĐT nào được tính | Mọi HĐĐT còn tồn tại, trừ HĐĐT chưa xuất của bill bên chính đã hủy, vì HĐĐT đó không bao giờ xuất được nữa. HĐĐT đã xuất luôn được tính. |
| Ai vào trang báo cáo | QL hệ thống luôn vào được. QL cơ sở và HĐQT vào được khi tài khoản được bật ô **Vào trang báo cáo**. Thu ngân và nhân viên không bao giờ vào được. |
| Ai bật quyền | Chỉ QL hệ thống. Ô này chỉ có ở tài khoản QL cơ sở và HĐQT. |
| Việc làm được trong trang báo cáo | Theo vai trò (§3.3). |
| Báo cáo | Doanh thu, Phòng, Hàng hóa. |
| Trang báo cáo chạy ở đâu | Cùng app Next.js với trang chính. Host bắt đầu bằng `baocao.` hoặc `baocao-` được chuyển sang nhóm trang `app/report/`. Không thêm container. |
| Bill thêm tay lưu ở đâu | Bảng riêng `ManualBill`, cùng cột mới `Einvoice.manualBillId`. Mã của trang chính không đọc bảng này. |
| Số của bill thêm tay | Lấy từ cùng bộ đếm `BillCounter` với bill thanh toán, nên không bao giờ trùng. Hệ quả: dãy số bên chính của ngày đó bị nhảy cóc. |
| Thêm hóa đơn hỏi những gì | Ngày (không được sau hôm nay), phòng, số tiền của HĐĐT đầu tiên. |
| Sửa, hủy bill thêm tay | Không sửa được. Hủy được (kèm lý do) khi mọi HĐĐT của nó còn là nháp: các nháp bị xóa, số bill không cấp lại cho bill khác. |
| HĐĐT tự do | Bỏ. Migration chuyển các HĐĐT tự do đang có thành bill thêm tay không phòng. |
| Dòng hàng sau khi xuất | Giữ lại. |
| VAT của nháp | VAT của các dòng hàng + VAT của phần tiền chưa có dòng, tính như dòng bù 10%. |
| Xuất HĐĐT ở trang chính | Giữ nguyên: QL hệ thống vẫn xuất được ở trang HĐĐT bên chính. |

**Ngoài phạm vi:**
- Trên trang báo cáo: báo cáo Nhân viên, Khung giờ, Lãi lỗ, Tồn kho, Xuất nhập tồn, và trang Tải báo cáo nhiều sheet.
- Sửa ngày hoặc phòng của bill thêm tay.
- Bill thêm tay có món, giờ, nhân viên.
- Đường dẫn từ trang chính sang trang báo cáo.
- Hiện dòng hàng của HĐĐT đã xuất trong panel.
- WebSocket và tải lại định kỳ trên trang báo cáo.

## 3. Quyền

### 3.1. Vào trang báo cáo

- Thêm cột `User.reportAccess Boolean @default(false)`, nhãn "Vào trang báo cáo".
- `canUseReportSite(user)` đúng khi:
  - `role = CHAIN_MANAGER`, hoặc
  - `reportAccess` bật và `role` là `BRANCH_MANAGER` hoặc `BOARD`.
- Hàm này nằm ở `src/auth/roles.ts`, bản sao ở `lib/permissions.ts` (thuộc cặp "ma trận quyền" phải giữ đồng bộ).
- `JwtStrategy` nạp lại tài khoản ở mỗi request, nên tắt ô hay đổi vai trò có hiệu lực ngay.
- `AuthUser` (`authUserSelect`) và `GET /auth/me` trả thêm `reportAccess`.
- `POST /users` và `PATCH /users/:id` nhận `reportAccess`:
  - người gửi không phải QL hệ thống → 403 "Chỉ quản lý hệ thống được cấp quyền vào trang báo cáo";
  - bật cho tài khoản có vai trò khác QL cơ sở và HĐQT → 400;
  - một lần lưu đổi vai trò sang vai trò khác QL cơ sở và HĐQT thì ô về `false` trong cùng lệnh ghi;
  - mỗi lần ô đổi giá trị ghi đúng một dòng log: id người đổi, id tài khoản, bật hay tắt.

### 3.2. Đăng nhập

- `POST /auth/login {username, password, site?}`. `site` chỉ nhận giá trị `"report"`.
- Các bước kiểm tra cũ giữ nguyên thứ tự: khóa do sai nhiều lần, mật khẩu, tài khoản bị khóa.
- Sau các bước đó, nếu `site = "report"` mà `!canUseReportSite`:
  - trả 403 "Tài khoản này không được vào trang báo cáo";
  - không tạo phiên, không đặt cookie;
  - không tính là sai mật khẩu.
- Bước này chỉ để báo lỗi sớm. Ranh giới thật là kiểm tra ở từng API (§8): một tài khoản đăng nhập ở trang chính vẫn có token gọi thẳng được API.

### 3.3. Ma trận quyền trong trang báo cáo

| Việc | QL hệ thống | QL cơ sở (được bật) | HĐQT (được bật) |
|---|---|---|---|
| Xem Quản lý bán hàng, HĐĐT, ba báo cáo | Mọi cơ sở | Cơ sở mình | Mọi cơ sở |
| Thêm, hủy bill thêm tay | ✓ | Cơ sở mình | — |
| Tạo, sửa, xóa nháp HĐĐT | ✓ | Cơ sở mình | — |
| Xuất, xử lý Không rõ, sửa số, tài khoản Minvoice | ✓ | — | — |

Thu ngân và nhân viên không vào được trang báo cáo. Ở backend, mọi route dưới đây đều cần thêm `canUseReportSite`:
- thêm, hủy bill thêm tay: `MANAGERS`;
- các route đọc của trang báo cáo: `READERS`;
- các route HĐĐT: giữ quyền hiện có.

## 4. Dữ liệu

### 4.1. `ManualBill`

```prisma
// Bill thêm tay (spec 2026-10-02-trang-bao-cao-hddt): a bill made on the
// report site only to issue e-invoices. The sales, stock, fund and report
// code of the main site never reads it.
model ManualBill {
  id            Int        @id @default(autoincrement())
  branchId      Int
  branch        Branch     @relation(fields: [branchId], references: [id])
  businessDate  DateTime   @db.Date
  billSeq       Int
  billNumber    String
  // Null only for the free invoices the migration turned into bills (room 0000).
  roomId        Int?
  room          Room?      @relation(fields: [roomId], references: [id], onDelete: Restrict)
  createdById   Int?
  createdBy     User?      @relation("ManualBillCreatedBy", fields: [createdById], references: [id])
  createdAt     DateTime   @default(now())
  cancelledAt   DateTime?
  cancelledById Int?
  cancelledBy   User?      @relation("ManualBillCancelledBy", fields: [cancelledById], references: [id])
  cancelReason  String?
  einvoices     Einvoice[]

  @@unique([branchId, businessDate, billSeq])
  @@index([branchId, billNumber])
}
```

- **Lấy số bill:** phần lấy số trong `orders/bill-number.ts` được tách thành một hàm nhận ngày kinh doanh (`YYYY-MM-DD`). `nextBillNumber` của checkout gọi lại hàm đó với `businessDateOf(closedAt)`.
- Bill thêm tay và bill thanh toán dùng chung một câu `INSERT … ON CONFLICT … RETURNING` trên `BillCounter (branchId, businessDate)`, nên không bao giờ trùng số. Số đã cấp không bao giờ được dùng lại.
- **Ví dụ:** ngày 02/10, cơ sở 1 đã có bill số …050. Thêm tay một bill phòng P401 vào ngày 02/10 thì được số `02104010051`. Bill thanh toán tiếp theo của ngày đó lấy …052.

### 4.2. `Einvoice`

- Thêm `manualBillId Int?`, quan hệ `onDelete: Restrict`, và `@@index([manualBillId])`.
- CHECK `("orderId" IS NULL) <> ("manualBillId" IS NULL)`: mỗi HĐĐT thuộc đúng một bill.
- HĐĐT của bill thêm tay chép `businessDate` từ `ManualBill.businessDate`. `invoiceDate` mặc định là ngày đó.
- **Bất biến:** bill thêm tay đã hủy không còn HĐĐT nào (§6.1).

### 4.3. Giữ dòng hàng khi xuất

- Mọi lệnh ghi trạng thái `ISSUED` đặt `draft = {lines}` thay vì `null`. Có ba lệnh như vậy: xuất, Kiểm tra lại tìm thấy hóa đơn, và `resolve {found: true}`.
- `buyerAddress` và `buyerEmail` vẫn bị bỏ.
- `parseDraft` phải đọc được dạng chỉ có `lines`.
- HĐĐT xuất trước bản này có `draft = null`. Báo cáo Hàng hóa tính tiền của chúng vào dòng "Chưa có dòng hàng" (§5.3).
- Màn hình HĐĐT đã xuất không đổi.

### 4.4. VAT của HĐĐT chưa xuất

- Khi tạo và sửa nháp, `draftData` ghi `vatAmount` = VAT của các dòng + VAT của `fillerLine(amount − tổng các dòng, 10)` nếu các dòng chưa đủ số tiền.
  - Nhờ vậy, nháp vừa bấm + (chưa có dòng nào) có VAT khoảng 1/11 số tiền thay vì 0.
- HĐĐT đã xuất giữ như cũ: VAT là tổng VAT các dòng, vì khi xuất các dòng luôn khớp số tiền.
- Không màn hình nào hiện `vatAmount` của HĐĐT chưa xuất: panel tự tính từ các dòng, còn `issued-view.tsx` chỉ dùng cho HĐĐT đã xuất.

### 4.5. Migration `20261005000000_report_site` (viết tay)

1. Thêm `User.reportAccess`.
2. Tạo bảng `ManualBill`, khóa ngoại và index.
3. Thêm `Einvoice.manualBillId`, khóa ngoại và index.
4. Với mỗi HĐĐT có `orderId IS NULL`, theo thứ tự `id`:
   - tăng `BillCounter` của (cơ sở, `businessDate` của HĐĐT);
   - tạo một `ManualBill` không phòng, số bill là `DDMM` + `0000` + số thứ tự (ít nhất 3 chữ số), người tạo và lúc tạo lấy từ HĐĐT;
   - gán `manualBillId` cho HĐĐT.
5. Thêm CHECK của §4.2.
6. Nháp chưa có dòng hàng được gán `vatAmount = amount − round(amount / 1.1)`. Nháp đã có dòng giữ nguyên VAT tới lần lưu sau.

### 4.6. Xóa dữ liệu (HĐQT)

`DataPurgeService` xóa `ManualBill` trong phạm vi bị xóa, sau `Einvoice` và trước `Room`, và ghi số dòng đã xóa vào nhật ký (`manualBills`).

### 4.7. Xóa phòng

`RoomsService.remove` đếm cả `ManualBill` của phòng. Phòng đã có bill thêm tay không xóa được, với cùng thông báo 409 như phòng đã có bill thật.

## 5. Số liệu của trang báo cáo

### 5.1. Bill và HĐĐT được tính

- **Bill của trang báo cáo:**
  - mọi `Order` có ít nhất một `Einvoice`, bất kể trạng thái bill (bill đã hủy có nhãn);
  - cộng mọi `ManualBill` (bill đã hủy có nhãn).
- **HĐĐT được tính** khi:
  - `status = ISSUED`, hoặc
  - bill của nó không bị hủy (`Order.cancelledAt IS NULL`). HĐĐT của bill thêm tay luôn được tính, theo bất biến ở §4.2.
- Quy tắc này nằm trong một mảnh SQL duy nhất, dùng chung cho danh sách, summary và ba báo cáo.
- **Ngày:** `Einvoice.businessDate`, đã có index `(branchId, businessDate)`.
- **Các số:**
  - tổng tiền = tổng `amount`;
  - VAT = tổng `vatAmount`;
  - doanh thu = tổng tiền − VAT;
  - đã xuất = tổng `amount` của các HĐĐT `ISSUED`;
  - chưa xuất = tổng tiền − đã xuất;
  - số HĐĐT = số HĐĐT được tính;
  - số bill = số bill có ít nhất một HĐĐT được tính.

### 5.2. Doanh thu và Phòng

- **Doanh thu:**
  - Các số của §5.1, chia theo kỳ (`groupBy` ngày, tuần, tháng, quý, năm, dùng `buckets.ts`).
  - Có so với kỳ trước (`previousRange`).
  - QL hệ thống và HĐQT không chọn cơ sở thì xem cả chuỗi, kèm số của từng cơ sở.
- **Phòng:**
  - Chia theo phòng (`Order.roomId` hoặc `ManualBill.roomId`), hoặc theo loại phòng.
  - Liệt kê mọi phòng trong phạm vi, kể cả phòng không có HĐĐT, và thêm một dòng "Không phòng".
  - Tổng các dòng bằng báo cáo Doanh thu.

### 5.3. Hàng hóa

- Đọc `draft->'lines'` của các HĐĐT được tính (`jsonb_array_elements`).
- Gom các dòng theo tên và ĐVT. Tên được bỏ khoảng trắng thừa và so sánh không phân biệt hoa/thường.
- Mỗi dòng báo cáo có:
  - số lượng;
  - tiền trước VAT = `round(quantity × unitPrice)`;
  - VAT = `vatAmount` của dòng, không có thì tính theo thuế suất;
  - tổng.
  - Các công thức này giống hệt `einvoice-math.ts`.
- Tối đa 1000 dòng, xếp theo doanh thu giảm dần. Phần còn lại gộp vào dòng "Các mặt hàng khác".
- Dòng cuối "Chưa có dòng hàng" = số liệu của §5.1 trừ đi tổng các dòng hàng. Dòng này gồm:
  - HĐĐT chưa có dòng hàng;
  - HĐĐT xuất trước bản này;
  - phần chênh của nháp có dòng hàng chưa khớp số tiền.
- Nhờ dòng này, tổng của báo cáo Hàng hóa luôn bằng báo cáo Doanh thu.

## 6. API backend

### 6.1. Module `src/report-site`

**Quyền chung**
- Mọi route dành riêng cho trang báo cáo nằm dưới `/report-site/`.
- `ReportSiteGuard` gắn trên mọi controller của module: trả 403 "Bạn không có quyền vào trang báo cáo" khi `!canUseReportSite`.
- Guard chạy trước `SharedRequestInterceptor`, nên những request được gộp chung một lần tính đều đã qua kiểm tra quyền (§8).

**Danh sách và tổng**
- `GET /report-site/bills?branch&from&to&billNumber&status` (`READERS`, chạy trên `ReportPrismaService`):
  - **Các dòng:** bill của trang báo cáo (§5.1).
  - **Bộ lọc:** như `GET /einvoices/bills` bên chính.
    - Khoảng ngày áp cho tab Bill, mặc định hôm nay.
    - Đầu số bill tìm trên mọi ngày.
    - `status` lọc các bill có HĐĐT ở trạng thái đó. `DRAFT`, `ERROR`, `UNCERTAIN` lấy mọi ngày; riêng `ISSUED` thì lọc thêm theo khoảng ngày.
  - **Mỗi dòng có:**
    - `orderId` hoặc `manualBillId`;
    - số bill, ngày kinh doanh, phòng, `cancelledAt`;
    - `finalAmount`: tổng của bill bên chính, null với bill thêm tay;
    - `allocated`: tổng mọi HĐĐT của bill, dùng cho panel chia;
    - tổng tiền và VAT theo §5.1;
    - số HĐĐT, số HĐĐT đã xuất.
  - Xếp theo ngày kinh doanh rồi số thứ tự, giảm dần. Tối đa 500 dòng, có `X-Total-Count`.
- `GET /report-site/bills/summary?branch&from&to` (`READERS`, `ReportPrismaService`, `SharedRequestInterceptor`) trả hai nhóm số:
  - số đếm cho các tab, tính trên mọi HĐĐT của cơ sở như `GET /einvoices/summary` hiện nay;
  - các số của §5.1 trong khoảng ngày, cho các ô tổng của Quản lý bán hàng.

**Bill thêm tay**
- `GET /report-site/manual-bills/:id` (`READERS`, kiểm tra cơ sở): trả về giống `GET /einvoices/bill/:orderId`, gồm bill thêm tay (số, ngày, phòng, thông tin hủy, người tạo), các HĐĐT của nó và `allocated`.
- `POST /report-site/manual-bills?branch {businessDate, roomId, amount}` (`MANAGERS`):
  - **Kiểm tra:**
    - `businessDate` có dạng `YYYY-MM-DD` và không sau ngày kinh doanh hôm nay; sai thì 400 "Không thêm bill cho ngày sau hôm nay".
    - `roomId` là phòng của cơ sở; không phải thì 400.
    - `amount` là số nguyên từ 1 đến 100.000.000.000.
  - **Trong một transaction:**
    - lấy số bill (§4.1);
    - tạo `ManualBill`;
    - tạo nháp HĐĐT với `amount`, chưa có dòng, `invoiceDate` là ngày của bill.
  - Trả về bill và id của nháp.
- `POST /report-site/manual-bills/:id/cancel {reason}` (`MANAGERS`, lý do 1–300 ký tự). Trong một transaction:
  - khóa bill bằng một lệnh ghi có điều kiện `cancelledAt IS NULL`; bill đã hủy thì 409;
  - xóa các nháp của bill;
  - đếm HĐĐT còn lại. Nếu còn thì trả 409 "Bill có hóa đơn đã gửi hoặc đã xuất, không hủy được" và hoàn tác toàn bộ.
  - Vì sao không cần chặn riêng ở bước xuất: lệnh xuất khóa `DRAFT → SENDING` bằng `updateMany`, nên nếu hủy chạy trước thì hủy đã xóa các nháp và xuất trả 404 "Không tìm thấy hóa đơn điện tử", còn nếu xuất chạy trước thì hủy trả 409. Hai chiều đều bị từ chối.

**Báo cáo**
- `GET /report-site/reports/revenue|rooms|products` (`READERS`).
  - Tham số như các báo cáo hiện có: `branch`, `from`, `to`, `groupBy`, `compare`. Báo cáo Phòng có thêm `by=room|type`.
  - Khoảng ngày tối đa `MAX_REPORT_RANGE_DAYS`. Phạm vi lấy qua `reportScope`.
  - Chạy trên `ReportPrismaService`, có `SharedRequestInterceptor`.

### 6.2. `src/einvoice`

| Route | Thay đổi |
|---|---|
| `GET /einvoices/bills`, `GET /einvoices/summary` | Chỉ phục vụ bên chính. `bills` không đổi vì chỉ đọc `Order`. `summary` chỉ đếm HĐĐT có `orderId`. |
| `POST /einvoices` | Bắt buộc có đúng một trong `orderId` và `manualBillId` (400 "Chọn bill cho hóa đơn"). Khi có `manualBillId`: kiểm tra `canUseReportSite`, cơ sở, bill chưa hủy (400). Dòng của bill được khóa trong transaction tạo, để không chen được vào giữa lệnh hủy. |
| `GET`/`PATCH`/`DELETE /einvoices/:id`, `issue`, `resolve`, `number` | HĐĐT có `manualBillId` thì cần `canUseReportSite` (403). |
| `GET /einvoices/bill/:orderId` | Không đổi. Trang báo cáo cũng dùng route này để mở bill bên chính. |
| `GET /einvoices` | Bỏ, cùng tham số `free`, vì chỉ nhóm "Hóa đơn không theo bill" dùng nó. |

"Gửi lại" đi qua `POST /einvoices`, nên tự có cùng các kiểm tra ở trên.

### 6.3. Chỗ khác

- `POST /auth/login`: §3.2.
- `UsersService`: §3.1.
- `RoomsService.remove`: §4.7.
- `DataPurgeService`: §4.6.

## 7. Frontend

### 7.1. Tên miền

- `lib/site.ts` có hàm `isReportSite()`: đúng khi hostname bắt đầu bằng `baocao.` hoặc `baocao-`. Trên server, hàm luôn trả `false`.
- `next.config.ts`:
  - `rewrites()` trả về dạng `{beforeFiles, afterFiles}`.
    - `beforeFiles`: với host khớp `baocao[.-]`, mọi đường dẫn trang được chuyển sang `/report/...`. Không chuyển `/api`, `/_next` và các file có đuôi.
    - `afterFiles`: giữ rewrite `/api` hiện có.
  - `redirects()`: ở host khác, `/report` và `/report/...` bị chuyển về `/`.
- Địa chỉ trên trang báo cáo có dạng giống bên chính, ví dụ `baocao.<tên miền>/cs1/sales/bills`.
- Server chỉ render màn hình chờ vì lúc đó `AuthProvider` đang `loading`. Vì vậy `usePathname()` đọc đúng địa chỉ trên trình duyệt mà không làm lệch dữ liệu giữa server và trình duyệt khi hydrate.
- **Phải kiểm tra trên trình duyệt trước mọi việc khác.** Nếu rewrite có vấn đề, đổi sang tiền tố đường dẫn `/bc/...` kèm chuyển hướng theo host.
- Trên máy dev, trang báo cáo mở ở `baocao.localhost:3000`. Production xem §11.

### 7.2. Đăng nhập và phiên

- Form đăng nhập được tách khỏi `app/(auth)/page.tsx` để cả hai trang cùng dùng. Trang báo cáo (`app/report/page.tsx`) chỉ đổi tiêu đề thành "Trang báo cáo".
- Trên trang báo cáo, `AuthProvider`:
  - gửi `site: "report"` khi đăng nhập;
  - lấy `/<cơ sở>/sales/bills` làm trang chủ;
  - đăng xuất kèm thông báo "Tài khoản không còn quyền vào trang báo cáo" nếu `/auth/me` trả về tài khoản không còn `canUseReportSite`.
- Cookie `Refresh` không có thuộc tính `Domain`, nên mỗi tên miền có phiên riêng. Không thêm `Domain` cho cookie này.

### 7.3. Khung trang

- `app/report/[branch]/layout.tsx` dùng `AppShell` với `site="report"`.
- `lib/navigation.ts` thêm menu riêng cho trang báo cáo:
  - **Bán hàng:** Quản lý bán hàng (`/sales/bills`), Hóa đơn điện tử (`/sales/einvoices`).
  - **Báo cáo:** Doanh thu (`/reports/revenue`), Phòng (`/reports/rooms`), Hàng hóa (`/reports/products`).
  - Sidebar, breadcrumb và tiêu đề trang lấy menu theo trang đang mở.
- `lib/permissions.ts` thêm `canUseReportSite` và quyền theo đường dẫn của trang báo cáo: `/sales` cần `einvoices.view`, `/reports` cần `reports`.
- Trang báo cáo:
  - không có `LiveEventsProvider`;
  - menu tài khoản không có mục Xóa dữ liệu;
  - đầu sidebar ghi "Trang báo cáo".

### 7.4. Quản lý bán hàng (`/sales/bills`)

- `PageHeader` có nút **Thêm hóa đơn** (quyền `einvoices.write`).
- Bộ lọc: `DateRangePicker` (mặc định ngày kinh doanh hôm nay) và ô tìm số bill.
- Ô tổng lấy từ `GET /report-site/bills/summary`: Số bill, Tổng tiền, VAT, Đã xuất / Chưa xuất.
- Bảng lấy từ `GET /report-site/bills`:
  - Cột: Số bill (nhãn Thêm tay, Đã hủy), Ngày, Phòng, HĐĐT (đã xuất/tổng), Trước VAT, VAT, Tổng.
  - Hiện `ListLimitNotice` khi bị cắt ở 500 dòng.
  - Cột phụ ẩn trên điện thoại (`SHOW_FROM`).
  - Xuất Excel bằng một builder mới trong `lib/report-sheets.ts`, có cảnh báo khi danh sách bị cắt.
- Bấm một dòng: mở trang HĐĐT ở đúng ngày của bill, với bill đó đang mở.
- Bill thêm tay chưa hủy có nút **Hủy** (quyền `einvoices.write`), mở `ReasonDialog` để nhập lý do.
- Dialog **Thêm hóa đơn**:
  - Ngày: `DatePicker`, `max` là ngày kinh doanh hôm nay.
  - Phòng: chọn từ `GET /rooms?branch`.
  - Số tiền HĐĐT, đã gồm VAT.
  - Tạo xong thì mở bill mới ở trang HĐĐT để nhập người mua và dòng hàng.

### 7.5. Hóa đơn điện tử (`/sales/einvoices`)

- Phần thân của trang HĐĐT hiện tại chuyển vào `components/einvoices/einvoices-page.tsx`, nhận `site: "main" | "report"`. Route của cả hai trang cùng dùng component này.
- Khi `site="report"`:
  - danh sách và số đếm lấy từ `/report-site/bills` và `/report-site/bills/summary`;
  - mỗi bill được tham chiếu bằng `{kind: "order" | "manual", id}` thay cho `orderId`;
  - bill thêm tay mở bằng `GET /report-site/manual-bills/:id`. Phần thông tin bill ghi "Bill thêm tay", ngày, phòng và tổng các HĐĐT. Không có danh sách món, không có "Lấy món từ bill", không có phần còn lại;
  - nút + trên bill thêm tay tạo nháp với số tiền 0;
  - "Gửi lại" trên HĐĐT đã xuất của bill thêm tay tạo nháp cho chính bill đó;
  - trang đọc tham số trên địa chỉ (bill và ngày) để mở bill được chọn từ Quản lý bán hàng.
- Ở cả hai trang, bỏ:
  - nút + cạnh ô tìm số bill;
  - nhóm "Hóa đơn không theo bill";
  - nhãn "HĐ tự do #id";
  - `revealFreeDraft`.

### 7.6. Báo cáo (`/reports/revenue|rooms|products`)

- Dựng từ các thành phần có sẵn:
  - `ReportToolbar`;
  - `useReportFilters` (bộ lọc trên URL, có `scope=chain`);
  - `StatTile`;
  - `RankingChart`;
  - `lib/excel-export.ts`.
- Mỗi báo cáo có một builder Excel mới trong `lib/report-sheets.ts`.
- **Doanh thu:**
  - Ô số liệu: Doanh thu, VAT, Tổng tiền, Số bill, Số HĐĐT, Đã xuất. Có Δ% khi so với kỳ trước.
  - Biểu đồ và bảng theo kỳ.
  - Khi xem cả chuỗi thì thêm bảng theo cơ sở.
- **Phòng:** tabs Theo phòng | Theo loại phòng (`useReportOption`), biểu đồ xếp hạng và bảng.
- **Hàng hóa:**
  - Bảng gồm Tên, ĐVT, SL, Trước VAT, VAT, Tổng, kèm ô tìm.
  - Hai dòng "Các mặt hàng khác" và "Chưa có dòng hàng" luôn nằm ở cuối.
- Bố cục theo `@container/main` và phải dùng được ở độ rộng 360–390px, như mọi trang khác.

### 7.7. Trang chính

- Form tài khoản có thêm ô **Vào trang báo cáo** (Có/Không).
  - Chỉ QL hệ thống thấy ô này.
  - Ô chỉ hiện với vai trò QL cơ sở và HĐQT.
- Trang HĐĐT thay đổi như §7.5.

## 8. Bảo mật

**Ranh giới quyền nằm ở backend, ở từng API**, không ở trang đăng nhập hay tên miền (§3.2).
- Id của HĐĐT và của bill thêm tay là số tăng dần, dễ đoán.
  - Mọi route chạm tới HĐĐT của bill thêm tay đều kiểm tra `canUseReportSite` và cơ sở.
  - Những chỗ dễ sót nhất là `GET`/`PATCH`/`DELETE /einvoices/:id`, xuất, `resolve`, sửa số và "Gửi lại".
- **Route có `SharedRequestInterceptor` thì kiểm tra quyền phải nằm trong guard**, như `PrViewGuard` hiện có.
  - Lý do: interceptor gộp các request giống nhau mà không xét ai gọi. Nếu kiểm tra nằm trong service, người không có quyền có thể nhận kết quả của người có quyền.
  - Vì vậy các route riêng của trang báo cáo nằm dưới `/report-site/`, chịu `ReportSiteGuard`, chứ không dùng tham số trên route `/einvoices/...`.
- Quyền được tính lại ở mỗi request, từ vai trò hiện tại cộng với ô quyền.
- Chỉ QL hệ thống đổi được ô quyền. Mỗi lần đổi ghi một dòng log.

**Dữ liệu vào**
- `roomId` phải thuộc cơ sở của bill.
- Ngày phải đúng định dạng và không sau hôm nay.
- Số tiền là số nguyên, có mức trần.
- Lý do hủy dài 1–300 ký tự.
- `site` khi đăng nhập chỉ nhận `report`.
- `ValidationPipe` bỏ các trường lạ, như ở mọi route khác.

**SQL mới** (danh sách gộp, summary, ba báo cáo, đọc JSON dòng hàng) chỉ dùng `$queryRaw` dạng template có tham số.

**Tên miền**
- Header `Host` giả chỉ đổi được giao diện trả về, không thêm được quyền.
- Không thêm tên miền báo cáo vào `CORS_ORIGINS`. Trang báo cáo gọi `/api` trên chính tên miền của nó nên không cần. Giữ như vậy để trang ở tên miền khác không đọc được token qua `/auth/refresh`.

**Dữ liệu trả về:** danh sách và báo cáo chỉ chọn những cột màn hình dùng. Không trả địa chỉ và email người mua.

**Excel:** tên hàng và tên người mua là chữ người dùng tự gõ. Cần kiểm tra `lib/excel-export.ts` ghi chúng thành ô chữ, không phải công thức.

**Rà soát trước khi merge**
- Chạy `/security-review` trên toàn bộ thay đổi của nhánh.
- e2e "thử phá quyền" với bốn loại tài khoản: thu ngân, QL cơ sở chưa được bật, QL của cơ sở khác, HĐQT.
  - Mỗi tài khoản gọi từng API mới, và từng API HĐĐT với id của bill thêm tay.
  - Kết quả mong đợi là 403. Riêng HĐQT đọc được, ghi thì 403.
- Chạy `npm audit` cho cả hai dự án.
- Chạy bản build production trên trình duyệt, kiểm tra CSP và việc mỗi tên miền có cookie riêng.
- Ghi kết quả vào `docs/security-review.md`, mục 6 "Trang báo cáo".

## 9. Tài nguyên (`docs/resource-rules.md` §5)

- Không thêm container, process hay thư viện.
- Mọi truy vấn đọc của trang báo cáo chạy trên `ReportPrismaService`.
- Báo cáo và summary có `SharedRequestInterceptor`.
- Danh sách bill tối đa 500 dòng (`X-Total-Count`, `ListLimitNotice`). Báo cáo Hàng hóa tối đa 1000 dòng.
- Không cộng tổng từ danh sách có trần.
- Trang báo cáo không tải lại định kỳ và không mở WebSocket.
- Chạy `EXPLAIN ANALYZE` các truy vấn mới trên khoảng 100 nghìn HĐĐT. Truy vấn theo một cơ sở phải dùng index `(branchId, businessDate)` của `Einvoice`.
- Chạy lại `test/load` một lần để chắc chắn bán hàng không chậm đi.
- **Dung lượng:**
  - `ManualBill` chỉ tăng vài dòng mỗi ngày.
  - Giữ dòng hàng làm mỗi HĐĐT đã xuất lớn thêm khoảng 0,2–2 KB, tức khoảng 100 MB mỗi năm cho khoảng 100 nghìn HĐĐT.
  - Cập nhật `docs/resource-rules.md`: §1.1 (trần mới) và §3.2 (mức tăng dung lượng).

## 10. Test

**Unit**
- VAT của nháp: `draftData` khi dòng thiếu, đủ và chưa có dòng nào.
- `parseDraft` đọc được dạng `{lines}`.
- Lấy số bill theo một ngày cho trước.
- `canUseReportSite`.

**e2e `test/report-site.e2e-spec.ts`** (chạy với fake Minvoice)
- **Quyền:**
  - Đăng nhập với `site=report` và gọi từng API bằng các tài khoản: thu ngân, QL cơ sở chưa được bật, QL của cơ sở khác, HĐQT (đọc được, ghi bị 403), QL hệ thống.
  - Tắt ô quyền thì request tiếp theo bị 403.
- **Đổi ô quyền:** chỉ QL hệ thống đổi được. Đổi vai trò thì ô về `false`.
- **Số bill:**
  - Bill thêm tay và bill thanh toán trong cùng ngày có số nối tiếp, không trùng.
  - Thêm cho một ngày đã qua thì lấy số tiếp theo của ngày đó.
  - Ngày sau hôm nay bị 400.
- **Tách khỏi bên chính:** HĐĐT của bill thêm tay không có trong số đếm bên chính. `POST /einvoices` không gắn bill bị 400.
- **Dòng hàng và VAT:** dòng hàng còn sau khi xuất; nháp có VAT ước tính.
- **Bill đã hủy:** HĐĐT chưa xuất của bill đã hủy không được tính, HĐĐT đã xuất thì có.
- **Tổng khớp:** tổng của báo cáo Phòng và báo cáo Hàng hóa (kể cả "Chưa có dòng hàng" và "Các mặt hàng khác") bằng báo cáo Doanh thu.
- **Hủy bill thêm tay:** được khi bill chỉ có nháp; 409 khi bill có HĐĐT đã xuất.
- **Xóa dữ liệu:** bill thêm tay bị xóa cùng.

**Migration:** chạy trên một database có sẵn HĐĐT tự do và nháp chưa có dòng, kiểm tra số bill, CHECK và VAT.

**e2e hiện có của HĐĐT:** sửa lại theo việc bỏ HĐĐT tự do.

**Trình duyệt**
- Kiểm tra rewrite theo tên miền trước tiên.
- Thử cả hai địa chỉ `localhost:3000` và `baocao.localhost:3000`, ở các độ rộng 360–1440px.
- Thử trên bản build production.

## 11. Triển khai và tài liệu

**`DEPLOYMENT.md`**
- §3.2 (Cloudflare Tunnel):
  - Thêm một Public Hostname cho trang báo cáo, trỏ vào `localhost:3000`.
  - Chứng chỉ:
    - tên miền con một cấp có chứng chỉ miễn phí, ví dụ `baocao.hvlsv.uk` hoặc `baocao-mediastar.vlab.id.vn`;
    - tên miền nhiều cấp, ví dụ `baocao.mediastar.vlab.id.vn`, cần mua Advanced Certificate Manager và bật Total TLS.
  - Thêm luật giới hạn đăng nhập cho tên miền mới.
- §3.1 (Nginx): thêm `server_name` của trang báo cáo. Let's Encrypt cấp được chứng chỉ cho tên miền ở mọi cấp.
- §6: ghi chú migration `20261005000000_report_site`: HĐĐT tự do được chuyển thành bill thêm tay, nên dãy số bill của các ngày đó có thêm số.
- Sau khi triển khai, QL hệ thống bật "Vào trang báo cáo" cho những tài khoản cần dùng.

**Tài liệu cần cập nhật**
- `CLAUDE.md` gốc: vai trò, trang báo cáo, `reportAccess`.
- `502-backend/CLAUDE.md`: module `report-site`, bill thêm tay, số bill.
- `src/einvoice/CLAUDE.md`: bill thêm tay, dòng hàng được giữ, VAT của nháp, bỏ HĐĐT tự do.
- `502-frontend/CLAUDE.md`: tên miền, khung trang, các trang mới.
- `components/einvoices/CLAUDE.md`.
- `docs/resource-rules.md`.
- `docs/security-review.md`.

## 12. Rủi ro

- **Rewrite theo host của Next.js** chưa từng dùng trong dự án. Kiểm tra đầu tiên, và đã có phương án dự phòng `/bc/...` (§7.1).
- **Số bill nhảy cóc** bên chính khi có bill thêm tay. Thu ngân có thể thắc mắc.
- **VAT của nháp là ước tính 10%** cho phần tiền chưa có dòng. Con số chỉ chính xác khi HĐĐT được xuất.
- **HĐĐT đã xuất trước bản này** không có dòng hàng. Báo cáo Hàng hóa của giai đoạn đó dồn vào dòng "Chưa có dòng hàng".
- **Tên hàng gõ tay** khác nhau về chính tả sẽ thành nhiều dòng riêng trong báo cáo Hàng hóa.
- **Chứng chỉ cho tên miền nhiều cấp** khi dùng Cloudflare (§11).
