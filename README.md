# 🎤 Karaoke 502

Hệ thống quản lý chuỗi quán karaoke nhiều cơ sở (`cs1`–`cs4`):

- **Bán hàng**: mở phòng, gọi món vào phòng, tính tiền giờ, thanh toán (tiền mặt / chuyển khoản), hủy hóa đơn.
- **Kho**: phiếu nhập/xuất, sổ kho, tồn kho riêng từng cơ sở; thanh toán tự trừ kho, hủy hóa đơn/phiếu tự hoàn kho.
- **Quỹ**: phiếu thu/chi, tồn đầu kỳ/cuối kỳ; thanh toán tự ghi phiếu thu, nhập hàng đã trả tự ghi phiếu chi.
- **Thống kê**: doanh thu theo ngày kinh doanh (06:00 → 06:00 hôm sau, giờ mở cửa 11:30 → 06:00), khớp với phiếu thu bán hàng trong Sổ quỹ.
- **Phân quyền**: Quản lý hệ thống, Quản lý cơ sở, Thu ngân, Nhân viên. Mỗi tài khoản (trừ quản lý hệ thống) chỉ thao tác trong cơ sở của mình.
- **Giao diện**: shadcn/ui, chế độ sáng/tối, dùng được trên máy tính, máy tính bảng và điện thoại.

## Cấu trúc

```
502-backend/          API: NestJS 11 + Prisma 5 + PostgreSQL
502-frontend/         Giao diện web: Next.js 16 + React 19 + Tailwind 4 + shadcn/ui
docker-compose.yml    Chạy cả hệ thống (db + backend + frontend)
.env.docker.example   Mẫu cấu hình cho docker compose
scripts/backup.sh     Sao lưu database
data/                 Dữ liệu PostgreSQL khi chạy bằng Docker (không commit)
```

## Chạy nhanh bằng Docker

Cần [Docker](https://docs.docker.com/get-docker/) có Compose v2.

```bash
cp .env.docker.example .env        # rồi đổi POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
docker compose up -d --build
docker compose exec backend node dist/prisma/seed.js   # chỉ lần đầu: tạo cs1–cs4 và tài khoản admin
```

Mở http://localhost:3000 và đăng nhập `admin` / `admin123` (đổi mật khẩu ngay). Dữ liệu nằm trong `./data/postgres` và vẫn còn sau `docker compose down`.

## Tài liệu

| Tài liệu | Nội dung |
|----------|----------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Triển khai lên máy chủ bằng Docker: cài đặt, tên miền + HTTPS, cập nhật, sao lưu/khôi phục, chuyển từ bản cũ (PM2), xử lý sự cố. |
| [502-backend/README.md](./502-backend/README.md) | Phát triển backend: chạy local, migration, test. |
| [502-frontend/README.md](./502-frontend/README.md) | Phát triển frontend: chạy local, kết nối API. |

## Phát triển

Backend và frontend chạy trực tiếp bằng Node.js 22+ để có hot reload. Chỉ PostgreSQL chạy trong Docker. Tóm tắt (chi tiết trong README của từng phần):

```bash
# PostgreSQL cho phát triển (cổng 5433)
docker run -d --name kara502-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 \
  -v kara502-pg:/var/lib/postgresql/data postgres:17-alpine
docker exec kara502-pg psql -U postgres -c "create database karaoke_db" -c "create database karaoke_test"

# Backend → http://localhost:4000/api (Swagger: /api/docs)
cd 502-backend && cp .env.example .env    # sửa DATABASE_URL (xem README backend)
npm install && npx prisma migrate deploy && npx prisma db seed && npm run start:dev

# Frontend → http://localhost:3000
cd 502-frontend && echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > .env.development.local
npm install && npm run dev
```
