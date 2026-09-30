# Rà soát bảo mật Karaoke 502 (29/09/2026)

Phạm vi: backend NestJS (`502-backend`), frontend Next.js (`502-frontend`), cấu hình Docker/Nginx (`docker-compose.yml`, `DEPLOYMENT.md`). Cách làm: đọc mã phần đăng nhập, phân quyền, cấu hình máy chủ; `npm audit` hai dự án; chạy thử bản production (backend `NODE_ENV=production` + frontend `next start`) bằng trình duyệt Chrome thật.

## 1. Những gì đã an toàn

- Mật khẩu băm bằng bcrypt; API không bao giờ trả về mật khẩu.
- Mọi API đều cần đăng nhập, trừ khi được đánh dấu `@Public()` (chặn mặc định). Quyền theo vai trò (`@Roles`) và theo cơ sở (`BranchScopeService`) được kiểm tra ở **backend**, không chỉ ẩn nút ở giao diện. Nhân viên (STAFF) chỉ xem được phòng mình phục vụ.
- Mỗi request đọc lại tài khoản từ database, nên khoá tài khoản hoặc đổi vai trò có hiệu lực ngay.
- Access token chỉ nằm trong bộ nhớ trình duyệt (không để ở `localStorage`). Refresh token nằm trong cookie `httpOnly` + `SameSite=Lax`, nên JavaScript không đọc được và trang web khác không gửi được.
- Dữ liệu vào được kiểm tra bằng `ValidationPipe` (`whitelist`, bỏ trường lạ). SQL đi qua Prisma hoặc `$queryRaw` dạng template (có tham số), không có `queryRawUnsafe`, nên không bị SQL injection.
- Giao diện không chèn HTML từ dữ liệu người dùng (`dangerouslySetInnerHTML` chỉ dùng cho CSS của biểu đồ).
- Secret JWT là bắt buộc khi `NODE_ENV=production`. Database không mở cổng ra ngoài; container chạy bằng user `node` (không phải root).
- WebSocket `/api/ws`: token gửi trong tin nhắn đầu, không trên URL (không vào log proxy); kiểm tra chữ ký, hạn, nạp lại user (active) như REST; chỉ vai trò bán hàng; trần 100 socket / 5 mỗi user; tin nhắn chỉ có id nên nghe lén không lộ dữ liệu nghiệp vụ; CSP `connect-src 'self'` bao `wss://` cùng origin.

## 2. Vấn đề đã tìm thấy và đã sửa

| Mức | Vấn đề | Đã sửa |
|-----|--------|--------|
| Nghiêm trọng | Next.js 16.1.1 có nhiều lỗ hổng đã công bố: chạy mã từ xa qua Image Optimization (ảnh AVIF), vượt middleware, SSRF qua rewrites, DoS với Server Components… | Nâng lên Next.js 16.3.6. `npm audit` frontend: 0 lỗ hổng. |
| Cao | Thư viện backend có lỗ hổng: `multer`, `path-to-regexp` (ReDoS), `lodash`, `js-yaml`, `qs`… Ở frontend có thêm `axios` | `npm audit fix`. Backend: 0 lỗ hổng. |
| Cao | Không giới hạn số lần đăng nhập sai, nên có thể dò mật khẩu không giới hạn (mật khẩu mặc định `12345678`, tối thiểu chỉ 6 ký tự) | Backend: sai 5 lần trong 15 phút thì tên đăng nhập đó bị khoá 15 phút (lỗi 429). Nginx: giới hạn đăng nhập theo IP (`DEPLOYMENT.md` §3.1). Mức này đã được nới thành dồn 60 lần rồi 30 lần/phút, vì nhân viên cùng quán dùng chung một IP. |
| Trung bình | Phiên đăng nhập 7 ngày. Đổi mật khẩu không đăng xuất các máy khác, nên token bị lộ vẫn dùng được cả tuần | Phiên cố định **24 giờ** kể từ lúc đăng nhập (dùng liên tục cũng không kéo dài), cookie cũng hết hạn sau 24 giờ. Access token không bao giờ sống quá cuối phiên. Refresh token mang "dấu" của mật khẩu: đổi hoặc đặt lại mật khẩu là mọi phiên cũ hết hiệu lực. Giao diện tự đăng xuất đúng lúc hết 24 giờ và khi phiên bị thu hồi. |
| Trung bình | CORS chấp nhận **mọi** tên miền kèm cookie: trang ở tên miền "cùng site" (ví dụ tên miền con khác) có thể lấy access token qua `/auth/refresh` | Production chỉ nhận lời gọi cùng tên miền. Muốn thêm tên miền khác thì liệt kê trong `CORS_ORIGINS`. |
| Trung bình | Không có header bảo mật: trang có thể bị nhúng vào iframe (clickjacking), không có CSP | Frontend: `Content-Security-Policy` (chỉ chạy script/kết nối của chính ứng dụng, cấm nhúng khung), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, bỏ `X-Powered-By`. Backend: `helmet`. |
| Thấp | Swagger `/api/docs` mở công khai, lộ toàn bộ danh sách API | Tắt ở production (bật lại bằng `SWAGGER_ENABLED=true`). |
| Thấp | Đo thời gian phản hồi có thể biết một tên đăng nhập có tồn tại hay không | Tên không tồn tại vẫn so bcrypt với một mã băm giả, nên thời gian phản hồi như nhau. |
| Lỗi | Sai mật khẩu hiện "Chưa đăng nhập" thay vì "Tên đăng nhập hoặc mật khẩu không đúng" (giao diện thử làm mới phiên khi `/auth/login` trả 401) | Không làm mới phiên với `/auth/login`, `/auth/refresh`, `/auth/logout`. |

Kiểm tra: 113 unit test và 49 e2e test backend đều qua (5 test mới cho phiên 24 giờ, thu hồi phiên khi đổi mật khẩu, khoá khi sai nhiều lần, header). Đã thử trên Chrome bản production: đăng nhập, các trang báo cáo/kho/quỹ/nhập Excel, xuất Excel đều chạy dưới CSP mới, không có lỗi. Tải lại trang vẫn giữ phiên. Giả lập hết 24 giờ thì tự đăng xuất kèm thông báo. Khoá tài khoản đang dùng thì về trang đăng nhập với đúng một thông báo.

## 3. Việc cần làm trên máy chủ

1. Triển khai bản này (`DEPLOYMENT.md` §4, §6.11). Mọi người sẽ phải đăng nhập lại một lần.
2. **Đổi mật khẩu tất cả tài khoản mặc định** (`admin`, `ql1_cs1`, `tn1_cs1`, `pv1_cs1`…) sang mật khẩu dài (≥ 10 ký tự); khoá tài khoản không dùng.
3. Dùng HTTPS và đặt `COOKIE_SECURE=true`. Thêm giới hạn đăng nhập theo IP và HSTS: ở Nginx (`DEPLOYMENT.md` §3.1) hoặc ở Cloudflare khi dùng Cloudflare Tunnel (§3.2).
4. `JWT_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD` là chuỗi ngẫu nhiên (`openssl rand -hex 32`), không dùng giá trị mẫu. Không commit file `.env`. `EINVOICE_SECRET` (khóa mã hóa mật khẩu Minvoice, `openssl rand -base64 32`) cũng vậy, và phải được sao lưu riêng, không chung chỗ với bản sao lưu database (mục 5).
5. Máy chủ: chỉ mở cổng 80/443 (và SSH), SSH đăng nhập bằng khoá (tắt mật khẩu), bật `unattended-upgrades`, cân nhắc `fail2ban`. Để `APP_PORT=127.0.0.1:3000` khi có Nginx hoặc Cloudflare Tunnel (Docker bỏ qua `ufw`); với Cloudflare Tunnel thì không cần mở cổng 80/443.
6. Nếu máy chủ đặt tại quán: tách mạng Wi-Fi khách khỏi mạng có máy chủ/máy thu ngân. Dùng HTTP trong mạng nội bộ thì mật khẩu đi qua mạng ở dạng rõ.
7. Bản sao lưu (`backups/`) chứa toàn bộ dữ liệu và mã băm mật khẩu: giữ một bản ở nơi khác, có mã hoá, và thử khôi phục định kỳ.
8. Chạy `npm audit` định kỳ (hoặc bật Dependabot trên GitHub) và cập nhật Next.js/NestJS khi có bản vá bảo mật.

## 4. Rủi ro còn lại, đề xuất làm tiếp

- **Đăng xuất chỉ xoá cookie trên máy đó.** Nếu refresh token bị đánh cắp, kẻ gian vẫn dùng được tới hết 24 giờ, trừ khi đổi mật khẩu hoặc khoá tài khoản. Muốn thu hồi từng phiên (và xem danh sách thiết bị đang đăng nhập) cần bảng `Session` trong database, tức phải thêm migration.
- **Khoá theo tên đăng nhập có thể bị lợi dụng** để khoá tạm một tài khoản quản lý 15 phút. Giới hạn đăng nhập theo IP (Nginx, hoặc rule Rate limiting của Cloudflare) giảm bớt rủi ro này. Với tài khoản quản lý hệ thống, cân nhắc xác thực 2 lớp (TOTP).
- Bộ đếm sai mật khẩu nằm trong bộ nhớ, nên khởi động lại backend là mất. Nếu sau này chạy nhiều backend song song thì cần Redis.
- Mật khẩu tối thiểu vẫn là 6 ký tự: nên nâng lên 8–10 ký tự và chặn các mật khẩu phổ biến (`12345678`…).
- Chưa có nhật ký bảo mật (đăng nhập thất bại, đổi quyền, đặt lại mật khẩu, khoá tài khoản). Nên ghi lại để điều tra khi có sự cố.
- CSP vẫn cho phép script inline (Next.js và next-themes cần). Muốn chặt hơn thì dùng nonce qua middleware, nhưng khi đó mọi trang phải render động.
- Tự đăng xuất sau 15 giờ không thao tác chỉ được kiểm tra ở trình duyệt. Giới hạn 24 giờ thì do máy chủ bắt buộc.
- Socket WebSocket đã xác thực không thấy ngay việc khóa tài khoản hay đổi mật khẩu: nó chỉ kiểm tra lại khi máy khách gửi `auth` mới. Khi lần kiểm tra lại từ chối tài khoản (bị khóa, đổi vai trò) thì socket bị đóng ngay, nên khoảng hở chỉ kéo dài đến lần `auth` kế tiếp của máy khách (tối đa 15 phút, theo tuổi thọ access token) hoặc đến lúc socket bị đóng khoảng 60–90 giây sau khi token hết hạn (kiểm tra trong nhịp 30 giây của heartbeat); trong khoảng đó tài khoản bị khóa vẫn nhận được tín hiệu "id đã đổi" (không có dữ liệu). Chấp nhận được; muốn chặt hơn thì `UsersService.update` (khi đặt `active=false`) và `UsersService.updatePassword` gọi `LiveEventsService` đóng các socket của user đó.
- Ai tới được `/api/ws` cũng mở được kết nối mà chưa cần token (không kiểm tra `Origin`, vì token chỉ nằm trong bộ nhớ trình duyệt nên trang khác không xác thực được). Mỗi kết nối chưa xác thực chiếm một chỗ tối đa 5 giây, và backend chỉ nhận 20 kết nối như vậy cùng lúc (`MAX_PENDING_SOCKETS`, tách khỏi trần 100), nhưng mọi màn hình mới hoặc đang nối lại đều bắt đầu ở trạng thái chưa xác thực, nên kẻ giữ đủ 20 chỗ chờ này sẽ chặn mọi kết nối **mới** (kết nối thứ 21 nhận mã 1013 và màn hình chạy bằng polling trong lúc đó, việc bán hàng không bị ảnh hưởng); rule Rate limiting của Cloudflare bên dưới là biện pháp giảm nhẹ. Mỗi socket chỉ có một lần tra cứu `auth` chạy tại một thời điểm. Socket chưa xác thực bị đóng ngay ở lần `auth` đầu bị từ chối; socket đã đăng nhập chịu được tối đa 3 token ký sai nhưng bị đóng ngay khi tra cứu tài khoản từ chối nó (bị khóa, không còn vai trò bán hàng). Nên thêm rule Rate limiting của Cloudflare cho `/api/ws` (ví dụ 30 request mỗi 10 giây mỗi IP, xem `DEPLOYMENT.md` §3.2 mục 7).

## 5. Hóa đơn điện tử (Minvoice, thêm 01/10/2026)

Phạm vi: `src/einvoice` (backend) và trang Hóa đơn điện tử. Hệ thống đăng nhập Minvoice thay cho quản lý hệ thống và tạo hóa đơn trên tài khoản đó, nên có thêm bí mật của bên thứ ba và ba địa chỉ gọi ra ngoài.

**Đã làm:**

- **Bí mật của bên thứ ba** (mật khẩu và phiên đăng nhập Minvoice) lưu trong `EinvoiceConfig`, mã hóa **AES-256-GCM** với IV ngẫu nhiên 12 byte (`einvoice-secret.ts`). Khóa `EINVOICE_SECRET` (32 byte) chỉ nằm trong biến môi trường, không nằm trong database; production không khởi động nếu thiếu hoặc sai độ dài. Mật khẩu, cookie và token **không bao giờ** nằm trong response, log hay `lastError`: `EinvoiceConfigService.viewOf` chọn từng trường, và log chỉ ghi id hóa đơn, loại kết quả, số hóa đơn và id bên Minvoice khi không lưu được kết quả, không ghi payload hay bí mật. Đổi khóa hoặc sửa bản mã thì giải mã thất bại, cơ sở chuyển sang "cần đăng nhập lại" (không lộ gì, không mất hóa đơn đã xuất).
- **Chỉ quản lý hệ thống** đăng nhập Minvoice, chọn ký hiệu, xuất, đối chiếu và sửa số hóa đơn (`CHAIN_ONLY`). Thu ngân và quản lý cơ sở chỉ tạo nháp; HĐQT chỉ xem. Phạm vi cơ sở qua `BranchScopeService` như mọi chỗ khác.
- **Ba địa chỉ gọi ra ngoài** và không có địa chỉ nào khác: `https://<MST>.minvoice.net`, `https://hoadondientu.gdt.gov.vn`, `https://api.xinvoice.vn`. MST của cơ sở được kiểm tra định dạng (`^\d{10}(-\d{3})?$`) trước khi ghép vào tên miền Minvoice, và MST người mua (10 số, 10-3 hoặc 12 số) được kiểm tra rồi mã hóa URL, nên không ai lợi dụng ô MST để bắt máy chủ gọi sang nơi khác. Biến `MINVOICE_URL_TEMPLATE` (đổi địa chỉ Minvoice cho test) bị bỏ qua khi `NODE_ENV=production`. Mọi lời gọi đặt `redirect: 'manual'` (không đi theo chuyển hướng: 3xx là lỗi) và có timeout. Trình duyệt không bao giờ gọi Minvoice, nên CSP của frontend không đổi.
- **Khóa tạm đăng nhập Minvoice theo cơ sở:** sai mật khẩu 5 lần trong 15 phút thì cơ sở đó bị khóa 15 phút (429, dùng lại `LoginThrottle`), để không làm Minvoice khóa tài khoản. Tra MST có giới hạn tần suất (xinvoice tối đa 10 lần / 30 s cho cả chuỗi, 429 khi vượt) và bộ nhớ đệm.
- **xinvoice chỉ nhận MST người mua**, là thông tin công khai; tên, địa chỉ, số tiền hay dữ liệu bill không bao giờ gửi đi. Cổng thuế cũng chỉ nhận MST.
- Mọi thao tác ghi lên hóa đơn có điều kiện trạng thái ở backend (`updateMany`): hai lần xuất cùng lúc chỉ một lần thắng; xuất, đối chiếu hay sửa số không chạy được trên hóa đơn sai trạng thái (409).

**Rủi ro còn lại:**

- **Ai có cả database lẫn `.env` thì đọc được mật khẩu Minvoice** (khóa và bản mã cùng nằm trên một máy). Giảm nhẹ: dùng tài khoản Minvoice chỉ có quyền tạo hóa đơn; để bản sao lưu database ở nơi không có `.env`; giữ `EINVOICE_SECRET` trong kho bí mật riêng. Mất khóa thì chỉ phải đăng nhập Minvoice lại.
- **API không chính thức.** Minvoice không có API công khai; hệ thống dùng API của chính web app Minvoice (cookie + token chống CSRF). Họ đổi web app thì luồng đăng nhập hoặc tạo hóa đơn có thể hỏng. Mọi request nằm trong `minvoice/minvoice-client.ts`; lỗi hiện rõ trên hóa đơn và không mất nháp.
- **Gửi trùng.** `POST invoice` không có khóa chống trùng. Chỉ gửi lại khi chắc Minvoice chưa tạo hóa đơn; mọi trường hợp không chắc thành "Không rõ" và không bao giờ tự gửi lại (việc tự gửi lại sau khi tìm theo mã đối chiếu đang tắt, `MARKER_SEARCH_CONFIRMED = false`, cho đến khi kiểm tra với Minvoice thật).
- **Nội dung trả lời của Minvoice, cổng thuế và xinvoice được đọc hết vào RAM mà chưa có trần dung lượng** (timeout chỉ giới hạn thời gian, `response.text()`). Đây là ba dịch vụ bên thứ ba trả JSON nhỏ, nhưng một dịch vụ bị chiếm quyền hoặc bị lỗi có thể trả body rất lớn và làm backend hết RAM. Nên đọc có trần (ví dụ 64 KB) khi có dịp.
- Bộ đếm sai mật khẩu Minvoice và các bộ nhớ đệm tra MST nằm trong RAM, khởi động lại là mất (như bộ đếm đăng nhập của app).
- Tra MST mở cho thu ngân và quản lý cơ sở: họ có thể khiến backend gọi cổng thuế và xinvoice. Giới hạn 10 lần / 30 s cho xinvoice và 50 lượt tra đang chạy cùng lúc (429 khi vượt) chặn việc lạm dụng.
