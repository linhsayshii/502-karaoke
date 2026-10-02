---
name: verify
description: How to run Karaoke 502 locally (backend, fake Minvoice, frontend, both the main site and the report site) and drive it in a real browser to verify a change. Use when asked to verify, run or screenshot the app.
---

# Verify Karaoke 502 by running it

Everything runs against the throwaway database `karaoke_test` (Docker container
`kara502-pg`, `localhost:5433`). Never another database, and not while another
session runs e2e on it (each e2e run resets it).

## Launch

Start each as a background command **with a long timeout** (the default
30-minute limit of background commands kills the servers mid-run):

```bash
docker start kara502-pg

# backend, port 4100
cd 502-backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/karaoke_test \
  PORT=4100 TZ=Asia/Ho_Chi_Minh CORS_ORIGINS=http://localhost:3003 \
  MINVOICE_URL_TEMPLATE='http://127.0.0.1:4555/{taxCode}' \
  node -r ts-node/register src/main.ts

# fake Minvoice, port 4555 (prints its password; any username; state is in memory)
cd 502-backend && npx ts-node test/fake-minvoice.ts 4555

# one frontend serves both sites, port 3003
NEXT_PUBLIC_API_URL=/api API_PROXY_TARGET=http://localhost:4100 \
  npm --prefix 502-frontend run dev -- --port 3003
```

- Main site: `http://localhost:3003`. Report site: `http://baocao.localhost:3003`
  (the host name decides; logins are separate per host).
- Accounts: those of `prisma/seed.ts` (`admin`, `ql1_cs1`, `tn1_cs1`, …) with the
  seed's default password. If the database is empty, in `502-backend` with the
  same `DATABASE_URL`: `node_modules/.bin/prisma migrate deploy`, then
  `SEED_DEMO=1 npx prisma db seed` (see `502-backend/README.md`).
- Ready when `curl localhost:4100/api/auth/me` answers 401 and `localhost:3003` 200.

## Drive

Use the Chrome extension tools when a browser is connected. Otherwise
`drive.mjs` (next to this file) drives the installed Chrome headless over the
DevTools Protocol, with no dependency:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9333 --user-data-dir="$TMPDIR/kara502-chrome" \
  --no-first-run --disable-extensions --window-size=1440,900 about:blank   # background

node .claude/skills/verify/drive.mjs cashier <<'EOF'
await p.goto("http://localhost:3003/");
await p.fill('css=input[placeholder="Nhập tên đăng nhập"]', "tn1_cs1");
await p.fill('css=input[placeholder="Nhập mật khẩu"]', PASSWORD);
await p.click("css=button[type=submit]", { settle: 2500 });
await p.click("Quản lý bán hàng", { settle: 2000 });
console.log(await p.text("main"), p.net("orders"), await p.shot("bills"));
EOF
```

Each session name (`cashier`, `report`, …) is its own browser context, so two
accounts can stay signed in at once. `p.click`/`p.fill` take visible text or
`css=…`; `p.net()` lists the `/api` calls with their status, `p.body(filter)`
a response body, `p.errors()` console errors, `p.viewport(390, 844, true)` a phone.

## Flows worth driving

- Cashier, main site: Quản lý bán hàng (`/<branch>/sales/statistics/bills`) → a
  paid bill → **Thêm hóa đơn vào báo cáo**; Hóa đơn điện tử → **+** on a bill.
- Report site (chain manager, or an account with Vào trang báo cáo): Quản lý bán
  hàng (`/<branch>/sales/bills`), Hóa đơn điện tử, Doanh thu / Phòng / Hàng hóa;
  **Thêm hóa đơn** makes a bill thêm tay.
- Issuing: set the branch's MST on the main site's Cơ sở page, log in to the fake
  Minvoice on the Hóa đơn điện tử page, pick the symbol, **Xuất**.
- Compare both sites after each step: the main site counts bills, the report
  site only e-invoices.

## Gotchas

- `next dev` appends a "nextjs-agent-rules" block to `502-frontend/CLAUDE.md`;
  `git checkout -- 502-frontend/CLAUDE.md` after stopping it.
- Headless Chrome saves no downloads: to check an Excel export, hook
  `URL.createObjectURL` in the page and read the blob back.
- Text on buttons holds non-breaking spaces before `₫`; match a prefix
  (`"Thanh toán ·"`) rather than the amount.
- Restarting the fake Minvoice resets its invoice numbers (1001…), which then
  clash with rows issued before the restart.
- A migration is checked on a scratch copy, never on `karaoke_test` itself:
  `pg_dump karaoke_test | psql <scratch>`, revert the migration by hand there,
  then `DATABASE_URL=…/<scratch> node_modules/.bin/prisma migrate deploy`.
