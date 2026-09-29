import { toSheet, type ExportColumn, type ExportTable } from "@/lib/excel-export";
import { billLabel, formatDate, formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import {
  DOC_TYPE_LABELS,
  FUND_TYPE_LABELS,
  NO_CATEGORY,
  NO_ROOM,
  PAYMENT_METHOD_LABELS,
  roomTypeLabel,
  STAFF_ROLE_LABELS,
  UNASSIGNED_STAFF,
  WEEKDAY_LABELS,
} from "@/lib/labels";
import { profitLines, type ProfitLine } from "@/lib/profit";
import { METRIC_COLUMNS } from "@/lib/report-columns";
import type {
  BranchReportRow,
  BranchesReport,
  FundSummary,
  FundTransaction,
  FundType,
  HourCell,
  HoursReport,
  InventoryFlows,
  InventoryReportRow,
  ProductGroup,
  ProductReport,
  ProductReportRow,
  ProfitMetrics,
  ProfitReport,
  ReportBucket,
  RevenueMetrics,
  RevenueReport,
  RoomGroup,
  RoomReport,
  RoomReportRow,
  StaffReport,
  StaffReportRow,
} from "@/lib/types";

// The Excel sheet of each report, built from its API response. Shared by the
// report pages' own export and the Tải báo cáo page (several reports in one
// workbook), so a report looks the same wherever it is downloaded. Each
// builder takes the sheet name, since a workbook needs unique names.

// ---- Doanh thu

type PeriodRow = ReportBucket & RevenueMetrics;
type RevenueBranchRow = { name: string } & RevenueMetrics;

const revenuePeriodColumns: ExportColumn<PeriodRow>[] = [
  { header: "Kỳ", value: (r) => r.label },
  { header: "Từ ngày", value: (r) => formatDate(r.from) },
  { header: "Đến ngày", value: (r) => formatDate(r.to) },
  ...METRIC_COLUMNS,
];

export function revenuePeriodsSheet(data: RevenueReport, name = "Theo kỳ"): ExportTable {
  return toSheet(name, revenuePeriodColumns, data.buckets, {
    key: "",
    label: "Tổng",
    from: data.range.from,
    to: data.range.to,
    ...data.totals,
  });
}

// Only for the whole chain (byBranch).
export function revenueBranchesSheet(data: RevenueReport, name = "Theo cơ sở"): ExportTable | null {
  if (!data.byBranch) return null;
  const columns: ExportColumn<RevenueBranchRow>[] = [{ header: "Cơ sở", value: (r) => r.name }, ...METRIC_COLUMNS];
  return toSheet(name, columns, data.byBranch, { name: "Tổng", ...data.totals });
}

// ---- Nhân viên

// id null: the bills nobody was assigned to in this role.
export const staffName = (row: StaffReportRow) => row.name ?? (row.id === null ? UNASSIGNED_STAFF : `#${row.id}`);

// Tiền giờ + tiền hàng before their discounts (and before VAT), put right
// before the revenue after discounts.
const revenueAt = METRIC_COLUMNS.findIndex((c) => c.header === "Doanh thu (chưa VAT)");
const staffColumns: ExportColumn<StaffReportRow>[] = [
  { header: "Nhân viên", value: staffName },
  { header: "Tài khoản", value: (r) => r.username },
  { header: "Cơ sở", value: (r) => r.branchCode?.toUpperCase() ?? null },
  ...METRIC_COLUMNS.slice(0, revenueAt),
  { header: "Tổng doanh thu trước giảm giá", type: "money", value: (r) => r.roomFee + r.productSales },
  ...METRIC_COLUMNS.slice(revenueAt),
  { header: "TB/hóa đơn", type: "money", value: (r) => r.avgRevenue },
];

export function staffSheet(data: StaffReport, name = STAFF_ROLE_LABELS[data.role]): ExportTable {
  return toSheet(name, staffColumns, data.rows, {
    id: null,
    name: "Tổng",
    username: null,
    branchCode: null,
    ...data.totals,
  });
}

// ---- Phòng

export const ROOM_GROUP_LABELS: Record<RoomGroup, string> = { room: "Theo phòng", type: "Theo loại phòng" };

// A room, a room type (by=type) or "Không phòng" (id null).
export function roomRowName(row: RoomReportRow, by: RoomGroup) {
  if (row.id === null) return row.name ?? NO_ROOM;
  return by === "type" ? roomTypeLabel(row.type) : (row.name ?? "");
}

function roomColumns(by: RoomGroup): ExportColumn<RoomReportRow>[] {
  return [
    { header: by === "room" ? "Phòng" : "Loại phòng", value: (r) => roomRowName(r, by) },
    ...(by === "room"
      ? [
          { header: "Loại", value: (r: RoomReportRow) => (r.type ? roomTypeLabel(r.type) : null) },
          { header: "Cơ sở", value: (r: RoomReportRow) => r.branchCode?.toUpperCase() ?? null },
        ]
      : [{ header: "Số phòng", type: "number" as const, value: (r: RoomReportRow) => r.rooms }]),
    { header: "Công suất", type: "percent", value: (r) => r.occupancy },
    ...METRIC_COLUMNS,
  ];
}

export function roomsSheet(data: RoomReport, name = ROOM_GROUP_LABELS[data.by]): ExportTable {
  // id null + a name: roomRowName() shows "Tổng".
  return toSheet(name, roomColumns(data.by), data.rows, {
    id: null,
    name: "Tổng",
    type: null,
    branchCode: null,
    rooms: data.rows.reduce((sum, r) => sum + r.rooms, 0),
    occupancy: data.occupancy,
    ...data.totals,
  });
}

// ---- Hàng hóa

export const PRODUCT_GROUP_LABELS: Record<ProductGroup, string> = { product: "Theo món", category: "Theo danh mục" };

// A category row with id null: the products without a category.
export const productRowName = (row: ProductReportRow) => row.name ?? (row.id === null ? NO_CATEGORY : "");

function productColumns(by: ProductGroup): ExportColumn<ProductReportRow>[] {
  return [
    { header: by === "product" ? "Món" : "Danh mục", value: productRowName },
    ...(by === "product"
      ? [
          { header: "Danh mục", value: (r: ProductReportRow) => (r.id === null ? null : (r.categoryName ?? NO_CATEGORY)) },
          { header: "Đơn vị", value: (r: ProductReportRow) => r.unit },
        ]
      : []),
    { header: "Cơ sở", value: (r) => r.branchCode?.toUpperCase() ?? null },
    { header: "Số lượng", type: "number", value: (r) => r.quantity },
    { header: "Thành tiền", type: "money", value: (r) => r.gross },
    { header: "Giảm giá phân bổ", type: "money", value: (r) => r.discount },
    { header: "Doanh thu thuần (chưa VAT)", type: "money", value: (r) => r.net },
    { header: "Giá vốn", type: "money", value: (r) => r.cost },
    { header: "Lãi gộp", type: "money", value: (r) => r.grossProfit },
    { header: "% biên", type: "percent", value: (r) => r.margin },
    { header: "Tỷ trọng", type: "percent", value: (r) => r.share },
  ];
}

export function productsSheet(data: ProductReport, name = PRODUCT_GROUP_LABELS[data.by]): ExportTable {
  // id null + a name: productRowName() shows "Tổng", the category column stays empty.
  return toSheet(name, productColumns(data.by), data.rows, {
    id: null,
    name: "Tổng",
    unit: null,
    categoryName: null,
    branchCode: null,
    share: data.totals.net ? 1 : null,
    ...data.totals,
  });
}

// ---- Khung giờ

export interface WeekdayRow {
  label: string;
  sessions: number;
  revenue: number;
}

const hourRange = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`;

// Totals per weekday of the business day (T2 → CN).
export function byWeekday(cells: HourCell[]): WeekdayRow[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const day = cells.filter((c) => c.weekday === i + 1);
    return {
      label,
      sessions: day.reduce((sum, c) => sum + c.sessions, 0),
      revenue: day.reduce((sum, c) => sum + c.revenue, 0),
    };
  });
}

const weekdayColumns: ExportColumn<WeekdayRow>[] = [
  { header: "Thứ", value: (r) => r.label },
  { header: "Lượt khách", type: "number", value: (r) => r.sessions },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (r) => r.revenue },
];

const cellColumns: ExportColumn<HourCell>[] = [
  { header: "Thứ", value: (c) => WEEKDAY_LABELS[c.weekday - 1] },
  { header: "Giờ bắt đầu", value: (c) => hourRange(c.hour) },
  { header: "Lượt khách", type: "number", value: (c) => c.sessions },
  { header: "Doanh thu (chưa VAT)", type: "money", value: (c) => c.revenue },
];

export function hoursWeekdaySheet(data: HoursReport, name = "Theo thứ"): ExportTable {
  return toSheet(name, weekdayColumns, byWeekday(data.cells), { label: "Tổng", ...data.totals });
}

export function hoursCellsSheet(data: HoursReport, name = "Theo giờ"): ExportTable {
  return toSheet(name, cellColumns, data.cells);
}

// ---- Lãi lỗ

// Percent lines go to Excel as text: their columns are formatted as money.
const profitValue = (line: ProfitLine, m: ProfitMetrics) =>
  line.kind === "percent" ? formatPercent(line.value(m)) : line.value(m);

// Lines down, the total then each period across.
export function profitSheet(data: ProfitReport, name = "Lãi lỗ"): ExportTable {
  const columns: ExportColumn<ProfitLine>[] = [
    { header: "Khoản mục", value: (line) => (line.level ? `   ${line.label}` : line.label) },
    { header: "Tổng", type: "money", value: (line) => profitValue(line, data.totals) },
    ...data.buckets.map(
      (bucket): ExportColumn<ProfitLine> => ({
        header: bucket.label,
        type: "money",
        value: (line) => profitValue(line, bucket),
      }),
    ),
  ];
  return toSheet(name, columns, profitLines(data.categories));
}

// ---- Xuất nhập tồn

// The flows of a product, left to right.
export const INVENTORY_FLOWS: { key: keyof InventoryFlows; label: string }[] = [
  { key: "opening", label: "Tồn đầu" },
  { key: "imports", label: "Nhập" },
  { key: "sales", label: "Bán" },
  { key: "exports", label: "Xuất kho" },
  { key: "others", label: "Hoàn / điều chỉnh" },
  { key: "closing", label: "Tồn cuối" },
];

export function sumFlows(rows: InventoryReportRow[]): InventoryFlows {
  const totals = Object.fromEntries(
    INVENTORY_FLOWS.map((f) => [f.key, { quantity: 0, value: 0 }]),
  ) as unknown as InventoryFlows;
  for (const row of rows) {
    for (const { key } of INVENTORY_FLOWS) {
      totals[key].quantity += row[key].quantity;
      totals[key].value += row[key].value;
    }
  }
  return totals;
}

const inventoryColumns: ExportColumn<InventoryReportRow>[] = [
  { header: "Món", value: (r) => r.name },
  { header: "Danh mục", value: (r) => (r.productId ? (r.categoryName ?? NO_CATEGORY) : null) },
  { header: "Đơn vị", value: (r) => r.unit || null },
  { header: "Cơ sở", value: (r) => r.branchCode.toUpperCase() || null },
  ...INVENTORY_FLOWS.flatMap(({ key, label }): ExportColumn<InventoryReportRow>[] => [
    { header: `${label} – SL`, type: "number", value: (r) => r[key].quantity },
    { header: `${label} – giá trị`, type: "money", value: (r) => r[key].value },
  ]),
];

// `rows`: the products to list (the page may filter them by category).
export function inventorySheet(rows: InventoryReportRow[], name = "Xuất nhập tồn"): ExportTable {
  return toSheet(name, inventoryColumns, rows, {
    productId: 0,
    name: "Tổng",
    unit: "",
    categoryId: null,
    categoryName: null,
    branchCode: "",
    ...sumFlows(rows),
  });
}

// ---- So sánh cơ sở

export function branchesSheet(data: BranchesReport, name = "Theo cơ sở"): ExportTable {
  const columns: ExportColumn<BranchReportRow>[] = [
    { header: "Cơ sở", value: (r) => r.name },
    ...METRIC_COLUMNS,
    { header: "Tỷ trọng doanh thu", type: "percent", value: (r) => r.share },
    ...(data.previous
      ? [{ header: "Doanh thu kỳ trước", type: "money" as const, value: (r: BranchReportRow) => r.previous?.revenue ?? 0 }]
      : []),
  ];
  return toSheet(name, columns, data.branches, {
    branchId: 0,
    code: "",
    name: "Toàn chuỗi",
    share: data.totals.revenue ? 1 : null,
    previous: data.previous?.totals ?? null,
    series: [],
    ...data.totals,
  });
}

// Revenue of each branch per period, branches across.
export function branchPeriodsSheet(data: BranchesReport, name = "Doanh thu theo kỳ"): ExportTable {
  type Row = ReportBucket & { values: number[]; total: number };
  const columns: ExportColumn<Row>[] = [
    { header: "Kỳ", value: (r) => r.label },
    { header: "Từ ngày", value: (r) => formatDate(r.from) },
    { header: "Đến ngày", value: (r) => formatDate(r.to) },
    ...data.branches.map((b, i) => ({ header: b.name, type: "money" as const, value: (r: Row) => r.values[i] })),
    { header: "Toàn chuỗi", type: "money", value: (r) => r.total },
  ];
  const rows = data.buckets.map((bucket, i) => {
    const values = data.branches.map((b) => b.series[i]);
    return { ...bucket, values, total: values.reduce((sum, v) => sum + v, 0) };
  });
  return toSheet(name, columns, rows, {
    key: "",
    label: "Tổng",
    from: data.range.from,
    to: data.range.to,
    values: data.branches.map((b) => b.revenue),
    total: data.totals.revenue,
  });
}

// ---- Sổ quỹ

// Where an entry comes from: a paid bill, an import, or typed by hand.
export function fundSource(t: FundTransaction) {
  if (t.order) return `Hóa đơn ${billLabel(t.order)}${t.order.room ? ` · ${t.order.room.name}` : ""}`;
  if (t.stockDocument) return `${DOC_TYPE_LABELS[t.stockDocument.type]} ${t.stockDocument.code}`;
  return "Thủ công";
}

// Cancelled entries stay listed but out of the Thu/Chi columns, as they are
// out of the totals.
const entryAmount = (t: FundTransaction, type: FundType) =>
  !t.cancelledAt && t.type === type ? Number(t.amount) : null;

const entryColumns: ExportColumn<FundTransaction>[] = [
  { header: "Thời gian", value: (t) => formatDateTime(t.occurredAt) },
  { header: "Loại", value: (t) => FUND_TYPE_LABELS[t.type] },
  { header: "Hình thức", value: (t) => PAYMENT_METHOD_LABELS[t.method] },
  { header: "Khoản mục", value: (t) => t.category },
  { header: "Diễn giải", value: (t) => t.description },
  { header: "Nguồn", value: fundSource },
  { header: "Thu", type: "money", value: (t) => entryAmount(t, "INCOME") },
  { header: "Chi", type: "money", value: (t) => entryAmount(t, "EXPENSE") },
  { header: "Người lập", value: (t) => t.createdBy?.fullName ?? null },
  {
    header: "Đã hủy",
    value: (t) =>
      t.cancelledAt &&
      `${formatMoney(t.amount)} · ${t.cancelReason ?? ""}${t.cancelledBy ? ` · ${t.cancelledBy.fullName}` : ""}`,
  },
];

export function fundEntriesSheet(entries: FundTransaction[], name = "Phiếu thu chi"): ExportTable {
  return toSheet(name, entryColumns, entries);
}

type Method = FundSummary["byMethod"][number];
interface SummaryRow {
  label: string;
  total: number;
  // The same figure per payment method; undefined for the lines that are
  // only known in total (sales, VAT, purchases).
  method?: (m: Method) => number;
}

// Opening balance, income, expense and closing balance of the period, in
// total and per payment method. `rangeLabel` goes in the first header.
export function fundSummarySheet(summary: FundSummary, rangeLabel: string, name = "Tổng hợp"): ExportTable {
  const rows: SummaryRow[] = [
    { label: "Tồn đầu kỳ", total: summary.openingBalance, method: (m) => m.openingBalance },
    { label: "Tổng thu", total: summary.income, method: (m) => m.income },
    { label: "   Trong đó bán hàng", total: summary.salesIncome },
    { label: "   Trong đó VAT bán hàng", total: summary.salesVat },
    { label: "Tổng chi", total: summary.expense, method: (m) => m.expense },
    { label: "   Trong đó nhập hàng", total: summary.purchaseExpense },
    { label: "Tồn cuối kỳ", total: summary.closingBalance, method: (m) => m.closingBalance },
  ];
  const columns: ExportColumn<SummaryRow>[] = [
    { header: `Chỉ tiêu (${rangeLabel})`, value: (r) => r.label },
    { header: "Tổng", type: "money", value: (r) => r.total },
    ...summary.byMethod.map(
      (m): ExportColumn<SummaryRow> => ({
        header: PAYMENT_METHOD_LABELS[m.method],
        type: "money",
        value: (r) => r.method?.(m) ?? null,
      }),
    ),
  ];
  return toSheet(name, columns, rows);
}
