# Trang báo cáo theo hóa đơn điện tử — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm một trang riêng `baocao.<tên miền>` cho QL hệ thống, và cho QL cơ sở, HĐQT được cấp quyền. Trang có:
- Quản lý bán hàng, với nút **Thêm hóa đơn** tạo bill thêm tay đánh số chung dãy bill;
- Hóa đơn điện tử;
- ba báo cáo Doanh thu, Phòng, Hàng hóa, tính theo HĐĐT.

Trang chính bỏ HĐĐT tự do.

**Architecture:**
- **Backend:**
  - `User.reportAccess` cộng với `canUseReportSite` quyết định ai vào trang báo cáo.
  - Bảng `ManualBill` lấy số từ `BillCounter` chung. `Einvoice.manualBillId` cùng một CHECK bảo đảm mỗi HĐĐT thuộc đúng một bill.
  - Module `src/report-site`:
    - mọi route nằm dưới `/report-site/`;
    - `ReportSiteGuard` chạy trước `SharedRequestInterceptor`;
    - truy vấn đọc chạy trên `ReportPrismaService`.
  - HĐĐT giữ dòng hàng khi xuất. VAT của nháp tính cả phần tiền chưa có dòng.
  - Route `/einvoices/...` chặn HĐĐT của bill thêm tay với người không có quyền trang báo cáo.
- **Frontend:**
  - Trang báo cáo dùng chung app với trang chính. `next.config.ts` chuyển host `baocao.`/`baocao-` sang `app/report/` (rewrite theo host), địa chỉ trên trình duyệt vẫn giống bên chính.
  - Khung trang dùng lại `AppShell` với `site="report"`.
  - Trang HĐĐT thành component dùng chung `EinvoicesPage({ site })`.

**Tech Stack:** NestJS 11, Prisma 5.22 (PostgreSQL 17), Jest (unit; e2e với supertest và `test/fake-minvoice.ts`), Next.js 16 App Router, React 19, shadcn/ui (radix-ui), Tailwind 4. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-10-02-trang-bao-cao-hddt-design.md`. Đọc hết spec trước Task 1.

## Global Constraints

- **Chữ và commit:**
  - Chuỗi hiển thị và thông báo lỗi bằng **tiếng Việt**; comment trong code bằng tiếng Anh, như code hiện có.
  - Commit tiếng Việt theo dạng `feat(report-site): …` (backend), `feat(web): …` (frontend), `docs: …`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Làm trên nhánh `feat/report-site` (đã có; spec đã commit ở `c6edd96`).
- **Quyền:**
  - `canUseReportSite(user)` = `role === CHAIN_MANAGER`, hoặc `reportAccess && role ∈ {BRANCH_MANAGER, BOARD}`. Bản backend ở `src/auth/roles.ts`, bản sao ở `lib/permissions.ts`.
  - Route riêng của trang báo cáo nằm dưới `/report-site/` và gắn `ReportSiteGuard`. Đọc: `READERS`; ghi: `MANAGERS`.
  - Route `/einvoices/...` giữ quyền cũ, cộng thêm kiểm tra `canUseReportSite` với HĐĐT có `manualBillId`.
  - Route có `SharedRequestInterceptor` thì kiểm tra quyền **luôn nằm trong guard**, vì interceptor gộp request mà không xét ai gọi.
- **Số liệu trang báo cáo:**
  - Một HĐĐT được tính khi `status = 'ISSUED'` **hoặc** bill của nó chưa hủy (`Order.cancelledAt IS NULL`).
  - Ngày tính là `Einvoice.businessDate`.
  - Tổng tiền = Σ `amount`, VAT = Σ `vatAmount`, doanh thu = tổng tiền − VAT.
- **Tài nguyên** (`docs/resource-rules.md` §5):
  - Mọi truy vấn đọc của trang báo cáo chạy trên `ReportPrismaService`.
  - Danh sách bill tối đa 500 dòng, có `X-Total-Count` và `ListLimitNotice`. Báo cáo Hàng hóa tối đa 1000 dòng.
  - Không cộng tổng từ danh sách có trần.
  - Trang báo cáo không polling, không WebSocket. Không thêm thư viện.
- **Đường dẫn trong `app/report/`:** mọi `Link`, `router.push`, `redirect` dùng địa chỉ trình duyệt (`/${branch}/sales/bills`), **không bao giờ** có tiền tố `/report`.
- **Không bao giờ chạy backend vào database production**, kể cả để thử (CLAUDE.md gốc).
- **Lệnh:**
  - Backend: `cd 502-backend`. Sửa `prisma/schema.prisma` xong thì chạy `npx prisma generate`.
  - E2E: chạy `docker start kara502-pg` trước. Chạy từng file một, ví dụ `npx jest --config ./test/jest-e2e.json test/report-site.e2e-spec.ts --runInBand`.
  - Lỗi `Cannot convert undefined or null to object` ở `@IsEnum` nghĩa là client Prisma cũ: chạy lại `npx prisma generate`.
  - Frontend: `cd 502-frontend`. Không có test tự động: kiểm tra bằng `npx tsc --noEmit`, `npm run lint`, `npm run build` và trình duyệt.

---

### Task 0: Trỏ spec cũ sang spec mới, commit kế hoạch

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md:5`
- Modify: `docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md:3`
- Commit: `docs/superpowers/plans/2026-10-02-trang-bao-cao-hddt.md`

- [ ] **Step 1: Ghi chú ở spec gốc**

Trong `docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md`, ngay sau dòng `> Bố cục trang (§10.1–10.3)…` (dòng 5), thêm:

```markdown
>
> Hóa đơn không theo bill đã bị bỏ, và dòng hàng nay được giữ lại sau khi xuất: xem `2026-10-02-trang-bao-cao-hddt-design.md`.
```

- [ ] **Step 2: Ghi chú ở spec bố cục hai cột**

Trong `docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md`, ngay sau dòng `Ngày: 01/10/2026. Trạng thái: …` (dòng 3), thêm một dòng trống rồi:

```markdown
> Hóa đơn tự do (không theo bill) đã bị bỏ, thay bằng bill thêm tay trên trang báo cáo: xem `2026-10-02-trang-bao-cao-hddt-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-hoa-don-dien-tu-design.md docs/superpowers/specs/2026-10-01-hddt-bo-cuc-va-hd-tu-do-design.md docs/superpowers/plans/2026-10-02-trang-bao-cao-hddt.md
git commit -m "docs(report-site): kế hoạch triển khai trang báo cáo theo hóa đơn điện tử

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Trang báo cáo theo tên miền — đăng nhập và khung trang

Task này làm trước mọi task khác, vì nó kiểm tra cái rủi ro lớn nhất của spec (§12): rewrite theo host của Next.js.

**Files:**
- Create: `502-frontend/src/lib/site.ts`
- Modify: `502-frontend/next.config.ts`
- Modify: `502-frontend/src/lib/types.ts` (interface `User`)
- Modify: `502-frontend/src/lib/permissions.ts`
- Modify: `502-frontend/src/lib/navigation.ts`
- Create: `502-frontend/src/components/layout/site-context.tsx`
- Modify: `502-frontend/src/components/layout/app-shell.tsx`, `app-sidebar.tsx`, `site-header.tsx`, `branch-switcher.tsx`, `nav-user.tsx`
- Modify: `502-frontend/src/components/route-guard.tsx`, `502-frontend/src/hooks/use-pending-discounts.ts`, `502-frontend/src/components/auth-provider.tsx`
- Move: `502-frontend/src/app/(auth)/page.tsx` → `502-frontend/src/components/login-page.tsx`; Create lại `502-frontend/src/app/(auth)/page.tsx`
- Create: `502-frontend/src/app/report/page.tsx`, `502-frontend/src/app/report/[branch]/layout.tsx`, `502-frontend/src/app/report/[branch]/page.tsx`
- Create (tạm, Task 11 và 12 thay): `502-frontend/src/app/report/[branch]/sales/bills/{layout,page}.tsx`, `502-frontend/src/app/report/[branch]/reports/revenue/{layout,page}.tsx`
- Modify (máy dev, không commit): `.claude/launch.json`

**Interfaces:**
- Produces:
  - `type Site = "main" | "report"`, `REPORT_HOST_RE`, `isReportSite(): boolean` (`lib/site.ts`).
  - `SiteProvider`, `useSite(): Site` (`components/layout/site-context.tsx`).
  - `canUseReportSite(user: User | null): boolean` và `canVisit(user, subPath, site: Site = "main")` (`lib/permissions.ts`).
  - `REPORT_NAV_GROUPS`, `visibleNav(user, site = "main")`, `findNav(subPath, user, site = "main")` (`lib/navigation.ts`).
  - `AppShell({ defaultOpen, site = "main", children })`.
  - `usePendingDiscounts(active = true)`.
  - `LoginPage({ eyebrow?, tagline?, heading? })` (`components/login-page.tsx`).
  - `User.reportAccess: boolean`.

- [ ] **Step 1: `lib/site.ts`**

```ts
// The two faces of the app (spec 2026-10-02-trang-bao-cao-hddt §7.1): the main
// site and the report site, served by the same Next.js app. A host starting
// with "baocao." or "baocao-" is the report site (next.config.ts sends it to
// app/report); every other host is the main one.
export type Site = "main" | "report";

export const REPORT_HOST_RE = /^baocao[.-]/;

// Only meaningful in the browser (event handlers, effects): false on the
// server, where the shell is never rendered (AuthProvider shows its loading
// screen until the session is known).
export function isReportSite(): boolean {
  return typeof window !== "undefined" && REPORT_HOST_RE.test(window.location.hostname);
}
```

- [ ] **Step 2: Rewrite và redirect theo host trong `next.config.ts`**

Thêm ngay dưới `const apiProxyTarget = …`:

```ts
// The report site (spec 2026-10-02-trang-bao-cao-hddt §7.1): a host starting
// with "baocao." or "baocao-" (baocao.localhost:3000 in development) gets the
// pages of app/report at the same paths as the main site. Keep in step with
// REPORT_HOST_RE in src/lib/site.ts. Next matches `host` without the port.
const REPORT_HOST = 'baocao[.-].+';
```

Thay toàn bộ `async rewrites() { … }` bằng:

```ts
  async redirects() {
    // The report pages are reached only through their own host.
    return [
      { source: '/report', missing: [{ type: 'host', value: REPORT_HOST }], destination: '/', permanent: false },
      { source: '/report/:path*', missing: [{ type: 'host', value: REPORT_HOST }], destination: '/', permanent: false },
    ];
  },
  async rewrites() {
    return {
      // Checked before the pages. Only page paths move: not /api, /_next,
      // Next's own __nextjs routes, nor files (they have a dot).
      beforeFiles: [
        { source: '/', has: [{ type: 'host', value: REPORT_HOST }], destination: '/report' },
        {
          source: '/:path((?!api/|_next/|__nextjs)[^.]+)',
          has: [{ type: 'host', value: REPORT_HOST }],
          destination: '/report/:path*',
        },
      ],
      afterFiles: [
        {
          source: '/api/:path*',
          destination: `${apiProxyTarget}/api/:path*`,
        },
      ],
      fallback: [],
    };
  },
```

- [ ] **Step 3: `User.reportAccess` (`lib/types.ts`)**

Trong `export interface User`, ngay sau `managesPr: boolean;`:

```ts
  // Vào trang báo cáo: a branch manager or HĐQT may use the report site (the
  // chain manager always can); see canUseReportSite in lib/permissions.ts.
  reportAccess: boolean;
```

- [ ] **Step 4: Quyền theo trang (`lib/permissions.ts`)**

Thêm `import type { Site } from "@/lib/site";` vào đầu file. Thêm ngay trên `// Page permissions by path after /[branch]`:

```ts
// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1), a copy of
// canUseReportSite in the backend's src/auth/roles.ts: the chain manager
// always, a branch manager or HĐQT whose account has "Vào trang báo cáo",
// never the cashier or the floor staff.
export function canUseReportSite(user: User | null): boolean {
  if (!user) return false;
  return (
    user.role === "CHAIN_MANAGER" ||
    (user.reportAccess && (user.role === "BRANCH_MANAGER" || user.role === "BOARD"))
  );
}

// The report site's pages by path after /[branch] (spec §7.3).
const REPORT_ROUTE_PERMISSIONS: [string, Permission][] = [
  ["/sales", "einvoices.view"],
  ["/reports", "reports"],
];
```

Thay `canVisit` bằng:

```ts
export function canVisit(user: User | null, subPath: string, site: Site = "main"): boolean {
  const rules = site === "report" ? REPORT_ROUTE_PERMISSIONS : ROUTE_PERMISSIONS;
  const rule = rules.find(([prefix]) => subPath.startsWith(prefix));
  return rule ? can(user, rule[1]) : !!user;
}
```

- [ ] **Step 5: Menu của trang báo cáo (`lib/navigation.ts`)**

Thêm `import type { Site } from "@/lib/site";`. Thêm ngay sau `NAV_GROUPS`:

```ts
// The report site's menu (spec 2026-10-02-trang-bao-cao-hddt §7.3).
export const REPORT_NAV_GROUPS: NavGroup[] = [
  {
    label: "Bán hàng",
    items: [
      { title: "Quản lý bán hàng", path: "/sales/bills", icon: ReceiptText, permission: "einvoices.view" },
      { title: "Hóa đơn điện tử", path: "/sales/einvoices", icon: FileCheck2, permission: "einvoices.view" },
    ],
  },
  {
    label: "Báo cáo",
    items: [
      { title: "Doanh thu", path: "/reports/revenue", icon: ChartColumnBig, permission: "reports" },
      { title: "Phòng", path: "/reports/rooms", icon: DoorOpen, permission: "reports" },
      { title: "Hàng hóa", path: "/reports/products", icon: Package, permission: "reports" },
    ],
  },
];

const groupsOf = (site: Site) => (site === "report" ? REPORT_NAV_GROUPS : NAV_GROUPS);
```

Trong `visibleNav` và `findNav`, thêm tham số cuối `site: Site = "main"` và thay `NAV_GROUPS` bằng `groupsOf(site)`:

```ts
export function visibleNav(user: User | null, site: Site = "main"): NavGroup[] {
  return groupsOf(site)
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.permission || can(user, item.permission))
        .map((item) => ({ ...item, title: item.sidebarTitle ?? titleFor(item, user) })),
    }))
    .filter((group) => group.items.length > 0);
}
```

```ts
export function findNav(subPath: string, user: User | null, site: Site = "main") {
  let best: { group: NavGroup; item: NavItem } | undefined;
  for (const group of groupsOf(site)) {
```

(phần còn lại của `findNav` giữ nguyên).

- [ ] **Step 6: Ngữ cảnh trang (`components/layout/site-context.tsx`)**

```tsx
"use client";

import { createContext, useContext } from "react";
import type { Site } from "@/lib/site";

// Which site the signed-in shell belongs to, set by the layout of its route
// tree (app/[branch] or app/report/[branch]): the same on the server and in
// the browser, unlike the host name.
const SiteContext = createContext<Site>("main");

export const SiteProvider = SiteContext.Provider;

export function useSite(): Site {
  return useContext(SiteContext);
}
```

- [ ] **Step 7: `AppShell` nhận `site`**

Trong `components/layout/app-shell.tsx`, thêm import `SiteProvider` và `type Site`, rồi thay hàm `AppShell` bằng:

```tsx
export function AppShell({
  defaultOpen,
  site = "main",
  children,
}: {
  defaultOpen: boolean;
  site?: Site;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const fullScreen = FULL_SCREEN.test(pathname);
  const shell = (
    <>
      {!fullScreen && <AppSidebar variant="inset" />}
      <SidebarInset className="min-w-0">
        <PageTitleProvider>
          {!fullScreen && <SiteHeader />}
          <div className="@container/main flex flex-1 flex-col">
            <RouteGuard>
              <div
                key={pathname}
                className="flex flex-1 flex-col gap-4 p-4 animate-in duration-300 ease-out fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none md:gap-6 md:p-6"
              >
                {children}
              </div>
            </RouteGuard>
          </div>
        </PageTitleProvider>
      </SidebarInset>
    </>
  );

  return (
    <SiteProvider value={site}>
      <SidebarProvider
        defaultOpen={defaultOpen}
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 64)",
            "--header-height": "calc(var(--spacing) * 14)",
          } as React.CSSProperties
        }
      >
        {/* The report site has no live screen (spec 2026-10-02 §7.3): no socket. */}
        {site === "main" ? <LiveEventsProvider>{shell}</LiveEventsProvider> : shell}
      </SidebarProvider>
    </SiteProvider>
  );
}
```

- [ ] **Step 8: Sidebar, header, chọn cơ sở, menu tài khoản, chặn trang theo `site`**

Mỗi file sau thêm `import { useSite } from "@/components/layout/site-context";` và `const site = useSite();` đầu component:

- `app-sidebar.tsx`: `usePendingDiscounts(site === "main")`, `findNav(subPath, user, site)`, `visibleNav(user, site)`.
- `site-header.tsx`: `const nav = findNav(pathname.replace(/^\/[^/]+/, ""), user, site);`.
- `branch-switcher.tsx`:
  - dòng tên cơ sở dưới `APP_NAME` thành:

    ```tsx
    <span className="truncate text-xs text-muted-foreground">{site === "report" ? `Trang báo cáo · ${label}` : label}</span>
    ```

  - trong `switchTo`: `const section = rest.filter((segment) => !/^\d+$/.test(segment)).join("/") || (site === "report" ? "sales/bills" : "sales/rooms");`.
- `nav-user.tsx`: thêm `const canPurge = site === "main" && can(user, "purge");` (sau `if (!user) return null;`) và thay cả hai chỗ `can(user, "purge")` bằng `canPurge`.
- `components/route-guard.tsx`: thay thân hàm bằng:

```tsx
  const pathname = usePathname();
  const site = useSite();
  const { user, branches } = useAuth();
  if (!user) return null;
  // AuthProvider signs out an account that may not use the report site.
  if (site === "report" && !canUseReportSite(user)) return null;

  const [, code, ...rest] = pathname.split("/");
  if (!canOpenBranch(user, branches, code)) return null;
  if (!canVisit(user, `/${rest.join("/")}`, site)) return <Forbidden />;
  return <>{children}</>;
```

(import `canUseReportSite` cùng `canVisit` từ `@/lib/permissions`).

- `hooks/use-pending-discounts.ts`: chữ ký thành `export function usePendingDiscounts(active = true): number | null`, và `const enabled = active && can(user, "discounts.approve");`. Sửa comment trên hàm: thêm "Off on the report site (`active` false)".

- [ ] **Step 9: `AuthProvider` biết đang ở trang nào**

Trong `components/auth-provider.tsx`:

```ts
import { can, canUseReportSite } from "@/lib/permissions";
import { isReportSite } from "@/lib/site";
```

```ts
// Where an account lands after login: its branch's room map, or on the report
// site its Quản lý bán hàng.
export function homePath(user: User, branches: Branch[]) {
  const code =
    user.branch?.code ?? branches.find((b) => b.active)?.code ?? branches[0]?.code ?? "cs1";
  return isReportSite() ? `/${code}/sales/bills` : `/${code}/sales/rooms`;
}
```

Trong `login`:

```ts
    // The report site asks the server first (spec 2026-10-02 §3.2).
    const response = await api.post("/auth/login", { ...data, ...(isReportSite() ? { site: "report" } : {}) });
```

Ngay sau định nghĩa `const logout = useCallback(() => signOut(), [signOut]);`:

```ts
  // The report site: an account that may not use it (any more) is signed out.
  useEffect(() => {
    if (user && isReportSite() && !canUseReportSite(user)) {
      void signOut("Tài khoản không có quyền vào trang báo cáo");
    }
  }, [user, signOut]);
```

- [ ] **Step 10: Form đăng nhập dùng chung**

```bash
cd 502-frontend
git mv "src/app/(auth)/page.tsx" src/components/login-page.tsx
```

Trong `src/components/login-page.tsx`:
- thay `export default function LoginPage() {` bằng:

```tsx
// The login screen of both sites; the report site only changes its words.
export function LoginPage({
  eyebrow = "Hệ thống quản lý",
  tagline = "Bán hàng, kho, sổ quỹ và thống kê cho từng cơ sở trong một nơi.",
  heading = "Đăng nhập hệ thống",
}: {
  eyebrow?: string;
  tagline?: string;
  heading?: string;
}) {
```

- thay ba chuỗi cố định trong JSX:
  - `<p className="text-sm font-medium text-muted-foreground">Hệ thống quản lý</p>` → `{eyebrow}`;
  - `Bán hàng, kho, sổ quỹ và thống kê cho từng cơ sở trong một nơi.` → `{tagline}`;
  - `<h1 className="text-2xl font-bold">Đăng nhập hệ thống</h1>` → `{heading}`.

Tạo lại `src/app/(auth)/page.tsx`:

```tsx
import { LoginPage } from "@/components/login-page";

export default function Page() {
  return <LoginPage />;
}
```

- [ ] **Step 11: Các route của trang báo cáo**

`src/app/report/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = { title: "Đăng nhập trang báo cáo" };

// "/" of the report host (next.config.ts rewrites it here).
export default function ReportLoginPage() {
  return (
    <LoginPage
      eyebrow="Trang báo cáo"
      tagline="Bán hàng, hóa đơn điện tử và báo cáo tính theo hóa đơn điện tử."
      heading="Đăng nhập trang báo cáo"
    />
  );
}
```

`src/app/report/[branch]/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";

// The report site's signed-in shell (spec 2026-10-02-trang-bao-cao-hddt §7.3).
export default async function ReportBranchLayout({ children }: { children: React.ReactNode }) {
  // Keep the sidebar open/collapsed as the user left it (cookie set by SidebarProvider).
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <AppShell defaultOpen={defaultOpen} site="report">
      {children}
    </AppShell>
  );
}
```

`src/app/report/[branch]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

// A browser path, without /report: the host keeps it on the report site.
export default async function ReportBranchHome({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/sales/bills`);
}
```

Hai trang tạm để thử chuyển trang (Task 11 và 12 thay). `src/app/report/[branch]/sales/bills/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quản lý bán hàng" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

`src/app/report/[branch]/sales/bills/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { useBranchCode } from "@/lib/branch";

// Placeholder until Task 11: shows the path the browser sees.
export default function ReportBillsPage() {
  const branch = useBranchCode();
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="Quản lý bán hàng" description={`Đường dẫn: ${pathname}`} />
      <Link href={`/${branch}/reports/revenue`} className="underline">
        Sang Doanh thu
      </Link>
    </>
  );
}
```

`src/app/report/[branch]/reports/revenue/layout.tsx`: như layout trên với `title: "Doanh thu"`. `src/app/report/[branch]/reports/revenue/page.tsx`: như trang trên, tiêu đề "Doanh thu", link về `/${branch}/sales/bills` ("Về Quản lý bán hàng"), comment `Placeholder until Task 12`.

- [ ] **Step 12: Kiểm tra kiểu và lint**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint`
Expected: không lỗi.

- [ ] **Step 13: Cấu hình preview trên máy dev (không commit)**

Thêm vào `configurations` của `.claude/launch.json` (file chưa được git theo dõi):

```json
{
  "name": "report-preview",
  "runtimeExecutable": "sh",
  "runtimeArgs": [
    "-c",
    "NEXT_PUBLIC_API_URL=/api API_PROXY_TARGET=http://localhost:4100 npm --prefix 502-frontend run dev -- --port 3003"
  ],
  "port": 3003
}
```

`NEXT_PUBLIC_API_URL=/api` để trình duyệt gọi API cùng tên miền. Nhờ vậy cookie phiên tách riêng theo host như ở production. Nếu gọi thẳng `http://localhost:4100`, hai trang sẽ dùng chung cookie.

- [ ] **Step 14: Chạy thử trên trình duyệt (dev)**

```bash
docker start kara502-pg
cd 502-backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/karaoke_test SEED_DEMO=1 npx prisma migrate reset --force
```

(database e2e dùng một lần, được phép xóa). Chạy `backend-preview` và `report-preview` bằng preview_start, rồi kiểm tra:

1. `http://baocao.localhost:3003/`:
   - hiện "Đăng nhập trang báo cáo";
   - đăng nhập `admin` / `12345678` thì vào `/cs1/sales/bills`;
   - sidebar ghi "Trang báo cáo · …", menu chỉ có Bán hàng (Quản lý bán hàng, Hóa đơn điện tử) và Báo cáo (Doanh thu, Phòng, Hàng hóa);
   - trang hiện "Đường dẫn: /cs1/sales/bills".
2. Bấm "Sang Doanh thu":
   - địa chỉ đổi thành `/cs1/reports/revenue` mà không tải lại cả trang;
   - tải lại trang (F5) vẫn ở đó;
   - `read_console_messages` không có lỗi hydration.
3. `http://localhost:3003/`:
   - vẫn chưa đăng nhập (cookie riêng), hiện "Đăng nhập hệ thống";
   - đăng nhập `admin` thì vào `/cs1/sales/rooms` với menu bên chính.
4. `http://localhost:3003/report/cs1/sales/bills` bị chuyển về `/`.
5. Trên `baocao.localhost:3003`, đăng nhập `tn1_cs1`: bị đăng xuất ngay, kèm "Tài khoản không có quyền vào trang báo cáo". Backend chưa chặn ở bước này (Task 3 mới chặn), nên đây là frontend tự đăng xuất.

- [ ] **Step 15: Chạy thử bản production**

```bash
cd 502-frontend && NEXT_PUBLIC_API_URL=/api API_PROXY_TARGET=http://localhost:4100 npm run build && npx next start --port 3004
```

(`next start` cảnh báo về `output: standalone`; cảnh báo đó không ảnh hưởng.) Lặp lại các điểm 1–4 của Step 14 trên `baocao.localhost:3004` và `localhost:3004`. Kiểm tra thêm, bằng `read_network_requests`, rằng `/_next/static/*` và `/favicon.ico` trên host báo cáo trả 200.

**Nếu bất kỳ điểm nào hỏng vì rewrite** (404 trên trang báo cáo, `usePathname` ra `/report/...`, lỗi hydration, file tĩnh 404), DỪNG và báo người dùng. Phương án dự phòng của spec §7.1:
- chuyển các trang báo cáo sang tiền tố thật `/bc/...` (thư mục `app/bc/`);
- bỏ phần `rewrites` theo host;
- thêm redirect: host `baocao` ở `/` sang `/bc`, host khác ở `/bc/*` sang `/`.

Phương án này cần người dùng duyệt trước khi làm.

- [ ] **Step 16: Commit**

```bash
git add 502-frontend/next.config.ts 502-frontend/src/lib/site.ts 502-frontend/src/lib/types.ts 502-frontend/src/lib/permissions.ts 502-frontend/src/lib/navigation.ts 502-frontend/src/components 502-frontend/src/hooks/use-pending-discounts.ts "502-frontend/src/app/(auth)/page.tsx" 502-frontend/src/app/report
git commit -m "feat(web): trang báo cáo theo tên miền baocao — đăng nhập và khung trang riêng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Schema và migration `20261005000000_report_site`

**Files:**
- Modify: `502-backend/prisma/schema.prisma` (`User`, `Branch`, `Room`, `Einvoice`, model mới `ManualBill`)
- Create: `502-backend/prisma/migrations/20261005000000_report_site/migration.sql`

**Interfaces:**
- Produces:
  - Prisma model `ManualBill`, có các trường `id`, `branchId`, `businessDate` (Date), `billSeq`, `billNumber`, `roomId?`, `createdById?`, `createdAt`, `cancelledAt?`, `cancelledById?`, `cancelReason?`, `einvoices`.
  - `Einvoice.manualBillId Int?`, `User.reportAccess Boolean`.
  - Ràng buộc database `Einvoice_one_bill`.

- [ ] **Step 1: Sửa `schema.prisma`**

`model User`, ngay sau dòng `managesPr …`:

```prisma
  // Vào trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1): a branch
  // manager or HĐQT may use the report site; the chain manager always can.
  reportAccess              Boolean           @default(false)
```

và cuối danh sách quan hệ của `User` (sau `einvoicesNumberEdited`):

```prisma
  manualBillsCreated        ManualBill[]      @relation("ManualBillCreatedBy")
  manualBillsCancelled      ManualBill[]      @relation("ManualBillCancelledBy")
```

`model Branch`, sau `einvoices        Einvoice[]`: `  manualBills      ManualBill[]`.
`model Room`, sau `orders       Order[]`: `  manualBills  ManualBill[]`.

`model Einvoice`: thay comment và dòng `orderId`/`order` bằng:

```prisma
  // The bill it belongs to: a paid bill (orderId) or a bill thêm tay of the
  // report site (manualBillId), exactly one of them (CHECK "Einvoice_one_bill",
  // spec 2026-10-02-trang-bao-cao-hddt §4.2). Restrict: a bill with invoices
  // is never deleted.
  orderId      Int?
  order        Order?         @relation(fields: [orderId], references: [id], onDelete: Restrict)
  manualBillId Int?
  manualBill   ManualBill?    @relation(fields: [manualBillId], references: [id], onDelete: Restrict)
```

và thêm `  @@index([manualBillId])` cạnh các index khác của `Einvoice`. Cuối file:

```prisma
// Bill thêm tay (spec 2026-10-02-trang-bao-cao-hddt §4.1): a bill made on the
// report site only to issue e-invoices, numbered in the branch's sequence of
// its business day (BillCounter, shared with checkout). The sales, stock,
// fund and report code of the main site never reads it.
model ManualBill {
  id            Int        @id @default(autoincrement())
  branchId      Int
  branch        Branch     @relation(fields: [branchId], references: [id])
  businessDate  DateTime   @db.Date
  billSeq       Int
  billNumber    String
  // Null only for the free invoices the migration turned into bills (room 0000).
  roomId        Int?
  room          Room?      @relation(fields: [roomId], references: [id], onDelete: Restrict)
  createdById   Int?
  createdBy     User?      @relation("ManualBillCreatedBy", fields: [createdById], references: [id])
  createdAt     DateTime   @default(now())
  cancelledAt   DateTime?
  cancelledById Int?
  cancelledBy   User?      @relation("ManualBillCancelledBy", fields: [cancelledById], references: [id])
  cancelReason  String?
  einvoices     Einvoice[]

  @@unique([branchId, businessDate, billSeq])
  @@index([branchId, billNumber])
}
```

Run: `cd 502-backend && npx prisma format && npx prisma generate`
Expected: không lỗi.

- [ ] **Step 2: Viết migration**

`prisma/migrations/20261005000000_report_site/migration.sql`:

```sql
-- Trang báo cáo theo hóa đơn điện tử (spec 2026-10-02-trang-bao-cao-hddt §4.5).

-- 1. Vào trang báo cáo.
ALTER TABLE "User" ADD COLUMN "reportAccess" BOOLEAN NOT NULL DEFAULT false;

-- 2. Bills thêm tay.
CREATE TABLE "ManualBill" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "billSeq" INTEGER NOT NULL,
    "billNumber" TEXT NOT NULL,
    "roomId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" INTEGER,
    "cancelReason" TEXT,

    CONSTRAINT "ManualBill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManualBill_branchId_billNumber_idx" ON "ManualBill"("branchId", "billNumber");
CREATE UNIQUE INDEX "ManualBill_branchId_businessDate_billSeq_key" ON "ManualBill"("branchId", "businessDate", "billSeq");

ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualBill" ADD CONSTRAINT "ManualBill_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. The bill of an e-invoice may be a bill thêm tay.
ALTER TABLE "Einvoice" ADD COLUMN "manualBillId" INTEGER;
CREATE INDEX "Einvoice_manualBillId_idx" ON "Einvoice"("manualBillId");
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_manualBillId_fkey" FOREIGN KEY ("manualBillId") REFERENCES "ManualBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Every free invoice (no bill) becomes the one invoice of a bill thêm tay
--    without a room (room code 0000), on its business day, numbered after
--    the bills of that day through the same BillCounter as checkout
--    (orders/bill-number.ts: DDMM + room + sequence of 3 digits or more).
DO $$
DECLARE
  inv RECORD;
  seq INTEGER;
  bill INTEGER;
BEGIN
  FOR inv IN
    SELECT "id", "branchId", "businessDate", "createdById", "createdAt"
    FROM "Einvoice" WHERE "orderId" IS NULL ORDER BY "id"
  LOOP
    INSERT INTO "BillCounter" ("branchId", "businessDate", "lastSeq")
    VALUES (inv."branchId", inv."businessDate", 1)
    ON CONFLICT ("branchId", "businessDate")
    DO UPDATE SET "lastSeq" = "BillCounter"."lastSeq" + 1
    RETURNING "lastSeq" INTO seq;
    INSERT INTO "ManualBill" ("branchId", "businessDate", "billSeq", "billNumber", "createdById", "createdAt")
    VALUES (
      inv."branchId", inv."businessDate", seq,
      to_char(inv."businessDate", 'DDMM') || '0000' || lpad(seq::text, GREATEST(3, length(seq::text)), '0'),
      inv."createdById", inv."createdAt")
    RETURNING "id" INTO bill;
    UPDATE "Einvoice" SET "manualBillId" = bill WHERE "id" = inv."id";
  END LOOP;
END $$;

-- 5. An e-invoice belongs to exactly one bill.
ALTER TABLE "Einvoice" ADD CONSTRAINT "Einvoice_one_bill" CHECK (("orderId" IS NULL) <> ("manualBillId" IS NULL));

-- 6. A draft without lines counts its whole amount at 10% VAT, as the filler
--    line would (einvoice-draft.ts draftVatOf); a draft with lines gets it
--    when next saved.
UPDATE "Einvoice" SET "vatAmount" = "amount" - round("amount" / 1.1)
WHERE "status" = 'DRAFT' AND ("draft" IS NULL OR jsonb_array_length("draft"->'lines') = 0);
```

- [ ] **Step 3: Kiểm tra migration khớp schema**

```bash
cd 502-backend
docker start kara502-pg
docker exec kara502-pg psql -U postgres -c "create database karaoke_shadow" || true
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "postgresql://postgres:postgres@localhost:5433/karaoke_shadow" --exit-code
```

Expected: exit code 0 ("No difference detected"). Prisma không quản lý ràng buộc CHECK nên `Einvoice_one_bill` không làm lệch.

- [ ] **Step 4: Diễn tập chuyển HĐĐT tự do**

```bash
cd 502-backend
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/karaoke_test"
mv prisma/migrations/20261005000000_report_site "$TMPDIR/"
npx prisma migrate reset --force --skip-generate
docker exec -i kara502-pg psql -U postgres -d karaoke_test <<'SQL'
INSERT INTO "BillCounter" ("branchId", "businessDate", "lastSeq")
  SELECT "id", DATE '2026-10-01', 50 FROM "Branch" WHERE "code" = 'cs1';
INSERT INTO "Einvoice" ("branchId", "businessDate", "status", "amount", "vatAmount", "draft", "updatedAt")
  SELECT "id", DATE '2026-10-01', 'DRAFT', 110000, 0, '{"buyerAddress":null,"buyerEmail":null,"lines":[]}', now()
  FROM "Branch" WHERE "code" = 'cs1';
INSERT INTO "Einvoice" ("branchId", "businessDate", "status", "amount", "vatAmount", "draft", "updatedAt")
  SELECT "id", DATE '2026-10-01', 'DRAFT', 0, 0, '{"buyerAddress":null,"buyerEmail":null,"lines":[]}', now()
  FROM "Branch" WHERE "code" = 'cs1';
SQL
mv "$TMPDIR/20261005000000_report_site" prisma/migrations/
npx prisma migrate deploy
docker exec -i kara502-pg psql -U postgres -d karaoke_test <<'SQL'
SELECT m."billNumber", m."roomId", e."vatAmount" FROM "Einvoice" e JOIN "ManualBill" m ON m."id" = e."manualBillId" ORDER BY e."id";
INSERT INTO "Einvoice" ("branchId", "businessDate", "amount", "updatedAt") VALUES (1, DATE '2026-10-01', 0, now());
SQL
```

Expected:
- hai dòng `01100000051 | (null) | 10000` và `01100000052 | (null) | 0`;
- lệnh `INSERT` cuối báo `violates check constraint "Einvoice_one_bill"`.

Dọn lại: `npx prisma migrate reset --force --skip-generate`.

- [ ] **Step 5: Unit test vẫn qua**

Run: `cd 502-backend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 502-backend/prisma/schema.prisma 502-backend/prisma/migrations/20261005000000_report_site
git commit -m "feat(report-site): bảng bill thêm tay, quyền vào trang báo cáo, HĐĐT tự do thành bill thêm tay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Quyền vào trang báo cáo (backend)

**Files:**
- Modify: `502-backend/src/auth/roles.ts`, `502-backend/src/auth/auth-user.ts`, `502-backend/src/auth/dto/login.dto.ts`, `502-backend/src/auth/auth.service.ts`, `502-backend/src/auth/auth.controller.ts`
- Modify: `502-backend/src/users/users.service.ts`, `502-backend/src/users/dto/create-user.dto.ts`
- Create: `502-backend/src/auth/roles.spec.ts`
- Create: `502-backend/test/report-site.e2e-spec.ts`

**Interfaces:**
- Consumes: `User.reportAccess` (Task 2).
- Produces:
  - `REPORT_ACCESS_ROLES: Role[]` và `canUseReportSite(user: { role: Role; reportAccess: boolean }): boolean` (`src/auth/roles.ts`).
  - `AuthUser.reportAccess`.
  - `POST /auth/login {username, password, site?: 'report'}`.
  - `CreateUserDto.reportAccess?: boolean`.
  - File e2e có các helper `as(name)`, `login(name, site?)`, `signIn(name)` và các map `tokens`, `ids`.

- [ ] **Step 1: Test `canUseReportSite` (đỏ)**

`src/auth/roles.spec.ts`:

```ts
import { Role } from '@prisma/client';
import { canUseReportSite } from './roles';

describe('canUseReportSite', () => {
  it('lets the chain manager in without the right', () => {
    expect(
      canUseReportSite({ role: Role.CHAIN_MANAGER, reportAccess: false }),
    ).toBe(true);
  });

  it('lets a branch manager or HĐQT in only with the right', () => {
    for (const role of [Role.BRANCH_MANAGER, Role.BOARD]) {
      expect(canUseReportSite({ role, reportAccess: true })).toBe(true);
      expect(canUseReportSite({ role, reportAccess: false })).toBe(false);
    }
  });

  it('never lets the cashier or the floor staff in', () => {
    for (const role of [Role.CASHIER, Role.STAFF]) {
      expect(canUseReportSite({ role, reportAccess: true })).toBe(false);
    }
  });
});
```

Run: `npx jest src/auth/roles.spec.ts`
Expected: FAIL (`canUseReportSite` is not a function).

- [ ] **Step 2: `canUseReportSite` (xanh)**

Cuối `src/auth/roles.ts`:

```ts
// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1): the chain manager
// always; a branch manager or HĐQT whose account has "Vào trang báo cáo";
// never the cashier or the floor staff. The account is reloaded on every
// request, so a change applies at once. Copied in the frontend's
// lib/permissions.ts.
export const REPORT_ACCESS_ROLES: Role[] = [Role.BRANCH_MANAGER, Role.BOARD];

export function canUseReportSite(user: {
  role: Role;
  reportAccess: boolean;
}): boolean {
  return (
    user.role === Role.CHAIN_MANAGER ||
    (user.reportAccess && REPORT_ACCESS_ROLES.includes(user.role))
  );
}
```

Run: `npx jest src/auth/roles.spec.ts`
Expected: PASS.

- [ ] **Step 3: `AuthUser` mang `reportAccess`**

`src/auth/auth-user.ts`: thêm `reportAccess: boolean;` sau `managesPr: boolean;` trong interface, và `reportAccess: true,` sau `managesPr: true,` trong `authUserSelect`.

- [ ] **Step 4: Đăng nhập trang báo cáo**

`src/auth/dto/login.dto.ts`, thêm import `IsIn, IsOptional` và trường:

```ts
  @ApiProperty({
    required: false,
    enum: ['report'],
    description: 'report: đăng nhập trang báo cáo',
  })
  @IsOptional()
  @IsIn(['report'])
  site?: 'report';
```

`src/auth/auth.service.ts`:
- import `ForbiddenException` từ `@nestjs/common` và `canUseReportSite` từ `./roles`;
- chữ ký `async login(username: string, pass: string, site?: 'report')`;
- ngay trước `return { ...this.startSession(user, account.password), user };`:

```ts
    // Only an early answer for the login form: every route of the report site
    // checks canUseReportSite itself (spec 2026-10-02 §3.2).
    if (site === 'report' && !canUseReportSite(user)) {
      throw new ForbiddenException('Tài khoản này không được vào trang báo cáo');
    }
```

`src/auth/auth.controller.ts`, trong `login`:

```ts
    const result = await this.authService.login(
      loginDto.username,
      loginDto.password,
      loginDto.site,
    );
```

- [ ] **Step 5: Cấp quyền ở tài khoản**

`src/users/dto/create-user.dto.ts`, sau `managesPr`:

```ts
  @ApiProperty({
    required: false,
    description:
      'Vào trang báo cáo: chỉ quản lý hệ thống cấp, cho quản lý cơ sở và HĐQT',
  })
  @IsOptional()
  @IsBoolean()
  reportAccess?: boolean;
```

(`UpdateUserDto` kế thừa qua `PartialType`.)

`src/users/users.service.ts`:
- thêm `Logger` vào import từ `@nestjs/common` và `REPORT_ACCESS_ROLES` từ `../auth/roles`;
- thêm `reportAccess: true,` vào `userSelect` sau `managesPr: true,`;
- trong class: `private readonly logger = new Logger(UsersService.name);`.

Thêm hàm sau ngay trên `@Injectable()`:

```ts
// Vào trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1): only the chain
// manager grants it, only to a branch manager or HĐQT, and an account moved
// to another role loses it in the same write.
function reportAccessFor(
  actor: AuthUser,
  role: Role,
  wanted: boolean | undefined,
  current: boolean,
): boolean {
  if (wanted !== undefined && actor.role !== Role.CHAIN_MANAGER) {
    throw new ForbiddenException(
      'Chỉ quản lý hệ thống được cấp quyền vào trang báo cáo',
    );
  }
  if (wanted && !REPORT_ACCESS_ROLES.includes(role)) {
    throw new BadRequestException(
      'Chỉ tài khoản quản lý cơ sở hoặc HĐQT được vào trang báo cáo',
    );
  }
  return (wanted ?? current) && REPORT_ACCESS_ROLES.includes(role);
}
```

Trong `create`, sau `const existing … throw …`:

```ts
    const reportAccess = reportAccessFor(
      actor,
      assignment.role,
      dto.reportAccess,
      false,
    );
```

thêm `reportAccess,` vào `data` của `prisma.user.create` (sau `managesPr`), rồi ngay trước `return toPublic(user);`:

```ts
    if (reportAccess) {
      this.logger.log(`User ${user.id}: report access on by user ${actor.id}`);
    }
```

Trong `update`, sau `const assignment = await this.checkAssignment(…);`:

```ts
    const reportAccess = reportAccessFor(
      actor,
      assignment.role,
      dto.reportAccess,
      target.reportAccess,
    );
```

thêm `reportAccess,` vào `data` của `prisma.user.update`, rồi ngay trước `return toPublic(user);`:

```ts
    if (reportAccess !== target.reportAccess) {
      this.logger.log(
        `User ${id}: report access ${reportAccess ? 'on' : 'off'} by user ${actor.id}`,
      );
    }
```

- [ ] **Step 6: File e2e của trang báo cáo**

`test/report-site.e2e-spec.ts`:

```ts
// test/report-site.e2e-spec.ts
import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { FakeMinvoice } from './fake-minvoice';

// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt) against a fake Minvoice
// (test/fake-minvoice.ts). The `it`s build on each other: run the whole file.

type Json = Record<string, unknown>;

describe('Report site (e2e)', () => {
  let app: INestApplication<App>;
  const fake = new FakeMinvoice();
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  let cs1Id: number;

  const api = () => request(app.getHttpServer());
  const as = (name: string) => {
    const auth = `Bearer ${tokens[name]}`;
    return {
      get: (url: string) => api().get(`/api${url}`).set('Authorization', auth),
      post: (url: string, body: Json = {}) =>
        api().post(`/api${url}`).set('Authorization', auth).send(body),
      put: (url: string, body: Json = {}) =>
        api().put(`/api${url}`).set('Authorization', auth).send(body),
      patch: (url: string, body: Json = {}) =>
        api().patch(`/api${url}`).set('Authorization', auth).send(body),
      delete: (url: string) =>
        api().delete(`/api${url}`).set('Authorization', auth),
    };
  };
  const login = (username: string, site?: 'report') =>
    api()
      .post('/api/auth/login')
      .send({ username, password: '12345678', ...(site ? { site } : {}) });
  const signIn = async (username: string) => {
    const res = await login(username).expect(200);
    const body = res.body as Json;
    tokens[username] = body.access_token as string;
    ids[username] = (body.user as Json).id as number;
  };

  beforeAll(async () => {
    process.env.MINVOICE_URL_TEMPLATE = await fake.start();
    execSync('npx prisma migrate reset --force --skip-generate', {
      env: { ...process.env, SEED_DEMO: '1' },
      stdio: 'pipe',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
    for (const name of ['admin', 'ql1_cs1', 'tn1_cs1', 'ql1_cs2'])
      await signIn(name);
    const branches = (await as('admin').get('/branches').expect(200))
      .body as Json[];
    const branchId = (code: string) =>
      branches.find((b) => b.code === code)!.id as number;
    cs1Id = branchId('cs1');
    // The report site's own accounts, each given "Vào trang báo cáo".
    const accounts: [string, string, number | null][] = [
      ['qlbc_cs1', 'BRANCH_MANAGER', branchId('cs1')],
      ['qlbc_cs2', 'BRANCH_MANAGER', branchId('cs2')],
      ['hdqt_bc', 'BOARD', null],
    ];
    for (const [username, role, branch] of accounts) {
      await as('admin')
        .post('/users', {
          username,
          fullName: username,
          role,
          branchId: branch,
          password: '12345678',
          reportAccess: true,
        })
        .expect(201);
      await signIn(username);
    }
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
    delete process.env.MINVOICE_URL_TEMPLATE;
  });

  describe('access', () => {
    it('lets in the chain manager and the accounts given the right', async () => {
      for (const name of ['admin', 'qlbc_cs1', 'hdqt_bc'])
        await login(name, 'report').expect(200);
    });

    it('turns away the cashier and a branch manager without the right', async () => {
      for (const name of ['tn1_cs1', 'ql1_cs1']) {
        const res = await login(name, 'report').expect(403);
        expect((res.body as Json).message).toBe(
          'Tài khoản này không được vào trang báo cáo',
        );
      }
      // The main site is unchanged for them.
      await login('tn1_cs1').expect(200);
    });

    it('tells the app who has the right', async () => {
      expect(
        (await as('qlbc_cs1').get('/auth/me').expect(200)).body,
      ).toMatchObject({ reportAccess: true });
      expect(
        (await as('ql1_cs1').get('/auth/me').expect(200)).body,
      ).toMatchObject({ reportAccess: false });
    });

    it('is granted by the chain manager only, to branch managers and HĐQT only', async () => {
      const refused = await as('admin')
        .patch(`/users/${ids.tn1_cs1}`, { reportAccess: true })
        .expect(400);
      expect((refused.body as Json).message).toBe(
        'Chỉ tài khoản quản lý cơ sở hoặc HĐQT được vào trang báo cáo',
      );
      const denied = await as('ql1_cs1')
        .patch(`/users/${ids.tn1_cs1}`, { reportAccess: false })
        .expect(403);
      expect((denied.body as Json).message).toBe(
        'Chỉ quản lý hệ thống được cấp quyền vào trang báo cáo',
      );
      await as('admin')
        .patch(`/users/${ids.ql1_cs1}`, { reportAccess: true })
        .expect(200);
      await login('ql1_cs1', 'report').expect(200);
      await as('admin')
        .patch(`/users/${ids.ql1_cs1}`, { reportAccess: false })
        .expect(200);
      await login('ql1_cs1', 'report').expect(403);
    });

    it('goes when the account moves to another role', async () => {
      const created = (
        await as('admin')
          .post('/users', {
            username: 'qlbc_tam',
            fullName: 'QL tạm',
            role: 'BRANCH_MANAGER',
            branchId: cs1Id,
            password: '12345678',
            reportAccess: true,
          })
          .expect(201)
      ).body as Json;
      const moved = (
        await as('admin')
          .patch(`/users/${created.id as number}`, { role: 'CASHIER' })
          .expect(200)
      ).body as Json;
      expect(moved.reportAccess).toBe(false);
      await login('qlbc_tam', 'report').expect(403);
    });
  });
});
```

- [ ] **Step 7: Chạy test**

Run: `cd 502-backend && npm test && npx jest --config ./test/jest-e2e.json test/report-site.e2e-spec.ts --runInBand`
Expected: PASS. Chạy thêm `test/foundation.e2e-spec.ts` và `test/board.e2e-spec.ts` (đăng nhập, tài khoản): PASS.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src/auth 502-backend/src/users 502-backend/test/report-site.e2e-spec.ts
git commit -m "feat(report-site): quyền vào trang báo cáo — đăng nhập site=report, chỉ QL hệ thống cấp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: VAT của nháp và giữ dòng hàng khi xuất

**Files:**
- Modify: `502-backend/src/einvoice/einvoice-draft.ts` (thêm `draftVatOf`, `draftData`, `issuedDraft`)
- Modify: `502-backend/src/einvoice/einvoices.service.ts` (bỏ `clean`/`draftData` cục bộ; `writeOutcome`, `resolve`)
- Test: `502-backend/src/einvoice/einvoice-draft.spec.ts`, `502-backend/src/einvoice/einvoices.service.spec.ts:296`, `502-backend/test/einvoice.e2e-spec.ts`

**Interfaces:**
- Produces (`einvoice-draft.ts`):
  - `draftVatOf(amount: number, lines: EinvoiceLine[]): number`;
  - `draftData(dto: EinvoiceDraftDto)` trả `{ amount, vatAmount, buyerTaxCode, buyerName, draft }`;
  - `issuedDraft(lines: EinvoiceLine[]): Prisma.InputJsonObject`.

- [ ] **Step 1: Test (đỏ)**

Cuối `src/einvoice/einvoice-draft.spec.ts` (sửa import thành `import { draftVatOf, parseDraft } from './einvoice-draft';`):

```ts
describe('draftVatOf', () => {
  const beer = { ...line, quantity: 10, vatRate: 10 as const };

  it('counts what the lines do not cover at 10%, as the filler line would', () => {
    // 1.000.000 with 385.000 of lines: the filler takes 615.000 = 559.091 + 55.909.
    expect(draftVatOf(1_000_000, [beer])).toBe(35_000 + 55_909);
    expect(draftVatOf(110_000, [])).toBe(10_000);
  });

  it('is the VAT of the lines once they add up or go over', () => {
    expect(draftVatOf(385_000, [beer])).toBe(35_000);
    expect(draftVatOf(1_000, [beer])).toBe(35_000);
    expect(draftVatOf(0, [])).toBe(0);
  });
});

describe('parseDraft of an issued invoice', () => {
  it('reads the lines it keeps', () => {
    expect(parseDraft({ lines: [line] })).toEqual({
      buyerAddress: null,
      buyerEmail: null,
      lines: [line],
    });
  });
});
```

Run: `npx jest src/einvoice/einvoice-draft.spec.ts`
Expected: FAIL (`draftVatOf` is not a function).

- [ ] **Step 2: Chuyển `draftData` về `einvoice-draft.ts`, thêm `draftVatOf` và `issuedDraft`**

Đầu `src/einvoice/einvoice-draft.ts` thành:

```ts
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { EinvoiceDraftDto } from './dto/einvoice.dto';
import { fillerLine, lineVatOf, totalsOf } from './einvoice-math';
import { EinvoiceDraft, EinvoiceLine, VAT_RATES } from './einvoice-types';

const clean = (value: string | null | undefined) => value?.trim() || null;

// The VAT an invoice not issued yet is counted with (spec 2026-10-02 §4.4):
// its lines' VAT, plus that of the "Dịch vụ karaoke" filler line (10%) that
// would make up what the lines do not cover yet. Lines that add up need no
// filler, so for an issued invoice this is its lines' VAT.
export function draftVatOf(amount: number, lines: EinvoiceLine[]): number {
  const { total, vatAmount } = totalsOf(lines);
  const filler = fillerLine(amount - total, 10);
  return vatAmount + (filler ? lineVatOf(filler) : 0);
}

// The columns a saved draft writes (spec 2026-10-01 §4.1): the details go in
// `draft`, only in a shape parseDraft reads back (a blank name is refused, a
// null vatAmount is left out).
export function draftData(dto: EinvoiceDraftDto) {
  const lines: EinvoiceLine[] = dto.lines.map((line, index) => {
    const name = line.name.trim();
    if (!name) {
      throw new BadRequestException(
        `Dòng ${index + 1}: tên hàng không được để trống`,
      );
    }
    return {
      name,
      unit: line.unit.trim(),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.vatAmount == null ? {} : { vatAmount: line.vatAmount }),
    };
  });
  const draft: EinvoiceDraft = {
    buyerAddress: clean(dto.buyerAddress),
    buyerEmail: clean(dto.buyerEmail),
    lines,
  };
  return {
    amount: dto.amount,
    vatAmount: draftVatOf(dto.amount, lines),
    buyerTaxCode: clean(dto.buyerTaxCode),
    buyerName: clean(dto.buyerName),
    draft: draft as unknown as Prisma.InputJsonObject,
  };
}

// What an issued invoice keeps of its draft (spec 2026-10-02 §4.3): the lines,
// for the products report of the report site; the buyer's address and email
// go, as before.
export function issuedDraft(lines: EinvoiceLine[]): Prisma.InputJsonObject {
  return { lines } as unknown as Prisma.InputJsonObject;
}
```

(phần `parseDraft` và `isLine` giữ nguyên). Trong `src/einvoice/einvoices.service.ts`:
- xóa `const clean = …` và cả hàm `draftData`;
- sửa import thành `import { draftData, issuedDraft, parseDraft } from './einvoice-draft';`.

- [ ] **Step 3: Giữ dòng hàng ở mọi lệnh ghi `ISSUED`**

`src/einvoice/einvoices.service.ts`:
- trong `resolve`, ngay trên `const data: Prisma.EinvoiceUncheckedUpdateManyInput = dto.found`, thêm:

```ts
    // An issued row keeps its lines (spec 2026-10-02 §4.3).
    const lines = dto.found ? parseDraft(row.draft).lines : [];
```

  rồi trong nhánh `dto.found`, thay hai dòng `vatAmount: totalsOf(parseDraft(row.draft).lines).vatAmount,` và `draft: Prisma.DbNull,` bằng:

```ts
          vatAmount: totalsOf(lines).vatAmount,
          draft: issuedDraft(lines),
```

- trong `writeOutcome`, comment `// Issued: the header stays, the details go (spec §4).` thành `// Issued: the header and the lines stay, the buyer's details go (spec 2026-10-02 §4.3).`, và `draft: Prisma.DbNull,` thành `draft: issuedDraft(lines),`.

- [ ] **Step 4: Unit test của service**

`src/einvoice/einvoices.service.spec.ts`, test `locks it without touching what was sent, then records the invoice found` (dòng ~296): thay `draft: Prisma.DbNull,` bằng `draft: { lines: [line] },`.

Run: `npx jest src/einvoice`
Expected: PASS. Nếu import `Prisma` trong spec chỉ còn dùng cho `PrismaClientKnownRequestError` thì vẫn giữ.

- [ ] **Step 5: e2e hiện có**

`test/einvoice.e2e-spec.ts`:
- Test `are created and edited by the sales roles of the branch`: nháp tạo với `amount: 1000000, lines: [beer]` nay có `vatAmount: '90909'`. Sửa `vatAmount: '35000',` thành:

```ts
        // Its lines' 35.000 + the 10% of the 615.000 they do not cover yet
        // (spec 2026-10-02 §4.4).
        vatAmount: '90909',
```

- Test `issues: Minvoice number kept, details deleted`: đổi tên thành `issues: Minvoice number kept, lines kept, buyer details deleted`, bỏ `draft: null,` khỏi `toMatchObject`, và thêm ngay sau `toMatchObject`:

```ts
      const kept = body.draft as { lines: Json[] };
      expect(kept.lines.map((l) => l.name)).toEqual([
        'Bia Heineken',
        'Dịch vụ karaoke',
      ]);
      expect(kept).not.toHaveProperty('buyerAddress');
```

- Test `creates, lists and issues an invoice without a bill`: chưa sửa; Task 5 thay test này.

Run: `npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand`
Expected: PASS, trừ `creates, lists and issues an invoice without a bill`: test này vẫn mong `draft: null` cho HĐ tự do đã xuất. Tạm sửa dòng `draft: null,` của nó thành `orderId: null,` để qua; Task 5 thay cả test.

- [ ] **Step 6: Commit**

```bash
git add 502-backend/src/einvoice 502-backend/test/einvoice.e2e-spec.ts
git commit -m "feat(report-site): HĐĐT giữ dòng hàng khi xuất, VAT của nháp tính cả phần chưa có dòng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Bỏ HĐĐT tự do; HĐĐT của bill thêm tay trên các route `/einvoices`

**Files:**
- Modify: `502-backend/src/einvoice/dto/einvoice.dto.ts` (`CreateEinvoiceDto`, `EinvoiceListQuery` → `EinvoiceSummaryQuery`)
- Modify: `502-backend/src/einvoice/einvoice-select.ts` (thêm `manualBillId`)
- Modify: `502-backend/src/einvoice/einvoices.service.ts`
- Modify: `502-backend/src/einvoice/einvoices.controller.ts`
- Test: `502-backend/src/einvoice/einvoices.service.spec.ts`, `502-backend/test/einvoice.e2e-spec.ts`, `502-backend/test/report-site.e2e-spec.ts`

**Interfaces:**
- Consumes: `canUseReportSite` (Task 3), `ManualBill` (Task 2).
- Produces:
  - `POST /einvoices {orderId? | manualBillId?, …}`: phải có đúng một trong hai.
  - `EinvoicesService.summary(user, query: EinvoiceSummaryQuery, site: 'main' | 'report' = 'main')`.
  - `EinvoicesService.create(user, dto)` (bỏ tham số `branch`).
  - `EinvoiceSummaryQuery { branch?, from?, to? }`.
  - Mỗi dòng HĐĐT trả về có `manualBillId`.
  - Hằng `REPORT_SITE_ONLY`.
  - Bỏ `GET /einvoices` và `EinvoicesService.list`.

- [ ] **Step 1: Unit test (đỏ)**

Trong `src/einvoice/einvoices.service.spec.ts`:

1. Thay helper `creating` bằng (thêm transaction để khóa bill thêm tay):

```ts
// A service whose prisma creates and updates drafts (create, update). A bill
// thêm tay is read under its lock in a transaction (`tx`).
const creating = () => {
  const einvoice = {
    create: jest.fn().mockResolvedValue({ id: 40 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn().mockResolvedValue({
      id: 40,
      branchId: 1,
      status: 'DRAFT',
      invoiceDate: null,
    }),
  };
  const order = { findUnique: jest.fn() };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([
      { branchId: 3, businessDate: toDbDate('2026-09-01'), cancelledAt: null },
    ]),
    einvoice,
  };
  const prisma = {
    einvoice,
    order,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const scope = {
    resolveBranchId: jest.fn().mockResolvedValue(3),
    assertBranchAccess: jest.fn(),
  };
  const service = new EinvoicesService(
    prisma as never,
    {} as never,
    scope as never,
    {} as never,
    {} as never,
  );
  return { service, einvoice, order, scope, tx };
};
```

2. Thay cả `describe('EinvoicesService free invoices', …)` bằng:

```ts
describe('EinvoicesService invoices of a bill thêm tay', () => {
  afterEach(() => jest.restoreAllMocks());
  const cashier = { id: 8, role: 'CASHIER', reportAccess: false } as AuthUser;

  it('need exactly one bill', async () => {
    const { service } = creating();
    await expect(
      service.create(user, { amount: 0, lines: [] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(user, { orderId: 5, manualBillId: 9, amount: 0, lines: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('are made under the lock of their bill, on its branch and day', async () => {
    const { service, einvoice, tx } = creating();
    await service.create(user, { manualBillId: 9, amount: 110000, lines: [] });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(dataOf(einvoice.create)).toMatchObject({
      branchId: 3,
      manualBillId: 9,
      businessDate: toDbDate('2026-09-01'),
      invoiceDate: toDbDate('2026-09-01'),
      amount: 110000,
      vatAmount: 10000,
    });
    expect(dataOf(einvoice.create)).not.toHaveProperty('orderId');
  });

  it('are refused on a cancelled bill', async () => {
    const { service, tx, einvoice } = creating();
    tx.$queryRaw.mockResolvedValueOnce([
      { branchId: 3, businessDate: toDbDate('2026-09-01'), cancelledAt: new Date() },
    ]);
    await expect(
      service.create(user, { manualBillId: 9, amount: 1, lines: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(einvoice.create).not.toHaveBeenCalled();
  });

  it('are out of reach of whoever may not use the report site', async () => {
    const { service, tx, einvoice } = creating();
    await expect(
      service.create(cashier, { manualBillId: 9, amount: 1, lines: [] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    einvoice.findUnique.mockResolvedValueOnce({
      id: 41,
      branchId: 1,
      manualBillId: 9,
      status: 'DRAFT',
      invoiceDate: null,
    });
    await expect(service.findOne(cashier, 41)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('are issued without an order to check', async () => {
    const { service, einvoice, sender } = setup(issued);
    einvoice.findUnique.mockResolvedValueOnce({
      ...draftRow(),
      order: null,
      manualBillId: 9,
    });
    await service.issue(user, 12, dto);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
```

3. Trong `describe('EinvoicesService invoice dates', …)`, thay test `dates a free invoice today, or as asked` bằng:

```ts
  it('dates a draft of a bill thêm tay by the day of the bill, or as asked', async () => {
    const { service, einvoice } = creating();
    await service.create(user, { manualBillId: 9, amount: 0, lines: [] });
    await service.create(user, {
      manualBillId: 9,
      amount: 0,
      lines: [],
      invoiceDate: '2026-12-31',
    });
    expect(dataOf(einvoice.create, 0).invoiceDate).toEqual(toDbDate('2026-09-01'));
    expect(dataOf(einvoice.create, 1).invoiceDate).toEqual(toDbDate('2026-12-31'));
  });
```

4. Trong `describe('EinvoicesService pending "Không rõ" work', …)`:
   - xóa test `lists invoices being sent with the uncertain ones`, vì danh sách đã bỏ; tab "Không rõ" của danh sách bill đã có test ở `EinvoicesService.bills`;
   - test `counts them together`: sửa kỳ vọng thành `where: { branchId: 1, orderId: { not: null }, status: pending }`;
   - thêm test sau:

```ts
  it('counts every invoice of the branch for the report site', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const service = new EinvoicesService(
      {} as never,
      {
        einvoice: {
          count,
          aggregate: jest.fn().mockResolvedValue({
            _count: { _all: 0 },
            _sum: { amount: null, vatAmount: null },
          }),
        },
      } as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      {} as never,
      {} as never,
    );
    await service.summary(user, {}, 'report');
    expect(count).toHaveBeenCalledWith({
      where: { branchId: 1, status: pending },
    });
  });
```

5. Xóa các import không còn dùng (`businessDateOf` nếu chỉ test HĐ tự do dùng nó).

Run: `npx jest src/einvoice/einvoices.service.spec.ts`
Expected: FAIL (create vẫn nhận HĐ tự do, chưa có `manualBillId`).

- [ ] **Step 2: DTO**

`src/einvoice/dto/einvoice.dto.ts`:

```ts
export class CreateEinvoiceDto extends EinvoiceDraftDto {
  @ApiProperty({
    required: false,
    description: 'Bill đã thanh toán; có đúng một trong orderId, manualBillId',
  })
  @IsOptional()
  @IsInt()
  orderId?: number;

  @ApiProperty({
    required: false,
    description: 'Bill thêm tay của trang báo cáo',
  })
  @IsOptional()
  @IsInt()
  manualBillId?: number;
}
```

Thay `class EinvoiceListQuery` bằng:

```ts
// The tab counts and the issued sums of the chosen business days.
export class EinvoiceSummaryQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false, description: 'Từ ngày kinh doanh của bill' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from?: string;

  @ApiProperty({ required: false, description: 'Đến ngày kinh doanh của bill' })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to?: string;
}
```

Bỏ các import không còn dùng (`IsBoolean`, `Transform`) nếu lint báo.

- [ ] **Step 3: `einvoice-select.ts`**

Trong `einvoiceListSelect`, sau `orderId: true,`: thêm `manualBillId: true,`.

- [ ] **Step 4: Service**

`src/einvoice/einvoices.service.ts`:
- import `ForbiddenException` (từ `@nestjs/common`) và `canUseReportSite` (từ `../auth/roles`);
- đổi `EinvoiceListQuery` thành `EinvoiceSummaryQuery` trong import;
- xóa `list` và `listWhere`.

Thêm dưới `const MANUAL_CHECK = …`:

```ts
const REPORT_SITE_ONLY =
  'Hóa đơn của bill thêm tay chỉ mở được ở trang báo cáo';

// What a new draft writes besides its bill.
type Written = ReturnType<typeof draftData> & {
  createdById: number;
  updatedById: number;
};
```

Thay `summary` bằng:

```ts
  // Pending work counts every day; issued ones the chosen days. Summed in SQL
  // on the report pool. The main site counts the invoices of its own bills
  // only, the report site every invoice of the branch (spec 2026-10-02 §6.2).
  async summary(
    user: AuthUser,
    query: EinvoiceSummaryQuery,
    site: 'main' | 'report' = 'main',
  ) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const businessDate = dateRange(query.from, query.to);
    const own: Prisma.EinvoiceWhereInput =
      site === 'main' ? { branchId, orderId: { not: null } } : { branchId };
    const [draftCount, errorCount, uncertainCount, issued] = await Promise.all([
      this.reportDb.einvoice.count({
        where: { ...own, status: EinvoiceStatus.DRAFT, lastError: null },
      }),
      this.reportDb.einvoice.count({
        where: {
          ...own,
          status: EinvoiceStatus.DRAFT,
          lastError: { not: null },
        },
      }),
      this.reportDb.einvoice.count({
        where: { ...own, status: NOT_SETTLED },
      }),
      this.reportDb.einvoice.aggregate({
        where: { ...own, status: EinvoiceStatus.ISSUED, businessDate },
        _count: { _all: true },
        _sum: { amount: true, vatAmount: true },
      }),
    ]);
    return {
      draftCount,
      errorCount,
      uncertainCount,
      issuedCount: issued._count._all,
      issuedAmount: Number(issued._sum.amount ?? 0),
      issuedVat: Number(issued._sum.vatAmount ?? 0),
    };
  }
```

Thay phần đầu `create` (từ chữ ký tới hết nhánh `if (dto.orderId == null) { … }`) bằng:

```ts
  async create(user: AuthUser, dto: CreateEinvoiceDto) {
    // Every invoice belongs to exactly one bill (spec 2026-10-02 §4.2): a paid
    // bill, or a bill thêm tay of the report site.
    if ((dto.orderId == null) === (dto.manualBillId == null)) {
      throw new BadRequestException('Chọn bill cho hóa đơn');
    }
    const written: Written = {
      createdById: user.id,
      updatedById: user.id,
      ...draftData(dto),
    };
    if (dto.manualBillId != null) {
      return this.createForManualBill(
        user,
        dto.manualBillId,
        written,
        dto.invoiceDate,
      );
    }
```

(phần đọc `order` và tạo nháp cho bill bên chính giữ nguyên). Thêm ngay sau `create`:

```ts
  // A draft of a bill thêm tay. The bill's row is locked while the draft is
  // inserted, so it never lands on a bill being cancelled (the cancel deletes
  // the drafts under the same lock, ManualBillsService.cancel).
  private async createForManualBill(
    user: AuthUser,
    manualBillId: number,
    written: Written,
    invoiceDate?: string,
  ) {
    if (!canUseReportSite(user)) throw new ForbiddenException(REPORT_SITE_ONLY);
    const id = await this.prisma.$transaction(async (tx) => {
      const [bill] = await tx.$queryRaw<
        { branchId: number; businessDate: Date; cancelledAt: Date | null }[]
      >`SELECT "branchId", "businessDate", "cancelledAt" FROM "ManualBill"
        WHERE "id" = ${manualBillId} FOR UPDATE`;
      if (!bill) throw new NotFoundException('Không tìm thấy bill');
      this.scope.assertBranchAccess(user, bill.branchId);
      if (bill.cancelledAt) {
        throw new BadRequestException('Bill đã hủy, không thêm được hóa đơn');
      }
      const created = await tx.einvoice.create({
        data: {
          branchId: bill.branchId,
          manualBillId,
          businessDate: bill.businessDate,
          // The day of the bill, unless the draft says otherwise (spec §4.2).
          invoiceDate: dbDay(
            invoiceDate ?? fromDbDate(bill.businessDate),
            INVALID_INVOICE_DATE,
          ),
          ...written,
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.findOne(user, id);
  }
```

Thêm vào cuối class (cạnh `assertAccess`):

```ts
  // The branch of an invoice, and for one of a bill thêm tay the report site
  // too (spec 2026-10-02 §8): invoice ids are easy to guess, so every route
  // reaching one by id checks both.
  private assertRowAccess(
    user: AuthUser,
    row: { branchId: number; manualBillId?: number | null },
  ) {
    this.scope.assertBranchAccess(user, row.branchId);
    if (row.manualBillId != null && !canUseReportSite(user)) {
      throw new ForbiddenException(REPORT_SITE_ONLY);
    }
  }
```

Rồi dùng nó ở mọi route nhận id:
- `findOne`: `this.scope.assertBranchAccess(user, row.branchId);` → `this.assertRowAccess(user, row);`.
- `assertAccess`: `select: { branchId: true, manualBillId: true }` và `this.assertRowAccess(user, row);`.
- `issue`: thêm `manualBillId: true,` vào `select`, `this.scope.assertBranchAccess(user, row.branchId);` → `this.assertRowAccess(user, row);`, comment `// A free invoice has no bill that could have been voided.` → `// A bill thêm tay has no order: it is never voided (a cancelled one has no invoice left).`
- `resolve` và `editNumber`: thêm `manualBillId: true,` vào `select`, rồi `this.assertRowAccess(user, row);`.

Trong `notLocked`, ngay sau `findUnique`:

```ts
    // Gone meanwhile: its bill thêm tay was cancelled with its drafts.
    if (!now) return new NotFoundException('Không tìm thấy hóa đơn điện tử');
```

- [ ] **Step 5: Controller**

`src/einvoice/einvoices.controller.ts`:
- xóa route `@Get() list(…)`;
- đổi `EinvoiceListQuery` thành `EinvoiceSummaryQuery` ở `summary`;
- `create` thành:

```ts
  @Post()
  @Roles(...EINVOICE_WRITERS)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEinvoiceDto) {
    return this.einvoices.create(user, dto);
  }
```

- bỏ import `EinvoiceBranchQuery` nếu không còn dùng.

Run: `npx jest src/einvoice && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, không lỗi kiểu.

- [ ] **Step 6: e2e hiện có**

`test/einvoice.e2e-spec.ts`:
- `lists drafts whatever their day, and counts them`: thay khối đọc `/einvoices?branch=cs1&status=DRAFT` và `/einvoices?from=2020-01-01&to=2020-01-02` bằng:

```ts
      const drafts = (
        await as('hdqt_hddt')
          .get('/einvoices/bills?branch=cs1&status=DRAFT')
          .expect(200)
      ).body as Json[];
      expect(drafts.map((b) => b.orderId)).toContain(orderId);
```

  (giữ phần `summary` phía sau).
- `refuses a day that does not exist`: xóa hai dòng gọi `/einvoices?from=…`.
- `store only what an issue can read back`: thay khối `found` bằng:

```ts
      const found = (
        await as('tn1_cs1')
          .get(`/einvoices/bills?status=DRAFT&billNumber=${prefix}`)
          .expect(200)
      ).body as Json[];
      expect(found.map((b) => b.orderId)).toContain(orderId);
```

- Thay cả test `creates, lists and issues an invoice without a bill` bằng:

```ts
    it('refuses an invoice without a bill (spec 2026-10-02 §6.2)', async () => {
      for (const body of [
        { amount: 0, lines: [] },
        { orderId, manualBillId: 1, amount: 0, lines: [] },
      ]) {
        const res = await as('tn1_cs1').post('/einvoices', body).expect(400);
        expect((res.body as Json).message).toBe('Chọn bill cho hóa đơn');
      }
    });
```

- [ ] **Step 7: e2e của trang báo cáo**

`test/report-site.e2e-spec.ts`: thêm `import { PrismaService } from '../src/prisma/prisma.service';`, rồi thêm `describe` sau `describe('access', …)`:

```ts
  describe('e-invoices of a bill thêm tay', () => {
    let manualBillId: number;
    let draftId: number;

    it('are made only on the report site, in the branch of the bill', async () => {
      // Task 6 adds the route that makes bills thêm tay; one is written here.
      manualBillId = (
        await app.get(PrismaService).manualBill.create({
          data: {
            branchId: cs1Id,
            businessDate: new Date('2026-09-01T00:00:00Z'),
            billSeq: 900,
            billNumber: '01090000900',
          },
          select: { id: true },
        })
      ).id;
      const body = { manualBillId, amount: 110000, lines: [] };
      for (const name of ['tn1_cs1', 'ql1_cs1']) {
        const res = await as(name).post('/einvoices', body).expect(403);
        expect((res.body as Json).message).toBe(
          'Hóa đơn của bill thêm tay chỉ mở được ở trang báo cáo',
        );
      }
      await as('qlbc_cs2').post('/einvoices', body).expect(403);
      await as('hdqt_bc').post('/einvoices', body).expect(403);
      const created = (
        await as('qlbc_cs1').post('/einvoices', body).expect(201)
      ).body as Json;
      expect(created).toMatchObject({
        orderId: null,
        manualBillId,
        status: 'DRAFT',
        invoiceDate: '2026-09-01',
        vatAmount: '10000',
      });
      draftId = created.id as number;
    });

    it('are out of reach of the main site’s accounts', async () => {
      for (const name of ['tn1_cs1', 'ql1_cs1'])
        await as(name).get(`/einvoices/${draftId}`).expect(403);
      await as('tn1_cs1')
        .patch(`/einvoices/${draftId}`, { amount: 1, lines: [] })
        .expect(403);
      await as('tn1_cs1').delete(`/einvoices/${draftId}`).expect(403);
      await as('qlbc_cs1').get(`/einvoices/${draftId}`).expect(200);
      await as('hdqt_bc').get(`/einvoices/${draftId}`).expect(200);
    });

    it('are not counted on the main site', async () => {
      const main = (await as('tn1_cs1').get('/einvoices/summary').expect(200))
        .body as Json;
      expect(main.draftCount).toBe(0);
    });
  });
```

Run: `npx jest --config ./test/jest-e2e.json test/einvoice.e2e-spec.ts --runInBand && npx jest --config ./test/jest-e2e.json test/report-site.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src/einvoice 502-backend/test
git commit -m "feat(report-site): bỏ HĐĐT tự do, HĐĐT của bill thêm tay chỉ trang báo cáo đụng được

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Bill thêm tay — số bill, tạo, hủy, xem; xóa dữ liệu và xóa phòng

**Files:**
- Modify: `502-backend/src/orders/bill-number.ts`, test `502-backend/src/orders/bill-number.spec.ts`
- Create: `502-backend/src/einvoice/einvoice-filters.ts` (chuyển `dbDay`, `dateRange`, `NOT_SETTLED`, `statusWhere` ra khỏi `einvoices.service.ts`)
- Modify: `502-backend/src/einvoice/einvoices.service.ts` (`manualBillDetail`, `sweepStaleSending`), `502-backend/src/einvoice/einvoice.module.ts` (exports)
- Create: `502-backend/src/report-site/report-site.module.ts`, `report-site.guard.ts`, `report-site.controller.ts`, `manual-bills.service.ts`, `dto/manual-bill.dto.ts`
- Modify: `502-backend/src/app.module.ts`, `502-backend/src/data-purge/data-purge.service.ts`, `502-backend/src/rooms/rooms.service.ts`
- Test: `502-backend/test/report-site.e2e-spec.ts`

**Interfaces:**
- Consumes: `draftData` (Task 4), `canUseReportSite` (Task 3), `REPORT_SITE_ONLY` and `createForManualBill` (Task 5).
- Produces:
  - `nextBillNumberOn(tx, branchId, date: string, roomName?)` returns `{ businessDate: Date, billSeq, billNumber }`.
  - `dbDay`, `dateRange`, `NOT_SETTLED`, `statusWhere` (`src/einvoice/einvoice-filters.ts`).
  - `EinvoicesService.manualBillDetail(user, id)` returns `{ bill: {id, branchId, billNumber, businessDate: 'YYYY-MM-DD', cancelledAt, cancelReason, createdAt, room: {name} | null, createdBy: {id, fullName} | null}, einvoices, allocated }`.
  - `ReportSiteGuard`.
  - `GET /report-site/manual-bills/:id` (READERS).
  - `POST /report-site/manual-bills?branch {businessDate, roomId, amount}` (MANAGERS) returns `{ id, billNumber, businessDate, einvoiceId }`.
  - `POST /report-site/manual-bills/:id/cancel {reason}` (MANAGERS) returns `{ id }`.
  - The purge log gets `deleted.manualBills`.

- [ ] **Step 1: Test số bill theo ngày (đỏ)**

Cuối `src/orders/bill-number.spec.ts` (thêm `nextBillNumberOn` vào import):

```ts
describe('nextBillNumberOn', () => {
  it('numbers a given business day through the shared counter', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ lastSeq: 51 }]) };
    const number = await nextBillNumberOn(tx as never, 1, '2026-10-02', 'P401');
    expect(number).toEqual({
      businessDate: new Date('2026-10-02T00:00:00Z'),
      billSeq: 51,
      billNumber: '02104010051',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npx jest src/orders/bill-number.spec.ts`
Expected: FAIL (`nextBillNumberOn` is not a function).

- [ ] **Step 2: `nextBillNumberOn` (xanh)**

Thay `nextBillNumber` trong `src/orders/bill-number.ts` bằng:

```ts
// Hands out the next number of the branch for business day `date`
// (YYYY-MM-DD). The counter row is incremented atomically and stays locked
// until the transaction ends, so concurrent closings (checkout, cancelling a
// session, a bill thêm tay of the report site) never share a number and a
// rolled-back one gives its number back.
export async function nextBillNumberOn(
  tx: Tx,
  branchId: number,
  date: string,
  roomName?: string | null,
) {
  const [{ lastSeq }] = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "BillCounter" ("branchId", "businessDate", "lastSeq")
    VALUES (${branchId}, ${date}::date, 1)
    ON CONFLICT ("branchId", "businessDate")
    DO UPDATE SET "lastSeq" = "BillCounter"."lastSeq" + 1
    RETURNING "lastSeq"`;
  return {
    businessDate: new Date(`${date}T00:00:00Z`),
    billSeq: lastSeq,
    billNumber: formatBillNumber(date, roomName, lastSeq),
  };
}

// The next number of the branch for the business day of `closedAt`.
export function nextBillNumber(
  tx: Tx,
  branchId: number,
  closedAt: Date,
  roomName?: string | null,
) {
  return nextBillNumberOn(tx, branchId, businessDateOf(closedAt), roomName);
}
```

Run: `npx jest src/orders`
Expected: PASS.

- [ ] **Step 3: `einvoice-filters.ts`**

Tạo `src/einvoice/einvoice-filters.ts`:
- chuyển nguyên văn (cùng comment) `dbDay`, `dateRange`, `NOT_SETTLED`, `statusWhere` từ `einvoices.service.ts` sang, thêm `export` trước từng cái;
- đầu file:

```ts
import { BadRequestException } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../common/dates';

// Filters shared by the e-invoice lists of both sites (spec 2026-10-02 §6).
```

Trong `einvoices.service.ts`:
- xóa bốn định nghĩa đó;
- thêm `import { dateRange, dbDay, NOT_SETTLED, statusWhere } from './einvoice-filters';`.

- [ ] **Step 4: Chi tiết bill thêm tay trong `EinvoicesService`**

`sweepStaleSending`:
- chữ ký thành `target: { id: number } | { orderId: number } | { manualBillId: number }`;
- nhánh `else` thành:

```ts
    } else {
      where = {
        ...target,
        ...(this.sending.size ? { id: { notIn: [...this.sending] } } : {}),
      };
    }
```

Thêm sau `billDetail` (import `staffRef` từ `../orders/order-include`):

```ts
  // A bill thêm tay with its e-invoices, for the report site's panel (spec
  // 2026-10-02 §6.1); ReportSiteGuard let the caller in.
  async manualBillDetail(user: AuthUser, id: number) {
    const bill = await this.prisma.manualBill.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        billNumber: true,
        businessDate: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        room: { select: { name: true } },
        createdBy: staffRef,
      },
    });
    if (!bill) throw new NotFoundException('Không tìm thấy bill');
    this.scope.assertBranchAccess(user, bill.branchId);
    // As billDetail: 200 invoices is far past any real bill.
    const readInvoices = () =>
      this.prisma.einvoice.findMany({
        where: { manualBillId: id },
        select: einvoiceDetailSelect,
        orderBy: { id: 'asc' },
        take: 200,
      });
    const [listed, allocated] = await Promise.all([
      readInvoices(),
      this.prisma.einvoice.aggregate({
        where: { manualBillId: id },
        _sum: { amount: true },
      }),
    ]);
    const einvoices =
      listed.some((e) => e.status === EinvoiceStatus.SENDING) &&
      (await this.sweepStaleSending({ manualBillId: id }))
        ? await readInvoices()
        : listed;
    return {
      bill: { ...bill, businessDate: fromDbDate(bill.businessDate) },
      einvoices: einvoices.map(toEinvoiceRow),
      allocated: Number(allocated._sum.amount ?? 0),
    };
  }
```

`src/einvoice/einvoice.module.ts`: thêm `exports: [EinvoicesService],` vào `@Module`.

- [ ] **Step 5: Module `report-site`**

`src/report-site/report-site.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { canUseReportSite } from '../auth/roles';

// Who may use the report site (spec 2026-10-02-trang-bao-cao-hddt §3, §8),
// checked before any interceptor runs (guards come before interceptors), so
// a computation shared by SharedRequestInterceptor only ever serves callers
// let in.
@Injectable()
export class ReportSiteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !canUseReportSite(user)) {
      throw new ForbiddenException('Bạn không có quyền vào trang báo cáo');
    }
    return true;
  }
}
```

`src/report-site/dto/manual-bill.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Thêm hóa đơn of the report site's Quản lý bán hàng (spec 2026-10-02 §6.1).
export class CreateManualBillDto {
  @ApiProperty({
    description: 'Ngày kinh doanh của bill, YYYY-MM-DD, không sau hôm nay',
  })
  @Matches(DATE_RE, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  businessDate: string;

  @ApiProperty({ description: 'Phòng của cơ sở, vào số bill' })
  @IsInt()
  roomId: number;

  @ApiProperty({ description: 'Số tiền HĐĐT đầu tiên, đã gồm VAT, đồng' })
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  amount: number;
}

export class CancelManualBillDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  @Matches(/\S/, { message: 'Vui lòng nhập lý do hủy' })
  reason: string;
}
```

`src/report-site/manual-bills.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EinvoiceStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf } from '../common/dates';
import { draftData } from '../einvoice/einvoice-draft';
import { dbDay } from '../einvoice/einvoice-filters';
import { nextBillNumberOn } from '../orders/bill-number';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelManualBillDto,
  CreateManualBillDto,
} from './dto/manual-bill.dto';

// Bills thêm tay (spec 2026-10-02-trang-bao-cao-hddt §4.1, §6.1): made on the
// report site only to issue e-invoices, numbered in the branch's sequence of
// their day. Nothing of the main site reads them.
@Injectable()
export class ManualBillsService {
  constructor(
    private prisma: PrismaService,
    private scope: BranchScopeService,
  ) {}

  async create(user: AuthUser, dto: CreateManualBillDto, branch?: string) {
    const branchId = await this.scope.resolveBranchId(user, branch);
    dbDay(dto.businessDate);
    if (dto.businessDate > businessDateOf(new Date())) {
      throw new BadRequestException('Không thêm bill cho ngày sau hôm nay');
    }
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      select: { branchId: true, name: true },
    });
    if (!room || room.branchId !== branchId) {
      throw new BadRequestException('Phòng không thuộc cơ sở này');
    }
    // Short: the day's BillCounter row stays locked until this commits, as
    // in a checkout of the same day.
    return this.prisma.$transaction(async (tx) => {
      const number = await nextBillNumberOn(
        tx,
        branchId,
        dto.businessDate,
        room.name,
      );
      const bill = await tx.manualBill.create({
        data: { branchId, ...number, roomId: dto.roomId, createdById: user.id },
        select: { id: true, billNumber: true },
      });
      const draft = await tx.einvoice.create({
        data: {
          branchId,
          manualBillId: bill.id,
          businessDate: number.businessDate,
          // The day of the bill is its invoice date until the draft says
          // otherwise (spec §4.2).
          invoiceDate: number.businessDate,
          createdById: user.id,
          updatedById: user.id,
          ...draftData({ amount: dto.amount, lines: [] }),
        },
        select: { id: true },
      });
      return {
        id: bill.id,
        billNumber: bill.billNumber,
        businessDate: dto.businessDate,
        einvoiceId: draft.id,
      };
    });
  }

  // Its drafts go with it; a bill holding an invoice sent, uncertain or
  // issued stays, as that invoice is (or may be) on Minvoice. The number is
  // never handed out again.
  async cancel(user: AuthUser, id: number, dto: CancelManualBillDto) {
    const bill = await this.prisma.manualBill.findUnique({
      where: { id },
      select: { branchId: true },
    });
    if (!bill) throw new NotFoundException('Không tìm thấy bill');
    this.scope.assertBranchAccess(user, bill.branchId);
    await this.prisma.$transaction(async (tx) => {
      // The write locks the bill: a draft being added to it waits
      // (EinvoicesService locks it too) and finds it cancelled.
      const { count } = await tx.manualBill.updateMany({
        where: { id, cancelledAt: null },
        data: {
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: dto.reason.trim(),
        },
      });
      if (count === 0) throw new ConflictException('Bill đã hủy');
      await tx.einvoice.deleteMany({
        where: { manualBillId: id, status: EinvoiceStatus.DRAFT },
      });
      // An issue that locked its draft first keeps it (DRAFT → SENDING).
      const left = await tx.einvoice.count({ where: { manualBillId: id } });
      if (left > 0) {
        throw new ConflictException(
          'Bill có hóa đơn đã gửi hoặc đã xuất, không hủy được',
        );
      }
    });
    return { id };
  }
}
```

`src/report-site/report-site.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGERS, READERS } from '../auth/roles';
import { EinvoiceBranchQuery } from '../einvoice/dto/config.dto';
import { EinvoicesService } from '../einvoice/einvoices.service';
import {
  CancelManualBillDto,
  CreateManualBillDto,
} from './dto/manual-bill.dto';
import { ManualBillsService } from './manual-bills.service';
import { ReportSiteGuard } from './report-site.guard';

// The report site (spec 2026-10-02-trang-bao-cao-hddt §6.1): every route
// behind ReportSiteGuard; reading is the managers' and HĐQT's, writing the
// managers'.
@ApiTags('report-site')
@ApiBearerAuth()
@Roles(...READERS)
@UseGuards(ReportSiteGuard)
@Controller('report-site')
export class ReportSiteController {
  constructor(
    private readonly manualBills: ManualBillsService,
    private readonly einvoices: EinvoicesService,
  ) {}

  // A bill thêm tay with its e-invoices (as GET /einvoices/bill/:orderId).
  @Get('manual-bills/:id')
  manualBill(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.einvoices.manualBillDetail(user, id);
  }

  @Post('manual-bills')
  @Roles(...MANAGERS)
  createManualBill(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBranchQuery,
    @Body() dto: CreateManualBillDto,
  ) {
    return this.manualBills.create(user, dto, query.branch);
  }

  @Post('manual-bills/:id/cancel')
  @HttpCode(200)
  @Roles(...MANAGERS)
  cancelManualBill(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelManualBillDto,
  ) {
    return this.manualBills.cancel(user, id, dto);
  }
}
```

`src/report-site/report-site.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { EinvoiceModule } from '../einvoice/einvoice.module';
import { ManualBillsService } from './manual-bills.service';
import { ReportSiteController } from './report-site.controller';

// Trang báo cáo theo hóa đơn điện tử (spec 2026-10-02-trang-bao-cao-hddt).
@Module({
  imports: [EinvoiceModule],
  controllers: [ReportSiteController],
  providers: [ManualBillsService],
})
export class ReportSiteModule {}
```

`src/app.module.ts`: import `ReportSiteModule` và thêm vào `imports` ngay sau `EinvoiceModule`.

- [ ] **Step 6: Xóa dữ liệu và xóa phòng**

`src/data-purge/data-purge.service.ts`, ngay sau dòng `einvoices: …`:

```ts
          // After their e-invoices, before rooms (a bill thêm tay points at both).
          manualBills: (await tx.manualBill.deleteMany({ where: own })).count,
```

`src/rooms/rooms.service.ts`, `remove`:

```ts
    const [orderCount, manualBillCount] = await Promise.all([
      this.prisma.order.count({ where: { roomId: id } }),
      // A bill thêm tay of the report site carries the room in its number.
      this.prisma.manualBill.count({ where: { roomId: id } }),
    ]);
    if (orderCount + manualBillCount > 0) {
```

(giữ nguyên thông báo 409).

- [ ] **Step 7: e2e (đỏ trước khi có route, xanh sau Step 5–6)**

`test/report-site.e2e-spec.ts`:
- thêm import `import { businessDateOf, toDateString } from '../src/common/dates';`;
- thêm `const TAX_CODE = '0107811836';` và `const DAY_MS = 86_400_000;` dưới `type Json`;
- thêm các helper sau `signIn`:

```ts
  // A bill of cs1 paid now, in a room of that name; as GET /orders/:id.
  const paidBill = async (roomName: string) => {
    const room = (
      await as('ql1_cs1')
        .post('/rooms', { name: roomName, pricePerHour: 100000 })
        .expect(201)
    ).body as Json;
    const order = (
      await as('tn1_cs1').post('/orders', { roomId: room.id }).expect(201)
    ).body as Json;
    const products = (await as('tn1_cs1').get('/products').expect(200))
      .body as Json[];
    await as('tn1_cs1')
      .patch(`/orders/${order.id as number}`, {
        items: [{ productId: products[0].id, quantity: 2 }],
      })
      .expect(200);
    await as('tn1_cs1')
      .post(`/orders/${order.id as number}/checkout`, { paymentMethod: 'CASH' })
      .expect(200);
    return (await as('admin').get(`/orders/${order.id as number}`).expect(200))
      .body as Json;
  };
  // DDMM + room (4) + sequence.
  const seqOf = (billNumber: string) => Number(billNumber.slice(8));
  const today = () => businessDateOf(new Date());
  const daysAgo = (n: number) => toDateString(new Date(Date.now() - n * DAY_MS));
  const filler = (unitPrice: number) => ({
    name: 'Dịch vụ karaoke',
    unit: 'Lần',
    quantity: 1,
    unitPrice,
    vatRate: 10,
  });
  const issueToday = (einvoiceId: number) =>
    as('admin')
      .post(`/einvoices/${einvoiceId}/issue`, {
        invoiceDate: toDateString(new Date()),
      })
      .expect(200);
```

- cuối `beforeAll`, thêm phần nối Minvoice giả cho cs1 (cần cho việc xuất):

```ts
    await as('admin')
      .patch(`/branches/${cs1Id}`, { taxCode: TAX_CODE })
      .expect(200);
    await as('admin')
      .post('/einvoice/config/login?branch=cs1', {
        username: 'admin',
        password: fake.password,
      })
      .expect(200);
    const { symbols } = (
      await as('admin').get('/einvoice/config/symbols?branch=cs1').expect(200)
    ).body as { symbols: Json[] };
    await as('admin')
      .put('/einvoice/config/symbol?branch=cs1', {
        registerInvoiceId: symbols[0].registerInvoiceId,
      })
      .expect(200);
```

- thêm hai `describe` sau `describe('e-invoices of a bill thêm tay', …)`. Các task sau chèn `describe` mới **trước** `describe('data purge', …)`, để `data purge` luôn ở cuối file:

```ts
  describe('bills thêm tay', () => {
    let roomId: number;
    const add = (name: string, body: Json) =>
      as(name).post('/report-site/manual-bills?branch=cs1', body);

    it('take the next number of their day, shared with the paid bills', async () => {
      const first = await paidBill('BC 401');
      roomId = first.roomId as number;
      const added = (
        await add('qlbc_cs1', { businessDate: today(), roomId, amount: 110000 })
          .expect(201)
      ).body as Json;
      const second = await paidBill('BC 402');
      expect(seqOf(added.billNumber as string)).toBe(
        seqOf(first.billNumber as string) + 1,
      );
      expect(seqOf(second.billNumber as string)).toBe(
        seqOf(added.billNumber as string) + 1,
      );
      expect((added.billNumber as string).slice(4, 8)).toBe('4010');
      const detail = (
        await as('qlbc_cs1')
          .get(`/report-site/manual-bills/${added.id as number}`)
          .expect(200)
      ).body as { bill: Json; einvoices: Json[]; allocated: number };
      expect(detail.bill).toMatchObject({
        billNumber: added.billNumber,
        businessDate: today(),
        cancelledAt: null,
        room: { name: 'BC 401' },
      });
      expect(detail.einvoices).toHaveLength(1);
      expect(detail.einvoices[0]).toMatchObject({
        id: added.einvoiceId,
        amount: '110000',
        status: 'DRAFT',
        invoiceDate: today(),
      });
      expect(detail.allocated).toBe(110000);
    });

    it('take a past day, never a future one, and a room of their branch', async () => {
      const past = daysAgo(40);
      const added = (
        await add('qlbc_cs1', { businessDate: past, roomId, amount: 1000 })
          .expect(201)
      ).body as Json;
      expect((added.billNumber as string).slice(0, 4)).toBe(
        `${past.slice(8, 10)}${past.slice(5, 7)}`,
      );
      const future = toDateString(new Date(Date.now() + 2 * DAY_MS));
      const res = await add('qlbc_cs1', {
        businessDate: future,
        roomId,
        amount: 1000,
      }).expect(400);
      expect((res.body as Json).message).toBe(
        'Không thêm bill cho ngày sau hôm nay',
      );
      const cs2Room = (
        await as('ql1_cs2')
          .post('/rooms', { name: 'BC2 101', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      await add('qlbc_cs1', {
        businessDate: past,
        roomId: cs2Room.id,
        amount: 1000,
      }).expect(400);
      await add('qlbc_cs1', {
        businessDate: '2026-02-30',
        roomId,
        amount: 1000,
      }).expect(400);
    });

    it('are added by the report site’s managers only', async () => {
      const body = { businessDate: today(), roomId, amount: 1000 };
      for (const name of ['tn1_cs1', 'ql1_cs1', 'hdqt_bc'])
        await add(name, body).expect(403);
      await add('qlbc_cs2', body).expect(403);
      await as('tn1_cs1').get('/report-site/manual-bills/1').expect(403);
      await as('ql1_cs1').get('/report-site/manual-bills/1').expect(403);
    });

    it('are cancelled with their drafts, never with an issued invoice', async () => {
      const drafts = (
        await add('qlbc_cs1', { businessDate: today(), roomId, amount: 50000 })
          .expect(201)
      ).body as Json;
      const cancel = (id: number, reason: string) =>
        as('qlbc_cs1').post(`/report-site/manual-bills/${id}/cancel`, {
          reason,
        });
      await cancel(drafts.id as number, '  ').expect(400);
      await cancel(drafts.id as number, 'Nhập nhầm').expect(200);
      const cancelled = (
        await as('qlbc_cs1')
          .get(`/report-site/manual-bills/${drafts.id as number}`)
          .expect(200)
      ).body as { bill: Json; einvoices: Json[] };
      expect(cancelled.bill).toMatchObject({ cancelReason: 'Nhập nhầm' });
      expect(cancelled.einvoices).toHaveLength(0);
      await cancel(drafts.id as number, 'Lần hai').expect(409);
      await as('qlbc_cs1')
        .post('/einvoices', { manualBillId: drafts.id, amount: 1, lines: [] })
        .expect(400);

      const issued = (
        await add('qlbc_cs1', { businessDate: today(), roomId, amount: 110000 })
          .expect(201)
      ).body as Json;
      const einvoiceId = issued.einvoiceId as number;
      await as('qlbc_cs1')
        .patch(`/einvoices/${einvoiceId}`, {
          amount: 110000,
          lines: [filler(100000)],
        })
        .expect(200);
      await issueToday(einvoiceId);
      const res = await cancel(issued.id as number, 'Nhập nhầm').expect(409);
      expect((res.body as Json).message).toBe(
        'Bill có hóa đơn đã gửi hoặc đã xuất, không hủy được',
      );
      const kept = (
        await as('qlbc_cs1')
          .get(`/report-site/manual-bills/${issued.id as number}`)
          .expect(200)
      ).body as { bill: Json; einvoices: Json[] };
      expect(kept.bill.cancelledAt).toBeNull();
      expect(kept.einvoices[0]).toMatchObject({ status: 'ISSUED' });
    });

    it('keep the rooms they are numbered with', async () => {
      const room = (
        await as('ql1_cs1')
          .post('/rooms', { name: 'BC 499', pricePerHour: 100000 })
          .expect(201)
      ).body as Json;
      await add('qlbc_cs1', {
        businessDate: today(),
        roomId: room.id,
        amount: 1000,
      }).expect(201);
      const res = await as('ql1_cs1')
        .delete(`/rooms/${room.id as number}`)
        .expect(409);
      expect((res.body as Json).message).toMatch(/lịch sử hóa đơn/);
    });
  });

  describe('data purge', () => {
    it('wipes the bills thêm tay of the branch', async () => {
      const res = await as('hdqt_bc')
        .post('/admin/purge', {
          scope: 'branch',
          branch: 'cs1',
          password: '12345678',
        })
        .expect(200);
      expect(
        ((res.body as Json).deleted as Record<string, number>).manualBills,
      ).toBeGreaterThan(0);
      expect(
        await app
          .get(PrismaService)
          .manualBill.count({ where: { branchId: cs1Id } }),
      ).toBe(0);
    });
  });
```

Run: `npm test && npx jest --config ./test/jest-e2e.json test/report-site.e2e-spec.ts --runInBand`
Expected: PASS. Chạy lại `test/einvoice.e2e-spec.ts` (bỏ hàm ra file mới không đổi hành vi): PASS.

- [ ] **Step 8: Commit**

```bash
git add 502-backend/src 502-backend/test/report-site.e2e-spec.ts
git commit -m "feat(report-site): bill thêm tay — đánh số chung dãy bill, tạo, hủy, xem; xóa dữ liệu và xóa phòng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Danh sách bill và tổng của trang báo cáo

**Files:**
- Create: `502-backend/src/report-site/einvoice-metrics.ts`, test `502-backend/src/report-site/einvoice-metrics.spec.ts`
- Create: `502-backend/src/report-site/einvoice-sql.ts`
- Create: `502-backend/src/report-site/report-site-bills.service.ts`
- Modify: `502-backend/src/report-site/report-site.controller.ts`, `502-backend/src/report-site/report-site.module.ts`
- Test: `502-backend/test/report-site.e2e-spec.ts`

**Interfaces:**
- Consumes: `dateRange`, `statusWhere` (Task 6), `EinvoicesService.summary(user, query, 'report')` (Task 5), `billNumberPrefixRange`.
- Produces:
  - `EinvoiceSums { billCount, einvoiceCount, total, vat, issued }` and `EinvoiceMetrics` (adds `revenue`, `pending`), with `emptyEinvoiceSums`, `addEinvoiceSums`, `sumEinvoices`, `toEinvoiceMetrics`.
  - `COUNTED_SQL`, `countedWhere(branchId | undefined, from, to)`, `EINVOICE_SUM_COLUMNS` (`einvoice-sql.ts`).
  - `GET /report-site/bills?branch&from&to&billNumber&status` returns `ReportSiteBill[]` plus `X-Total-Count`.
  - `GET /report-site/bills/summary?branch&from&to` returns `EinvoiceSummary & EinvoiceMetrics`.

- [ ] **Step 1: Test các số (đỏ)**

`src/report-site/einvoice-metrics.spec.ts`:

```ts
import {
  addEinvoiceSums,
  emptyEinvoiceSums,
  sumEinvoices,
  toEinvoiceMetrics,
} from './einvoice-metrics';

const day = {
  billCount: 2,
  einvoiceCount: 3,
  total: 330_000,
  vat: 30_000,
  issued: 110_000,
};

describe('einvoice metrics', () => {
  it('adds the sums of days', () => {
    const acc = emptyEinvoiceSums();
    addEinvoiceSums(acc, day);
    addEinvoiceSums(acc, day);
    expect(acc).toEqual({
      billCount: 4,
      einvoiceCount: 6,
      total: 660_000,
      vat: 60_000,
      issued: 220_000,
    });
    expect(sumEinvoices([day, day])).toEqual(acc);
  });

  it('gives revenue before VAT and what is not issued yet, nothing else', () => {
    expect(toEinvoiceMetrics({ ...day, date: '2026-10-02' } as never)).toEqual({
      ...day,
      revenue: 300_000,
      pending: 220_000,
    });
  });
});
```

Run: `npx jest src/report-site`
Expected: FAIL (module not found).

- [ ] **Step 2: `einvoice-metrics.ts` (xanh)**

```ts
// Sums of the e-invoices the report site counts (spec 2026-10-02 §5.1); pure.

export interface EinvoiceSums {
  billCount: number;
  einvoiceCount: number;
  total: number; // VAT included
  vat: number;
  issued: number; // of the total, issued on Minvoice
}

export interface EinvoiceMetrics extends EinvoiceSums {
  revenue: number; // total − VAT
  pending: number; // total − issued
}

export const emptyEinvoiceSums = (): EinvoiceSums => ({
  billCount: 0,
  einvoiceCount: 0,
  total: 0,
  vat: 0,
  issued: 0,
});

export function addEinvoiceSums(acc: EinvoiceSums, row: EinvoiceSums): void {
  acc.billCount += row.billCount;
  acc.einvoiceCount += row.einvoiceCount;
  acc.total += row.total;
  acc.vat += row.vat;
  acc.issued += row.issued;
}

export function sumEinvoices(rows: EinvoiceSums[]): EinvoiceSums {
  const acc = emptyEinvoiceSums();
  for (const row of rows) addEinvoiceSums(acc, row);
  return acc;
}

// Only the metrics: a SQL row also carries its date, branch or room.
export function toEinvoiceMetrics(sums: EinvoiceSums): EinvoiceMetrics {
  const { billCount, einvoiceCount, total, vat, issued } = sums;
  return {
    billCount,
    einvoiceCount,
    total,
    vat,
    issued,
    revenue: total - vat,
    pending: total - issued,
  };
}
```

Run: `npx jest src/report-site`
Expected: PASS.

- [ ] **Step 3: Mảnh SQL dùng chung (`einvoice-sql.ts`)**

```ts
import { Prisma } from '@prisma/client';
import { branchWhere } from '../reports/report-sql';

// SQL pieces of the report site (spec 2026-10-02-trang-bao-cao-hddt §5), for
// "Einvoice" e LEFT JOIN "Order" o ON o."id" = e."orderId".

// The e-invoices counted: every one still there, except those not issued of
// a bill voided since (they can never be issued). A bill thêm tay that was
// cancelled has none left (ManualBillsService.cancel).
export const COUNTED_SQL = Prisma.sql`(e."status" = 'ISSUED' OR o."cancelledAt" IS NULL)`;

// Counted e-invoices of the business days from..to (a DATE column: no time
// zone to convert), of one branch or the whole chain (undefined).
// Einvoice(branchId, businessDate) index.
export function countedWhere(
  branchId: number | undefined,
  from: string,
  to: string,
): Prisma.Sql {
  return Prisma.sql`e."businessDate" BETWEEN ${from}::date AND ${to}::date
    ${branchWhere(Prisma.sql`e."branchId"`, branchId)}
    AND ${COUNTED_SQL}`;
}

// The EinvoiceSums of a group of counted e-invoices. All the e-invoices of
// a bill carry its business day, so bill counts add up over days and
// branches.
export const EINVOICE_SUM_COLUMNS = Prisma.sql`
  (COUNT(DISTINCT e."orderId") + COUNT(DISTINCT e."manualBillId"))::int AS "billCount",
  COUNT(*)::int AS "einvoiceCount",
  COALESCE(SUM(e."amount"), 0)::float8 AS "total",
  COALESCE(SUM(e."vatAmount"), 0)::float8 AS "vat",
  COALESCE(SUM(e."amount") FILTER (WHERE e."status" = 'ISSUED'), 0)::float8 AS "issued"`;
```

- [ ] **Step 4: `report-site-bills.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf, fromDbDate, toDbDate } from '../common/dates';
import {
  EinvoiceBillsQuery,
  EinvoiceSummaryQuery,
} from '../einvoice/dto/einvoice.dto';
import { dateRange, statusWhere } from '../einvoice/einvoice-filters';
import { EinvoicesService } from '../einvoice/einvoices.service';
import { billNumberPrefixRange } from '../orders/bill-number';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { type EinvoiceSums, toEinvoiceMetrics } from './einvoice-metrics';
import { countedWhere, EINVOICE_SUM_COLUMNS } from './einvoice-sql';

// The newest bills a screen gets (docs/resource-rules.md §1.1).
const LIST_CAP = 500;

// A bill of the report site: a paid bill holding an e-invoice, or a bill thêm tay.
export interface ReportSiteBill {
  orderId: number | null;
  manualBillId: number | null;
  billNumber: string | null;
  businessDate: string | null;
  roomName: string | null;
  // When the bill was paid, or when the bill thêm tay was added.
  time: Date | null;
  cancelledAt: Date | null;
  // The bill's own total; null for a bill thêm tay (its invoices are its total).
  finalAmount: number | null;
  // Every invoice of the bill (what the HĐĐT page splits).
  allocated: number;
  // The invoices counted (spec §5.1).
  total: number;
  vat: number;
  einvoiceCount: number;
  issuedCount: number;
}

interface Tally {
  count: number;
  amount: number;
  vat: number;
}
const tally = (): Tally => ({ count: 0, amount: 0, vat: 0 });

@Injectable()
export class ReportSiteBillsService {
  constructor(
    private db: ReportPrismaService,
    private scope: BranchScopeService,
    private einvoices: EinvoicesService,
  ) {}

  // Like GET /einvoices/bills (spec 2026-10-02 §6.1): the Bill tab lists the
  // days, a bill number every day, a status the bills holding an invoice of
  // it (every day for drafts, errors and uncertain ones; by day for issued).
  async list(
    user: AuthUser,
    query: EinvoiceBillsQuery,
  ): Promise<[ReportSiteBill[], number]> {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const today = toDbDate(businessDateOf(new Date()));
    const days = dateRange(query.from, query.to) ?? { gte: today, lte: today };
    const number = query.billNumber
      ? { billNumber: billNumberPrefixRange(query.billNumber) }
      : {};
    const byDay =
      !query.billNumber && (!query.status || query.status === 'ISSUED');
    // Einvoice (branchId, businessDate) or (branchId, status, createdAt): a
    // bill's e-invoices carry its day.
    const einvoices = {
      some: {
        branchId,
        ...(query.status ? statusWhere(query.status) : {}),
        ...(byDay ? { businessDate: days } : {}),
      },
    };
    const orderWhere: Prisma.OrderWhereInput = { branchId, ...number, einvoices };
    // Every bill thêm tay of the days, with or without an invoice; by status
    // or number like the paid bills.
    const manualWhere: Prisma.ManualBillWhereInput = {
      branchId,
      ...number,
      ...(query.status
        ? { einvoices }
        : query.billNumber
          ? {}
          : { businessDate: days }),
    };
    const newest = [
      { businessDate: 'desc' as const },
      { billSeq: 'desc' as const },
    ];
    const [orders, orderCount, manualBills, manualCount] = await Promise.all([
      this.db.order.findMany({
        where: orderWhere,
        select: {
          id: true,
          billNumber: true,
          businessDate: true,
          billSeq: true,
          endTime: true,
          cancelledAt: true,
          finalAmount: true,
          room: { select: { name: true } },
        },
        orderBy: newest,
        take: LIST_CAP,
      }),
      this.db.order.count({ where: orderWhere }),
      this.db.manualBill.findMany({
        where: manualWhere,
        select: {
          id: true,
          billNumber: true,
          businessDate: true,
          billSeq: true,
          createdAt: true,
          cancelledAt: true,
          room: { select: { name: true } },
        },
        orderBy: newest,
        take: LIST_CAP,
      }),
      this.db.manualBill.count({ where: manualWhere }),
    ]);

    // Newest day first, then the day's sequence, which both kinds share.
    const bills = [
      ...orders.map((o) => ({ kind: 'order' as const, ...o })),
      ...manualBills.map((m) => ({ kind: 'manual' as const, ...m })),
    ]
      .sort(
        (a, b) =>
          (b.businessDate?.getTime() ?? 0) - (a.businessDate?.getTime() ?? 0) ||
          (b.billSeq ?? 0) - (a.billSeq ?? 0),
      )
      .slice(0, LIST_CAP);

    // Per bill and status, in SQL (Einvoice orderId / manualBillId indexes).
    const orderIds = bills.filter((b) => b.kind === 'order').map((b) => b.id);
    const manualIds = bills.filter((b) => b.kind === 'manual').map((b) => b.id);
    const groups =
      bills.length === 0
        ? []
        : await this.db.einvoice.groupBy({
            by: ['orderId', 'manualBillId', 'status'],
            where: {
              OR: [
                { orderId: { in: orderIds } },
                { manualBillId: { in: manualIds } },
              ],
            },
            _sum: { amount: true, vatAmount: true },
            _count: { _all: true },
          });
    const sums = new Map<string, { all: Tally; issued: Tally }>();
    for (const group of groups) {
      const key =
        group.orderId !== null
          ? `order:${group.orderId}`
          : `manual:${group.manualBillId}`;
      const entry = sums.get(key) ?? { all: tally(), issued: tally() };
      const parts =
        group.status === EinvoiceStatus.ISSUED
          ? [entry.all, entry.issued]
          : [entry.all];
      for (const part of parts) {
        part.count += group._count._all;
        part.amount += Number(group._sum.amount ?? 0);
        part.vat += Number(group._sum.vatAmount ?? 0);
      }
      sums.set(key, entry);
    }

    const rows = bills.map((bill): ReportSiteBill => {
      const entry = sums.get(`${bill.kind}:${bill.id}`) ?? {
        all: tally(),
        issued: tally(),
      };
      // Only the issued invoices of a bill voided since (spec §5.1).
      const counted =
        bill.kind === 'order' && bill.cancelledAt ? entry.issued : entry.all;
      return {
        orderId: bill.kind === 'order' ? bill.id : null,
        manualBillId: bill.kind === 'manual' ? bill.id : null,
        billNumber: bill.billNumber,
        businessDate: bill.businessDate ? fromDbDate(bill.businessDate) : null,
        roomName: bill.room?.name ?? null,
        time: bill.kind === 'order' ? bill.endTime : bill.createdAt,
        cancelledAt: bill.cancelledAt,
        finalAmount: bill.kind === 'order' ? Number(bill.finalAmount) : null,
        allocated: entry.all.amount,
        total: counted.amount,
        vat: counted.vat,
        einvoiceCount: entry.all.count,
        issuedCount: entry.issued.count,
      };
    });
    return [rows, orderCount + manualCount];
  }

  // The tab counts (every invoice of the branch) and the sums of the days
  // for the Quản lý bán hàng tiles, both in SQL on the report pool.
  async summary(user: AuthUser, query: EinvoiceSummaryQuery) {
    const counts = await this.einvoices.summary(user, query, 'report');
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const today = businessDateOf(new Date());
    const from = query.from ?? query.to ?? today;
    const to = query.to ?? query.from ?? today;
    const [sums] = await this.db.$queryRaw<EinvoiceSums[]>`
      SELECT ${EINVOICE_SUM_COLUMNS}
      FROM "Einvoice" e
      LEFT JOIN "Order" o ON o."id" = e."orderId"
      WHERE ${countedWhere(branchId, from, to)}`;
    return { ...counts, ...toEinvoiceMetrics(sums) };
  }
}
```

- [ ] **Step 5: Route**

`src/report-site/report-site.controller.ts`:
- thêm import `Res`, `UseInterceptors` (từ `@nestjs/common`), `type { Response } from 'express'`, `SharedRequestInterceptor` (`../common/shared-request.interceptor`), `withTotalCount` (`../common/total-count`), `EinvoiceBillsQuery`, `EinvoiceSummaryQuery` (`../einvoice/dto/einvoice.dto`), `ReportSiteBillsService` (`./report-site-bills.service`);
- constructor thêm `private readonly bills: ReportSiteBillsService,`;
- thêm hai route vào đầu class:

```ts
  // The bills of the report site (spec 2026-10-02 §6.1): the paid bills
  // holding an e-invoice and the bills thêm tay.
  @Get('bills')
  billList(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBillsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.bills.list(user, query));
  }

  @Get('bills/summary')
  @UseInterceptors(SharedRequestInterceptor)
  billSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceSummaryQuery,
  ) {
    return this.bills.summary(user, query);
  }
```

`report-site.module.ts`: thêm `ReportSiteBillsService` vào `providers`.

- [ ] **Step 6: e2e**

Chèn trước `describe('data purge', …)`:

```ts
  describe('bills of the report site', () => {
    const bills = (query = '', name = 'qlbc_cs1') =>
      as(name).get(`/report-site/bills?branch=cs1${query}`);
    const summary = async () =>
      (await as('qlbc_cs1').get('/report-site/bills/summary?branch=cs1').expect(200))
        .body as Json;

    it('lists the paid bills holding an e-invoice and the bills thêm tay of the days', async () => {
      const paid = await paidBill('BC 403');
      const before = (await bills().expect(200)).body as Json[];
      expect(before.some((b) => b.orderId === paid.id)).toBe(false);
      await as('tn1_cs1')
        .post('/einvoices', { orderId: paid.id, amount: 50000, lines: [] })
        .expect(201);
      const res = await bills().expect(200);
      const rows = res.body as Json[];
      expect(rows.find((b) => b.orderId === paid.id)).toMatchObject({
        manualBillId: null,
        total: 50000,
        allocated: 50000,
        einvoiceCount: 1,
        issuedCount: 0,
        finalAmount: Number(paid.finalAmount),
      });
      // Today's bills thêm tay, the cancelled one too.
      expect(
        rows.filter((b) => b.manualBillId !== null).length,
      ).toBeGreaterThanOrEqual(3);
      expect(rows.some((b) => b.cancelledAt !== null)).toBe(true);
      expect(Number(res.headers['x-total-count'])).toBe(rows.length);
      const seqs = rows.map((b) => seqOf(b.billNumber as string));
      expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
    });

    it('counts only the issued invoices of a bill voided since', async () => {
      const bill = await paidBill('BC 404');
      const kept = (
        await as('tn1_cs1')
          .post('/einvoices', {
            orderId: bill.id,
            amount: 110000,
            lines: [filler(100000)],
          })
          .expect(201)
      ).body as Json;
      await issueToday(kept.id as number);
      await as('tn1_cs1')
        .post('/einvoices', { orderId: bill.id, amount: 30000, lines: [] })
        .expect(201);
      const before = await summary();
      await as('admin')
        .post(`/orders/${bill.id as number}/void`, { reason: 'Khách đổi phòng' })
        .expect(200);
      const after = await summary();
      expect((before.total as number) - (after.total as number)).toBe(30000);
      const [row] = (
        await bills(`&billNumber=${bill.billNumber as string}`).expect(200)
      ).body as Json[];
      expect(row).toMatchObject({
        orderId: bill.id,
        total: 110000,
        allocated: 140000,
        einvoiceCount: 2,
        issuedCount: 1,
      });
      expect(row.cancelledAt).toEqual(expect.any(String));
    });

    it('finds bills by the status of their invoices, every day for drafts', async () => {
      const drafts = (await bills('&status=DRAFT').expect(200)).body as Json[];
      // The bill thêm tay of 2026-09-01 ("e-invoices of a bill thêm tay").
      expect(drafts.some((b) => b.billNumber === '01090000900')).toBe(true);
      const main = (await as('tn1_cs1').get('/einvoices/summary').expect(200))
        .body as Json;
      expect((await summary()).draftCount as number).toBeGreaterThan(
        main.draftCount as number,
      );
    });

    it('belongs to the report site', async () => {
      await bills('', 'tn1_cs1').expect(403);
      await bills('', 'ql1_cs1').expect(403);
      await as('ql1_cs1').get('/report-site/bills/summary').expect(403);
      await bills('', 'qlbc_cs2').expect(403);
      await bills('', 'hdqt_bc').expect(200);
    });
  });
```

Run: `npx jest src/report-site && npx jest --config ./test/jest-e2e.json test/report-site.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 502-backend/src/report-site 502-backend/test/report-site.e2e-spec.ts
git commit -m "feat(report-site): danh sách bill và tổng theo HĐĐT của trang báo cáo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Ba báo cáo theo HĐĐT

**Files:**
- Create: `502-backend/src/report-site/einvoice-products.ts`, test `502-backend/src/report-site/einvoice-products.spec.ts`
- Modify: `502-backend/src/report-site/einvoice-sql.ts` (dòng hàng)
- Create: `502-backend/src/report-site/einvoice-reports.service.ts`, `502-backend/src/report-site/report-site-reports.controller.ts`
- Modify: `502-backend/src/report-site/report-site.module.ts`
- Test: `502-backend/test/report-site.e2e-spec.ts`

**Interfaces:**
- Consumes: `countedWhere`, `EINVOICE_SUM_COLUMNS`, các hàm tổng (Task 7); `reportScope`, `bucketsBetween`, `previousRange`, `rollUp`, `rank` (`src/reports`); `ReportQuery`, `RoomReportQuery`, `ReportRangeQuery` (`src/reports/dto/report-query`).
- Produces:
  - `GET /report-site/reports/revenue?branch&from&to&groupBy&compare` → `{ branchId, range, groupBy, totals, previous, buckets, byBranch }` (số liệu là `EinvoiceMetrics`).
  - `GET /report-site/reports/rooms?branch&from&to&by` → `{ branchId, range, by, totals, rows: (EinvoiceMetrics & { id, name, type, branchCode, rooms })[] }`.
  - `GET /report-site/reports/products?branch&from&to` → `{ branchId, range, totals: { revenue, vat, total }, rows: { kind: 'item' | 'others' | 'unlisted', name, unit, quantity, revenue, vat, total }[] }`.
  - `PRODUCT_ROWS = 1000`, `productRows(lines, totals)`.

- [ ] **Step 1: Test ghép dòng báo cáo Hàng hóa (đỏ)**

`src/report-site/einvoice-products.spec.ts`:

```ts
import { productRows } from './einvoice-products';

describe('productRows', () => {
  const beer = {
    name: 'Bia Tiger',
    unit: 'Lon',
    quantity: 3,
    revenue: 300_000,
    vat: 30_000,
    others: false,
  };
  const others = {
    name: null,
    unit: null,
    quantity: null,
    revenue: 50_000,
    vat: 5_000,
    others: true,
  };
  const sum = (rows: { revenue: number; vat: number; total: number }[]) =>
    rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        vat: acc.vat + r.vat,
        total: acc.total + r.total,
      }),
      { revenue: 0, vat: 0, total: 0 },
    );

  it('adds what the invoices hold beyond their lines, so the rows add up', () => {
    const rows = productRows([beer, others], {
      total: 495_000,
      vat: 45_000,
      lineRevenue: 350_000,
      lineVat: 35_000,
    });
    expect(rows.map((r) => r.kind)).toEqual(['item', 'others', 'unlisted']);
    expect(rows[2]).toMatchObject({ revenue: 100_000, vat: 10_000, total: 110_000 });
    expect(sum(rows)).toEqual({ revenue: 450_000, vat: 45_000, total: 495_000 });
  });

  it('has no "Chưa có dòng hàng" row when the lines cover everything', () => {
    const rows = productRows([beer], {
      total: 330_000,
      vat: 30_000,
      lineRevenue: 300_000,
      lineVat: 30_000,
    });
    expect(rows).toEqual([
      {
        kind: 'item',
        name: 'Bia Tiger',
        unit: 'Lon',
        quantity: 3,
        revenue: 300_000,
        vat: 30_000,
        total: 330_000,
      },
    ]);
  });
});
```

Run: `npx jest src/report-site/einvoice-products.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: `einvoice-products.ts` (xanh)**

```ts
// The products report of the report site (spec 2026-10-02 §5.3); pure.

// Rows of lines grouped by name and unit; the SQL keeps the first ones and
// gathers the rest in a single "others" row.
export const PRODUCT_ROWS = 1000;

export interface ProductLineSums {
  name: string | null;
  unit: string | null;
  quantity: number | null;
  revenue: number; // before VAT
  vat: number;
  others: boolean;
}

// The counted invoices' sums, and those of all their lines.
export interface ProductTotals {
  total: number;
  vat: number;
  lineRevenue: number;
  lineVat: number;
}

export interface EinvoiceProductRow {
  // item: a name and unit; others: past PRODUCT_ROWS; unlisted: "Chưa có dòng
  // hàng", what the invoices hold beyond their lines (drafts without lines,
  // invoices issued before lines were kept, drafts whose lines do not match).
  kind: 'item' | 'others' | 'unlisted';
  name: string | null;
  unit: string | null;
  quantity: number | null;
  revenue: number;
  vat: number;
  total: number;
}

// The rows always add up to the revenue report of the same days.
export function productRows(
  lines: ProductLineSums[],
  totals: ProductTotals,
): EinvoiceProductRow[] {
  const rows: EinvoiceProductRow[] = lines.map((line) => ({
    kind: line.others ? 'others' : 'item',
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    revenue: line.revenue,
    vat: line.vat,
    total: line.revenue + line.vat,
  }));
  const revenue = totals.total - totals.vat - totals.lineRevenue;
  const vat = totals.vat - totals.lineVat;
  if (revenue !== 0 || vat !== 0) {
    rows.push({
      kind: 'unlisted',
      name: null,
      unit: null,
      quantity: null,
      revenue,
      vat,
      total: revenue + vat,
    });
  }
  return rows;
}
```

Run: `npx jest src/report-site/einvoice-products.spec.ts`
Expected: PASS.

- [ ] **Step 3: Dòng hàng trong SQL (`einvoice-sql.ts`)**

Thêm cuối file:

```ts
// The lines of an e-invoice's draft as rows `l` (jsonb); an invoice issued
// before lines were kept has none.
export const EINVOICE_LINES = Prisma.sql`jsonb_array_elements(COALESCE(e."draft"->'lines', '[]'::jsonb)) l`;

// A line priced as einvoice-math.ts does: before VAT = round(quantity ×
// unitPrice); VAT = its own vatAmount (a filler line) or round(before VAT ×
// vatRate / 100). Numeric arithmetic: round() halves away from zero, like
// Math.round on these positive amounts.
export const LINE_REVENUE = Prisma.sql`round((l->>'quantity')::numeric * (l->>'unitPrice')::numeric)`;
export const LINE_VAT = Prisma.sql`COALESCE((l->>'vatAmount')::numeric, round(round((l->>'quantity')::numeric * (l->>'unitPrice')::numeric) * (l->>'vatRate')::numeric / 100))`;
```

- [ ] **Step 4: `einvoice-reports.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { rank } from '../reports/breakdowns';
import { bucketsBetween, previousRange, rollUp } from '../reports/buckets';
import {
  ReportQuery,
  ReportRangeQuery,
  RoomReportQuery,
} from '../reports/dto/report-query';
import { reportScope } from '../reports/report-scope';
import {
  addEinvoiceSums,
  type EinvoiceSums,
  emptyEinvoiceSums,
  sumEinvoices,
  toEinvoiceMetrics,
} from './einvoice-metrics';
import {
  PRODUCT_ROWS,
  type ProductLineSums,
  productRows,
  type ProductTotals,
} from './einvoice-products';
import {
  countedWhere,
  EINVOICE_LINES,
  EINVOICE_SUM_COLUMNS,
  LINE_REVENUE,
  LINE_VAT,
} from './einvoice-sql';

type DailyRow = EinvoiceSums & { date: string; branchId: number };

// The reports of the report site (spec 2026-10-02-trang-bao-cao-hddt §5):
// the counted e-invoices by the business day of their bill, on the report
// pool. Shapes follow the main reports so their pages read alike.
@Injectable()
export class EinvoiceReportsService {
  constructor(
    private db: ReportPrismaService,
    private scope: BranchScopeService,
  ) {}

  async revenue(user: AuthUser, query: ReportQuery) {
    const branchId = await reportScope(this.scope, user, query);
    const groupBy = query.groupBy ?? 'day';
    const previous = query.compare
      ? previousRange(query.from, query.to, groupBy)
      : null;
    const [daily, previousDaily, branches] = await Promise.all([
      this.daily(branchId, query.from, query.to),
      previous
        ? this.daily(branchId, previous.from, previous.to)
        : Promise.resolve([]),
      branchId === undefined
        ? this.db.branch.findMany({
            orderBy: { code: 'asc' },
            select: { id: true, code: true, name: true, active: true },
          })
        : Promise.resolve(null),
    ]);
    // Totals, periods and branches all come from the same rows.
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      groupBy,
      totals: toEinvoiceMetrics(sumEinvoices(daily)),
      previous: previous && {
        ...previous,
        totals: toEinvoiceMetrics(sumEinvoices(previousDaily)),
      },
      buckets: rollUp(
        bucketsBetween(query.from, query.to, groupBy),
        groupBy,
        daily,
        emptyEinvoiceSums,
        (acc, row) => addEinvoiceSums(acc, row),
      ).map(({ bucket, value }) => ({ ...bucket, ...toEinvoiceMetrics(value) })),
      // Every active branch, and an inactive one that has invoices.
      byBranch:
        branches &&
        branches
          .filter((b) => b.active || daily.some((r) => r.branchId === b.id))
          .map((b) => ({
            branchId: b.id,
            code: b.code,
            name: b.name,
            ...toEinvoiceMetrics(
              sumEinvoices(daily.filter((r) => r.branchId === b.id)),
            ),
          })),
    };
  }

  // Every room of the scope, also those without invoices; "Không phòng" (id
  // null) for the bills thêm tay of the migration and rooms out of scope.
  async rooms(user: AuthUser, query: RoomReportQuery) {
    const branchId = await reportScope(this.scope, user, query);
    const by = query.by ?? 'room';
    const [sums, rooms] = await Promise.all([
      this.db.$queryRaw<(EinvoiceSums & { roomId: number | null })[]>`
        SELECT COALESCE(o."roomId", m."roomId") AS "roomId", ${EINVOICE_SUM_COLUMNS}
        FROM "Einvoice" e
        LEFT JOIN "Order" o ON o."id" = e."orderId"
        LEFT JOIN "ManualBill" m ON m."id" = e."manualBillId"
        WHERE ${countedWhere(branchId, query.from, query.to)}
        GROUP BY 1`,
      this.db.room.findMany({
        where: { branchId },
        orderBy: [{ branchId: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          type: true,
          branch: { select: { code: true } },
        },
      }),
    ]);
    const sumsOf = new Map(sums.map((row) => [row.roomId, row]));
    const groups = new Map<
      number | string,
      {
        id: number | string;
        name: string;
        type: string;
        branchCode: string | null;
        rooms: number;
        sums: EinvoiceSums;
      }
    >();
    for (const room of rooms) {
      const id = by === 'room' ? room.id : room.type;
      const group = groups.get(id) ?? {
        id,
        name: by === 'room' ? room.name : room.type,
        type: room.type,
        branchCode: by === 'room' ? room.branch.code : null,
        rooms: 0,
        sums: emptyEinvoiceSums(),
      };
      group.rooms += 1;
      addEinvoiceSums(group.sums, sumsOf.get(room.id) ?? emptyEinvoiceSums());
      groups.set(id, group);
    }
    type RoomRow = {
      id: number | string | null;
      name: string | null;
      type: string | null;
      branchCode: string | null;
      rooms: number;
    } & ReturnType<typeof toEinvoiceMetrics>;
    const rows: RoomRow[] = [...groups.values()].map(
      ({ sums: own, ...group }) => ({ ...group, ...toEinvoiceMetrics(own) }),
    );
    const roomIds = new Set(rooms.map((r) => r.id));
    const outOfScope = sums.filter(
      (row) => row.roomId === null || !roomIds.has(row.roomId),
    );
    if (outOfScope.length) {
      rows.push({
        id: null,
        name: null,
        type: null,
        branchCode: null,
        rooms: 0,
        ...toEinvoiceMetrics(sumEinvoices(outOfScope)),
      });
    }
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      by,
      totals: toEinvoiceMetrics(sumEinvoices(sums)),
      rows: rank(rows, (r) => r.revenue),
    };
  }

  // Lines grouped by name (spaces squeezed, any case) and unit; the first
  // PRODUCT_ROWS by revenue, the rest in one row, then "Chưa có dòng hàng".
  async products(user: AuthUser, query: ReportRangeQuery) {
    const branchId = await reportScope(this.scope, user, query);
    const where = countedWhere(branchId, query.from, query.to);
    const [lines, [totals]] = await Promise.all([
      this.db.$queryRaw<ProductLineSums[]>`
        WITH lines AS (
          SELECT regexp_replace(btrim(l->>'name'), '[[:space:]]+', ' ', 'g') AS "name",
            btrim(COALESCE(l->>'unit', '')) AS "unit",
            (l->>'quantity')::numeric AS "quantity",
            ${LINE_REVENUE} AS "revenue",
            ${LINE_VAT} AS "vat"
          FROM "Einvoice" e
          LEFT JOIN "Order" o ON o."id" = e."orderId"
          CROSS JOIN LATERAL ${EINVOICE_LINES}
          WHERE ${where}
        ), grouped AS (
          SELECT min("name") AS "name", "unit", SUM("quantity") AS "quantity",
            SUM("revenue") AS "revenue", SUM("vat") AS "vat",
            row_number() OVER (ORDER BY SUM("revenue") DESC, lower(min("name"))) AS "rank"
          FROM lines
          GROUP BY lower("name"), "unit"
        )
        SELECT "name", "unit", "quantity"::float8 AS "quantity",
          "revenue"::float8 AS "revenue", "vat"::float8 AS "vat", false AS "others"
        FROM grouped WHERE "rank" <= ${PRODUCT_ROWS}
        UNION ALL
        SELECT NULL, NULL, NULL, SUM("revenue")::float8, SUM("vat")::float8, true
        FROM grouped WHERE "rank" > ${PRODUCT_ROWS}
        HAVING COUNT(*) > 0
        ORDER BY "others", "revenue" DESC`,
      this.db.$queryRaw<ProductTotals[]>`
        SELECT COALESCE(SUM(e."amount"), 0)::float8 AS "total",
          COALESCE(SUM(e."vatAmount"), 0)::float8 AS "vat",
          COALESCE(SUM(x."revenue"), 0)::float8 AS "lineRevenue",
          COALESCE(SUM(x."vat"), 0)::float8 AS "lineVat"
        FROM "Einvoice" e
        LEFT JOIN "Order" o ON o."id" = e."orderId"
        CROSS JOIN LATERAL (
          SELECT SUM(${LINE_REVENUE}) AS "revenue", SUM(${LINE_VAT}) AS "vat"
          FROM ${EINVOICE_LINES}
        ) x
        WHERE ${where}`,
    ]);
    return {
      branchId: branchId ?? null,
      range: { from: query.from, to: query.to },
      totals: {
        revenue: totals.total - totals.vat,
        vat: totals.vat,
        total: totals.total,
      },
      rows: productRows(lines, totals),
    };
  }

  // Sums per business day and branch: one query per range, so totals,
  // periods and branches always agree.
  private daily(branchId: number | undefined, from: string, to: string) {
    return this.db.$queryRaw<DailyRow[]>`
      SELECT to_char(e."businessDate", 'YYYY-MM-DD') AS "date",
        e."branchId" AS "branchId", ${EINVOICE_SUM_COLUMNS}
      FROM "Einvoice" e
      LEFT JOIN "Order" o ON o."id" = e."orderId"
      WHERE ${countedWhere(branchId, from, to)}
      GROUP BY 1, 2`;
  }
}
```

- [ ] **Step 5: Controller và module**

`src/report-site/report-site-reports.controller.ts`:

```ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { READERS } from '../auth/roles';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import {
  ReportQuery,
  ReportRangeQuery,
  RoomReportQuery,
} from '../reports/dto/report-query';
import { EinvoiceReportsService } from './einvoice-reports.service';
import { ReportSiteGuard } from './report-site.guard';

// Doanh thu, Phòng, Hàng hóa of the report site (spec 2026-10-02 §6.1). The
// guard runs before the interceptor, so a shared computation only serves
// callers let in.
@ApiTags('report-site')
@ApiBearerAuth()
@Roles(...READERS)
@UseGuards(ReportSiteGuard)
@UseInterceptors(SharedRequestInterceptor)
@Controller('report-site/reports')
export class ReportSiteReportsController {
  constructor(private readonly reports: EinvoiceReportsService) {}

  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.reports.revenue(user, query);
  }

  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser, @Query() query: RoomReportQuery) {
    return this.reports.rooms(user, query);
  }

  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() query: ReportRangeQuery) {
    return this.reports.products(user, query);
  }
}
```

`report-site.module.ts`: thêm `ReportSiteReportsController` vào `controllers`, `EinvoiceReportsService` vào `providers`.

- [ ] **Step 6: e2e**

Chèn trước `describe('data purge', …)`. Ngày `D` (50 ngày trước) chỉ có dữ liệu của `describe` này:

```ts
  describe('reports', () => {
    const D = daysAgo(50);
    const report = (path: string, query: string, name = 'qlbc_cs1') =>
      as(name).get(`/report-site/reports/${path}?branch=cs1&from=${D}&to=${D}${query}`);
    const beer = (name: string, quantity: number) => ({
      name,
      unit: 'Lon',
      quantity,
      unitPrice: 100000,
      vatRate: 10,
    });
    let laterId: number;

    it('sets up three bills thêm tay on one past day', async () => {
      const room = async (name: string) =>
        (
          (
            await as('ql1_cs1')
              .post('/rooms', { name, pricePerHour: 100000 })
              .expect(201)
          ).body as Json
        ).id as number;
      const r501 = await room('BC 501');
      const r502 = await room('BC 502');
      const add = async (roomId: number, amount: number) =>
        (
          await as('qlbc_cs1')
            .post('/report-site/manual-bills?branch=cs1', {
              businessDate: D,
              roomId,
              amount,
            })
            .expect(201)
        ).body as Json;
      await add(r501, 110000); // no line: all of it "Chưa có dòng hàng"
      const b = await add(r502, 220000);
      await as('qlbc_cs1')
        .patch(`/einvoices/${b.einvoiceId as number}`, {
          amount: 220000,
          lines: [beer('Bia  Tiger ', 2)],
        })
        .expect(200);
      const c = await add(r502, 110000);
      await as('qlbc_cs1')
        .patch(`/einvoices/${c.einvoiceId as number}`, {
          amount: 110000,
          lines: [beer('bia tiger', 1)],
        })
        .expect(200);
      laterId = b.einvoiceId as number;
    });

    it('sums the revenue of the counted invoices', async () => {
      const body = (await report('revenue', '&groupBy=day&compare=1').expect(200))
        .body as Json;
      expect(body.totals).toEqual({
        billCount: 3,
        einvoiceCount: 3,
        total: 440000,
        vat: 40000,
        issued: 0,
        revenue: 400000,
        pending: 440000,
      });
      expect((body.previous as Json).totals).toMatchObject({ total: 0 });
      expect((body.buckets as Json[])[0]).toMatchObject({ key: D, total: 440000 });
      await issueToday(laterId);
      const issued = (await report('revenue', '').expect(200)).body as Json;
      expect(issued.totals).toMatchObject({ issued: 220000, pending: 220000 });
    });

    it('splits it by room, adding up to the revenue', async () => {
      const body = (await report('rooms', '&by=room').expect(200)).body as {
        totals: Json;
        rows: Json[];
      };
      const byName = new Map(body.rows.map((r) => [r.name, r.total]));
      expect(byName.get('BC 501')).toBe(110000);
      expect(byName.get('BC 502')).toBe(330000);
      expect(body.rows.reduce((s, r) => s + (r.total as number), 0)).toBe(440000);
    });

    it('groups the lines by name and unit, and keeps the rest apart', async () => {
      const body = (await report('products', '').expect(200)).body as {
        totals: Json;
        rows: Json[];
      };
      expect(body.totals).toEqual({ revenue: 400000, vat: 40000, total: 440000 });
      const [item, unlisted] = body.rows;
      expect(item).toMatchObject({
        kind: 'item',
        unit: 'Lon',
        quantity: 3,
        revenue: 300000,
        vat: 30000,
      });
      expect((item.name as string).toLowerCase()).toBe('bia tiger');
      // Issued: its lines stay in the report.
      expect(unlisted).toMatchObject({
        kind: 'unlisted',
        revenue: 100000,
        vat: 10000,
        total: 110000,
      });
    });

    it('shows the whole chain to the chain manager and HĐQT', async () => {
      const body = (
        await as('hdqt_bc')
          .get(`/report-site/reports/revenue?from=${D}&to=${D}`)
          .expect(200)
      ).body as Json;
      expect(body.branchId).toBeNull();
      expect((body.byBranch as Json[]).length).toBeGreaterThan(1);
    });

    it('belongs to the report site', async () => {
      await report('revenue', '', 'tn1_cs1').expect(403);
      await report('revenue', '', 'ql1_cs1').expect(403);
      await as('qlbc_cs1')
        .get(`/report-site/reports/revenue?branch=cs2&from=${D}&to=${D}`)
        .expect(403);
      await as('qlbc_cs1')
        .get('/report-site/reports/products?branch=cs1&from=2010-01-01&to=2026-01-01')
        .expect(400);
    });
  });
```

Run: `npx jest src/report-site && npx jest --config ./test/jest-e2e.json test/report-site.e2e-spec.ts --runInBand`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 502-backend/src/report-site 502-backend/test/report-site.e2e-spec.ts
git commit -m "feat(report-site): báo cáo doanh thu, phòng, hàng hóa theo hóa đơn điện tử

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Trang chính — ô "Vào trang báo cáo" và nhãn nhật ký xóa

**Files:**
- Modify: `502-frontend/src/app/[branch]/admin/users/page.tsx`
- Modify: `502-frontend/src/app/[branch]/admin/purge-logs/page.tsx`

**Interfaces:**
- Consumes: `User.reportAccess` (Task 1), the backend rules (Task 3): only the chain manager sends `reportAccess`.

- [ ] **Step 1: Form tài khoản**

Trong `app/[branch]/admin/users/page.tsx`:

1. Dưới `const MANAGER_ROLES …`:

```ts
// Vào trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1): only for these
// roles, set by the chain manager only (the chain manager always has it).
const REPORT_ACCESS_ROLES: Role[] = ["BRANCH_MANAGER", "BOARD"];
```

2. `interface UserForm`: thêm `reportAccess: boolean;` sau `managesPr`.
3. `openForm`: tài khoản mới thì `reportAccess: false,`; tài khoản cũ thì `reportAccess: target.reportAccess,`.
4. Trong `save`, đối tượng `assignment` thêm:

```ts
      // Sent by the chain manager only: the server refuses it from anyone else.
      ...(isChainManager
        ? { reportAccess: REPORT_ACCESS_ROLES.includes(form.role) && form.reportAccess }
        : {}),
```

5. Ngay sau `Field` "Quản lý PR/KTV":

```tsx
                {isChainManager && REPORT_ACCESS_ROLES.includes(form.role) && (
                  <Field>
                    <FieldLabel htmlFor="user-report-access">Vào trang báo cáo</FieldLabel>
                    <Select
                      value={form.reportAccess ? "yes" : "no"}
                      onValueChange={(value) => setForm({ ...form, reportAccess: value === "yes" })}
                    >
                      <SelectTrigger id="user-report-access" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="no">Không</SelectItem>
                          <SelectItem value="yes">Có – đăng nhập được trang báo cáo</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>Trang báo cáo theo hóa đơn điện tử, ở tên miền baocao.</FieldDescription>
                  </Field>
                )}
```

6. Danh sách: cạnh badge `Quản lý PR/KTV` thêm `{u.reportAccess && <Badge variant="outline">Trang báo cáo</Badge>}`, và trong dòng chữ `ONLY_NARROW` thêm `{u.reportAccess && " · trang báo cáo"}`.

- [ ] **Step 2: Nhãn nhật ký xóa dữ liệu**

`app/[branch]/admin/purge-logs/page.tsx`, trong `DELETED_LABELS`, ngay sau `["einvoices", "hóa đơn điện tử"],`:

```ts
  ["manualBills", "bill thêm tay"],
```

- [ ] **Step 3: Kiểm tra**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint`
Expected: không lỗi.

Trình duyệt (`backend-preview` + `frontend-preview`), đăng nhập `admin` ở trang chính, vào Tài khoản:
- sửa `ql1_cs1`: có ô "Vào trang báo cáo"; chọn Có rồi lưu thì danh sách hiện badge "Trang báo cáo";
- sửa `tn1_cs1`: không có ô này;
- đăng nhập `ql1_cs1` vào trang Tài khoản: không thấy ô này khi sửa thu ngân, và lưu vẫn thành công.

- [ ] **Step 4: Commit**

```bash
git add "502-frontend/src/app/[branch]/admin"
git commit -m "feat(web): ô Vào trang báo cáo trong tài khoản, nhãn bill thêm tay ở nhật ký xóa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Trang HĐĐT dùng chung cho hai trang; bỏ HĐĐT tự do; bill thêm tay

**Files:**
- Modify: `502-frontend/src/lib/types.ts` (`EinvoiceRow`, kiểu mới của trang báo cáo)
- Create: `502-frontend/src/lib/einvoice-bills.ts`
- Modify: `502-frontend/src/components/einvoices/bill-split.tsx` (thêm `ManualBillSplit`)
- Modify: `502-frontend/src/components/einvoices/einvoice-bill-list.tsx` (viết lại)
- Create: `502-frontend/src/components/einvoices/einvoices-page.tsx` (thân trang cũ, có `site`)
- Modify: `502-frontend/src/app/[branch]/sales/einvoices/page.tsx`
- Create: `502-frontend/src/app/report/[branch]/sales/einvoices/{layout,page}.tsx`
- Modify: `502-frontend/src/components/einvoices/issued-view.tsx`, `einvoice-row.tsx` (comment)

**Interfaces:**
- Consumes: `/report-site/bills`, `/report-site/bills/summary`, `/report-site/manual-bills/:id` (Tasks 6–7), `POST /einvoices {manualBillId}` (Task 5).
- Produces:
  - Kiểu (`lib/types.ts`): `EinvoiceMetrics`, `ReportSiteBill`, `ReportSiteSummary`, `ManualBillDetail`, `CreatedManualBill`.
  - `lib/einvoice-bills.ts`: `BillRef`, `BillDetail`, `sameBill`, `billKey`, `billRefOf`, `billBody`, `billUrl`, `detailRef`.
  - `EinvoicesPage({ site })`; trang đọc `?bill=<orderId>`, `?manualBill=<id>` và `?day=YYYY-MM-DD`.

- [ ] **Step 1: Kiểu dữ liệu (`lib/types.ts`)**

Trong `EinvoiceRow`:
- comment `// GET /einvoices (newest 500).` thành `// An e-invoice as the lists and the panel show it.`;
- `orderId: number | null; // null: a free invoice, made without a bill` thành:

```ts
  // Its bill: a paid bill, or a bill thêm tay of the report site (exactly one).
  orderId: number | null;
  manualBillId: number | null;
```

Trong `EinvoiceDetail`, comment `// One invoice with its draft (null once issued).` thành `// One invoice with its draft; once issued only its lines are kept (none for the ones issued before 02/10/2026).`.

Thêm cuối phần Hóa đơn điện tử:

```ts
// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt): sums of the e-invoices
// counted (every one still there, but those not issued of a voided bill).
export interface EinvoiceMetrics {
  billCount: number;
  einvoiceCount: number;
  total: number; // VAT included
  vat: number;
  issued: number; // of the total, issued on Minvoice
  revenue: number; // total − VAT
  pending: number; // total − issued
}

// GET /report-site/bills: the paid bills holding an e-invoice, and the bills thêm tay.
export interface ReportSiteBill {
  orderId: number | null;
  manualBillId: number | null;
  billNumber: string | null;
  businessDate: string | null;
  roomName: string | null;
  time: string | null; // paid at; added at for a bill thêm tay
  cancelledAt: string | null;
  finalAmount: number | null; // null for a bill thêm tay
  allocated: number; // every invoice of the bill
  total: number; // the invoices counted
  vat: number;
  einvoiceCount: number;
  issuedCount: number;
}

// GET /report-site/bills/summary: the tab counts and the sums of the days.
export interface ReportSiteSummary extends EinvoiceSummary, EinvoiceMetrics {}

// GET /report-site/manual-bills/:id.
export interface ManualBillDetail {
  bill: {
    id: number;
    branchId: number;
    billNumber: string;
    businessDate: string;
    cancelledAt: string | null;
    cancelReason: string | null;
    createdAt: string;
    room: { name: string } | null;
    createdBy: StaffRef | null;
  };
  einvoices: EinvoiceDetail[];
  allocated: number;
}

// POST /report-site/manual-bills.
export interface CreatedManualBill {
  id: number;
  billNumber: string;
  businessDate: string;
  einvoiceId: number;
}
```

- [ ] **Step 2: `lib/einvoice-bills.ts`**

```ts
import type { EinvoiceBillDetail, EinvoiceDetail, ManualBillDetail } from "@/lib/types";

// A bill of the e-invoice page (spec 2026-10-02-trang-bao-cao-hddt §7.5): a
// paid bill, or a bill thêm tay of the report site.
export interface BillRef {
  kind: "order" | "manual";
  id: number;
}

// What the panel reads of an open bill.
export type BillDetail = EinvoiceBillDetail | ManualBillDetail;

export const sameBill = (a: BillRef | null, b: BillRef | null) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;

export const billKey = (bill: BillRef) => `${bill.kind}:${bill.id}`;

// The bill an invoice belongs to: every invoice has exactly one.
export function billRefOf(einvoice: Pick<EinvoiceDetail, "orderId" | "manualBillId">): BillRef {
  return einvoice.orderId !== null
    ? { kind: "order", id: einvoice.orderId }
    : { kind: "manual", id: einvoice.manualBillId as number };
}

// What a new draft of the bill is posted with.
export const billBody = (bill: BillRef) =>
  bill.kind === "order" ? { orderId: bill.id } : { manualBillId: bill.id };

// Where the bill is read with its invoices.
export const billUrl = (bill: BillRef) =>
  bill.kind === "order" ? `/einvoices/bill/${bill.id}` : `/report-site/manual-bills/${bill.id}`;

// The bill an answer belongs to.
export const detailRef = (detail: BillDetail): BillRef =>
  "order" in detail ? { kind: "order", id: detail.order.id } : { kind: "manual", id: detail.bill.id };
```

- [ ] **Step 3: `bill-split.tsx` — dòng hóa đơn dùng chung, thêm `ManualBillSplit`**

Viết lại file:

```tsx
"use client";

import { EinvoiceRow } from "@/components/einvoices/einvoice-row";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { EinvoiceBillDetail, EinvoiceDetail, ManualBillDetail } from "@/lib/types";

// What an open bill hands its invoice rows.
interface RowProps {
  selectedId: number | null;
  focusId: number | null;
  // The invoice whose unsaved edits the panel holds.
  dirtyId: number | null;
  // The invoice the panel is saving or issuing.
  lockedId: number | null;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
}

// The small invoices of a bill, HĐ 1, HĐ 2… (by id), with their amounts.
function InvoiceRows({
  einvoices,
  editable,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  onSelect,
  onSaved,
  onDeleted,
  onSavingChange,
}: RowProps & { einvoices: EinvoiceDetail[]; editable: boolean }) {
  if (einvoices.length === 0) {
    return <p className="px-3 py-1 text-sm text-muted-foreground">Chưa có hóa đơn nhỏ.</p>;
  }
  return (
    <ul>
      {einvoices.map((einvoice, index) => (
        <EinvoiceRow
          key={einvoice.id}
          einvoice={einvoice}
          label={`HĐ ${index + 1}`}
          selected={selectedId === einvoice.id}
          editable={editable}
          autoFocus={focusId === einvoice.id}
          forceConfirm={dirtyId === einvoice.id}
          locked={lockedId === einvoice.id}
          onSelect={() => onSelect(einvoice.id)}
          onSaved={onSaved}
          onDeleted={() => onDeleted(einvoice.id)}
          onSavingChange={onSavingChange}
        />
      ))}
    </ul>
  );
}

// The open paid bill in the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do
// §5.2): what is split, what to watch, and its small invoices.
export function BillSplit({ detail, ...rows }: RowProps & { detail: EinvoiceBillDetail }) {
  const { order, einvoices, allocated } = detail;
  const billTotal = Number(order.finalAmount);
  const editedAfter = !!order.editedAt && einvoices.some((e) => e.createdAt < (order.editedAt as string));
  const discounted = Number(order.discountAmount) > 0 || Number(order.hourlyDiscountAmount) > 0;
  return (
    <div className="flex flex-col gap-1 border-t py-2">
      <p className="px-3 text-xs text-muted-foreground tabular-nums">
        VAT {formatMoney(order.taxAmount)}
        {discounted &&
          ` · giảm món ${formatMoney(order.discountAmount)}, giờ ${formatMoney(order.hourlyDiscountAmount)}`}
        {` · đã chia ${formatMoney(allocated)} · `}
        {allocated > billTotal ? `vượt ${formatMoney(allocated - billTotal)}` : `còn ${formatMoney(billTotal - allocated)}`}
      </p>
      {allocated > billTotal && <p className="px-3 text-xs text-warning">Tổng các hóa đơn vượt tổng bill.</p>}
      {order.cancelledAt && (
        <p className="px-3 text-xs text-warning">Bill đã hủy lúc {formatDateTime(order.cancelledAt)}.</p>
      )}
      {editedAfter && (
        <p className="px-3 text-xs text-warning">
          Bill đã sửa lúc {formatDateTime(order.editedAt)}, sau khi tạo hóa đơn.
        </p>
      )}
      <InvoiceRows einvoices={einvoices} editable={order.status === "COMPLETED"} {...rows} />
    </div>
  );
}

// An open bill thêm tay (report site, spec 2026-10-02 §7.5): who added it and
// its invoices. Its total is what its invoices hold, so nothing is "left".
export function ManualBillSplit({ detail, ...rows }: RowProps & { detail: ManualBillDetail }) {
  const { bill, einvoices } = detail;
  return (
    <div className="flex flex-col gap-1 border-t py-2">
      <p className="px-3 text-xs text-muted-foreground">
        Bill thêm tay ngày {formatDate(bill.businessDate)}
        {bill.createdBy && ` · ${bill.createdBy.fullName} thêm lúc ${formatDateTime(bill.createdAt)}`}
      </p>
      {bill.cancelledAt && (
        <p className="px-3 text-xs text-warning">
          Bill đã hủy lúc {formatDateTime(bill.cancelledAt)}
          {bill.cancelReason ? `: ${bill.cancelReason}` : ""}.
        </p>
      )}
      <InvoiceRows einvoices={einvoices} editable={!bill.cancelledAt} {...rows} />
    </div>
  );
}
```

- [ ] **Step 4: Chữ của "Gửi lại" và comment của dòng hóa đơn**

`components/einvoices/issued-view.tsx`: `description` của hộp xác nhận "Gửi lại" thành (không còn HĐ tự do nên mọi hóa đơn đều có bill):

```tsx
        description={`Hóa đơn này giữ nguyên, ở đây và trên Minvoice. Hệ thống tạo một nháp mới của cùng bill với số tiền ${formatMoney(einvoice.amount)}, MST và tên người mua, ngày hôm nay; dòng hàng, địa chỉ và email cần nhập lại trước khi Xuất. Phần đã chia của bill tính cả hai hóa đơn.`}
```

`components/einvoices/einvoice-row.tsx`: comment `// A row of the open bill (with its draft) or of the free list (without).` thành `// A row of the open bill, with its draft.`

- [ ] **Step 5: Viết lại `einvoice-bill-list.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, FileCheck2Icon, PlusIcon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ListLimitNotice } from "@/components/data-states";
import { DateRangePicker, type DateRangeValue } from "@/components/date-range-picker";
import { BillSplit, ManualBillSplit } from "@/components/einvoices/bill-split";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBranchCode } from "@/lib/branch";
import { type BillDetail, type BillRef, billKey, sameBill } from "@/lib/einvoice-bills";
import { billLabel, businessDate, formatDate, formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Site } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { EinvoiceBill, EinvoiceDetail, EinvoiceSummary, ReportSiteBill } from "@/lib/types";

// "BILLS" lists the bills of the days; the others the bills holding an
// invoice of that status (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
export type EinvoiceTab = "BILLS" | "DRAFT" | "ERROR" | "UNCERTAIN" | "ISSUED";

const TABS: { value: EinvoiceTab; label: string; count?: keyof EinvoiceSummary }[] = [
  { value: "BILLS", label: "Bill" },
  { value: "DRAFT", label: "Nháp", count: "draftCount" },
  { value: "ERROR", label: "Lỗi", count: "errorCount" },
  // With the sends still in flight or cut off (badge "Đang gửi").
  { value: "UNCERTAIN", label: "Không rõ", count: "uncertainCount" },
  { value: "ISSUED", label: "Đã xuất", count: "issuedCount" },
];

// A bill of the left column, from the list of either site.
interface ListedBill {
  ref: BillRef;
  billNumber: string | null;
  roomName: string | null;
  // When a paid bill was paid; a bill thêm tay shows its day instead.
  time: string | null;
  businessDate: string | null;
  cancelledAt: string | null;
  // The bill's own total; null for a bill thêm tay, whose invoices are its total.
  finalAmount: number | null;
  allocated: number;
  einvoiceCount: number;
}

// GET /einvoices/bills (main site): the paid bills.
const fromMainList = (bill: EinvoiceBill): ListedBill => ({
  ref: { kind: "order", id: bill.orderId },
  billNumber: bill.billNumber,
  roomName: bill.roomName,
  time: bill.endTime,
  businessDate: null,
  cancelledAt: bill.cancelledAt,
  finalAmount: Number(bill.finalAmount),
  allocated: bill.allocated,
  einvoiceCount: bill.einvoiceCount,
});

// GET /report-site/bills: paid bills holding an invoice, and bills thêm tay.
const fromReportList = (bill: ReportSiteBill): ListedBill => ({
  ref:
    bill.manualBillId !== null
      ? { kind: "manual", id: bill.manualBillId }
      : { kind: "order", id: bill.orderId as number },
  billNumber: bill.billNumber,
  roomName: bill.roomName,
  time: bill.time,
  businessDate: bill.businessDate,
  cancelledAt: bill.cancelledAt,
  finalAmount: bill.finalAmount,
  allocated: bill.allocated,
  einvoiceCount: bill.einvoiceCount,
});

// Left column: the bills, each opened in place to split it. On the report
// site (spec 2026-10-02 §7.5) the paid bills holding an invoice and the bills
// thêm tay. Rendered inside @container/main, so its responsive classes are
// container variants.
export function EinvoiceBillList({
  site,
  initialDay,
  version,
  openBill,
  openBillDetail,
  openBillLoading,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  savingIds,
  creating,
  onToggleBill,
  onSelect,
  onCreate,
  onSaved,
  onDeleted,
  onSavingChange,
}: {
  site: Site;
  // The day listed first (a link from Quản lý bán hàng); today's business day otherwise.
  initialDay: string | null;
  // Bumped after every write: the lists and counts reload.
  version: number;
  openBill: BillRef | null;
  // The open bill once loaded (null meanwhile), and whether it is being read.
  openBillDetail: BillDetail | null;
  openBillLoading: boolean;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  // The invoice the panel is saving or issuing: its amount box waits.
  lockedId: number | null;
  // The invoices whose amount is being saved: the + of their bill waits.
  savingIds: number[];
  // billKey of the bill a new draft is being made for.
  creating: string | null;
  onToggleBill: (bill: BillRef, tab: EinvoiceTab) => void;
  onSelect: (bill: BillRef, einvoiceId: number) => void;
  // A new draft at once: what is left of a paid bill, 0 for a bill thêm tay.
  onCreate: (bill: BillRef, amount: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (bill: BillRef, einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
}) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const canWrite = can(user, "einvoices.write");
  const report = site === "report";
  const [tab, setTab] = useState<EinvoiceTab>("BILLS");
  const [range, setRange] = useState<DateRangeValue>(() => {
    const day = initialDay ?? businessDate();
    return { from: day, to: day };
  });
  const [search, setSearch] = useState("");
  // A bill number searches every day (the server ignores the dates then).
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  // Drafts, errors and uncertain ones are work still to do: every day.
  const dated = tab === "BILLS" || tab === "ISSUED";
  const status = tab === "BILLS" ? undefined : tab;
  const days = dated && !billNumber ? range : {};

  const bills = useApiData<(EinvoiceBill | ReportSiteBill)[]>(
    report ? "/report-site/bills" : "/einvoices/bills",
    { branch, status, billNumber: billNumber || undefined, ...days },
    [],
    "Không thể tải danh sách bill",
  );
  const rows = report
    ? (bills.data as ReportSiteBill[]).map(fromReportList)
    : (bills.data as EinvoiceBill[]).map(fromMainList);
  // The tab counts: pending work of every day, issued ones of the chosen days
  // (summed in SQL, never from a capped list).
  const summary = useApiData<EinvoiceSummary | null>(
    report ? "/report-site/bills/summary" : "/einvoices/summary",
    { branch, ...range },
    null,
    "Không thể tải số hóa đơn",
  );
  const reloadBills = bills.reload;
  const reloadSummary = summary.reload;
  useEffect(() => {
    if (version === 0) return;
    reloadBills();
    reloadSummary();
  }, [version, reloadBills, reloadSummary]);

  // Over more than one day a bill shows its date too.
  const showDate = !dated || !!billNumber || range.from !== range.to;
  const emptyText = billNumber
    ? "Không có bill nào khớp số này."
    : tab === "BILLS"
      ? report
        ? "Không có bill có hóa đơn điện tử hay bill thêm tay trong khoảng ngày này."
        : "Không có bill đã thanh toán trong khoảng ngày này."
      : tab === "ISSUED"
        ? "Không có hóa đơn đã xuất trong khoảng ngày này."
        : "Không có hóa đơn nào ở trạng thái này.";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tabs value={tab} onValueChange={(value) => setTab(value as EinvoiceTab)}>
        {/* The list's own h-9 is set for the horizontal orientation, so the override carries the same variant. */}
        <TabsList className="max-w-full flex-wrap justify-start group-data-[orientation=horizontal]/tabs:h-auto">
          {TABS.map((t) => {
            const count = t.count && summary.data ? summary.data[t.count] : 0;
            return (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {count ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        {dated && !billNumber ? (
          <DateRangePicker value={range} onChange={setRange} />
        ) : (
          <span className="text-sm text-muted-foreground">Mọi ngày</span>
        )}
        <Input
          type="search"
          inputMode="numeric"
          placeholder="Tìm số bill…"
          aria-label="Tìm theo số bill"
          maxLength={15}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 @md/main:w-44 @md/main:flex-none"
        />
      </div>
      <ListLimitNotice
        shown={bills.data.length}
        total={bills.total}
        noun="bill"
        hint="Chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
      />
      {/* Skeleton only before the first answer: a reload after a write keeps
          the list, so an open bill and a focused amount box stay put. */}
      {bills.loading && bills.data.length === 0 ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileCheck2Icon} title="Không có bill" description={emptyText} className="rounded-xl border" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((bill) => {
            const open = sameBill(openBill, bill.ref);
            return (
              <BillItem
                key={billKey(bill.ref)}
                bill={bill}
                open={open}
                detail={open ? openBillDetail : null}
                detailLoading={open && openBillLoading}
                showDate={showDate}
                canWrite={canWrite}
                creating={creating === billKey(bill.ref)}
                selectedId={selectedId}
                focusId={focusId}
                dirtyId={dirtyId}
                lockedId={lockedId}
                savingIds={savingIds}
                onToggle={() => onToggleBill(bill.ref, tab)}
                onCreate={onCreate}
                onSelect={(einvoiceId) => onSelect(bill.ref, einvoiceId)}
                onSaved={onSaved}
                onDeleted={(einvoiceId) => onDeleted(bill.ref, einvoiceId)}
                onSavingChange={onSavingChange}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BillItem({
  bill,
  open,
  detail,
  detailLoading,
  showDate,
  canWrite,
  creating,
  selectedId,
  focusId,
  dirtyId,
  lockedId,
  savingIds,
  onToggle,
  onCreate,
  onSelect,
  onSaved,
  onDeleted,
  onSavingChange,
}: {
  bill: ListedBill;
  open: boolean;
  detail: BillDetail | null;
  // The bill is open and being read again (after a write, or just opened).
  detailLoading: boolean;
  showDate: boolean;
  canWrite: boolean;
  creating: boolean;
  selectedId: number | null;
  focusId: number | null;
  dirtyId: number | null;
  lockedId: number | null;
  savingIds: number[];
  onToggle: () => void;
  onCreate: (bill: BillRef, amount: number) => void;
  onSelect: (einvoiceId: number) => void;
  onSaved: (row: EinvoiceDetail) => void;
  onDeleted: (einvoiceId: number) => void;
  onSavingChange: (einvoiceId: number, saving: boolean) => void;
}) {
  const manual = bill.ref.kind === "manual";
  const total = bill.finalAmount;
  // The open bill, once loaded, is fresher than the list.
  const allocated = detail ? detail.allocated : bill.allocated;
  const count = detail ? detail.einvoices.length : bill.einvoiceCount;
  const label = billLabel({ id: bill.ref.id, billNumber: bill.billNumber });
  // + hands out what is left of the bill, so it waits until that is known: its
  // own create, a read of the bill, or an amount of its invoices being saved.
  const plusBusy = creating || detailLoading || !!detail?.einvoices.some((e) => savingIds.includes(e.id));
  const when = manual ? formatDate(bill.businessDate) : showDate ? formatDateTime(bill.time) : formatTime(bill.time);
  const split = !count
    ? "Chưa có HĐĐT"
    : total === null
      ? `${count} HĐ`
      : `Đã chia ${formatMoney(allocated)} · ${count} HĐ`;
  const rows = { selectedId, focusId, dirtyId, lockedId, onSelect, onSaved, onDeleted, onSavingChange };
  return (
    <li className="rounded-xl border">
      <div className="flex items-center gap-2 py-1 pr-2 pl-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted/50"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {label} · {bill.roomName ?? "—"}
            </span>
            <span
              className={cn(
                "block truncate text-xs text-muted-foreground tabular-nums",
                total !== null && allocated > total && "text-warning",
              )}
            >
              {when} · {split}
            </span>
          </span>
          {manual && <Badge variant="outline">Thêm tay</Badge>}
          {bill.cancelledAt && <Badge variant="warning">Đã hủy</Badge>}
          <span className="shrink-0 tabular-nums">{formatMoney(total ?? allocated)}</span>
        </button>
        {canWrite && !bill.cancelledAt && (
          <Button
            size="icon"
            variant="outline"
            aria-label={`Thêm hóa đơn nhỏ cho bill ${label}`}
            title="Thêm hóa đơn nhỏ"
            disabled={plusBusy}
            className={cn(open && "border-primary")}
            onClick={() => onCreate(bill.ref, total === null ? 0 : Math.max(0, total - allocated))}
          >
            {creating ? <Spinner /> : <PlusIcon />}
          </Button>
        )}
      </div>
      {open &&
        (detail ? (
          "order" in detail ? (
            <BillSplit detail={detail} {...rows} />
          ) : (
            <ManualBillSplit detail={detail} {...rows} />
          )
        ) : (
          <div className="border-t p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
    </li>
  );
}
```

- [ ] **Step 6: Thân trang dùng chung `components/einvoices/einvoices-page.tsx`**

```bash
cd 502-frontend
git mv "src/app/[branch]/sales/einvoices/page.tsx" src/components/einvoices/einvoices-page.tsx
```

Rồi viết lại `src/components/einvoices/einvoices-page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileCheck2Icon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data-states";
import { EinvoiceBillList, type EinvoiceTab } from "@/components/einvoices/einvoice-bill-list";
import { EinvoiceConfigCard } from "@/components/einvoices/einvoice-config-card";
import { buyerOf, EinvoiceIssuePanel } from "@/components/einvoices/einvoice-issue-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import {
  type BillDetail,
  type BillRef,
  billBody,
  billKey,
  billRefOf,
  billUrl,
  detailRef,
  sameBill,
} from "@/lib/einvoice-bills";
import { billLabel, toDateInput } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Site } from "@/lib/site";
import type { EinvoiceConfigView, EinvoiceDetail } from "@/lib/types";

// The invoice in the right column, of the open bill.
interface Selection {
  bill: BillRef;
  einvoiceId: number;
}

// What a new draft may carry besides its amount (Gửi lại of an issued one).
interface DraftExtra {
  buyerTaxCode?: string;
  buyerName?: string;
  invoiceDate?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The bill a link opens: ?bill=<orderId> or ?manualBill=<id> (Quản lý bán
// hàng of the report site sends one, with ?day for the list).
function linkedBill(params: URLSearchParams): BillRef | null {
  const order = Number(params.get("bill"));
  if (Number.isInteger(order) && order > 0) return { kind: "order", id: order };
  const manual = Number(params.get("manualBill"));
  if (Number.isInteger(manual) && manual > 0) return { kind: "manual", id: manual };
  return null;
}

// The invoice a bill opens on: the first of the tab it was opened from, else
// the first not issued, else the first (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §5.2).
function firstOf(detail: BillDetail, tab: EinvoiceTab): number | null {
  const matches = (e: EinvoiceDetail) =>
    tab === "DRAFT"
      ? e.status === "DRAFT" && !e.lastError
      : tab === "ERROR"
        ? e.status === "DRAFT" && !!e.lastError
        : tab === "UNCERTAIN"
          ? e.status === "UNCERTAIN" || e.status === "SENDING"
          : tab === "ISSUED"
            ? e.status === "ISSUED"
            : false;
  const { einvoices } = detail;
  return (einvoices.find(matches) ?? einvoices.find((e) => e.status !== "ISSUED") ?? einvoices[0])?.id ?? null;
}

// Hóa đơn điện tử of both sites (spec 2026-10-02-trang-bao-cao-hddt §7.5): the
// main site splits its paid bills; the report site the paid bills holding an
// invoice and its bills thêm tay.
export function EinvoicesPage({ site }: { site: Site }) {
  const { user } = useAuth();
  const branch = useBranchCode();
  const notify = useNotify();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const config = useApiData<EinvoiceConfigView | null>(
    "/einvoice/config",
    { branch },
    null,
    "Không thể tải cấu hình Minvoice",
  );
  const [openBill, setOpenBill] = useState<BillRef | null>(() => linkedBill(searchParams));
  const [initialDay] = useState(() => {
    const day = searchParams.get("day");
    return day && DAY_RE.test(day) ? day : null;
  });
  // The tab the open bill was opened from: it decides the invoice shown first.
  const [openedFrom, setOpenedFrom] = useState<EinvoiceTab>("BILLS");
  const [selected, setSelected] = useState<Selection | null>(null);
  // Phones show the panel in a Sheet, opened only by tapping an invoice.
  const [sheetOpen, setSheetOpen] = useState(false);
  // A draft just made: the cursor goes to its amount.
  const [focusId, setFocusId] = useState<number | null>(null);
  // billKey of the bill a new draft is being made for.
  const [creating, setCreating] = useState<string | null>(null);
  // Bumped after every write so the lists and counts reload.
  const [listVersion, setListVersion] = useState(0);
  // Unsaved edits in the panel. Closing or reloading the tab asks through
  // beforeunload, and every switch inside the page through run(); leaving
  // through the sidebar is not guarded.
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  // The panel is saving or issuing its invoice: that invoice's amount box in the
  // left column waits (the two PATCHes would overwrite each other).
  const [panelWorking, setPanelWorking] = useState(false);
  // The invoices whose amount box is being saved: the panel's save and the +
  // of their bill wait for the saved row to be back.
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const rowSaving = useCallback(
    (einvoiceId: number, saving: boolean) =>
      setSavingIds((ids) => (saving ? [...ids, einvoiceId] : ids.filter((id) => id !== einvoiceId))),
    [],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // One read of the open bill serves both columns.
  const bill = useApiData<BillDetail | null>(
    openBill === null ? null : billUrl(openBill),
    {},
    null,
    "Không thể tải bill",
  );
  // The answer may still be the previous bill's while the next one loads.
  const billDetail = bill.data && sameBill(openBill, detailRef(bill.data)) ? bill.data : null;
  const explicit = selected && sameBill(selected.bill, openBill) ? selected : null;
  const firstId = !explicit && billDetail && !bill.loading ? firstOf(billDetail, openedFrom) : null;
  // The first invoice of a bill becomes the pick as soon as it shows, so a
  // reload or a change of status never moves the panel (adjusted during render).
  if (firstId !== null && openBill !== null) setSelected({ bill: openBill, einvoiceId: firstId });
  const shown: Selection | null =
    explicit ?? (firstId !== null && openBill !== null ? { bill: openBill, einvoiceId: firstId } : null);

  // Every switch of bill or invoice asks first while the panel holds unsaved edits.
  const run = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };

  // The panel sits beside the list from @4xl/main up and under it below that
  // (the list can be long): there a pick brings the panel into view.
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollToPanel = () => {
    const list = gridRef.current?.firstElementChild;
    const panelBox = panelRef.current;
    if (!list || !panelBox) return;
    const stacked = panelBox.getBoundingClientRect().top > list.getBoundingClientRect().top + 1;
    if (stacked) panelBox.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleBill = (ref: BillRef, tab: EinvoiceTab) =>
    run(() => {
      setOpenBill((current) => (sameBill(current, ref) ? null : ref));
      setOpenedFrom(tab);
      setSelected(null);
      setFocusId(null);
    });

  const select = (ref: BillRef, einvoiceId: number) => {
    const open = () => {
      setSelected({ bill: ref, einvoiceId });
      if (isMobile) setSheetOpen(true);
      else requestAnimationFrame(scrollToPanel);
    };
    if (shown?.einvoiceId === einvoiceId) open();
    else run(open);
  };

  // After any write: the lists, the counts and what is open reload.
  const changed = (row: EinvoiceDetail) => {
    setListVersion((v) => v + 1);
    if (sameBill(billRefOf(row), openBill)) bill.reload();
  };
  const panelChanged = (row: EinvoiceDetail) => {
    changed(row);
    // Issuing moves the lower bound of the next invoice date.
    config.reload();
  };

  // + makes a draft at once, many in a row if wanted (spec 2026-10-01 §5.2).
  // The panel follows it unless it holds unsaved edits; + on a bill other than
  // the open one is a switch of bill, so that one asks first.
  const create = (ref: BillRef, amount: number, extra: DraftExtra = {}) => {
    const switching = !sameBill(ref, openBill);
    const go = async () => {
      setCreating(billKey(ref));
      try {
        const res = await api.post<EinvoiceDetail>("/einvoices", { ...billBody(ref), amount, lines: [], ...extra });
        const row = res.data;
        setListVersion((v) => v + 1);
        setFocusId(row.id);
        if (switching) {
          setOpenBill(ref);
          setOpenedFrom("BILLS");
        } else bill.reload();
        if (!dirty || switching) setSelected({ bill: ref, einvoiceId: row.id });
        return true;
      } catch (error) {
        notify.error(error, "Không tạo được hóa đơn");
        return false;
      } finally {
        setCreating(null);
      }
    };
    if (!switching) return go();
    run(() => void go());
    return Promise.resolve(true);
  };

  // Gửi lại of an issued invoice: a new draft of its bill takes its amount and
  // buyer, dated today; the issued one stays. The panel shows an issued
  // invoice, so it holds no unsaved edits and is on the open bill.
  const resend = (row: EinvoiceDetail) =>
    create(billRefOf(row), Number(row.amount), {
      ...(row.buyerTaxCode ? { buyerTaxCode: row.buyerTaxCode } : {}),
      ...(row.buyerName ? { buyerName: row.buyerName } : {}),
      invoiceDate: toDateInput(),
    });

  const deleted = (ref: BillRef, einvoiceId: number) => {
    setListVersion((v) => v + 1);
    if (shown?.einvoiceId === einvoiceId) {
      // The edits of a deleted invoice go with it (its delete asked first).
      setDirty(false);
      const siblings = billDetail?.einvoices ?? [];
      const index = siblings.findIndex((e) => e.id === einvoiceId);
      const next = siblings[index + 1] ?? siblings[index - 1];
      setSelected(next ? { bill: ref, einvoiceId: next.id } : null);
      if (!next) setSheetOpen(false);
    }
    if (sameBill(ref, openBill)) bill.reload();
  };

  const panelEinvoice = shown === null ? null : (billDetail?.einvoices.find((e) => e.id === shown.einvoiceId) ?? null);
  const index = panelEinvoice && billDetail ? billDetail.einvoices.findIndex((e) => e.id === panelEinvoice.id) : -1;
  const order = billDetail && "order" in billDetail ? billDetail.order : null;
  const manual = billDetail && "bill" in billDetail ? billDetail.bill : null;
  const panelLocked = bill.loading || (shown !== null && savingIds.includes(shown.einvoiceId));
  const panel =
    shown === null ? null : panelEinvoice ? (
      <EinvoiceIssuePanel
        key={panelEinvoice.id}
        einvoice={panelEinvoice}
        bill={order}
        label={
          manual ? `HĐ ${index + 1} · Bill ${billLabel(manual)} · ${manual.room?.name ?? "—"}` : `HĐ ${index + 1}`
        }
        previous={index > 0 && billDetail ? buyerOf(billDetail.einvoices[index - 1]) : null}
        config={config.data}
        busy={panelLocked}
        onChanged={panelChanged}
        onResend={resend}
        onReload={bill.reload}
        onDirtyChange={setDirty}
        onWorkingChange={setPanelWorking}
      />
    ) : bill.loading ? (
      <Skeleton className="h-96 w-full rounded-xl" />
    ) : (
      <EmptyState
        icon={FileCheck2Icon}
        title="Hóa đơn không còn"
        description="Chọn một hóa đơn khác."
        className="rounded-xl border"
      />
    );
  const emptyBill = billDetail !== null && billDetail.einvoices.length === 0;
  const emptyPanel = (
    <EmptyState
      icon={FileCheck2Icon}
      title={emptyBill ? "Bill chưa có hóa đơn nhỏ" : "Chọn một hóa đơn"}
      description={
        can(user, "einvoices.write") && emptyBill
          ? "Bấm + trên dòng bill để thêm hóa đơn nhỏ."
          : "Mở một bill ở cột trái."
      }
      className="rounded-xl border"
    />
  );

  return (
    <>
      <PageHeader
        title="Hóa đơn điện tử"
        description={
          site === "report"
            ? "Bill đã có hóa đơn điện tử bên trang chính và bill thêm tay: chia ở cột trái, điền và xuất lên Minvoice ở cột phải."
            : "Chia bill đã thanh toán thành các hóa đơn nhỏ ở cột trái, điền và xuất lên Minvoice ở cột phải."
        }
      />
      <div className="flex flex-col gap-4">
        <EinvoiceConfigCard config={config.data} loading={config.loading} onChanged={config.reload} />
        <div ref={gridRef} className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <EinvoiceBillList
            site={site}
            initialDay={initialDay}
            version={listVersion}
            openBill={openBill}
            openBillDetail={billDetail}
            openBillLoading={bill.loading}
            selectedId={shown?.einvoiceId ?? null}
            focusId={focusId}
            dirtyId={dirty ? (shown?.einvoiceId ?? null) : null}
            lockedId={panelWorking ? (shown?.einvoiceId ?? null) : null}
            savingIds={savingIds}
            creating={creating}
            onToggleBill={toggleBill}
            onSelect={select}
            onCreate={create}
            onSaved={changed}
            onDeleted={deleted}
            onSavingChange={rowSaving}
          />
          {!isMobile && (
            <div ref={panelRef} className="min-w-0 scroll-mt-[calc(var(--header-height)+1rem)]">
              {panel ?? emptyPanel}
            </div>
          )}
        </div>
      </div>
      {isMobile && (
        <Sheet open={sheetOpen && panel !== null} onOpenChange={(value) => !value && run(() => setSheetOpen(false))}>
          {/* The panel scrolls under a fixed title row, which keeps the close
              button clear of the panel's header. */}
          <SheetContent side="bottom" className="h-[100dvh] gap-0 p-0">
            <SheetHeader className="border-b py-3 pr-12">
              <SheetTitle>Xuất hóa đơn điện tử</SheetTitle>
              <SheetDescription className="sr-only">Ngày, người mua, dòng hàng và xuất hóa đơn đang chọn</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">{panel}</div>
          </SheetContent>
        </Sheet>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Bỏ thay đổi chưa lưu?"
        description="Hóa đơn đang sửa có thay đổi chưa lưu nháp."
        confirmLabel="Bỏ thay đổi"
        destructive
        onConfirm={() => {
          setDirty(false);
          pending?.();
          setPending(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 7: Route của hai trang**

`src/app/[branch]/sales/einvoices/page.tsx` (tạo lại sau `git mv`):

```tsx
"use client";

import { Suspense } from "react";
import { EinvoicesPage } from "@/components/einvoices/einvoices-page";

export default function MainEinvoicesPage() {
  return (
    <Suspense>
      <EinvoicesPage site="main" />
    </Suspense>
  );
}
```

`src/app/report/[branch]/sales/einvoices/page.tsx`: giống hệt file trên, với tên `ReportEinvoicesPage` và `site="report"`.
`src/app/report/[branch]/sales/einvoices/layout.tsx`: chép `src/app/[branch]/sales/einvoices/layout.tsx` (`title: "Hóa đơn điện tử"`).

- [ ] **Step 8: Kiểm tra**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint && grep -rn "free\b\|revealFreeDraft\|HĐ tự do" src/components/einvoices src/app`
Expected: không lỗi, và `grep` không còn gì về HĐ tự do.

Chạy `backend-preview`, `frontend-preview`, `report-preview` và `fake-minvoice`. Dữ liệu dùng là dữ liệu đã có sau các e2e, hoặc tạo bằng tay: một bill đã thanh toán, một nháp, rồi một bill thêm tay qua `POST /report-site/manual-bills`.

1. Trang chính `localhost:3002/cs1/sales/einvoices`, đăng nhập `tn1_cs1`:
   - không còn nút + cạnh ô tìm số bill, không còn nhóm "Hóa đơn không theo bill";
   - + trên bill tạo nháp, sửa số tiền, Lưu nháp, xóa nháp đều chạy như trước.
2. Trang báo cáo `baocao.localhost:3003/cs1/sales/einvoices`, đăng nhập `admin`:
   - tab Bill chỉ có bill bên chính đã có HĐĐT, cùng bill thêm tay (nhãn "Thêm tay");
   - mở một bill thêm tay: thấy "Bill thêm tay ngày …";
   - + trên bill thêm tay tạo nháp 0 đồng;
   - panel ghi "HĐ n · Bill … · phòng" và không có "Lấy món từ bill";
   - xuất được (Minvoice giả).
3. Mở `baocao.localhost:3003/cs1/sales/einvoices?manualBill=<id>&day=<ngày>`: danh sách ở đúng ngày đó, bill đó đang mở.
4. Ở độ rộng 390px, chạm vào một hóa đơn thì Sheet mở ra. `read_console_messages` không có lỗi.

- [ ] **Step 9: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(web): trang hóa đơn điện tử dùng chung cho hai trang, bỏ HĐĐT tự do, bill thêm tay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Quản lý bán hàng của trang báo cáo — Thêm hóa đơn, Hủy, Excel

**Files:**
- Create: `502-frontend/src/components/report-site/add-manual-bill-dialog.tsx`
- Modify: `502-frontend/src/lib/report-sheets.ts` (thêm `reportSiteBillsSheet`)
- Modify (thay trang tạm của Task 1): `502-frontend/src/app/report/[branch]/sales/bills/page.tsx`

**Interfaces:**
- Consumes: `ReportSiteBill`, `ReportSiteSummary`, `CreatedManualBill` (Task 10); `GET /report-site/bills`, `GET /report-site/bills/summary`, `POST /report-site/manual-bills`, `POST /report-site/manual-bills/:id/cancel`.
- Produces: `AddManualBillDialog({ open, onOpenChange, onCreated })`, `reportSiteBillsSheet(rows, name?)`.

- [ ] **Step 1: Sheet Excel**

Cuối `lib/report-sheets.ts` (thêm `ReportSiteBill` vào import kiểu):

```ts
// ---- Trang báo cáo: Quản lý bán hàng (spec 2026-10-02 §7.4)

const reportSiteBillColumns: ExportColumn<ReportSiteBill>[] = [
  { header: "Số bill", value: (r) => r.billNumber },
  { header: "Ngày", value: (r) => (r.businessDate ? formatDate(r.businessDate) : null) },
  { header: "Phòng", value: (r) => r.roomName ?? NO_ROOM },
  { header: "Loại", value: (r) => (r.manualBillId !== null ? "Thêm tay" : "Bán hàng") },
  { header: "Trạng thái", value: (r) => (r.cancelledAt ? "Đã hủy" : null) },
  { header: "Số HĐĐT", type: "number", value: (r) => r.einvoiceCount },
  { header: "HĐĐT đã xuất", type: "number", value: (r) => r.issuedCount },
  { header: "Trước VAT", type: "money", value: (r) => r.total - r.vat },
  { header: "VAT", type: "money", value: (r) => r.vat },
  { header: "Tổng tiền", type: "money", value: (r) => r.total },
];

// The bills as listed; no total row, as the list may be cut (the totals of
// the days come from GET /report-site/bills/summary).
export function reportSiteBillsSheet(rows: ReportSiteBill[], name = "Quản lý bán hàng"): ExportTable {
  return toSheet(name, reportSiteBillColumns, rows);
}
```

- [ ] **Step 2: Dialog Thêm hóa đơn**

`src/components/report-site/add-manual-bill-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { DatePicker } from "@/components/date-range-picker";
import { MoneyInput } from "@/components/einvoices/number-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useApiData } from "@/hooks/use-api-data";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { businessDate } from "@/lib/format";
import type { CreatedManualBill, Room } from "@/lib/types";

// Thêm hóa đơn (spec 2026-10-02-trang-bao-cao-hddt §7.4): a bill only to issue
// e-invoices, numbered in the day's sequence of the branch with its room, and
// its first e-invoice of the amount typed. The parent remounts it (key) on
// each opening, so it starts empty.
export function AddManualBillDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (bill: CreatedManualBill) => void;
}) {
  const branch = useBranchCode();
  const notify = useNotify();
  const rooms = useApiData<Room[]>(open ? "/rooms" : null, { branch }, [], "Không thể tải danh sách phòng");
  const [day, setDay] = useState(() => businessDate());
  const [roomId, setRoomId] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const ready = roomId !== "" && amount !== null && amount >= 1;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await api.post<CreatedManualBill>(
        "/report-site/manual-bills",
        { businessDate: day, roomId: Number(roomId), amount },
        { params: { branch } },
      );
      notify.success(`Đã thêm bill ${res.data.billNumber}`);
      onCreated(res.data);
    } catch (error) {
      notify.error(error, "Không thêm được hóa đơn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Thêm hóa đơn</DialogTitle>
            <DialogDescription>
              Bill chỉ để xuất hóa đơn điện tử, chỉ có ở trang báo cáo. Số bill nối tiếp dãy số của ngày đã chọn.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Ngày</FieldLabel>
              <DatePicker value={day} onChange={setDay} max={businessDate()} label="Ngày kinh doanh" />
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-bill-room">Phòng</FieldLabel>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="manual-bill-room" className="w-full">
                  <SelectValue placeholder="Chọn phòng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {rooms.data.map((room) => (
                      <SelectItem key={room.id} value={String(room.id)}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-bill-amount">Số tiền hóa đơn điện tử</FieldLabel>
              <MoneyInput id="manual-bill-amount" value={amount} onChange={setAmount} placeholder="0" />
              <FieldDescription>Đã gồm VAT. Người mua và dòng hàng nhập ở trang Hóa đơn điện tử.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button type="submit" disabled={!ready || saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Thêm hóa đơn
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Trang Quản lý bán hàng**

Thay `src/app/report/[branch]/sales/bills/page.tsx`:

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { ListLimitNotice, TableEmpty, TableSkeleton } from "@/components/data-states";
import { DateRangePicker, formatDateRange, type DateRangeValue } from "@/components/date-range-picker";
import { ExportExcelButton } from "@/components/export-excel-button";
import { PageHeader } from "@/components/layout/page-header";
import { ReasonDialog } from "@/components/reason-dialog";
import { AddManualBillDialog } from "@/components/report-site/add-manual-bill-dialog";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNotify } from "@/hooks/use-notify";
import api from "@/lib/api";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { businessDate, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT, NO_ROOM } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { reportSiteBillsSheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { CreatedManualBill, ReportSiteBill, ReportSiteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";
const COLUMNS = ["", SHOW_FROM.sm, SHOW_FROM.xs, SHOW_FROM.md, SHOW_FROM.md, SHOW_FROM.sm, "", ""];

// The HĐĐT page with the bill open and its day listed (spec 2026-10-02 §7.4).
function einvoicesHref(
  branch: string,
  bill: { orderId: number | null; manualBillId: number | null; businessDate: string | null },
) {
  const params = new URLSearchParams(
    bill.manualBillId !== null ? { manualBill: String(bill.manualBillId) } : { bill: String(bill.orderId) },
  );
  if (bill.businessDate) params.set("day", bill.businessDate);
  return `/${branch}/sales/einvoices?${params}`;
}

// Quản lý bán hàng of the report site: the paid bills holding an e-invoice and
// the bills thêm tay, with their e-invoices' sums.
function BillsView() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const router = useRouter();
  const notify = useNotify();
  const canWrite = can(user, "einvoices.write");
  const [range, setRange] = useState<DateRangeValue>(() => ({ from: businessDate(), to: businessDate() }));
  const [search, setSearch] = useState("");
  // A bill number searches every day.
  const billNumber = useDebouncedValue(search).replace(/\D/g, "");
  const bills = useApiData<ReportSiteBill[]>(
    "/report-site/bills",
    { branch, ...(billNumber ? { billNumber } : range) },
    [],
    "Không thể tải danh sách bill",
  );
  // Summed by the server over every invoice of the days, never from the list.
  const summary = useApiData<ReportSiteSummary | null>(
    "/report-site/bills/summary",
    { branch, ...range },
    null,
    "Không thể tải tổng",
  );
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [cancelling, setCancelling] = useState<ReportSiteBill | null>(null);

  const startAdding = () => {
    setAddKey((key) => key + 1);
    setAdding(true);
  };
  const created = (bill: CreatedManualBill) => {
    setAdding(false);
    router.push(einvoicesHref(branch, { orderId: null, manualBillId: bill.id, businessDate: bill.businessDate }));
  };
  const cancel = async (reason: string) => {
    if (!cancelling?.manualBillId) return false;
    try {
      await api.post(`/report-site/manual-bills/${cancelling.manualBillId}/cancel`, { reason });
      notify.success(`Đã hủy bill ${cancelling.billNumber}`);
      bills.reload();
      summary.reload();
      return true;
    } catch (error) {
      notify.error(error, "Không hủy được bill");
      return false;
    }
  };
  const exportExcel = async () => {
    const name = billNumber
      ? `quan-ly-ban-hang_${branch}_${billNumber}.xlsx`
      : reportFileName("quan-ly-ban-hang", branch, range.from, range.to);
    await exportWorkbook(name, [reportSiteBillsSheet(bills.data)]);
    if (bills.total !== null && bills.total > bills.data.length) {
      toast.warning(
        `File chỉ gồm ${formatNumber(bills.data.length)} / ${formatNumber(bills.total)} bill mới nhất; chọn khoảng ngày ngắn hơn để có đủ.`,
      );
    }
  };

  const s = summary.data;
  return (
    <>
      <PageHeader
        title="Quản lý bán hàng"
        info={`Bill đã có hóa đơn điện tử bên trang chính và bill thêm tay, theo ngày kinh doanh của bill. Số tiền là của các hóa đơn điện tử; hóa đơn chưa xuất của bill đã hủy không được tính. ${BUSINESS_DAY_HINT}`}
        actions={
          <>
            <ExportExcelButton onExport={bills.data.length > 0 ? exportExcel : undefined} />
            <DateRangePicker value={range} onChange={setRange} align="end" />
            {canWrite && (
              <Button onClick={startAdding}>
                <PlusIcon data-icon="inline-start" />
                Thêm hóa đơn
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <StatTile label="Bill" value={s ? formatNumber(s.billCount) : "…"} footer={s ? `${formatNumber(s.einvoiceCount)} hóa đơn điện tử` : undefined} />
        <StatTile label="Tổng tiền" value={s ? formatMoney(s.total) : "…"} footer={s ? `Trước VAT ${formatMoney(s.revenue)}` : undefined} />
        <StatTile label="VAT" value={s ? formatMoney(s.vat) : "…"} />
        <StatTile label="Đã xuất" value={s ? formatMoney(s.issued) : "…"} footer={s ? `Chưa xuất ${formatMoney(s.pending)}` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{billNumber ? `Số bill ${billNumber}` : formatDateRange(range)}</CardTitle>
          <CardDescription>
            {billNumber ? "Kết quả tìm trên mọi ngày" : "Bấm một bill để mở ở trang Hóa đơn điện tử."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="sm:max-w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Tìm số bill"
              inputMode="numeric"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm theo số bill"
            />
          </InputGroup>
          <ListLimitNotice
            shown={bills.data.length}
            total={bills.total}
            noun="bill"
            hint="Các ô tổng ở trên vẫn tính đủ mọi bill của khoảng này; chọn khoảng ngày ngắn hơn hoặc tìm theo số bill."
          />
          <div className={cn("transition-opacity", bills.loading && bills.data.length > 0 && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Số bill</TableHead>
                  <TableHead className={SHOW_FROM.sm}>Ngày</TableHead>
                  <TableHead className={SHOW_FROM.xs}>Phòng</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.md)}>HĐĐT</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.md)}>Trước VAT</TableHead>
                  <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                  <TableHead className="text-right">Tổng</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.loading && bills.data.length === 0 ? (
                  <TableSkeleton columns={COLUMNS} />
                ) : bills.data.length === 0 ? (
                  <TableEmpty
                    colSpan={8}
                    icon={ReceiptTextIcon}
                    title="Không có bill"
                    description="Chưa có bill nào có hóa đơn điện tử trong khoảng này."
                  />
                ) : (
                  bills.data.map((bill) => (
                    <TableRow
                      key={bill.manualBillId !== null ? `m${bill.manualBillId}` : `o${bill.orderId}`}
                      className={cn("cursor-pointer", bill.cancelledAt && "text-muted-foreground")}
                      onClick={() => router.push(einvoicesHref(branch, bill))}
                    >
                      <TableCell className="font-medium tabular-nums">
                        <div className="flex flex-wrap items-center gap-1">
                          {bill.billNumber}
                          {bill.manualBillId !== null && <Badge variant="outline">Thêm tay</Badge>}
                          {bill.cancelledAt && <Badge variant="warning">Đã hủy</Badge>}
                        </div>
                        <div className={cn("text-xs font-normal text-muted-foreground", ONLY_NARROW)}>
                          {formatDate(bill.businessDate)} · {bill.roomName ?? NO_ROOM}
                        </div>
                      </TableCell>
                      <TableCell className={cn("tabular-nums", SHOW_FROM.sm)}>{formatDate(bill.businessDate)}</TableCell>
                      <TableCell className={SHOW_FROM.xs}>{bill.roomName ?? NO_ROOM}</TableCell>
                      <TableCell className={cn(NUM, SHOW_FROM.md)}>
                        {bill.issuedCount}/{bill.einvoiceCount}
                      </TableCell>
                      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(bill.total - bill.vat)}</TableCell>
                      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(bill.vat)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatNumber(bill.total)}</TableCell>
                      <TableCell className="px-1" onClick={(e) => e.stopPropagation()}>
                        {canWrite && bill.manualBillId !== null && !bill.cancelledAt && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Hủy bill ${bill.billNumber}`}
                            title="Hủy bill thêm tay"
                            onClick={() => setCancelling(bill)}
                          >
                            <XIcon />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddManualBillDialog key={addKey} open={adding} onOpenChange={setAdding} onCreated={created} />
      <ReasonDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Hủy bill ${cancelling?.billNumber ?? ""}?`}
        description="Các hóa đơn nháp của bill bị xóa cùng. Bill đã có hóa đơn gửi hoặc xuất thì không hủy được. Số bill không được cấp lại."
        confirmLabel="Hủy bill"
        onConfirm={cancel}
      />
    </>
  );
}

export default function ReportBillsPage() {
  return (
    <Suspense>
      <BillsView />
    </Suspense>
  );
}
```

- [ ] **Step 4: Kiểm tra**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint`
Expected: không lỗi.

Trình duyệt, trên `baocao.localhost:3003/cs1/sales/bills`, đăng nhập `admin`:
- **Thêm hóa đơn:**
  - mở dialog, chọn ngày hôm qua, chọn phòng, nhập 110.000, bấm Thêm hóa đơn;
  - toast "Đã thêm bill …";
  - trang chuyển sang Hóa đơn điện tử: danh sách ở ngày hôm qua, bill đó đang mở, có một nháp 110.000.
- **Quay lại Quản lý bán hàng:**
  - bill thêm tay có nhãn "Thêm tay";
  - ô Tổng tiền cộng đúng (khi chọn khoảng có ngày hôm qua);
  - Excel tải được và có đủ cột.
- **Hủy:** nút X trên bill thêm tay, nhập lý do; bill hiện "Đã hủy" và các ô tổng giảm theo.
- **Đăng nhập bằng `hdqt_bc`:** không có nút Thêm hóa đơn, không có nút X.
- **Độ rộng 390px:** không cuộn ngang; số bill có ngày và phòng hiện ngay bên dưới.

- [ ] **Step 5: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(web): Quản lý bán hàng của trang báo cáo — thêm hóa đơn, hủy bill thêm tay, xuất Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Ba trang báo cáo của trang báo cáo

**Files:**
- Modify: `502-frontend/src/lib/types.ts` (kiểu báo cáo theo HĐĐT)
- Modify: `502-frontend/src/lib/report-sheets.ts` (sheet Excel; `roomRowName` nhận cả dòng phòng mới)
- Create: `502-frontend/src/components/report-site/einvoice-metric-cells.tsx`
- Modify (thay trang tạm của Task 1): `502-frontend/src/app/report/[branch]/reports/revenue/page.tsx`
- Create: `502-frontend/src/app/report/[branch]/reports/rooms/{layout,page}.tsx`, `502-frontend/src/app/report/[branch]/reports/products/{layout,page}.tsx`

**Interfaces:**
- Consumes: `GET /report-site/reports/{revenue,rooms,products}` (Task 8), `EinvoiceMetrics` (Task 10).
- Produces:
  - Kiểu: `EinvoiceRevenueReport`, `EinvoiceRoomRow`, `EinvoiceRoomReport`, `EinvoiceProductRow`, `EinvoiceProductReport`.
  - Sheet Excel: `einvoiceRevenueSheet`, `einvoiceRevenueBranchesSheet`, `einvoiceRoomsSheet`, `einvoiceProductsSheet`, `einvoiceProductName`.
  - Component: `EinvoiceMetricHeads`, `EinvoiceMetricCells`, `EINVOICE_REPORT_INFO`.

- [ ] **Step 1: Kiểu (`lib/types.ts`)**

Thêm sau `CreatedManualBill`:

```ts
// GET /report-site/reports/revenue.
export interface EinvoiceRevenueReport {
  branchId: number | null; // null: whole chain
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: EinvoiceMetrics;
  previous: { from: string; to: string; totals: EinvoiceMetrics } | null;
  buckets: (ReportBucket & EinvoiceMetrics)[];
  byBranch: ({ branchId: number; code: string; name: string } & EinvoiceMetrics)[] | null;
}

// GET /report-site/reports/rooms; id: room id, or the room type (by=type); null: "Không phòng".
export interface EinvoiceRoomRow extends EinvoiceMetrics {
  id: number | string | null;
  name: string | null;
  type: string | null;
  branchCode: string | null;
  rooms: number;
}

export interface EinvoiceRoomReport {
  branchId: number | null;
  range: { from: string; to: string };
  by: RoomGroup;
  totals: EinvoiceMetrics;
  rows: EinvoiceRoomRow[];
}

// GET /report-site/reports/products: lines grouped by name and unit; "others"
// past the first 1000, "unlisted" (Chưa có dòng hàng) what the invoices hold
// beyond their lines. The rows add up to the totals.
export interface EinvoiceProductRow {
  kind: "item" | "others" | "unlisted";
  name: string | null;
  unit: string | null;
  quantity: number | null;
  revenue: number;
  vat: number;
  total: number;
}

export interface EinvoiceProductReport {
  branchId: number | null;
  range: { from: string; to: string };
  totals: { revenue: number; vat: number; total: number };
  rows: EinvoiceProductRow[];
}
```

- [ ] **Step 2: Sheet Excel (`lib/report-sheets.ts`)**

Đổi chữ ký `roomRowName` để nhận cả dòng phòng của trang báo cáo:

```ts
export function roomRowName(row: Pick<RoomReportRow, "id" | "name" | "type">, by: RoomGroup) {
```

Thêm cuối file (thêm các kiểu `EinvoiceMetrics`, `EinvoiceRevenueReport`, `EinvoiceRoomReport`, `EinvoiceRoomRow`, `EinvoiceProductReport`, `EinvoiceProductRow` vào import):

```ts
// ---- Trang báo cáo: báo cáo theo hóa đơn điện tử (spec 2026-10-02 §5)

const EINVOICE_METRIC_COLUMNS: ExportColumn<EinvoiceMetrics>[] = [
  { header: "Bill", type: "number", value: (r) => r.billCount },
  { header: "Hóa đơn điện tử", type: "number", value: (r) => r.einvoiceCount },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (r) => r.revenue },
  { header: "VAT", type: "money", value: (r) => r.vat },
  { header: "Tổng tiền", type: "money", value: (r) => r.total },
  { header: "Đã xuất", type: "money", value: (r) => r.issued },
  { header: "Chưa xuất", type: "money", value: (r) => r.pending },
];

export function einvoiceRevenueSheet(data: EinvoiceRevenueReport, name = "Theo kỳ"): ExportTable {
  const columns: ExportColumn<ReportBucket & EinvoiceMetrics>[] = [
    { header: "Kỳ", value: (r) => r.label },
    { header: "Từ ngày", value: (r) => formatDate(r.from) },
    { header: "Đến ngày", value: (r) => formatDate(r.to) },
    ...EINVOICE_METRIC_COLUMNS,
  ];
  return toSheet(name, columns, data.buckets, {
    key: "",
    label: "Tổng",
    from: data.range.from,
    to: data.range.to,
    ...data.totals,
  });
}

// Only for the whole chain (byBranch).
export function einvoiceRevenueBranchesSheet(data: EinvoiceRevenueReport, name = "Theo cơ sở"): ExportTable | null {
  if (!data.byBranch) return null;
  const columns: ExportColumn<{ name: string } & EinvoiceMetrics>[] = [
    { header: "Cơ sở", value: (r) => r.name },
    ...EINVOICE_METRIC_COLUMNS,
  ];
  return toSheet(name, columns, data.byBranch, { name: "Tổng", ...data.totals });
}

export function einvoiceRoomsSheet(data: EinvoiceRoomReport, name = ROOM_GROUP_LABELS[data.by]): ExportTable {
  const columns: ExportColumn<EinvoiceRoomRow>[] = [
    { header: data.by === "room" ? "Phòng" : "Loại phòng", value: (r) => roomRowName(r, data.by) },
    ...(data.by === "room"
      ? [{ header: "Cơ sở", value: (r: EinvoiceRoomRow) => r.branchCode?.toUpperCase() ?? null }]
      : [{ header: "Số phòng", type: "number" as const, value: (r: EinvoiceRoomRow) => r.rooms }]),
    ...EINVOICE_METRIC_COLUMNS,
  ];
  // id null + a name: roomRowName() shows "Tổng".
  return toSheet(name, columns, data.rows, {
    id: null,
    name: "Tổng",
    type: null,
    branchCode: null,
    rooms: data.rows.reduce((sum, r) => sum + r.rooms, 0),
    ...data.totals,
  });
}

export const einvoiceProductName = (row: EinvoiceProductRow) =>
  row.kind === "others" ? "Các mặt hàng khác" : row.kind === "unlisted" ? "Chưa có dòng hàng" : (row.name ?? "");

export function einvoiceProductsSheet(data: EinvoiceProductReport, name = "Hàng hóa"): ExportTable {
  const columns: ExportColumn<EinvoiceProductRow>[] = [
    { header: "Tên hàng", value: einvoiceProductName },
    { header: "ĐVT", value: (r) => r.unit },
    { header: "Số lượng", type: "decimal", value: (r) => r.quantity },
    { header: "Trước VAT", type: "money", value: (r) => r.revenue },
    { header: "VAT", type: "money", value: (r) => r.vat },
    { header: "Tổng tiền", type: "money", value: (r) => r.total },
  ];
  return toSheet(name, columns, data.rows, {
    kind: "item",
    name: "Tổng",
    unit: null,
    quantity: null,
    ...data.totals,
  });
}
```

- [ ] **Step 3: Ô số liệu dùng chung**

`src/components/report-site/einvoice-metric-cells.tsx`:

```tsx
import { TableCell, TableHead } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { BUSINESS_DAY_HINT } from "@/lib/labels";
import { SHOW_FROM } from "@/lib/responsive";
import type { EinvoiceMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

// What every report of the report site counts (spec 2026-10-02 §5.1).
export const EINVOICE_REPORT_INFO = `Tính theo hóa đơn điện tử đã lưu nháp, đang gửi hoặc đã xuất, vào ngày kinh doanh của bill; hóa đơn chưa xuất của bill đã hủy không được tính. Doanh thu chưa gồm VAT. ${BUSINESS_DAY_HINT}`;

const NUM = "text-right tabular-nums";

// The metric columns of the report site's tables, the same in every report.
export function EinvoiceMetricHeads() {
  return (
    <>
      <TableHead className={cn("text-right", SHOW_FROM.xs)}>Bill</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.md)}>HĐĐT</TableHead>
      <TableHead className="text-right">Doanh thu</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng tiền</TableHead>
      <TableHead className={cn("text-right", SHOW_FROM.lg)}>Đã xuất</TableHead>
    </>
  );
}

export function EinvoiceMetricCells({ m }: { m: EinvoiceMetrics }) {
  return (
    <>
      <TableCell className={cn(NUM, SHOW_FROM.xs)}>{formatNumber(m.billCount)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.md)}>{formatNumber(m.einvoiceCount)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{formatNumber(m.revenue)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.vat)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(m.total)}</TableCell>
      <TableCell className={cn(NUM, SHOW_FROM.lg)}>{formatNumber(m.issued)}</TableCell>
    </>
  );
}
```

- [ ] **Step 4: Trang Doanh thu**

Thay `src/app/report/[branch]/reports/revenue/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { ChartColumnBigIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import {
  EINVOICE_REPORT_INFO,
  EinvoiceMetricCells,
  EinvoiceMetricHeads,
} from "@/components/report-site/einvoice-metric-cells";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { reportParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { einvoiceRevenueBranchesSheet, einvoiceRevenueSheet } from "@/lib/report-sheets";
import { delta, reportFileName, tickLabel } from "@/lib/reports";
import { SHOW_FROM } from "@/lib/responsive";
import type { EinvoiceMetrics, EinvoiceRevenueReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const chartConfig = { revenue: { label: "Doanh thu", color: "var(--chart-1)" } } satisfies ChartConfig;
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1 });

// Revenue of the counted e-invoices by the business day of their bill
// (spec 2026-10-02-trang-bao-cao-hddt §5.2).
function RevenueView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<EinvoiceRevenueReport | null>(
    "/report-site/reports/revenue",
    reportParams(branch, filters),
    null,
    "Không thể tải báo cáo doanh thu",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    const byBranch = einvoiceRevenueBranchesSheet(data);
    await exportWorkbook(reportFileName("doanh-thu-hddt", scope.fileScope, data.range.from, data.range.to), [
      einvoiceRevenueSheet(data),
      ...(byBranch ? [byBranch] : []),
    ]);
  };

  const t = data?.totals;
  // Undefined while not comparing: the tiles then show no badge.
  const change = (pick: (m: EinvoiceMetrics) => number) =>
    data?.previous && t ? delta(pick(t), pick(data.previous.totals)) : undefined;
  // Periods with invoices, newest first (the chart shows every period).
  const rows = [...(data?.buckets ?? [])].filter((b) => b.einvoiceCount > 0).reverse();
  const chartData = data
    ? data.buckets.map((b) => ({ tick: tickLabel(b, data.groupBy), label: b.label, revenue: b.revenue }))
    : [];

  return (
    <>
      <PageHeader title="Doanh thu" description={scope.name} info={EINVOICE_REPORT_INFO} />
      <ReportToolbar filters={filters} onChange={setFilters} onExport={data && !loading ? exportExcel : undefined} />

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <StatTile
              label="Doanh thu (chưa VAT)"
              value={formatMoney(t.revenue)}
              delta={change((m) => m.revenue)}
              footer={`Đã xuất ${formatMoney(t.issued)} · chưa xuất ${formatMoney(t.pending)} (gồm VAT)`}
            />
            <StatTile label="VAT" value={formatMoney(t.vat)} delta={change((m) => m.vat)} footer="Thuế GTGT trên hóa đơn điện tử" />
            <StatTile label="Tổng tiền" value={formatMoney(t.total)} delta={change((m) => m.total)} footer="Đã gồm VAT" />
            <StatTile
              label="Bill"
              value={formatNumber(t.billCount)}
              delta={change((m) => m.billCount)}
              footer={`${formatNumber(t.einvoiceCount)} hóa đơn điện tử`}
            />
          </div>
          {data.previous && (
            <p className="text-sm text-muted-foreground">So với kỳ trước: {formatDateRange(data.previous)}</p>
          )}

          {data.buckets.length > 1 && t.einvoiceCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Doanh thu theo kỳ</CardTitle>
                <CardDescription>{formatDateRange(data.range)} · chưa gồm VAT (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
                  <BarChart data={chartData} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => compact.format(value)} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(_, payload) =>
                            (payload?.[0]?.payload as { label?: string } | undefined)?.label ?? ""
                          }
                        />
                      }
                    />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" maxBarSize={32} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết theo kỳ</CardTitle>
              <CardDescription>Các kỳ có hóa đơn điện tử.</CardDescription>
            </CardHeader>
            <CardContent>
              {t.einvoiceCount === 0 ? (
                <EmptyState
                  icon={ChartColumnBigIcon}
                  title="Chưa có hóa đơn điện tử"
                  description={`Không có hóa đơn điện tử nào trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kỳ</TableHead>
                      <EinvoiceMetricHeads />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">
                          {data.groupBy === "day" ? formatDate(row.key) : row.label}
                        </TableCell>
                        <EinvoiceMetricCells m={row} />
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 1 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <EinvoiceMetricCells m={t} />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>

          {data.byBranch && (
            <Card>
              <CardHeader>
                <CardTitle>Theo cơ sở</CardTitle>
                <CardDescription>Tỷ trọng tính trên doanh thu chưa VAT của toàn chuỗi.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cơ sở</TableHead>
                      <EinvoiceMetricHeads />
                      <TableHead className={cn("text-right", SHOW_FROM.md)}>Tỷ trọng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byBranch.map((b) => (
                      <TableRow key={b.branchId}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <EinvoiceMetricCells m={b} />
                        <TableCell className={cn("text-right tabular-nums", SHOW_FROM.md)}>
                          {t.revenue ? percent.format(b.revenue / t.revenue) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

export default function ReportRevenuePage() {
  return (
    <Suspense>
      <RevenueView />
    </Suspense>
  );
}
```

- [ ] **Step 5: Trang Phòng**

`src/app/report/[branch]/reports/rooms/layout.tsx`: như layout Doanh thu, `title: "Phòng"`.

`src/app/report/[branch]/reports/rooms/page.tsx`:

```tsx
"use client";

import { Suspense } from "react";
import { DoorOpenIcon } from "lucide-react";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import {
  EINVOICE_REPORT_INFO,
  EinvoiceMetricCells,
  EinvoiceMetricHeads,
} from "@/components/report-site/einvoice-metric-cells";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportOption, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatMoney, formatNumber } from "@/lib/format";
import { roomTypeLabel } from "@/lib/labels";
import { einvoiceRoomsSheet, ROOM_GROUP_LABELS, roomRowName } from "@/lib/report-sheets";
import { reportFileName, ROOM_GROUPS } from "@/lib/reports";
import type { EinvoiceRoomReport, RoomGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

// The counted e-invoices per room or room type (spec 2026-10-02 §5.2); every
// room of the scope is listed, also those without invoices.
function RoomsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const [by, setBy] = useReportOption<RoomGroup>("by", ROOM_GROUPS, "room");
  const { data, loading } = useApiData<EinvoiceRoomReport | null>(
    "/report-site/reports/rooms",
    { ...rangeParams(branch, filters), by },
    null,
    "Không thể tải báo cáo phòng",
  );
  const scope = useReportScope(data);

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName(`phong-hddt-${data.by}`, scope.fileScope, data.range.from, data.range.to), [
      einvoiceRoomsSheet(data),
    ]);
  };

  const t = data?.totals;
  const chartRows = data
    ? data.rows
        .filter((row) => row.id !== null)
        .map((row) => ({
          name: roomRowName(row, data.by) + (scope.chain && row.branchCode ? ` · ${row.branchCode.toUpperCase()}` : ""),
          value: row.revenue,
        }))
    : [];

  return (
    <>
      <PageHeader title="Phòng" description={scope.name} info={EINVOICE_REPORT_INFO} />
      <ReportToolbar
        filters={filters}
        onChange={setFilters}
        onExport={data && !loading ? exportExcel : undefined}
        periods={false}
      />
      <Tabs value={by} onValueChange={(value) => setBy(value as RoomGroup)}>
        <TabsList>
          {ROOM_GROUPS.map((g) => (
            <TabsTrigger key={g} value={g}>
              {ROOM_GROUP_LABELS[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} footer={`VAT ${formatMoney(t.vat)}`} />
            <StatTile label="Tổng tiền" value={formatMoney(t.total)} footer={`Đã xuất ${formatMoney(t.issued)}`} />
            <StatTile label="Bill" value={formatNumber(t.billCount)} footer={`${formatNumber(t.einvoiceCount)} hóa đơn điện tử`} />
          </div>

          {t.einvoiceCount === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={DoorOpenIcon}
                  title="Chưa có hóa đơn điện tử"
                  description={`Không có hóa đơn điện tử nào trong ${formatDateRange(data.range)}.`}
                />
              </CardContent>
            </Card>
          ) : (
            chartRows.some((row) => row.value > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 {data.by === "room" ? "phòng" : "loại phòng"}</CardTitle>
                  <CardDescription>Theo doanh thu chưa VAT (đồng)</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <RankingChart rows={chartRows} label="Doanh thu" />
                </CardContent>
              </Card>
            )
          )}

          <Card>
            <CardHeader>
              <CardTitle>{ROOM_GROUP_LABELS[data.by]}</CardTitle>
              <CardDescription>{formatDateRange(data.range)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{data.by === "room" ? "Phòng" : "Loại phòng"}</TableHead>
                    <EinvoiceMetricHeads />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id ?? "none"}>
                      <TableCell className="font-medium">
                        <div className={cn(row.id === null && "text-muted-foreground")}>{roomRowName(row, data.by)}</div>
                        {row.id !== null && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {data.by === "room"
                              ? [roomTypeLabel(row.type), scope.chain ? row.branchCode?.toUpperCase() : null]
                                  .filter(Boolean)
                                  .join(" · ")
                              : `${row.rooms} phòng`}
                          </div>
                        )}
                      </TableCell>
                      <EinvoiceMetricCells m={row} />
                    </TableRow>
                  ))}
                </TableBody>
                {data.rows.length > 1 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell>Tổng</TableCell>
                      <EinvoiceMetricCells m={t} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function ReportRoomsPage() {
  return (
    <Suspense>
      <RoomsView />
    </Suspense>
  );
}
```

- [ ] **Step 6: Trang Hàng hóa**

`src/app/report/[branch]/reports/products/layout.tsx`: như trên, `title: "Hàng hóa"`.

`src/app/report/[branch]/reports/products/page.tsx`:

```tsx
"use client";

import { Suspense, useState } from "react";
import { PackageIcon, SearchIcon } from "lucide-react";
import { EmptyState } from "@/components/data-states";
import { formatDateRange } from "@/components/date-range-picker";
import { PageHeader } from "@/components/layout/page-header";
import { EINVOICE_REPORT_INFO } from "@/components/report-site/einvoice-metric-cells";
import { RankingChart } from "@/components/reports/ranking-chart";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";
import { rangeParams, useReportFilters, useReportScope } from "@/hooks/use-report-filters";
import { useBranchCode } from "@/lib/branch";
import { exportWorkbook } from "@/lib/excel-export";
import { formatMoney, formatNumber } from "@/lib/format";
import { einvoiceProductName, einvoiceProductsSheet } from "@/lib/report-sheets";
import { reportFileName } from "@/lib/reports";
import { ONLY_NARROW, SHOW_FROM } from "@/lib/responsive";
import type { EinvoiceProductReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const NUM = "text-right tabular-nums";

// The lines of the counted e-invoices by name and unit (spec 2026-10-02 §5.3);
// "Chưa có dòng hàng" makes the rows add up to the revenue report.
function ProductsView() {
  const branch = useBranchCode();
  const { filters, setFilters } = useReportFilters();
  const { data, loading } = useApiData<EinvoiceProductReport | null>(
    "/report-site/reports/products",
    rangeParams(branch, filters),
    null,
    "Không thể tải báo cáo hàng hóa",
  );
  const scope = useReportScope(data);
  const [search, setSearch] = useState("");
  const keyword = search.trim().toLowerCase();
  // The search only narrows the named rows; the two rows of the rest stay.
  const rows = (data?.rows ?? []).filter(
    (r) => !keyword || r.kind !== "item" || (r.name ?? "").toLowerCase().includes(keyword),
  );
  const chartRows = (data?.rows ?? [])
    .filter((r) => r.kind === "item")
    .map((r) => ({ name: r.name ?? "", value: r.revenue }));

  const exportExcel = async () => {
    if (!data) return;
    await exportWorkbook(reportFileName("hang-hoa-hddt", scope.fileScope, data.range.from, data.range.to), [
      einvoiceProductsSheet(data),
    ]);
  };

  const t = data?.totals;
  return (
    <>
      <PageHeader title="Hàng hóa" description={scope.name} info={EINVOICE_REPORT_INFO} />
      <ReportToolbar
        filters={filters}
        onChange={setFilters}
        onExport={data && !loading ? exportExcel : undefined}
        periods={false}
      />

      {!data || !t ? (
        <>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity md:gap-6", loading && "opacity-60")}>
          <div className="grid gap-4 @xl/main:grid-cols-3">
            <StatTile label="Doanh thu (chưa VAT)" value={formatMoney(t.revenue)} />
            <StatTile label="VAT" value={formatMoney(t.vat)} />
            <StatTile label="Tổng tiền" value={formatMoney(t.total)} />
          </div>

          {chartRows.some((row) => row.value > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Top 10 mặt hàng</CardTitle>
                <CardDescription>Theo tiền trước VAT trên hóa đơn điện tử (đồng)</CardDescription>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <RankingChart rows={chartRows} label="Trước VAT" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Mặt hàng</CardTitle>
              <CardDescription>
                {formatDateRange(data.range)} · gom theo tên (không phân biệt hoa/thường) và ĐVT
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <InputGroup className="sm:max-w-64">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Tìm tên hàng"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Tìm tên hàng"
                />
              </InputGroup>
              {data.rows.length === 0 ? (
                <EmptyState
                  icon={PackageIcon}
                  title="Chưa có hóa đơn điện tử"
                  description={`Không có hóa đơn điện tử nào trong ${formatDateRange(data.range)}.`}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên hàng</TableHead>
                      <TableHead className={SHOW_FROM.sm}>ĐVT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.xs)}>SL</TableHead>
                      <TableHead className="text-right">Trước VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>VAT</TableHead>
                      <TableHead className={cn("text-right", SHOW_FROM.sm)}>Tổng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={`${row.kind}:${row.name ?? ""}:${row.unit ?? ""}:${i}`}>
                        <TableCell className={cn("font-medium", row.kind !== "item" && "text-muted-foreground")}>
                          {einvoiceProductName(row)}
                          {row.unit && <div className={cn("text-xs font-normal text-muted-foreground", ONLY_NARROW)}>{row.unit}</div>}
                        </TableCell>
                        <TableCell className={SHOW_FROM.sm}>{row.unit ?? "—"}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.xs)}>
                          {row.quantity === null ? "—" : row.quantity.toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatNumber(row.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {!keyword && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Tổng</TableCell>
                        <TableCell className={SHOW_FROM.sm} />
                        <TableCell className={SHOW_FROM.xs} />
                        <TableCell className="text-right tabular-nums">{formatNumber(t.revenue)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.vat)}</TableCell>
                        <TableCell className={cn(NUM, SHOW_FROM.sm)}>{formatNumber(t.total)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function ReportProductsPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
```

- [ ] **Step 7: Kiểm tra**

Run: `cd 502-frontend && npx tsc --noEmit && npm run lint`
Expected: không lỗi.

Trình duyệt, trên `baocao.localhost:3003`, với dữ liệu đã có từ các task trước:
1. **Doanh thu:** các ô số khớp ô tổng của Quản lý bán hàng trong cùng khoảng ngày. "So kỳ trước" hiện Δ%. Khi `admin` chọn "Toàn chuỗi" thì có thêm bảng theo cơ sở. Excel có hai sheet.
2. **Phòng:** hai tab Theo phòng | Theo loại phòng. Dòng "Tổng" bằng tổng của trang Doanh thu.
3. **Hàng hóa:** dòng "Chưa có dòng hàng" ở cuối. Tổng bằng tổng của trang Doanh thu. Ô tìm lọc được tên hàng.
4. Ở độ rộng 390px, không trang nào cuộn ngang. `read_console_messages` không có lỗi.

- [ ] **Step 8: Commit**

```bash
git add 502-frontend/src
git commit -m "feat(web): báo cáo doanh thu, phòng, hàng hóa theo hóa đơn điện tử ở trang báo cáo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Tài liệu

**Files:**
- Modify: `CLAUDE.md`, `502-backend/CLAUDE.md`, `502-backend/src/einvoice/CLAUDE.md`, `502-frontend/CLAUDE.md`, `502-frontend/src/components/einvoices/CLAUDE.md`
- Modify: `DEPLOYMENT.md`, `docs/resource-rules.md`

- [ ] **Step 1: `CLAUDE.md` gốc**

- **Product direction:** thêm một gạch đầu dòng sau **Accounting**:

```markdown
- **Report site** (`baocao.<host>`; spec `docs/superpowers/specs/2026-10-02-trang-bao-cao-hddt-design.md`): the same app on a host starting with `baocao.` or `baocao-`, with its own login. Its figures are those of the e-invoices: Quản lý bán hàng (the paid bills holding an e-invoice, and **bills thêm tay** — `ManualBill`, made there only to issue e-invoices and numbered in the day's sequence of the branch, so the main site's numbers skip them), Hóa đơn điện tử, and the Doanh thu / Phòng / Hàng hóa reports. Details in `502-backend/CLAUDE.md` (Report site) and `502-frontend/CLAUDE.md`.
```

- **Accounts and permissions:** thêm vào cuối đoạn `User.position …`:

```markdown
`User.reportAccess` ("Vào trang báo cáo", Có/Không) lets a branch manager or BOARD use the report site; the chain manager always can, cashiers and staff never (`canUseReportSite` in `src/auth/roles.ts` ↔ `lib/permissions.ts`). Only the chain manager sets it, and an account moved to another role loses it.
```

- **Copies that must stay in sync:** thêm `canUseReportSite` (`src/auth/roles.ts`) ↔ `lib/permissions.ts`.

- [ ] **Step 2: `502-backend/CLAUDE.md`**

Thêm một mục sau mục **E-invoices**:

```markdown
- **Report site** (`src/report-site`, spec `docs/superpowers/specs/2026-10-02-trang-bao-cao-hddt-design.md`): every route under `/report-site/`, behind `ReportSiteGuard` (`canUseReportSite`; a guard, so it runs before `SharedRequestInterceptor`, whose key ignores the caller), reads on `READERS`, writes on `MANAGERS`, reads on `ReportPrismaService`. `POST /auth/login {site: 'report'}` answers 403 to an account that may not use it (an early answer only: every route checks). **Bills thêm tay** (`ManualBill`): `POST /report-site/manual-bills?branch {businessDate (≤ today's business day), roomId (of the branch), amount}` makes the bill and its first draft in one transaction, its number from `nextBillNumberOn` (`orders/bill-number.ts`, the same `BillCounter` statement as checkout, so numbers never clash and the main site's sequence skips them); `POST …/:id/cancel {reason}` locks the bill, deletes its drafts and refuses (409, rolled back) while an invoice is left (sent, uncertain or issued), the number staying used; `GET …/:id` is the panel's detail (`EinvoicesService.manualBillDetail`). `GET /report-site/bills` (500, `X-Total-Count`) lists the paid bills holding an e-invoice and the bills thêm tay (Prisma on both tables, merged by business day then sequence), `GET /report-site/bills/summary` the tab counts of every invoice of the branch plus the sums of the days. **Counted e-invoices** (`einvoice-sql.ts` `COUNTED_SQL`/`countedWhere`): every one still there except those not issued of a voided bill, dated by `Einvoice.businessDate`; total = Σ amount, VAT = Σ vatAmount, revenue = total − VAT. `GET /report-site/reports/{revenue,rooms,products}` (`EinvoiceReportsService`, `SharedRequestInterceptor`): revenue by period with comparison and branches, rooms (every room of the scope, "Không phòng"), products from the lines kept in `draft` (`jsonb_array_elements`, grouped by squeezed lower-case name and unit, the first `PRODUCT_ROWS` 1000 then "others", then "Chưa có dòng hàng" so the rows add up). The purge deletes `ManualBill` (after `Einvoice`, before `Room`, logged `manualBills`); a room with a bill thêm tay cannot be deleted.
```

- [ ] **Step 3: `502-backend/src/einvoice/CLAUDE.md`**

Sửa các chỗ nói về HĐĐT tự do, theo spec 2026-10-02:
- Mỗi HĐĐT thuộc đúng một bill: `orderId` (bill đã thanh toán) **hoặc** `manualBillId` (bill thêm tay), có CHECK `Einvoice_one_bill`. `POST /einvoices` không có bill thì trả 400 "Chọn bill cho hóa đơn". Với bill thêm tay, server khóa dòng bill khi tạo nháp, và từ chối nếu bill đã hủy.
- Mọi route nhận id (`GET`/`PATCH`/`DELETE /einvoices/:id`, `issue`, `resolve`, `number`) gọi `assertRowAccess`: kiểm tra cơ sở, và với HĐĐT của bill thêm tay thì kiểm tra thêm `canUseReportSite` (403 `REPORT_SITE_ONLY`).
- `GET /einvoices/summary` của trang chính chỉ đếm HĐĐT có `orderId`.
- Bỏ `GET /einvoices` (danh sách HĐĐT) và tham số `free`.
- `dbDay`, `dateRange`, `NOT_SETTLED`, `statusWhere` nằm ở `einvoice-filters.ts`; `draftData`, `draftVatOf`, `issuedDraft` nằm ở `einvoice-draft.ts`.
- Khi ghi `ISSUED`, cột `draft` được đặt thành `{lines}` thay vì `null`. Địa chỉ và email người mua vẫn bị bỏ.
- `vatAmount` của HĐĐT chưa xuất = VAT các dòng + VAT của dòng bù cho phần tiền chưa có dòng (`draftVatOf`).

- [ ] **Step 4: `502-frontend/CLAUDE.md`**

Thêm sau mục **Shell**:

```markdown
- **Report site** (spec `docs/superpowers/specs/2026-10-02-trang-bao-cao-hddt-design.md`): `next.config.ts` rewrites (`beforeFiles`, `has: host` `baocao[.-].+`) every page path of a host starting with `baocao.`/`baocao-` to `app/report/` (`/` → `app/report/page.tsx`, the login with the report site's words, `LoginPage` in `components/login-page.tsx`), and redirects `/report/*` of any other host to `/`; the browser keeps the main site's paths (`/cs1/sales/bills`), so **every link and redirect under `app/report` uses browser paths, never `/report`**. Server rendering stops at AuthProvider's loading screen, so `usePathname()` reads the browser path without a hydration mismatch. `lib/site.ts` (`isReportSite()`, browser only) lets AuthProvider send `site: "report"` at login, land on `/<branch>/sales/bills` and sign out an account without `canUseReportSite`; `app/report/[branch]/layout.tsx` renders `AppShell site="report"`, whose `SiteProvider`/`useSite()` give the sidebar, header and `RouteGuard` the menu `REPORT_NAV_GROUPS` (`lib/navigation.ts`) and the rules of `canVisit(user, path, site)`; no `LiveEventsProvider`, no purge menu, `usePendingDiscounts(false)`. Pages: Quản lý bán hàng (`sales/bills`: `GET /report-site/bills` + summary tiles, **Thêm hóa đơn** `components/report-site/add-manual-bill-dialog.tsx`, Hủy of a bill thêm tay with `ReasonDialog`, Excel `reportSiteBillsSheet`, a row opens the HĐĐT page with `?bill=|?manualBill=&day=`), Hóa đơn điện tử (`EinvoicesPage site="report"`), and `reports/{revenue,rooms,products}` (`components/report-site/einvoice-metric-cells.tsx`, sheets `einvoice*Sheet` in `lib/report-sheets.ts`). Dev: `baocao.localhost:<port>` with `NEXT_PUBLIC_API_URL=/api API_PROXY_TARGET=<backend>` so each host keeps its own cookie. The accounts page has "Vào trang báo cáo" (chain manager only, branch managers and BOARD only).
```

- [ ] **Step 5: `502-frontend/src/components/einvoices/CLAUDE.md`**

Viết lại các chỗ sau:
- Thân trang nằm ở `components/einvoices/einvoices-page.tsx`, dạng `EinvoicesPage({ site })`. Route của trang chính và trang báo cáo đều bọc nó trong `Suspense`.
- Mỗi bill là một `BillRef` (`lib/einvoice-bills.ts`: `{kind: "order" | "manual", id}`).
- Không còn hóa đơn tự do: bỏ nút + cạnh ô tìm, bỏ nhóm "Hóa đơn không theo bill", bỏ `revealFreeDraft`.
- Trên trang báo cáo:
  - cột trái lấy `GET /report-site/bills` và `/summary`;
  - bill thêm tay mở bằng `GET /report-site/manual-bills/:id` và hiện bằng `ManualBillSplit` (`bill-split.tsx`): không có phần còn lại, không có "Lấy món từ bill";
  - nút + trên bill thêm tay tạo nháp 0 đồng;
  - panel ghi "HĐ n · Bill … · phòng";
  - các tham số `?bill`, `?manualBill`, `?day` mở bill được chọn từ Quản lý bán hàng.
- "Gửi lại" luôn tạo nháp của cùng bill.

- [ ] **Step 6: `DEPLOYMENT.md`**

- **§3.2 (Cloudflare Tunnel):** thêm điểm 8:

```markdown
8. **Trang báo cáo** (`baocao.<tên miền>`, cùng app): thêm một Public Hostname thứ hai trỏ `HTTP` `localhost:3000`, tên bắt đầu bằng `baocao.` hoặc `baocao-` (app nhận trang báo cáo theo tên này). **Không** đặt "HTTP Host Header" khác trong cấu hình hostname: app cần đúng tên người dùng gõ. Chứng chỉ miễn phí của Cloudflare (Universal SSL) chỉ phủ tên miền con **một cấp**:
   - `baocao.hvlsv.uk`, `baocao-mediastar.vlab.id.vn`: được, miễn phí;
   - `baocao.mediastar.vlab.id.vn` (hai cấp dưới zone `vlab.id.vn`): trình duyệt báo lỗi SSL, trừ khi mua Advanced Certificate Manager rồi bật Total TLS.
   Thêm rule giới hạn đăng nhập (điểm 4) cho cả tên này. Sau khi triển khai, quản lý hệ thống bật "Vào trang báo cáo" cho tài khoản cần dùng (Quản trị → Tài khoản).
```

- **§3 (Nginx):** dưới khối cấu hình, thêm:

```markdown
Trang báo cáo dùng cùng app: thêm tên của nó vào `server_name` (ví dụ `server_name kara.example.com baocao.example.com;`) rồi `sudo certbot --nginx -d kara.example.com -d baocao.example.com`. Let's Encrypt cấp được cho tên miền ở mọi cấp. Giữ `proxy_set_header Host $host;`.
```

- **§6:** thêm mục mới:

```markdown
### 6.20. Trang báo cáo theo hóa đơn điện tử (migration `20261005000000_report_site`)

- **Migration** tự chạy khi backend khởi động:
  - Thêm `User.reportAccess`, bảng `ManualBill` (bill thêm tay) và cột `Einvoice.manualBillId`.
  - Mỗi hóa đơn điện tử không theo bill đang có được chuyển thành một bill thêm tay không phòng (mã phòng 0000), lấy số tiếp theo của ngày kinh doanh của nó. Vì vậy dãy số bill các ngày đó có thêm số.
  - Thêm ràng buộc mỗi hóa đơn thuộc đúng một bill.
  - Tính lại VAT của các nháp chưa có dòng hàng.
  - Chạy trong tích tắc. Không đổi `.env` hay `docker-compose.yml`.
- **Trang chính:** trang Hóa đơn điện tử không còn tạo hóa đơn không theo bill. Hóa đơn xuất từ nay giữ lại dòng hàng (cho báo cáo Hàng hóa của trang báo cáo).
- **Trang báo cáo:** làm theo §3.2 điểm 8 (Cloudflare) hoặc §3 (Nginx), rồi bật quyền cho tài khoản.
- **Rollback cẩn thận:** code cũ không biết `manualBillId`. Hóa đơn của bill thêm tay sẽ làm trang Hóa đơn điện tử cũ báo lỗi. Trước khi rollback hãy xóa các nháp của bill thêm tay; hóa đơn đã xuất thì không xóa được.
```

- [ ] **Step 7: `docs/resource-rules.md`**

- **§1.1:** thêm vào danh sách trần:
  - danh sách bill của trang báo cáo 500 (`GET /report-site/bills`);
  - báo cáo Hàng hóa theo HĐĐT 1000 dòng, phần còn lại gộp vào một dòng.
  Thêm `GET /report-site/bills/summary` vào danh sách API tổng.
- **§1.6:** thêm "mọi truy vấn đọc của trang báo cáo (`src/report-site`)" vào câu "Mọi truy vấn báo cáo … đi qua pool này".
- **§1.7:** thêm `/report-site/bills/summary` và `/report-site/reports/*` vào danh sách route có `SharedRequestInterceptor`, kèm ghi chú: quyền của các route này nằm trong `ReportSiteGuard`, chạy trước interceptor.
- **§3.2:**
  - đoạn `Einvoice`: đổi "mỗi dòng còn ~200 byte vì cột JSON `draft` … bị đặt về null" thành "hóa đơn đã xuất giữ lại dòng hàng trong `draft` (thêm ~0,2–2 KB mỗi hóa đơn, khoảng 100 MB/năm cho ~100 nghìn hóa đơn), cho báo cáo Hàng hóa của trang báo cáo";
  - thêm: "`ManualBill`: vài dòng mỗi ngày mỗi cơ sở, giữ như sổ sách và bị xóa cùng Xóa dữ liệu".

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md DEPLOYMENT.md docs/resource-rules.md 502-backend/CLAUDE.md 502-backend/src/einvoice/CLAUDE.md 502-frontend/CLAUDE.md 502-frontend/src/components/einvoices/CLAUDE.md
git commit -m "docs: trang báo cáo theo hóa đơn điện tử (kiến trúc, triển khai, tài nguyên)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Kiểm tra cuối — hiệu năng, trình duyệt, rà soát bảo mật

**Files:**
- Modify: `docs/security-review.md` (mục 6), `docs/resource-rules.md` (kết quả đo, nếu có số mới)

- [ ] **Step 1: Toàn bộ test**

```bash
cd 502-backend && npm test && npx tsc --noEmit -p tsconfig.json && npm run lint
for f in foundation reports costing board pr approvals live einvoice report-site; do npx jest --config ./test/jest-e2e.json test/$f.e2e-spec.ts --runInBand || break; done
cd ../502-frontend && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tất cả PASS, build thành công.

- [ ] **Step 2: `EXPLAIN ANALYZE` trên dữ liệu lớn**

Dựng database đo tải theo `docs/resource-rules.md` §6 (547 nghìn hóa đơn), rồi sinh khoảng 110 nghìn HĐĐT:

```sql
INSERT INTO "Einvoice" ("branchId", "orderId", "businessDate", "status", "amount", "vatAmount", "draft", "createdAt", "updatedAt")
SELECT o."branchId", o."id", o."businessDate", 'ISSUED', o."finalAmount", o."taxAmount",
  jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
    'name', 'Dịch vụ karaoke', 'unit', 'Lần', 'quantity', 1,
    'unitPrice', round(o."finalAmount" - o."taxAmount"), 'vatRate', 10, 'vatAmount', round(o."taxAmount")))),
  o."endTime", o."endTime"
FROM "Order" o WHERE o."status" = 'COMPLETED' AND o."businessDate" IS NOT NULL AND random() < 0.2;
ANALYZE "Einvoice";
```

Chạy `EXPLAIN ANALYZE` cho các SQL của `EinvoiceReportsService.daily`, `rooms`, `products` và của `ReportSiteBillsService.summary`. Thay tham số bằng giá trị thật: một cơ sở; một tháng và một năm; thêm một lần cả chuỗi.

Expected:
- truy vấn theo một cơ sở dùng `Einvoice_branchId_businessDate_idx`, không `Seq Scan` trên `Order`;
- một năm của một cơ sở mất dưới 1 giây.

Chạy backend vào database đó, gọi `GET /report-site/bills?branch=cs1&from=<đầu tháng>&to=<cuối tháng>` và `…&status=DRAFT`, đo bằng `curl -w '%{time_total}'`. Expected: dưới 1 giây.

- [ ] **Step 3: Đo tải**

Run: `node test/load/bench.mjs load 2025-09-29 2026-09-28 10 2` (trên cùng database, backend giới hạn như §6).
Expected: thanh toán p95 không cao hơn bảng 30/09 trong `docs/resource-rules.md` (khoảng biến động giữa các lần chạy là 270–780 ms), 0 lỗi 500/503. Nếu số khác đáng kể, ghi lại vào §6.

- [ ] **Step 4: Trình duyệt**

Trên bản build production (`next start`) với `baocao.localhost` và `localhost`, đi qua toàn luồng:
1. Thu ngân lưu nháp HĐĐT cho một bill ở trang chính. Bill đó hiện ở Quản lý bán hàng của trang báo cáo.
2. Thêm hóa đơn → nhập người mua và dòng hàng → xuất (Minvoice giả). Ba báo cáo khớp nhau.
3. Hủy một bill thêm tay chỉ có nháp.
4. Mỗi tên miền giữ phiên riêng (đăng xuất bên này không ảnh hưởng bên kia).
5. Không có lỗi CSP trong console.
6. Độ rộng 390px và 1440px đều dùng được.

- [ ] **Step 5: Rà soát bảo mật**

1. Chạy `/security-review` trên nhánh. Sửa mọi phát hiện có thật, mỗi phát hiện kèm một test e2e khi được.
2. Kiểm tra lại bằng mắt danh sách ở spec §8:
   - mọi route trong `src/report-site` có `ReportSiteGuard` (cả hai controller);
   - `assertRowAccess` có ở `findOne`, `assertAccess`, `issue`, `resolve`, `editNumber`;
   - `createForManualBill` kiểm tra `canUseReportSite` trước khi đọc bill;
   - không có `$queryRawUnsafe`;
   - `CORS_ORIGINS` không có tên miền báo cáo;
   - `lib/excel-export.ts` ghi chữ bằng `aoa_to_sheet`, thành ô kiểu chữ (không bao giờ là công thức).
3. Chạy `npm audit` ở cả hai dự án. Expected: 0 lỗ hổng mức high trở lên, hoặc ghi rõ lý do giữ lại.
4. Thêm mục `## 6. Trang báo cáo (thêm 02/10/2026)` vào `docs/security-review.md`, viết theo cách của mục 5:
   - ranh giới quyền ở từng API, và lý do lần đăng nhập `site=report` chỉ là báo lỗi sớm;
   - id HĐĐT dễ đoán, và nơi đã chặn;
   - quyền nằm trong guard vì `SharedRequestInterceptor` gộp request mà không xét người gọi;
   - cookie tách theo host;
   - header `Host` giả không cho thêm quyền;
   - không thêm vào `CORS_ORIGINS`;
   - kết quả `/security-review` và `npm audit`.

- [ ] **Step 6: Commit**

```bash
git add docs/security-review.md docs/resource-rules.md
git commit -m "docs: rà soát bảo mật và đo tải trang báo cáo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Hoàn tất nhánh**

Dùng skill `superpowers:finishing-a-development-branch`: tạo PR từ `feat/report-site` vào `main`. Phần mô tả PR nhắc việc cần làm trên máy chủ: tên miền báo cáo, chứng chỉ, bật quyền cho tài khoản.
