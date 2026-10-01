# Hóa đơn điện tử (Minvoice) — thiết kế

Ngày: 01/10/2026. Trạng thái: đã duyệt thiết kế từng phần, chờ duyệt spec.

## 1. Bối cảnh và mục tiêu

Các cơ sở cần xuất hóa đơn điện tử cho bill đã thanh toán, qua nhà cung cấp **Minvoice**. Minvoice không có API công khai cho phần mềm khác gọi vào. Project nghiên cứu `minvoice-hddt-sender` (`/Users/linhsayshii/Documents/PetProject/me beo/minvoice-hddt-sender`) đã dựng lại được API mà web app Minvoice dùng:

- đăng nhập bằng cookie ASP.NET và token chống CSRF;
- lấy thông tin người bán, ký hiệu hóa đơn và tiền tệ;
- tạo hóa đơn (`POST https://<MST>.minvoice.net/api/api/app/invoice`).

Các API đọc đã được thử ngày 01/10/2026 với tenant `0108963990`. Tài liệu của nó (`docs/api-integration.md`) là tham chiếu cho mọi request trong spec này.

Mục tiêu:
1. Mỗi cơ sở có **MST** riêng và **một tài khoản Minvoice** riêng. Quản lý hệ thống đăng nhập một lần và chọn **ký hiệu hóa đơn** từ dropdown; thông tin người bán tự điền.
2. Trang **Hóa đơn điện tử**: một bill đã thanh toán **chia được thành nhiều hóa đơn nhỏ**, mỗi hóa đơn có số tiền, người mua và dòng hàng riêng.
3. **Thu ngân và quản lý cơ sở tạo và lưu nháp**. **Chỉ quản lý hệ thống xuất** lên Minvoice.
4. Sau khi xuất, database chỉ giữ **phần đầu** của hóa đơn, trong đó có **số hóa đơn do Minvoice cấp**; các dòng hàng bị xóa hẳn.

## 2. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Kiến trúc | Chuyển logic của wrapper vào backend NestJS thành module `src/einvoice`, viết lại bằng TypeScript. Không thêm process hay container, không thêm thư viện: dùng `fetch` và `node:crypto` có sẵn. Wrapper giữ nguyên làm công cụ thử nghiệm. |
| Nơi làm việc | Trang riêng `/[branch]/sales/einvoices`. Cột trái có nút **Tạo HĐĐT mới** trên cùng và danh sách hóa đơn bên dưới. Panel bên phải để sửa. |
| Bill và hóa đơn | Một bill có **nhiều** hóa đơn nhỏ; mỗi hóa đơn thuộc **đúng một** bill. Nút **+** thêm hóa đơn nhỏ, bao nhiêu tùy ý. Không gộp nhiều bill vào một hóa đơn. |
| Số tiền mỗi hóa đơn | Người tạo tự nhập, **đã gồm VAT** (phần khách trả). |
| Dòng hàng | Tự nhập, hoặc **lấy món từ bill**, hoặc thêm **dòng bù phần còn thiếu**. Chỉ xuất được khi các dòng cộng **đúng đến từng đồng** bằng số tiền đã nhập. Nháp được lưu cả khi chưa khớp. |
| Tổng các hóa đơn so với bill | **Không chặn**, chỉ cảnh báo khi tổng vượt bill. |
| Người mua | **Riêng cho từng hóa đơn**: MST (nút Tra), tên, địa chỉ, email. Bỏ trống là khách lẻ. Có nút **Chép từ HĐ trước**. |
| Tra MST | Cổng hóa đơn điện tử của Tổng cục Thuế trước, lỗi thì chuyển sang `api.xinvoice.vn`. |
| Quyền | Tạo, sửa, xóa nháp: quản lý cơ sở, thu ngân, quản lý hệ thống. **Xuất**, **sửa số**, **cấu hình Minvoice**: chỉ quản lý hệ thống. HĐQT: chỉ xem. |
| Hàng chờ | **Không có** hàng chờ, badge hay xuất hàng loạt. Quản lý hệ thống vào trang, lọc "Nháp" theo cơ sở và xuất từng hóa đơn. |
| Sau khi xuất | Xóa hẳn các dòng hàng và phần chi tiết người mua. Giữ phần đầu: bill, ký hiệu, ngày, **số**, id Minvoice, số tiền, VAT, MST và tên người mua, người tạo, người xuất. **Số sửa tay được**, để khớp khi ai đó sửa thẳng trên Minvoice. |
| Ngày hóa đơn | Người xuất chọn, mặc định hôm nay. **Chỉ chặn dưới**: từ ngày của hóa đơn mới nhất cùng ký hiệu. **Không chặn trên**. Chọn ngày sau hôm nay thì phải xác nhận. |
| Phạm vi Minvoice | Chỉ **tạo** hóa đơn và lấy `invoiceNumber`, lúc nào cũng có. Không lưu hay quản lý mã CQT (`taxAuthorityCode`). Ký số và gửi cơ quan thuế làm ngoài hệ thống. |
| Đăng nhập Minvoice | Quản lý hệ thống nhập tên đăng nhập và mật khẩu cho từng cơ sở. Server lưu **mật khẩu đã mã hóa** và tự đăng nhập lại khi phiên hết hạn. |
| Ký hiệu | Dropdown các ký hiệu của năm hiện tại mà tài khoản được dùng, mọi loại: thường (`…TMS`) và máy tính tiền (`…MMS`, `…MVN`). |
| `paymentMethod` | Luôn là `"TM/CK"`, giống wrapper. |
| Xử lý lỗi khi gửi | **Đăng nhập lại** để lấy cookie và token mới, **lấy lại dải hóa đơn** (`registerInvoiceId` hiện tại của ký hiệu), rồi **gửi lại một lần**. Có hai ngoại lệ: không rõ Minvoice đã tạo hay chưa (§9.2), và lỗi thứ tự ngày (§9.3). |
| Khung Minvoice trên trang | Chỉ hiện **tên công ty** người bán. |

**Ngoài phạm vi:**
- Ký số, gửi cơ quan thuế, lưu mã CQT.
- Hủy, điều chỉnh, thay thế hóa đơn trên Minvoice.
- Xem hoặc tải PDF; gửi email cho người mua.
- Dòng chiết khấu hoặc dòng âm.
- Gộp nhiều bill vào một hóa đơn; hóa đơn không gắn bill.
- Hàng chờ, badge, xuất hàng loạt.
- Nút xuất hóa đơn ở trang phòng hay bill sheet.
- Danh bạ khách hàng lưu trong database.
- Xuất Excel danh sách hóa đơn điện tử.

## 3. Ma trận quyền

| Việc | QL hệ thống | QL cơ sở | Thu ngân | HĐQT | Nhân viên |
|---|---|---|---|---|---|
| Xem trang và danh sách | ✓ mọi cơ sở | ✓ cơ sở mình | ✓ cơ sở mình | ✓ mọi cơ sở, chỉ xem | – |
| Tra MST | ✓ | ✓ | ✓ | – | – |
| Tạo, sửa, xóa nháp | ✓ | ✓ | ✓ | – | – |
| Xuất, đối chiếu hóa đơn "Không rõ", sửa số | ✓ | – | – | – | – |
| Đăng nhập Minvoice, chọn ký hiệu | ✓ | – | – | – | – |
| Nhập MST cơ sở (trang Cơ sở) | ✓, như quyền `branches` hiện nay | – | – | – | – |

Backend (`src/auth/roles.ts`):
- `EINVOICE_WRITERS = SALES` (quản lý hệ thống, quản lý cơ sở, thu ngân);
- `EINVOICE_READERS = [...SALES, BOARD]`;
- xuất, sửa số, cấu hình dùng `CHAIN_ONLY`.

Phạm vi cơ sở đi qua `BranchScopeService` như mọi chỗ khác.

Frontend (`lib/permissions.ts`):

| Quyền | Vai trò |
|---|---|
| `einvoices.view` | readers |
| `einvoices.write` | writers |
| `einvoices.issue` | quản lý hệ thống |
| `einvoices.config` | quản lý hệ thống |

## 4. Dữ liệu

Migration `20261003000000_einvoices`.

```prisma
enum EinvoiceStatus {
  DRAFT     // Nháp, sửa được, có `draft`. Có `lastError` thì trang hiện là "Lỗi"
  SENDING   // Đang gửi lên Minvoice
  UNCERTAIN // Không rõ Minvoice đã tạo hay chưa; phải đối chiếu trước khi gửi lại
  ISSUED    // Đã xuất: có số, `draft` = null
}

model Branch {
  // …các trường hiện có
  taxCode        String?          // MST: 10 số hoặc 10-3. Không unique, vì nhiều cơ sở có thể chung một công ty
  einvoiceConfig EinvoiceConfig?
  einvoices      Einvoice[]
}

// Tài khoản Minvoice và ký hiệu của một cơ sở. Tách khỏi Branch vì Branch
// được trả về ở rất nhiều API, còn bảng này giữ bí mật.
model EinvoiceConfig {
  id                Int       @id @default(autoincrement())
  branchId          Int       @unique
  branch            Branch    @relation(fields: [branchId], references: [id])
  taxCode           String    // MST lúc đăng nhập; khác Branch.taxCode thì phải đăng nhập lại
  username          String
  passwordEnc       String    // AES-256-GCM (EINVOICE_SECRET); không bao giờ trả về hay ghi log
  sessionEnc        String?   // {cookie, requestVerificationToken} của Minvoice, mã hóa như trên
  loginError        String?   // Minvoice từ chối mật khẩu đã lưu khi tự đăng nhập lại; xóa khi đăng nhập được
  symbolCode        String?   // ví dụ 1C26MMS
  registerInvoiceId String?   // GUID của đúng ký hiệu đó (dải hóa đơn hiện tại)
  currencyId        String?   // GUID của VND trong tenant
  seller            Json?     // {legalName, address, email, tel, bankAccount, bankName, fax, website}
  loggedInAt        DateTime?
  updatedById       Int?
  updatedBy         User?     @relation("EinvoiceConfigUpdatedBy", fields: [updatedById], references: [id])
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

// Mỗi hóa đơn nhỏ là một dòng. Chi tiết (`draft`) chỉ tồn tại tới khi xuất.
model Einvoice {
  id           Int            @id @default(autoincrement())
  branchId     Int
  branch       Branch         @relation(fields: [branchId], references: [id])
  orderId      Int
  order        Order          @relation(fields: [orderId], references: [id])
  businessDate DateTime       @db.Date  // chép từ Order.businessDate lúc tạo, để lọc theo ngày
  status       EinvoiceStatus @default(DRAFT)
  amount       Decimal        // số tiền đã gồm VAT, người tạo nhập
  vatAmount    Decimal        @default(0) // Σ VAT các dòng; tính lại mỗi lần lưu
  buyerTaxCode String?
  buyerName    String?
  draft        Json?          // §4.1; đặt về null khi ISSUED, trong cùng transaction

  // Phần đầu hóa đơn, ghi khi xuất
  sellerTaxCode     String?
  symbolCode        String?
  registerInvoiceId String?
  invoiceDate       DateTime? @db.Date
  invoiceNumber     Int?
  minvoiceId        String?   // id hóa đơn bên Minvoice
  lastError         String?   // lỗi lần gửi gần nhất, tối đa 300 ký tự
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

  @@unique([sellerTaxCode, symbolCode, invoiceNumber]) // không trùng số trong tenant + ký hiệu (NULL không tính)
  @@index([branchId, businessDate])                    // danh sách theo ngày
  @@index([branchId, status, createdAt])               // lọc theo trạng thái
  @@index([orderId])                                   // hóa đơn của một bill, tổng đã chia
  @@index([sellerTaxCode, symbolCode, invoiceDate])    // ngày của hóa đơn mới nhất cùng ký hiệu
}
```

`Order` có thêm `einvoices Einvoice[]`. Quan hệ tới `Order` để mặc định (Restrict): bill không bị xóa ngoài chức năng Xóa dữ liệu, và chức năng này xóa hóa đơn trước. `User` có thêm năm quan hệ ngược.

### 4.1. Cột `draft`

```ts
type EinvoiceDraft = {
  buyerAddress: string | null; // ≤ 400 ký tự
  buyerEmail: string | null;   // ≤ 200 ký tự, đúng định dạng email
  lines: Array<{
    name: string;       // 1–300 ký tự
    unit: string;       // ≤ 30 ký tự, có thể rỗng
    quantity: number;   // > 0, tối đa 3 chữ số thập phân
    unitPrice: number;  // số nguyên đồng, ≥ 0, trước VAT
    vatRate: 0 | 5 | 8 | 10;
    vatAmount?: number; // chỉ dòng bù đặt, lệch tối đa 1 đồng so với VAT tính (§5)
  }>;                   // 0–50 dòng trong nháp, 1–50 dòng khi xuất
};
```

DTO kiểm tra giới hạn mỗi lần lưu. Service đọc lại cột này qua cùng một hàm kiểm tra, nên JSON sai dạng không bao giờ đi vào payload.

### 4.2. Dung lượng

- Nháp chỉ sống vài giờ đến vài ngày và bị xóa khi xuất. Một hóa đơn đã xuất còn khoảng 200 byte.
- Cả chuỗi xuất vài trăm hóa đơn mỗi ngày, tức khoảng 100 nghìn dòng mỗi năm, tương đương `PrSession`.

### 4.3. Xóa dữ liệu (HĐQT)

- `data-purge.service.ts` xóa `Einvoice` trong phạm vi của nó **trước** khi xóa bill, và ghi thêm `einvoices` vào `counts` của `DataPurgeLog`.
- `EinvoiceConfig` được giữ lại, giống cơ sở và tài khoản.

## 5. Tính tiền (`src/einvoice/einvoice-math.ts`, bản sao ở frontend `lib/einvoice.ts`)

Hai file là hàm thuần, phải giữ đồng bộ như `billing.ts` và `lib/billing.ts`. Làm tròn là `Math.round` tới đồng; mọi số tiền đều ≥ 0.

- **Tiền một dòng:**
  - thành tiền `lineAmount = round(quantity × unitPrice)`;
  - VAT `lineVat = vatAmount ?? round(lineAmount × vatRate / 100)`.
- **Tổng hóa đơn:**
  - `amountWithoutVat = Σ lineAmount`;
  - `vatAmount = Σ lineVat`;
  - `total = amountWithoutVat + vatAmount`.
- **Điều kiện xuất:**
  - `total === amount`;
  - có 1–50 dòng;
  - nếu có `vatAmount` thì `|vatAmount − round(lineAmount × vatRate / 100)| ≤ 1`.
- **Dòng bù** cho phần còn thiếu `r > 0` với thuế suất `t`:
  - Lấy `X = round(r / (1 + t/100))`, thử lần lượt `X`, `X − 1`, `X + 1` để có `X + round(X × t/100) = r`.
  - Không số nào đạt đúng thì lấy `X = round(r / (1 + t/100))` và `vatAmount = r − X` (lệch 1 đồng).
  - Dòng thêm vào là `{name: "Dịch vụ karaoke", unit: "Lần", quantity: 1, unitPrice: X, vatRate: t}`, sửa được tên.
- **Thuế suất mặc định** của một dòng là `Order.taxPercent` nếu nó thuộc {0, 5, 8, 10}, không thì 10.
- **Lấy món từ bill:**
  - Mỗi `OrderItem` thành `{name: product.name, unit: product.unit, quantity, unitPrice: price}`, với `price` là giá đã chụp trên bill, trước giảm giá và VAT.
  - Thêm một dòng tiền giờ `{name: "Tiền giờ phòng <tên phòng>", unit: "Giờ", quantity: billedHours, unitPrice: pricePerHour}`. `billedHours` tính như `billing.ts`, nên `round(1,38 × 300.000) = 414.000` trùng với tiền giờ của bill.
  - Giảm giá của bill không tự vào dòng hàng. Panel hiện chúng ở phần đầu để người tạo tự điều chỉnh.
- **Số tiền bằng chữ:** chuyển `numberToVietnameseCurrency` từ wrapper sang, có unit test, ví dụ 4.332.400 → "Bốn triệu ba trăm ba mươi hai nghìn bốn trăm đồng".

## 6. Tích hợp Minvoice (`src/einvoice/minvoice/`)

### 6.1. Client (`minvoice-client.ts`)

Base URL: `https://<MST>.minvoice.net`. Trong test, `MINVOICE_URL_TEMPLATE` (ví dụ `http://127.0.0.1:4555/{taxCode}`) thay được base URL này; biến bị bỏ qua khi `NODE_ENV=production`. Trước khi ghép vào URL, MST phải khớp `^\d{10}(-\d{3})?$`. Mọi request đều đặt `redirect: 'manual'` và có timeout riêng qua `AbortSignal.timeout`.

| Hàm | Request (xem `docs/api-integration.md` của wrapper) | Timeout |
|---|---|---|
| `login(taxCode, username, password)` | `GET /api/api/abp/multi-tenancy/tenants/by-name/{MST}` → cookie `__tenant` → `GET /api/api/abp/application-configuration` (nhận `XSRF-TOKEN`) → `POST /api/api/account/login {userNameOrEmailAddress, password, rememberMe:false}` với header `RequestVerificationToken`; `result === 1` là đăng nhập được | 10 s cho cả chuỗi |
| `getSeller(session)` | `GET /api/api/app/tenant-company/` → map như `normalizeSellerProfile` | 10 s |
| `listSymbols(session, year)` | `GET /api/api/app/register-invoice/using-list?maxResultCount=1000&userName=<user>&Sorting=creationTime&SortType=DESCEND` → `use !== false`, cùng năm, mới nhất trước | 10 s |
| `getVndCurrencyId(session)` | `GET /api/api/app/currency?maxResultCount=1000` → dòng `VND` | 10 s |
| `createInvoice(session, payload)` | `POST /api/api/app/invoice`, header `RequestVerificationToken` | 25 s |

Một bộ cookie nhỏ (`CookieJar`) được chuyển từ wrapper sang, gồm cả phần tách `Set-Cookie`. Phiên là `{cookie, requestVerificationToken}`, mã hóa thành `EinvoiceConfig.sessionEnc` sau mỗi lần đăng nhập được.

### 6.2. Payload (`minvoice-payload.ts`, hàm thuần)

Dựng theo `buildInvoicePayload` của wrapper:
- `invoiceDetail[i]`:
  - `formulaType: "TX"`, `orders` và `ordinalNumber` = i + 1, `isShowOrder: true`;
  - `productCode: ""`, `productName` = name, `unitCode` = unit;
  - `quantity`, `unitPrice`, `amount` = lineAmount;
  - `discountRate: null`, `discountAmount: 0`, `amountWithoutVAT` = lineAmount;
  - `vatCode` = `String(vatRate)`, `vatAmount` = lineVat, `totalAmount` = lineAmount + lineVat;
  - `property: 1`.
- Phần đầu:
  - `invoiceSerial` = `symbolCode`, `registerInvoiceId`, `currencyId`, `currencyCode: "VND"`, `exchangeRate: "1"`;
  - **`paymentMethod: "TM/CK"`**, `invoiceDate` = `YYYY-MM-DD`.
- Các trường `null` giống `NULL_INVOICE_FIELDS`.
- Người bán lấy từ `EinvoiceConfig.seller` và `taxCode`.
- Người mua lấy từ `buyerTaxCode`, `buyerName` (→ `buyerLegalName`), `buyerAddress`, `buyerEmail`; không có thì `null`.
- Tổng: `amount` = `totalAmountWithoutVAT` = Σ lineAmount, `totalDiscountAmount: 0`, `vatAmount`, `totalAmount`, `totalAmountToWord`, `relatedInvoiceIds: []`.
- Mã đối chiếu `K502-<einvoiceId>` đặt vào trường chọn ở bước 0 (§12). Bước 0 không tìm được trường phù hợp thì không đặt.

### 6.3. Tra MST (`tax-payer.service.ts`)

- **Hai nguồn:**
  - Cổng thuế: `GET https://hoadondientu.gdt.gov.vn/api/category/public/dsdkts/{MST}/manager`, timeout 8 s.
  - Lỗi (403 chống bot, timeout, lỗi mạng, không có dữ liệu) thì gọi `GET https://api.xinvoice.vn/gdt-api/tax-payer/{MST}`, timeout 30 s.
- **Định dạng MST người mua** (tra cứu và ô MST trên hóa đơn): 10 số, 10-3, hoặc 12 số (từ 07/2025 cá nhân dùng số CCCD làm MST). MST của cơ sở chỉ nhận 10 số hoặc 10-3, vì nó được ghép vào tên miền Minvoice.
- **Kết quả:** `{taxCode, name, address, status, active, source: "gdt" | "xinvoice"}`.
  - `active` là `tthai === "00"` với cổng thuế, hoặc `status` bắt đầu bằng "NNT đang hoạt động" với xinvoice.
- **Khi không tra được:** cả hai nguồn không có MST thì 404 "Không tìm thấy MST". Cả hai lỗi vì lý do khác thì 502.
- **Bộ đệm trong bộ nhớ:** tối đa 1000 MST, hạn 7 ngày, bỏ mục cũ nhất khi đầy. Hai lần tra cùng một MST đồng thời dùng chung một lời gọi.
- **Giới hạn xinvoice:** tối đa 10 lần gọi trong 30 s, cửa sổ trượt. Vượt thì 429 "Tra cứu nhiều quá, thử lại sau ít giây".
- **Số liệu quan sát ngày 01/10/2026:** cổng thuế trả 403 mọi request từ máy dev. xinvoice trả trong khoảng 0,1 s cho MST đã có trong bộ đệm của họ, mất 20–23 s cho MST phải tra mới, và chấp nhận cả MST chi nhánh.

## 7. API backend

Mọi route nằm dưới `/api`. Tham số `?branch=` hoạt động như ở mọi chỗ khác.

### 7.1. Cấu hình

| Route | Quyền | Mô tả |
|---|---|---|
| `GET /einvoice/config?branch` | readers | Response gồm:<br>• `{branchTaxCode, configured, username, symbolCode, registerInvoiceId, sellerName}`<br>• `needsLogin`: không có phiên, `loginError`, hoặc `taxCode` ≠ `Branch.taxCode`<br>• `loginError`<br>• `minInvoiceDate`: `MAX(invoiceDate)` của hóa đơn `ISSUED` cùng `sellerTaxCode` + `symbolCode`, dùng index<br>Không bao giờ có mật khẩu, cookie hay token. |
| `POST /einvoice/config/login {branch, username, password}` | chain | Cơ sở chưa có MST thì 400 "Cơ sở chưa có mã số thuế". Đăng nhập xong thì lưu `username`, `passwordEnc`, `sessionEnc`, `taxCode`, `loggedInAt`, xóa `loginError`. MST khác lần trước thì xóa ký hiệu, người bán và tiền tệ đã chọn. Sai mật khẩu thì 400 "Sai tên đăng nhập hoặc mật khẩu Minvoice" và không ghi đè gì. Sai quá 5 lần trong 15 phút thì 429, đếm trong bộ nhớ theo cơ sở. |
| `GET /einvoice/config/symbols?branch&year` | chain | `{symbols: [{registerInvoiceId, symbolCode, invoiceTypeName, invoiceYear, creationTime}]}`, mặc định năm hiện tại. Phiên hết hạn thì tự đăng nhập lại bằng mật khẩu đã lưu. |
| `PUT /einvoice/config/symbol {branch, registerInvoiceId}` | chain | Id phải có trong `listSymbols`. Lấy người bán và `currencyId` VND rồi lưu. Chọn lại cùng ký hiệu nghĩa là làm mới các thông tin này. |

### 7.2. Tra MST

`GET /einvoice/tax-payers/:taxCode` (writers) như §6.3.

### 7.3. Hóa đơn

| Route | Quyền | Mô tả |
|---|---|---|
| `GET /einvoices?branch&from&to&status&billNumber` | readers | `status` là `DRAFT` (không lỗi), `ERROR` (`DRAFT` có `lastError`), `UNCERTAIN`, `ISSUED`, hoặc bỏ trống. `from`/`to` theo ngày kinh doanh của bill chỉ áp dụng khi `status` là `ISSUED` hoặc bỏ trống. `DRAFT`, `ERROR`, `UNCERTAIN` lấy mọi ngày (index `(branchId, status, createdAt)`), để không sót nháp của những ngày trước. Lấy tối đa 500 mục, `X-Total-Count`, sắp xếp `businessDate desc, orderId desc, id asc`. Mỗi mục gồm:<br>• `{id, status, amount, vatAmount, buyerTaxCode, buyerName, symbolCode, invoiceDate, invoiceNumber, lastError, createdAt, issuedAt}`<br>• `createdBy{id, fullName}`, `issuedBy{id, fullName}`<br>• `order{id, billNumber, finalAmount, endTime, cancelledAt, editedAt, room{name}}` |
| `GET /einvoices/summary?…` | readers | Cùng bộ lọc. `{draftCount, errorCount, uncertainCount, issuedCount, issuedAmount, issuedVat}`. Ba số đầu đếm mọi ngày, ba số sau theo khoảng ngày. Tính SQL trên `ReportPrismaService`, có `SharedRequestInterceptor`. |
| `GET /einvoices/bills?branch&businessDate&billNumber` | writers | Dành cho dialog chọn bill. Chỉ bill `COMPLETED` chưa hủy: `[{orderId, billNumber, roomName, endTime, finalAmount, allocated, einvoiceCount}]`. `allocated` là Σ `amount` các hóa đơn của bill, tính bằng một câu SQL `LEFT JOIN` gộp theo `orderId`. Tối đa 500, `X-Total-Count`. Lọc bill qua `(branchId, businessDate, billSeq)`, tìm số bill qua `(branchId, billNumber)`. |
| `GET /einvoices/bill/:orderId` | readers | Dành cho panel:<br>• bill `{id, billNumber, room{name}, startTime, endTime, finalAmount, taxAmount, taxPercent, pricePerHour, hourlyFee, discountAmount, hourlyDiscountAmount, cancelledAt, editedAt, items[{name, unit, quantity, price}]}` (hai khoản giảm giá là số tiền đã áp khi thanh toán)<br>• `einvoices[]`: có `draft` với hóa đơn chưa xuất<br>• `allocated` |
| `POST /einvoices {orderId, amount, buyerTaxCode?, buyerName?, buyerAddress?, buyerEmail?, lines[]}` | writers | Bill phải trong phạm vi, `COMPLETED` và chưa hủy, nếu không thì 400. Tạo `DRAFT` và tính `vatAmount`. |
| `PATCH /einvoices/:id {…như trên, trừ orderId}` | writers | `updateMany where {id, status: DRAFT}`, không khớp thì 409. Xóa `lastError`. |
| `DELETE /einvoices/:id` | writers | `deleteMany where {id, status: DRAFT}`, không khớp thì 409. |
| `POST /einvoices/:id/issue {invoiceDate, confirmFutureDate?}` | chain | Xuất (§8). |
| `POST /einvoices/:id/resolve {found: true, invoiceNumber} \| {found: false}` | chain | Chỉ khi `UNCERTAIN` (§9.2). |
| `PATCH /einvoices/:id/number {invoiceNumber}` | chain | Chỉ khi `ISSUED`. `invoiceNumber` ≥ 1. Trùng thì 409 "Số … đã có ở hóa đơn #…". Ghi `numberEditedAt/ById`. |

`orderDetailInclude` (bill sheet) có thêm `_count` hóa đơn điện tử theo trạng thái. Dialog Hủy bill và Sửa bill dùng số này để cảnh báo (§10.4).

## 8. Luồng xuất một hóa đơn

1. **Kiểm tra**, sai thì 400 và trạng thái không đổi:
   - Hóa đơn đang `DRAFT`, hoặc `UNCERTAIN` khi bước 0 tìm được cách đối chiếu (§9.2).
   - Bill chưa hủy.
   - Cấu hình đủ: có phiên hoặc mật khẩu, có `symbolCode`, `registerInvoiceId`, `currencyId`, `seller`; không `needsLogin` vì MST đổi.
   - `draft` hợp lệ và tổng khớp (§5).
   - `invoiceDate` ≥ `minInvoiceDate` (§9.3).
   - `invoiceDate` cùng năm với ký hiệu: "Ký hiệu 1C26MMS là của năm 2026, ngày hóa đơn là 02/01/2027".
   - `invoiceDate` sau hôm nay mà thiếu `confirmFutureDate: true`.
2. **Khóa:** `updateMany where {id, status: <trạng thái ở bước 1>} → {status: SENDING, sendingAt: now}`. Không khớp thì 409 "Hóa đơn đang được gửi hoặc đã xuất". Nếu hóa đơn vừa là `UNCERTAIN`, tìm trên Minvoice theo mã đối chiếu trước bước 3 (§9.2).
3. Đọc cấu hình, giải mã phiên (không có thì đăng nhập), dựng payload, gọi `createInvoice`. **Không** giữ transaction hay connection database trong lúc gọi Minvoice.
4. Lỗi thì phân loại theo §9.1. Đăng nhập lại theo từng cơ sở chỉ chạy một luồng một lúc (một `Promise` dùng chung cho mỗi `branchId`), nên hai lần xuất cùng lúc không đăng nhập hai lần song song.
5. **Thành công** (response có `id` và `invoiceNumber`): trong một transaction, ghi các trường sau:

   | Trường | Giá trị |
   |---|---|
   | `status` | `ISSUED` |
   | `invoiceNumber`, `minvoiceId` | từ response |
   | `sellerTaxCode`, `symbolCode`, `registerInvoiceId` | từ cấu hình |
   | `invoiceDate` | ngày đã chọn |
   | `vatAmount` | tổng VAT của payload |
   | `issuedById`, `issuedAt` | người xuất, lúc ghi |
   | `draft` | `null` |
   | `lastError`, `sendingAt` | `null` |

   Trả về dòng đã cập nhật.
6. Tổng thời gian tối đa: 25 s (gửi) + 10 s (đăng nhập) + 10 s (ký hiệu) + 25 s (gửi lại) = 70 s, dưới giới hạn 100 s của Cloudflare Tunnel.

Khi server khởi động (`onApplicationBootstrap` của `EinvoiceModule`), một câu `UPDATE "Einvoice" SET status = 'UNCERTAIN' WHERE status = 'SENDING'` xử lý các lần gửi bị cắt ngang. Chỉ có một backend nên lúc khởi động không còn lần gửi nào đang chạy.

## 9. Lỗi

### 9.1. Phân loại (`classifySendError`, hàm thuần)

| Tình huống | Xử lý |
|---|---|
| Minvoice **trả lời lỗi**: 401/403, 3xx (chuyển về trang đăng nhập), body HTML thay vì JSON, lỗi antiforgery/XSRF, lỗi về `registerInvoiceId` hay dải số, hoặc 4xx/5xx khác | **Quy tắc của người dùng:** đăng nhập lại bằng mật khẩu đã lưu, gọi `listSymbols` để lấy `registerInvoiceId` hiện tại của cùng `symbolCode` (cập nhật vào cấu hình), dựng lại payload, gửi lại **một lần**. Minvoice chạy ABP, mà ABP bọc mỗi request trong một transaction và rollback khi lỗi, nên request bị trả lỗi thì chưa tạo hóa đơn. Lần hai vẫn lỗi thì về `DRAFT`, `lastError` = thông báo của Minvoice. |
| Không kết nối được (DNS, `ECONNREFUSED`, timeout lúc kết nối): request chưa đi | Như dòng trên: đăng nhập lại, gửi lại một lần. |
| **Lỗi thứ tự ngày** (§9.3) | **Không** thử lại. Về `DRAFT` với `lastError` rõ ràng. |
| Mật khẩu đã lưu bị từ chối khi đăng nhập lại | Về `DRAFT`, `lastError` = "Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại". Ghi `EinvoiceConfig.loginError`. |
| `symbolCode` không còn trong `listSymbols` lúc thử lại | Về `DRAFT`, `lastError` = "Ký hiệu … không còn dùng được, chọn ký hiệu khác". |
| **Đã gửi mà không có phản hồi** (timeout khi đợi response, đứt kết nối giữa chừng), hoặc 200 mà thiếu `id`/`invoiceNumber` | `UNCERTAIN`, không gửi lại (§9.2). |
| Minvoice đã cấp số nhưng ghi database lỗi | Ghi log lỗi kèm `einvoiceId`, `minvoiceId` và số, không có bí mật. Dòng đó vẫn `SENDING`, nên đến lần khởi động sau sẽ thành `UNCERTAIN`. |
| Số Minvoice cấp trùng một dòng đã sửa tay (P2002 ở bước 5) | Vẫn ghi `ISSUED` với `minvoiceId` nhưng `invoiceNumber = null`, `lastError` = "Số 1015 trùng hóa đơn #…, kiểm tra và sửa số". |

Thông báo lỗi của Minvoice được cắt ở 300 ký tự. Mọi thông báo hiện cho người dùng đều bằng tiếng Việt.

### 9.2. Hóa đơn "Không rõ" (`UNCERTAIN`)

- **Nếu bước 0 (§12) tìm được API tìm hóa đơn và trường chứa mã `K502-<id>`:**
  - Với `POST /einvoices/:id/issue` trên hóa đơn `UNCERTAIN`, server khóa `UNCERTAIN → SENDING` (§8 bước 2) rồi tìm theo mã. Thấy thì ghi `ISSUED` với số tìm được. Không thấy thì gửi lại theo §8, từ bước 3. Tìm bị lỗi thì trả về `UNCERTAIN`.
  - Trang có nút **Kiểm tra lại** để làm đúng việc đó.
- **Nếu không tìm được:**
  - Quản lý hệ thống tự xem trên Minvoice rồi chọn **Đã có — nhập số** (`resolve {found: true, invoiceNumber}` ghi `ISSUED`) hoặc **Chưa có — gửi lại** (`resolve {found: false}` đưa về `DRAFT`, sau đó bấm Xuất như thường).
  - Trạng thái `UNCERTAIN` không bao giờ tự gửi lại.

### 9.3. Thứ tự ngày

Trong cùng một ký hiệu, hóa đơn mới không được mang ngày sớm hơn hóa đơn mới nhất trên Minvoice.
- **Giới hạn dưới** của ô Ngày HĐ là `minInvoiceDate`. Nếu bước 0 có API danh sách hóa đơn, lấy ngày muộn hơn giữa `minInvoiceDate` và ngày của hóa đơn mới nhất cùng ký hiệu trên Minvoice; nguồn sau bắt được cả hóa đơn lập thẳng trên Minvoice.
- **Không có giới hạn trên.** Chọn ngày sau hôm nay thì panel hỏi xác nhận: "Mọi hóa đơn sau cùng ký hiệu phải mang ngày từ 15/10/2026 trở đi". Server đòi `confirmFutureDate: true`.
- **Server** kiểm tra lại. Sai thì 400 "Ngày hóa đơn phải từ 01/10/2026 trở đi (hóa đơn #1015 cùng ký hiệu 1C26MMS mang ngày này)".
- **Minvoice vẫn từ chối vì ngày:** nhận diện theo mẫu thông báo ghi được ở bước 0 hoặc lần đầu gặp. Không thử lại. Panel gợi ý "Chọn ngày từ … trở đi".

### 9.4. Tranh chấp

- Mọi thao tác ghi là `updateMany`/`deleteMany` có điều kiện trạng thái, sai trạng thái thì 409:
  - sửa và xóa nháp: `DRAFT`;
  - xuất: `DRAFT` (hoặc `UNCERTAIN` ở nhánh đối chiếu) → `SENDING`;
  - đối chiếu bằng tay (`resolve`): `UNCERTAIN`;
  - sửa số: `ISSUED`.
- Hủy hoặc sửa bill **không bị chặn** (§10.4). Không tạo được nháp mới cho bill đã hủy, và không xuất được nháp của bill đã hủy (400 "Bill đã hủy").

## 10. Frontend

### 10.1. Trang `/[branch]/sales/einvoices`

- **Vị trí:** mục **Hóa đơn điện tử** trong nhóm Bán hàng của `lib/navigation.ts`, ngay sau Quản lý bán hàng. Quyền `einvoices.view`. `layout.tsx` đặt tiêu đề tab.
- **Khung Minvoice** (`einvoice-config-card.tsx`) nằm trên cùng:
  - **Quản lý hệ thống** thấy `MST <Branch.taxCode>`, ô tên đăng nhập, ô mật khẩu (không bao giờ điền sẵn) và nút **Đăng nhập**. Bên cạnh là dropdown **ký hiệu** của năm hiện tại, tải sau khi đăng nhập được. Chọn ký hiệu thì gọi `PUT symbol` và hiện **tên công ty**; khung chỉ hiện tên công ty.
  - Khi MST đổi hoặc có `loginError`: hiện cảnh báo và yêu cầu đăng nhập lại.
  - Cơ sở chưa có MST: "Cơ sở chưa có mã số thuế — nhập ở trang Cơ sở", có link sang trang đó.
  - **Người khác** chỉ thấy một dòng: "Minvoice: admin · 1C26MMS · CÔNG TY …" hoặc "Chưa cấu hình Minvoice".
- **Cột trái** (`einvoice-list.tsx`):
  - Nút **Tạo HĐĐT mới** (`einvoices.write`) trên cùng.
  - Bộ lọc: `DateRangePicker` theo ngày kinh doanh, mặc định `businessDate()`; ô tìm số bill; trạng thái dùng `Tabs` Tất cả | Nháp | Lỗi | Không rõ | Đã xuất, kèm số lượng từ `summary`. Các tab Nháp, Lỗi, Không rõ bỏ qua khoảng ngày và tắt ô chọn ngày, vì đó là việc còn tồn.
  - Hóa đơn gom theo bill. Dòng bill hiện số bill, phòng, tổng bill và "đã chia". Dưới đó là từng hóa đơn: "HĐ n" (n theo thứ tự tạo trong bill, tức theo `id`), số tiền, badge trạng thái, số hóa đơn nếu đã xuất, người tạo.
  - `ListLimitNotice` khi danh sách bị cắt ở 500.
  - Bấm một hóa đơn thì panel mở bill của nó, chọn sẵn hóa đơn đó.
- **Dialog chọn bill** (`bill-picker-dialog.tsx`):
  - `DatePicker` theo ngày kinh doanh, ô tìm số bill.
  - Danh sách bill từ `GET /einvoices/bills` kèm "đã chia / tổng".
  - Chọn bill thì panel mở bill đó với một hóa đơn nhỏ trống chưa lưu.

### 10.2. Panel một bill (`bill-einvoices-panel.tsx`, `einvoice-editor.tsx`, `buyer-fields.tsx`, `einvoice-lines.tsx`)

- **Phần đầu:**
  - Số bill, phòng, giờ thanh toán, tổng bill, VAT, các khoản giảm giá (để tham khảo), **đã chia**, **còn lại**.
  - Cảnh báo màu `text-warning` khi tổng các hóa đơn vượt bill; khi bill đã hủy ("Bill đã hủy lúc …"); khi bill được sửa sau khi tạo hóa đơn ("Bill đã sửa lúc … sau khi tạo hóa đơn").
- **Dải hóa đơn nhỏ:** HĐ 1, HĐ 2, … kèm badge trạng thái, và nút **+** (`einvoices.write`) để thêm hóa đơn nhỏ.
- **Hóa đơn chưa xuất:**
  - **Số tiền (đã gồm VAT).**
  - **Người mua:**
    - Ô MST và nút **Tra**. Tra được thì điền tên, địa chỉ, ghi nguồn; cảnh báo khi `active = false`. Tra không được thì báo lỗi và để nhập tay.
    - Ô Tên, Địa chỉ, Email; nút **Chép từ HĐ trước**.
    - Bỏ trống là khách lẻ.
  - **Dòng hàng:**
    - Bảng gồm Tên, ĐVT, SL, Đơn giá, VAT (chọn 0/5/8/10%), Thành tiền, nút xóa dòng.
    - Nút **Thêm dòng**, **Lấy món từ bill** (danh sách món và dòng tiền giờ, §5), **Thêm dòng bù phần còn thiếu** (chỉ bật khi còn thiếu > 0).
    - Dòng tổng: Trước thuế, VAT, Tổng, và **Còn thiếu / Thừa** màu đỏ khi chưa khớp.
- **Nút:**
  - **Lưu nháp** và **Xóa** (`einvoices.write`; xóa có hộp xác nhận).
  - **Ngày HĐ** (`DatePicker`, `min` = giới hạn dưới, không có `max`) và **Xuất** (`einvoices.issue`). Xuất chỉ bật khi đã lưu (không còn thay đổi chưa lưu), tổng khớp và cấu hình đủ. Ngày sau hôm nay thì hỏi xác nhận (`ConfirmDialog`).
  - Còn thay đổi chưa lưu thì có dấu hiệu, và hỏi trước khi rời hóa đơn hay rời trang.
- **Hóa đơn "Lỗi":** như nháp, thêm khung `lastError` ở trên.
- **Hóa đơn "Không rõ":** khung cảnh báo kèm các nút của §9.2 (quản lý hệ thống).
- **Hóa đơn đã xuất:** chỉ xem. Số hóa đơn (quản lý hệ thống có nút bút chì mở `edit-number-dialog.tsx`), ký hiệu, ngày, người mua (MST, tên), số tiền, VAT, người xuất và thời điểm, kèm dòng "Chi tiết xem trên Minvoice".
- **Nhãn** trong `lib/labels.ts`: Nháp, Đang gửi, Không rõ, Đã xuất, và "Lỗi" cho nháp có `lastError`.

### 10.3. Điện thoại

- Container query trên `@container/main`: danh sách chiếm hết chiều ngang; panel mở thành `Sheet` toàn màn hình (portal nên dùng breakpoint `sm:`).
- Bảng dòng hàng xếp thành từng thẻ khi hẹp. Kiểm tra ở 360–390px, không được cuộn ngang.
- Dùng các control chuẩn của site: `DatePicker`, `DateRangePicker`, `Tabs`.

### 10.4. Chỗ khác

- **Trang Cơ sở** (`app/[branch]/admin/branches/page.tsx`, `CreateBranchDto`/`UpdateBranchDto`): thêm ô **Mã số thuế**, tùy chọn, kiểm tra `^\d{10}(-\d{3})?$`. Kèm dòng chú thích: đổi MST thì phải đăng nhập Minvoice lại.
- **Bill sheet:** dialog **Hủy bill** và **Sửa bill** (`edit-paid-bill-dialog.tsx`) thêm dòng cảnh báo "Bill có 2 HĐĐT (1 đã xuất)" khi `_count` > 0. Không chặn.

## 11. Bảo mật

- **Mã hóa và khóa:**
  - `einvoice-secret.ts` dùng AES-256-GCM với IV ngẫu nhiên 12 byte, lưu dạng `v1:<iv>:<tag>:<ciphertext>` (base64).
  - Khóa `EINVOICE_SECRET` (32 byte, base64) đọc qua `config/env.ts`. Thiếu khóa thì production không khởi động, còn dev dùng một khóa cố định giống `JWT_SECRET`.
  - Đổi khóa thì giải mã thất bại, cấu hình chuyển sang `needsLogin`.
- **Không lộ bí mật:** mật khẩu, cookie, token không bao giờ nằm trong response, log hay `lastError`. Mọi response chọn cột cụ thể; `EinvoiceConfig` không bao giờ được trả nguyên dòng.
- **Chỉ gọi ra ba nơi:** `https://<MST>.minvoice.net` (MST đã kiểm tra định dạng), `hoadondientu.gdt.gov.vn`, `api.xinvoice.vn`. Không đi theo redirect.
  - Trình duyệt không bao giờ gọi Minvoice, nên CSP của frontend không đổi.
- **Chặn thử mật khẩu:** đăng nhập Minvoice sai quá 5 lần trong 15 phút theo cơ sở thì khóa tạm (bảo vệ tài khoản Minvoice). Tra MST có giới hạn tần suất.
- **Dữ liệu gửi bên thứ ba:** xinvoice chỉ nhận MST người mua, là thông tin công khai.
- **Tài liệu:** `docs/security-review.md` thêm mục hóa đơn điện tử: bí mật của bên thứ ba lưu mã hóa, API không chính thức của Minvoice, các địa chỉ gọi ra ngoài.

## 12. Việc cần xác minh với Minvoice thật

Người dùng đã cho phép làm các bước dưới đây mà không hỏi lại (01/10/2026). Riêng mật khẩu Minvoice thì người dùng tự gõ; agent không nhập. Dữ liệu kiểm tra: MST `0107811836`, ký hiệu `1C26MTT`, tài khoản `admin`.

**Bước 0** (trước khi code, **chỉ đọc**, tenant `0107811836`):
1. Tìm API danh sách hoặc tìm hóa đơn (ví dụ `GET /api/api/app/invoice?…` theo quy ước của ABP) trong bundle JavaScript của web app Minvoice.
2. Xác định một trường của payload mà Minvoice lưu lại và tìm được, để chứa `K502-<id>`. Ứng viên là `orderNumber`.
3. Ghi lại mẫu thông báo lỗi khi ngày hóa đơn sớm hơn hóa đơn mới nhất, nếu tìm được trong bundle.

Kết quả của bước 0 quyết định:
- §9.2 dùng nhánh "tìm được" hay "không tìm được";
- §9.3 có lấy thêm ngày mới nhất từ Minvoice không.

Cả hai nhánh đều đã được đặc tả, nên không phải sửa spec.

**Sau khi code xong:** gửi **một** hóa đơn thật với số tiền nhỏ để xác nhận:
- toàn luồng xuất;
- `invoiceNumber` trả về;
- Minvoice chấp nhận VAT lệch 1 đồng ở dòng bù. Nếu không chấp nhận, dòng bù bỏ `vatAmount`, và trường hợp đó panel báo "không khớp được đến từng đồng với một dòng, thêm hoặc sửa dòng khác".

**Kết quả** (kiểm tra với Minvoice thật ngày 01/10/2026, MST `0107811836`, ký hiệu `1C26MTT`):
- Chuỗi đăng nhập, `tenant-company`, `register-invoice/using-list` (3 ký hiệu) và loại tiền chạy đúng như đã cài; `GET /einvoice/config` không trả bí mật nào.
- Đã xuất hai hóa đơn thật từ app: 10.000 đ (dòng bù 9.091 + VAT 909) được số 1434, và 10.004 đ (dòng bù 9.095 + VAT 909, lệch 1 đồng so với 10% tính ra) được số 1435. Vậy Minvoice **chấp nhận VAT dòng bù lệch 1 đồng**; `fillerLine` giữ nguyên.
- `orderNumber` (`MARKER_FIELD`) được Minvoice lưu lại; danh sách `GET /api/api/app/invoice?invoiceSerial=…&orderNumber=…&loadAll=true…` lọc theo nó và các dòng trả về có `orderNumber`. Kiểm tra lại hóa đơn 1434 thấy đúng hóa đơn đó (cùng id Minvoice, `markerSeen`), còn mã chưa từng gửi thì không ra dòng nào. Chưa phân biệt được khớp đúng hay khớp một phần của chuỗi; không sao, vì dòng có `orderNumber` khác mã đối chiếu chỉ thành "không rõ", không bao giờ thành "tìm thấy".
- §9.2 đi nhánh "tìm được", nhưng `MARKER_SEARCH_CONFIRMED` vẫn `false` có chủ ý. Hóa đơn đã tạo mà mất câu trả lời được nhận ra tự động (dòng có mã đối chiếu), còn cờ chỉ quyết định việc **tự gửi lại khi tìm không thấy**; việc đó vẫn do người quyết định bằng **Chưa có — gửi lại** (cho phép sau 3 phút kể từ lần gửi). Bật cờ còn phải sửa lời trên giao diện và đẩy "tìm + gửi lại" tới sát giới hạn 95 giây của proxy.
- Chưa kiểm tra: số CCCD 12 chữ số làm `buyerTaxCode` (cần thêm một hóa đơn thật thứ ba).

## 13. Tài nguyên (`docs/resource-rules.md` §5)

- **Danh sách và tổng:**
  - Mọi danh sách có `take` (500) và chỉ `select` các cột trang dùng. Có `X-Total-Count` qua `withTotalCount`, trang có `ListLimitNotice`.
  - Không có tổng nào cộng từ danh sách đã cắt: `summary` và `allocated` tính bằng SQL, `summary` chạy trên `ReportPrismaService` với `SharedRequestInterceptor`.
- **Index:** mọi truy vấn đều đi qua index ở §4 hoặc index sẵn có của `Order`.
- **Bộ nhớ và kết nối:**
  - Mọi map trong bộ nhớ đều có giới hạn: bộ đệm MST 1000 mục, bộ đếm đăng nhập sai và khóa đăng nhập theo cơ sở (không quá số cơ sở), các lần tra MST đang chạy.
  - Không giữ transaction hay connection database trong lúc gọi ra ngoài.
- **Thứ không thêm:** thư viện, service Docker, polling, sự kiện WebSocket.
- **Dung lượng và log:**
  - Body request vẫn trong giới hạn 1mb: 50 dòng × 300 ký tự còn xa giới hạn.
  - Nháp bị xóa khi xuất, nên bảng không phình ra.
  - Log chỉ ghi lỗi, không ghi payload hay bí mật.
- **Load test:** không đụng luồng bán hàng, pool kết nối hay cấu hình database, nên theo §6 không cần chạy lại. Lý do ghi vào phần mô tả của lần commit.

## 14. Test

**Unit** (`*.spec.ts`):

| File | Kiểm tra |
|---|---|
| `einvoice-math.spec.ts` | Tiền dòng, tổng, điều kiện xuất; dòng bù đạt đúng tổng, gồm cả trường hợp phải lệch VAT 1 đồng; thuế suất mặc định. |
| `minvoice-payload.spec.ts` | Map đủ các trường; `paymentMethod` luôn `TM/CK`; ký hiệu đi cùng đúng `registerInvoiceId`; số thành chữ (các ví dụ của wrapper). |
| `einvoice-secret.spec.ts` | Mã hóa rồi giải mã ra đúng; sửa bản mã hoặc sai khóa thì lỗi. |
| `classify-send-error.spec.ts` | Mọi dòng của bảng §9.1. |
| `minvoice-client.spec.ts` | `fetch` giả lập: thứ tự các bước đăng nhập và cookie; lỗi xác thực hoặc dải số thì đăng nhập lại, lấy lại dải, gửi lại đúng một lần; timeout sau khi gửi thì không gửi lại; lỗi ngày thì không gửi lại; đăng nhập lại chạy một luồng một lúc. |
| `tax-payer.service.spec.ts` | Cổng thuế trước, rồi xinvoice; 404 và 502; bộ đệm có giới hạn và hạn dùng; giới hạn tần suất trả 429; tra đồng thời dùng chung. |

**E2E** (`test/einvoice.e2e-spec.ts`, thêm vào `npm run test:e2e`):
- **Cách chạy:** Minvoice được thay bằng một server HTTP giả trong test, qua `MINVOICE_URL_TEMPLATE`.
- **Quyền:** thu ngân tạo, sửa, xóa nháp nhưng xuất, sửa số, cấu hình thì 403; HĐQT chỉ đọc; gọi sang cơ sở khác thì 403.
- **Cấu hình:** đăng nhập, chọn ký hiệu, `GET config` không chứa mật khẩu, cookie hay token (kiểm tra cả chuỗi JSON).
- **Xuất:**
  - thành công: `ISSUED`, có số, `draft = null`;
  - hai lần xuất đồng thời: một lần 409;
  - server giả trả 401 lần đầu: đăng nhập lại rồi thành công, `registerInvoiceId` được làm mới;
  - ngày sớm hơn `minInvoiceDate`: 400; ngày tương lai thiếu xác nhận: 400; năm ký hiệu khác năm ngày HĐ: 400.
- **Không rõ kết quả:** gửi bị timeout thì `UNCERTAIN`, đối chiếu thì `ISSUED` hoặc `DRAFT`; khởi động lại thì `SENDING` thành `UNCERTAIN`.
- **Khác:**
  - sửa số trùng: 409;
  - không tạo được nháp cho bill đã hủy;
  - Xóa dữ liệu xóa `Einvoice` và ghi `einvoices` vào nhật ký.

**Frontend:** không có test tự động trong repo. Kiểm tra bằng `npm run lint`, `npm run build`, và chạy thử trên trình duyệt: luồng chia bill, lưu, xuất (qua backend trỏ vào server giả), ở 360–390px, giao diện sáng và tối.

## 15. Triển khai và tài liệu

- **Migration:** `20261003000000_einvoices`. Thêm `Branch.taxCode`, hai bảng, enum và các index. Không động vào dữ liệu cũ.
- **Biến môi trường:** `EINVOICE_SECRET`:
  - thêm vào `502-backend/.env.example`, `.env.docker.example`;
  - thêm vào `docker-compose.yml` ở dạng `${EINVOICE_SECRET:?Đặt EINVOICE_SECRET trong .env}`.
  - Hướng dẫn tạo khóa: `openssl rand -base64 32`.
- **`DEPLOYMENT.md`:**
  - thêm mục `§6.18` cho migration và biến mới (sau `§6.17` WebSocket);
  - ghi rằng production phải gọi ra được `*.minvoice.net` và `api.xinvoice.vn`.
- **`CLAUDE.md`:** mô tả tính năng trong phần kiến trúc backend và frontend, quyền, và dòng migration.
- **`docs/security-review.md`:** như §11.

## 16. Rủi ro

- **API không chính thức.** Minvoice đổi web app thì luồng đăng nhập hoặc tạo hóa đơn có thể hỏng. Toàn bộ request nằm trong `minvoice-client.ts` để sửa ở một chỗ. Lỗi hiện rõ ở `lastError` và không mất nháp.
- **Gửi trùng.** `POST /invoice` không có idempotency key. Chỉ gửi lại khi chắc Minvoice chưa tạo hóa đơn (§9.1); mọi trường hợp không chắc thành `UNCERTAIN` (§9.2).
- **Tra MST từ bên thứ ba.** Cổng thuế đang chặn, xinvoice không có hợp đồng và có giới hạn tần suất. Tra không được thì vẫn nhập tay, nên việc xuất không phụ thuộc vào tra cứu.
- **Mật khẩu của bên thứ ba lưu trên server.** Mã hóa, khóa nằm ngoài database, không bao giờ trả ra ngoài. Ai có cả database lẫn `.env` thì đọc được. Nên dùng một tài khoản Minvoice chỉ có quyền tạo hóa đơn.
- **Ngày tương lai** đẩy giới hạn dưới của cả ký hiệu. Hộp xác nhận ở §9.3 giảm rủi ro chọn nhầm.
