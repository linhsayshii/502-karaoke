# Karaoke 502 — Backend

API của hệ thống: NestJS 11 + Prisma 5.22 + PostgreSQL. Mọi route nằm dưới `/api`, Swagger ở `/api/docs`.

> Triển khai production (Docker): xem [DEPLOYMENT.md](../DEPLOYMENT.md) ở thư mục gốc. Tài liệu này chỉ dành cho phát triển.

## Chạy local

Cần Node.js 22+ và Docker (để chạy PostgreSQL).

### 1. PostgreSQL

Một container dùng chung cho phát triển (`karaoke_db`) và test e2e (`karaoke_test`), cổng 5433 để không đụng PostgreSQL có sẵn trên máy:

```bash
docker run -d --name kara502-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 \
  -v kara502-pg:/var/lib/postgresql/data postgres:17-alpine
docker exec kara502-pg psql -U postgres -c "create database karaoke_db" -c "create database karaoke_test"
```

Lần sau chỉ cần `docker start kara502-pg`.

### 2. Cấu hình `.env`

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/karaoke_db?schema=public"
PORT=4000
JWT_SECRET="dev-secret"
JWT_REFRESH_SECRET="dev-refresh-secret"
COOKIE_SECURE=false
TZ=Asia/Ho_Chi_Minh
```

| Biến | Ghi chú |
|------|---------|
| `DATABASE_URL` | Prisma đọc trực tiếp từ `.env`. Muốn chạy với DB khác thì truyền qua shell: `DATABASE_URL=... npm run start:dev`. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Bắt buộc khi `NODE_ENV=production`; khi phát triển, thiếu thì dùng giá trị cố định. |
| `COOKIE_SECURE` | Cờ `secure` của cookie refresh token. `true` chỉ khi chạy qua HTTPS. |
| `TZ` | Ngày kinh doanh (06:00 → 06:00 hôm sau) tính theo giờ máy chủ. Luôn để `Asia/Ho_Chi_Minh`. |

### 3. Cài đặt và chạy

```bash
npm install
npx prisma migrate deploy     # tạo bảng
npx prisma db seed            # cơ sở cs1–cs5 + admin, ql1_cs1, tn1_cs1, pv1_cs1, ql1_cs5, tn1_cs5, cskh1_cs5, pv1_cs5 và 44 phòng VIP của cs5 (mật khẩu 12345678)
SEED_DEMO=1 npx prisma db seed  # (tuỳ chọn) thêm cskh1_cs1, ql1_cs2, tn1_cs2, pv1_cs2 (mật khẩu 12345678), phòng, mặt hàng cho cs1/cs2
npm run start:dev             # http://localhost:4000/api, Swagger: http://localhost:4000/api/docs
```

## Lệnh

```bash
npm run start:dev          # chạy với watch
npm run build              # build ra dist/src/main.js (vì prisma/seed.ts cũng nằm trong thư mục gốc TS)
npm run start:prod         # node dist/src/main
npm run lint               # eslint --fix
npm run format             # prettier
npm test                   # unit test (*.spec.ts trong src/)
npx jest src/orders/billing.spec.ts   # một file test
npm run test:e2e           # e2e, dùng DB trong test/e2e.env (karaoke_test) — DB này bị xoá sạch mỗi lần chạy
```

## Database và migration

Schema ở `prisma/schema.prisma`. Mọi thay đổi schema đi qua migration:

```bash
# sửa prisma/schema.prisma rồi:
npx prisma migrate dev --name <ten_thay_doi>   # tạo migration mới trong prisma/migrations và áp vào DB dev
```

Commit cả thư mục migration mới. Khi triển khai, container backend tự chạy `prisma migrate deploy` lúc khởi động.

- **Không dùng `prisma db push`** nữa.
- `0_init` là baseline của schema cũ (tạo bằng `db push`); `20260926000000_foundation` là migration viết tay, chuyển dữ liệu cũ sang mô hình nhiều cơ sở. Xem [DEPLOYMENT.md §6](../DEPLOYMENT.md#6-chuyển-từ-bản-cũ-pm2--postgresql-cài-trực-tiếp).
- `20260926120000_linked_flows`: chốt giá giờ trên hóa đơn, hình thức thanh toán, liên kết phiếu thu/chi với hóa đơn/phiếu nhập, hủy chứng từ. Xem [DEPLOYMENT.md §6.6](../DEPLOYMENT.md#66-bản-cập-nhật-liên-kết-bán-hàng--kho--quỹ-migration-20260926120000_linked_flows).
- `20260927000000_edit_paid_bills`: VAT mặc định 10%, phòng mặc định VIP, lưu lần sửa hóa đơn đã thanh toán. Xem [DEPLOYMENT.md §6.7](../DEPLOYMENT.md#67-bản-cập-nhật-tính-giờ-vat-10-sửa-hóa-đơn-đã-thanh-toán-migration-20260927000000_edit_paid_bills).
- `test/fixtures/legacy-data.sql` là dữ liệu mẫu dạng cũ để tập dượt migration `foundation`: nạp vào DB chỉ có `0_init`, rồi chạy `npx prisma migrate deploy`.

## Docker

`Dockerfile` build 3 stage: build TypeScript, cài `node_modules` production (có `prisma` CLI để chạy migration), và image chạy (`node:22-bookworm-slim`, user `node`). Image chạy `prisma migrate deploy` rồi `node dist/src/main.js`. Seed trong container: `node dist/prisma/seed.js`.

Image được build và chạy qua `docker-compose.yml` ở thư mục gốc, không chạy riêng.
