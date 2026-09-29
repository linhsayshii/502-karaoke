# PR/KTV trong phòng và Thống kê PR — thiết kế

Ngày: 29/09/2026. Trạng thái: đã duyệt hướng làm, chờ duyệt spec.

## 1. Mục tiêu

1. Gán PR/KTV vào từng phòng đang hát, ghi **giờ vào** và **giờ ra** của mỗi lượt. Thao tác trong trang phòng giống như gọi món: chạm vào PR để thêm vào phòng.
2. Trang "Danh sách PR/KTV" đổi tên thành **"Thống kê PR"** và có thêm **số giờ PR** (cùng số lượt, số phòng) theo khoảng ngày chọn.

## 2. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| PR có tính tiền trên hóa đơn không? | **Không.** Hóa đơn, VAT, quỹ, báo cáo doanh thu không đổi. PR chỉ được ghi nhận để thống kê giờ. |
| Ai được gán PR vào phòng? | Ai có quyền bán hàng (`SALES`: quản lý chuỗi, quản lý cơ sở, thu ngân) **và** mọi tài khoản có "Quản lý PR/KTV" (`managesPr`), trong cơ sở của mình. HĐQT và nhân viên (STAFF) chỉ xem. |
| Số giờ trong Thống kê PR tính từ đâu? | Tổng thời gian **trong phòng** (các lượt vào–ra), không lấy từ điểm danh. |
| Có bắt buộc điểm danh trước khi gán vào phòng? | **Không.** Người đã điểm danh hôm nay được đánh dấu và xếp lên đầu, nhưng mọi PR đang làm đều chọn được. |
| Lượt của hóa đơn bị hủy có tính giờ không? | **Có.** PR thực sự đã ở trong phòng. Lượt nhập nhầm thì xóa khi phòng còn mở. |
| Sửa giờ PR sau khi phòng đã thanh toán | Ngoài phạm vi lần này. Chỉ sửa, xóa khi phòng còn đang mở. |

Ngoài phạm vi: tiền PR trên hóa đơn, số PR trên sơ đồ phòng, xuất Excel thống kê PR, sửa lượt PR sau khi đóng phòng. Không có tính năng chuyển phòng nên không cần xử lý trường hợp đó.

## 3. Dữ liệu

Bảng mới `PrSession`, mỗi lượt PR vào một phòng là một dòng. Một PR có thể vào nhiều phòng trong đêm, hoặc quay lại cùng một phòng.

```prisma
// Một lượt PR/KTV ngồi trong một phòng đang hát (không tính tiền trên hóa đơn).
// Khoảng vài chục lượt mỗi cơ sở mỗi ngày (~100k dòng/năm cho cả chuỗi).
model PrSession {
  id          Int       @id @default(autoincrement())
  branchId    Int
  branch      Branch    @relation(fields: [branchId], references: [id])
  orderId     Int
  order       Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  prStaffId   Int
  prStaff     PrStaff   @relation(fields: [prStaffId], references: [id])
  startAt     DateTime  // giờ vào
  endAt       DateTime? // giờ ra; null: còn trong phòng
  createdById Int?
  createdBy   User?     @relation("PrSessionCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())

  @@index([orderId])           // trang phòng, lúc thanh toán/hủy phiên
  @@index([branchId, startAt]) // thống kê theo khoảng ngày
  @@index([prStaffId, endAt])  // PR này có đang ở phòng khác không
}
```

- Có quan hệ ngược: `Order.prSessions`, `PrStaff.sessions`, `Branch.prSessions`, `User.prSessionsCreated`.
- `prStaff` **không** cascade: một PR đã từng vào phòng thì không bị xóa hẳn, chỉ chuyển sang `active=false` (giống quy tắc hiện có với điểm danh).
- Migration viết tay `20261001000000_pr_sessions`. Tên phải xếp sau `20260930000000_pr_staff`. Migration chỉ thêm bảng và index, không đụng dữ liệu cũ.
- Không dùng partial unique index (Prisma 5 không biểu diễn được, `migrate diff` sẽ đòi xóa nó). Quy tắc "mỗi PR tối đa một lượt đang mở" được giữ bằng khóa dòng `PrStaff` trong transaction (mục 4.3).

## 4. Backend (`src/pr`)

### 4.1. Quyền

- `canAssignPr(user) = SALES.includes(user.role) || user.managesPr`, dùng cho thêm, ra, sửa, xóa lượt và cho danh sách chọn.
- Xem lượt: đi kèm đơn hàng (`GET /orders/:id`), theo quyền xem đơn hiện có.
- `GET /pr/stats` dùng `canViewPr` (quản lý, `managesPr`, HĐQT), giống danh sách PR.
- Phạm vi cơ sở như mọi nơi khác: `resolveBranchId` và `assertBranchAccess`.

### 4.2. Endpoint

| Route | Body/Query | Trả về |
|---|---|---|
| `GET /pr/available` | `?branch` | `[{id, code, name, checkedIn, currentRoom: {orderId, roomName} \| null}]`: PR đang làm (`active`) của cơ sở, tối đa 500 (có `X-Total-Count`). Người đã điểm danh hôm nay (vào, chưa ra) xếp trước, rồi theo tên. |
| `POST /pr/sessions` | `{orderId, prStaffId, startAt?}` | Đơn đầy đủ (`orderDetailInclude`) |
| `PATCH /pr/sessions/:id` | `{startAt?, endAt?}`, `endAt: null` = mở lại | Đơn đầy đủ |
| `POST /pr/sessions/:id/end` | — (nút "Ra": giờ ra = bây giờ) | Đơn đầy đủ |
| `DELETE /pr/sessions/:id` | — | Đơn đầy đủ |

Các lệnh ghi trả về cả đơn để trang phòng áp dụng bằng `applyOrder` như mọi lần lưu món, không cần gọi lại `GET /orders/:id`.
| `GET /pr/stats` | `?branch&from&to` (YYYY-MM-DD, tối đa `MAX_REPORT_DAYS` = 366 ngày) | `{range, totals: {minutes, sessions, rooms}, rows: [{prStaffId, minutes, sessions, rooms}]}` |

`prSessionSelect = {id, orderId, prStaffId, startAt, endAt, prStaff: {select: {id, code, name}}}`

### 4.3. Quy tắc ghi (một transaction mỗi lần ghi)

1. Khóa đơn trước: dùng chung cơ chế `lockOrder` của `OrdersService`. Tách nó thành hàm dùng chung `lockOpenOrder(tx, id)` trong `orders/order-lock.ts`, hoặc đưa `lockOrder` ra public. Đơn phải còn `PENDING`, nếu không trả 409 "Phòng đã đóng, không sửa PR được nữa". Việc khóa cũng tăng `Order.updatedAt`, nên vòng tải lại 15 s của trang phòng trên máy khác nhận được thay đổi. Một lần ghi PR cũng không thể chen vào giữa lúc thanh toán.
2. Khóa dòng `PrStaff` (`SELECT … FOR UPDATE` qua `$queryRaw`), rồi kiểm tra PR này không có lượt đang mở nào khác (`prStaffId, endAt IS NULL`, dùng index). Nếu có, trả 409 "Lan đang ở phòng P402". Thứ tự khóa luôn là đơn rồi đến PR, nên không có deadlock với thanh toán (thanh toán chỉ khóa đơn và sản phẩm).
3. Kiểm tra PR thuộc cùng cơ sở với đơn và đang `active` (người đã nghỉ thì không gán được).
4. Ràng buộc giờ:
   - `order.startTime ≤ startAt ≤ now`.
   - Nếu có `endAt`: `startAt ≤ endAt ≤ now`.
   - Mở lại một lượt (`endAt: null`) cũng phải qua bước 2.
   - Thông báo lỗi bằng tiếng Việt.

### 4.4. Đóng phòng

`OrdersService.checkout` và `cancel` (hủy phiên đang mở) gọi thêm `tx.prSession.updateMany({ where: { orderId, endAt: null }, data: { endAt: endTime } })` ngay sau khi cập nhật đơn, trong cùng transaction. Truy vấn dùng index `orderId`. `voidPaid` và `PATCH /orders/:id/paid` không đụng lượt PR.

### 4.5. Đơn hàng trả kèm lượt PR

`orderInclude` thêm `prSessions: { select: prSessionSelect, orderBy: { id: 'asc' } }`. Danh sách hóa đơn (`GET /orders`, tối đa 1000 đơn) **không** cần lượt PR, nên tách `orderDetailInclude` (có `prSessions`) cho `GET /orders/:id`, `PATCH /orders/:id` và các lệnh trả về một đơn; `orderInclude` của danh sách giữ nguyên để payload không phình ra.

### 4.6. Thống kê (`GET /pr/stats`)

- Chạy trên `ReportPrismaService`, endpoint gắn `SharedRequestInterceptor` (quy tắc tài nguyên §5).
- Một câu SQL:
  ```sql
  SELECT "prStaffId",
         COUNT(*)::int AS sessions,
         COUNT(DISTINCT "orderId")::int AS rooms,
         COALESCE(SUM(CEIL(EXTRACT(EPOCH FROM (COALESCE("endAt", now()) - "startAt")) / 60)), 0)::int AS minutes
  FROM "PrSession"
  WHERE "branchId" = $1 AND "startAt" >= $from AND "startAt" < $to
  GROUP BY "prStaffId"
  ```
  - Khoảng ngày theo ngày kinh doanh: `businessDayRange(from, to)`.
  - Dùng index `(branchId, startAt)`.
  - Lượt đang mở được tính đến hiện tại.
  - Số phút của mỗi lượt làm tròn lên. Lượt dưới một phút tính là 1 phút.
- Tổng (`totals`) tính trong SQL cùng câu, bằng `GROUPING SETS` hoặc một câu `SUM` thứ hai, không cộng từ danh sách.
- Thống kê theo từng cơ sở. Quản lý chuỗi xem cơ sở đang chọn (không có chế độ toàn chuỗi).

### 4.7. Xóa PR, xóa dữ liệu

- `removeStaff`: xóa hẳn chỉ khi người đó chưa có điểm danh **và** chưa có lượt phòng; nếu đã có thì chuyển sang `active=false`. Thông báo đổi thành "…đã có lịch sử điểm danh hoặc vào phòng…".
- `DataPurgeService`: xóa `prSession` (theo `branchId`) **trước** `order` và `prStaff`, thêm `prSessions` vào số liệu của log.

## 5. Frontend

### 5.1. Kiểu và quyền

- `lib/types.ts`:
  - `PrSession`: `{id, orderId, prStaffId, startAt, endAt, prStaff: Pick<PrStaff,"id"|"code"|"name">}`.
  - `Order.prSessions?: PrSession[]`.
  - `AvailablePr`: `{id, code, name, checkedIn, currentRoom: {orderId, roomName} | null}`.
  - `PrStatsRow`, `PrStats`.
- `lib/permissions.ts`: quyền mới `"pr.assign"` gồm `[...MANAGERS, "CASHIER"]`; tài khoản `managesPr` cũng có (thêm vào `PR_MANAGER_PERMISSIONS`).

### 5.2. Trang phòng (`sales/rooms/[id]/page.tsx`)

File hiện đã 751 dòng, nên phần PR được tách thành component riêng:

- `components/sales/pr-picker.tsx`: lưới ô PR, giống lưới món.
  - Mỗi ô có tên, mã, badge "Đã điểm danh", và dòng "Đang ở phòng P402". Ô của PR đang ở phòng khác bị làm mờ, không bấm được.
  - PR đang ở chính phòng này có badge "Trong phòng".
  - Ô tìm theo tên hoặc mã.
  - Chạm vào một ô gọi `POST /pr/sessions`, rồi cập nhật đơn.
- `components/sales/room-pr-list.tsx`: phần "PR/KTV" trong thẻ hóa đơn, dưới CSKH/Phục vụ.
  - Mỗi lượt hiện tên · giờ vào – giờ ra, hoặc "đang ngồi" kèm thời lượng sống (`formatElapsed`, `useNow` đã có).
  - Nút **Ra**, **Sửa giờ** (dialog hai ô `datetime-local`, dùng `toDateTimeInput` như trang điểm danh) và **Xóa** (xác nhận). Các nút chỉ hiện khi có `pr.assign`.
  - STAFF, HĐQT và người không có quyền chỉ thấy danh sách.
- Trong trang phòng:
  - Thẻ bên trái có `Tabs` **Thực đơn | PR/KTV**, chỉ hiện tab PR khi có `pr.assign`.
  - Thẻ bên trái hiện với `canOperate || canAssignPr`. Người chỉ có `managesPr` mà không bán hàng thì chỉ thấy tab PR/KTV.
  - Danh sách chọn tải `GET /pr/available` khi mở tab lần đầu, tải lại sau mỗi lần thêm hoặc ra, và khi đơn được làm mới qua polling.
  - Lượt PR đi theo đơn (`order.prSessions`) nên đồng bộ theo vòng polling 15 s sẵn có.
  - Thao tác PR đi qua hàng đợi `saveOrder` sẵn có, để không chen với lần lưu món. `saveOrder` được mở rộng để nhận một hàm gửi request tùy ý (không chỉ `PATCH /orders/:id`), vì endpoint PR trả về đơn đầy đủ (mục 4.2) và được áp dụng bằng `applyOrder`.
- Ai thấy phòng nào không đổi: trang phòng và sơ đồ phòng giữ nguyên quy tắc hiện tại. Một nhân viên (STAFF) có `managesPr` chỉ vào được những phòng mình phục vụ, như trước, nhưng trong đó có thêm tab PR/KTV để gán. Backend chỉ kiểm tra `canAssignPr` và `assertBranchAccess`.

### 5.3. Trang Thống kê PR (`pr/staff/page.tsx`)

- `lib/navigation.ts`: `title: "Thống kê PR"`. `layout.tsx` metadata và `PageHeader` cùng đổi. Đường dẫn `/pr/staff` giữ nguyên.
- Thêm `DateRangePicker` (mặc định hôm nay → hôm nay theo `businessDate()`), gọi `GET /pr/stats`.
- Ghép vào danh sách theo `prStaffId`. Thêm cột **Số giờ** (`formatElapsed`, hoặc `formatHours` nếu ≥ 1 giờ), **Lượt** và **Số phòng**; cột phụ ẩn trên màn hẹp bằng `SHOW_FROM`.
- Hàng tổng lấy từ `totals`.
- Thêm lựa chọn sắp xếp theo số giờ, giảm dần (ToggleGroup "Tên | Số giờ").
- Người đã nghỉ nhưng có giờ trong khoảng ngày vẫn hiện khi bật "Hiện người đã nghỉ". Tổng luôn gồm tất cả.
- Thêm, sửa, chuyển sang đã nghỉ và xóa giữ nguyên.

## 6. Kiểm thử

- **Unit** (`src/pr/pr-session-rules.spec.ts`): hàm thuần `checkSessionTimes({orderStart, startAt, endAt, now})` và `sessionMinutes` (làm tròn lên, lượt mở tính đến `now`).
- **E2E** (`test/pr.e2e-spec.ts`, thêm các `it`):
  - Thu ngân gán PR vào phòng, rồi gán cùng PR sang phòng thứ hai: 409. Cho ra xong thì gán được.
  - Tài khoản chỉ có `managesPr` gán được. STAFF không có cờ: 403. Thu ngân cơ sở khác: 403.
  - Giờ vào trước giờ mở phòng hoặc trong tương lai: 400.
  - Thanh toán đóng các lượt đang mở tại `endTime`. Sau thanh toán thì thêm, sửa, xóa đều 409.
  - `GET /pr/stats` đúng số phút, lượt, phòng; tổng bằng tổng các hàng.
  - Xóa PR đã từng vào phòng thì chuyển sang đã nghỉ.
  - "Xóa dữ liệu" xóa các lượt của cơ sở.
- **Tải**: lần thanh toán có thêm một `updateMany` theo index `orderId`, nên chạy lại `test/load` (§6 của `docs/resource-rules.md`) và so bảng. Chạy `EXPLAIN ANALYZE` cho truy vấn `prSession` theo `orderId` và theo `(prStaffId, endAt)`.
- **Frontend** (không có test tự động): `npm run lint`, `npm run build`, rồi kiểm tra trên trình duyệt ở 390px và máy bàn: gán, ra, sửa giờ, xóa, polling trên hai tab, trang Thống kê PR.

## 7. Tài liệu

- `CLAUDE.md`: đoạn PR/KTV (bảng `PrSession`, quy tắc khóa, endpoint, thống kê, đổi tên trang) và danh sách migration.
- `DEPLOYMENT.md`: mục 6.15 cho migration `20261001000000_pr_sessions` (chỉ thêm bảng, chạy tích tắc; hướng dẫn dùng tab PR/KTV trong phòng và trang Thống kê PR).
- Checklist §5 của `docs/resource-rules.md` được đánh dấu trong phần mô tả thay đổi.
