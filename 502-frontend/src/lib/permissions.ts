import type { Role, User } from "@/lib/types";

// UI-side copy of the backend permission matrix. It only hides what the user
// cannot use; the backend guards are what actually enforce access.

export const ROLE_LABELS: Record<Role, string> = {
  CHAIN_MANAGER: "Quản lý hệ thống",
  BRANCH_MANAGER: "Quản lý cơ sở",
  CASHIER: "Thu ngân",
  STAFF: "Nhân viên",
};

export const POSITION_LABELS = { CSKH: "CSKH", SERVER: "Phục vụ" } as const;

export type Permission =
  | "branch.switch" // pick any branch
  | "sales.operate" // open rooms, order, checkout
  | "sales.cancel"
  | "sales.editPaid" // correct a paid bill (stock and fund follow)
  | "sales.reports"
  | "reports" // Báo cáo (managers)
  | "reports.chain" // whole-chain reports and branch comparison
  | "sales.settings" // rooms, categories, products
  | "inventory"
  | "funds"
  | "users"
  | "branches"
  | "imports"; // Excel import (each kind also needs its own permission)

const MANAGERS: Role[] = ["CHAIN_MANAGER", "BRANCH_MANAGER"];

const MATRIX: Record<Permission, Role[]> = {
  "branch.switch": ["CHAIN_MANAGER"],
  "sales.operate": [...MANAGERS, "CASHIER"],
  "sales.cancel": MANAGERS,
  "sales.editPaid": MANAGERS,
  "sales.reports": MANAGERS,
  reports: MANAGERS,
  "reports.chain": ["CHAIN_MANAGER"],
  "sales.settings": MANAGERS,
  inventory: MANAGERS,
  funds: MANAGERS,
  users: MANAGERS,
  branches: ["CHAIN_MANAGER"],
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
  ["/sales/settings", "sales.settings"],
  ["/inventory", "inventory"],
  ["/funds", "funds"],
  ["/admin/branches", "branches"],
  ["/imports", "imports"],
  ["/admin", "users"],
];

export function canVisit(user: User | null, subPath: string): boolean {
  const rule = ROUTE_PERMISSIONS.find(([prefix]) => subPath.startsWith(prefix));
  return rule ? can(user, rule[1]) : !!user;
}
