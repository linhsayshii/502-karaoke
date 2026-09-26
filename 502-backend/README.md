# 🚀 Hướng dẫn Triển khai Backend lên VPS (Ubuntu)

Tài liệu này hướng dẫn chi tiết từng bước để đưa Backend (NestJS) lên máy chủ (VPS) chạy hệ điều hành Ubuntu, sử dụng Nginx làm Reverse Proxy và PM2 để quản lý tiến trình.

---

## 🛠️ Phần 1: Chuẩn bị Môi trường trên VPS

Đăng nhập vào VPS của bạn qua SSH:
```bash
ssh root@ip_cua_vps
```

### 1. Cập nhật hệ thống
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Cài đặt Node.js (Phiên bản 18 hoặc 20)
```bash
# Tải script cài đặt Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Cài đặt Node.js
sudo apt install -y nodejs

# Kiểm tra phiên bản
node -v
npm -v
```

### 3. Cài đặt PostgreSQL (Cơ sở dữ liệu)
```bash
sudo apt install postgresql postgresql-contrib -y
```

**Cấu hình Database:**
Đăng nhập vào tài khoản postgres:
```bash
sudo -i -u postgres
psql
```

Trong giao diện dòng lệnh PostgreSQL, chạy lần lượt các lệnh sau (thay đổi `password_cua_ban`):
```sql
-- Tạo database
CREATE DATABASE karaoke502;

-- Tạo user và đặt mật khẩu
CREATE USER myuser WITH ENCRYPTED PASSWORD 'password_cua_ban';

-- Cấp quyền cho user
GRANT ALL PRIVILEGES ON DATABASE karaoke502 TO myuser;

-- Thoát
\q
```
Sau đó gõ `exit` để quay lại user root.

### 4. Cài đặt PM2 (Quản lý tiến trình Node.js)
PM2 giúp ứng dụng luôn chạy ngầm, tự khởi động lại khi bị lỗi hoặc khi khởi động lại server.
```bash
sudo npm install -g pm2
```

### 5. Mở Firewall (Quan trọng)
Nếu bạn muốn truy cập trực tiếp qua cổng 4000, bạn cần mở cổng này trên VPS:
```bash
sudo ufw allow 4000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 6. Cài đặt Nginx (Web Server)
```bash
sudo apt install nginx -y
```

---

## 📦 Phần 2: Cài đặt Ứng dụng Backend

### 1. Tải mã nguồn (Clone Git)
Di chuyển đến thư mục web (thường là `/var/www`):
```bash
cd /var/www
git clone https://github.com/username/502kara.git
cd 502kara/backend
```

### 2. Cài đặt thư viện
```bash
npm install
```

### 3. Cấu hình biến môi trường (.env)
Tạo file `.env`:
```bash
nano .env
```
Dán nội dung sau (sửa lại thông tin database bạn đã tạo ở Phần 1):
```env
PORT=4000
DATABASE_URL="postgresql://myuser:password_cua_ban@localhost:5432/karaoke502?schema=public"
JWT_SECRET="chuoi_bi_mat_sieu_kho_doan"
```
Bấm `Ctrl + X`, chọn `Y`, rồi `Enter` để lưu.

### 4. Đồng bộ Database (Prisma)
Chạy lệnh sau để tạo các bảng trong Database:
```bash
npx prisma db push
npx prisma generate
```

### 5. Tạo tài khoản Admin đầu tiên (Seed)
Để có tài khoản đăng nhập vào hệ thống, bạn cần chạy lệnh seed:
```bash
npx prisma db seed
```
*Mặc định tài khoản sẽ là:*
- **Username**: `admin`
- **Password**: `admin123` (Bạn nên đổi mật khẩu sau khi đăng nhập).

### 6. Build ứng dụng
```bash
npm run build
```

---

## 🚀 Phần 3: Chạy ứng dụng với PM2

Khởi chạy backend dưới nền:
```bash
pm2 start dist/src/main.js --name "karaoke-backend"
```

Lưu trạng thái để tự khởi động khi reboot VPS:
```bash
pm2 startup
pm2 save
```

Kiểm tra trạng thái:
```bash
pm2 status
```

---

## 🌐 Phần 4: Cấu hình Nginx (Reverse Proxy cho cả Frontend & Backend)

Chúng ta sẽ cấu hình Nginx để chạy cả Frontend và Backend trên cùng một domain (ví dụ: `domain.com`).
- Frontend sẽ chạy ở đường dẫn gốc `/`
- Backend sẽ chạy ở đường dẫn `/api`

### 1. Tạo file cấu hình
```bash
sudo nano /etc/nginx/sites-available/karaoke-app
```

### 2. Nội dung cấu hình
Dán nội dung sau vào (thay `your_domain.com` bằng tên miền của bạn):

```nginx
server {
    listen 80;
    server_name your_domain.com; # Ví dụ: karaoke502.com

    # 1. Cấu hình cho Frontend (Next.js chạy port 3000)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 2. Cấu hình cho Backend (NestJS chạy port 4000)
    # Tất cả request bắt đầu bằng /api sẽ được chuyển vào backend
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Kích hoạt cấu hình
```bash
# Xóa cấu hình mặc định (nếu có)
sudo rm /etc/nginx/sites-enabled/default

# Tạo liên kết (symlink)
sudo ln -s /etc/nginx/sites-available/karaoke-app /etc/nginx/sites-enabled/

# Kiểm tra lỗi cú pháp
sudo nginx -t

# Khởi động lại Nginx
sudo systemctl restart nginx
```

---

## 🔒 Phần 5: Cài đặt SSL (HTTPS) - Tùy chọn

Nếu bạn có tên miền, hãy cài đặt SSL miễn phí từ Let's Encrypt để bảo mật API.

1.  **Cài đặt Certbot**:
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```

2.  **Lấy chứng chỉ**:
    ```bash
    sudo certbot --nginx -d your_domain.com
    ```
    Làm theo hướng dẫn trên màn hình.

---

## ✅ Hoàn tất

Bây giờ Backend của bạn đã chạy online!
- **API URL**: `http://your_domain_or_ip`
- **Swagger Docs**: `http://your_domain_or_ip/api`

### Một số lệnh hữu ích:
- Xem log lỗi backend: `pm2 logs karaoke-backend`
- Khởi động lại backend: `pm2 restart karaoke-backend`
- Cập nhật code mới:
    ```bash
    git pull
    npm install
    npm run build
    pm2 restart karaoke-backend
    ```
