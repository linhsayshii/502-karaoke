import {
  BadgePercent,
  Boxes,
  Building2,
  ChartColumnBig,
  ChartLine,
  ClipboardCheck,
  Clock,
  Contact,
  DoorOpen,
  FileDown,
  FileSpreadsheet,
  FileText,
  History,
  LayoutGrid,
  Package,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  Scale,
  Settings2,
  Tags,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission } from "@/lib/permissions";
import type { User } from "@/lib/types";

// The app's navigation: sidebar groups, breadcrumb and page titles all come
// from here. Paths are relative to /[branch].

export interface NavItem {
  title: string;
  // Name in the sidebar when it differs from the page's own title.
  sidebarTitle?: string;
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
      {
        title: "Hóa đơn",
        sidebarTitle: "Quản lý bán hàng",
        path: "/sales/statistics/bills",
        icon: ReceiptText,
        permission: "sales.reports",
      },
      { title: "Duyệt giảm giá", path: "/sales/discounts", icon: BadgePercent, permission: "discounts.view" },
      { title: "Cài đặt bán hàng", path: "/sales/settings", icon: Settings2, permission: "catalog.view" },
    ],
  },
  {
    label: "PR/KTV",
    items: [
      {
        title: "Điểm danh PR/KTV",
        sidebarTitle: "Điểm danh",
        path: "/pr/attendance",
        icon: ClipboardCheck,
        permission: "pr.view",
      },
      { title: "Thống kê PR", path: "/pr/staff", icon: Contact, permission: "pr.view" },
    ],
  },
  {
    label: "Báo cáo",
    items: [
      { title: "Doanh thu", path: "/reports/revenue", icon: ChartColumnBig, permission: "reports" },
      { title: "Nhân viên", path: "/reports/staff", icon: UserRound, permission: "reports" },
      { title: "Phòng", path: "/reports/rooms", icon: DoorOpen, permission: "reports" },
      { title: "Hàng hóa", path: "/reports/products", icon: Package, permission: "reports" },
      { title: "Khung giờ", path: "/reports/hours", icon: Clock, permission: "reports" },
      { title: "Lãi lỗ", path: "/reports/profit", icon: Scale, permission: "reports" },
      { title: "Tồn kho", path: "/reports/stock", icon: Boxes, permission: "reports" },
      { title: "Xuất nhập tồn", path: "/reports/inventory", icon: Warehouse, permission: "reports" },
      { title: "So sánh cơ sở", path: "/reports/branches", icon: ChartLine, permission: "reports.chain" },
    ],
  },
  {
    label: "Kho",
    items: [
      { title: "Nhập hàng", path: "/inventory/import", icon: PackagePlus, permission: "inventory" },
      { title: "Xuất hàng", path: "/inventory/export", icon: PackageMinus, permission: "inventory" },
      { title: "Phiếu kho", path: "/inventory/documents", icon: FileText, permission: "inventory.view" },
      { title: "Danh mục hàng", path: "/inventory/settings", icon: Tags, permission: "catalog.view" },
    ],
  },
  {
    label: "Kế toán",
    items: [{ title: "Sổ quỹ", path: "/funds", icon: Wallet, permission: "funds.view" }],
  },
  {
    label: "Quản trị",
    items: [
      { title: "Tài khoản", path: "/admin/users", icon: Users, permission: "users.view" },
      { title: "Cơ sở", path: "/admin/branches", icon: Building2, permission: "branches.view" },
      { title: "Nhập từ Excel", path: "/imports", icon: FileSpreadsheet, permission: "imports" },
      { title: "Tải báo cáo", path: "/admin/reports", icon: FileDown, permission: "reports" },
      { title: "Nhật ký xóa dữ liệu", path: "/admin/purge-logs", icon: History, permission: "purge.logs" },
    ],
  },
];

// Staff only see the rooms they serve.
function titleFor(item: NavItem, user: User | null) {
  return item.path === "/sales/rooms" && user?.role === "STAFF" ? "Phòng đang phục vụ" : item.title;
}

// Groups and items the account may use (empty groups dropped), titled as
// the sidebar shows them.
export function visibleNav(user: User | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !item.permission || can(user, item.permission))
      .map((item) => ({ ...item, title: item.sidebarTitle ?? titleFor(item, user) })),
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
