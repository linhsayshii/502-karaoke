# 🎤 Karaoke 502

Hệ thống quản lý chuỗi quán karaoke nhiều cơ sở (`cs1`–`cs5`):

- **Bán hàng**: mở phòng, gọi món vào phòng, tính tiền giờ, thanh toán (tiền mặt / chuyển khoản), hủy hóa đơn.
- **Kho**: phiếu nhập/xuất, sổ kho, tồn kho riêng từng cơ sở; thanh toán tự trừ kho, hủy hóa đơn/phiếu tự hoàn kho.
- **Quỹ**: phiếu thu/chi, tồn đầu kỳ/cuối kỳ; thanh toán tự ghi phiếu thu, nhập hàng đã trả tự ghi phiếu chi.
- **Báo cáo**: doanh thu theo ngày/tuần/tháng/quý/năm kinh doanh (06:00 → 06:00 hôm sau, giờ mở cửa 11:30 → 06:00), so với kỳ trước, xem toàn chuỗi hoặc từng cơ sở, xuất Excel; doanh thu tính chưa gồm VAT, VAT tách riêng, khớp với phiếu thu bán hàng trong Sổ quỹ. Báo cáo theo nhân viên (CSKH/phục vụ/thu ngân), phòng (công suất), hàng hóa, khung giờ và so sánh cơ sở. Giá vốn bình quân gia quyền chụp trên từng hóa đơn; báo cáo lãi lỗ theo kỳ (doanh thu − giá vốn − chi phí theo khoản mục − hao hụt + thu khác) và nhập – xuất – tồn theo món.
- **Hóa đơn điện tử**: chia một bill đã thanh toán thành nhiều hóa đơn nhỏ (người mua, dòng hàng riêng), thu ngân lưu nháp, quản lý hệ thống xuất lên Minvoice và giữ số hóa đơn.
- **Nhập từ Excel**: nhập mặt hàng, danh mục, phòng, nhân viên và phiếu nhập kho từ file Excel/CSV; người dùng chọn cột nào trong file ứng với trường dữ liệu nào (hệ thống tự đoán theo tiêu đề và nhớ lần trước), xem trước từng dòng rồi mới nhập.
- **Phân quyền**: Quản lý hệ thống, Quản lý cơ sở, Thu ngân, Nhân viên, Hội đồng quản trị. Mỗi tài khoản (trừ quản lý hệ thống và HĐQT) chỉ thao tác trong cơ sở của mình. HĐQT xem được mọi trang của mọi cơ sở nhưng không sửa được gì, và là tài khoản duy nhất xóa sạch được dữ liệu một cơ sở hoặc cả hệ thống (nhập lại mật khẩu, có nhật ký).
- **Sao lưu**: mỗi ngày lúc 09:00 tự sao lưu database vào máy chủ và lên WebDAV (Nextcloud...).
- **Giao diện**: shadcn/ui, chế độ sáng/tối, dùng được trên máy tính, máy tính bảng và điện thoại.

## Cấu trúc

```
502-backend/          API: NestJS 11 + Prisma 5 + PostgreSQL
502-frontend/         Giao diện web: Next.js 16 + React 19 + Tailwind 4 + shadcn/ui
docker-compose.yml    Chạy cả hệ thống (db + backend + frontend + backup)
.env.docker.example   Mẫu cấu hình cho docker compose
backup/               Service sao lưu tự động hằng ngày (máy chủ + WebDAV)
scripts/backup.sh     Sao lưu database bằng tay
data/                 Dữ liệu PostgreSQL khi chạy bằng Docker (không commit)
```

## Chạy nhanh bằng Docker

Cần [Docker](https://docs.docker.com/get-docker/) có Compose v2.

```bash
cp .env.docker.example .env        # rồi đổi POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET và điền EINVOICE_SECRET (openssl rand -base64 32)
docker compose up -d --build
docker compose exec backend node dist/prisma/seed.js   # chỉ lần đầu: tạo cs1–cs5 và các tài khoản mặc định
```

Mở http://localhost:3000 và đăng nhập `admin` / `12345678`. Dữ liệu nằm trong `./data/postgres` và vẫn còn sau `docker compose down`.

### Tài khoản mặc định

Seed tạo sẵn các tài khoản sau, tất cả có mật khẩu **`12345678`** — **đổi mật khẩu ngay** sau lần đăng nhập đầu tiên:

| Tài khoản | Vai trò | Cơ sở |
|-----------|---------|-------|
| `admin` | Quản lý hệ thống | Tất cả |
| `ql1_cs1` | Quản lý cơ sở | Cơ sở 1 |
| `tn1_cs1` | Thu ngân | Cơ sở 1 |
| `pv1_cs1` | Nhân viên (phục vụ) | Cơ sở 1 |

Chạy lại seed không tạo trùng và không đặt lại mật khẩu của tài khoản đã có.

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
