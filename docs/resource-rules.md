# Quy tắc tiết kiệm tài nguyên (RAM, SSD)

Karaoke 502 chạy trên một máy chủ nhỏ (VPS vài GB RAM hoặc máy tại quán với SSD nhỏ), cả database, backend, frontend và sao lưu trên cùng một máy. **Mọi thay đổi về sau đều phải theo các quy tắc dưới đây.** Khi thật sự cần làm khác, ghi lý do bằng comment ngay tại chỗ đó.

Nguyên tắc gốc: **không có gì được lớn lên mãi.** Mỗi danh sách, body, bộ nhớ đệm, log, file sao lưu hay tiến trình đều phải có giới hạn: số dòng, dung lượng, số ngày giữ, trần RAM.

**Tải phải chịu được** (dùng để thiết kế và đo): 5 cơ sở, mỗi cơ sở 2 thu ngân thao tác cùng lúc, hàng chục nhân viên mỗi cơ sở mở app trên điện thoại (đã đo tới 600 điện thoại), cộng tối đa 10 người tải báo cáo cùng lúc. Dữ liệu dự kiến: mỗi cơ sở ~150 hóa đơn/ngày, tích lũy nhiều năm. Mọi request đi qua proxy Next.js (`/api`), nên khi đo phải đi qua frontend. **Bán hàng luôn được ưu tiên hơn báo cáo:** báo cáo có chậm đi cũng được, nhưng không được làm thu ngân phải chờ.

## 1. Backend (NestJS + Prisma)

1. **Mọi truy vấn danh sách đều có `take`** và lọc theo khoảng ngày kinh doanh. Trần hiện tại: hóa đơn 1000, sổ quỹ 500, biến động kho 500, phiếu kho 200, nhật ký xóa dữ liệu 500, hàng chờ duyệt giảm giá 200, nhật ký giảm giá 500, danh sách PR/KTV 500, điểm danh PR/KTV 500 (một ngày), danh sách bill ở cột trái trang hóa đơn điện tử 500 (`GET /einvoices/bills`, theo khoảng ngày hoặc theo trạng thái hóa đơn), danh sách bill của trang báo cáo 500 (`GET /report-site/bills`: bill đã có hóa đơn điện tử và bill thêm tay), danh sách hóa đơn điện tử của Quản lý bán hàng trang báo cáo 500 (`GET /report-site/einvoices`, theo ngày hóa đơn hoặc đầu số hóa đơn nội bộ), báo cáo Hàng hóa theo hóa đơn điện tử 1000 dòng (`PRODUCT_ROWS` của `GET /report-site/reports/products`, phần còn lại gộp vào một dòng "Các mặt hàng khác"). Thêm endpoint danh sách mới thì đặt trần tương tự, và:
   - Service trả `[rows, total]` (`findMany` + `count` cùng một `where`). Controller dùng `withTotalCount` (`common/total-count.ts`) để gửi tổng số dòng khớp qua header `X-Total-Count`; nội dung trả về vẫn là mảng.
   - Màn hình đọc header bằng `totalCountOf(res)` (`lib/api.ts`) và hiện `ListLimitNotice` (`components/data-states.tsx`) khi danh sách bị cắt. Nếu có xuất Excel từ danh sách đó thì cảnh báo luôn.
   - **Không bao giờ cộng tổng tiền hay đếm số lượng từ một danh sách có trần.** Tổng lấy từ API tổng hợp tính trong SQL với cùng điều kiện lọc: `GET /orders/summary` (trang Hóa đơn), `GET /inventory/documents/summary` (trang Phiếu kho), `GET /funds/summary` (Sổ quỹ), `GET /einvoices/summary` (số hóa đơn điện tử theo trạng thái và tổng hóa đơn đã xuất; số đã chia của một bill cũng tính bằng `groupBy`/`aggregate` trong SQL, không cộng từ danh sách), `GET /report-site/bills/summary` (số đếm các tab và các số theo hóa đơn điện tử của khoảng ngày hóa đơn cho các ô tổng của Quản lý bán hàng trang báo cáo).
2. **Chỉ lấy cột cần dùng.** Quan hệ đi kèm dùng `select` với đúng các trường màn hình dùng, không dùng `include: { x: true }` để trả nguyên bản ghi. Ví dụ `orderInclude` (`orders.service.ts`): mỗi dòng hàng chỉ kèm `{ id, name, unit }` của mặt hàng, phòng chỉ kèm `{ id, name, type }`. Khi thu gọn thì sửa kiểu ở `502-frontend/src/lib/types.ts` bằng `Pick<...>` để TypeScript bắt chỗ dùng thiếu.
3. **Tính tổng trong SQL**, không kéo từng dòng về Node để cộng: `aggregate`/`groupBy` của Prisma hoặc `$queryRaw` dùng các mảnh trong `reports/report-sql.ts`. Khoảng ngày của báo cáo có trần (`MAX_REPORT_RANGE_DAYS`), mỗi lần nhập Excel tối đa 1000 dòng.
4. **Body JSON mặc định tối đa 1 MB** (`app.setup.ts`). Body được đọc hết vào RAM trước cả bước kiểm tra đăng nhập, nên chỉ route thật sự cần mới được nhận body lớn hơn, bằng một parser gắn riêng cho đường dẫn đó (như `/api/imports` nhận 5 MB). Không nâng giới hạn chung.
5. **Không giữ dữ liệu trong RAM mà không có trần.** Mọi `Map`, mảng hay cache sống lâu phải có kích thước tối đa và cách dọn (xem `MAX_TRACKED` trong `auth/login-throttle.ts`). Không cache nguyên một bảng trong bộ nhớ. Các bộ nhớ của hóa đơn điện tử (`src/einvoice`) và trần của chúng: `TaxPayerService.cache` (MST đã tra) 1000 mục, hạn 7 ngày, bỏ mục cũ nhất khi đầy; `TaxPayerService.inflight` (các lần tra đang chạy) tối đa 50, vượt thì 429; `xinvoiceCalls` (cửa sổ trượt) tối đa 10 lần trong 30 giây; `EinvoiceConfigService.relogins` một mục mỗi cơ sở, xóa khi đăng nhập xong; `LoginThrottle` đăng nhập Minvoice, khóa `einvoice:<cơ sở>` nên không quá số cơ sở (trần chung `MAX_TRACKED`); `EinvoicesService.sending` (id hóa đơn đang gửi), mỗi id ra khỏi tập trong `finally` của lần gửi. Backend chỉ có một tiến trình, và trạng thái trong RAM mất khi khởi động lại.
6. **Prisma dùng engine mặc định "library"** (chạy trong tiến trình Node). Không đặt lại `engineType = "binary"`, vì engine đó chạy thêm một tiến trình riêng. Có **hai pool kết nối**:
   - `PrismaService`: bán hàng, kho, quỹ và mọi thao tác ghi. Tối đa 10 kết nối (`connection_limit=10&pool_timeout=20` trong `DATABASE_URL`). Transaction chờ lấy kết nối tối đa 10 giây (`transactionOptions.maxWait`), và phải ngắn: không gọi mạng hay làm việc nặng bên trong transaction.
   - `ReportPrismaService` (`prisma/report-prisma.service.ts`): chỉ đọc, 3 kết nối, chờ tối đa 50 giây. **Mọi truy vấn báo cáo** (`src/reports`, tổng hợp sổ quỹ, tổng hợp hóa đơn điện tử, mọi truy vấn đọc của trang báo cáo trong `src/report-site`) đi qua pool này. Ngoại lệ có chủ ý: `GET /report-site/manual-bills/:id` chạy trên `PrismaService`, vì đọc bill có thể ghi (lần gửi bị cắt ngang quá `STALE_SENDING_MS` được chuyển sang "Không rõ"), như `GET /einvoices/bill/:orderId`. Báo cáo đông mấy cũng chỉ xếp hàng với nhau, còn pool bán hàng luôn trống. Báo cáo mới phải dùng pool này, không dùng `PrismaService`.
   - Hết kết nối hoặc transaction quá giờ (P2024/P2028) trả 503 "Hệ thống đang bận, vui lòng thử lại sau giây lát" (`PrismaExceptionFilter`).
   - Không đổi số kết nối khi chưa đo lại bằng `test/load` (§6).
7. **Yêu cầu báo cáo giống hệt nhau đang chạy cùng lúc thì chỉ tính một lần** (`SharedRequestInterceptor`, gắn trên `ReportsController`, `GET /funds/summary`, `GET /einvoices/summary`, `GET /report-site/bills/summary` và `GET /report-site/reports/*`). Khóa gộp gồm đường dẫn, tham số và phạm vi cơ sở của người gọi, nhưng không xét quyền của họ, nên quyền của các route `/report-site/` nằm trong `ReportSiteGuard`, chạy trước interceptor: kiểm tra đặt trong service thì người không có quyền có thể nhận kết quả của người có quyền. Chỉ gộp yêu cầu đang chạy dở, không lưu kết quả lại, nên số liệu không bao giờ cũ. Endpoint báo cáo mới cũng gắn interceptor này. Không thêm cache giữ kết quả khi chưa có cách vô hiệu hóa đúng lúc có hóa đơn cũ bị hủy hoặc sửa.
8. **Truy vấn trong luồng bán hàng phải dùng chỉ mục** (mở phòng, gọi món, thanh toán, hủy, sửa hóa đơn). Kiểm tra bằng `EXPLAIN ANALYZE` trên dữ liệu của `test/load`: không được có `Seq Scan` trên bảng lớn (`Order`, `OrderItem`, `StockMovement`, `FundTransaction`), vì truy vấn đó chậm dần mỗi ngày. Ví dụ: `StockMovement(orderId)` thiếu chỉ mục làm mỗi lần thanh toán quét 2 triệu dòng (63 ms, tăng dần theo thời gian).
9. **Báo cáo không quét lại cả lịch sử khi chỉ cần một dòng mỗi mặt hàng.** Tồn đầu/cuối kỳ lấy bằng `CROSS JOIN LATERAL (… ORDER BY … LIMIT 1)` theo từng mặt hàng (`AccountingReportsService.balances`), không dùng `DISTINCT ON` trên cả sổ kho (chậm hơn 40 lần). Tương tự, báo cáo của trang báo cáo đọc cột của bill qua `Order_pkey` theo từng HĐĐT, không JOIN bảng `Order`: `COUNTED_SQL` (`src/report-site/einvoice-sql.ts`) đọc `cancelledAt` bằng subquery vô hướng (chỉ chạy với HĐĐT chưa xuất), báo cáo Phòng đọc `roomId` bằng `LEFT JOIN LATERAL (… LIMIT 1)`, danh sách `GET /report-site/einvoices` chọn 500 HĐĐT trước rồi mới đọc số bill và phòng qua LATERAL, tab Bill của trang HĐĐT chọn bill từ `Einvoice(branchId, invoiceDate)` rồi đọc ngày và số thứ tự của bill qua LATERAL. Trang báo cáo lọc theo `Einvoice.invoiceDate` (index `(branchId, invoiceDate)`; đo 02/10/2026 trên 100 nghìn HĐĐT: danh sách một tháng một cơ sở 5 ms, tìm theo số qua `(branchId, reportNumber)` 0,1 ms). JOIN, `EXISTS`, `NOT EXISTS`, `IN (SELECT …)` hay LATERAL không có `LIMIT` đều thành `Seq Scan` cả bảng `Order` khi khoảng ngày dài (đo 02/10/2026: một cơ sở một năm đọc cả 547 nghìn bill của mọi cơ sở).
10. **Không ghi log cho từng request hay từng truy vấn** ở production (không bật `log: ['query']`, không thêm middleware log mọi request).
11. **Index chỉ thêm khi có truy vấn dùng đến** (kiểm tra bằng `EXPLAIN`). Mỗi index tốn thêm SSD và thêm một lần ghi mỗi khi dòng thay đổi.
12. **Công việc định kỳ** không chạy bằng `setInterval` trong backend. Dùng cron ở một service riêng, như service `backup`.
13. **Thư viện:** gói chỉ dùng khi build hay test (`@types/*`, CLI, công cụ test) để ở `devDependencies`, vì image production cài `npm ci --omit=dev`. Trước khi thêm thư viện mới, xem dung lượng của nó và kiểm tra xem thư viện có sẵn đã làm được việc đó chưa.
14. **`$queryRaw` không bao giờ gắn trực tiếp một `Date` của JS và không dùng `now()` để so với cột `timestamp`.** Prisma lưu giờ UTC vào cột `timestamp(3)` không kèm múi giờ, còn `Date` được gắn thành `timestamptz` và `now()` theo múi giờ của phiên, nên ở production (database chạy `TZ=Asia/Ho_Chi_Minh`) mốc thời gian lệch 7 giờ: lượt đang mở tính dư 7 giờ, khoảng ngày kinh doanh bị dịch. Dùng `utcTimestamp()` (cả cho "bây giờ") và `periodWhere()` trong `src/reports/report-sql.ts`. Test e2e có SQL thô theo thời gian nên chạy với `ALTER DATABASE … SET timezone TO 'Asia/Ho_Chi_Minh'` (xem `test/pr.e2e-spec.ts`).
15. **WebSocket chỉ báo tín hiệu, có trần, phát sau commit** (`src/live`). Tin nhắn chỉ mang id (vài chục byte), máy nhận gọi lại REST; không bao giờ gửi dữ liệu nghiệp vụ qua socket. Bộ đăng ký trong RAM (`LiveRegistry`) tối đa 100 socket và 5 socket mỗi tài khoản, dọn khi socket đóng; socket chưa xác thực tính vào trần 100 và còn bị chặn riêng ở 20 (`MAX_PENDING_SOCKETS`), mỗi cái giữ chỗ tối đa 5 giây; `maxPayload` 4 KB; không log từng tin nhắn. Sự kiện phát **sau khi** `$transaction` trả về. Heartbeat 30 giây là `setInterval` duy nhất của backend (ngoại lệ của quy tắc 12: nó thuộc về các socket và dừng cùng chúng). Thư viện `@nestjs/websockets`, `@nestjs/platform-ws`, `ws` ở `dependencies`.
16. **Gọi ra dịch vụ bên ngoài** (Minvoice, cổng thuế, xinvoice: `src/einvoice`):
    - Không giữ transaction hay kết nối database trong lúc chờ dịch vụ ngoài (quy tắc 6): đọc cấu hình, gọi, rồi ghi kết quả bằng lệnh riêng. Hóa đơn được khóa sang `SENDING` trước khi gửi, nên mất kết nối hay khởi động lại giữa chừng chỉ để lại một dòng `UNCERTAIN` để đối chiếu.
    - Mỗi lời gọi có timeout (`AbortSignal.timeout`) và `redirect: 'manual'`: Minvoice 10 giây cho cả chuỗi đăng nhập, 10 giây mỗi lần đọc, 25 giây khi gửi hóa đơn; cổng thuế 8 giây, xinvoice 30 giây. Chuỗi xuất hóa đơn xấu nhất (gửi, đăng nhập lại, lấy dải, gửi lại) khoảng 70–80 giây.
    - **Ngân sách thời gian của một request là 95 giây.** Ở production mọi lời gọi API đi trình duyệt → Cloudflare (cắt ở 100 giây, lỗi 524) → rewrite `/api` của Next.js → backend. Proxy của rewrite cắt request ở `experimental.proxyTimeout` trong `502-frontend/next.config.ts`, đặt 95 giây; mặc định của Next là 30 giây và khi đó mọi lời gọi chậm hơn (báo cáo dài, xuất hóa đơn có đăng nhập lại) nhận 500 "Internal Server Error" trong khi backend vẫn chạy tiếp. Lời gọi mới phải xong dưới 95 giây. `MARKER_SEARCH_CONFIRMED` đang tắt có chủ ý (đã kiểm tra với Minvoice thật ngày 01/10/2026: việc tìm theo `orderNumber` chạy đúng, nhưng tự gửi lại khi không thấy vẫn là quyết định của người); khi bật, "Kiểm tra lại" rồi gửi lại có thể tới ~100 giây (tìm ≤ 30 giây + chuỗi gửi ≤ 80 giây): xem lại các timeout trước khi bật.
    - **Lỗi của dịch vụ bên ngoài trả HTTP 424** (`FAILED_DEPENDENCY`), không trả 502/504: Cloudflare thay trang 502/504 của origin bằng trang lỗi của nó, làm mất thông báo tiếng Việt. Áp dụng cho mọi lời gọi ra ngoài mới.
    - **Chỗ hở đã biết:** nội dung trả lời của các dịch vụ này (`response.text()`) chưa có trần dung lượng; timeout chỉ giới hạn thời gian. Họ trả JSON nhỏ nên tạm chấp nhận (`docs/security-review.md` §5); lời gọi ra ngoài mới nên đọc có trần.

## 2. Frontend (Next.js)

1. **Thư viện nặng chỉ tải khi cần:** `await import("xlsx")` (xem `lib/excel-import/workbook.ts`, `lib/excel-export.ts`). Biểu đồ (`recharts`) chỉ dùng trong các trang báo cáo.
2. **Không bắn hàng loạt request nặng cùng lúc.** Trang Tải báo cáo chỉ chạy 2 báo cáo một lúc (`mapWithLimit`).
3. **Tải lại định kỳ luôn dùng `usePolling`** (`hooks/use-polling.ts`). Hook này ngừng gọi khi tab bị ẩn và gọi lại ngay khi người dùng quay về tab. Chu kỳ tối thiểu 15 giây. Dữ liệu ít thay đổi thì tải lại thưa hơn, không phải bỏ hẳn: sơ đồ phòng tải lại danh sách phòng mỗi 30 giây (60 giây khi socket đang nối, `useLiveInterval`), trang phòng tải lại hóa đơn 15 giây (60 giây khi nối), còn danh sách nhân viên mỗi 5 phút, khi quay lại tab và khi bấm "Làm mới". Badge Duyệt giảm giá (`GET /discount-requests/pending-count`) tải lại mỗi 15 giây (60 giây khi nối), chỉ trên máy quản lý. Chu kỳ chậm chỉ áp dụng khi socket đã `ready`, và trở lại chu kỳ cũ 30 giây sau khi mất socket.
4. **Mọi `setInterval`, `setTimeout`, `addEventListener` phải được dọn** trong hàm cleanup của effect.
5. **Không tải "tất cả" để lọc ở trình duyệt** khi server lọc được: gửi `from`/`to`/`branch`/bộ lọc lên API.
6. `localStorage` chỉ lưu các lựa chọn nhỏ (như cách ghép cột Excel), không lưu dữ liệu nghiệp vụ.
7. Font và tài nguyên tĩnh nằm sẵn trong bản build (Inter từ `@fontsource-variable`). Không dùng `next/font/google` hay tối ưu ảnh của Next (`next/image`): chức năng đó cần `sharp` và ghi cache ra đĩa.

## 3. Database (PostgreSQL)

1. Tham số đặt trong `docker-compose.yml`:
   - `max_connections=30`.
   - `wal_compression=on` và `checkpoint_timeout=15min`: ghi WAL ít hơn, đỡ hao SSD.
   - `max_parallel_workers_per_gather=0`: máy chủ ít CPU, nên truy vấn song song chỉ làm tranh CPU với thu ngân. Đo được: tải báo cáo nhanh gấp đôi, thanh toán p95 1,9 s → 0,3 s, còn một người xem báo cáo lúc rảnh thì nhanh như cũ.
   - `shm_size: 256mb`: mặc định Docker cho 64 MB `/dev/shm`, không đủ khi nhiều báo cáo chạy cùng lúc (lỗi `could not resize shared memory segment`).

   **Không bao giờ** tắt `fsync`, `synchronous_commit` hay `full_page_writes` để đổi lấy tốc độ, vì đây là dữ liệu tiền. Đổi một tham số thì đo lại bằng `test/load`.
2. Sổ cái (`Order`, `OrderItem`, `StockMovement`, `FundTransaction`) là dữ liệu nghiệp vụ, được giữ vĩnh viễn. **Bảng phụ hay bảng nhật ký mới** phải có cách dọn, hoặc ghi rõ lý do giữ mãi và mức tăng dự kiến (ví dụ `BillCounter`: mỗi cơ sở một dòng mỗi ngày; `PrAttendance`: mỗi PR/KTV một dòng mỗi ngày đi làm, ~90 nghìn dòng/năm cho 5 cơ sở × 50 người, giữ như sổ sách và bị xóa cùng "Xóa dữ liệu"; `DiscountRequest`: ~30 dòng/cơ sở/ngày, ~55 nghìn dòng/năm cho 5 cơ sở; `OrderEvent`: chỉ ghi khi có người mở khóa giờ; cả hai giữ như sổ sách và bị xóa cùng "Xóa dữ liệu"; `Einvoice`: vài trăm hóa đơn điện tử mỗi ngày cho cả chuỗi, ~100 nghìn dòng/năm; hóa đơn đã xuất giữ lại dòng hàng trong cột JSON `draft` (tối đa 50 dòng hàng; thêm ~0,2–2 KB mỗi hóa đơn, khoảng 100 MB/năm cho ~100 nghìn hóa đơn), cho báo cáo Hàng hóa của trang báo cáo, còn địa chỉ và email người mua vẫn bị bỏ trong chính lệnh ghi `ISSUED`; nháp chỉ sống vài giờ đến vài ngày; giữ như sổ sách và bị xóa cùng "Xóa dữ liệu"; `ManualBill`: vài dòng mỗi ngày mỗi cơ sở, giữ như sổ sách và bị xóa cùng "Xóa dữ liệu"; `ReportCounter`: mỗi cơ sở một dòng mỗi ngày hóa đơn, như `BillCounter`, bị xóa cùng "Xóa dữ liệu"; số hóa đơn nội bộ (`Einvoice.reportDate/reportSeq/reportNumber`) thêm ~30 byte mỗi HĐĐT cùng hai index; `EinvoiceConfig`: mỗi cơ sở một dòng, được giữ lại khi xóa dữ liệu như cơ sở và tài khoản).
3. Không lưu file (ảnh, Excel, PDF) hay JSON lớn trong database.
4. Thay đổi schema luôn đi qua migration (`prisma migrate`), không dùng `db push`.

## 4. Docker và máy chủ

1. **Mỗi service trong `docker-compose.yml` đều có `logging: *logging`** (log tối đa 3 file × 10 MB; mặc định Docker ghi log mãi không xoá) **và `mem_limit`** lấy từ `.env` (`*_MEM_LIMIT`). Service Node có thêm `NODE_OPTIONS=--max-old-space-size=…`, luôn nhỏ hơn `mem_limit` (hiện tại backend 320/512 MB, frontend 256/384 MB). Nếu thêm service mới thì làm giống vậy.
2. **Dockerfile:**
   - Build nhiều stage. Image cuối chỉ chứa mã đã build và `node_modules` production.
   - `npm ci` chạy với `--mount=type=cache,target=/root/.npm`, để cache tải về không nằm trong layer nào. Không gọi `npm cache clean` (lệnh này xoá cache dùng chung).
   - `CMD` gọi thẳng chương trình (`node_modules/.bin/prisma`, `node …`), không dùng `npx` hay `npm run`, vì chúng khởi động thêm npm và ghi file vào `~/.npm`.
   - Dùng lại base image đang có (`node:22-bookworm-slim` cho Node, `postgres:17-alpine` cho công cụ Postgres) để các image dùng chung layer. Cài bằng apt thì luôn kèm `--no-install-recommends` và xoá `/var/lib/apt/lists/*`.
   - `.dockerignore` phải loại `node_modules`, `dist`/`.next`, `.git`, `.env*`.
3. **Healthcheck chạy tối đa mỗi 30 giây** (Docker ghi trạng thái xuống đĩa sau mỗi lần kiểm tra). Muốn service khởi động nhanh thì dùng `start_interval`.
4. **File tự sinh phải có thời hạn giữ:** bản sao lưu (`KEEP_DAYS`, `WEBDAV_KEEP_DAYS`), `backups/backup.log` (cắt còn 1000 dòng khi vượt 2000 dòng, xem `backup/cron-job.sh`). Thêm log hay file mới thì đặt giới hạn ngay từ đầu.
5. Sau mỗi lần cập nhật phải dọn image và cache build cũ: `docker image prune -f` và `docker builder prune -f --filter until=168h` (`DEPLOYMENT.md` §4).

## 5. Kiểm tra trước khi hoàn tất một thay đổi

- [ ] Truy vấn mới có `take` và chỉ `select` những cột được dùng? Danh sách có trần thì trả `X-Total-Count`, và màn hình hiện `ListLimitNotice`?
- [ ] Không có tổng hay số đếm nào cộng từ một danh sách có trần?
- [ ] Truy vấn mới trong luồng bán hàng dùng chỉ mục (`EXPLAIN ANALYZE`, không `Seq Scan` bảng lớn)?
- [ ] Báo cáo mới: chạy trên `ReportPrismaService`, endpoint có `SharedRequestInterceptor`?
- [ ] Tính tổng trong SQL, không cộng bằng vòng lặp trong Node?
- [ ] Không nâng giới hạn body chung, không thêm `Map`/cache không có trần?
- [ ] Tải lại định kỳ dùng `usePolling`; timer và listener đều được dọn?
- [ ] Thư viện mới: có cần thật không, đặt đúng `dependencies`/`devDependencies`, tải khi cần nếu nặng?
- [ ] Service/log/file mới: có `logging`, `mem_limit`, thời hạn giữ?
- [ ] Lời gọi ra dịch vụ bên ngoài: có timeout, không giữ transaction/kết nối database khi chờ, lỗi trả 424?
- [ ] Thay đổi lớn về hạ tầng: đo trước và sau bằng `docker stats --no-stream`, `docker system df`, `du -sh data backups`.
- [ ] Thay đổi báo cáo, luồng bán hàng, pool kết nối hay tham số database: chạy lại `test/load` (§6) và so với bảng ở đó.

## 6. Đo tải (`502-backend/test/load`)

Dựng database riêng giống máy chủ nhỏ (2 CPU, 1 GB RAM, cùng tham số như `docker-compose.yml`), sinh dữ liệu 2 năm rồi chạy backend giới hạn 1 CPU / 512 MB:

```bash
docker run -d --name kara-load-pg --cpus 2 -m 1g --shm-size 256m -p 5434:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=karaoke_load -e TZ=Asia/Ho_Chi_Minh postgres:17-alpine \
  postgres -c max_connections=30 -c wal_compression=on -c checkpoint_timeout=15min -c max_parallel_workers_per_gather=0
cd 502-backend
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/karaoke_load SEED_DEMO=1 npx prisma migrate reset --force
docker exec -i kara-load-pg psql -U postgres -d karaoke_load < test/load/generate.sql   # ~4 phút
docker build -t kara-load-backend . && docker run -d --name kara-load-be --cpus 1 -m 512m -p 14100:4000 \
  -e TZ=Asia/Ho_Chi_Minh -e JWT_SECRET=a -e JWT_REFRESH_SECRET=b -e EINVOICE_SECRET="$(openssl rand -base64 32)" \
  -e NODE_OPTIONS=--max-old-space-size=320 \
  -e 'DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5434/karaoke_load?connection_limit=10&pool_timeout=20' \
  kara-load-backend
node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2        # 10 thu ngân + 10 người tải báo cáo cả năm
DISTINCT=1 node test/load/bench.mjs load 2025-09-29 2026-09-28  # 10 lượt tải khác nhau
node test/load/bench.mjs single 2025-09-29 2026-09-28           # từng báo cáo, lúc rảnh
docker rm -f -v kara-load-be kara-load-pg                         # xong thì xoá (~1 GB)
```

Muốn đi đúng đường production (Nginx bỏ qua) thì chạy thêm frontend trong cùng mạng Docker với backend (alias `backend`), rồi đặt `BASE=http://localhost:<cổng frontend>/api`. Thêm `STAFF=200 LOGIN_SPREAD=60` để giả lập 200 điện thoại nhân viên đăng nhập trong 60 giây, sau đó tải lại sơ đồ phòng như app.

Kết quả 29/09/2026: 547 nghìn hóa đơn, 2,5 triệu dòng hàng, 2 triệu biến động kho. Có 10 thu ngân cùng thao tác, và 10 người tải toàn bộ báo cáo cùng lúc (5 người tải một cơ sở, 5 người tải toàn chuỗi, mỗi người 2 báo cáo một lúc như trang Tải báo cáo):

| | Trước | Sau |
|---|---|---|
| Báo cáo tháng: một lượt tải / thanh toán p95 | 33 s / 4,3 s | 2,1 s / 0,4 s |
| Báo cáo năm: một lượt tải | 72 s | 14 s (36 s khi 10 lượt tải đều khác nhau) |
| Báo cáo năm: thanh toán p95 / tối đa | 15,9 s / 19,7 s | 0,18 s / 0,3 s |
| Báo cáo năm: sơ đồ phòng p95 | 8,4 s | 0,05 s |
| Lỗi 500/503 | 8 | 0 |
| Thanh toán lúc không có báo cáo, trung vị | 102 ms | 43 ms |

Thêm điện thoại nhân viên, đi qua proxy Next.js (frontend 384 MB, backend 1 CPU / 512 MB, database 2 CPU / 1 GB):

| Kịch bản | Sơ đồ phòng NV p95 | Thanh toán p95 | Đăng nhập NV p95 / lâu nhất | RAM backend / frontend / db |
|---|---|---|---|---|
| 200 NV đăng nhập rải trong 60 s + 10 thu ngân | 0,08 s | 0,25 s | 0,7 s / 1,2 s | 75 / 68 / 411 MiB |
| Như trên + 10 người tải báo cáo năm, mỗi người một kiểu | 0,07 s | 0,24 s | 0,4 s / 0,7 s | 80 / 66 / 517 MiB |
| 600 NV đăng nhập rải trong 120 s + 10 thu ngân + 10 người tải báo cáo tháng | 0,06 s | 0,19 s | 0,7 s / 2,1 s | 82 / 62 / 489 MiB |
| 200 NV đăng nhập **dồn trong 3 s** + 10 thu ngân | 0,25 s | 1,0 s | 25 s / 25 s | 74 / 65 / 410 MiB |

Chỗ nghẽn duy nhất còn lại là đăng nhập dồn cùng lúc. Mỗi lần kiểm tra mật khẩu (bcrypt, cố tình tốn CPU) mất ~65 ms CPU, nên 200 lần trong 3 giây trên backend 1 CPU phải xếp hàng tới 25 giây. Máy chủ nhiều CPU thì nhanh hơn, vì backend không bị giới hạn CPU. Thực tế nhân viên đăng nhập rải trong vài phút, và mỗi phiên dùng 24 giờ.

Kết quả 30/09/2026 (duyệt giảm giá và chốt giờ, migration `20261002000000_sales_approvals`): `bench.mjs` gọi thêm `POST /orders/:id/adjustments` + `POST /discount-requests/:id/approve` (1 phiên trong 5, thu ngân xin giảm 5%, quản lý cơ sở duyệt), `POST /orders/:id/lock-time` (mọi phiên, trước khi thanh toán) và 5 máy quản lý gọi `GET /discount-requests/pending-count` mỗi 15 giây. Cùng một database 547 nghìn hóa đơn, cùng lệnh `node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2`, mỗi kịch bản chạy nhiều lần xen kẽ: (a) backend build từ `main` + bench cũ, (b) backend của nhánh + bench cũ, (c) backend của nhánh + bench mới. Container giới hạn như §6: backend 1 CPU / 512 MB (mỗi lần một backend), db 2 CPU / 1 GB. Lần chạy đầu chạy khi bộ nhớ đệm database còn nguội nên chậm hơn; RAM của db tăng dần theo thứ tự chạy, không theo kịch bản, có thể do `docker stats` tính cả page cache của container; máy đo là máy dev 10 CPU, số tuyệt đối không so được với bảng trên. Một lần chạy thường chỉ có ~80 lần thanh toán trong ~12 giây tải báo cáo, nên p95 gần như là 4 lần chậm nhất; lần chạy `DURATION=60` có ~413–420 lần thanh toán.

| | (a) `main` | (b) nhánh, bench cũ | (c) nhánh, bench mới |
|---|---|---|---|
| Thanh toán p95, 5/4/4 lần chạy (trung vị; nhỏ nhất – lớn nhất) | 483 ms (321 – 777) | 423 ms (372 – 461) | 283 ms (269 – 760) |
| Thanh toán lớn nhất (các lần chạy) | 666 – 1031 ms | 492 – 744 ms | 381 – 946 ms |
| Sơ đồ phòng p95 (trung vị) | 87 ms | 62 ms | 75 ms |
| Một lượt tải toàn bộ báo cáo, trung vị | 10,7 – 11,2 s | 11,1 – 11,5 s | 10,8 – 11,8 s |
| Chạy thêm 60 giây sau khi tải xong (`DURATION=60`): thanh toán p95 / lớn nhất | 166 / 1402 ms | 168 / 899 ms | 114 / 420 ms |
| Lỗi 500/503 (cả 16 lần chạy), dòng lỗi trong log backend | 0 | 0 | 0 |
| RAM cao nhất của backend / db (`docker stats`, lần chạy thường) | 105–124 / 245–421 MiB | 107–117 / 239–247 MiB | 111–118 / 239–249 MiB |
| Như trên, lần chạy `DURATION=60` | 123 / 395 MiB | 119 / 569 MiB | 123 / 595 MiB |

Các lời gọi mới (lần chạy `DURATION=60`, 420 phiên): `lock-time` p50 29 ms / p95 73 ms, xin giảm giá p50 30 ms / p95 75 ms, duyệt p50 22 ms / p95 64 ms, `pending-count` p50 8 ms / p95 17 ms; không lỗi. Trung vị thanh toán p95 của (c) không cao hơn (a), (b): chênh lệch giữa các lần chạy của cùng một kịch bản (321 – 777 ms) lớn hơn chênh lệch giữa các kịch bản. Kiểm tra `EXPLAIN ANALYZE` trên bảng `DiscountRequest` giả lập 50 nghìn dòng (~1 năm của 5 cơ sở): tìm yêu cầu chờ của một phiên dùng `DiscountRequest_orderId_idx` (0,02 ms), đếm hàng chờ dùng `DiscountRequest_branchId_status_idx` (0,06 ms), nhật ký 30 ngày dùng `DiscountRequest_branchId_createdAt_idx` (0,43 ms); truy vấn phiên đang mở của phòng vẫn dùng `Order_status_endTime_idx` như trước (0,02 ms).

Kết quả 30/09/2026 (WebSocket, giai đoạn 2): `bench.mjs` với `SOCKETS=1` giữ 20 WebSocket `/api/ws` mở suốt bài đo, như app (10 thu ngân, 5 máy quản lý cơ sở, 5 máy quản lý hệ thống dùng chung tài khoản `admin`, dưới trần 5 socket cho một tài khoản), đếm số sự kiện nhận (`ws events`) và số lần bị đóng ngoài ý muốn (`ws closes`). Cùng database do `generate.sql` sinh (547 nghìn hóa đơn, xem kết quả 29/09/2026 ở trên, không đo lại), cùng giới hạn container như trên, backend build từ nhánh; chạy xen kẽ (a) không socket / (b) `SOCKETS=1`:

```bash
node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2                    # (a), 4 lần (lần đầu database còn nguội)
SOCKETS=1 node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2          # (b), 3 lần
DURATION=60 node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2          # (a) + 60 giây
SOCKETS=1 DURATION=60 node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2  # (b) + 60 giây
docker stats --no-stream kara-load-be kara-load-pg                          # mỗi ~5 giây trong lúc chạy
docker logs kara-load-be 2>&1 | grep -ci error
```

| | (a) không socket | (b) `SOCKETS=1` | (a) `DURATION=60` | (b) `DURATION=60` |
|---|---|---|---|---|
| Thanh toán p95 (trung vị; nhỏ nhất – lớn nhất) | 350 ms (183 – 465), 4 lần | 247 ms (124 – 295), 3 lần | 181 ms | 116 ms |
| Thanh toán lớn nhất | 366 – 863 ms | 317 – 579 ms | 628 ms | 409 ms |
| Sơ đồ phòng p95 | 83 ms (75 – 169) | 157 ms (68 – 175) | 29 ms | 32 ms |
| Một lượt tải toàn bộ báo cáo, trung vị | 11,4 – 12,5 s | 11,0 – 12,0 s | 12,3 s | 12,4 s |
| RAM cao nhất của backend / db (`docker stats`, 2–3 mẫu mỗi lần thường, 11 mẫu lần 60 giây) | 121–140 / 264–916 MiB | 133–138 / 312–918 MiB | 152 / 925 MiB | 145 / 925 MiB |
| `ws` (opened / ready / events / closes) | không có | 20 / 20 / 4336 – 4581 / 0 | không có | 20 / 20 / 26003 / 0 |
| Phản hồi 5xx (9 lần chạy đã đo; không `report()` nào có hậu tố `errors`) | 0 | 0 | 0 | 0 |

Cả 20 socket vào `ready` và không bị đóng lần nào trong mọi lần chạy; lần chạy 60 giây có ~426 phiên nên nhận 26 nghìn sự kiện. Sau cả 10 lần chạy (9 lần đo và 1 lần qua proxy), `docker logs kara-load-be 2>&1 | grep -ci error` = 0. Kết luận: giữ 20 socket mở và phát sự kiện không làm thanh toán chậm đi: p95 trung vị (b) 247 ms không cao hơn (a) 350 ms (350 ms là trung vị của 337 và 364 ms; bỏ lần a0 chạy khi database còn nguội thì trung vị (a) là 337 ms), và độ lệch giữa các lần chạy của (a) lớn hơn chênh lệch giữa hai kịch bản. RAM backend cao nhất tăng không đáng kể, nằm trong khoảng dao động giữa các lần chạy của (a) (60 giây: 145 so với 152 MiB). Sơ đồ phòng p95: bằng chứng mạnh hơn là hai lần chạy 60 giây (~400 lần gọi mỗi lần): 29 ms (a) so với 32 ms (b), gần như bằng nhau. Các lần chạy thường chỉ có ~80 lần gọi nên p95 chỉ là ~4 lần chậm nhất; trung vị (b) 157 ms so với (a) 83 ms (2 trong 3 lần (b) ≥ 157 ms, 3 trong 4 lần (a) ≤ 85 ms) chưa cho kết luận, khoảng dao động hai bên chồng nhau (68 – 175 so với 75 – 169 ms). RAM db nhảy một lần lên ~916 MiB từ lần chạy a3 trở đi (page cache của container, như ghi chú của lần đo trước), không tăng dần và không theo kịch bản. Đi qua proxy Next.js (frontend 384 MB, `BASE=http://localhost:13000/api SOCKETS=1`, một lần): `ws {opened: 20, ready: 20, events: 4307, closes: 0}`, thanh toán p95 219 ms, RAM sau lần chạy (một mẫu `docker stats`) frontend 64 MiB, backend 148 MiB.

## 7. Số đo sau lần rà soát 29/09/2026

| Hạng mục | Trước | Sau |
|----------|-------|-----|
| RAM backend sau 60 request (`docker stats`) | 94 MiB, 2 tiến trình (Node 136 MB + query-engine 20 MB RSS) | 68 MiB, 1 tiến trình (122 MB RSS) |
| Image backend / frontend | 600 MB / 455 MB | 575 MB / 423 MB (base image `node:22-bookworm-slim` dùng chung) |
| Body tối đa của mọi route | 5 MB | 1 MB (riêng `/api/imports`: 5 MB) |
| Log container | không giới hạn | tối đa 30 MB mỗi service |
| `backups/backup.log` | ghi thêm mãi | tối đa 2000 dòng |
| Healthcheck `db` | mỗi 5 giây | mỗi 30 giây (khi khởi động: 2 giây) |
| Kết nối database của backend | 2 × số CPU + 1 dùng chung, transaction chờ 2 giây | bán hàng 10 (transaction chờ 10 giây) + báo cáo 3 riêng; hết kết nối báo 503 tiếng Việt |
| Tải lại sơ đồ phòng / phòng khi tab bị ẩn | vẫn gọi mỗi 30 giây / 15 giây, kèm danh sách nhân viên | ngừng gọi; danh sách nhân viên tải lại mỗi 5 phút thay vì 30 giây |
