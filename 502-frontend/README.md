# 🚀 Hướng dẫn Triển khai Frontend (Next.js)

Tài liệu này hướng dẫn cách cài đặt và triển khai giao diện người dùng (Frontend) của hệ thống Karaoke 502.

---

## 🛠️ 1. Chạy trên máy cá nhân (Local)

### Yêu cầu
- **Node.js**: v18 trở lên.
- **npm** hoặc **yarn**.

### Các bước thực hiện
1.  **Di chuyển vào thư mục frontend**:
    ```bash
    cd 502-frontend
    ```

2.  **Cài đặt thư viện**:
    ```bash
    npm install
    ```

3.  **Cấu hình kết nối API**:
    Mở file `src/lib/api.ts` và kiểm tra dòng `baseURL`. Đảm bảo nó trỏ đúng về địa chỉ Backend của bạn:
    ```typescript
    const api = axios.create({
      baseURL: 'http://localhost:4000', // Thay bằng IP/Domain VPS nếu chạy online
    });
    ```

4.  **Chạy chế độ phát triển**:
    ```bash
    npm run dev
    ```
    Truy cập: `http://localhost:3000`

---

## 🌐 2. Triển khai lên Vercel (Khuyên dùng)

Vercel là cách nhanh và dễ nhất để đưa Next.js lên mạng.

1.  Đẩy code của bạn lên GitHub/GitLab.
2.  Truy cập [Vercel.com](https://vercel.com/) và kết nối với kho lưu trữ của bạn.
3.  **Cấu hình**: Vercel sẽ tự động nhận diện Next.js.
4.  **Biến môi trường**: Nếu bạn có dùng `.env`, hãy thêm chúng vào phần "Environment Variables" trên Vercel.
5.  Nhấn **Deploy**.

---

## 🖥️ 3. Triển khai lên VPS (Ubuntu + Nginx)

Nếu bạn muốn chạy Frontend trên cùng VPS với Backend.

### 1. Build ứng dụng
Trên VPS, di chuyển vào thư mục 502-frontend và chạy:
```bash
npm install
npm run build
```

### 2. Chạy với PM2
```bash
pm2 start npm --name "karaoke-frontend" -- start
```

### 3. Cấu hình Nginx
Tạo file cấu hình mới:
```bash
sudo nano /etc/nginx/sites-available/karaoke-frontend
```

Dán nội dung sau (thay `your_domain` bằng tên miền của bạn):
```nginx
server {
    listen 80;
    server_name your_domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt và khởi động lại Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/karaoke-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## ❓ Lỗi thường gặp
- **Lỗi 404/500 khi gọi API**: Kiểm tra xem Backend đã bật CORS chưa và `baseURL` trong `api.ts` đã đúng chưa.
- **Cổng 3000 đã bị chiếm**: Chạy `lsof -i :3000` để tìm và tắt tiến trình đang chiếm cổng.
