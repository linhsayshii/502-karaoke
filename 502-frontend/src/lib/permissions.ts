import type { Role, User } from "@/lib/types";

// UI-side copy of the backend permission matrix. It only hides what the user
// cannot use; the backend guards are what actually enforce access.

export const ROLE_LABELS: Record<Role, string> = {
  CHAIN_MANAGER: "Quản lý hệ thống",
  BRANCH_MANAGER: "Quản lý cơ sở",
  CASHIER: "Thu ngân",
  STAFF: "Nhân viên",
  BOARD: "Hội đồng quản trị",
};

export const POSITION_LABELS = { CSKH: "CSKH", SERVER: "Phục vụ" } as const;

export type Permission =
  | "branch.switch" // pick any branch
  | "sales.operate" // open rooms, order, checkout
  | "sales.cancel"
  | "sales.editPaid" // correct a paid bill (stock and fund follow)
  | "sales.reports" // bill list (view)
  | "reports" // Báo cáo (managers)
  | "reports.chain" // whole-chain reports and branch comparison
  | "sales.settings" // change rooms, categories, products
  | "catalog.view" // rooms, categories, products (read only)
  | "inventory" // phiếu nhập / xuất, cancelling them
  | "inventory.view" // stock and documents (read only)
  | "funds" // write fund entries
  | "funds.view" // sổ quỹ (read only)
  | "purge" // wipe data (HĐQT only)
  | "purge.logs" // who wiped what, and refused attempts
  | "users" // manage accounts
  | "users.view" // accounts list (read only)
  | "branches" // manage branches
  | "branches.view" // branches list (read only)
  | "imports"; // Excel import (each kind also needs its own permission)

const MANAGERS: Role[] = ["CHAIN_MANAGER", "BRANCH_MANAGER"];
// HĐQT is read-only: it only appears in the "view" permissions below.
const READERS: Role[] = [...MANAGERS, "BOARD"];

const MATRIX: Record<Permission, Role[]> = {
  "branch.switch": ["CHAIN_MANAGER", "BOARD"],
  "sales.operate": [...MANAGERS, "CASHIER"],
  "sales.cancel": MANAGERS,
  "sales.editPaid": MANAGERS,
  "sales.reports": READERS,
  reports: READERS,
  "reports.chain": ["CHAIN_MANAGER", "BOARD"],
  "sales.settings": MANAGERS,
  "catalog.view": READERS,
  inventory: MANAGERS,
  "inventory.view": READERS,
  funds: MANAGERS,
  "funds.view": READERS,
  purge: ["BOARD"],
  "purge.logs": ["CHAIN_MANAGER", "BOARD"],
  users: MANAGERS,
  "users.view": READERS,
  branches: ["CHAIN_MANAGER"],
  "branches.view": ["CHAIN_MANAGER", "BOARD"],
  imports: MANAGERS,
};

export function can(user: User | null, permission: Permission): boolean {
  return !!user && MATRIX[permission].includes(user.role);
}

// Page permissions by path after /[branch]; first match wins.
const ROUTE_PERMISSIONS: [string, Permission][] = [
  ["/reports/branches", "reports.chain"],
  ["/reports", "reports"],
  ["/sales/statistics", "sales.reports"],
  ["/sales/overview", "sales.reports"],
  ["/sales/settings", "catalog.view"],
  ["/inventory/stock", "inventory.view"],
  ["/inventory/documents", "inventory.view"],
  ["/inventory/settings", "catalog.view"],
  ["/inventory", "inventory"],
  ["/funds", "funds.view"],
  ["/admin/branches", "branches.view"],
  ["/imports", "imports"],
  ["/admin/reports", "reports"],
  ["/admin/purge-logs", "purge.logs"],
  ["/admin", "users.view"],
];

export function canVisit(user: User | null, subPath: string): boolean {
  const rule = ROUTE_PERMISSIONS.find(([prefix]) => subPath.startsWith(prefix));
  return rule ? can(user, rule[1]) : !!user;
}
