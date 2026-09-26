# Karaoke 502 — Frontend

Giao diện web: Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn/ui.

> Triển khai production (Docker): xem [DEPLOYMENT.md](../DEPLOYMENT.md) ở thư mục gốc. Tài liệu này chỉ dành cho phát triển.

## Chạy local

Cần Node.js 22+ và backend đang chạy (xem [README backend](../502-backend/README.md)).

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > .env.development.local
npm run dev        # http://localhost:3000
```

Đăng nhập bằng tài khoản đã seed ở backend (`admin` / `admin123`).

## Kết nối API

Trình duyệt gọi API qua `NEXT_PUBLIC_API_URL` (axios trong `src/lib/api.ts`). Biến này được gắn cứng vào mã lúc build/dev, đổi xong phải chạy lại `npm run dev`. Các file `.env*` không được commit, bản clone mới phải tự tạo.

| Cách | `.env.development.local` | Ghi chú |
|------|--------------------------|---------|
| Gọi thẳng backend (mặc định ở trên) | `NEXT_PUBLIC_API_URL=http://localhost:4000/api` | Khác origin; backend cho phép CORS kèm cookie. |
| Qua proxy như production | `NEXT_PUBLIC_API_URL=/api`<br>`API_PROXY_TARGET=http://localhost:4000` | `next.config.ts` chuyển `/api/*` sang `API_PROXY_TARGET`. |

⚠️ Nếu đặt `NEXT_PUBLIC_API_URL=/api` mà **không** đặt `API_PROXY_TARGET`, proxy mặc định trỏ về **backend production** (`https://kara.hvlsv.uk`). Khi đó bạn đang thao tác trên dữ liệu thật.

Khi chạy bằng Docker (`docker-compose.yml` ở thư mục gốc), image được build với `NEXT_PUBLIC_API_URL=/api` và `API_PROXY_TARGET=http://backend:4000`. Trình duyệt chỉ nói chuyện với frontend, frontend chuyển tiếp sang container backend.

## Lệnh

```bash
npm run dev      # dev server
npm run build    # build production (output: 'standalone', dùng cho Docker)
npm run lint
```

Chưa có test tự động cho frontend.

## Thêm component giao diện

Component nền nằm trong `src/components/ui` (shadcn, style new-york, icon lucide). Thêm mới bằng CLI để giữ đúng cấu hình `components.json`:

```bash
npx shadcn@latest add <ten-component>
```

Văn bản giao diện và thông báo lỗi viết bằng tiếng Việt.
