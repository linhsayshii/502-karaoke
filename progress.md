# Tiến độ công việc

## Task 1 — Nghiệp vụ hoàn chỉnh và liên kết: thanh toán, trừ kho, cộng kho (✅ xong)

Mục tiêu: các chức năng thanh toán, trừ kho, cộng kho chạy hoàn chỉnh, liên kết với nhau, không lệch số liệu giữa Bán hàng – Kho – Quỹ – Thống kê.

### Lỗi / lệch dữ liệu đã tìm thấy và sửa

| Vấn đề trước đây | Đã sửa |
|---|---|
| Thanh toán không ghi gì vào Sổ quỹ; nhập hàng không ghi phiếu chi → doanh thu và quỹ lệch nhau | Thanh toán **tự ghi phiếu thu** (liên kết với hóa đơn); phiếu nhập đã trả tiền **tự ghi phiếu chi** (liên kết với phiếu nhập). Tất cả trong cùng một transaction với hóa đơn/phiếu kho. |
| % giảm giá / phí dịch vụ chỉ được đổi ra số tiền lúc nhập; thêm món, thêm giờ sau đó thì số tiền giảm không đổi (hóa đơn ghi "10%" nhưng trừ sai) | % được áp lên số tiền **thực tế lúc thanh toán**; nhập số tiền cố định thì % về 0. Giảm giá không vượt quá phần được giảm. Khi thanh toán lưu đúng số tiền đã áp dụng. |
| Giá giờ lấy theo giá phòng lúc thanh toán → sửa giá phòng làm đổi tiền của phiên đang hát | **Chốt giá giờ** lên hóa đơn khi mở phòng (`Order.pricePerHour`). |
| Sửa món và thanh toán cùng lúc có thể lưu món khác với số đã tính tiền / đã trừ kho | Mọi thao tác ghi vào hóa đơn **khóa dòng hóa đơn** trước (sửa món, thanh toán, hủy) → không thể chen nhau. Khóa tồn kho theo thứ tự mã hàng → tránh deadlock khi 2 phòng thanh toán cùng lúc. |
| Ngày kinh doanh 11:30 → 06:00 để hở khoảng 06:00–11:30: hóa đơn trong khoảng đó biến mất khỏi thống kê; quỹ và phiếu kho lọc theo ngày dương lịch nên lệch với doanh thu | Ngày kinh doanh = **06:00 hôm đó → 06:00 hôm sau** (giờ mở cửa vẫn 11:30 → 06:00), mọi thời điểm thuộc đúng một ngày. Doanh thu, danh sách hóa đơn, sổ quỹ, phiếu kho, sổ kho đều dùng chung cách tính này; doanh thu tính theo **giờ thanh toán**. |
| Sau nửa đêm, trang Thống kê mặc định lấy ngày dương lịch → báo 0đ trong khi quỹ đã có tiền | Bộ lọc ngày ở giao diện mặc định theo **ngày kinh doanh hiện tại** (trước 06:00 tính là hôm trước). |
| Không có cách sửa sai: hóa đơn đã thanh toán, phiếu kho, phiếu quỹ không hủy được → phải bù tay ở nhiều nơi, dễ lệch | Quản lý **hủy hóa đơn đã thanh toán** (hoàn kho + hủy phiếu thu + trừ doanh thu), **hủy phiếu nhập/xuất** (đảo tồn kho, trả giá vốn về lần nhập gần nhất còn hiệu lực, hủy phiếu chi đi kèm), **hủy phiếu thu/chi thủ công**. Bắt buộc ghi lý do; chứng từ đã hủy vẫn lưu (ai hủy, lúc nào, vì sao) nhưng không tính vào tổng. Phiếu thu/chi tự động chỉ hủy được qua chứng từ gốc. |
| Tồn kho chỉ trừ lúc thanh toán nên số trong kho lớn hơn số thực có khi các phòng đang dùng | Hiển thị **Đang phục vụ** (đã gọi trong phòng đang mở) và **Khả dụng** ở trang Tồn kho; thực đơn gọi món hiện "Còn X". |
| Mặt hàng ngừng bán còn tồn bị ẩn khỏi trang tồn kho (giá trị tồn bị thiếu), và không xuất được phần còn lại | Vẫn hiện trong Tồn kho (nhãn "Ngừng bán") và xuất được; chỉ chặn nhập thêm. |
| Tắt "quản lý tồn kho" khi còn hàng làm số tồn biến mất khỏi mọi báo cáo | Chặn, yêu cầu lập phiếu xuất cho hết trước. |
| Đổi trạng thái phòng (bảo trì) đúng lúc có người mở phòng có thể tạo phòng "bảo trì" đang có khách | Đổi trạng thái kiểm tra điều kiện ngay trong câu lệnh cập nhật. |
| Tính tiền làm tròn lên 1.000đ có thể dư 1.000đ do sai số số thực (vd 187.000 × 8%) | Bỏ phần lẻ dưới 1đ trước khi làm tròn lên. |

### Tính năng mới đi kèm

- **Hình thức thanh toán**: tiền mặt / chuyển khoản khi thanh toán hóa đơn, khi lập phiếu thu/chi, khi trả tiền nhập hàng.
- **Sổ quỹ**: tồn đầu kỳ, tổng thu (trong đó bán hàng), tổng chi (trong đó nhập hàng), tồn cuối kỳ, tách tiền mặt / chuyển khoản; cột nguồn phiếu (hóa đơn #…, phiếu nhập …, thủ công).
- **Thống kê doanh thu**: thêm tiền giờ, tiền món, tiền mặt, chuyển khoản theo ngày; bấm vào ngày để xem hóa đơn và hủy hóa đơn.
- **Phiếu kho**: trạng thái đã hủy, thông tin thanh toán, nút hủy phiếu.

### Thay đổi kỹ thuật chính

- Migration `502-backend/prisma/migrations/20260926120000_linked_flows` (chỉ thêm cột/bảng, có backfill giá giờ cho hóa đơn cũ). Đã tập dượt trên dữ liệu kiểu cũ (`test/fixtures/legacy-data.sql`): áp dụng thành công, không lệch schema.
- API mới: `POST /orders/:id/checkout {paymentMethod}`, `POST /orders/:id/void {reason}`, `POST /inventory/documents/:id/cancel {reason}`, `POST /funds/:id/cancel {reason}`; `paymentMethod` cho phiếu nhập và phiếu quỹ; `GET /funds/summary` trả thêm tồn đầu/cuối kỳ và tách theo hình thức; `GET /orders/statistics` trả thêm cơ cấu doanh thu; `GET /orders?from&to`.
- Frontend: `lib/billing.ts` (bản sao công thức tính tiền, đồng bộ với backend), `lib/labels.ts`, `businessDate()` trong `lib/format.ts`; các trang Gọi món, Thanh toán, Thống kê, Tồn kho, Nhập hàng, Phiếu kho, Sổ quỹ nối với API mới.
- Dọn dẹp: bỏ dependency thừa `@radix-ui/react-toast` khỏi backend; bỏ file `package-lock.json` rỗng ở thư mục gốc (làm Next.js hiểu nhầm thư mục gốc và báo cảnh báo); `lib/api.ts` mặc định gọi `http://localhost:4000/api` khi chưa cấu hình.
- Tài liệu: `CLAUDE.md`, `README.md`, `DEPLOYMENT.md` (mục 6.6 và bảng xử lý sự cố), `502-backend/README.md`.

### Kiểm thử

- Unit test backend: **38/38** (thêm test công thức tính tiền với %, giới hạn giảm giá, sai số làm tròn, ngày kinh doanh).
- E2E backend: **32/32** (chạy 3 lần ổn định), thêm 10 kịch bản liên kết: phiếu chi khi nhập hàng, số lượng đang phục vụ, chốt giá giờ + % theo hóa đơn thực, phiếu thu khi thanh toán = doanh thu, hủy phiếu quỹ, hủy hóa đơn hoàn kho, sửa món đồng thời với thanh toán, hủy phiếu kho, sổ kho luôn khớp tồn kho, chặn tắt quản lý tồn.
- Chạy thật trên trình duyệt (Playwright, dữ liệu demo): nhập 24 bia trả tiền mặt → mở phòng, gọi món, giảm 10% → tổng trên màn hình 182.000đ = tổng server khi thanh toán → thanh toán chuyển khoản → Thống kê ngày 26/9 = 182.000đ = phiếu thu bán hàng trong Sổ quỹ; tồn bia 24 → 22 → hủy hóa đơn → tồn về 24, phiếu thu bị hủy. Không có lỗi console.
- Frontend: `tsc` và `eslint` sạch (còn 1 cảnh báo trong `use-toast.ts` cũ, sẽ bỏ ở Task 2).

### Lưu ý

- Hóa đơn đã thanh toán **trước** bản cập nhật không được sinh bù phiếu thu (tránh cộng trùng nếu trước đây cơ sở tự ghi tay). Nếu cơ sở vẫn tự lập phiếu thu doanh thu hằng ngày thì cần dừng việc đó.
- Giao diện ở Task 1 chỉ nối chức năng; việc làm lại giao diện theo shadcn/ui là Task 2.

## Task 2 — Giao diện thống nhất theo shadcn/ui (✅ xong)

Mục tiêu: toàn bộ giao diện dùng đúng component/template của shadcn/ui, không vỡ bố cục, không lỗi hiển thị (desktop lẫn điện thoại, sáng lẫn tối), có hiệu ứng chuyển trang nhẹ; màn hình đăng nhập theo mẫu; đổi favicon và tiêu đề web.

### Nền tảng

- **Component shadcn/ui bản chính thức** (style new-york, bản v4 mới nhất): alert, alert-dialog, avatar, badge (thêm biến thể `success`/`warning`), breadcrumb, button, calendar, card, chart, checkbox, collapsible, dialog, dropdown-menu, empty, field, input, input-group, item, label, popover, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip. Chữ ẩn cho trình đọc màn hình (sr-only) đã dịch sang tiếng Việt.
  - Trang `ui.shadcn.com` bị chặn bởi chính sách mạng của môi trường làm việc nên CLI không tải được registry; các component được lấy từ **repo chính thức `shadcn-ui/ui`** (thư mục `registry/new-york-v4`) và đổi đường dẫn import giống hệt CLI.
  - Bỏ component cũ không dùng (`toast`/`toaster`/`use-toast` → thay bằng `sonner`; `navigation-menu`), gom các gói `@radix-ui/react-*` lẻ thành gói `radix-ui`. Thêm `date-fns`, `react-day-picker` (lịch tiếng Việt), `recharts` (biểu đồ), `next-themes` (giao diện tối), `sonner` (thông báo).
- **Theme**: màu nền `slate`, thêm token `success`/`warning`; font **Inter** có bộ chữ tiếng Việt (Geist cũ thiếu dấu chồng như "ệ"); **giao diện tối** (nút chuyển ở góc trên, nhớ lựa chọn, mặc định theo hệ điều hành). Màu biểu đồ (tiền mặt/chuyển khoản) đã kiểm tra độ tương phản và phân biệt cho người mù màu ở cả hai chế độ.
- **Khung ứng dụng** theo template dashboard-01/sidebar-07: thanh bên (thu gọn thành biểu tượng, trên điện thoại là ngăn kéo; nhớ trạng thái bằng cookie) chia nhóm Bán hàng / Kho / Kế toán / Quản trị, chỉ hiện trang mà vai trò được dùng; chọn cơ sở (quản lý hệ thống); menu tài khoản (đổi mật khẩu, đăng xuất); thanh tiêu đề có breadcrumb, **ngày kinh doanh hiện tại** và nút sáng/tối.
- **Hiệu ứng chuyển trang**: mỗi trang hiện ra bằng hiệu ứng mờ + trượt nhẹ 300ms (tắt khi hệ điều hành bật "giảm chuyển động"); dialog, sheet, popover dùng hiệu ứng mặc định của shadcn.
- **Đăng nhập** theo mẫu: thẻ chia đôi (bên trái khối thương hiệu nền tối: logo, "Hệ thống quản lý", tiêu đề lớn, mô tả, ©; bên phải form "Đăng nhập hệ thống" với nút hiện/ẩn mật khẩu, nút "Đăng nhập" có biểu tượng); trên điện thoại: logo + tên ở trên, form dạng thẻ, © ở dưới; có nút sáng/tối.
- **Favicon và tiêu đề web**: biểu tượng micro mới (`app/icon.svg`, `favicon.ico`, `apple-icon.png`); tiêu đề tab dạng "Sơ đồ phòng · Karaoke 502", trang chi tiết phòng là "Phòng P101 · Karaoke 502".

### Các trang đã làm lại

| Trang | Nội dung chính |
|---|---|
| Sơ đồ phòng | Thẻ phòng theo tầng, lọc theo trạng thái (kèm số lượng), đồng hồ thời gian hát chạy trực tiếp, dialog mở phòng (chọn CSKH/phục vụ), dialog thanh toán (chọn tiền mặt/chuyển khoản); nhân viên chỉ thấy phòng mình phục vụ |
| Chi tiết phòng | Thực đơn có tìm kiếm, lọc danh mục, hiện "Còn X" theo tồn khả dụng; hóa đơn với nút +/−, sửa số lượng, xóa món; giảm giá/phí dịch vụ/thuế (theo % hoặc số tiền); tổng tạm tính chạy trực tiếp |
| Doanh thu | Thẻ số liệu, biểu đồ cột chồng tiền mặt/chuyển khoản theo ngày, bảng chi tiết theo ngày (bấm để xem hóa đơn ngày đó), chọn khoảng ngày có sẵn "Hôm nay, Hôm qua, 7 ngày qua, Tháng này, Tháng trước" |
| Hóa đơn | Lọc trạng thái, tìm theo phòng/mã; bấm dòng mở ngăn chi tiết hóa đơn và hủy hóa đơn (bắt buộc lý do) |
| Cài đặt bán hàng / Danh mục hàng | Tab Phòng / Mặt hàng / Danh mục (ở Kho: Mặt hàng / Danh mục); thêm, sửa, ngừng bán, bảo trì phòng qua dialog và menu thao tác |
| Tồn kho | Thẻ số liệu, lọc danh mục/hết hàng, cột Đang phục vụ/Khả dụng; bấm mặt hàng mở **sổ kho** |
| Nhập hàng / Xuất hàng | Form nhiều dòng, gợi ý giá vốn, tổng tiền; hình thức trả tiền nhập hàng (tiền mặt / CK / chưa trả) |
| Phiếu kho | Lọc loại, khoảng ngày; ngăn chi tiết phiếu và hủy phiếu |
| Sổ quỹ | Tồn đầu kỳ, tổng thu, tổng chi, tồn cuối kỳ; lọc loại/hình thức; lập phiếu thu/chi; hủy phiếu thủ công |
| Tài khoản / Cơ sở | Tìm kiếm, hiện tài khoản đã khóa, thêm/sửa, đặt mật khẩu, khóa/mở khóa; quản lý cơ sở |

Dùng chung: `PageHeader`, `ConfirmDialog` (AlertDialog), `ReasonDialog` (hủy có lý do), trạng thái rỗng (`Empty`) và khung chờ (`Skeleton`) cho mọi bảng/trang, `DateRangePicker`, `LineItemsTable`, `BillSummary`, thông báo `sonner`. Các trang cũ bỏ trống (`sales/catalog/*`, `sales/room-management`, `sales/overview`, `sales/statistics/{cskh,revenue}`) chuyển hướng sang trang mới.

### Chống vỡ giao diện

- Bảng trên điện thoại chỉ giữ cột chính, cột phụ hiện dần khi màn hình rộng hơn (`lib/responsive.ts`), thông tin phụ hiện dưới tên (VD: loại phiếu + thời gian dưới mã phiếu); chi tiết đầy đủ nằm trong ngăn/dialog. Dòng nhập/xuất hàng xếp thành khối có nhãn trên điện thoại. Hóa đơn trong phòng dùng danh sách `Item` thay cho bảng.
- Kiểm tra tự động bằng Playwright: **4 vai trò × 6 độ rộng (360, 390, 768, 1024, 1280, 1440px) × mọi trang**: không trang nào bị tràn ngang, không bảng nào phải cuộn ngang, không lỗi console. Chụp và soát ảnh từng trang ở desktop/điện thoại, sáng/tối, cùng các dialog, ngăn chi tiết, lịch chọn ngày, thanh bên thu gọn và ngăn kéo điện thoại.
- Lỗi hiển thị tìm thấy khi soát và đã sửa: nút "Thanh toán" tràn chữ khi thẻ phòng hẹp (đổi số cột theo bề rộng), lịch chọn ngày rộng hơn màn hình điện thoại, nhãn ẩn của form nhập hàng làm trang rộng ra 1870px, tên món bị bóp còn vài chữ trong hóa đơn trên điện thoại, bộ lọc trạng thái phòng bị cắt, bảng doanh thu liệt kê cả những ngày 0đ, tiêu đề thanh trên trống ở trang không có quyền.

### Kiểm tra

- `tsc --noEmit`, `npm run lint` (0 lỗi, 0 cảnh báo), `npm run build` đều sạch.
- Backend không đổi ở Task 2; unit test 38/38 và e2e 32/32 vẫn qua.

### Lưu ý

- Không làm nút đổi ngôn ngữ và bong bóng chat trong ảnh mẫu (ứng dụng chỉ dùng tiếng Việt).
- Nếu muốn dùng `npx shadcn@latest add …` trực tiếp trong môi trường cloud này, cần cho phép `ui.shadcn.com` trong cài đặt mạng của môi trường; trên máy cá nhân lệnh chạy bình thường.
