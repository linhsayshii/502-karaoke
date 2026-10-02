# Triển khai Karaoke 502 bằng Docker

Hướng dẫn đưa toàn bộ hệ thống lên máy chủ (VPS Ubuntu hoặc máy tại quán) bằng Docker Compose. Không cần cài Node.js, PostgreSQL hay PM2 trên máy chủ.

- [1. Kiến trúc](#1-kiến-trúc)
- [2. Cài đặt lần đầu](#2-cài-đặt-lần-đầu)
- [3. Tên miền, Nginx và HTTPS](#3-tên-miền-nginx-và-https)
- [4. Vận hành hằng ngày](#4-vận-hành-hằng-ngày)
- [5. Sao lưu và khôi phục](#5-sao-lưu-và-khôi-phục)
- [6. Chuyển từ bản cũ (PM2 + PostgreSQL cài trực tiếp)](#6-chuyển-từ-bản-cũ-pm2--postgresql-cài-trực-tiếp)
- [7. Xử lý sự cố](#7-xử-lý-sự-cố)

## 1. Kiến trúc

```
Trình duyệt ──► Cloudflare Tunnel (cloudflared) hoặc Nginx (80/443), trên máy chủ
                  └─► frontend  (Next.js, cổng APP_PORT → 3000)
                        └─ /api/* ─► backend  (NestJS, cổng 4000, chỉ trong mạng Docker)
                                       └─► db  (PostgreSQL 17, dữ liệu ở ./data/postgres)
                                             ▲
                        backup (09:00 hằng ngày) ┘ ──► ./backups và WebDAV
```

| Service    | Build từ         | Ghi chú |
|------------|------------------|---------|
| `db`       | `postgres:17-alpine` | Dữ liệu bind mount tại `./data/postgres`, không mất khi xoá/tạo lại container. |
| `backend`  | `502-backend/Dockerfile` | Mỗi lần khởi động tự chạy `prisma migrate deploy` rồi mới start. Không mở cổng ra ngoài. |
| `backup`   | `backup/Dockerfile` (`postgres:17-alpine` + curl) | Sao lưu database mỗi ngày lúc 09:00 giờ Việt Nam vào `./backups` và lên WebDAV. Xem mục 5.1. |
| `frontend` | `502-frontend/Dockerfile` | Cổng duy nhất mở ra ngoài. Trình duyệt gọi `/api` trên cùng domain, Next.js chuyển tiếp sang `http://backend:4000`, nên không cần cấu hình CORS hay domain cho cookie. |

Các file liên quan ở thư mục gốc:

```
docker-compose.yml
.env.docker.example   → sao chép thành .env
data/postgres/        → dữ liệu PostgreSQL (tự tạo, không commit)
backups/              → file sao lưu (tự tạo, không commit)
scripts/backup.sh     → sao lưu database bằng tay
backup/               → service sao lưu tự động (09:00 hằng ngày, WebDAV)
```

## 2. Cài đặt lần đầu

### 2.1. Cài Docker

Trên Ubuntu:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # đăng xuất rồi đăng nhập lại để dùng docker không cần sudo
docker compose version          # kiểm tra
```

Cần Docker Engine 25 trở lên (`docker version`), vì healthcheck của `db` dùng `start_interval`. Script `get.docker.com` cài bản mới nhất.

Đặt múi giờ máy chủ về Việt Nam (để giờ cron sao lưu và log dễ đọc; container đã tự dùng `Asia/Ho_Chi_Minh`):

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
```

### 2.2. Lấy mã nguồn

```bash
sudo mkdir -p /opt/karaoke502 && sudo chown $USER /opt/karaoke502
git clone https://github.com/linhsayshii/502-karaoke.git /opt/karaoke502
cd /opt/karaoke502
```

### 2.3. Cấu hình `.env`

```bash
cp .env.docker.example .env
nano .env
```

| Biến | Ý nghĩa |
|------|---------|
| `POSTGRES_DB`, `POSTGRES_USER` | Tên database và user (giữ mặc định được). |
| `POSTGRES_PASSWORD` | Mật khẩu database. Chỉ dùng chữ và số vì nó nằm trong `DATABASE_URL`. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Hai chuỗi bí mật khác nhau để ký token đăng nhập. Đổi chúng sẽ đăng xuất mọi người. |
| `EINVOICE_SECRET` | Khóa mã hóa mật khẩu Minvoice (hóa đơn điện tử), 32 byte mã hóa base64: `openssl rand -base64 32`. **Bắt buộc**, thiếu thì `docker compose up` báo lỗi. **Không đổi sau khi đã dùng** (xem mục 6.18). |
| `COOKIE_SECURE` | `true` khi truy cập qua HTTPS, `false` khi dùng HTTP (mạng nội bộ). Sai giá trị này là bị đăng xuất mỗi khi tải lại trang. |
| `CORS_ORIGINS` | Không cần đặt (để trống): trình duyệt gọi `/api` trên cùng tên miền. Chỉ đặt khi một trang ở tên miền khác phải gọi API, dạng `https://a.example.com,https://b.example.com`. |
| `SWAGGER_ENABLED` | `false` (mặc định): tắt trang tài liệu API `/api/docs` để không lộ danh sách API ra Internet. `true` khi cần xem tạm. |
| `APP_PORT` | Cổng web. Có Cloudflare Tunnel hoặc Nginx phía trước thì đặt `127.0.0.1:3000` để cổng 3000 không lộ ra Internet (Docker bỏ qua `ufw`). Chỉ dùng trong mạng nội bộ thì để `3000` hoặc `80`. |

Tạo chuỗi ngẫu nhiên:

```bash
openssl rand -hex 32
```

### 2.4. Chạy

```bash
docker compose up -d --build
docker compose ps                 # cả 3 service phải "Up", db "healthy"
docker compose logs -f backend    # thấy "All migrations have been successfully applied" và "Nest application successfully started"
```

Lần đầu build mất vài phút.

### 2.5. Tạo dữ liệu ban đầu

Tạo các cơ sở `cs1`–`cs5` và các tài khoản mặc định, tất cả có mật khẩu `12345678`: `admin` (quản lý hệ thống), `ql1_cs1` (quản lý cơ sở 1), `tn1_cs1` (thu ngân cơ sở 1), `pv1_cs1` (phục vụ cơ sở 1); riêng cơ sở 5 có thêm `ql1_cs5`, `tn1_cs5`, `cskh1_cs5`, `pv1_cs5` cùng 45 phòng VIP (201–609) và thực đơn (9 danh mục, 63 mặt hàng). **Chạy trên database mới** (không chạy khi chuyển từ bản cũ sang). Chạy lại không tạo trùng: phòng và mặt hàng của cơ sở 5 được so theo tên, chỉ thêm cái còn thiếu (ví dụ phòng 408 cho database đã seed trước đây) và không sửa cái đã có; một phòng hay mặt hàng đã đổi tên hoặc đã xóa sẽ được tạo lại với tên trong seed:

```bash
docker compose exec backend node dist/prisma/seed.js
```

Muốn thêm dữ liệu demo (tài khoản `cskh1_cs1`, `ql1_cs2`, `tn1_cs2`, `pv1_cs2` mật khẩu `12345678`, phòng và mặt hàng cho cs1/cs2), chỉ dùng khi thử nghiệm:

```bash
docker compose exec -e SEED_DEMO=1 backend node dist/prisma/seed.js
```

Mở `http://<địa chỉ máy chủ>:3000`, đăng nhập `admin` / `12345678` rồi **đổi mật khẩu ngay** cho `admin` và các tài khoản mặc định (hoặc khoá những tài khoản không dùng).

## 3. Tên miền, Nginx và HTTPS

Bỏ qua phần này nếu chỉ dùng trong mạng nội bộ của quán. **Dùng Cloudflare Tunnel thay cho Nginx thì làm theo [mục 3.2](#32-cloudflare-tunnel-không-dùng-nginx)**, bỏ qua phần Nginx bên dưới.

Trong `.env`: `APP_PORT=127.0.0.1:3000`, rồi `docker compose up -d`.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/karaoke502
```

```nginx
server {
    listen 80;
    server_name kara.example.com;   # tên miền của bạn

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

Chỉ cần một `location /`: frontend tự chuyển `/api` sang backend.

WebSocket (`/api/ws`, màn hình thu ngân/quản lý) đi qua cùng `location /` nhờ hai dòng `Upgrade`/`Connection` ở trên; server tự `ping` mỗi 30 giây nên không cần nâng `proxy_read_timeout` (mặc định 60 giây). Nếu đặt `proxy_read_timeout` thì không dưới **60 giây** (giá trị 31–59 giây vẫn có thể cắt kết nối ngay trước ping kế tiếp).

Trang báo cáo dùng cùng app: thêm tên của nó vào `server_name` (ví dụ `server_name kara.example.com baocao.example.com;`) rồi `sudo certbot --nginx -d kara.example.com -d baocao.example.com`. Let's Encrypt cấp được cho tên miền ở mọi cấp. Giữ `proxy_set_header Host $host;`.

```bash
sudo ln -s /etc/nginx/sites-available/karaoke502 /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d kara.example.com    # HTTPS miễn phí, tự gia hạn
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable
```

Sau khi có HTTPS: đặt `COOKIE_SECURE=true` trong `.env`, rồi `docker compose up -d`.

### 3.1. Chống dò mật khẩu và bắt buộc HTTPS

Backend đã tự khoá một tên đăng nhập 15 phút sau 5 lần sai mật khẩu liên tiếp. Nginx thêm giới hạn theo địa chỉ IP (chặn một máy thử hàng loạt tên đăng nhập) và ẩn phiên bản Nginx.

Nhân viên cùng một quán thường dùng chung Wi-Fi, tức chung một IP, và đăng nhập gần như cùng lúc đầu ca. Vì vậy giới hạn phải đủ rộng cho cả quán: mỗi IP được dồn 60 lần đăng nhập, sau đó 30 lần mỗi phút. Giới hạn cũ (10 lần/phút, dồn 5) làm nhân viên thứ 7 trở đi bị báo lỗi, người cuối chờ vài phút. Tạo file giới hạn (nằm ngoài khối `server`):

```bash
sudo tee /etc/nginx/conf.d/karaoke502-limits.conf <<'CONF'
# Mỗi IP tối đa 30 lần đăng nhập mỗi phút, cho phép dồn 60 lần (cả quán đăng nhập đầu ca qua chung Wi-Fi)
limit_req_zone $binary_remote_addr zone=kara_login:10m rate=30r/m;
server_tokens off;
CONF
```

Rồi trong khối `server` của `/etc/nginx/sites-available/karaoke502` (khối `listen 443` do certbot tạo), thêm trước `location /`:

```nginx
    # Chỉ dùng HTTPS trong 1 năm (chỉ thêm khi HTTPS đã chạy ổn)
    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 6m;

    location = /api/auth/login {
        limit_req zone=kara_login burst=60 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

`sudo nginx -t && sudo systemctl reload nginx`. Các bước giữ an toàn khác (mật khẩu, sao lưu, cập nhật) xem `docs/security-review.md`.

### 3.2. Cloudflare Tunnel (không dùng Nginx)

`cloudflared` trên máy chủ mở kết nối ra Cloudflare, nên máy chủ không cần mở cổng nào ra Internet. HTTPS do Cloudflare lo.

1. **Không để cổng web lộ ra ngoài.** Trong `.env` đặt `APP_PORT=127.0.0.1:3000`, rồi `docker compose up -d`. Nếu để `3000`, ai biết IP máy chủ cũng vào thẳng được app, bỏ qua Cloudflare, vì Docker mở cổng không qua `ufw`. Kiểm tra từ một máy khác: `curl -m 5 http://<IP máy chủ>:3000` phải **không** kết nối được.
2. **Trỏ tunnel vào frontend.** Trong Cloudflare Zero Trust → Networks → Tunnels → Public Hostname: Service `HTTP`, URL `localhost:3000`. Chỉ trỏ vào frontend, không trỏ vào backend (cổng 4000 chỉ nằm trong mạng Docker). Nếu `cloudflared` chạy bằng Docker thì cho nó dùng `--network host` để `localhost:3000` là máy chủ.
3. **Đặt `COOKIE_SECURE=true`** trong `.env`: người dùng vào bằng `https://`, dù tunnel gọi vào bằng `http://`. Bật SSL/TLS → Edge Certificates → **Always Use HTTPS** (và HSTS khi đã chạy ổn).
4. **Giới hạn đăng nhập theo IP (nên làm).** Không có Nginx thì chỉ còn backend khóa từng tên đăng nhập sau 5 lần sai. Thêm một rule ở Security → WAF → Rate limiting rules (gói Free được 1 rule):
   - Điều kiện: URI Path bằng `/api/auth/login` **và** Method bằng `POST`.
   - Đếm theo IP, **20 request mỗi 10 giây**, hành động Block trong 10 giây.
   - Nhân viên cùng quán dùng chung một IP Wi-Fi và đăng nhập đầu ca, nên đừng đặt thấp hơn.
5. **Những thứ không bật cho trang này:**
   - Rocket Loader (hay làm hỏng ứng dụng React/Next.js).
   - Bot Fight Mode, Under Attack Mode hay rule Challenge áp vào `/api/*`: app gọi API ngầm nên không vượt được thử thách, người dùng sẽ thấy lỗi tải dữ liệu.
   - Cache Rule "Cache Everything" cho `/api/*` (số liệu phải luôn mới). File tĩnh `/_next/static/*` Cloudflare tự cache, vậy là tốt.
   - Cloudflare Web Analytics tự chèn script: CSP của app chặn nó (chỉ báo lỗi trong console, không hỏng gì); muốn dùng thì phải thêm vào CSP trong `next.config.ts`.
6. **Giới hạn thời gian của một request:** Cloudflare cắt request quá 100 giây (lỗi 524). Trước nó, frontend (Next.js) chuyển tiếp `/api` vào backend và tự cắt ở 95 giây (`experimental.proxyTimeout` trong `502-frontend/next.config.ts`; mặc định của Next là 30 giây, khi đó mọi request chậm hơn nhận lỗi 500 "Internal Server Error" dù backend vẫn chạy tiếp). Báo cáo chậm nhất đo được ~40 giây, xuất hóa đơn điện tử xấu nhất ~80 giây: đều dưới 95 giây. Upload tối đa 100 MB (gói Free); nhập Excel tối đa 5 MB.
7. **WebSocket** (`wss://<tên miền>/api/ws`): Cloudflare chuyển tiếp WebSocket mặc định (Network → WebSockets: On), và frontend chuyển tiếp request upgrade `/api/*` vào backend như request thường (đã chạy thử qua image production trên máy dev, giữ 10 phút với ping 30 giây; phần Cloudflare chưa thử được ở máy dev nên phải kiểm tra sau khi triển khai).
   - Kiểm tra: mở app bằng tài khoản thu ngân, trong DevTools → Network → WS phải thấy `/api/ws` trạng thái `101` và các khung `ping/pong` mỗi 30 giây.
   - Nếu không có (`ws` bị đóng liên tục): thêm trong tunnel một Public Hostname thứ hai cùng tên miền với **Path** `api/ws` trỏ `HTTP` `localhost:4000` và mở `ports: - "127.0.0.1:4000:4000"` cho `backend` trong `docker-compose.yml`; ứng dụng vẫn chạy bằng polling trong lúc đó.
   - Nên thêm một rule Rate limiting cho URI Path bằng `/api/ws`, ví dụ **30 request mỗi 10 giây** cho mỗi IP: kết nối chưa gửi token vẫn chiếm một chỗ tối đa 5 giây (backend chỉ nhận 20 kết nối như vậy cùng lúc). Nhân viên cùng quán dùng chung một IP nên đừng đặt thấp hơn.
8. **Trang báo cáo** (`baocao.<tên miền>`, cùng app): thêm một Public Hostname thứ hai trỏ `HTTP` `localhost:3000`, tên bắt đầu bằng `baocao.` hoặc `baocao-` (app nhận trang báo cáo theo tên này). **Không** đặt "HTTP Host Header" khác trong cấu hình hostname: app cần đúng tên người dùng gõ. Chứng chỉ miễn phí của Cloudflare (Universal SSL) chỉ phủ tên miền con **một cấp**:
   - `baocao.hvlsv.uk`, `baocao-mediastar.vlab.id.vn`: được, miễn phí;
   - `baocao.mediastar.vlab.id.vn` (hai cấp dưới zone `vlab.id.vn`): trình duyệt báo lỗi SSL, trừ khi mua Advanced Certificate Manager rồi bật Total TLS.

   Thêm rule giới hạn đăng nhập (điểm 4) cho cả tên này. Sau khi triển khai, quản lý hệ thống bật "Vào trang báo cáo" cho tài khoản cần dùng (Quản trị → Tài khoản).

## 4. Vận hành hằng ngày

Mọi lệnh chạy trong `/opt/karaoke502`.

```bash
docker compose ps                     # trạng thái
docker compose logs -f --tail=100 backend
docker compose restart backend        # khởi động lại một service
docker compose down                   # dừng tất cả (dữ liệu trong ./data vẫn giữ)
docker compose up -d                  # chạy lại
```

Swagger (tài liệu API): `https://<tên miền>/api/docs`

**Cập nhật phiên bản mới:**

```bash
cd /opt/karaoke502
./scripts/backup.sh                   # luôn sao lưu trước khi cập nhật
git pull
docker compose up -d --build          # backend tự chạy migration mới khi khởi động
docker compose logs --tail=50 backend
docker image prune -f                 # xoá image cũ
docker builder prune -f --filter until=168h   # xoá cache build cũ hơn 7 ngày
```

Chỉ đổi `.env` (không đổi code) thì `docker compose up -d` là đủ, không cần `--build`.

**RAM và ổ đĩa:** xem `docs/resource-rules.md`. Mỗi service có trần RAM (`DB_MEM_LIMIT` 1g, `BACKEND_MEM_LIMIT` 512m, `FRONTEND_MEM_LIMIT` 384m, `BACKUP_MEM_LIMIT` 256m, đổi trong `.env`) và giữ tối đa 30 MB log. Theo dõi:

```bash
docker stats --no-stream              # RAM từng service so với trần
docker system df                      # dung lượng image, container, cache build
du -sh data/postgres backups          # database và bản sao lưu
```

**Vào database:**

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

## 5. Sao lưu và khôi phục

### 5.1. Sao lưu

**Tự động mỗi ngày lúc 09:00 giờ Việt Nam** (sau khi ngày kinh doanh kết thúc lúc 06:00): service `backup` chạy `pg_dump`, nén gzip vào `backups/karaoke_YYYYMMDD_HHMMSS.sql.gz`, rồi tải file đó lên WebDAV. Máy chủ hỏng thì bản trên WebDAV vẫn còn.

Cấu hình trong `.env` (xem `.env.docker.example`):

| Biến | Ý nghĩa |
|------|---------|
| `WEBDAV_URL` | Thư mục WebDAV chứa bản sao lưu. Thư mục cha phải có sẵn; thư mục cuối được tự tạo. Nextcloud: `https://<máy chủ>/remote.php/dav/files/<tài khoản>/karaoke502`. Để trống: chỉ sao lưu vào `backups/`. |
| `WEBDAV_USERNAME`, `WEBDAV_PASSWORD` | Tài khoản WebDAV (xác thực Basic, nên luôn dùng `https://`). Với Nextcloud nên tạo *mật khẩu ứng dụng* riêng. Mật khẩu có `$`, `#`, dấu cách… thì đặt trong dấu nháy đơn: `WEBDAV_PASSWORD='a$b #c'`. |
| `WEBDAV_KEEP_DAYS` | Xoá trên WebDAV các bản cũ hơn số ngày này, theo ngày trong tên file (mặc định 30; `0` = giữ mãi). Chỉ xoá file đúng mẫu `karaoke_YYYYMMDD_HHMMSS.sql.gz`, không đụng file khác. |
| `KEEP_DAYS` | Như trên, cho thư mục `backups/` trên máy chủ (mặc định 30). |
| `BACKUP_CRON` | Giờ sao lưu, cú pháp cron theo giờ Việt Nam (mặc định `0 9 * * *`). |

Đổi `.env` xong chạy `docker compose up -d backup`. Khi khởi động, service tự kiểm tra kết nối database và WebDAV rồi ghi kết quả ra log:

```bash
docker compose logs backup
# ... Database: kết nối được.
# ... WebDAV: kết nối và ghi được vào https://.../karaoke502/
```

Mỗi lần sao lưu:
- Ghi ra file tạm, kiểm tra file nén (`gzip -t`) rồi mới đổi tên, nên không bao giờ để lại file hỏng hay ghi đè bản đã có. Hai lần chạy chồng nhau thì lần sau dừng.
- Sau khi tải lên, so kích thước file trên WebDAV với bản gốc; khác nhau thì xoá bản trên WebDAV và báo lỗi. Máy chủ WebDAV không cho biết kích thước thì chỉ ghi cảnh báo vào log.
- Lỗi WebDAV (sai mật khẩu, mất mạng...) không làm mất bản trong `backups/`: lần chạy đó báo lỗi, container chuyển sang `unhealthy` đến lần sao lưu thành công sau.

**Theo dõi:** `docker compose ps` hiện `backup` là `(healthy)` khi lần sao lưu gần nhất thành công và chưa quá 26 giờ, `(unhealthy)` khi lần gần nhất lỗi hoặc đã hơn 26 giờ không sao lưu được. Chi tiết: `docker compose logs backup` hoặc `backups/backup.log` (giữ tối đa 2000 dòng gần nhất); trạng thái lần gần nhất ở `backups/.backup-status`.

**Sao lưu ngay** (ví dụ trước khi cập nhật), có tải lên WebDAV:

```bash
docker compose exec backup backup.sh           # sao lưu và tải lên
docker compose exec backup backup.sh --check   # chỉ kiểm tra kết nối
```

`./scripts/backup.sh` vẫn dùng được để sao lưu tay khi service `backup` không chạy (chỉ lưu vào `backups/`, không tải lên WebDAV; xoá bản cũ hơn `KEEP_DAYS=30` ngày). Máy chủ đã thêm dòng crontab 07:00 theo hướng dẫn cũ thì nên xoá dòng đó (`crontab -e`): service `backup` đã sao lưu hằng ngày. Để lại cũng không hại gì, chỉ thêm một bản mỗi ngày.

Tạo thư mục `backups/` trước lần chạy đầu (`mkdir -p backups`), nếu không Docker tự tạo nó với chủ sở hữu root. File do service `backup` tạo mang chủ sở hữu của thư mục `backups/`.

Cũng có thể sao lưu nguyên thư mục `data/` nhưng **phải dừng `db` trước** (`docker compose stop db`), nếu không bản sao có thể hỏng.

### 5.2. Khôi phục

Khôi phục vào một database **trống**:

```bash
docker compose down
mv data/postgres data/postgres.old          # giữ lại bản hiện tại phòng khi cần
docker compose up -d --wait db              # tạo database trống
gunzip -c backups/karaoke_YYYYMMDD_HHMMSS.sql.gz \
  | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose up -d
docker compose logs --tail=20 backend       # "No pending migrations to apply"
```

Khôi phục xong, kiểm tra hệ thống rồi mới xoá `data/postgres.old`.

Máy chủ hỏng hẳn: cài lại theo mục 2, tải bản sao lưu mới nhất từ WebDAV về thư mục `backups/` (qua giao diện web của dịch vụ WebDAV, hoặc `curl -u '<tài khoản>' -o backups/<tên file> '<WEBDAV_URL>/<tên file>'`), rồi khôi phục như trên. Khi tạo lại `.env`, dùng lại **đúng** `EINVOICE_SECRET` đã sao lưu (cùng `JWT_SECRET`, `POSTGRES_PASSWORD`…), đừng tạo khóa mới: khóa khác thì mật khẩu Minvoice trong bản sao lưu không giải mã được, mọi cơ sở phải đăng nhập Minvoice lại.

Bản sao lưu tạo bằng `pg_dump` của PostgreSQL 17, nên phải khôi phục vào PostgreSQL 17 trở lên (service `db` dùng `postgres:17-alpine`). Nếu nâng `db` lên bản mới hơn, đổi dòng `FROM` trong `backup/Dockerfile` theo cùng bản.

## 6. Chuyển từ bản cũ (PM2 + PostgreSQL cài trực tiếp)

Dùng khi máy chủ đang chạy bản cũ: backend chạy bằng PM2 (`pm2 start dist/src/main.js`), PostgreSQL cài bằng `apt`. Quá trình này **không sửa database cũ**: chỉ `pg_dump` ra file rồi nạp vào PostgreSQL trong Docker. Nếu có lỗi, bạn luôn quay về được bản cũ.

Backend và frontend phải lên **cùng lúc** vì API đã đổi. Docker Compose chạy cả hai nên điều này tự đảm bảo.

### 6.1. Chuẩn bị (chưa ảnh hưởng hệ thống đang chạy)

Làm theo mục [2.1](#21-cài-docker) → [2.3](#23-cấu-hình-env). Trong `.env`, đặt `APP_PORT=127.0.0.1:3001` nếu cổng 3000 đang bị frontend cũ dùng. Sau đó build sẵn image để rút ngắn thời gian dừng:

```bash
cd /opt/karaoke502
docker compose build
```

### 6.2. Chuyển dữ liệu (thời gian dừng: vài phút)

```bash
# 1. Dừng bản cũ (tên process xem bằng `pm2 ls`)
pm2 stop all

# 2. Xuất database cũ
pg_dump -U karaoke_user -h localhost --no-owner --no-privileges karaoke_db > ~/karaoke_old_$(date +%Y%m%d_%H%M).sql

# 3. Tạo database trong Docker và nạp dữ liệu cũ
cd /opt/karaoke502
docker compose up -d --wait db
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' < ~/karaoke_old_*.sql

# 4. Kiểm tra database cũ đã từng chạy migration chưa
grep -c _prisma_migrations ~/karaoke_old_*.sql
```

Nếu bước 4 in ra `0`, database cũ được tạo bằng `prisma db push` (bản đầu tiên). Khi đó phải đánh dấu migration gốc **một lần** (không chạy SQL):

```bash
docker compose run --rm backend npx prisma migrate resolve --applied 0_init
```

Nếu in ra số lớn hơn `0` thì bỏ qua lệnh trên.

```bash
# 5. Chạy toàn bộ hệ thống: backend tự áp các migration còn thiếu
docker compose up -d
docker compose logs -f backend    # chờ "All migrations have been successfully applied"
```

**Không** chạy seed (`seed.js`) khi chuyển từ bản cũ: dữ liệu và tài khoản đã có sẵn.

### 6.3. Trỏ Nginx sang bản mới

Sửa cấu hình Nginx cũ thành một `location /` duy nhất trỏ tới `http://127.0.0.1:<cổng APP_PORT>` như ở [mục 3](#3-tên-miền-nginx-và-https) (bỏ `location /api` trỏ vào cổng 4000). Sau đó `sudo nginx -t && sudo systemctl reload nginx`.

Kiểm tra đăng nhập, danh sách phòng, hoá đơn cũ, tồn kho. Nếu mọi thứ ổn:

```bash
pm2 delete all && pm2 save                 # gỡ bản cũ khỏi PM2
sudo systemctl disable --now postgresql    # tắt PostgreSQL cũ (dữ liệu vẫn còn trên đĩa)
```

Giữ file `~/karaoke_old_*.sql` và PostgreSQL cũ (không gỡ cài đặt) ít nhất vài tuần.

### 6.4. Quay lại bản cũ nếu có sự cố

```bash
cd /opt/karaoke502 && docker compose down
sudo systemctl enable --now postgresql
pm2 start all
# trả cấu hình Nginx về như cũ rồi: sudo systemctl reload nginx
```

Database cũ không bị thay đổi nên bản cũ chạy lại ngay. Dữ liệu phát sinh trên bản mới trong thời gian đó sẽ không có ở bản cũ.

### 6.5. Migration `foundation` làm gì với dữ liệu cũ

Bản cũ chỉ có 2 quyền (`ADMIN`, `STAFF`) và dữ liệu dùng chung mọi cơ sở. Migration `20260926000000_foundation` tự chuyển:

- tạo các cơ sở `cs1`–`cs4` (và mọi mã cơ sở khác đang có trong phòng/hóa đơn);
- tài khoản `ADMIN` → **Quản lý hệ thống**; tài khoản `STAFF` → **Thu ngân** của `cs1`;
- mỗi nhân viên CSKH/phục vụ cũ → một tài khoản `nv<id>` **chưa có mật khẩu**, thuộc cơ sở mà người đó phục vụ nhiều hóa đơn nhất; hóa đơn cũ được trỏ sang tài khoản mới;
- danh mục và mặt hàng cũ thuộc `cs1`; các cơ sở khác nhận bản sao với tồn kho 0, và món trong hóa đơn cũ của cơ sở đó trỏ sang bản sao;
- tồn kho hiện tại được ghi thành một dòng "điều chỉnh" đầu kỳ trong sổ kho; phiếu quỹ cũ thuộc `cs1`.

Migration chạy trong một transaction: nếu lỗi, database giữ nguyên như trước. Xem lỗi bằng `docker compose logs backend`, sửa nguyên nhân rồi:

```bash
docker compose run --rm backend npx prisma migrate resolve --rolled-back 20260926000000_foundation
docker compose up -d
```

Sau khi chuyển:

- Mọi người phải **đăng nhập lại**.
- Nhân viên CSKH/phục vụ cũ chưa đăng nhập được: quản lý vào **Quản trị → Tài khoản**, bấm nút chìa khóa để đặt mật khẩu cho người cần đăng nhập (tên đăng nhập `nv<số>`), và sửa họ tên/vai trò nếu cần.
- Tồn kho các cơ sở `cs2`–`cs4` bắt đầu từ 0: nhập phiếu nhập đầu kỳ.

### 6.6. Bản cập nhật "liên kết bán hàng – kho – quỹ" (migration `20260926120000_linked_flows`)

Migration chỉ thêm cột/bảng, không xoá dữ liệu. Sau khi cập nhật:

- **Thanh toán tự ghi phiếu thu** vào Sổ quỹ (chọn tiền mặt hoặc chuyển khoản khi thanh toán). Hóa đơn đã thanh toán trước bản này **không** được sinh bù phiếu thu. Nếu trước đây cơ sở tự lập phiếu thu doanh thu hằng ngày thì **thôi làm việc đó**, kẻo bị tính hai lần.
- **Phiếu nhập kho** có thể ghi luôn phiếu chi (đã trả bằng tiền mặt/chuyển khoản), hoặc để "mua nợ" (không ghi quỹ).
- **Ngày kinh doanh** trong mọi báo cáo (doanh thu, hóa đơn, sổ quỹ, phiếu kho) là từ 06:00 hôm đó đến 06:00 hôm sau; doanh thu tính theo **giờ thanh toán**. Sổ quỹ có tồn đầu kỳ/cuối kỳ.
- Giá giờ của phiên hát được **chốt lúc mở phòng**; phiên đang mở lúc cập nhật lấy giá phòng hiện tại.
- Quản lý **hủy được** hóa đơn đã thanh toán, phiếu nhập/xuất và phiếu thu/chi thủ công (bắt buộc ghi lý do). Hủy hóa đơn: hoàn kho + hủy phiếu thu; hủy phiếu kho: đảo tồn kho + hủy phiếu chi đi kèm. Chứng từ đã hủy vẫn được giữ, không tính vào tổng.

### 6.7. Bản cập nhật "tính giờ, VAT 10%, sửa hóa đơn đã thanh toán" (migration `20260927000000_edit_paid_bills`)

Migration chỉ thêm cột và đổi giá trị mặc định, không sửa dữ liệu cũ. Sau khi cập nhật:

- **Tiền giờ** = số giờ (số phút đã bắt đầu ÷ 60, **làm tròn đến 0,01 giờ**) × giá giờ, không còn làm tròn lên 1.000 đ. Ví dụ 83 phút = 1,38 giờ × 150.000 = 207.000 đ. Hóa đơn đã thanh toán giữ nguyên số tiền cũ.
- **Thuế VAT mặc định 10%** cho phiên hát mở sau khi cập nhật (vẫn sửa được trên từng phiên). Phiên đang mở lúc cập nhật giữ mức thuế cũ.
- **Phòng mới mặc định là VIP** (form thêm phòng, API và nhập Excel khi bỏ trống loại phòng).
- Quản lý cơ sở và quản lý hệ thống **sửa được hóa đơn đã thanh toán** (Bán hàng → Hóa đơn → mở hóa đơn → *Sửa hóa đơn*, bắt buộc ghi lý do): món, giảm giá/phí/thuế, CSKH/phục vụ, giờ vào/ra, giá giờ, hình thức thanh toán. Tồn kho, phiếu thu trong Sổ quỹ và doanh thu được cập nhật theo số tiền mới. Tiền giờ đã thu được giữ nguyên nếu không đổi giờ hoặc giá giờ. Hóa đơn thanh toán trước bản 6.6 (không có phiếu thu) vẫn không được sinh phiếu thu khi sửa.

### 6.8. Số hóa đơn (migration `20260927120000_bill_number`)

Mỗi hóa đơn khi đóng (thanh toán **hoặc** hủy phiên) nhận một số hóa đơn dạng `DDMM` ngày kinh doanh + 4 số phòng + 3 số thứ tự trong ngày của cơ sở, ví dụ `27093020001` (ngày 27/09, phòng 302, hóa đơn thứ 1). Phòng 3 số thêm 0 phía sau (401 → `4010`), phòng không có số là `0000`. Hủy hóa đơn đã thanh toán vẫn giữ số cũ; số không bao giờ dùng lại.

Migration đánh số bù cho mọi hóa đơn đã đóng theo thứ tự giờ đóng, tính ngày kinh doanh theo giờ Việt Nam. Trang Hóa đơn tìm được theo số hóa đơn đầy đủ trên mọi ngày.

### 6.9. Báo cáo nhân viên, phòng, hàng hóa, khung giờ, so sánh cơ sở (migration `20260927180000_report_indexes`)

- Chỉ thêm hai index (`Order(status, endTime)` và `OrderItem(orderId)`) để các báo cáo toàn chuỗi và báo cáo hàng hóa chạy nhanh; không đổi dữ liệu. Container backend tự chạy `prisma migrate deploy` khi khởi động.
- Menu **Báo cáo** có thêm Nhân viên, Phòng, Hàng hóa, Khung giờ; quản lý hệ thống có thêm **So sánh cơ sở**. Mọi báo cáo tính doanh thu chưa VAT và cộng lại đúng bằng báo cáo Doanh thu cùng kỳ.
- Với database lớn, hai lệnh `CREATE INDEX` này khoá ghi vào bảng hóa đơn trong chốc lát — chạy bản cập nhật ngoài giờ mở cửa.

**Kiểm tra dữ liệu cũ trước khi cập nhật:**

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

```sql
SELECT count(*) FROM "Order" o JOIN "Room" r ON r.id = o."roomId" WHERE r."branchId" <> o."branchId";
SELECT count(*) FROM "Order" o WHERE o.status = 'COMPLETED' AND o."totalProductPrice" <> (SELECT COALESCE(SUM(i.quantity * i.price), 0) FROM "OrderItem" i WHERE i."orderId" = o.id);
```

Cả hai đều phải trả về 0; nếu không: câu đầu là hóa đơn có phòng thuộc cơ sở khác, báo cáo phòng sẽ xếp các hóa đơn đó vào "Không phòng"; câu sau là hóa đơn có tổng tiền hàng lệch với tổng món trên hóa đơn, báo cáo hàng hóa sẽ có thành tiền khác tiền hàng của báo cáo Doanh thu.

### 6.10. Giá vốn bình quân và báo cáo kế toán (migration `20260928000000_reports_costing`)

Migration thêm 3 cột, và chạy một câu UPDATE để định giá lại biến động cuối cùng của từng sản phẩm:
- `OrderItem.unitCost`: giá vốn một đơn vị của món trên hóa đơn, chụp lúc thanh toán.
- `StockMovement.unitCost` và `StockMovement.costAfter`: giá vốn của lần biến động kho và giá vốn bình quân sau lần đó.
- Với biến động cũ, `unitCost` giữ 0, nhưng `costAfter` của **biến động cuối cùng của mỗi sản phẩm** (id lớn nhất theo `productId`) được đặt bằng `Product.costPrice` hiện tại, để sổ kho có số dư định giá đúng ngay từ bản cập nhật.

Thêm cột có giá trị mặc định và chạy UPDATE chỉ đổi dữ liệu (không đổi schema thêm) trên PostgreSQL 11 trở lên, nên chạy ngay, không cần chọn giờ vắng khách.

Sau khi cập nhật:
- `Product.costPrice` giữ giá đang có và trở thành giá vốn bình quân ban đầu. Từ đó mọi phiếu nhập, bán, xuất, hủy phiếu và hủy/sửa hóa đơn đều cập nhật nó theo bình quân gia quyền.
- Không tính lại quá khứ đối với hóa đơn và các cột nhập/bán/xuất/hoàn-điều chỉnh. Hóa đơn thanh toán trước khi cập nhật có giá vốn 0, nên Lãi lỗ và cột Giá vốn của báo cáo Hàng hóa chỉ đúng từ các hóa đơn sau đó. Các biến động kho cũ giữ giá trị 0 ở các cột dòng chảy (Nhập/Bán/Xuất/Hoàn–điều chỉnh) của báo cáo Nhập – xuất – tồn, chỉ đúng từ biến động đầu tiên sau khi cập nhật. Riêng Tồn đầu / Tồn cuối thì đúng ngay từ bản cập nhật, vì biến động cuối cùng của mỗi sản phẩm đã được định giá lại theo giá vốn hiện tại (xem UPDATE ở trên) — khớp với giá trị tồn kho hiển thị ở trang Tồn kho (`stockQuantity × costPrice`).
- Phiếu thu/chi thủ công chỉ nhận các khoản mục cố định:
  - Chi: Lương, Mặt bằng, Điện nước, Sửa chữa – bảo trì, Marketing, Vật tư tiêu hao, Thuế – phí, Khác.
  - Thu: Thu khác.

  Phiếu cũ ghi khoản mục khác vẫn giữ nguyên chữ, và được tính vào "Khác" trong báo cáo Lãi lỗ.
- Mọi phiếu chi thủ công được tính là chi phí hoạt động, và mọi phiếu thu thủ công được tính là "Thu khác" trong Lãi lỗ — bất kể lý do thực tế. Vì vậy, trả tiền nhà cung cấp sau (cho một phiếu nhập đã ghi nhận nhưng chưa thanh toán) bằng một phiếu chi thủ công, góp vốn, hay chuyển tiền giữa tiền mặt và chuyển khoản bằng phiếu thu/chi thủ công đều làm lệch lợi nhuận. Hãy thanh toán phiếu nhập ngay bằng phương thức thanh toán của chính phiếu nhập đó thay vì lập phiếu chi thủ công sau.

### 6.11. Bảo mật: phiên đăng nhập 24 giờ (không có migration)

- Mỗi lần đăng nhập chỉ dùng được **24 giờ**, dùng liên tục cũng không kéo dài. Hết 24 giờ, ứng dụng tự đăng xuất và báo "Phiên đăng nhập đã hết 24 giờ". Tự đăng xuất sau 15 giờ không thao tác vẫn giữ nguyên.
- Đổi mật khẩu (hoặc quản lý đặt lại mật khẩu) sẽ đăng xuất tài khoản đó trên mọi máy khác trong tối đa 15 phút. Khoá tài khoản thì đăng xuất ngay như trước.
- Sai mật khẩu 5 lần trong 15 phút: tên đăng nhập đó bị khoá đăng nhập 15 phút.
- Sau khi cập nhật, **mọi người phải đăng nhập lại một lần**: phiên cũ (7 ngày) không còn được nhận.
- Trang `/api/docs` bị tắt (bật lại bằng `SWAGGER_ENABLED=true`). Backend chỉ nhận lời gọi từ chính tên miền của ứng dụng (xem `CORS_ORIGINS`). Bản cũ chạy PM2 với Nginx có `location /api` trên cùng tên miền vẫn hoạt động bình thường.

### 6.12. Hội đồng quản trị, nhật ký xóa dữ liệu, sao lưu WebDAV (migration `20260929000000_board_role`, `20260929120000_purge_log`)

- Vai trò mới **Hội đồng quản trị (HĐQT)**: xem được mọi trang của mọi cơ sở nhưng không sửa được gì. Quản lý hệ thống tạo tài khoản HĐQT trong Quản trị → Tài khoản.
- HĐQT có mục **Xóa dữ liệu** trong menu tài khoản (cuối thanh bên): xoá toàn bộ hóa đơn, phiếu kho, sổ quỹ, mặt hàng, danh mục và phòng của cơ sở đang xem hoặc của cả hệ thống, sau khi nhập lại mật khẩu. Tài khoản và danh sách cơ sở được giữ. **Không hoàn tác được**, chỉ khôi phục được từ bản sao lưu (mục 5.2).
- Mỗi lần xoá, và mỗi lần bị từ chối vì sai mật khẩu, được ghi vào **Quản trị → Nhật ký xóa dữ liệu** (quản lý hệ thống và HĐQT xem được). Nhật ký không bị xoá theo dữ liệu.
- Hai migration chỉ thêm một giá trị enum và một bảng mới, chạy ngay.
- Thêm service `backup` (mục 5.1). Sau khi cập nhật mã nguồn: `mkdir -p backups`, điền `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD` vào `.env`, rồi `docker compose up -d --build` và xem `docker compose logs backup`.

### 6.13. Tiết kiệm RAM, ổ đĩa và chịu tải (migration `20260929180000_stock_movement_order_index`)

- Mỗi service có trần RAM và log tối đa 3 file × 10 MB. Trước đây log container ghi mãi không xoá. `docker compose up -d --build` tạo lại container theo cấu hình mới. Log cũ nằm trong container cũ và bị xoá cùng container.
- PostgreSQL chạy với `max_connections=30`, `wal_compression=on`, `checkpoint_timeout=15min`, `max_parallel_workers_per_gather=0` và `shm_size: 256mb`. Trước đây, nhiều báo cáo chạy cùng lúc có thể lỗi 500 (`could not resize shared memory segment`).
- Backend dùng 10 kết nối cho bán hàng và 3 kết nối riêng cho báo cáo, nên nhiều người tải báo cáo cùng lúc không làm thu ngân phải chờ. Nhiều người tải cùng một báo cáo cùng lúc thì chỉ tính một lần. Không còn tiến trình query-engine riêng. Khi mọi kết nối đều bận quá lâu, người dùng thấy "Hệ thống đang bận, vui lòng thử lại sau giây lát" thay vì lỗi hệ thống.
- Migration `20260929180000_stock_movement_order_index` thêm chỉ mục giúp thanh toán, hủy và sửa hóa đơn không phải quét toàn bộ sổ kho. Tạo chỉ mục mất vài giây (2 triệu dòng: dưới 2 giây, 26 MB). Trong lúc đó backend chưa nhận yêu cầu.
- Đo với dữ liệu 2 năm, 10 thu ngân và 10 người tải báo cáo cùng lúc: thanh toán p95 từ 15,9 s còn 0,18 s, một lượt tải cả bộ báo cáo năm từ 72 s còn 14–36 s. Thêm 600 điện thoại nhân viên vẫn nhẹ (chi tiết `docs/resource-rules.md` §6).
- **Giới hạn đăng nhập theo IP.** Dùng Nginx: nới theo mục 3.1 (`rate=30r/m`, `burst=60`), rồi `sudo nginx -t && sudo systemctl reload nginx` (giới hạn cũ chặn nhân viên cùng quán đăng nhập đầu ca). Dùng Cloudflare Tunnel: không có gì để nới; nên thêm rule giới hạn đăng nhập và kiểm tra `APP_PORT=127.0.0.1:3000` theo mục 3.2.
- Cần Docker Engine 25 trở lên (mục 2.1). Máy chủ ít RAM có thể giảm các `*_MEM_LIMIT` trong `.env` (xem `.env.docker.example`).
- Sau khi cập nhật, dọn một lần: `docker image prune -f && docker builder prune -f`.

### 6.14. PR/KTV và điểm danh (migration `20260930000000_pr_staff`)

- Migration thêm cột `User.managesPr` (mặc định "Không") và hai bảng mới `PrStaff`, `PrAttendance`. Không đụng dữ liệu cũ, chạy trong tích tắc.
- Sau khi cập nhật, quản lý mở **Quản trị → Tài khoản**, sửa nhân viên cần quản lý PR/KTV và chọn **Quản lý PR/KTV: Có**. Quản lý hệ thống và quản lý cơ sở luôn có quyền này.
- Menu mới **PR/KTV**: *Danh sách PR/KTV* (thêm, sửa, xóa; người đã điểm danh khi xóa được chuyển sang "đã nghỉ" để giữ lịch sử) và *Điểm danh* (giờ vào/giờ ra theo ngày kinh doanh). HĐQT chỉ xem.
- "Xóa dữ liệu" của HĐQT giờ xóa cả danh sách và điểm danh PR/KTV của cơ sở.

### 6.15. PR/KTV trong phòng (migration `20261001000000_pr_sessions`)

- Migration chỉ thêm bảng `PrSession` và ba chỉ mục, không đụng dữ liệu cũ, chạy trong tích tắc.
- Trong trang phòng có tab **PR/KTV**: chạm vào PR để ghi giờ vào, nút **Ra** để ghi giờ ra, **Sửa giờ**/**Xóa** khi gán nhầm (chỉ khi phòng còn mở). Thanh toán hoặc hủy phiên tự đóng các PR còn trong phòng. PR không tính tiền trên hóa đơn.
- Thu ngân, quản lý và tài khoản "Quản lý PR/KTV" gán được; HĐQT và nhân viên thường chỉ xem.
- Trang *Danh sách PR/KTV* đổi tên thành **Thống kê PR**: chọn khoảng ngày để xem số giờ trong phòng, số lượt và số phòng của từng PR.

### 6.16. Phân quyền bán hàng, chốt giờ và duyệt giảm giá (migration `20261002000000_sales_approvals`)

- Migration chỉ thêm cột (`Order.timeLockedAt`, `Order.timeLockedById`) và hai bảng mới (`OrderEvent`, `DiscountRequest`) cùng các chỉ mục. Không đổi dữ liệu cũ, chạy trong tích tắc.
- Từ bản này, chỉ **quản lý hệ thống** sửa hoặc hủy được hóa đơn đã thanh toán; quản lý cơ sở và thu ngân thì không (quản lý cơ sở vẫn hủy được phiên đang mở).
- Thu ngân muốn tăng giảm giá hoặc hạ VAT của một hóa đơn thì gửi yêu cầu kèm lý do, quản lý cơ sở hoặc quản lý hệ thống duyệt; chưa duyệt thì không thanh toán được. Mỗi cơ sở cần **ít nhất một quản lý cơ sở có mật khẩu** để có người duyệt.
- Nhân viên được gán làm **phục vụ** của phòng gọi món, gán PR/KTV và chốt giờ cho phòng đó. Nhân viên sàn chỉ đăng nhập được khi có mật khẩu, nên sau khi cập nhật hãy đặt mật khẩu cho các tài khoản phục vụ muốn dùng chức năng này (Quản trị → Tài khoản).
- "Xóa dữ liệu" của HĐQT giờ xóa cả yêu cầu giảm giá và nhật ký mở khóa giờ của phạm vi đã chọn.

### 6.17. Cập nhật tức thời cho màn hình thu ngân và quản lý (WebSocket, không có migration)

- Màn hình thu ngân và quản lý mở một kết nối WebSocket tới `/api/ws` (cùng tên miền) để biết ngay khi phòng, hóa đơn hay yêu cầu giảm giá đổi; điện thoại nhân viên không dùng. Không có kết nối này app vẫn chạy như trước (tự tải lại định kỳ), chỉ chậm hơn vài chục giây.
- Không cần đổi `.env` hay `docker-compose.yml`. Kiểm tra sau khi cập nhật theo [mục 3.2](#32-cloudflare-tunnel-không-dùng-nginx) điểm 7 (Cloudflare) hoặc [mục 3](#3-tên-miền-nginx-và-https) (Nginx: hai dòng `Upgrade`/`Connection` đã có trong mẫu cấu hình).

### 6.18. Hóa đơn điện tử (migration `20261003000000_einvoices`)

1. **Trước khi cập nhật**, thêm khóa mã hóa vào `.env` gốc (cạnh `docker-compose.yml`):

   ```bash
   printf '\nEINVOICE_SECRET=%s\n' "$(openssl rand -base64 32)" >> .env
   ```

   (`printf` thêm một dòng trống trước, nên khóa không dính vào dòng cuối của `.env` khi dòng đó thiếu ký tự xuống dòng.)

   (Nếu `.env` đã có dòng `EINVOICE_SECRET=` để trống, vì sao chép từ `.env.docker.example` mới, thì điền giá trị vào dòng đó thay vì thêm dòng.)

   Thiếu biến này thì `docker compose up` báo lỗi và dừng; backend production cũng không khởi động nếu khóa không phải 32 byte mã hóa base64 (`docker compose logs backend`). Khóa dùng để mã hóa mật khẩu và phiên Minvoice lưu trong database.
   - **Không đổi khóa sau này.** Đổi khóa thì mọi cơ sở phải đăng nhập Minvoice lại (hóa đơn đã xuất không mất).
   - Sao lưu khóa cùng chỗ với các bí mật khác (`JWT_SECRET`, `POSTGRES_PASSWORD`…). Bản sao lưu database mà không có khóa thì không đọc được mật khẩu Minvoice, phải đăng nhập lại.
   - **Chỉ chạy một backend trên database production.** Không bật backend thứ hai trỏ vào database này, kể cả để thử hay kiểm tra migration: khi khởi động, backend chuyển mọi hóa đơn đang gửi (`SENDING`) thành "Không rõ", và mỗi backend chỉ biết các lần gửi của chính nó, nên backend thứ hai làm hỏng lần gửi đang chạy của backend kia.
2. **Migration** tự chạy khi backend khởi động: thêm cột `Branch.taxCode` và hai bảng `EinvoiceConfig`, `Einvoice` cùng các chỉ mục. Không đụng dữ liệu cũ, chạy trong tích tắc.
3. **Máy chủ phải gọi ra được** (HTTPS ra ngoài; Cloudflare Tunnel không ảnh hưởng chiều ra) ba địa chỉ:
   - `https://<MST>.minvoice.net`: tạo hóa đơn. Mỗi cơ sở một tên miền con theo MST của nó.
   - `https://hoadondientu.gdt.gov.vn`: tra MST người mua (cổng thuế, hay chặn máy chủ nước ngoài hoặc máy ảo).
   - `https://api.xinvoice.vn`: tra MST người mua khi cổng thuế không trả lời. Chỉ nhận MST người mua (thông tin công khai).

   Không gọi được Minvoice thì trang Hóa đơn điện tử báo "Không kết nối được Minvoice" (HTTP 424) và nháp vẫn còn nguyên. Không tra được MST thì vẫn nhập tay tên và địa chỉ người mua.
4. **Sau khi cập nhật:**
   - Quản lý hệ thống nhập **Mã số thuế** của từng cơ sở ở **Quản trị → Cơ sở** (10 số, hoặc 10 số kèm `-` và 3 số cho chi nhánh).
   - Vào **Bán hàng → Hóa đơn điện tử**, chọn cơ sở, đăng nhập tài khoản Minvoice của cơ sở đó rồi chọn **ký hiệu** hóa đơn. Nên dùng tài khoản Minvoice chỉ có quyền tạo hóa đơn, vì mật khẩu của nó nằm trên máy chủ này (đã mã hóa).
   - Thu ngân và quản lý cơ sở tạo và lưu nháp; chỉ **quản lý hệ thống** xuất lên Minvoice, đối chiếu hóa đơn "Không rõ" và sửa số. HĐQT chỉ xem.
5. **Vận hành:**
   - Hóa đơn điện tử đi qua API không chính thức của web Minvoice. Nếu Minvoice đổi giao diện web, việc xuất có thể hỏng: lỗi hiện trên hóa đơn (trạng thái "Lỗi") và nháp không mất.
   - Hóa đơn "Không rõ" nghĩa là không biết Minvoice đã tạo hay chưa (mất kết nối sau khi gửi, hoặc backend khởi động lại khi đang gửi). Hệ thống không bao giờ tự gửi lại: quản lý hệ thống mở Minvoice xem rồi chọn **Đã có — nhập số** hoặc **Chưa có — gửi lại**. **Chưa có — gửi lại** chỉ bấm được từ 1 phút sau lần gửi (Minvoice có thể vẫn đang lưu lần gửi đó); trước giờ đó server cũng từ chối và nói giờ được kiểm tra lại. Nút **Kiểm tra lại** tìm hóa đơn theo mã đối chiếu `K502-<số>` trên Minvoice: chỉ tự ghi số khi chính dòng hóa đơn tìm được hiện đúng mã đó (Minvoice thật lưu mã này và trả về trong dòng, đã kiểm tra ngày 01/10/2026); thấy một hóa đơn mà dòng không có mã thì chỉ gợi ý số trong thông báo. Việc tự gửi lại khi không thấy gì vẫn tắt có chủ ý (`MARKER_SEARCH_CONFIRMED = false` trong `minvoice-client.ts`): không thấy hóa đơn thì hệ thống vẫn để "Không rõ" và chỉ quản lý hệ thống mới chọn **Chưa có — gửi lại**.
   - "Xóa dữ liệu" của HĐQT giờ xóa cả hóa đơn điện tử của phạm vi đã chọn trong database (không xóa gì trên Minvoice); cấu hình đăng nhập Minvoice của cơ sở được giữ lại.

### 6.19. Hóa đơn điện tử: bố cục hai cột, hóa đơn không theo bill (migration `20261004000000_free_einvoices`)

- **Migration** tự chạy khi backend khởi động: cột `Einvoice.orderId` được để trống, để có hóa đơn không theo bill. Không đụng dữ liệu cũ, chạy trong tích tắc. Không đổi `.env` hay `docker-compose.yml`.
- **Trang Hóa đơn điện tử** đổi bố cục:
  - Cột trái là danh sách bill. Bấm **+** trên một bill là có ngay một hóa đơn nhỏ, bấm nhiều lần thì có nhiều. Số tiền nhập ngay trên dòng hóa đơn. Nháp xóa bằng thùng rác.
  - **+** cạnh ô tìm số bill tạo hóa đơn không theo bill.
  - Cột phải để điền ngày hóa đơn, người mua, dòng hàng và xuất.
  - Mọi dòng hàng mới có VAT 10%.
- **Ngày hóa đơn** giờ lưu cùng nháp. Mặc định là ngày (theo lịch, không phải ngày kinh doanh) bill được thanh toán.
  - Nháp tạo trước bản cập nhật chưa có ngày: trang chỉ hiện ngày thanh toán bill, chưa ghi vào database. Ngày được ghi ở lần **Lưu nháp** tiếp theo có lưu một thay đổi (lưu số tiền ngay trên dòng hóa đơn thì chưa ghi). **Xuất** luôn gửi đúng ngày đang hiện trên trang, nên hóa đơn mang ngày đó dù nháp chưa được lưu lại.
  - Bấm **Xuất** khi ngày hóa đơn khác hôm nay thì trang hỏi có đổi về hôm nay không (**Giữ** ngày cũ hoặc **Đổi về hôm nay**).
  - Một lần xuất bị Minvoice từ chối thì nháp giữ ngày đã chọn.
- **Rollback cẩn thận:** khi đã có hóa đơn không theo bill (cột `orderId` để trống), quay lại bản backend cũ làm trang Hóa đơn điện tử báo lỗi 500, vì code cũ coi hóa đơn nào cũng có bill. Trước khi rollback hãy xóa các hóa đơn đó (nháp xóa được trên trang; hóa đơn đã xuất thì không), hoặc ngừng dùng trang Hóa đơn điện tử cho tới khi lên lại bản mới.

### 6.20. Trang báo cáo theo hóa đơn điện tử (migration `20261005000000_report_site`)

- **Migration** tự chạy khi backend khởi động:
  - Thêm `User.reportAccess`, bảng `ManualBill` (bill thêm tay) và cột `Einvoice.manualBillId`.
  - Mỗi hóa đơn điện tử không theo bill đang có được chuyển thành một bill thêm tay không phòng (mã phòng 0000), lấy số tiếp theo của ngày kinh doanh của nó. Vì vậy dãy số bill các ngày đó có thêm số.
  - Thêm ràng buộc mỗi hóa đơn thuộc đúng một bill.
  - Tính lại VAT của các nháp chưa có dòng hàng.
  - Chạy trong tích tắc. Không đổi `.env` hay `docker-compose.yml`.
- **Trang chính:** trang Hóa đơn điện tử không còn tạo hóa đơn không theo bill. Hóa đơn xuất từ nay giữ lại dòng hàng (cho báo cáo Hàng hóa của trang báo cáo).
- **Trang báo cáo:** làm theo [mục 3.2](#32-cloudflare-tunnel-không-dùng-nginx) điểm 8 (Cloudflare) hoặc [mục 3](#3-tên-miền-nginx-và-https) (Nginx), rồi bật quyền cho tài khoản.
- **Rollback cẩn thận:** code cũ không biết `ManualBill` và ràng buộc mới (mỗi hóa đơn thuộc đúng một bill). Trên trang Hóa đơn điện tử cũ, hóa đơn của bill thêm tay hiện như hóa đơn không theo bill, nút **+** cạnh ô tìm số bill (tạo hóa đơn không theo bill) báo lỗi, và "Xóa dữ liệu" của HĐQT báo lỗi khi gặp phòng đã có bill thêm tay, vì code cũ không xóa bảng `ManualBill`. Dữ liệu không mất. Quay về bản trước mục 6.19 thì còn phải theo cả điểm rollback của mục đó: hóa đơn của bill thêm tay cũng có `orderId` để trống.

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|------------|--------------------------|
| `backend` liên tục `Restarting` | `docker compose logs backend`. Thường là lỗi migration hoặc sai mật khẩu DB. |
| `password authentication failed for user` | Đã đổi `POSTGRES_PASSWORD` sau khi `data/postgres` được tạo. PostgreSQL chỉ đọc biến này lần đầu. Đổi lại giá trị cũ, hoặc vào psql chạy `ALTER USER karaoke_user PASSWORD '<mới>';`. |
| `docker compose up` báo thiếu `POSTGRES_PASSWORD` / `JWT_SECRET` / `EINVOICE_SECRET` | Chưa có file `.env` cạnh `docker-compose.yml`, hoặc thiếu biến. `EINVOICE_SECRET` mới có từ bản 6.18: tạo bằng `openssl rand -base64 32`. |
| Trang Hóa đơn điện tử báo "Không kết nối được Minvoice" | Máy chủ không gọi ra được `*.minvoice.net` (DNS, tường lửa) hoặc Minvoice đang lỗi. Thử lại sau; nháp không mất. Kiểm tra mục 6.18 điểm 3. |
| Hóa đơn điện tử báo "cần đăng nhập Minvoice lại" | Mật khẩu Minvoice đã đổi, MST của cơ sở đã đổi, hoặc `EINVOICE_SECRET` đã đổi (không giải mã được mật khẩu đã lưu). Quản lý hệ thống đăng nhập lại ở khung Minvoice của trang. |
| Đăng nhập được nhưng tải lại trang là bị đăng xuất | `COOKIE_SECURE=true` trong khi đang truy cập bằng `http://`. |
| "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau … phút." | Tên đăng nhập bị khoá tạm vì sai mật khẩu 5 lần. Chờ hết thời gian, hoặc `docker compose restart backend` để mở khoá ngay. |
| Nginx báo `502 Bad Gateway` | Container `frontend` chưa chạy, hoặc `proxy_pass` khác cổng `APP_PORT`. |
| Cloudflare báo lỗi `1033` | Tunnel không kết nối: `cloudflared` chưa chạy trên máy chủ (`sudo systemctl status cloudflared`). |
| Cloudflare báo `502 Bad Gateway` | `cloudflared` chạy nhưng không gọi được `localhost:3000`: container `frontend` chưa chạy, hoặc URL của Public Hostname sai cổng `APP_PORT`, hoặc `cloudflared` chạy trong Docker mà không dùng `--network host`. |
| Cloudflare báo `524` | Request chạy quá 100 giây, thường là tải báo cáo nhiều năm lúc máy chủ quá tải. Chọn khoảng ngắn hơn hoặc thử lại sau. |
| Thao tác chậm báo `500 Internal Server Error`, log frontend có `Failed to proxy … socket hang up` | Request chạy quá 95 giây (`experimental.proxyTimeout` trong `502-frontend/next.config.ts`; bản build thiếu dòng này thì cắt ở 30 giây). Backend vẫn chạy tiếp: với xuất hóa đơn điện tử, mở lại hóa đơn để xem trạng thái thật trước khi làm gì thêm. |
| `port is already allocated` | Cổng `APP_PORT` đang bị chương trình khác dùng (ví dụ frontend cũ chạy bằng PM2). |
| Doanh thu rơi sai ngày | Ngày kinh doanh (06:00 → 06:00 hôm sau, giờ mở cửa 11:30 → 06:00) tính theo giờ container, đã cố định `Asia/Ho_Chi_Minh` trong `docker-compose.yml`. Đừng xoá biến `TZ`. |
| Doanh thu và phiếu thu bán hàng trong Sổ quỹ lệch nhau | Chỉ xảy ra với hóa đơn thanh toán trước bản cập nhật 6.6 (chưa có phiếu thu tự động), hoặc khi cơ sở vẫn tự lập phiếu thu doanh thu bằng tay. |
| `backup` là `(unhealthy)` | Lần sao lưu gần nhất lỗi: `docker compose logs backup` hoặc `cat backups/.backup-status`. Sửa `.env`, `docker compose up -d backup`, rồi `docker compose exec backup backup.sh`. |
| Log `backup`: `sai WEBDAV_USERNAME hoặc WEBDAV_PASSWORD (HTTP 401)` | Sai tài khoản WebDAV, hoặc mật khẩu có `$`/`#` mà chưa đặt trong dấu nháy đơn trong `.env`. Nextcloud bật xác thực hai lớp thì phải dùng mật khẩu ứng dụng. |
| Log `backup`: `thư mục cha của WEBDAV_URL chưa tồn tại (HTTP 409)` | Tạo thư mục cha trên dịch vụ WebDAV (service chỉ tự tạo thư mục cuối của `WEBDAV_URL`). |
| Log `backup`: `không kết nối được tới WebDAV` | Sai địa chỉ `WEBDAV_URL`, máy chủ WebDAV tắt, hoặc lỗi chứng chỉ HTTPS. Bản trong `backups/` vẫn được tạo. |
| Hết dung lượng đĩa | `docker system df`, dọn bằng `docker image prune -f` và `docker builder prune -f`, rồi xoá bớt `backups/` cũ (hoặc giảm `KEEP_DAYS`). |
| Một service tự khởi động lại, `docker inspect <container> --format '{{.State.OOMKilled}}'` ra `true` | Service vượt trần RAM. Tăng `*_MEM_LIMIT` tương ứng trong `.env` rồi `docker compose up -d`. |
