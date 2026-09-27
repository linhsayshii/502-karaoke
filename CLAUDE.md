# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product direction

Karaoke 502 is a management system for a **chain of karaoke venues/restaurants** (branches `cs1`–`cs4`, "Cơ sở 1–4"). The target scope is:
- **Sales (Bán hàng)**: room sessions, ordering food/drinks into a room, checkout/billing per branch.
- **Inventory (Kho)**: stock import (nhập kho) and export (xuất kho), stock levels.
- **Accounting (Kế toán)**: revenue/bill/staff statistics, cash fund (quỹ thu/chi), and accounting reports generated inside the system.

**Accounts and permissions** — every person is a `User` (there is no separate employee table); the role grants rights on top of that. Every account except the chain manager belongs to exactly one branch and can only act within it:
- `CHAIN_MANAGER` — Quản lý hệ thống: all branches; catalog, inventory, reports, funds, accounts (including branch managers) and branches.
- `BRANCH_MANAGER` — Quản lý cơ sở: the same, but only their own branch, and only manages `CASHIER`/`STAFF` accounts.
- `CASHIER` — Thu ngân: own branch, cashier work only (open rooms, order, checkout). No inventory, reports, funds, catalog or accounts.
- `STAFF` — Nhân viên: read-only view of the rooms whose open session they serve (as CSKH or phục vụ).

`User.position` (`CSKH` | `SERVER`) is independent of the role: it marks who can be assigned to a room session. Floor staff may have no password (`password` is nullable) and then cannot log in.

Implemented: the four roles, branch scoping, per-branch catalog, sales flow, stock ledger with phiếu nhập/xuất, a fund (sổ quỹ) linked to sales and imports with opening/closing balances, cancelling/voiding of bills and documents with full reversal, revenue per business day, Excel import (with column mapping) of products, categories, rooms, staff and phiếu nhập kho. Not yet: accounting reports beyond that (staff statistics, P&L, exports).

UI text and user-facing error messages are in Vietnamese; keep new strings in Vietnamese.

## Repository layout

A single git repo at the root (`origin` = `https://github.com/linhsayshii/502-karaoke.git`, branch `main`) holding two independent npm projects, no workspace tooling at the root:
- `502-backend/` — NestJS 11 + Prisma 5.22 + PostgreSQL.
- `502-frontend/` — Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn/ui (new-york style, lucide icons).
- Docs (Vietnamese): root `README.md` (overview + quick start), root `DEPLOYMENT.md` (the only deployment guide: Docker install, Nginx/HTTPS, updates, backup/restore, migrating the legacy PM2 server incl. the one-time `foundation` upgrade, troubleshooting), `502-backend/README.md` and `502-frontend/README.md` (local development only). Keep deployment steps in `DEPLOYMENT.md`, not in the per-project READMEs.
- Root `src/app/[branch]/` is an empty leftover directory; ignore it.

## Commands

Backend (`cd 502-backend`):
```bash
npm run start:dev          # watch mode, listens on PORT (default 4000), 0.0.0.0
npm run build              # output in dist/src/main.js (prisma/seed.ts is inside the TS root)
npm run start:prod         # node dist/src/main
npm run lint               # eslint --fix
npm test                   # unit tests (*.spec.ts under src/)
npx jest src/orders/billing.spec.ts   # single test file
npx jest -t "test name"               # single test by name
npm run test:e2e           # test/foundation.e2e-spec.ts; resets the DB in test/e2e.env (karaoke_test)
npx prisma migrate dev --name <name>  # after editing prisma/schema.prisma
npx prisma migrate deploy             # production
npx prisma db seed         # branches cs1–cs4 + admin (CHAIN_MANAGER), ql1_cs1, tn1_cs1, pv1_cs1, password 12345678; SEED_DEMO=1 adds cskh1_cs1, ql1_cs2, tn1_cs2, pv1_cs2 (same password), rooms and products for cs1/cs2
```
Migrations: `0_init` is the baseline of the legacy `db push` schema; `20260926000000_foundation` is hand-written and migrates legacy rows (see root `DEPLOYMENT.md` §6); `20260926120000_linked_flows` adds the price snapshot, payment methods, fund links and cancel fields (§6.6). `test/fixtures/legacy-data.sql` is legacy-shaped data for rehearsing them. Don't use `prisma db push` any more. `prisma migrate dev` needs a TTY; elsewhere write the SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <db> --script`.

Prisma reads `502-backend/.env` itself (before Nest's ConfigModule), so to run against another database pass `DATABASE_URL=... npm run start:dev` in the shell.

Frontend (`cd 502-frontend`):
```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
```
There are no frontend tests.

Docker (root, see `DEPLOYMENT.md`): `docker-compose.yml` runs `db` (postgres:17, data bind-mounted at `./data/postgres`; the healthcheck uses TCP because on first init the socket answers before the DB exists), `backend` and `frontend`; config in root `.env` (from `.env.docker.example`). `scripts/backup.sh` dumps to `backups/` (gzip, keeps `KEEP_DAYS`=30). Only the frontend port is published; the browser calls `/api` on the same origin and the Next rewrite proxies to `http://backend:4000` (`API_PROXY_TARGET`, baked at build time; unset it defaults to production). The backend container runs `prisma migrate deploy` on start (so `prisma` is a prod dependency); seed with `docker compose exec backend node dist/prisma/seed.js`.

## Environment

- Backend `.env` (see `.env.example`): `DATABASE_URL`, `PORT`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (required when `NODE_ENV=production`, dev falls back to fixed secrets), `COOKIE_SECURE` (refresh cookie `secure` flag), `TZ` (business day is computed in server local time; use `Asia/Ho_Chi_Minh`).
- Frontend: `NEXT_PUBLIC_API_URL` (inlined at build time). No `.env*` file is committed; without one `lib/api.ts` falls back to `http://localhost:4000/api`. `NEXT_PUBLIC_API_URL=/api` goes through the `next.config.ts` rewrite to `API_PROXY_TARGET`, which defaults to the **production** backend (`https://kara.hvlsv.uk`) when unset.

## Backend architecture

- All routes are under `/api`; Swagger at `/api/docs`. CORS reflects any origin with credentials. `src/app.setup.ts` (`configureApp`) wires the prefix, cookie parser, a global `ValidationPipe` (whitelist + transform, Vietnamese messages) and `PrismaExceptionFilter` (P2002/P2003 → 409, P2025 → 404); it is shared by `main.ts` and the e2e tests.
- One Nest module per resource: `auth`, `users`, `branches`, `rooms`, `categories`, `products`, `orders`, `inventory`, `funds`, plus a global `common` module.
- **Auth**: `JwtAuthGuard` and `RolesGuard` are global `APP_GUARD`s — every route requires a valid access token unless marked `@Public()`, and `@Roles(...)` restricts by role (`MANAGERS`, `SALES`, `ALL_ROLES` in `src/auth/roles.ts`). The JWT strategy reloads the user from the DB on every request (`AuthUser`, `@CurrentUser()`), so role/branch changes and locking (`active=false`) take effect immediately. `POST /auth/login` returns a 15-min access token and sets a 7-day `Refresh` httpOnly cookie; `POST /auth/refresh` re-issues it.
- **Branch scoping** (`common/branch-scope.service.ts`): endpoints take an optional `?branch=<code>`. Only the chain manager's value is honoured; everyone else is always scoped to `user.branchId` and gets 403 for another branch's code or record (`assertBranchAccess`). Never trust the URL branch for anything else.
- **Per-branch data**: `Branch` model; `Category`, `Product`, `Room`, `Order`, `FundTransaction`, `StockDocument`, `StockMovement` all have `branchId`. Each branch has its own catalog and stock.
- **Orders / billing**: a room session is an `Order` with `status=PENDING`. `POST /orders {roomId, cskhId?, serverId?}` opens it, snapshots the room's `pricePerHour` onto the order and sets the room `ACTIVE` in one transaction. `PATCH /orders/:id {items: [{productId, quantity}], ...adjustments}` replaces the items; prices come from the server (existing lines keep their snapshot price). `billing.ts` `computeBill` is the single billing formula: room fee = started minutes/60 × the order's price, rounded **up to 1,000 VND**; each discount/fee has a percent and an amount — a percent > 0 is applied to the live base (products / room fee / subtotal) and wins, otherwise the amount is a fixed sum; discounts are capped at what they discount; tax = `taxPercent` of the subtotal, rounded up. `GET /orders/:id/preview` shows it live, `POST /orders/:id/checkout {paymentMethod}` persists the applied amounts, frees the room, writes `SALE` stock movements and the fund receipt in one transaction. Every writer of an order (`update`, `checkout`, `cancel`, `void`) first locks the row via `lockOrder` (conditional `updateMany`), so an item edit and a checkout never interleave; stock rows are always locked in product-id order. `POST /orders/:id/cancel` (managers) drops an open session; `POST /orders/:id/void {reason}` (managers) voids a paid bill: `REVERSAL` movements put the sold goods back and the fund receipt is cancelled. The frontend mirrors `computeBill` in `lib/billing.ts` for the live total — keep them in sync.
- **Business day** D = [D 06:00, D+1 06:00) in server local time (venue hours 11:30 → 06:00), so every moment belongs to exactly one day (`common/dates.ts`: `getBusinessDayRange`, `businessDayRange(from, to)`, `businessDateOf`). All reports use it: `GET /orders?from&to` / `?businessDate=` and `GET /orders/statistics?from&to` (by **payment time** `endTime`), funds, stock documents and movements. The frontend defaults its date filters to `businessDate()` (`lib/format.ts`), not the calendar date.
- **Inventory**: `Product.stockQuantity` changes only through `InventoryService.applyMovement` (atomic increment + one `StockMovement` ledger row with `balanceAfter`), so it always equals the sum of its ledger. Phiếu nhập/xuất = `POST /inventory/documents {type, lines, paymentMethod?}`, codes like `PN-CS1-20260926-0001`; imports update `costPrice`; an import with `paymentMethod` also writes its phiếu chi; exports cannot go below zero, sales may. `POST /inventory/documents/:id/cancel {reason}` reverses the movements (`REVERSAL`; an import only while its goods are still in stock), resets `costPrice` to the latest remaining import and cancels the linked phiếu chi. `trackStock=false` products (phụ thu, dịch vụ) are never deducted, and tracking cannot be turned off while stock remains. `GET /inventory/stock` and `GET /products` include `pendingQuantity` (ordered in open sessions, deducted at checkout); stock also lists discontinued products that still hold stock.
- **Funds**: `FundTransaction` (INCOME/EXPENSE, `method` CASH/TRANSFER). Checkout writes the receipt of a bill (`orderId`), a paid import its payment (`stockDocumentId`) — helpers in `funds/fund-ledger.ts`, called inside the source's transaction. Manual entries via `POST /funds`; `POST /funds/:id/cancel {reason}` cancels manual entries only (linked ones follow their source). Cancelled entries (and bills/documents: `cancelledAt/cancelledBy/cancelReason`) stay visible but leave every total. `GET /funds/summary` returns opening/closing balance, income/expense (with `salesIncome`/`purchaseExpense`) and a per-method split; sales income for a period equals the revenue statistics for it.
- **Excel import** (`src/imports`, managers only): the browser reads the file and maps its columns, then posts JSON rows (`{row, ...fields}`, max 1000; the JSON body limit is 5mb in `app.setup.ts`) to `POST /imports/{categories,products,rooms,users,stock-import}`. `dryRun: true` only returns each row's verdict (`CREATE`/`UPDATE`/`SKIP`/`ERROR` + Vietnamese message); otherwise the rows are checked again and written in **one transaction**, or nothing when any row is an error (400 with `rows`). Records match by name within the branch (case/space-insensitive, diacritics kept — `import-utils.ts` `normalizeName`), accounts by username (or full name); `onDuplicate` SKIP/UPDATE decides what happens to matches, and UPDATE only writes the mapped, non-empty fields. Products/categories/rooms reuse the rules of their services; accounts are created without a password (username generated from the name when missing) and roles go through `UsersService.checkAssignment`; a stock sheet becomes one phiếu nhập via `InventoryService.writeDocument` (the transaction body of `createDocument`), merging repeated products at the weighted average cost and optionally creating missing products.
- Amounts are Prisma `Decimal` (serialized as strings); services convert with `Number(...)` for arithmetic.

## Frontend architecture

- Routes are `/[branch]/sales/...`, `/[branch]/inventory/...`, `/[branch]/funds`, `/[branch]/admin/{users,branches}`; the branch comes from the first path segment (`lib/branch.ts` `useBranchCode()`) and is sent as `?branch=` on requests. `/` is the login page (`app/(auth)/page.tsx`); after login the app goes to `/<own branch>/sales/rooms`.
- `components/auth-provider.tsx` bootstraps the session (`GET /auth/me` + `GET /branches`), redirects a non-chain-manager whose URL names another branch, and auto-logs-out after 15 hours of inactivity.
- **Shell** (`app/[branch]/layout.tsx` → `components/layout/app-shell.tsx`, shadcn dashboard-01/sidebar-07 pattern): `AppSidebar` (inset, collapsible to icons, a sheet on phones; open state in the `sidebar_state` cookie) with `BranchSwitcher` and `NavUser`, `SiteHeader` (breadcrumb, business day, theme toggle), then the page inside a `@container/main` wrapper keyed by pathname, which fades/slides each page in. `lib/navigation.ts` is the single nav config: sidebar groups, breadcrumb and titles. Pages start with `PageHeader` (title, description, actions); a page can set the breadcrumb/tab title with `usePageTitle` (`components/layout/page-title.tsx`). Tab titles come from a `layout.tsx` with `metadata` per route (template `%s · Karaoke 502` in `app/layout.tsx`).
- `lib/permissions.ts` is the UI copy of the permission matrix (`can(user, perm)`, `canVisit(user, path)`); `components/route-guard.tsx` shows `Forbidden` for pages the role can't use, and the sidebar only lists the pages the role may use. This only hides UI; the backend enforces access.
- `lib/api.ts` is the single axios instance: access token kept **in memory**, `withCredentials` for the refresh cookie, and a 401 interceptor that calls `/auth/refresh` once and retries (so a page load logs one expected 401 on `/auth/me`). `apiErrorMessage(error, fallback)` extracts the server's Vietnamese message.
- All pages are client components calling the API directly. Shared pieces: `hooks/use-api-data.ts` (GET + reload), `hooks/use-notify.ts` (sonner toasts for success / API errors), `hooks/use-now.ts` (ticking clock for live timers and totals), `lib/types.ts` (API shapes), `lib/labels.ts` (Vietnamese labels of enums), `lib/format.ts` (money/date; `toDateInput` gives local YYYY-MM-DD — don't use `toISOString()` for dates; `businessDate()` is today's business day), `components/data-states.tsx` (`EmptyState`, `TableEmpty`, `TableSkeleton`), `confirm-dialog.tsx` / `reason-dialog.tsx` (AlertDialog confirm; cancel with a required reason), `date-range-picker.tsx` (presets + Vietnamese calendar), `line-items-table.tsx`, `components/catalog/*` (room/category/product managers used by both Bán hàng and Kho settings), `components/sales/*` (checkout dialog, open-room dialog, bill sheet, `BillSummary`), `components/inventory/stock-document-form.tsx`.
- **Excel import** (`/[branch]/imports?type=…`, `components/excel-import/*`, `lib/excel-import/*`): a 4-step wizard (file → column mapping → dry-run preview → done). `workbook.ts` reads xlsx/xls/csv with SheetJS (`xlsx`, installed from the official `cdn.sheetjs.com` tarball because the npm release is outdated; always `await import("xlsx")` so it stays out of the main bundle; CSV is read as text for UTF-8). `definitions.ts` declares, per import type, the fields (label, kind, required, header aliases, template example) — add a field there and in the backend DTO together. `mapping.ts` guesses the mapping (remembered headers in `localStorage` `excel-import:<type>`, then aliases, compared without diacritics); `parse.ts` reads cells (Vietnamese number formats, Có/Không, enum labels) and reports unreadable cells before anything is sent. List pages link to it with `ExcelImportButton`.
- **Phone layouts**: pages are laid out with container queries on `@container/main` (not viewport breakpoints), since the sidebar takes part of the width. Wide tables hide secondary columns with `SHOW_FROM.{xs,sm,md,lg}` from `lib/responsive.ts` (and show a short stand-in under the first column with `ONLY_NARROW`); `TableSkeleton` takes the same per-column classes. Tables inside sheets/dialogs are portaled outside `@container/main`, so they use viewport breakpoints (`sm:`). Check new screens at 360–390px wide: no page may scroll sideways.
- UI primitives live in `components/ui`: shadcn new-york (v4 registry) components on the `radix-ui` package, with sr-only texts translated to Vietnamese and `success`/`warning` Badge variants. Theme tokens (slate base plus `--success`/`--warning`, chart colors) are in `app/globals.css`; dark mode via `next-themes` (`components/theme-provider.tsx`, `theme-toggle.tsx`). Font: Inter, bundled with the app (`@fontsource-variable/inter` imported in `app/layout.tsx`; variable weights, Vietnamese subset), so nothing is fetched from Google Fonts at build or run time — don't reintroduce `next/font/google`. `--font-sans` in `globals.css` ends with the system sans-serif fonts so a failed font load never shows a serif font; `font-mono` is Tailwind's system monospace stack. Add new primitives with the shadcn CLI (`npx shadcn@latest add <name>`) to stay consistent with `components.json`, and check that it did not add stray packages.
- Old addresses `sales/catalog/*`, `sales/room-management`, `sales/overview` and `sales/statistics/{cskh,revenue}` only redirect to the current pages.
