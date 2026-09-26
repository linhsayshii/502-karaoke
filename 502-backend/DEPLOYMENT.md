# Hướng dẫn Triển khai Backend lên VPS (Ubuntu 22.04)

Tài liệu này hướng dẫn chi tiết từng bước để đưa Backend NestJS lên môi trường production sử dụng VPS Ubuntu.

## 1. Chuẩn bị VPS

Đăng nhập vào VPS qua SSH:
```bash
ssh root@<IP_CUA_BAN>
```

Cập nhật hệ thống:
```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Cài đặt Node.js (v20)

```bash
# Tải script cài đặt Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Cài đặt Node.js
sudo apt install -y nodejs

# Kiểm tra phiên bản
node -v
npm -v
```

## 3. Cài đặt PostgreSQL

```bash
# Cài đặt PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Khởi động service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Đăng nhập vào user postgres
sudo -i -u postgres

# Tạo database và user (Thay 'password' bằng mật khẩu mạnh)
psql
```

Trong giao diện dòng lệnh `postgres=#`, chạy các lệnh SQL sau:
```sql
CREATE DATABASE karaoke_db;
CREATE USER karaoke_user WITH ENCRYPTED PASSWORD 'password_bao_mat_cua_ban';
GRANT ALL PRIVILEGES ON DATABASE karaoke_db TO karaoke_user;
ALTER DATABASE karaoke_db OWNER TO karaoke_user;
\q
```

Thoát khỏi user postgres:
```bash
exit
```

## 4. Cài đặt PM2 (Process Manager)

PM2 giúp ứng dụng Node.js chạy ngầm và tự khởi động lại khi crash hoặc reboot server.

```bash
sudo npm install -g pm2
```

## 5. Triển khai Code (Deploy)

### Cách 1: Clone từ Git (Khuyên dùng)
```bash
# Cài git nếu chưa có
sudo apt install git -y

# Clone repo (Thay URL bằng repo của bạn)
git clone https://github.com/username/repo.git /var/www/karaoke-backend

# Di chuyển vào thư mục
cd /var/www/karaoke-backend/backend
```

### Cách 2: Upload code thủ công (SFTP/SCP)
Upload thư mục `backend` lên `/var/www/karaoke-backend`.

### Cài đặt và Build
Tại thư mục `backend` trên VPS:

```bash
# 1. Cài đặt dependencies
npm install

# 2. Tạo file .env
nano .env
```
Dán nội dung cấu hình vào `.env`:
```env
PORT=4000
DATABASE_URL="postgresql://karaoke_user:password_bao_mat_cua_ban@localhost:5432/karaoke_db?schema=public"
JWT_SECRET="chuoi_bi_mat_sieu_dai_tren_server"
JWT_REFRESH_SECRET="mot_chuoi_bi_mat_khac"
# true khi frontend chạy qua HTTPS
COOKIE_SECURE=true
# Ngày kinh doanh (11:30 -> 06:00) tính theo múi giờ của server
TZ=Asia/Ho_Chi_Minh
NODE_ENV=production
```
Khi `NODE_ENV=production`, backend **không khởi động** nếu thiếu `JWT_SECRET` hoặc `JWT_REFRESH_SECRET`.
Lưu file (Ctrl+O -> Enter -> Ctrl+X).

```bash
# 3. Chạy Migration Database
npx prisma migrate deploy

# 4. Seed dữ liệu: tạo cơ sở cs1–cs4 và tài khoản admin/admin123 (quản lý hệ thống).
#    Đổi mật khẩu admin ngay sau lần đăng nhập đầu tiên.
npx prisma db seed

# 5. Build ứng dụng
npm run build
```

> Máy chủ **đang chạy bản cũ** (schema tạo bằng `prisma db push`, chưa có thư mục migrations)? Không chạy bước 3 ở trên. Làm theo mục 10 trước.

## 6. Chạy ứng dụng với PM2

```bash
# Khởi chạy ứng dụng
pm2 start dist/src/main.js --name "karaoke-api"

# Lưu danh sách process để tự khởi động khi reboot
pm2 save
pm2 startup
```
(Copy và chạy lệnh mà `pm2 startup` in ra màn hình).

## 7. Cấu hình Nginx (Reverse Proxy)

Cài đặt Nginx:
```bash
sudo apt install nginx -y
```

Tạo file cấu hình cho site:
```bash
sudo nano /etc/nginx/sites-available/karaoke-api
```

Nội dung file cấu hình:
```nginx
server {
    listen 80;
    server_name api.domain-cua-ban.com; # Hoặc IP VPS nếu chưa có domain

    location / {
        proxy_pass http://localhost:4000; # Port của NestJS
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt site và restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/karaoke-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 8. Cài đặt SSL (HTTPS) với Certbot

Nếu bạn có domain, hãy cài SSL miễn phí từ Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.domain-cua-ban.com
```

## 9. Hoàn tất

Backend của bạn đã sẵn sàng tại:
- HTTP: `http://<IP_VPS>` hoặc `http://api.domain-cua-ban.com`
- HTTPS: `https://api.domain-cua-ban.com` (Nếu đã cài SSL)

Swagger Docs: `/api/docs`

## 10. Nâng cấp bản cũ lên bản đa cơ sở (phân quyền, kho, quỹ)

Bản cũ tạo schema bằng `prisma db push`, nên database production chưa có lịch sử migration. Migration `20260926000000_foundation` tự chuyển dữ liệu cũ:

- tạo các cơ sở `cs1`–`cs4` (và mọi mã cơ sở khác đang có trong phòng/hóa đơn);
- tài khoản `ADMIN` → **Quản lý hệ thống**; tài khoản `STAFF` → **Thu ngân** của `cs1`;
- mỗi `Employee` (CSKH/phục vụ) → một tài khoản `nv<id>` **chưa có mật khẩu**, thuộc cơ sở mà người đó phục vụ nhiều hóa đơn nhất; hóa đơn cũ được trỏ sang tài khoản mới;
- danh mục và mặt hàng cũ thuộc `cs1`; các cơ sở khác nhận bản sao với tồn kho 0, và món trong hóa đơn cũ của cơ sở đó trỏ sang bản sao;
- tồn kho hiện tại được ghi thành một dòng "điều chỉnh" đầu kỳ trong sổ kho; phiếu quỹ cũ thuộc `cs1`.

Các bước (backend và frontend phải lên **cùng lúc** vì API đã đổi):

```bash
# 1. Dừng backend
pm2 stop karaoke-api

# 2. Sao lưu database (bắt buộc)
pg_dump -U karaoke_user -h localhost karaoke_db > ~/karaoke_db_$(date +%Y%m%d_%H%M).sql

# 3. Lấy code mới, cài đặt, bổ sung biến môi trường mới vào .env
#    (JWT_REFRESH_SECRET, COOKIE_SECURE, TZ, NODE_ENV — xem mục 5)
git pull
npm ci

# 4. Đánh dấu schema cũ là migration gốc (chỉ làm MỘT lần, không chạy lại SQL)
npx prisma migrate resolve --applied 0_init

# 5. Chạy migration chuyển dữ liệu
npx prisma migrate deploy

# 6. Build và chạy lại
npm run build
pm2 restart karaoke-api
```

Nếu bước 5 lỗi: migration chạy trong một transaction nên database vẫn nguyên như trước (đã thử với dữ liệu mẫu). Lưu lại thông báo lỗi, sửa nguyên nhân, rồi chạy lại:

```bash
npx prisma migrate resolve --rolled-back 20260926000000_foundation
npx prisma migrate deploy
```
Vẫn giữ file sao lưu ở bước 2 cho đến khi mọi thứ chạy ổn.

Sau khi nâng cấp:

- Mọi người phải **đăng nhập lại** (khóa JWT giờ đọc từ `.env`, token cũ hết hiệu lực).
- Nhân viên CSKH/phục vụ cũ chưa đăng nhập được: quản lý vào **Quản trị → Tài khoản**, bấm nút chìa khóa để đặt mật khẩu cho người cần đăng nhập (tên đăng nhập là `nv<số>`, xem ở danh sách), và sửa họ tên/vai trò nếu cần.
- Kiểm tra tồn kho các cơ sở `cs2`–`cs4` (bắt đầu từ 0) và nhập phiếu nhập đầu kỳ.
- Frontend: `NEXT_PUBLIC_API_URL` của bản production phải trỏ tới backend mới.
