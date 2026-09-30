# WebSocket cho màn hình thu ngân và quản lý — giai đoạn 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn hình thu ngân và quản lý nhận tín hiệu "có thay đổi" qua một WebSocket dùng chung (phòng đổi, order đổi, yêu cầu giảm giá mới / đã xử lý) rồi gọi lại REST; khi có socket thì polling thưa ra (60 s), mất socket thì polling như hiện nay. Điện thoại nhân viên (STAFF) không dùng WebSocket.

**Architecture:** Backend thêm module toàn cục `src/live` (`@nestjs/websockets` + `@nestjs/platform-ws`, thư viện `ws`): gateway tại `/api/ws` trên cùng HTTP server, xác thực bằng tin nhắn đầu `{type:"auth", token}`, bộ đăng ký trong RAM có trần (`LiveRegistry`, hàm thuần, có unit test), heartbeat 30 s; `LiveEventsService.emit()` được các service gọi **sau khi** `$transaction` trả về. Frontend thêm `LiveEventsProvider` trong `AppShell` (một `WebSocket` của trình duyệt, nối lại lùi dần), các hook `useLiveEvent` / `useLiveInterval`, và bốn nơi tiêu thụ: sơ đồ phòng, trang phòng, badge Duyệt giảm giá, hàng chờ. Đường mạng production (Cloudflare Tunnel → Next standalone → rewrite `/api/*` → backend) được chạy thử trước ở Task 1.

**Tech Stack:** NestJS 11, `@nestjs/websockets`, `@nestjs/platform-ws`, `ws` 8, Jest (unit + e2e), Next.js 16.1.1 App Router, React 19, `WebSocket` của trình duyệt (không thêm thư viện frontend), Node ≥ 22 (`WebSocket` toàn cục trong bench/e2e).

**Spec:** `docs/superpowers/specs/2026-09-30-role-permissions-discount-approval-design.md` — §7 (WebSocket), §10 (tài nguyên), §11 (kiểm thử e2e WebSocket). Đọc §7 trước mọi task.

## Global Constraints

- Chuỗi hiển thị và thông báo lỗi bằng tiếng Việt; code comment tiếng Anh như code hiện có; commit message tiếng Việt kiểu `feat(live): …`, kết thúc bằng `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Spec §7: gateway tại **`/api/ws`**; xác thực trong **5 giây** sau khi nối bằng `{type:"auth", token}` (không đặt token trên URL); chỉ vai trò **`SALES`** (`CHAIN_MANAGER`, `BRANCH_MANAGER`, `CASHIER`), user `active`; trần **100 socket** toàn hệ thống và **5 socket mỗi user** (vượt → đóng mã **1013**); `ping` mỗi **30 giây**, không `pong` **2 lần** liên tiếp → đóng; `maxPayload` **4 KB**; tin nhắn từ máy khách chỉ nhận `auth`, loại khác bỏ qua; **không log từng tin nhắn**, chỉ log lỗi; phát sự kiện **sau khi `$transaction` trả về**, không bao giờ bên trong.
- Sự kiện và người nhận (spec §7): `room.changed {branchId, roomId}` và `order.changed {branchId, orderId}` → mọi socket của cơ sở đó + quản lý hệ thống; `discount.requested {branchId, requestId}` → socket của **quản lý cơ sở** của cơ sở đó + quản lý hệ thống; `discount.decided {branchId, orderId, requestId, status}` → mọi socket của cơ sở đó + quản lý hệ thống. Nội dung chỉ có id, không mang dữ liệu nghiệp vụ.
- Frontend (spec §7): một kết nối dùng chung (context trong `app-shell`), chỉ mở với vai trò bán hàng; nối lại **1, 2, 4… tối đa 30 s + ngẫu nhiên 0–1 s**; tab ẩn vẫn giữ socket; mất socket **quá 30 giây** thì polling về chu kỳ cũ; chu kỳ khi đang nối: sơ đồ phòng **60 s**, trang phòng **60 s**, badge **60 s**, hàng chờ 60 s; mất nối: **30 s / 15 s / 15 s / 15 s** như hiện nay; gửi lại `auth` khi `onSessionChange` báo token mới; đóng khi đăng xuất.
- `docs/resource-rules.md`: `Map` có trần và dọn khi đóng; polling qua `usePolling`, chu kỳ ≥ 15 s; timer/listener đều được dọn; thư viện chạy lúc runtime ở `dependencies`, `@types/*` ở `devDependencies`; không log từng request. Heartbeat là `setInterval` duy nhất được phép trong backend (ngoại lệ có comment: nó thuộc về socket, không phải công việc định kỳ).
- Không đổi migration, không đổi luật nghiệp vụ của giai đoạn 1.
- Chạy e2e: `docker start kara502-pg` trước; chạy từng bộ một (`cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/live.e2e-spec.ts`).

## Quyết định chi tiết (bổ sung spec, cùng mức ràng buộc)

1. **Tin nhắn trên dây** đều là JSON phẳng có `type`: máy khách gửi `{type:"auth", token}`; server trả `{type:"ready", userId}` sau khi xác thực xong, rồi các sự kiện `{type:"room.changed", branchId, roomId}` v.v. Frontend chỉ coi là "đang nối" sau khi nhận `ready`.
2. **Mã đóng**: `1013` khi vượt trần (máy khách chờ 30 s rồi nối lại); `4001` khi không xác thực trong 5 giây hoặc token sai/hết hạn/không phải vai trò bán hàng (máy khách nối lại theo lùi dần; token mới đến qua `onSessionChange` thì gửi `auth` ngay); `4002` khi token hết hạn quá **60 giây** mà chưa có `auth` mới (60 giây là để lần polling kế tiếp của máy khách kịp `refresh` và gửi `auth` lại); `1000` khi máy khách đóng (đăng xuất, tắt tab).
3. **Hết hạn token/phiên** kiểm tra trong tick heartbeat 30 s (không đặt timer riêng mỗi socket): access token không bao giờ sống quá phiên 24 giờ (`signAccessToken` cắt theo `sessionSecondsLeft`), nên đóng khi `exp + 60 s < now` bao cả hai trường hợp của spec.
4. **Sự kiện `reconnected`** chỉ có ở phía máy khách: provider phát `{type:"reconnected"}` cho các listener khi nối lại được sau một lần đã `ready` trước đó, để mỗi màn hình tải lại một lần vì có thể đã lỡ sự kiện. Không phát ở lần nối đầu.
5. **Gộp tín hiệu**: `useCoalesced(fn, 1000)` — nhiều lần gọi trong 1 giây thành một lần chạy (spec: sơ đồ phòng gộp trong 1 s; trang phòng cũng dùng vì duyệt giảm giá phát `order.changed` và `discount.decided` cùng lúc).
6. Badge Duyệt giảm giá giữ toast theo số đếm tăng như hiện nay (`use-pending-discounts.ts`); sự kiện chỉ làm nó tải lại ngay, không toast riêng (tránh hai toast). Toast "phòng …" của spec bỏ, vì tin nhắn không mang tên phòng.
7. `next.config.ts`: `connect-src` thêm origin `ws(s)://` của `NEXT_PUBLIC_API_URL` khi nó là URL tuyệt đối (production dùng `/api` cùng origin nên `'self'` đã đủ).

## File Structure

Backend (`502-backend/`):
- `package.json` — thêm `@nestjs/websockets`, `@nestjs/platform-ws`, `ws` (dependencies), `@types/ws` (devDependencies).
- `src/live/live-events.ts` — mới: kiểu `LiveEvent` (4 sự kiện) và `LiveUser` (id, role, branchId).
- `src/live/live-registry.ts` (+ `live-registry.spec.ts`) — mới: `LiveRegistry` — bộ đăng ký socket có trần, thuần (không phụ thuộc Nest).
- `src/live/live-events.service.ts` (+ `.spec.ts`) — mới: `LiveEventsService.emit(event)` chọn người nhận và gửi JSON.
- `src/live/live.gateway.ts` — mới: `LiveGateway` (`/api/ws`, auth, heartbeat, dọn khi đóng).
- `src/live/live.module.ts` — mới: `@Global()` `LiveModule`.
- `src/app.setup.ts` — `app.useWebSocketAdapter(new WsAdapter(app))`.
- `src/app.module.ts` — import `LiveModule`.
- `src/orders/orders.service.ts` — phát sau commit ở `create`, `update`, `checkout`, `cancel`, `lockTime`, `unlockTime`.
- `src/discounts/discounts.service.ts` — phát sau commit ở `adjust` và `decide`.
- `src/pr/pr-sessions.service.ts` — phát `order.changed` sau commit ở `add`, `end`, `update`, `remove`.
- `test/live.e2e-spec.ts` — mới.
- `test/load/bench.mjs` — `SOCKETS=1`: thu ngân và quản lý giữ socket suốt bài đo.

Frontend (`502-frontend/src/`):
- `lib/api.ts` — thêm `getAccessToken()`.
- `lib/live-events.ts` — mới: kiểu `LiveEvent` (kèm `reconnected`), `liveUrl()`.
- `lib/permissions.ts` — quyền `live` (vai trò bán hàng).
- `components/live-events-provider.tsx` — mới: `LiveEventsProvider`, context.
- `hooks/use-live-events.ts` — mới: `useLiveEvent`, `useLiveConnected`, `useLiveInterval`.
- `hooks/use-coalesced.ts` — mới: `useCoalesced`.
- `components/layout/app-shell.tsx` — bọc `LiveEventsProvider`.
- `next.config.ts` — `connect-src` cho `ws(s)://`.
- `app/[branch]/sales/rooms/page.tsx`, `app/[branch]/sales/rooms/[id]/page.tsx`, `hooks/use-pending-discounts.ts`, `components/discounts/pending-requests.tsx` — tiêu thụ sự kiện, chu kỳ polling theo socket.

Tài liệu: `DEPLOYMENT.md` (§3 Nginx, §3.2 Cloudflare, §6.17), `docs/resource-rules.md` (§1.15, §2.3, §6), `docs/security-review.md`, `CLAUDE.md`, `502-backend/README.md` (nếu liệt kê module).

---

### Task 1: Spike đường mạng — WebSocket qua Next standalone (rewrite `/api/*`)

Mục đích: chứng minh (hoặc bác) rằng request upgrade tới `/api/ws` đi qua image frontend production (`next start` standalone, rewrite `/api/:path*` → `http://backend:4000`) tới backend và **giữ được 10 phút** với ping 30 s. Đọc mã đã cho thấy khả năng cao là được: `node_modules/next/dist/server/lib/router-server.js` `upgradeHandler` gọi `proxyRequest(req, socket, parsedUrl, head)` khi rewrite trỏ ra URL có protocol, và `proxy-request.js` dùng `http-proxy` với `ws: true`; ở nhánh ws `http-proxy` gọi `socket.setTimeout(0)` nên **không có `proxyTimeout` 30 s** (chỉ nhánh HTTP có). Cloudflare không thử được ở máy dev (WebSocket của Cloudflare mặc định bật; bước xác nhận sau triển khai ghi vào DEPLOYMENT).

**Files:**
- Tạo (tạm, trong scratchpad, **không commit**): `<scratchpad>/spike/server.mjs`, `<scratchpad>/spike/client.mjs`.
- Sửa: `DEPLOYMENT.md` §3 (Nginx) và §3.2 (Cloudflare) — ghi kết quả và bước kiểm tra.

**Interfaces:**
- Produces: kết luận "Next chuyển tiếp được upgrade" (mặc định) hoặc "phải thêm `ingress` path `/api/ws` trong cloudflared" — ghi vào cuối task này trong file kế hoạch (dòng `**Kết quả spike:**`) để Task 3 và tài liệu bám theo. Đường dẫn `/api/ws` không đổi dù kết quả nào.

- [ ] **Step 1: Server WebSocket tạm (đóng vai backend)**

Tạo `<scratchpad>/spike/server.mjs` (dùng `ws`, cài trong container):

```js
// Throwaway backend for the spike: a ws server at /api/ws that pings every 30 s
// and echoes messages, logging what reaches it through the Next proxy.
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ port: 4000, path: '/api/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  console.log(new Date().toISOString(), 'connection', req.url, 'x-forwarded-host=', req.headers['x-forwarded-host']);
  ws.on('message', (data) => ws.send(`echo:${data}`));
  ws.on('pong', () => console.log(new Date().toISOString(), 'pong'));
  const timer = setInterval(() => ws.ping(), 30_000);
  ws.on('close', (code) => { clearInterval(timer); console.log(new Date().toISOString(), 'close', code); });
});
console.log('spike ws server on :4000 /api/ws');
```

- [ ] **Step 2: Client giữ 10 phút (chạy trên máy dev, Node ≥ 22 có `WebSocket` toàn cục)**

Tạo `<scratchpad>/spike/client.mjs`:

```js
// Holds one socket through the frontend for HOLD_MINUTES, sending a message
// every 60 s and counting echoes; exits 0 only if the socket is still open.
const url = process.argv[2] ?? 'ws://localhost:3100/api/ws';
const holdMs = Number(process.env.HOLD_MINUTES ?? 10) * 60_000;
let echoes = 0;
const ws = new WebSocket(url);
ws.onopen = () => console.log(new Date().toISOString(), 'open');
ws.onmessage = (e) => { echoes++; console.log(new Date().toISOString(), 'message', e.data); };
ws.onclose = (e) => { console.log(new Date().toISOString(), 'close', e.code, e.reason); process.exit(2); };
ws.onerror = () => console.log(new Date().toISOString(), 'error');
const tick = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(`t${Date.now()}`), 60_000);
setTimeout(() => {
  clearInterval(tick);
  console.log('still open after', holdMs / 60_000, 'min; echoes =', echoes, 'state =', ws.readyState);
  process.exit(ws.readyState === WebSocket.OPEN && echoes >= holdMs / 60_000 - 1 ? 0 : 1);
}, holdMs);
```

- [ ] **Step 3: Dựng giống production**

```bash
cd /Users/linhsayshii/Documents/PetProject/502kara
SCRATCHPAD=<đường dẫn scratchpad của phiên, chứa thư mục spike/>
docker network create spike
# backend giả: alias "backend" đúng như API_PROXY_TARGET=http://backend:4000 của image frontend
docker run -d --rm --name spike-backend --network spike --network-alias backend \
  -v "$SCRATCHPAD/spike:/app" -w /app node:22-bookworm-slim \
  sh -c "npm init -y >/dev/null && npm i --silent ws@8 && node server.mjs"
# image frontend như docker-compose.yml (NEXT_PUBLIC_API_URL=/api, API_PROXY_TARGET=http://backend:4000)
docker compose build frontend
docker run -d --rm --name spike-frontend --network spike -p 3100:3000 \
  -e NODE_OPTIONS=--max-old-space-size=256 karaoke502-frontend
sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/   # 200
```

(Tên image do compose đặt: kiểm tra bằng `docker compose images frontend` nếu không phải `karaoke502-frontend`.)

- [ ] **Step 4: Chạy spike 10 phút**

```bash
HOLD_MINUTES=10 node "$SCRATCHPAD/spike/client.mjs" ws://localhost:3100/api/ws
docker logs spike-backend
```

Expected: client in `open`, cứ 60 s một `message echo:t…`, sau 10 phút `still open after 10 min; echoes = 9 hoặc 10`, exit 0; log server có `connection /api/ws x-forwarded-host= localhost:3100` và khoảng 20 dòng `pong`. Chạy thêm một lần ngắn `HOLD_MINUTES=1` với 3 client song song để chắc nhiều socket cùng đi qua.

Nếu client bị `close` (kể cả 1006) trước 10 phút: ghi lại thời điểm (30 s → proxyTimeout; ~2 phút → keep-alive) và kết luận "Next không giữ được"; phương án là luật `ingress` theo path trong cloudflared (Step 6 ghi cả hai nhánh).

- [ ] **Step 5: Dọn**

```bash
docker rm -f spike-frontend spike-backend; docker network rm spike
```

- [ ] **Step 6: Ghi tài liệu**

Trong `DEPLOYMENT.md` §3 (khối Nginx), sau `Chỉ cần một \`location /\`…` thêm:

```markdown
WebSocket (`/api/ws`, màn hình thu ngân/quản lý) đi qua cùng `location /` nhờ hai dòng `Upgrade`/`Connection` ở trên; server tự `ping` mỗi 30 giây nên không cần nâng `proxy_read_timeout` (mặc định 60 giây). Nếu đặt `proxy_read_timeout` thì phải **> 30 giây**.
```

Trong §3.2, thêm mục 7:

```markdown
7. **WebSocket** (`wss://<tên miền>/api/ws`): Cloudflare chuyển tiếp WebSocket mặc định (Network → WebSockets: On), và frontend chuyển tiếp request upgrade `/api/*` vào backend như request thường (đã chạy thử qua image production, giữ 10 phút với ping 30 giây). Sau khi triển khai, mở app bằng tài khoản thu ngân, trong DevTools → Network → WS phải thấy `/api/ws` trạng thái `101` và các khung `ping/pong` mỗi 30 giây. Nếu không có (`ws` bị đóng liên tục), thêm trong tunnel một Public Hostname thứ hai cùng tên miền với **Path** `api/ws` trỏ `HTTP` `localhost:4000` và mở `ports: - "127.0.0.1:4000:4000"` cho `backend` trong `docker-compose.yml`; ứng dụng vẫn chạy bằng polling trong lúc đó.
```

Sửa đoạn văn cho đúng kết quả Step 4 (nếu Next không giữ được: viết luật `ingress` là bắt buộc, không phải phương án dự phòng). Ghi `**Kết quả spike:** …` (một câu, ngày, số echo/pong) ngay dưới dòng này trong file kế hoạch.

**Kết quả spike:** _(điền sau Step 4)_

- [ ] **Step 7: Commit**

```bash
git add DEPLOYMENT.md docs/superpowers/plans/2026-09-30-websocket-phase-2.md
git commit -m "docs(deploy): kết quả chạy thử WebSocket qua Next standalone, bước kiểm tra sau triển khai

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Thư viện và `LiveRegistry` (bộ đăng ký socket có trần, thuần)

**Files:**
- Sửa: `502-backend/package.json` (qua `npm i`)
- Tạo: `502-backend/src/live/live-events.ts`
- Tạo: `502-backend/src/live/live-registry.ts`
- Test: `502-backend/src/live/live-registry.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // live-events.ts
  export type LiveEvent =
    | { type: 'room.changed'; branchId: number; roomId: number }
    | { type: 'order.changed'; branchId: number; orderId: number }
    | { type: 'discount.requested'; branchId: number; requestId: number }
    | { type: 'discount.decided'; branchId: number; orderId: number; requestId: number; status: DiscountRequestStatus };
  export interface LiveUser { id: number; role: Role; branchId: number | null }
  // live-registry.ts
  export const MAX_SOCKETS = 100; export const MAX_PER_USER = 5;
  export interface LiveEntry { user: LiveUser | null; exp: number | null; missedPongs: number; connectedAt: number }
  export class LiveRegistry<S extends object> {
    get size(): number;
    open(socket: S, now?: number): boolean;            // false when MAX_SOCKETS reached (not added)
    authenticate(socket: S, user: LiveUser, exp: number): 'ok' | 'too-many' | 'unknown';
    close(socket: S): void;
    entry(socket: S): LiveEntry | undefined;
    recipients(event: LiveEvent): S[];
    sockets(): Iterable<[S, LiveEntry]>;
  }
  ```

- [ ] **Step 1: Cài thư viện, kiểm tra dung lượng**

```bash
cd 502-backend
npm i @nestjs/websockets@^11 @nestjs/platform-ws@^11 ws@^8
npm i -D @types/ws
du -sh node_modules/@nestjs/websockets node_modules/@nestjs/platform-ws node_modules/ws
```

Expected: ba gói cộng lại dưới ~1,5 MB; `package.json` có `ws`, `@nestjs/websockets`, `@nestjs/platform-ws` trong `dependencies` và `@types/ws` trong `devDependencies`. Ghi ba con số vào commit message.

- [ ] **Step 2: Kiểu sự kiện**

Tạo `src/live/live-events.ts`:

```ts
import { DiscountRequestStatus, Role } from '@prisma/client';

// What a screen is told over the socket: only ids (spec §7). The screen then
// calls the REST API it already uses; nothing here is business data.
export type LiveEvent =
  | { type: 'room.changed'; branchId: number; roomId: number }
  | { type: 'order.changed'; branchId: number; orderId: number }
  | { type: 'discount.requested'; branchId: number; requestId: number }
  | {
      type: 'discount.decided';
      branchId: number;
      orderId: number;
      requestId: number;
      status: DiscountRequestStatus;
    };

// The part of the account a socket is registered under.
export interface LiveUser {
  id: number;
  role: Role;
  branchId: number | null;
}
```

- [ ] **Step 3: Test thất bại cho `LiveRegistry`**

Tạo `src/live/live-registry.spec.ts`:

```ts
import { Role } from '@prisma/client';
import { LiveRegistry, MAX_PER_USER, MAX_SOCKETS } from './live-registry';

const cashier = (id: number, branchId: number) => ({ id, role: Role.CASHIER, branchId });
const manager = (id: number, branchId: number) => ({ id, role: Role.BRANCH_MANAGER, branchId });
const chain = (id: number) => ({ id, role: Role.CHAIN_MANAGER, branchId: null });

describe('LiveRegistry', () => {
  // Distinct objects: Jest's toEqual on Sets compares members structurally,
  // so plain `{}`s would all look alike.
  let n = 0;
  const sock = () => ({ n: n++ });

  it('counts every open socket against the cap, authenticated or not', () => {
    const reg = new LiveRegistry<object>();
    const sockets = Array.from({ length: MAX_SOCKETS }, sock);
    for (const s of sockets) expect(reg.open(s)).toBe(true);
    expect(reg.size).toBe(MAX_SOCKETS);
    expect(reg.open(sock())).toBe(false);
    expect(reg.size).toBe(MAX_SOCKETS);
    reg.close(sockets[0]);
    expect(reg.open(sock())).toBe(true);
  });

  it('limits sockets per user and frees the slot on close', () => {
    const reg = new LiveRegistry<object>();
    const mine = Array.from({ length: MAX_PER_USER + 1 }, sock);
    for (const s of mine) reg.open(s);
    for (let i = 0; i < MAX_PER_USER; i++) {
      expect(reg.authenticate(mine[i], cashier(7, 1), 9e12)).toBe('ok');
    }
    expect(reg.authenticate(mine[MAX_PER_USER], cashier(7, 1), 9e12)).toBe('too-many');
    reg.close(mine[0]);
    expect(reg.authenticate(mine[MAX_PER_USER], cashier(7, 1), 9e12)).toBe('ok');
    expect(reg.authenticate(sock(), cashier(7, 1), 9e12)).toBe('unknown');
  });

  it('re-authenticating the same socket keeps one slot and updates exp', () => {
    const reg = new LiveRegistry<object>();
    const s = sock();
    reg.open(s);
    reg.authenticate(s, cashier(1, 1), 100);
    expect(reg.authenticate(s, cashier(1, 1), 200)).toBe('ok');
    expect(reg.entry(s)?.exp).toBe(200);
    // one user, one socket: the per-user count did not grow
    for (let i = 0; i < MAX_PER_USER - 1; i++) {
      const t = sock();
      reg.open(t);
      expect(reg.authenticate(t, cashier(1, 1), 100)).toBe('ok');
    }
  });

  it('routes room/order events to the branch and the chain managers only', () => {
    const reg = new LiveRegistry<object>();
    const [c1, m1, c2, ch, anon] = [sock(), sock(), sock(), sock(), sock()];
    for (const s of [c1, m1, c2, ch, anon]) reg.open(s);
    reg.authenticate(c1, cashier(1, 1), 9e12);
    reg.authenticate(m1, manager(2, 1), 9e12);
    reg.authenticate(c2, cashier(3, 2), 9e12);
    reg.authenticate(ch, chain(4), 9e12);
    const got = reg.recipients({ type: 'room.changed', branchId: 1, roomId: 5 });
    expect(new Set(got)).toEqual(new Set([c1, m1, ch]));
    expect(reg.recipients({ type: 'order.changed', branchId: 2, orderId: 9 })).toEqual(
      expect.arrayContaining([c2, ch]),
    );
    expect(reg.recipients({ type: 'order.changed', branchId: 2, orderId: 9 })).toHaveLength(2);
  });

  it('sends discount.requested to the branch managers and chain managers, decided to the whole branch', () => {
    const reg = new LiveRegistry<object>();
    const [c1, m1, m1b, m2, ch] = [sock(), sock(), sock(), sock(), sock()];
    for (const s of [c1, m1, m1b, m2, ch]) reg.open(s);
    reg.authenticate(c1, cashier(1, 1), 9e12);
    reg.authenticate(m1, manager(2, 1), 9e12);
    reg.authenticate(m1b, manager(5, 1), 9e12);
    reg.authenticate(m2, manager(3, 2), 9e12);
    reg.authenticate(ch, chain(4), 9e12);
    expect(new Set(reg.recipients({ type: 'discount.requested', branchId: 1, requestId: 1 }))).toEqual(
      new Set([m1, m1b, ch]),
    );
    expect(
      new Set(reg.recipients({ type: 'discount.decided', branchId: 1, orderId: 1, requestId: 1, status: 'APPROVED' })),
    ).toEqual(new Set([c1, m1, m1b, ch]));
  });

  it('forgets a closed socket everywhere', () => {
    const reg = new LiveRegistry<object>();
    const s = sock();
    reg.open(s);
    reg.authenticate(s, chain(1), 9e12);
    reg.close(s);
    expect(reg.size).toBe(0);
    expect(reg.entry(s)).toBeUndefined();
    expect(reg.recipients({ type: 'room.changed', branchId: 1, roomId: 1 })).toEqual([]);
    expect([...reg.sockets()]).toEqual([]);
    reg.close(s); // closing twice is harmless
  });
});
```

- [ ] **Step 4: Chạy test, thấy thất bại**

```bash
cd 502-backend && npx jest src/live/live-registry.spec.ts
```

Expected: FAIL — `Cannot find module './live-registry'`.

- [ ] **Step 5: Viết `LiveRegistry`**

Tạo `src/live/live-registry.ts`:

```ts
import { Role } from '@prisma/client';
import { LiveEvent, LiveUser } from './live-events';

// Bounds of the in-memory registry (spec §7, resource rules §1.5): the
// backend is one process, and a state that cannot grow past this fits in
// a few hundred KB whatever happens on the network.
export const MAX_SOCKETS = 100;
export const MAX_PER_USER = 5;

export interface LiveEntry {
  // null until the socket has sent a valid `auth` message.
  user: LiveUser | null;
  // Access-token expiry (unix seconds) of the last `auth`.
  exp: number | null;
  // Pings without a pong since the last one; the gateway closes at 2.
  missedPongs: number;
  connectedAt: number;
}

// Who holds a socket, by branch and for the chain managers, plus how many
// sockets each user has. Pure: the gateway feeds it sockets and reads back
// whom to send an event to. `S` is the socket type (ws.WebSocket; tests
// pass plain objects).
export class LiveRegistry<S extends object> {
  private readonly entries = new Map<S, LiveEntry>();
  private readonly byBranch = new Map<number, Set<S>>();
  private readonly chainManagers = new Set<S>();
  private readonly perUser = new Map<number, number>();

  get size() {
    return this.entries.size;
  }

  // Registers a new connection; false when the cap is reached (the caller
  // closes it with 1013).
  open(socket: S, now = Date.now()): boolean {
    if (this.entries.size >= MAX_SOCKETS) return false;
    this.entries.set(socket, {
      user: null,
      exp: null,
      missedPongs: 0,
      connectedAt: now,
    });
    return true;
  }

  // Binds the socket to its user (or renews its token). A user's sockets
  // are capped; a socket re-authenticating keeps its slot.
  authenticate(socket: S, user: LiveUser, exp: number): 'ok' | 'too-many' | 'unknown' {
    const entry = this.entries.get(socket);
    if (!entry) return 'unknown';
    if (entry.user?.id === user.id) {
      entry.exp = exp;
      entry.user = user;
      this.place(socket, user);
      return 'ok';
    }
    if (entry.user) this.unplace(socket, entry.user);
    if ((this.perUser.get(user.id) ?? 0) >= MAX_PER_USER) {
      entry.user = null;
      entry.exp = null;
      return 'too-many';
    }
    this.perUser.set(user.id, (this.perUser.get(user.id) ?? 0) + 1);
    entry.user = user;
    entry.exp = exp;
    this.place(socket, user);
    return 'ok';
  }

  close(socket: S) {
    const entry = this.entries.get(socket);
    if (!entry) return;
    if (entry.user) this.unplace(socket, entry.user);
    this.entries.delete(socket);
  }

  entry(socket: S) {
    return this.entries.get(socket);
  }

  sockets(): Iterable<[S, LiveEntry]> {
    return this.entries.entries();
  }

  // Spec §7: room/order and decided events reach the whole branch, a new
  // request only its managers; chain managers get everything.
  recipients(event: LiveEvent): S[] {
    const out = new Set<S>(this.chainManagers);
    const branch = this.byBranch.get(event.branchId);
    if (branch) {
      for (const socket of branch) {
        if (event.type !== 'discount.requested') {
          out.add(socket);
          continue;
        }
        if (this.entries.get(socket)?.user?.role === Role.BRANCH_MANAGER) out.add(socket);
      }
    }
    return [...out];
  }

  private place(socket: S, user: LiveUser) {
    if (user.role === Role.CHAIN_MANAGER) {
      this.chainManagers.add(socket);
      return;
    }
    if (user.branchId === null) return;
    let set = this.byBranch.get(user.branchId);
    if (!set) {
      set = new Set();
      this.byBranch.set(user.branchId, set);
    }
    set.add(socket);
  }

  private unplace(socket: S, user: LiveUser) {
    this.chainManagers.delete(socket);
    if (user.branchId !== null) {
      const set = this.byBranch.get(user.branchId);
      set?.delete(socket);
      if (set && set.size === 0) this.byBranch.delete(user.branchId);
    }
    const left = (this.perUser.get(user.id) ?? 1) - 1;
    if (left <= 0) this.perUser.delete(user.id);
    else this.perUser.set(user.id, left);
  }
}
```

Lưu ý test "re-authenticating the same socket": nhánh `entry.user?.id === user.id` không đụng `perUser`, nên đúng.

- [ ] **Step 6: Chạy test, thấy pass; lint**

```bash
cd 502-backend && npx jest src/live/live-registry.spec.ts && npm run lint
```

Expected: 6 passed; lint không lỗi.

- [ ] **Step 7: Commit**

```bash
cd 502-backend && git add package.json package-lock.json src/live/live-events.ts src/live/live-registry.ts src/live/live-registry.spec.ts
git commit -m "feat(live): bộ đăng ký socket có trần (100 socket, 5 mỗi user) và kiểu sự kiện

Thêm @nestjs/websockets, @nestjs/platform-ws, ws (<kích cỡ đo được>).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `LiveEventsService`, `LiveGateway`, `LiveModule`, `WsAdapter`

**Files:**
- Tạo: `502-backend/src/live/live-events.service.ts`
- Test: `502-backend/src/live/live-events.service.spec.ts`
- Tạo: `502-backend/src/live/live.gateway.ts`
- Tạo: `502-backend/src/live/live.module.ts`
- Sửa: `502-backend/src/app.setup.ts` (thêm `useWebSocketAdapter`), `502-backend/src/app.module.ts` (import `LiveModule`)

**Interfaces:**
- Consumes: `LiveRegistry`, `LiveEvent`, `LiveUser` (Task 2); `UsersService.findAuthUser(id)`; `JwtService.verify`; `SALES` từ `src/auth/roles.ts`; `jwtSecret()` từ `src/config/env.ts`.
- Produces:
  ```ts
  @Injectable() export class LiveEventsService {
    readonly registry: LiveRegistry<WebSocket>;
    emit(event: LiveEvent): void;            // never throws; skips sockets not OPEN
    roomChanged(branchId: number, roomId: number): void;
    orderChanged(branchId: number, orderId: number): void;
    discountRequested(branchId: number, requestId: number): void;
    discountDecided(branchId: number, orderId: number, requestId: number, status: DiscountRequestStatus): void;
  }
  ```
  `LiveModule` là `@Global()` và export `LiveEventsService`, nên `OrdersService`, `DiscountsService`, `PrSessionsService` chỉ cần thêm vào constructor (Task 4). Tin nhắn server → client: `{type:'ready', userId}` rồi các `LiveEvent` phẳng. Mã đóng: 1013 (trần), 4001 (auth không hợp lệ / quá 5 s), 4002 (token quá hạn 60 s), 1001 khi server tắt.

- [ ] **Step 1: Test thất bại cho `LiveEventsService`**

Tạo `src/live/live-events.service.spec.ts`:

```ts
import { Role } from '@prisma/client';
import { LiveEventsService } from './live-events.service';

// A stand-in for ws.WebSocket: only what the service touches.
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  send(data: string, cb?: (err?: Error) => void) {
    this.sent.push(data);
    cb?.();
  }
}

describe('LiveEventsService', () => {
  const setup = () => {
    const service = new LiveEventsService();
    const reg = service.registry;
    const c1 = new FakeSocket();
    const m1 = new FakeSocket();
    const c2 = new FakeSocket();
    for (const s of [c1, m1, c2]) reg.open(s as never);
    reg.authenticate(c1 as never, { id: 1, role: Role.CASHIER, branchId: 1 }, 9e12);
    reg.authenticate(m1 as never, { id: 2, role: Role.BRANCH_MANAGER, branchId: 1 }, 9e12);
    reg.authenticate(c2 as never, { id: 3, role: Role.CASHIER, branchId: 2 }, 9e12);
    return { service, c1, m1, c2 };
  };

  it('sends the flat JSON event to the recipients only', () => {
    const { service, c1, m1, c2 } = setup();
    service.orderChanged(1, 42);
    expect(c1.sent).toEqual(['{"type":"order.changed","branchId":1,"orderId":42}']);
    expect(m1.sent).toHaveLength(1);
    expect(c2.sent).toEqual([]);
  });

  it('skips sockets that are not open and never throws', () => {
    const { service, c1, m1 } = setup();
    c1.readyState = 3; // CLOSED
    m1.send = () => {
      throw new Error('boom');
    };
    expect(() => service.roomChanged(1, 7)).not.toThrow();
    expect(c1.sent).toEqual([]);
  });

  it('shapes the discount events as the spec lists them', () => {
    const { service, m1, c1 } = setup();
    service.discountRequested(1, 5);
    service.discountDecided(1, 42, 5, 'REJECTED');
    expect(m1.sent).toEqual([
      '{"type":"discount.requested","branchId":1,"requestId":5}',
      '{"type":"discount.decided","branchId":1,"orderId":42,"requestId":5,"status":"REJECTED"}',
    ]);
    expect(c1.sent).toEqual([
      '{"type":"discount.decided","branchId":1,"orderId":42,"requestId":5,"status":"REJECTED"}',
    ]);
  });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

```bash
cd 502-backend && npx jest src/live/live-events.service.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Viết `LiveEventsService`**

Tạo `src/live/live-events.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { DiscountRequestStatus } from '@prisma/client';
import { WebSocket } from 'ws';
import { LiveEvent } from './live-events';
import { LiveRegistry } from './live-registry';

// Tells the screens of a branch that something changed (spec §7). Callers
// emit AFTER their transaction has committed, never inside it: an event
// makes a screen call the REST API, and it must see the committed row.
// Sending is fire-and-forget; a failed send is logged, nothing is retried
// (the screen still polls).
@Injectable()
export class LiveEventsService {
  private readonly logger = new Logger(LiveEventsService.name);
  readonly registry = new LiveRegistry<WebSocket>();

  emit(event: LiveEvent) {
    const data = JSON.stringify(event);
    for (const socket of this.registry.recipients(event)) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(data, (err) => {
          if (err) this.logger.error(`send ${event.type}: ${err.message}`);
        });
      } catch (err) {
        this.logger.error(`send ${event.type}: ${(err as Error).message}`);
      }
    }
  }

  roomChanged(branchId: number, roomId: number) {
    this.emit({ type: 'room.changed', branchId, roomId });
  }

  orderChanged(branchId: number, orderId: number) {
    this.emit({ type: 'order.changed', branchId, orderId });
  }

  discountRequested(branchId: number, requestId: number) {
    this.emit({ type: 'discount.requested', branchId, requestId });
  }

  discountDecided(
    branchId: number,
    orderId: number,
    requestId: number,
    status: DiscountRequestStatus,
  ) {
    this.emit({ type: 'discount.decided', branchId, orderId, requestId, status });
  }
}
```

`FakeSocket.readyState = 1` khớp `WebSocket.OPEN` (= 1 trong `ws`).

- [ ] **Step 4: Chạy test, thấy pass**

```bash
cd 502-backend && npx jest src/live/live-events.service.spec.ts
```

Expected: 3 passed.

- [ ] **Step 5: Viết `LiveGateway`**

Tạo `src/live/live.gateway.ts`:

```ts
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { RawData, WebSocket } from 'ws';
import { SALES } from '../auth/roles';
import { UsersService } from '../users/users.service';
import { LiveEventsService } from './live-events.service';

// Close codes the client understands (see the frontend live-events-provider).
export const CLOSE_TOO_MANY = 1013; // ws "try again later"
export const CLOSE_AUTH = 4001; // no/invalid auth within AUTH_TIMEOUT_MS
export const CLOSE_EXPIRED = 4002; // token expired and not renewed
const CLOSE_GOING_AWAY = 1001;

export const AUTH_TIMEOUT_MS = 5_000;
export const HEARTBEAT_MS = 30_000;
// A token past its exp is tolerated this long: the screen's next poll gets a
// 401, refreshes, and re-sends `auth` (spec: close at token/session end).
export const EXPIRY_GRACE_MS = 60_000;
const MAX_MISSED_PONGS = 2;

interface AuthMessage {
  type: 'auth';
  token: string;
}

// Signal-only WebSocket at /api/ws for the cashier and manager screens
// (spec §7). A client has AUTH_TIMEOUT_MS to send {type:"auth", token}; the
// token is checked like JwtStrategy (signature, expiry, then the user is
// reloaded from the DB, active only), and only SALES roles stay. Every other
// message is ignored. Cloudflare drops silent connections after ~100 s, so
// the server pings every HEARTBEAT_MS and drops a socket after two silent
// pings. Nothing per message is logged.
@WebSocketGateway({ path: '/api/ws', maxPayload: 4096 })
export class LiveGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(LiveGateway.name);
  // The one periodic timer of the backend (resource rules §1.12 allow no
  // setInterval jobs): it belongs to the sockets, not to a schedule, and
  // stops with them.
  private heartbeat?: ReturnType<typeof setInterval>;
  private readonly authTimers = new WeakMap<WebSocket, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly events: LiveEventsService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  afterInit() {
    this.heartbeat = setInterval(() => this.tick(), HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    for (const [socket] of this.events.registry.sockets()) {
      socket.close(CLOSE_GOING_AWAY);
    }
  }

  handleConnection(socket: WebSocket) {
    if (!this.events.registry.open(socket)) {
      socket.close(CLOSE_TOO_MANY, 'Quá nhiều kết nối, thử lại sau');
      return;
    }
    this.authTimers.set(
      socket,
      setTimeout(() => socket.close(CLOSE_AUTH, 'Chưa xác thực'), AUTH_TIMEOUT_MS),
    );
    socket.on('message', (data: RawData) => void this.onMessage(socket, data));
    socket.on('pong', () => {
      const entry = this.events.registry.entry(socket);
      if (entry) entry.missedPongs = 0;
    });
    socket.on('error', (err) => this.logger.error(`socket: ${err.message}`));
  }

  handleDisconnect(socket: WebSocket) {
    clearTimeout(this.authTimers.get(socket));
    this.authTimers.delete(socket);
    this.events.registry.close(socket);
  }

  private async onMessage(socket: WebSocket, data: RawData) {
    const message = parseAuth(data);
    if (!message) return; // anything but `auth` is ignored (spec §7)
    let payload: { sub: number; exp: number };
    try {
      payload = this.jwt.verify<{ sub: number; exp: number }>(message.token);
    } catch {
      socket.close(CLOSE_AUTH, 'Phiên đăng nhập không hợp lệ');
      return;
    }
    const user = await this.users.findAuthUser(payload.sub);
    if (!user || !SALES.includes(user.role)) {
      socket.close(CLOSE_AUTH, 'Tài khoản không dùng được kênh này');
      return;
    }
    const result = this.events.registry.authenticate(
      socket,
      { id: user.id, role: user.role, branchId: user.branchId },
      payload.exp,
    );
    if (result === 'too-many') {
      socket.close(CLOSE_TOO_MANY, 'Tài khoản đang mở quá nhiều màn hình');
      return;
    }
    if (result === 'unknown') return; // closed meanwhile
    clearTimeout(this.authTimers.get(socket));
    this.authTimers.delete(socket);
    socket.send(JSON.stringify({ type: 'ready', userId: user.id }));
  }

  // Every HEARTBEAT_MS: ping everyone, drop the silent and the expired.
  private tick() {
    const now = Date.now();
    for (const [socket, entry] of this.events.registry.sockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (entry.exp !== null && entry.exp * 1000 + EXPIRY_GRACE_MS < now) {
        socket.close(CLOSE_EXPIRED, 'Phiên đăng nhập đã hết hạn');
        continue;
      }
      if (entry.missedPongs >= MAX_MISSED_PONGS) {
        socket.terminate();
        continue;
      }
      entry.missedPongs += 1;
      socket.ping();
    }
  }
}

// The only message a client may send. Anything else (bad JSON, other types,
// a token that is not a string) is dropped without a reply.
function parseAuth(data: RawData): AuthMessage | null {
  try {
    const text = Array.isArray(data) ? Buffer.concat(data).toString() : data.toString();
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === 'auth' &&
      typeof (parsed as { token?: unknown }).token === 'string'
    ) {
      return { type: 'auth', token: (parsed as { token: string }).token };
    }
  } catch {
    // not JSON
  }
  return null;
}
```

Ghi chú cho người làm: `socket.terminate()` phát `close` nên `handleDisconnect` dọn registry; `ws` tự trả `pong` khi nhận `ping`, và Node/trình duyệt cũng tự trả `pong` — không cần code phía máy khách. Nest's `WsAdapter` cũng lắng nghe `message` để tìm `@SubscribeMessage`; không có handler nào nên nó bỏ qua (không lỗi).

- [ ] **Step 6: `LiveModule` toàn cục; `WsAdapter`; đăng ký module**

Tạo `src/live/live.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { jwtSecret } from '../config/env';
import { LiveEventsService } from './live-events.service';
import { LiveGateway } from './live.gateway';

// Global: OrdersService, DiscountsService and PrSessionsService emit events
// without importing anything. The JwtModule here only verifies access
// tokens (same secret as AuthModule); it signs nothing.
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({ useFactory: () => ({ secret: jwtSecret() }) }),
  ],
  providers: [LiveEventsService, LiveGateway],
  exports: [LiveEventsService],
})
export class LiveModule {}
```

Kiểm tra `src/users/users.module.ts` có `exports: [UsersService]` (AuthModule đã dùng nên có).

Trong `src/app.setup.ts`, thêm import và một dòng trong `configureApp` (sau `app.useGlobalFilters(...)`, trước `return app`):

```ts
import { WsAdapter } from '@nestjs/platform-ws';
// …
  // WebSocket on the same HTTP server (src/live), plain `ws`, no socket.io.
  app.useWebSocketAdapter(new WsAdapter(app));
```

Trong `src/app.module.ts`: import `LiveModule` từ `./live/live.module` và thêm vào `imports` sau `DiscountsModule`.

- [ ] **Step 7: Build, lint, unit tests, khởi động thử và nối tay**

```bash
cd 502-backend && npm run build && npm run lint && npm test
```

Expected: build sạch, mọi unit test pass.

Khởi động backend dev (`npm run start:dev`, cần Postgres của `.env`) rồi từ một shell khác (Node ≥ 22):

```bash
node -e '
const ws = new WebSocket("ws://localhost:4000/api/ws");
ws.onopen = () => console.log("open (no auth; expect 4001 after 5 s)");
ws.onclose = (e) => { console.log("close", e.code, e.reason); process.exit(0); };
'
```

Expected: `close 4001 Chưa xác thực` sau ~5 giây. Rồi đăng nhập lấy token và gửi `auth`:

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'content-type: application/json' -d '{"username":"tn1_cs1","password":"12345678"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
node -e '
const ws = new WebSocket("ws://localhost:4000/api/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: process.argv[1] }));
ws.onmessage = (e) => { console.log("message", e.data); if (JSON.parse(e.data).type === "ready") setTimeout(() => process.exit(0), 500); };
ws.onclose = (e) => { console.log("close", e.code, e.reason); process.exit(1); };
' "$TOKEN"
```

Expected: `message {"type":"ready","userId":…}`. Dừng backend dev.

- [ ] **Step 8: Commit**

```bash
cd 502-backend && git add src/live src/app.setup.ts src/app.module.ts
git commit -m "feat(live): gateway WebSocket /api/ws — xác thực bằng tin nhắn đầu, heartbeat 30 s, phát sự kiện theo cơ sở

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Phát sự kiện sau commit từ Orders, Discounts, PR sessions

**Files:**
- Sửa: `502-backend/src/orders/orders.service.ts` (`create`, `update`, `checkout`, `cancel`, `lockTime`, `unlockTime`)
- Sửa: `502-backend/src/discounts/discounts.service.ts` (`adjust`, `decide`)
- Sửa: `502-backend/src/pr/pr-sessions.service.ts` (`add`, `end`, `update`, `remove`)

**Interfaces:**
- Consumes: `LiveEventsService` (Task 3), inject qua constructor (module toàn cục).
- Sự kiện theo thao tác (spec §7):
  - mở phòng (`create`): `room.changed` (+ `order.changed` không cần: trang phòng chưa mở).
  - sửa món (`update`): `order.changed`.
  - thanh toán (`checkout`), hủy phiên (`cancel`): `room.changed` **và** `order.changed` (trang phòng đang mở thấy phiên đóng và về sơ đồ).
  - chốt/mở khóa giờ: `room.changed` và `order.changed`.
  - `adjust` áp ngay (DIRECT): `order.changed`; tạo yêu cầu: `order.changed` + `discount.requested`.
  - `decide`: `discount.decided` + `order.changed` (khi APPROVED order đổi; các trạng thái khác trang phòng vẫn cần tải lại để bỏ "Chờ duyệt"); cả khi kết cục là `closed`/`stale` (yêu cầu thành EXPIRED đã commit) phát `discount.decided` với `status: 'EXPIRED'` rồi mới ném 409.
  - PR vào/ra/sửa/xóa: `order.changed`.
  - `voidPaid`, `editPaid`: không phát (hóa đơn đã đóng, không có màn hình sống).

- [ ] **Step 1: `OrdersService`**

Thêm `private live: LiveEventsService` vào constructor (`import { LiveEventsService } from '../live/live-events.service';`). Mẫu chung: tách kết quả transaction ra biến, phát, rồi trả. Ví dụ `create`:

```ts
  async create(user: AuthUser, dto: CreateOrderDto) {
    const order = await this.prisma.$transaction(async (tx) => {
      // … unchanged body …
    });
    // After commit: the room map of the branch shows the room busy.
    this.live.roomChanged(order.branchId, order.roomId);
    return order;
  }
```

Áp cùng mẫu (đổi chữ ký sang `async … {` khi hàm hiện trả thẳng `this.prisma.$transaction(...)`):
- `update`: `this.live.orderChanged(order.branchId, order.id);`
- `checkout` và `cancel`: `this.live.roomChanged(order.branchId, order.roomId); this.live.orderChanged(order.branchId, order.id);` (`roomId` có trên order; kiểm tra kiểu trả về của transaction là order có `roomId`, `branchId` — `orderDetailInclude` không dùng `select` nên có).
- `lockTime`, `unlockTime`: như `checkout`.

Comment một dòng ở lần đầu trong file: `// Live events go out only after $transaction resolved (spec §7).`

- [ ] **Step 2: `DiscountsService`**

Constructor thêm `private live: LiveEventsService`. `adjust`: transaction hiện trả `{ ...saved, branchManagers }`; sửa để nó cũng trả id yêu cầu vừa tạo:

```ts
      let branchManagers: number | undefined;
      let requestId: number | undefined;
      // …
      } else {
        // …
        const created = await tx.discountRequest.create({ data: { /* unchanged */ } });
        requestId = created.id;
        branchManagers = await tx.user.count({ /* unchanged */ });
      }
      const saved = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetailInclude });
      return { order: saved, branchManagers, requestId };
    });
    this.live.orderChanged(result.order.branchId, result.order.id);
    if (result.requestId !== undefined) {
      this.live.discountRequested(result.order.branchId, result.requestId);
    }
    return { ...result.order, branchManagers: result.branchManagers };
```

(giữ nguyên hình dạng phản hồi HTTP: order + `branchManagers`).

`decide`: transaction trả `'closed' | 'stale' | 'done'`; cần thêm `orderId`, `branchId` cho phát. Đổi các `return 'closed' as const` thành `return { outcome: 'closed' as const, orderId: request.orderId, branchId: request.branchId }` (tương tự `stale`, `done`), rồi sau transaction:

```ts
    const finalStatus =
      result.outcome === 'done' ? status : DiscountRequestStatus.EXPIRED;
    this.live.discountDecided(result.branchId, result.orderId, id, finalStatus);
    this.live.orderChanged(result.branchId, result.orderId);
    if (result.outcome === 'closed') throw new ConflictException(CLOSED_MESSAGE);
    if (result.outcome === 'stale') throw new ConflictException('Giảm giá của hóa đơn đã thay đổi, thu ngân cần gửi lại yêu cầu');
    return this.prisma.discountRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
```

Chỉ những nhánh `throw` **trước** khi transaction commit gì (not found, 403, đã quyết định → 409 `decidedMessage`) thì không phát: chúng ném bên trong transaction, nên code sau `$transaction` không chạy — đúng ý.

- [ ] **Step 3: `PrSessionsService`**

Constructor thêm `private live: LiveEventsService`. `add`, `end`, `update`, `remove` đều trả `this.detail(tx, order.id)` (order đầy đủ). Mẫu:

```ts
  async add(user: AuthUser, dto: AddPrSessionDto) {
    const order = await this.prisma.$transaction(async (tx) => { /* unchanged */ });
    this.live.orderChanged(order.branchId, order.id);
    return order;
  }
```

Kiểm tra kiểu trả về của `detail()` có `branchId` (dùng `orderDetailInclude` → có).

- [ ] **Step 4: Unit test hiện có, build, lint**

```bash
cd 502-backend && npm run build && npm run lint && npm test
```

Expected: pass. Nếu một unit test dựng `OrdersService`/`DiscountsService` bằng `new` thiếu tham số → thêm `{ roomChanged() {}, orderChanged() {}, discountRequested() {}, discountDecided() {} } as unknown as LiveEventsService`.

- [ ] **Step 5: Chạy e2e giai đoạn 1 để chắc không vỡ**

```bash
docker start kara502-pg
cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/approvals.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/pr.e2e-spec.ts
```

Expected: cả hai pass (Nest khởi tạo gateway trong `app.init()`, không cần cổng).

- [ ] **Step 6: Commit**

```bash
cd 502-backend && git add src/orders/orders.service.ts src/discounts/discounts.service.ts src/pr/pr-sessions.service.ts
git commit -m "feat(live): phát room.changed / order.changed / discount.* sau khi transaction commit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: E2E WebSocket (`test/live.e2e-spec.ts`)

**Files:**
- Tạo: `502-backend/test/live.e2e-spec.ts`
- Sửa: `CLAUDE.md` dòng `npm run test:e2e` (thêm `live` vào danh sách bộ e2e)

**Interfaces:**
- Consumes: gateway (Task 3), sự kiện (Task 4), seed `SEED_DEMO=1` (tài khoản `admin`, `ql1_cs1`, `tn1_cs1`, `pv1_cs1`, `ql1_cs2`, `tn1_cs2`; cs1 có 3 phòng), `WebSocket` toàn cục của Node ≥ 22.
- Ca kiểm (spec §11): nối không `auth` → đóng 4001; `STAFF` → đóng 4001; token sai → 4001; thu ngân cs1 không nhận sự kiện cs2; gửi yêu cầu → quản lý cs1 và admin nhận `discount.requested`, quản lý cs2 không; duyệt → thu ngân nhận `discount.decided` + `order.changed`; mở phòng → `room.changed`; đóng socket thì registry quên.

- [ ] **Step 1: Viết test**

Tạo `test/live.e2e-spec.ts`:

```ts
// test/live.e2e-spec.ts
import { execSync } from 'child_process';
import { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { LiveEventsService } from '../src/live/live-events.service';
import { AUTH_TIMEOUT_MS } from '../src/live/live.gateway';

// The signal channel of the cashier and manager screens (spec §7, §11): who
// may connect, who hears what. Uses Node's global WebSocket (Node ≥ 22).

type Json = Record<string, unknown>;

// One client socket with a queue of parsed messages.
class Client {
  readonly messages: Json[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: ((m: Json) => void)[] = [];
  readonly ws: WebSocket;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Json;
      const w = this.waiters.shift();
      if (w) w(m);
      else this.messages.push(m);
    };
    this.ws.onclose = (e) => (this.closed = { code: e.code, reason: e.reason });
  }
  opened() {
    return new Promise<void>((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('ws error'));
    });
  }
  auth(token: string) {
    this.ws.send(JSON.stringify({ type: 'auth', token }));
  }
  next(timeoutMs = 3000): Promise<Json> {
    const queued = this.messages.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('no message')), timeoutMs);
      this.waiters.push((m) => {
        clearTimeout(t);
        res(m);
      });
    });
  }
  // Every message that arrives within `ms`.
  async drain(ms = 500): Promise<Json[]> {
    await new Promise((r) => setTimeout(r, ms));
    return this.messages.splice(0);
  }
  waitClose(timeoutMs = AUTH_TIMEOUT_MS + 2000) {
    return new Promise<{ code: number; reason: string }>((res, rej) => {
      if (this.closed) return res(this.closed);
      const t = setTimeout(() => rej(new Error('not closed')), timeoutMs);
      this.ws.addEventListener('close', (e) => {
        clearTimeout(t);
        res({ code: e.code, reason: e.reason });
      });
    });
  }
  close() {
    this.ws.close(1000);
  }
}

describe('Live events (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  const tokens: Record<string, string> = {};
  let roomIds: number[] = [];
  const clients: Client[] = [];

  const api = () => request(app.getHttpServer());
  const as = (name: string) => {
    const auth = `Bearer ${tokens[name]}`;
    return {
      get: (u: string) => api().get(`/api${u}`).set('Authorization', auth),
      post: (u: string, body: Json = {}) => api().post(`/api${u}`).set('Authorization', auth).send(body),
    };
  };
  const login = async (username: string) => {
    const res = await api().post('/api/auth/login').send({ username, password: '12345678' }).expect(200);
    tokens[username] = (res.body as Json).access_token as string;
  };
  // Connects and authenticates as `name`, consuming the `ready` message.
  const connectAs = async (name: string) => {
    const c = new Client(url);
    clients.push(c);
    await c.opened();
    c.auth(tokens[name]);
    expect(await c.next()).toMatchObject({ type: 'ready' });
    return c;
  };

  beforeAll(async () => {
    execSync('npx prisma migrate reset --force --skip-generate', {
      env: { ...process.env, SEED_DEMO: '1' },
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    // A real port: the browser's WebSocket needs a listening server.
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `ws://127.0.0.1:${port}/api/ws`;
    for (const name of ['admin', 'ql1_cs1', 'tn1_cs1', 'pv1_cs1', 'ql1_cs2', 'tn1_cs2']) await login(name);
    const rooms = (await as('tn1_cs1').get('/rooms').expect(200)).body as Json[];
    roomIds = rooms.filter((r) => r.status === 'AVAILABLE').map((r) => r.id as number);
    expect(roomIds.length).toBeGreaterThanOrEqual(2);
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.close();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication', () => {
    it('closes a socket that sends no auth within the timeout', async () => {
      const c = new Client(url);
      clients.push(c);
      await c.opened();
      expect((await c.waitClose()).code).toBe(4001);
    });

    it('closes on a bad token', async () => {
      const c = new Client(url);
      clients.push(c);
      await c.opened();
      c.auth('not-a-token');
      expect((await c.waitClose(2000)).code).toBe(4001);
    });

    it('refuses floor staff (STAFF)', async () => {
      const c = new Client(url);
      clients.push(c);
      await c.opened();
      c.auth(tokens['pv1_cs1']);
      expect((await c.waitClose(2000)).code).toBe(4001);
    });

    it('ignores other messages and keeps the socket', async () => {
      const c = await connectAs('tn1_cs1');
      c.ws.send('not json');
      c.ws.send(JSON.stringify({ type: 'hello' }));
      expect(await c.drain(300)).toEqual([]);
      expect(c.closed).toBeNull();
    });

    it('forgets a closed socket', async () => {
      const live = app.get(LiveEventsService);
      const before = live.registry.size;
      const c = await connectAs('tn1_cs1');
      expect(live.registry.size).toBe(before + 1);
      c.close();
      await c.waitClose(2000);
      await new Promise((r) => setTimeout(r, 100));
      expect(live.registry.size).toBe(before);
    });
  });

  describe('routing', () => {
    let orderId: number;
    let requestId: number;

    it('room.changed reaches the branch and the chain manager, not another branch', async () => {
      const cs1 = await connectAs('tn1_cs1');
      const cs2 = await connectAs('tn1_cs2');
      const chain = await connectAs('admin');
      const order = (await as('tn1_cs1').post('/orders', { roomId: roomIds[0] }).expect(201)).body as Json;
      orderId = order.id as number;
      expect(await cs1.next()).toEqual({ type: 'room.changed', branchId: order.branchId, roomId: roomIds[0] });
      expect(await chain.next()).toMatchObject({ type: 'room.changed', roomId: roomIds[0] });
      expect(await cs2.drain()).toEqual([]);
    });

    it('order.changed on an item edit', async () => {
      const cs1 = await connectAs('tn1_cs1');
      const products = (await as('tn1_cs1').get('/products').expect(200)).body as Json[];
      await as('tn1_cs1')
        .patch(`/orders/${orderId}`, { items: [{ productId: products[0].id, quantity: 1 }] })
        .expect(200);
      expect(await cs1.next()).toMatchObject({ type: 'order.changed', orderId });
    });

    it('a cashier request reaches the branch managers and the chain manager only', async () => {
      const cashier = await connectAs('tn1_cs1');
      const ql1 = await connectAs('ql1_cs1');
      const ql2 = await connectAs('ql1_cs2');
      const chain = await connectAs('admin');
      const res = await as('tn1_cs1')
        .post(`/orders/${orderId}/adjustments`, { discountPercent: 10, note: 'khách quen' })
        .expect(201);
      const pending = ((res.body as Json).discountRequests as Json[])[0];
      requestId = pending.id as number;
      const forManager = await ql1.drain();
      expect(forManager).toEqual(
        expect.arrayContaining([
          { type: 'order.changed', branchId: expect.any(Number), orderId },
          { type: 'discount.requested', branchId: expect.any(Number), requestId },
        ]),
      );
      expect(await chain.drain()).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'discount.requested', requestId })]));
      // the cashier is told the order changed, but not about the request queue
      const forCashier = await cashier.drain();
      expect(forCashier).toEqual([expect.objectContaining({ type: 'order.changed', orderId })]);
      expect(await ql2.drain()).toEqual([]);
    });

    it('the decision reaches the cashier', async () => {
      const cashier = await connectAs('tn1_cs1');
      const ql2 = await connectAs('ql1_cs2');
      await as('ql1_cs1').post(`/discount-requests/${requestId}/approve`).expect(201);
      const got = await cashier.drain();
      expect(got).toEqual(
        expect.arrayContaining([
          { type: 'discount.decided', branchId: expect.any(Number), orderId, requestId, status: 'APPROVED' },
          expect.objectContaining({ type: 'order.changed', orderId }),
        ]),
      );
      expect(await ql2.drain()).toEqual([]);
    });

    it('checkout sends room.changed and order.changed', async () => {
      const cs1 = await connectAs('tn1_cs1');
      await as('tn1_cs1').post(`/orders/${orderId}/checkout`, { paymentMethod: 'CASH' }).expect(201);
      const got = await cs1.drain();
      expect(got.map((m) => m.type).sort()).toEqual(['order.changed', 'room.changed']);
    });
  });
});
```

Ghi chú: các mã HTTP (`201` cho POST của Nest) và hình dạng phản hồi `/adjustments` (order + `discountRequests` PENDING) đúng như `test/approvals.e2e-spec.ts` dùng; nếu một `expect` về mã lệch, sửa theo `approvals.e2e-spec.ts`, không sửa API. `as().patch` cần thêm vào helper `as` như trong `approvals.e2e-spec.ts` (thêm dòng `patch:`).

- [ ] **Step 2: Chạy, sửa cho pass**

```bash
docker start kara502-pg
cd 502-backend && npx jest --config ./test/jest-e2e.json --runInBand test/live.e2e-spec.ts
```

Expected: 10 passed. Nếu `WebSocket is not defined`: Node < 22 — dùng Node 22+ (`node -v`).

- [ ] **Step 3: Lint và cập nhật CLAUDE.md**

`npm run lint`. Trong `CLAUDE.md` mục Commands, sửa dòng `npm run test:e2e` thành `test/{foundation,reports,costing,board,pr,approvals,live}.e2e-spec.ts …`.

- [ ] **Step 4: Commit**

```bash
git add 502-backend/test/live.e2e-spec.ts CLAUDE.md
git commit -m "test(live): e2e kênh WebSocket — xác thực, vai trò, định tuyến theo cơ sở

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — kết nối dùng chung (`LiveEventsProvider`, hooks)

**Files:**
- Sửa: `502-frontend/src/lib/api.ts` (`getAccessToken`)
- Tạo: `502-frontend/src/lib/live-events.ts`
- Sửa: `502-frontend/src/lib/permissions.ts` (quyền `live`)
- Tạo: `502-frontend/src/components/live-events-provider.tsx`
- Tạo: `502-frontend/src/hooks/use-live-events.ts`
- Tạo: `502-frontend/src/hooks/use-coalesced.ts`
- Sửa: `502-frontend/src/components/layout/app-shell.tsx`
- Sửa: `502-frontend/next.config.ts` (`connect-src`)

**Interfaces:**
- Consumes: `onSessionChange` (api.ts), `useAuth().user`, `can()`.
- Produces:
  ```ts
  // lib/api.ts
  export const getAccessToken: () => string | null;
  // lib/live-events.ts
  export type LiveEvent = /* 4 server events */ | { type: "reconnected" };
  export function liveUrl(): string;
  // hooks/use-live-events.ts
  export function useLiveEvent(handler: (event: LiveEvent) => void): void;
  export function useLiveConnected(): boolean;           // true while the socket is ready (and up to 30 s after a drop)
  export function useLiveInterval(connectedMs: number, disconnectedMs: number): number;
  // hooks/use-coalesced.ts
  export function useCoalesced(fn: () => void, waitMs: number): () => void;
  ```

- [ ] **Step 1: `getAccessToken`**

Trong `lib/api.ts`, sau `getSessionExpiresAt`:

```ts
// The current access token (memory only), for the WebSocket's auth message.
export const getAccessToken = () => accessToken;
```

- [ ] **Step 2: Kiểu và URL**

Tạo `lib/live-events.ts`:

```ts
import type { DiscountRequestStatus } from "@/lib/types";

// Signals from the server (ids only; the screen then calls the REST API), plus
// one local signal: the socket came back after a drop, so a screen reloads
// once because it may have missed events.
export type LiveEvent =
  | { type: "room.changed"; branchId: number; roomId: number }
  | { type: "order.changed"; branchId: number; orderId: number }
  | { type: "discount.requested"; branchId: number; requestId: number }
  | { type: "discount.decided"; branchId: number; orderId: number; requestId: number; status: DiscountRequestStatus }
  | { type: "reconnected" };

// ws(s)://…/api/ws next to the REST base: same origin in production (/api),
// the backend's origin in development.
export function liveUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const url = new URL(`${base.replace(/\/$/, "")}/ws`, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
```

- [ ] **Step 3: Quyền `live`**

Trong `lib/permissions.ts`: thêm vào `Permission` dòng `| "live" // the WebSocket of the cashier/manager screens (sales roles)` và vào `MATRIX`: `live: [...MANAGERS, "CASHIER"],`.

- [ ] **Step 4: `useCoalesced`**

Tạo `hooks/use-coalesced.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef } from "react";

// Runs `fn` once, `waitMs` after the first call of a burst: several signals
// within the window (a checkout emits two, five cashiers open rooms at once)
// become one reload. The pending run is dropped on unmount.
export function useCoalesced(fn: () => void, waitMs: number): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, waitMs);
  }, [waitMs]);
}
```

- [ ] **Step 5: Provider**

Tạo `components/live-events-provider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getAccessToken, onSessionChange } from "@/lib/api";
import { type LiveEvent, liveUrl } from "@/lib/live-events";
import { can } from "@/lib/permissions";

type Listener = (event: LiveEvent) => void;

interface LiveContextValue {
  // True from the server's `ready` until DISCONNECT_GRACE_MS after a drop, so
  // polling does not flap between its two rhythms on a short hiccup.
  connected: boolean;
  subscribe: (listener: Listener) => () => void;
}

const LiveContext = createContext<LiveContextValue>({ connected: false, subscribe: () => () => {} });

const MAX_BACKOFF_MS = 30_000;
const DISCONNECT_GRACE_MS = 30_000;
// Server close codes (502-backend/src/live/live.gateway.ts).
const CLOSE_TOO_MANY = 1013;

// One WebSocket for the whole app (spec §7), opened for the sales roles only.
// It sends {type:"auth", token} on open and again whenever lib/api renews the
// token; reconnects with 1, 2, 4… s up to 30 s plus 0–1 s of jitter (30 s
// flat after a 1013); stays open while the tab is hidden; closes on logout
// or when the user loses the permission. Every message is handed to the
// subscribers; a `reconnected` signal follows a re-established connection.
export function LiveEventsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const enabled = can(user, "live");
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const subscribe = useRef((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }).current;

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let wasReady = false;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const dispatch = (event: LiveEvent) => listeners.current.forEach((l) => l(event));
    const sendAuth = (ws: WebSocket) => {
      const token = getAccessToken();
      if (token && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "auth", token }));
    };

    const connect = () => {
      const ws = new WebSocket(liveUrl());
      socket = ws;
      ws.onopen = () => sendAuth(ws);
      ws.onmessage = (e) => {
        let message: LiveEvent | { type: "ready" };
        try {
          message = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (message.type === "ready") {
          attempt = 0;
          clearTimeout(graceTimer);
          graceTimer = undefined; // so the next drop starts a new grace period
          setConnected(true);
          if (wasReady) dispatch({ type: "reconnected" });
          wasReady = true;
          return;
        }
        dispatch(message);
      };
      ws.onclose = (e) => {
        if (stopped) return;
        graceTimer ??= setTimeout(() => {
          graceTimer = undefined;
          setConnected(false);
        }, DISCONNECT_GRACE_MS);
        const base = e.code === CLOSE_TOO_MANY ? MAX_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = setTimeout(connect, base + Math.random() * 1000);
      };
      // onclose follows every error; nothing to do here.
      ws.onerror = () => {};
    };

    connect();
    // A renewed access token (refresh) re-authenticates the open socket; a
    // cleared one (logout) is handled by the effect cleanup via `enabled`.
    const offSession = onSessionChange(() => {
      if (socket) sendAuth(socket);
    });

    return () => {
      stopped = true;
      offSession();
      clearTimeout(reconnectTimer);
      clearTimeout(graceTimer);
      socket?.close(1000);
      setConnected(false);
    };
  }, [enabled]);

  return <LiveContext.Provider value={{ connected, subscribe }}>{children}</LiveContext.Provider>;
}

export function useLiveContext() {
  return useContext(LiveContext);
}
```

Chú ý: khi `attempt` = 0 lần nối lại đầu tiên chờ 1 s (2⁰ × 1000), rồi 2, 4, 8, 16, 30, 30…; sau `ready` reset về 0 — đúng spec.

- [ ] **Step 6: Hooks**

Tạo `hooks/use-live-events.ts`:

```ts
"use client";

import { useEffect, useEffectEvent } from "react";
import { useLiveContext } from "@/components/live-events-provider";
import type { LiveEvent } from "@/lib/live-events";

// Calls `handler` for every event of the shared socket while mounted. The
// handler always sees the latest props/state (useEffectEvent), so callers
// need no deps and no refs.
export function useLiveEvent(handler: (event: LiveEvent) => void) {
  const { subscribe } = useLiveContext();
  const onEvent = useEffectEvent(handler);
  useEffect(() => subscribe((event) => onEvent(event)), [subscribe]);
}

export function useLiveConnected() {
  return useLiveContext().connected;
}

// The polling rhythm of a screen: slow while the socket delivers the
// signals, the old rhythm otherwise (spec §7: 60 s connected).
export function useLiveInterval(connectedMs: number, disconnectedMs: number) {
  return useLiveConnected() ? connectedMs : disconnectedMs;
}
```

- [ ] **Step 7: Gắn vào `AppShell`, CSP**

Trong `components/layout/app-shell.tsx`: import `LiveEventsProvider` từ `@/components/live-events-provider` và bọc nội dung bên trong `SidebarProvider`:

```tsx
    <SidebarProvider …>
      <LiveEventsProvider>
        {!fullScreen && <AppSidebar variant="inset" />}
        <SidebarInset className="min-w-0">
          …
        </SidebarInset>
      </LiveEventsProvider>
    </SidebarProvider>
```

(`AppSidebar` gọi `usePendingDiscounts`, Task 7 sẽ cho nó dùng socket — nên sidebar phải nằm trong provider.)

Trong `next.config.ts`, thay dòng `connect-src`:

```ts
  `connect-src 'self'${apiOrigin() ? ` ${apiOrigin()} ${apiOrigin()!.replace(/^http/, 'ws')}` : ''}`,
```

và sửa comment phía trên: `// …and the WebSocket (/api/ws) of the same API origin.`

- [ ] **Step 8: Kiểm tra kiểu, lint, build**

```bash
cd 502-frontend && npx tsc --noEmit && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run build
```

Expected: sạch. Chưa có màn hình nào tiêu thụ, nhưng mở app (dev, backend dev đang chạy) bằng `tn1_cs1`: DevTools → Network → WS thấy `/api/ws` 101 và tin nhắn `{"type":"ready",…}`; đăng nhập `pv1_cs1`: không có kết nối WS. Tắt backend 20 s rồi bật lại: thấy nối lại (các lần thử 1 s, 2 s, 4 s…) và `ready` mới.

- [ ] **Step 9: Commit**

```bash
cd 502-frontend && git add src/lib/api.ts src/lib/live-events.ts src/lib/permissions.ts src/components/live-events-provider.tsx src/hooks/use-live-events.ts src/hooks/use-coalesced.ts src/components/layout/app-shell.tsx next.config.ts
git commit -m "feat(web): một WebSocket dùng chung cho vai trò bán hàng — xác thực, nối lại lùi dần, hook sự kiện

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — sơ đồ phòng, trang phòng, badge và hàng chờ nghe sự kiện

**Files:**
- Sửa: `502-frontend/src/app/[branch]/sales/rooms/page.tsx`
- Sửa: `502-frontend/src/app/[branch]/sales/rooms/[id]/page.tsx`
- Sửa: `502-frontend/src/hooks/use-pending-discounts.ts`
- Sửa: `502-frontend/src/components/discounts/pending-requests.tsx`

**Interfaces:**
- Consumes: `useLiveEvent`, `useLiveInterval`, `useCoalesced` (Task 6); `useAuth().branches` để đổi mã cơ sở trên URL thành `branchId`.

- [ ] **Step 1: Sơ đồ phòng**

Trong `app/[branch]/sales/rooms/page.tsx`: import `useLiveEvent, useLiveInterval` từ `@/hooks/use-live-events`, `useCoalesced` từ `@/hooks/use-coalesced`; lấy `branches` từ `useAuth()` (đã có `const { user } = useAuth();` → `const { user, branches } = useAuth();`). Thay dòng `usePolling(() => fetchData(false), 30_000);` bằng:

```tsx
  // Keep the map fresh when several cashiers work at the same time: every
  // 30 s, or every 60 s while the socket reports the branch's changes.
  usePolling(() => fetchData(false), useLiveInterval(60_000, 30_000));
  // The id of the branch on the URL (the chain manager may look at any).
  const branchId = branches.find((b) => b.code === branch)?.id;
  const refreshRooms = useCoalesced(() => fetchData(false), 1000);
  useLiveEvent((event) => {
    if (event.type === "reconnected") refreshRooms();
    else if (event.type === "room.changed" && event.branchId === branchId) refreshRooms();
  });
```

(`useLiveInterval` là hook: gọi ở cấp component như trên là hợp lệ vì nó nằm trong tham số của một hook gọi ở cấp component; nếu lint `react-hooks/rules-of-hooks` phàn nàn, tách `const roomsInterval = useLiveInterval(60_000, 30_000);` ra dòng trên.)

- [ ] **Step 2: Trang phòng**

Trong `app/[branch]/sales/rooms/[id]/page.tsx`: import như trên. Tách thân hàm poll hiện có thành `refreshOrder` và dùng cho cả poll và sự kiện:

```tsx
  // Pick up changes made on another device (and notice a closed session):
  // every 15 s, 60 s while the socket signals this order's changes.
  const activeOrderId = order?.id;
  const refreshOrder = useCallback(async () => {
    if (activeOrderId === undefined || pendingRef.current > 0) return;
    try {
      const res = await api.get<Order>(`/orders/${activeOrderId}`);
      if (pendingRef.current > 0) return;
      if (res.data.status !== "PENDING") {
        notify.success(`Phòng ${room?.name ?? ""} đã được đóng trên máy khác`);
        router.push(roomsPath);
        return;
      }
      if (res.data.updatedAt !== orderRef.current?.updatedAt) applyOrder(res.data);
    } catch {
      // Next tick retries; errors of user actions are reported where they happen.
    }
  }, [activeOrderId, room?.name, router, roomsPath, applyOrder, notify]);
  usePolling(refreshOrder, useLiveInterval(60_000, 15_000), activeOrderId !== undefined);
  const refreshSoon = useCoalesced(refreshOrder, 1000);
  useLiveEvent((event) => {
    if (event.type === "reconnected") refreshSoon();
    else if ((event.type === "order.changed" || event.type === "discount.decided") && event.orderId === activeOrderId) {
      refreshSoon();
    }
  });
```

Kiểm tra tên biến hiện có trong file (`pendingRef`, `orderRef`, `applyOrder`, `roomsPath`, `room`, `router`, `notify`) — giữ đúng như code hiện tại; toast kết cục duyệt vẫn do effect `pendingIdRef` hiện có làm khi order tải lại.

- [ ] **Step 3: Badge**

Trong `hooks/use-pending-discounts.ts`: import `useLiveEvent, useLiveInterval`; thay `usePolling(load, 15_000, enabled);` bằng:

```ts
  usePolling(load, useLiveInterval(60_000, 15_000), enabled);
  // A new or decided request reloads the count at once (the toast still
  // fires from the count growing, so it never fires twice).
  useLiveEvent((event) => {
    if (!enabled) return;
    if (event.type === "discount.requested" || event.type === "discount.decided" || event.type === "reconnected") load();
  });
```

Cập nhật comment đầu hook: `// Polled every 15 s (60 s while the socket is up) on managers' screens only; null for others.`

- [ ] **Step 4: Hàng chờ**

Trong `components/discounts/pending-requests.tsx`: thay `usePolling(reload, 15_000);` bằng:

```tsx
  usePolling(reload, useLiveInterval(60_000, 15_000));
  useLiveEvent((event) => {
    if (event.type === "discount.requested" || event.type === "discount.decided" || event.type === "reconnected") reload();
  });
```

- [ ] **Step 5: Kiểm tra kiểu, lint, build**

```bash
cd 502-frontend && npx tsc --noEmit && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run build
```

- [ ] **Step 6: Kiểm tra trong trình duyệt (preview, hai tài khoản)**

Dùng `.claude/launch.json` (`backend-preview` cổng 4100 trên DB `karaoke_test`, `frontend-preview` cổng 3002) với `preview_start`. Hai tab: `tn1_cs1` (thu ngân) và `ql1_cs1` (quản lý). Kiểm:
1. Thu ngân mở phòng → tab quản lý ở sơ đồ phòng đổi trong ~1 s (không chờ 30 s); Network cho thấy chỉ một `GET /rooms` cho một cụm sự kiện.
2. Thu ngân gửi giảm giá cần duyệt → badge quản lý tăng ngay, toast "Có yêu cầu giảm giá mới chờ duyệt" **một lần**; trang Duyệt giảm giá hiện thẻ ngay.
3. Quản lý duyệt → tab thu ngân ở trang phòng: tiền đổi và toast "Quản lý … đã duyệt giảm giá" trong ~1 s.
4. Với socket đang nối, Network cho thấy `/orders/:id` chỉ mỗi 60 s (không 15 s).
5. Dừng backend 40 s: `connected` về false sau 30 s → polling 15 s trở lại (thấy các request lỗi rồi thành công khi backend lên), socket nối lại, một lần tải lại nhờ `reconnected`.
6. Đăng xuất: socket đóng (mã 1000), không nối lại. Đăng nhập `pv1_cs1`: không có WS.
7. 375 px: không đổi giao diện (không có phần tử mới) — chỉ chụp trang phòng một lần để chắc.

Chụp màn hình bước 3 để báo cáo.

- [ ] **Step 7: Commit**

```bash
cd 502-frontend && git add "src/app/[branch]/sales/rooms/page.tsx" "src/app/[branch]/sales/rooms/[id]/page.tsx" src/hooks/use-pending-discounts.ts src/components/discounts/pending-requests.tsx
git commit -m "feat(web): sơ đồ phòng, trang phòng, badge và hàng chờ duyệt tải lại theo tín hiệu WebSocket; polling 60 s khi đang nối

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Đo tải với 20 socket mở suốt bài đo

**Files:**
- Sửa: `502-backend/test/load/bench.mjs`
- Sửa: `docs/resource-rules.md` §6 (kết quả)

**Interfaces:**
- Consumes: gateway; `BASE` của bench (`http://localhost:14100/api` → `ws://localhost:14100/api/ws`).
- Produces: biến môi trường `SOCKETS=1`: mỗi thu ngân (10) và mỗi màn hình quản lý (5) + 5 màn hình quản lý hệ thống giữ một socket, đếm sự kiện nhận và số lần đóng; các dòng `ws events`, `ws closes` trong `report()`.

- [ ] **Step 1: Thêm socket vào bench**

Trong `bench.mjs`, sau `const BASE = …`:

```js
// SOCKETS=1: cashiers and manager screens hold a WebSocket for the whole run,
// as the app does; events received and unexpected closes are counted.
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const wsStats = { opened: 0, ready: 0, events: 0, closes: 0 };
function holdSocket(token, stop) {
  if (!process.env.SOCKETS) return Promise.resolve();
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    wsStats.opened++;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (e) => (JSON.parse(e.data).type === 'ready' ? wsStats.ready++ : wsStats.events++);
    ws.onclose = () => { if (!stop.done) wsStats.closes++; resolve(); };
    ws.onerror = () => {};
    const check = setInterval(() => { if (stop.done) { clearInterval(check); ws.close(1000); } }, 500);
  });
}
```

Trong `report()` thêm cuối: `if (process.env.SOCKETS) console.log('ws', wsStats);`.

Trong nhánh `else` (mode load): sau khi tạo `manager` cho mỗi cơ sở thêm `screens.push(holdSocket(manager, stop));`; sau mỗi `const token = await login(\`load_tn${k}_cs${b}\`);` thêm `cashiers.push(holdSocket(token, stop));`; sau vòng cơ sở thêm `for (let i = 0; i < 5; i++) screens.push(holdSocket(admin, stop));` (5 màn hình quản lý hệ thống — cùng một user, dưới trần 5/user). Tổng 20 socket.

- [ ] **Step 2: Dựng và đo theo `docs/resource-rules.md` §6**

Database `kara-load-pg` + dữ liệu `generate.sql` (nếu container còn từ lần đo 30/09, dùng lại). Build backend của nhánh thành `kara-load-backend`, chạy `kara-load-be` 1 CPU / 512 MB như §6. Chạy xen kẽ, mỗi kịch bản ≥ 3 lần:

```bash
cd 502-backend
node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2                # (a) không socket
SOCKETS=1 node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2      # (b) 20 socket
SOCKETS=1 DURATION=60 node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2
docker stats --no-stream kara-load-be kara-load-pg   # trong lúc chạy (b), ghi RAM cao nhất
docker logs kara-load-be 2>&1 | grep -ci error
```

Expected: `ws {opened: 20, ready: 20, events: >0, closes: 0}`; thanh toán p95 của (b) không cao hơn (a) quá độ lệch giữa các lần chạy của (a) (tham chiếu 30/09: trung vị 283 ms, 269–760); RAM backend cao nhất tăng < 10 MiB so với (a); 0 lỗi 5xx; log backend không có `error` mới. Nếu `closes > 0`: xem log backend (`send …`, `socket: …`) và sửa trước khi ghi kết quả.

Đường đi qua proxy Next (tuỳ chọn, khuyến nghị một lần): chạy image frontend trong cùng mạng Docker với alias `backend` như §6 mô tả, `BASE=http://localhost:<cổng frontend>/api SOCKETS=1 …`, xác nhận `ready: 20`.

- [ ] **Step 3: Ghi kết quả**

Cuối §6 của `docs/resource-rules.md` thêm đoạn "Kết quả <ngày> (WebSocket, giai đoạn 2)": lệnh chạy, bảng (a)/(b) với thanh toán p95 (trung vị; min–max), sơ đồ phòng p95, RAM backend/db cao nhất, `ws` stats, lỗi; một câu kết luận. Dọn container theo §6 khi xong (`docker rm -f -v kara-load-be`; giữ `kara-load-pg` nếu còn dùng).

- [ ] **Step 4: Commit**

```bash
git add 502-backend/test/load/bench.mjs docs/resource-rules.md
git commit -m "test(load): 20 socket WebSocket mở suốt bài đo; ghi kết quả đo giai đoạn 2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Tài liệu — CLAUDE.md, resource-rules, security-review, DEPLOYMENT §6.17

**Files:**
- Sửa: `CLAUDE.md` (Backend architecture: mục **Live events**; Frontend architecture: `LiveEventsProvider`, chu kỳ polling; Environment/Docker không đổi)
- Sửa: `docs/resource-rules.md` §1 (quy tắc 15), §2.3 (chu kỳ theo socket)
- Sửa: `docs/security-review.md` §1 và §4
- Sửa: `DEPLOYMENT.md` §6.17
- Sửa: `502-backend/README.md` nếu nó liệt kê module (kiểm tra bằng `grep -n discounts 502-backend/README.md`)

- [ ] **Step 1: CLAUDE.md**

Trong "Backend architecture", sau mục Orders / billing (trước **Số hóa đơn**) thêm:

```markdown
- **Live events** (`src/live`, `LiveModule` global): a signal-only WebSocket at `/api/ws` on the same HTTP server (`@nestjs/platform-ws`, `WsAdapter` set in `configureApp`), for the cashier and manager screens; floor staff keep polling. A client sends `{type:"auth", token}` within 5 s (never the token on the URL); `LiveGateway` verifies it like `JwtStrategy` (signature, expiry, user reloaded from the DB, `SALES` roles only), answers `{type:"ready"}`, pings every 30 s (Cloudflare drops silent connections at ~100 s) and closes after two missed pongs, when the token is 60 s past its expiry without a new `auth` (4002), on a bad auth (4001) or over capacity (1013: `LiveRegistry` caps 100 sockets and 5 per user). Events carry ids only: `room.changed {branchId, roomId}` and `order.changed {branchId, orderId}` go to the branch's sockets, `discount.requested {branchId, requestId}` to the branch's managers, `discount.decided {branchId, orderId, requestId, status}` to the branch; chain managers get everything. Services call `LiveEventsService.roomChanged/orderChanged/discountRequested/discountDecided` **after** `$transaction` resolved, never inside it (`OrdersService` create/update/checkout/cancel/lockTime/unlockTime, `DiscountsService` adjust/decide — also `EXPIRED` from a stale decision —, `PrSessionsService` add/end/update/remove). Nothing per message is logged. e2e: `test/live.e2e-spec.ts`.
```

Trong "Frontend architecture", sau mục về `hooks/use-polling.ts` (mục "All pages are client components…") thêm câu vào mục đó hoặc mục mới:

```markdown
- **Live events**: `components/live-events-provider.tsx` (mounted in `AppShell`, sales roles only — permission `live`) holds the one WebSocket (`lib/live-events.ts` `liveUrl()`: `/api/ws` next to `NEXT_PUBLIC_API_URL`, `wss:` on https), sends `auth` on open and on every `onSessionChange`, reconnects with 1, 2, 4… ≤ 30 s + jitter (30 s flat after 1013), keeps the socket while the tab is hidden and closes it on logout. `hooks/use-live-events.ts`: `useLiveEvent(handler)`, `useLiveConnected()` (true from `ready` until 30 s after a drop), `useLiveInterval(connectedMs, disconnectedMs)`; `hooks/use-coalesced.ts` merges a burst of signals into one reload. Consumers: the room map (`room.changed` of the URL's branch → `/rooms`, 60 s / 30 s), the room page (`order.changed`/`discount.decided` of its order → `/orders/:id`, 60 s / 15 s), the badge and the queue (`discount.requested`/`discount.decided`, 60 s / 15 s); the provider's local `reconnected` event makes each reload once after a gap. The socket only signals: every screen still works on polling alone.
```

Sửa mục `hooks/use-polling.ts` hiện có ("the room map refreshes rooms every 30 s… the room page its order every 15 s") thành "…(60 s while the live socket is up, see Live events)". Sửa mục **Duyệt giảm giá** ("polled every 15 s") tương tự.

- [ ] **Step 2: resource-rules.md**

§1 thêm quy tắc 15:

```markdown
15. **WebSocket chỉ báo tín hiệu, có trần, phát sau commit** (`src/live`). Tin nhắn chỉ mang id (vài chục byte), máy nhận gọi lại REST; không bao giờ gửi dữ liệu nghiệp vụ qua socket. Bộ đăng ký trong RAM (`LiveRegistry`) tối đa 100 socket và 5 socket mỗi tài khoản, dọn khi socket đóng; `maxPayload` 4 KB; không log từng tin nhắn. Sự kiện phát **sau khi** `$transaction` trả về. Heartbeat 30 giây là `setInterval` duy nhất của backend (ngoại lệ của quy tắc 12: nó thuộc về các socket và dừng cùng chúng). Thư viện `@nestjs/websockets`, `@nestjs/platform-ws`, `ws` ở `dependencies`.
```

§2.3 sửa: "…sơ đồ phòng tải lại danh sách phòng mỗi 30 giây (60 giây khi socket đang nối, `useLiveInterval`), trang phòng 15 giây (60 giây khi nối), badge Duyệt giảm giá 15 giây (60 giây khi nối) — chu kỳ chậm chỉ khi socket đã `ready`, và trở lại chu kỳ cũ 30 giây sau khi mất socket."

- [ ] **Step 3: security-review.md**

§1 thêm gạch đầu dòng: "WebSocket `/api/ws`: token gửi trong tin nhắn đầu, không trên URL (không vào log proxy); kiểm tra chữ ký, hạn, nạp lại user (active) như REST; chỉ vai trò bán hàng; trần 100 socket / 5 mỗi user; tin nhắn chỉ có id nên nghe lén không lộ dữ liệu nghiệp vụ; CSP `connect-src 'self'` bao `wss://` cùng origin."

§4 thêm rủi ro: "Socket đã xác thực không thấy ngay việc khóa tài khoản hay đổi mật khẩu: nó chỉ kiểm tra lại khi máy khách gửi `auth` mới (mỗi 15 phút theo access token) và bị đóng 60 giây sau khi token hết hạn; trong khoảng đó tài khoản bị khóa vẫn nhận được tín hiệu `id đã đổi` (không có dữ liệu). Chấp nhận được; muốn chặt hơn thì `UsersService.lock/updatePassword` gọi `LiveEventsService` đóng các socket của user đó."

- [ ] **Step 4: DEPLOYMENT.md §6.17**

Sau §6.16 thêm:

```markdown
### 6.17. Cập nhật tức thời cho màn hình thu ngân và quản lý (WebSocket, không có migration)

- Màn hình thu ngân và quản lý mở một kết nối WebSocket tới `/api/ws` (cùng tên miền) để biết ngay khi phòng, hóa đơn hay yêu cầu giảm giá đổi; điện thoại nhân viên không dùng. Không có kết nối này app vẫn chạy như trước (tự tải lại định kỳ), chỉ chậm hơn vài chục giây.
- Không cần đổi `.env` hay `docker-compose.yml`. Kiểm tra sau khi cập nhật theo [mục 3.2](#32-cloudflare-tunnel-không-dùng-nginx) điểm 7 (Cloudflare) hoặc [mục 3](#3-tên-miền-nginx-và-https) (Nginx: hai dòng `Upgrade`/`Connection` đã có trong mẫu cấu hình).
```

- [ ] **Step 5: Đọc lại checklist §5 của resource-rules.md và tick**

Trong phần trả lời cuối cùng, liệt kê từng mục §5 với kết luận (take/select: không có truy vấn mới; tổng: không; index: không có truy vấn mới; report pool: không; Map có trần: `LiveRegistry` 100/5; polling: `usePolling` + `useLiveInterval`, timer/listener dọn trong cleanup; thư viện: 3 gói runtime ở `dependencies`, kích cỡ đo ở Task 2; log: chỉ lỗi; đo tải: Task 8).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/resource-rules.md docs/security-review.md DEPLOYMENT.md 502-backend/README.md
git commit -m "docs: WebSocket giai đoạn 2 — kiến trúc, quy tắc tài nguyên, bảo mật, triển khai

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review (đã chạy khi viết)

- **Spec coverage §7**: gateway `/api/ws` cùng server (T3); auth tin nhắn đầu 5 s, không trên URL, kiểm tra như `JwtStrategy`, chỉ `SALES`, active (T3); gửi lại auth sau refresh (T6 `onSessionChange`); đóng khi token hết hạn/phiên hết (T3 tick + grace 60 s, quyết định 3); registry có trần 100 / 5 mỗi user, đóng 1013, dọn khi đóng (T2); heartbeat 30 s, 2 pong lỡ (T3); phát sau commit (T4); không log từng tin nhắn (T3); chỉ nhận `auth`, `maxPayload` 4 KB (T3); frontend một kết nối trong app-shell, chỉ vai trò bán hàng (T6); backoff 1,2,4…30 + jitter (T6); giữ khi tab ẩn (T6 — không lắng nghe visibilitychange); polling 60 s khi nối, cũ khi mất > 30 s (T6 grace + T7); đóng khi đăng xuất (T6 `enabled` → cleanup). Bốn sự kiện và người nhận (T2 `recipients`, T4). Spike (T1). §10: thư viện ở dependencies + kích cỡ (T2), quy tắc mới trong resource-rules (T9), bench 20 socket (T8). §11 e2e WebSocket (T5). Tài liệu (T1, T9).
- **Điểm lệch spec, cố ý**: toast "Có yêu cầu giảm giá mới – phòng …" giữ dạng hiện có không tên phòng (quyết định 6); thêm tin nhắn `ready` và mã 4001/4002 (quyết định 1–2); `discount.decided` cũng phát với `EXPIRED` từ `decide` (mở rộng, cùng người nhận).
- **Kiểu nhất quán**: `LiveEventsService.roomChanged(branchId, roomId)`, `orderChanged(branchId, orderId)`, `discountRequested(branchId, requestId)`, `discountDecided(branchId, orderId, requestId, status)` dùng ở T3/T4/T5; `LiveRegistry.open/authenticate/close/entry/recipients/sockets/size` ở T2/T3/T5; frontend `useLiveEvent/useLiveConnected/useLiveInterval/useCoalesced/liveUrl/getAccessToken` ở T6/T7; mã đóng 1013/4001/4002 ở T3/T5/T6.
