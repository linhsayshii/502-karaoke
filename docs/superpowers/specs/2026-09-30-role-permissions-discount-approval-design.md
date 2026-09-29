# Phân quyền bán hàng, chốt giờ, duyệt giảm giá và WebSocket cho thu ngân — thiết kế

Ngày: 30/09/2026. Trạng thái: đã duyệt hướng làm, chờ duyệt spec.

## 1. Mục tiêu

1. **Phục vụ** gọi món cho phòng mình được gán, thêm/bớt PR/KTV, xem bill tạm tính và **chốt giờ** (dừng tiền giờ).
2. **CSKH** chỉ xem phòng mình đang làm.
3. **Quản lý cơ sở** và **thu ngân** không sửa, không hủy hóa đơn đã thanh toán; chỉ quản lý hệ thống làm được.
4. **Thu ngân** muốn giảm giá (món, giờ) hay hạ VAT thì phải gửi yêu cầu, **quản lý cơ sở / quản lý hệ thống duyệt từ xa**. Mọi thay đổi giảm giá/VAT đều có nhật ký truy vết.
5. **WebSocket** cho màn hình thu ngân và quản lý: yêu cầu duyệt, kết quả duyệt, thay đổi phòng và hóa đơn đến ngay, không đợi chu kỳ tải lại.

## 2. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Duyệt giảm giá bằng cách nào? | **Chỉ duyệt từ xa**: thu ngân gửi yêu cầu, quản lý duyệt/từ chối trên máy của mình. Không có duyệt bằng mật khẩu tại quầy. |
| Quản lý cơ sở "không sửa, hủy hóa đơn" tới đâu? | Không sửa, không hủy **hóa đơn đã thanh toán**. Vẫn được **hủy phiên đang mở** (mở nhầm phòng). |
| Thu ngân? | Như quản lý cơ sở về hóa đơn đã thanh toán (vốn đã không có quyền; giữ nguyên). Không hủy phiên đang mở (giữ nguyên). |
| Sau khi chốt giờ | Tiền giờ dừng tại lúc chốt. Vẫn gọi/bớt món và gửi giảm giá được. Không thêm PR; PR đang trong phòng tự ra lúc chốt. Thu ngân/quản lý mở khóa được, có ghi log. |
| Cái gì cần duyệt? | Tăng bất kỳ khoản giảm giá nào (món, giờ; % hay số tiền) và **hạ % VAT**. Bỏ/giảm giảm giá hay tăng VAT thì áp ngay, vẫn ghi log. |
| Ai là "phục vụ" của phòng? | Người được gán `Order.serverId` của phiên đó (không xét `User.position`). Người được gán `cskhId` chỉ xem. |
| Phục vụ có được bớt món? | **Có** (theo yêu cầu "order phòng mình"). Rủi ro bớt món sau khi khách đã dùng được ghi nhận ở §9; thu ngân vẫn là người thu tiền và thấy đủ danh sách món. |
| WebSocket cho ai? | Chỉ vai trò bán hàng (thu ngân, quản lý cơ sở, quản lý hệ thống). Điện thoại phục vụ/CSKH giữ polling. |
| WebSocket mang gì? | Chỉ **tín hiệu** "có thay đổi" (vài chục byte); máy nhận gọi lại REST như hiện nay. Polling giữ làm dự phòng. |

Ngoài phạm vi: duyệt bằng mật khẩu quản lý tại quầy; duyệt các thay đổi khác ngoài giảm giá/VAT (bớt món, đổi giờ); WebSocket cho điện thoại nhân viên, báo cáo, kho, quỹ; nhật ký chi tiết từng lần gọi/bớt món; thông báo đẩy (push notification) khi app đóng.

## 3. Ma trận quyền

| Việc | QL hệ thống | QL cơ sở | Thu ngân | Phục vụ (được gán `serverId`) | CSKH / NV khác | HĐQT |
|---|---|---|---|---|---|---|
| Mở phòng, thanh toán | ✓ | ✓ | ✓ | – | – | – |
| Gọi/bớt món | ✓ | ✓ | ✓ | ✓ phòng mình | – | – |
| Đổi CSKH/phục vụ của phòng | ✓ | ✓ | ✓ | – | – | – |
| Thêm/cho ra/sửa giờ/xóa lượt PR | ✓ | ✓ | ✓ | ✓ phòng mình | – (trừ `managesPr`, như hiện nay) | – |
| Xem phòng, bill tạm tính | ✓ | ✓ | ✓ | ✓ phòng mình | ✓ phòng mình, chỉ xem | ✓ |
| Chốt giờ | ✓ | ✓ | ✓ | ✓ phòng mình | – | – |
| Mở khóa giờ (ghi log) | ✓ | ✓ | ✓ | – | – | – |
| Đổi giảm giá / VAT | áp ngay, ghi log | áp ngay, ghi log | gửi duyệt (hoặc áp ngay nếu không cần duyệt), ghi log | – | – | – |
| Duyệt / từ chối yêu cầu | ✓ cả chuỗi | ✓ cơ sở mình | – | – | – | – |
| Hủy yêu cầu đang chờ | ✓ | ✓ | ✓ | – | – | – |
| Xem nhật ký giảm giá | ✓ | ✓ | – | – | – | ✓ |
| Hủy phiên đang mở | ✓ | ✓ | – | – | – | – |
| Sửa / hủy hóa đơn đã thanh toán | ✓ | **✗** | ✗ | – | – | – |

Backend là nơi thực thi; `502-frontend/src/lib/permissions.ts` chỉ ẩn/hiện UI.

- `src/auth/roles.ts`: thêm `CHAIN_ONLY = [Role.CHAIN_MANAGER]` dùng cho `PATCH /orders/:id/paid` và `POST /orders/:id/void`.
- Quyền theo phòng (phục vụ) không biểu diễn được bằng `@Roles`: route mở thêm `Role.STAFF`, service kiểm tra `order.serverId === user.id` dưới khóa dòng của order (hàm `assertCanServe` trong `orders/order-access.ts`, dùng chung cho `OrdersService` và `PrSessionsService`).
- Frontend: `sales.editPaid` và quyền mới `sales.void` → chỉ `CHAIN_MANAGER`; thêm `discounts.approve` (MANAGERS), `discounts.view` (MANAGERS + BOARD). Quyền theo phòng ở trang phòng tính từ `order.serverId === user.id` (hàm `isServerOf(user, order)` trong `lib/permissions.ts`).

## 4. Chốt giờ

### Dữ liệu

```prisma
model Order {
  // …
  // Chốt giờ: tiền giờ tính tới lúc này; null khi đồng hồ còn chạy.
  timeLockedAt   DateTime?
  timeLockedById Int?
  timeLockedBy   User?     @relation("OrderTimeLockedBy", fields: [timeLockedById], references: [id])
  events         OrderEvent[]
}

// Sự kiện hiếm của một phiên cần truy vết (hiện chỉ có mở khóa giờ). Việc chốt
// giờ nằm trên Order, nên bảng này chỉ tăng khi có người mở khóa: vài dòng mỗi
// cơ sở mỗi ngày. Giữ như sổ sách, bị xóa cùng "Xóa dữ liệu".
model OrderEvent {
  id          Int            @id @default(autoincrement())
  branchId    Int
  branch      Branch         @relation(fields: [branchId], references: [id])
  orderId     Int
  order       Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type        OrderEventType
  // Mở khóa giờ: lúc đã chốt trước đó.
  lockedAt    DateTime?
  createdById Int?
  createdBy   User?          @relation("OrderEventCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime       @default(now())

  @@index([orderId])
}

enum OrderEventType {
  TIME_UNLOCK
}
```

### API

- `POST /orders/:id/lock-time` (SALES + STAFF): khóa order (`lockOrder`, PENDING); STAFF phải là `serverId`; đã chốt thì 409 "Phòng đã chốt giờ". Ghi `timeLockedAt = now`, `timeLockedById`; đóng các lượt PR đang mở tại `now` (`closeOpenPrSessions`). Trả order (`orderDetailInclude`). Phát `room.changed` và `order.changed`.
- `POST /orders/:id/unlock-time` (SALES): chưa chốt thì 409 "Phòng chưa chốt giờ". Xóa `timeLockedAt/ById`, ghi một `OrderEvent(TIME_UNLOCK, lockedAt)` trong cùng transaction. Đồng hồ chạy tiếp tính từ giờ vào (khoảng đã khóa vẫn tính tiền). Lượt PR đã đóng không mở lại.

### Tính tiền

- `billOf(order, end)` trong `orders.service.ts`: `end = order.timeLockedAt ?? now` cho bill tạm tính (`preview`) và thanh toán.
- **Thanh toán: `endTime = timeLockedAt ?? now`.** Thời lượng trên bill, ngày kinh doanh, số hóa đơn, phiếu thu quỹ (`occurredAt = endTime`) và báo cáo (theo `endTime`) cùng một mốc, nên `salesIncome` của quỹ vẫn bằng `collected` của báo cáo doanh thu. Hệ quả chấp nhận: hóa đơn chốt 05:59 nhưng thu 06:05 thuộc ngày kinh doanh trước.
- `closeOpenPrSessions(tx, id, endTime)` lúc thanh toán không đổi (đã đóng lúc chốt, lần gọi này không còn gì).
- Hủy phiên đang mở (đã chốt hay chưa): `endTime = now` như hiện nay.
- Sửa hóa đơn đã thanh toán (`editPaid`) không đổi: đã có `startTime`/`endTime`.
- Frontend `lib/billing.ts` không đổi công thức; trang phòng truyền `endTime = order.timeLockedAt ?? now`.

### PR sau khi chốt

- `POST /pr/sessions` trên phiên đã chốt → 409 "Phòng đã chốt giờ, không thêm PR được".
- `PATCH /pr/sessions/:id`: khi phiên đã chốt, `endAt` bắt buộc có và `≤ timeLockedAt` (luật thêm vào `pr-session-rules.ts`, thay "≤ now" bằng "≤ timeLockedAt ?? now"). `DELETE` vẫn được.

### Sơ đồ phòng

`roomInclude` (`rooms.service.ts`) thêm `timeLockedAt` vào `select` của phiên đang mở. Thẻ phòng hiện nhãn **"Đã chốt – chờ thanh toán"** và đồng hồ dừng ở lúc chốt (`formatElapsed` dùng `timeLockedAt ?? now`).

## 5. Phục vụ và CSKH

- `PATCH /orders/:id` mở thêm `Role.STAFF`. STAFF phải là `serverId` của phiên (kiểm tra sau `lockOrder`), và chỉ được gửi `items`; gửi `cskhId`/`serverId` → 403 "Phục vụ chỉ được gọi món".
- `GET /products` mở thêm `Role.STAFF` (thực đơn của cơ sở mình, cùng `pendingQuantity`). Chỉ tải một lần khi mở trang phòng, không tải lại định kỳ.
- PR: `canAssignPr(user)` giữ nguyên cho việc gán theo vai trò; `PrSessionsService` cho phép thêm trường hợp `user.role === STAFF && order.serverId === user.id`, kiểm tra sau `lockOpenOrder`. `GET /pr/available` mở cho STAFF (danh sách chọn PR của cơ sở mình).
- CSKH (hay STAFF không phải `serverId` của phiên): như hiện nay, chỉ xem (`assertCanView`).
- Mọi route trên đều yêu cầu `order.status = PENDING` (đã có qua `lockOrder`); phiên vừa đóng thì 409 như hiện nay.
- **Điều kiện vận hành:** tài khoản phục vụ phải có mật khẩu mới đăng nhập được (`User.password` được phép null cho nhân viên sàn). Form tài khoản hiện cảnh báo khi đặt vị trí Phục vụ mà chưa có mật khẩu.

### Trang phòng (frontend)

- `isServer = user.role === "STAFF" && order.serverId === user.id`.
- `canEditItems = can("sales.operate") || isServer` → hiện thực đơn, +/−.
- `canAssignPrHere = can("pr.assign") || isServer` → tab PR/KTV (không có nút thêm khi đã chốt).
- Nút **Chốt giờ** cho `canOperate || isServer` (hộp xác nhận); nút **Mở khóa giờ** cho `canOperate`.
- Phần giảm giá/VAT chỉ hiện với `canOperate` (§6). Nút **Thanh toán** chỉ với `canOperate`.
- Phục vụ không tải `/users/floor-staff` (không đổi người được gán).
- Sidebar: mục "Phòng đang phục vụ" của STAFF giữ nguyên.

## 6. Duyệt giảm giá và nhật ký

### Dữ liệu

```prisma
// Mỗi thay đổi giảm giá/VAT của một hóa đơn: yêu cầu của thu ngân (chờ duyệt),
// thay đổi áp ngay (quản lý, hoặc thay đổi không cần duyệt) và sửa hóa đơn đã
// thanh toán. Vừa là hàng chờ duyệt vừa là nhật ký truy vết. Ước tính
// ~30 dòng/cơ sở/ngày, ~55k dòng/năm cho 5 cơ sở; giữ như sổ sách, bị xóa cùng
// "Xóa dữ liệu".
model DiscountRequest {
  id             Int                   @id @default(autoincrement())
  branchId       Int
  branch         Branch                @relation(fields: [branchId], references: [id])
  orderId        Int
  order          Order                 @relation(fields: [orderId], references: [id], onDelete: Cascade)
  status         DiscountRequestStatus
  source         DiscountSource
  // {discountPercent, discountAmount, hourlyDiscountPercent, hourlyDiscountAmount, taxPercent}
  before         Json
  after          Json
  // Tổng bill (đã VAT) ước tính lúc gửi, trước và sau thay đổi.
  amountBefore   Decimal
  amountAfter    Decimal
  note           String? // lý do của người gửi (bắt buộc khi cần duyệt)
  requestedById  Int?
  requestedBy    User?                 @relation("DiscountRequestedBy", fields: [requestedById], references: [id])
  createdAt      DateTime              @default(now())
  decidedById    Int?
  decidedBy      User?                 @relation("DiscountDecidedBy", fields: [decidedById], references: [id])
  decidedAt      DateTime?
  decisionNote   String?

  @@index([branchId, status])
  @@index([branchId, createdAt])
  @@index([orderId])
}

enum DiscountRequestStatus {
  PENDING   // chờ duyệt
  APPROVED  // đã áp (duyệt, hoặc áp ngay)
  REJECTED  // quản lý từ chối
  CANCELLED // người gửi / thu ngân hủy
  EXPIRED   // phiên đã đóng, hoặc giảm giá đã đổi trước khi duyệt
}

enum DiscountSource {
  REQUEST   // thu ngân gửi, cần duyệt
  DIRECT    // áp ngay: quản lý, hoặc thay đổi không cần duyệt
  PAID_EDIT // sửa hóa đơn đã thanh toán (quản lý hệ thống)
}
```

`before`/`after` là JSON 5 số (~100 byte), không phải JSON lớn (§3.3 của `resource-rules.md`).

### Ai nhận yêu cầu

Một yêu cầu của cơ sở X được gửi tới **mọi tài khoản quản lý cơ sở đang hoạt động của cơ sở X** (mọi máy họ đang đăng nhập) và mọi quản lý hệ thống. Không gán cho một người cụ thể; quản lý cơ sở khác không thấy.

- Hàng chờ, badge và thông báo của quản lý cơ sở đều lọc theo `user.branchId`; của quản lý hệ thống là cả chuỗi.
- **Ai xử lý trước thì thắng.** Trạng thái chỉ đổi khi còn `PENDING` (`updateMany` có điều kiện, dưới khóa order). Người bấm sau nhận 409 "Yêu cầu đã được {Nguyễn A} duyệt lúc 21:05" (hoặc từ chối, thu ngân đã hủy), và thẻ yêu cầu biến khỏi hàng chờ trên mọi máy (sự kiện `discount.decided`, hoặc lần tải lại kế tiếp).
- Nhật ký ghi đúng người đã duyệt/từ chối (`decidedById`).
- **Điều kiện:** mỗi cơ sở cần ít nhất một quản lý cơ sở đang hoạt động, có mật khẩu và đăng nhập trong ca. Khi gửi yêu cầu mà cơ sở không có quản lý cơ sở nào đang hoạt động, API vẫn nhận (quản lý hệ thống duyệt được) và màn hình thu ngân báo "Cơ sở chưa có quản lý cơ sở, yêu cầu chỉ tới quản lý hệ thống".

### Luật cần duyệt

Hàm thuần `needsApproval(before, after)` trong `orders/discount-rules.ts` (unit test): cần duyệt khi **bất kỳ** `discountPercent`, `discountAmount`, `hourlyDiscountPercent`, `hourlyDiscountAmount` tăng lên, hoặc `taxPercent` giảm xuống. Ví dụ: đổi giảm 10% thành 50.000đ là `discountAmount` tăng → cần duyệt. So sánh từng trường riêng, không so tổng tiền, vì % áp trên số liệu đang chạy nên tổng thay đổi theo thời gian.

### API

`src/discounts` (module mới), mọi đường ghi đi qua `lockOrder`/`lockOrderRow` của order trước:

- `POST /orders/:id/adjustments {discountPercent?, discountAmount?, hourlyDiscountPercent?, hourlyDiscountAmount?, taxPercent?, note?}` (SALES), phiên PENDING:
  - Không có trường nào đổi → 400 "Không có thay đổi".
  - Đã có yêu cầu PENDING của phiên này → 409 "Đang có yêu cầu chờ duyệt".
  - Quản lý, hoặc `!needsApproval` → áp ngay vào order, ghi dòng `DIRECT/APPROVED` (`decidedBy = requestedBy`, `decidedAt = now`).
  - Thu ngân và `needsApproval` → `note` bắt buộc (400 "Nhập lý do giảm giá"), ghi dòng `REQUEST/PENDING`, order không đổi.
  - `amountBefore/After` = `billOf` với giá trị trước/sau tại thời điểm gửi.
  - Trả order (`orderDetailInclude`, có kèm yêu cầu đang chờ). Phát `discount.requested` hoặc `order.changed`.
- `PATCH /orders/:id` **không nhận** 5 trường này nữa (tách DTO: `OrderAdjustmentsDto` dùng cho `/adjustments` và `EditPaidOrderDto`; `UpdateOrderDto` chỉ còn `items`, `cskhId`, `serverId`).
- `GET /discount-requests?status=PENDING&branch` (MANAGERS): hàng chờ, cũ nhất trước, trần 200, `X-Total-Count`. Quản lý hệ thống không truyền `branch` → cả chuỗi (`resolveOptionalBranchId`), có cột cơ sở.
- `GET /discount-requests/pending-count` (MANAGERS): `{count}`, cho badge (`COUNT` trên index `(branchId, status)`). Quản lý cơ sở: cơ sở mình; quản lý hệ thống: cả chuỗi (badge và hàng chờ của họ không phụ thuộc cơ sở đang xem).
- `GET /discount-requests?from&to&branch&status?` (MANAGERS + BOARD): nhật ký theo ngày kinh doanh của `createdAt`, mới nhất trước, trần 500, `X-Total-Count`. `select` chỉ các cột màn hình dùng (phòng, số hóa đơn/`#id`, người gửi, người duyệt, trước/sau, số tiền, ghi chú, trạng thái).
- `POST /discount-requests/:id/approve {note?}` (MANAGERS, đúng cơ sở):
  1. Khóa order (PENDING; phiên đã đóng → yêu cầu thành `EXPIRED`, 409 "Phiên đã đóng").
  2. Khóa và đọc lại yêu cầu; không còn PENDING → 409 nêu ai đã xử lý và lúc nào ("Yêu cầu đã được Nguyễn A duyệt lúc 21:05", "… từ chối …", "Thu ngân đã hủy yêu cầu", "Yêu cầu đã hết hạn").
  3. Giá trị hiện tại của order ≠ `before` → yêu cầu thành `EXPIRED`, 409 "Giảm giá đã thay đổi, thu ngân cần gửi lại". Không bao giờ ghi đè giá trị mới hơn.
  4. Áp `after` vào order, yêu cầu → `APPROVED`. Phát `discount.decided` và `order.changed`.
- `POST /discount-requests/:id/reject {note}` (MANAGERS): lý do bắt buộc; → `REJECTED`. Phát `discount.decided`.
- `POST /discount-requests/:id/cancel` (SALES, đúng cơ sở): → `CANCELLED`. Phát `discount.decided`.

Cập nhật trạng thái yêu cầu dùng `updateMany({where: {id, status: PENDING}})` và kiểm tra `count`, dưới khóa order, để duyệt và hủy đồng thời không cùng thắng.

### Các luồng khác

- **Thanh toán** khi phiên có yêu cầu PENDING → 409 "Hóa đơn đang chờ quản lý duyệt giảm giá. Chờ duyệt hoặc hủy yêu cầu." Kiểm tra bằng `findFirst({where: {orderId, status: PENDING}, select: {id}})` trên index `(orderId)`, sau `lockOrder`.
- **Hủy phiên đang mở**: yêu cầu PENDING → `EXPIRED` trong cùng transaction.
- **Sửa hóa đơn đã thanh toán** (`editPaid`, chỉ quản lý hệ thống): nếu 5 trường đổi, ghi thêm dòng `PAID_EDIT/APPROVED` (note = lý do sửa) trong cùng transaction.
- `orderDetailInclude` thêm `discountRequests: {where: {status: PENDING}, take: 1, select: {id, after, note, amountBefore, amountAfter, createdAt, requestedBy: {select: {id, fullName}}}}`. `orderInclude` (danh sách) không đổi.

### Frontend

- **Trang phòng, thu ngân:** ô giảm giá/VAT sửa như hiện nay, nhưng không lưu khi rời ô nữa. Có nút **"Áp dụng"**, hoặc **"Gửi duyệt"** khi `needsApproval` (hàm dùng chung, mirror trong `lib/discount-rules.ts`), mở hộp nhập lý do. Khi có yêu cầu chờ: băng vàng "Đang chờ quản lý duyệt: … (1.250.000 → 1.100.000)", nút **Hủy yêu cầu**, ô giảm giá khóa, nút Thanh toán khóa kèm lời nhắc. Bị từ chối/hết hạn: toast kèm lý do (từ `discount.decided` hoặc lần tải lại).
- **Trang phòng, quản lý:** như trên nhưng nút luôn là "Áp dụng".
- **Trang mới `/[branch]/sales/discounts` "Duyệt giảm giá"** (nhóm Bán hàng; `discounts.view`):
  - Tab **Chờ duyệt** (`discounts.approve`): mỗi yêu cầu một thẻ (cơ sở, phòng, người gửi, lúc gửi, từng khoản trước → sau, tổng tiền trước → sau, lý do), nút **Duyệt** / **Từ chối** (hộp lý do). Trên điện thoại hiển thị một cột.
  - Tab **Nhật ký**: `DateRangePicker` (mặc định ngày kinh doanh hôm nay), lọc trạng thái, bảng `SHOW_FROM` cho cột phụ, `ListLimitNotice`.
  - Tab mặc định: Chờ duyệt với quản lý, Nhật ký với HĐQT.
- **Badge** số yêu cầu chờ trên mục sidebar "Duyệt giảm giá" (chỉ `discounts.approve`), từ `pending-count`.
- `lib/navigation.ts`, `lib/permissions.ts` (`ROUTE_PERMISSIONS`: `/sales/discounts` → `discounts.view`), `app/[branch]/sales/discounts/layout.tsx` (metadata).
- Bill sheet (`components/sales/bill-sheet.tsx`): nút sửa/hủy hóa đơn đã thanh toán theo `sales.editPaid` / `sales.void` (chỉ quản lý hệ thống).

## 7. WebSocket (giai đoạn 2)

### Mục đích

Chỉ báo "có thay đổi" cho màn hình thu ngân và quản lý. Máy nhận gọi lại REST. Mất socket thì mọi thứ chạy bằng polling như hiện nay; bán hàng không phụ thuộc vào WebSocket.

### Sự kiện

| Sự kiện | Gửi tới | Máy nhận làm gì |
|---|---|---|
| `room.changed {branchId, roomId}` — mở phòng, chốt/mở khóa giờ, thanh toán, hủy phiên | cơ sở đó | Sơ đồ phòng tải lại `/rooms` (gộp nhiều tín hiệu trong 1 s thành một lần tải) |
| `order.changed {branchId, orderId}` — sửa món, PR, giảm giá áp ngay/được duyệt, chốt/mở khóa | cơ sở đó | Trang phòng đang mở đúng `orderId` tải lại order; nơi khác bỏ qua |
| `discount.requested {branchId, requestId}` | mọi socket của quản lý cơ sở X và quản lý hệ thống | Tải lại `pending-count` (và hàng chờ nếu đang mở), toast "Có yêu cầu giảm giá mới – phòng …" |
| `discount.decided {branchId, orderId, requestId, status}` | mọi socket của cơ sở X (quản lý và thu ngân) và quản lý hệ thống | Máy quản lý: tải lại `pending-count`/hàng chờ, thẻ đã xử lý biến mất. Trang phòng đúng `orderId`: tải lại order, toast kết quả |

Quản lý hệ thống nhận sự kiện của mọi cơ sở. Nội dung tin nhắn chỉ có id; không mang dữ liệu nghiệp vụ, nên không lộ gì dù ai đó nghe được.

### Backend

- `@nestjs/websockets` + `@nestjs/platform-ws` (thư viện `ws`, nhẹ; không dùng socket.io). Gateway tại `/api/ws`, gắn trên cùng HTTP server.
- **Xác thực:** sau khi nối, máy khách gửi `{type: "auth", token}` (access token) trong 5 giây, không thì đóng. Không đặt token trên URL (URL vào log của proxy). Server kiểm tra token và nạp lại user từ DB như `JwtStrategy`. Chỉ nhận vai trò bán hàng (`SALES`), user `active`. Token hết hạn thì máy khách gửi lại `auth` với token mới sau lần refresh (15 phút). Server đóng socket khi token hiện tại hết hạn mà không được gia hạn, và khi phiên 24 giờ kết thúc.
- **Bộ đăng ký trong RAM có trần:** `Map<branchId, Set<socket>>` + tập của quản lý hệ thống; tối đa **100** socket (vượt thì đóng với mã 1013 "thử lại sau"), tối đa 5 socket mỗi user. Xóa khi socket đóng. Backend một tiến trình nên phát trong RAM là đủ (ghi chú: nhiều tiến trình thì cần pub/sub).
- **Heartbeat:** server `ping` mỗi 30 giây (Cloudflare cắt kết nối im lặng sau ~100 giây); không nhận `pong` sau 2 lần thì đóng.
- **Phát sau commit:** service gọi `events.emit(...)` **sau khi** `$transaction` trả về, không bao giờ bên trong transaction.
- Không ghi log từng tin nhắn; chỉ ghi lỗi.
- Tin nhắn từ máy khách chỉ nhận `auth` (≤ 4 KB, `maxPayload` của `ws`); loại khác bị bỏ qua.

### Frontend

- `hooks/use-live-events.ts`: một kết nối dùng chung cho cả app (context trong `app-shell`), chỉ mở với vai trò bán hàng. Dùng `WebSocket` của trình duyệt, không thêm thư viện. URL `/api/ws` cùng origin (`wss://` ở production); CSP `connect-src 'self'` đã cho phép cùng origin.
- Nối lại: chờ 1 s, 2 s, 4 s… tối đa 30 s, cộng thêm ngẫu nhiên 0–1 s. Tab ẩn thì vẫn giữ socket (thu ngân cần biết khi quay lại). Mất socket quá 30 giây thì polling trở lại chu kỳ cũ.
- `usePolling` nhận chu kỳ theo trạng thái socket: **đang nối** → sơ đồ phòng 60 s, trang phòng 60 s, badge 60 s; **mất nối** → 30 s / 15 s / 15 s như hiện nay.
- Gửi lại `auth` khi `lib/api.ts` báo có access token mới (`onSessionChange`); đóng khi đăng xuất.

### Đường đi mạng — điều kiện phải kiểm tra trước (spike)

Production: Cloudflare Tunnel → frontend `:3000` (Next standalone) → rewrite `/api/*` → `http://backend:4000`. Mã Next 16.1.1 (`next/dist/server/lib/router-server.js`, `upgradeHandler`) chuyển tiếp request upgrade khi rewrite trỏ ra URL ngoài (`proxyRequest`), và Cloudflare Tunnel hỗ trợ WebSocket, nên `/api/ws` nhiều khả năng đi thẳng được. **Chưa chạy thử.** Việc đầu tiên của giai đoạn 2 là một spike: dựng `docker compose` như production, nối `/api/ws` qua frontend, giữ 10 phút có ping. Nếu Next không chuyển được: thêm luật `ingress` theo path `/api/ws` trong `cloudflared` trỏ vào backend (ghi vào `DEPLOYMENT.md` §3.2). Phương án Nginx trong `DEPLOYMENT.md` cần `proxy_set_header Upgrade/Connection` và `proxy_read_timeout` > 60 s.

## 8. Xóa dữ liệu (HĐQT)

`data-purge.service.ts` xóa thêm `DiscountRequest` và `OrderEvent` của phạm vi (trước `Order`, dù có `onDelete: Cascade`, để đếm được), và ghi `discountRequests`, `orderEvents` vào `DataPurgeLog.counts`.

## 9. Rủi ro và điều kiện vận hành

1. **Phục vụ bớt món sau khi khách đã dùng.** Thu ngân thấy đủ danh sách món khi thu tiền. Chưa có nhật ký từng lần gọi/bớt món (ngoài phạm vi); nếu cần truy vết sau này, dùng `OrderEvent` với loại mới.
2. **Quản lý không mở app** → yêu cầu treo, khách chờ. Thu ngân hủy yêu cầu và thu theo giá gốc được. Mỗi cơ sở cần ít nhất một quản lý có điện thoại đăng nhập trong ca.
3. **Tài khoản phục vụ phải có mật khẩu** (§5).
4. **Phục vụ chốt giờ nhầm** → thu ngân mở khóa; khoảng đã khóa vẫn tính tiền, có log `OrderEvent`.
5. **Hóa đơn chốt trước 06:00, thu sau 06:00** thuộc ngày kinh doanh trước (§4).
6. **Cloudflare/Next không chuyển WebSocket** → giai đoạn 2 dùng `ingress` riêng; giai đoạn 1 không bị ảnh hưởng.

## 10. Tài nguyên (theo `docs/resource-rules.md`)

- Bảng mới có mức tăng và cách dọn (§4, §6 trên; `resource-rules.md` §3.2 được bổ sung). Index chỉ những cái có truy vấn dùng: `DiscountRequest(branchId, status)` (hàng chờ, badge), `(branchId, createdAt)` (nhật ký), `(orderId)` (thanh toán, chi tiết phiên); `OrderEvent(orderId)`.
- Danh sách có trần + `X-Total-Count` + `ListLimitNotice`: hàng chờ 200, nhật ký 500 (thêm vào danh sách trần ở §1.1).
- Truy vấn trong luồng bán hàng (thanh toán kiểm tra yêu cầu chờ, `/adjustments`, `lock-time`) chạy `EXPLAIN ANALYZE` trên dữ liệu `test/load`: không `Seq Scan` trên bảng lớn.
- Polling qua `usePolling`, chu kỳ ≥ 15 s; badge chỉ ở máy quản lý. Điện thoại phục vụ không thêm polling mới (thực đơn tải một lần).
- WebSocket: `Map` có trần (100 socket, 5 mỗi user), dọn khi đóng; tin nhắn vài chục byte; `maxPayload` 4 KB; không log từng tin nhắn. Thư viện `@nestjs/websockets`, `@nestjs/platform-ws` ở `dependencies` (cần lúc chạy); kiểm tra dung lượng khi thêm. Ghi quy tắc mới vào `resource-rules.md` (§1: WebSocket chỉ báo tín hiệu, có trần, phát sau commit).
- `test/load/bench.mjs`: thêm 20 socket (10 thu ngân + 10 quản lý) mở suốt bài đo và các thao tác gửi/duyệt giảm giá, chốt giờ; so sánh thanh toán p95 và RAM backend/frontend với bảng §6 của `resource-rules.md`.

## 11. Kiểm thử

- **Unit:** `needsApproval` (mọi trường, đổi % ↔ số tiền, VAT lên/xuống, không đổi); `billOf` với `timeLockedAt`; luật PR mới (`endAt ≤ timeLockedAt`); bộ đăng ký socket (trần, dọn khi đóng, lọc theo cơ sở).
- **E2E mới `test/approvals.e2e-spec.ts`:**
  - Phục vụ: gọi/bớt món phòng mình (200), phòng khác (403), gửi `cskhId` (403), thêm/cho ra PR, chốt giờ (200), mở khóa (403), thanh toán (403), giảm giá (403).
  - CSKH: xem phòng mình (200), gọi món (403), chốt giờ (403).
  - Thu ngân: giảm giá cần duyệt → PENDING, order không đổi; thanh toán khi chờ → 409; hủy yêu cầu; bỏ giảm giá → áp ngay, có log.
  - Hai quản lý cơ sở cùng cơ sở đều thấy yêu cầu trong hàng chờ và `pending-count`; quản lý cơ sở khác không thấy (hàng chờ rỗng, duyệt → 403); người thứ nhất duyệt, người thứ hai duyệt/từ chối → 409 có tên người đã duyệt.
  - Quản lý cơ sở: duyệt (order đổi, APPROVED), từ chối, duyệt cơ sở khác (403), duyệt khi `before` đã đổi (409, EXPIRED), sửa/hủy hóa đơn đã thu (403), hủy phiên đang mở (200, yêu cầu chờ → EXPIRED).
  - Quản lý hệ thống: sửa hóa đơn đã thu có đổi giảm giá → dòng `PAID_EDIT`.
  - Chốt giờ: tiền giờ dừng; thanh toán sau 2 phút → `endTime = timeLockedAt`, phiếu thu cùng mốc; PR đang mở được đóng lúc chốt; thêm PR sau chốt → 409; mở khóa ghi `OrderEvent`.
- **E2E WebSocket (giai đoạn 2):** nối không `auth` → đóng; STAFF → đóng; thu ngân cs1 không nhận sự kiện cs2; gửi yêu cầu → quản lý nhận `discount.requested`; duyệt → thu ngân nhận `discount.decided`.
- Chạy `test/foundation`, `reports`, `costing`, `board`, `pr` e2e để chắc không vỡ (một bộ một lần).
- Kiểm tra giao diện ở 360–390 px: trang phòng của phục vụ, trang Duyệt giảm giá.

## 12. Giai đoạn

1. **Giai đoạn 1 — quyền, chốt giờ, duyệt giảm giá (polling).** Migration `20261002000000_sales_approvals` (Order `timeLocked*`, `OrderEvent`, `DiscountRequest`, enum). Chạy độc lập, triển khai được.
2. **Giai đoạn 2 — WebSocket.** Spike đường mạng → gateway + bộ đăng ký → `use-live-events` + chu kỳ polling theo socket → đo tải.

Tài liệu cập nhật: `CLAUDE.md` (quyền, chốt giờ, giảm giá, WebSocket, migration), `docs/resource-rules.md`, `DEPLOYMENT.md` (nếu cần `ingress` hay cấu hình Nginx cho WebSocket), `docs/security-review.md` (WebSocket: xác thực, trần kết nối).
