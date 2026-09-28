import {
  ChartColumnBig,
  ChartLine,
  Clock,
  DoorOpen,
  Package,
  Scale,
  UserRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import type { ExportTable } from "@/lib/excel-export";
import type { Permission } from "@/lib/permissions";
import {
  branchPeriodsSheet,
  branchesSheet,
  fundEntriesSheet,
  fundSummarySheet,
  hoursCellsSheet,
  hoursWeekdaySheet,
  inventorySheet,
  productsSheet,
  profitSheet,
  revenuePeriodsSheet,
  roomsSheet,
  staffSheet,
} from "@/lib/report-sheets";
import { dayCount, MAX_BILLS_RANGE_DAYS } from "@/lib/reports";
import type {
  BranchesReport,
  FundSummary,
  FundTransaction,
  GroupBy,
  HoursReport,
  InventoryReport,
  ProductReport,
  ProfitReport,
  RevenueReport,
  RoomReport,
  StaffReport,
} from "@/lib/types";

// What the Tải báo cáo page can put in one workbook: every report, one
// sheet per choice, built by the same builders as the report pages' own
// export.

export interface DownloadContext {
  branch: string; // the branch in the URL
  chain: boolean; // whole chain (chain manager)
  from: string;
  to: string;
  groupBy: GroupBy;
  rangeLabel: string; // "01/09/2026 – 29/09/2026"
  // GET, each distinct request fetched once per download (two sheets of
  // one report share it).
  get: <T>(url: string, params: Record<string, string>) => Promise<T>;
  // A note shown after the download (a list that was cut short).
  warn: (message: string) => void;
}

export interface DownloadSheet {
  key: string;
  label: string;
  // Sheet name in the workbook: unique, at most 31 characters.
  sheet: string;
  build: (ctx: DownloadContext) => Promise<ExportTable>;
}

export interface DownloadReport {
  title: string;
  description: string;
  icon: LucideIcon;
  sheets: DownloadSheet[];
  // Split into periods by the page's "Gộp theo".
  periods?: boolean;
  permission?: Permission;
  // Why the report cannot be downloaded with these settings, if so.
  unavailable?: (ctx: Pick<DownloadContext, "chain" | "from" | "to">) => string | null;
}

// Query of a report: no branch means the whole chain.
const range = (ctx: DownloadContext) => ({ ...(ctx.chain ? {} : { branch: ctx.branch }), from: ctx.from, to: ctx.to });
const periods = (ctx: DownloadContext) => ({ ...range(ctx), groupBy: ctx.groupBy });

// GET /funds returns at most this many entries (funds.service.ts).
const FUND_ENTRIES_LIMIT = 500;

export const DOWNLOAD_REPORTS: DownloadReport[] = [
  {
    title: "Doanh thu",
    description: "Hóa đơn, giờ phòng, tiền giờ, tiền hàng, giảm giá, doanh thu chưa VAT và VAT theo từng kỳ.",
    icon: ChartColumnBig,
    periods: true,
    sheets: [
      {
        key: "revenue",
        label: "Theo kỳ",
        sheet: "Doanh thu",
        build: async (ctx) => revenuePeriodsSheet(await ctx.get<RevenueReport>("/reports/revenue", periods(ctx)), "Doanh thu"),
      },
    ],
  },
  {
    title: "Nhân viên",
    description: "Doanh thu theo nhân viên; mỗi hóa đơn tính trọn cho CSKH, phục vụ và thu ngân của nó.",
    icon: UserRound,
    sheets: (
      [
        ["cskh", "CSKH"],
        ["server", "Phục vụ"],
        ["cashier", "Thu ngân"],
      ] as const
    ).map(([role, label]) => ({
      key: `staff.${role}`,
      label,
      sheet: `Nhân viên – ${label}`,
      build: async (ctx) =>
        staffSheet(await ctx.get<StaffReport>("/reports/staff", { ...range(ctx), role }), `Nhân viên – ${label}`),
    })),
  },
  {
    title: "Phòng",
    description: "Doanh thu và công suất của từng phòng hoặc loại phòng.",
    icon: DoorOpen,
    sheets: (
      [
        ["room", "Theo phòng", "Phòng"],
        ["type", "Theo loại phòng", "Loại phòng"],
      ] as const
    ).map(([by, label, sheet]) => ({
      key: `rooms.${by}`,
      label,
      sheet,
      build: async (ctx) => roomsSheet(await ctx.get<RoomReport>("/reports/rooms", { ...range(ctx), by }), sheet),
    })),
  },
  {
    title: "Hàng hóa",
    description: "Số lượng bán, doanh thu thuần, giá vốn và lãi gộp theo món hoặc danh mục.",
    icon: Package,
    sheets: (
      [
        ["product", "Theo món", "Hàng hóa – theo món"],
        ["category", "Theo danh mục", "Hàng hóa – theo danh mục"],
      ] as const
    ).map(([by, label, sheet]) => ({
      key: `products.${by}`,
      label,
      sheet,
      build: async (ctx) => productsSheet(await ctx.get<ProductReport>("/reports/products", { ...range(ctx), by }), sheet),
    })),
  },
  {
    title: "Khung giờ",
    description: "Lượt khách và doanh thu theo thứ trong tuần và giờ bắt đầu.",
    icon: Clock,
    sheets: [
      {
        key: "hours.weekday",
        label: "Theo thứ",
        sheet: "Khung giờ – theo thứ",
        build: async (ctx) =>
          hoursWeekdaySheet(await ctx.get<HoursReport>("/reports/hours", range(ctx)), "Khung giờ – theo thứ"),
      },
      {
        key: "hours.cells",
        label: "Theo thứ và giờ",
        sheet: "Khung giờ – theo giờ",
        build: async (ctx) =>
          hoursCellsSheet(await ctx.get<HoursReport>("/reports/hours", range(ctx)), "Khung giờ – theo giờ"),
      },
    ],
  },
  {
    title: "Lãi lỗ",
    description: "Doanh thu, giá vốn, lãi gộp, chi phí và lợi nhuận; các kỳ xếp thành cột.",
    icon: Scale,
    periods: true,
    sheets: [
      {
        key: "profit",
        label: "Theo kỳ",
        sheet: "Lãi lỗ",
        build: async (ctx) => profitSheet(await ctx.get<ProfitReport>("/reports/profit", periods(ctx)), "Lãi lỗ"),
      },
    ],
  },
  {
    title: "Xuất nhập tồn",
    description: "Tồn đầu, nhập, bán, xuất kho và tồn cuối của từng món, theo số lượng và giá trị.",
    icon: Warehouse,
    sheets: [
      {
        key: "inventory",
        label: "Theo món",
        sheet: "Xuất nhập tồn",
        build: async (ctx) =>
          inventorySheet((await ctx.get<InventoryReport>("/reports/inventory", range(ctx))).rows, "Xuất nhập tồn"),
      },
    ],
  },
  {
    title: "Sổ quỹ",
    description: "Tồn đầu kỳ, thu, chi, tồn cuối kỳ theo hình thức, và danh sách phiếu thu chi.",
    icon: Wallet,
    unavailable: ({ chain, from, to }) =>
      chain
        ? "Sổ quỹ chỉ xuất theo từng cơ sở."
        : dayCount(from, to) > MAX_BILLS_RANGE_DAYS
          ? `Sổ quỹ chỉ xuất tối đa ${MAX_BILLS_RANGE_DAYS} ngày.`
          : null,
    sheets: [
      {
        key: "funds.summary",
        label: "Tổng hợp",
        sheet: "Sổ quỹ – tổng hợp",
        build: async (ctx) =>
          fundSummarySheet(
            await ctx.get<FundSummary>("/funds/summary", range(ctx)),
            ctx.rangeLabel,
            "Sổ quỹ – tổng hợp",
          ),
      },
      {
        key: "funds.entries",
        label: "Phiếu thu chi",
        sheet: "Sổ quỹ – phiếu thu chi",
        build: async (ctx) => {
          const entries = await ctx.get<FundTransaction[]>("/funds", range(ctx));
          if (entries.length >= FUND_ENTRIES_LIMIT) {
            ctx.warn(
              `Sheet "Sổ quỹ – phiếu thu chi" chỉ gồm ${FUND_ENTRIES_LIMIT} phiếu mới nhất; chọn khoảng ngày ngắn hơn để có đủ.`,
            );
          }
          return fundEntriesSheet(entries, "Sổ quỹ – phiếu thu chi");
        },
      },
    ],
  },
  {
    title: "So sánh cơ sở",
    description: "Các cơ sở cạnh nhau, luôn tính trên toàn chuỗi.",
    icon: ChartLine,
    periods: true,
    permission: "reports.chain",
    sheets: [
      {
        key: "branches.totals",
        label: "Theo cơ sở",
        sheet: "So sánh cơ sở",
        build: async (ctx) =>
          branchesSheet(await ctx.get<BranchesReport>("/reports/branches", { from: ctx.from, to: ctx.to, groupBy: ctx.groupBy }), "So sánh cơ sở"),
      },
      {
        key: "branches.periods",
        label: "Doanh thu theo kỳ",
        sheet: "So sánh cơ sở – theo kỳ",
        build: async (ctx) =>
          branchPeriodsSheet(
            await ctx.get<BranchesReport>("/reports/branches", { from: ctx.from, to: ctx.to, groupBy: ctx.groupBy }),
            "So sánh cơ sở – theo kỳ",
          ),
      },
    ],
  },
];

// Picked the first time the page is opened.
export const DEFAULT_DOWNLOADS = ["revenue", "products.product", "profit", "inventory", "funds.summary"];

// A GET per distinct url + query, shared by the sheets of one download.
export function cachedGet(): DownloadContext["get"] {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(url: string, params: Record<string, string>) => {
    const key = `${url}?${new URLSearchParams(params)}`;
    if (!cache.has(key)) cache.set(key, api.get<T>(url, { params }).then((res) => res.data));
    return cache.get(key) as Promise<T>;
  };
}
