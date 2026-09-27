import {
  Boxes,
  Building2,
  ChartColumnBig,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  Settings2,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission } from "@/lib/permissions";
import type { User } from "@/lib/types";

// The app's navigation: sidebar groups, breadcrumb and page titles all come
// from here. Paths are relative to /[branch].

export interface NavItem {
  title: string;
  path: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Bán hàng",
    items: [
      { title: "Sơ đồ phòng", path: "/sales/rooms", icon: LayoutGrid },
      { title: "Hóa đơn", path: "/sales/statistics/bills", icon: ReceiptText, permission: "sales.reports" },
      { title: "Cài đặt bán hàng", path: "/sales/settings", icon: Settings2, permission: "sales.settings" },
    ],
  },
  {
    label: "Báo cáo",
    items: [{ title: "Doanh thu", path: "/reports/revenue", icon: ChartColumnBig, permission: "reports" }],
  },
  {
    label: "Kho",
    items: [
      { title: "Tồn kho", path: "/inventory/stock", icon: Boxes, permission: "inventory" },
      { title: "Nhập hàng", path: "/inventory/import", icon: PackagePlus, permission: "inventory" },
      { title: "Xuất hàng", path: "/inventory/export", icon: PackageMinus, permission: "inventory" },
      { title: "Phiếu kho", path: "/inventory/documents", icon: FileText, permission: "inventory" },
      { title: "Danh mục hàng", path: "/inventory/settings", icon: Tags, permission: "inventory" },
    ],
  },
  {
    label: "Kế toán",
    items: [{ title: "Sổ quỹ", path: "/funds", icon: Wallet, permission: "funds" }],
  },
  {
    label: "Quản trị",
    items: [
      { title: "Tài khoản", path: "/admin/users", icon: Users, permission: "users" },
      { title: "Cơ sở", path: "/admin/branches", icon: Building2, permission: "branches" },
      { title: "Nhập từ Excel", path: "/imports", icon: FileSpreadsheet, permission: "imports" },
    ],
  },
];

// Staff only see the rooms they serve.
function titleFor(item: NavItem, user: User | null) {
  return item.path === "/sales/rooms" && !can(user, "sales.operate") ? "Phòng đang phục vụ" : item.title;
}

// Groups and items the account may use (empty groups dropped).
export function visibleNav(user: User | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !item.permission || can(user, item.permission))
      .map((item) => ({ ...item, title: titleFor(item, user) })),
  })).filter((group) => group.items.length > 0);
}

// The nav entry a sub-path belongs to: the longest matching path wins, so
// /sales/statistics/bills is "Hóa đơn" and /sales/rooms/12 is "Sơ đồ phòng".
// Pages the account may not open are found too, so the header still names them.
export function findNav(subPath: string, user: User | null) {
  let best: { group: NavGroup; item: NavItem } | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = subPath === item.path || subPath.startsWith(`${item.path}/`);
      if (matches && (!best || item.path.length > best.item.path.length)) {
        best = { group, item: { ...item, title: titleFor(item, user) } };
      }
    }
  }
  return best;
}
