# Chạy Karaoke 502 bằng Docker

Toàn bộ hệ thống (PostgreSQL + backend NestJS + frontend Next.js) chạy bằng `docker compose` từ thư mục này.

```
./docker-compose.yml
./.env                 ← tạo từ .env.docker.example
./data/postgres/       ← dữ liệu PostgreSQL (bind mount, tự tạo khi chạy lần đầu)
./502-backend/Dockerfile
./502-frontend/Dockerfile
```

Kiến trúc: chỉ frontend mở cổng ra ngoài (`APP_PORT`, mặc định 3000). Trình duyệt gọi `/api/*` trên cùng domain, Next.js chuyển tiếp sang `http://backend:4000` trong mạng Docker, nên cookie refresh chạy mà không cần cấu hình CORS/domain. Backend và DB không mở cổng ra ngoài.

## Chạy lần đầu

```bash
cp .env.docker.example .env
# sửa POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET (openssl rand -hex 32)

docker compose up -d --build
```

Mỗi lần khởi động, backend tự chạy `prisma migrate deploy` rồi mới start.

Tạo dữ liệu ban đầu (cơ sở cs1–cs4 + tài khoản `admin` / `admin123`), **chỉ chạy một lần**:

```bash
docker compose exec backend node dist/prisma/seed.js
# thêm dữ liệu demo: docker compose exec -e SEED_DEMO=1 backend node dist/prisma/seed.js
```

Mở http://localhost:3000 và đổi mật khẩu admin ngay.

## Lệnh thường dùng

```bash
docker compose ps
docker compose logs -f backend
docker compose up -d --build          # cập nhật sau khi pull code mới
docker compose down                   # dừng; dữ liệu trong ./data vẫn giữ nguyên
```

Swagger: http://localhost:3000/api/docs

## Sao lưu / khôi phục

```bash
# Sao lưu
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%Y%m%d_%H%M).sql

# Khôi phục vào DB trống (dừng backend trước)
docker compose stop backend
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql
docker compose start backend
```

Cũng có thể sao lưu nguyên thư mục `./data` khi **đã dừng** container `db`.

## Chuyển từ VPS cũ (PM2 + PostgreSQL cài trực tiếp)

1. Trên VPS cũ: `pg_dump -U karaoke_user -h localhost karaoke_db > old.sql`.
2. Trên máy chạy Docker: tạo `.env`, rồi chỉ khởi động DB: `docker compose up -d db`.
3. Nạp dữ liệu: `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < old.sql`.
4. Nếu DB cũ **chưa từng chạy migration** (tạo bằng `prisma db push`, không có bảng `_prisma_migrations`), đánh dấu migration gốc một lần:
   ```bash
   docker compose run --rm backend npx prisma migrate resolve --applied 0_init
   ```
   (Xem `502-backend/DEPLOYMENT.md` §10 về những gì migration `foundation` chuyển đổi.)
5. `docker compose up -d --build` — backend tự áp các migration còn lại.
6. Nginx trên VPS trỏ domain về `http://127.0.0.1:3000` (thay cho cổng 4000 cũ), bật SSL rồi đặt `COOKIE_SECURE=true` trong `.env` và `docker compose up -d`.

## Ghi chú

- `./data` phải nằm trên ổ đĩa của máy chủ. Trên macOS/Windows (Docker Desktop), bind mount chậm hơn volume nhưng vẫn dùng được.
- Đổi `POSTGRES_PASSWORD` sau khi `./data` đã được tạo **không** đổi mật khẩu trong DB (Postgres chỉ đọc biến này lúc khởi tạo). Muốn đổi thì chạy `ALTER USER` trong psql.
- `NEXT_PUBLIC_API_URL` và đích proxy `API_PROXY_TARGET` được gắn cứng lúc build image frontend (build args trong `docker-compose.yml`); đổi thì phải `--build` lại.
- Múi giờ container là `Asia/Ho_Chi_Minh` (ngày kinh doanh 11:30 → 06:00 tính theo giờ server).
