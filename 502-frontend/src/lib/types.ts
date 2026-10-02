export type Role = "CHAIN_MANAGER" | "BRANCH_MANAGER" | "CASHIER" | "STAFF" | "BOARD";
export type StaffPosition = "CSKH" | "SERVER";

export interface BranchRef {
  id: number;
  code: string;
  name: string;
}

export interface Branch extends BranchRef {
  address: string | null;
  taxCode: string | null;
  active: boolean;
}

// The logged-in account (GET /auth/me).
export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  position: StaffPosition | null;
  // Quản lý PR/KTV: edits the PR/KTV list and takes their roll call.
  managesPr: boolean;
  // Vào trang báo cáo: a branch manager or HĐQT may use the report site (the
  // chain manager always can); see canUseReportSite in lib/permissions.ts.
  reportAccess: boolean;
  branchId: number | null;
  branch: BranchRef | null;
}

export interface StaffRef {
  id: number;
  fullName: string;
}

export interface Category {
  id: number;
  name: string;
  branchId: number;
  products?: Product[];
}

export interface Product {
  id: number;
  branchId: number;
  name: string;
  categoryId: number | null;
  category?: Category | null;
  price: string | number;
  costPrice: string | number;
  stockQuantity: number;
  unit: string;
  trackStock: boolean;
  active: boolean;
  // Ordered in open sessions, deducted from stock at checkout.
  pendingQuantity?: number;
  // GET /inventory/stock: stockQuantity - pendingQuantity.
  availableQuantity?: number;
}

export type RoomStatus = "AVAILABLE" | "ACTIVE" | "MAINTENANCE";

export interface Room {
  id: number;
  branchId: number;
  name: string;
  type: string;
  pricePerHour: string | number;
  status: RoomStatus;
  activeOrderId?: number;
  startTime?: string;
  activeOrder?: {
    id: number;
    startTime: string;
    timeLockedAt: string | null;
    cskh: StaffRef | null;
    server: StaffRef | null;
  } | null;
}

export type PaymentMethod = "CASH" | "TRANSFER";

// A fund entry linked to a bill or a stock document.
export interface LinkedFundEntry {
  id: number;
  method: PaymentMethod;
  amount: string | number;
  cancelledAt: string | null;
}

export interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  price: string | number;
  product: Pick<Product, "id" | "name" | "unit">;
}

export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";

// GET /inventory/documents/summary: amounts (at cost) of every standing
// document of the period, whatever the list shows.
export interface StockDocumentsSummary {
  importTotal: number;
  exportTotal: number;
}

// GET /orders/summary: totals of every bill of the filters (the list itself
// holds at most the newest 1000).
export interface OrderSummary {
  billCount: number;
  paidCount: number;
  cancelledCount: number;
  collected: number; // paid, VAT included
  vat: number;
}

export interface Order {
  id: number;
  branchId: number;
  status: OrderStatus;
  roomId: number | null;
  room: Pick<Room, "id" | "name" | "type"> | null;
  cskhId: number | null;
  serverId: number | null;
  cskh: StaffRef | null;
  server: StaffRef | null;
  createdBy?: StaffRef | null;
  checkedOutBy?: StaffRef | null;
  cancelledBy?: StaffRef | null;
  // Last correction of a paid bill by a manager.
  editedBy?: StaffRef | null;
  editedAt?: string | null;
  editReason?: string | null;
  // Chốt giờ: the room fee stops here; checkout takes it as endTime.
  timeLockedAt: string | null;
  timeLockedBy?: StaffRef | null;
  // Only on a single order: the discount request waiting for a manager (0 or 1).
  discountRequests?: PendingDiscount[];
  startTime: string;
  endTime: string | null;
  updatedAt: string;
  // Only on a single order (GET/PATCH /orders/:id), not in bill lists.
  prSessions?: PrSession[];
  // Hourly price fixed when the session opened.
  pricePerHour: string | number;
  paymentMethod: PaymentMethod | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  // Số hóa đơn, given when the bill is closed (paid or cancelled).
  billNumber: string | null;
  fundTransaction?: LinkedFundEntry | null;
  items: OrderItem[];
  totalProductPrice: string | number;
  hourlyFee: string | number;
  discountPercent: number;
  discountAmount: string | number;
  hourlyDiscountPercent: number;
  hourlyDiscountAmount: string | number;
  taxPercent: number;
  taxAmount: string | number;
  finalAmount: string | number;
  // GET /orders/:id only: e-invoices of the bill and how many are issued, for
  // the edit / void dialogs.
  _count?: { einvoices: number; issuedEinvoices: number };
}

type BillAmounts =
  | "hourlyFee"
  | "totalProductPrice"
  | "discountAmount"
  | "hourlyDiscountAmount"
  | "taxAmount"
  | "finalAmount";

// GET /orders/:id/preview: the live bill (or the stored one once closed).
export interface BillPreview extends Omit<Order, BillAmounts> {
  durationMinutes: number;
  hourlyFee: number;
  totalProductPrice: number;
  discountAmount: number;
  hourlyDiscountAmount: number;
  totalBeforeTax: number;
  taxAmount: number;
  finalAmount: number;
}

// Reports (GET /reports/*): revenue is before VAT, VAT apart,
// collected = revenue + VAT = what was paid.
export type GroupBy = "day" | "week" | "month" | "quarter" | "year";

export interface RevenueMetrics {
  orderCount: number;
  roomMinutes: number;
  roomFee: number;
  productSales: number;
  roomDiscount: number;
  productDiscount: number;
  vat: number;
  collected: number;
  cash: number;
  transfer: number;
  revenue: number;
  avgRevenue: number;
}

export interface ReportBucket {
  key: string;
  label: string;
  from: string;
  to: string;
}

// GET /reports/revenue
export interface RevenueReport {
  branchId: number | null; // null: whole chain
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: { from: string; to: string; totals: RevenueMetrics } | null;
  buckets: (ReportBucket & RevenueMetrics)[];
  byBranch: ({ branchId: number; code: string; name: string } & RevenueMetrics)[] | null;
  voided: { count: number; amount: number };
}

export type StaffRole = "cskh" | "server" | "cashier";
export type RoomGroup = "room" | "type";
export type ProductGroup = "product" | "category";
export type HourMetric = "sessions" | "revenue";

// GET /reports/staff; id null: "Chưa gán".
export interface StaffReportRow extends RevenueMetrics {
  id: number | null;
  name: string | null;
  username: string | null;
  branchCode: string | null;
}

export interface StaffReport {
  branchId: number | null;
  range: { from: string; to: string };
  role: StaffRole;
  totals: RevenueMetrics;
  rows: StaffReportRow[];
}

// GET /reports/rooms; id: room id, or the room type (by=type); null: "Không phòng".
export interface RoomReportRow extends RevenueMetrics {
  id: number | string | null;
  name: string | null;
  type: string | null;
  branchCode: string | null;
  rooms: number;
  occupancy: number | null;
}

export interface RoomReport {
  branchId: number | null;
  range: { from: string; to: string };
  by: RoomGroup;
  days: number;
  totals: RevenueMetrics;
  occupancy: number | null;
  rows: RoomReportRow[];
}

// GET /reports/products: gross = Σ quantity × price, discount = its share of
// the bills' product discount, net = gross − discount (before VAT).
export interface ProductSales {
  quantity: number;
  gross: number;
  discount: number;
  net: number;
  cost: number; // giá vốn: Σ quantity × unit cost at checkout (may carry cents)
  grossProfit: number; // net − cost
  margin: number | null; // tỉ suất LN = grossProfit / net; null when net is 0
}

export interface ProductReportRow extends ProductSales {
  id: number | null; // product id, or category id (by=category; null: "Không danh mục")
  name: string | null;
  unit: string | null;
  categoryName: string | null;
  branchCode: string | null;
}

export interface ProductReport {
  branchId: number | null;
  range: { from: string; to: string };
  by: ProductGroup;
  totals: ProductSales;
  rows: ProductReportRow[];
}

// GET /reports/profit: revenue before VAT − cost of goods sold = gross
// profit; − expenses (by category) − losses + other income = profit. VAT
// and purchases are shown apart.
export interface ProfitMetrics {
  roomFee: number;
  roomDiscount: number;
  productSales: number;
  productDiscount: number;
  revenue: number;
  vat: number;
  cogs: number;
  expenses: Record<string, number>; // by expense category
  losses: number;
  otherIncome: number;
  purchases: number;
  grossProfit: number;
  grossMargin: number | null;
  expenseTotal: number;
  profit: number;
  profitMargin: number | null;
}

export interface ProfitReport {
  branchId: number | null;
  range: { from: string; to: string };
  groupBy: GroupBy;
  categories: string[];
  totals: ProfitMetrics;
  buckets: (ReportBucket & ProfitMetrics)[];
}

// GET /reports/inventory (nhập – xuất – tồn). imports, sales and exports
// are positive; others (reversals, adjustments) signed. stockIn / stockOut
// are the net nhập / xuất of the stock ledger (opening + stockIn − stockOut
// = closing): cancelled imports come off stockIn, goods put back by voided
// bills and cancelled exports off stockOut.
export interface StockFlow {
  quantity: number;
  value: number;
}

export interface InventoryFlows {
  opening: StockFlow;
  imports: StockFlow;
  sales: StockFlow;
  exports: StockFlow;
  others: StockFlow;
  stockIn: StockFlow;
  stockOut: StockFlow;
  closing: StockFlow;
}

export interface InventoryReportRow extends InventoryFlows {
  productId: number;
  name: string;
  unit: string;
  // Đơn giá bình quân at the end of the range (values the closing balance).
  averageCost: number;
  categoryId: number | null;
  categoryName: string | null;
  branchCode: string;
}

export interface InventoryReport {
  branchId: number | null;
  range: { from: string; to: string };
  totals: InventoryFlows;
  rows: InventoryReportRow[];
}

// GET /reports/hours: weekday 1 = Monday … 7 = Sunday (of the business day).
export interface HourCell {
  weekday: number;
  hour: number;
  sessions: number;
  revenue: number;
}

export interface HoursReport {
  branchId: number | null;
  range: { from: string; to: string };
  totals: { sessions: number; revenue: number };
  cells: HourCell[];
}

// GET /reports/branches (chain manager only).
export interface BranchReportRow extends RevenueMetrics {
  branchId: number;
  code: string;
  name: string;
  share: number | null;
  previous: RevenueMetrics | null;
  series: number[]; // revenue per bucket
}

export interface BranchesReport {
  range: { from: string; to: string };
  groupBy: GroupBy;
  totals: RevenueMetrics;
  previous: { from: string; to: string; totals: RevenueMetrics } | null;
  buckets: ReportBucket[];
  branches: BranchReportRow[];
}

// GET /users/floor-staff: employees that can be assigned to a room.
export interface FloorStaff extends StaffRef {
  position: StaffPosition;
}

export type StockDocType = "IMPORT" | "EXPORT";
export type StockMovementType = "IMPORT" | "EXPORT" | "SALE" | "ADJUSTMENT" | "REVERSAL";

export interface StockDocumentLine {
  id: number;
  productId: number;
  quantity: number;
  unitCost: string | number;
  product: { id: number; name: string; unit: string };
}

export interface StockDocument {
  id: number;
  branchId: number;
  type: StockDocType;
  code: string;
  supplier: string | null;
  note: string | null;
  totalAmount: string | number;
  createdAt: string;
  createdBy: StaffRef;
  cancelledAt: string | null;
  cancelledBy: StaffRef | null;
  cancelReason: string | null;
  fundTransaction: LinkedFundEntry | null;
  lines?: StockDocumentLine[];
  _count?: { lines: number };
}

export interface StockMovement {
  id: number;
  productId: number;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  orderId: number | null;
  createdAt: string;
  product: { id: number; name: string; unit: string };
  document: { id: number; code: string; type: StockDocType } | null;
  // The bill of a sale or its reversal.
  order: { id: number; billNumber: string | null } | null;
  createdBy: StaffRef | null;
}

export type FundType = "INCOME" | "EXPENSE";

export interface FundTransaction {
  id: number;
  type: FundType;
  method: PaymentMethod;
  amount: string | number;
  category: string | null;
  description: string | null;
  occurredAt: string;
  createdBy: StaffRef | null;
  // Written by checkout / an import paid from the fund.
  order: { id: number; billNumber: string | null; status: OrderStatus; room: { name: string } | null } | null;
  stockDocument: { id: number; code: string; type: StockDocType } | null;
  cancelledAt: string | null;
  cancelledBy: StaffRef | null;
  cancelReason: string | null;
}

// GET /funds/summary (cancelled entries excluded).
export interface FundSummary {
  openingBalance: number;
  income: number;
  expense: number;
  net: number;
  closingBalance: number;
  salesIncome: number;
  salesVat: number; // VAT inside salesIncome
  purchaseExpense: number;
  byMethod: {
    method: PaymentMethod;
    openingBalance: number;
    income: number;
    expense: number;
    closingBalance: number;
  }[];
}

// GET /users: an account as managers see it.
// GET /pr/staff: PR/KTV of a branch (not accounts).
export interface PrStaff {
  id: number;
  branchId: number;
  code: string | null;
  name: string;
  phone: string | null;
  note: string | null;
  active: boolean;
}

// GET /pr/attendance: one roll call entry of a business day.
export interface PrAttendance {
  id: number;
  prStaffId: number;
  businessDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  note: string | null;
  prStaff: Pick<PrStaff, "id" | "code" | "name">;
  createdBy: StaffRef | null;
}

// A PR/KTV visit to a room (not billed): Order.prSessions.
export interface PrSession {
  id: number;
  orderId: number;
  prStaffId: number;
  startAt: string;
  endAt: string | null; // null: still in the room
  prStaff: Pick<PrStaff, "id" | "code" | "name">;
}

// GET /pr/available: who can be put into a room, and where they are now.
export interface AvailablePr {
  id: number;
  code: string | null;
  name: string;
  checkedIn: boolean;
  currentRoom: { orderId: number; roomName: string | null } | null;
}

// GET /pr/stats: hours in rooms per PR/KTV over a range of business days.
export interface PrStatsRow {
  prStaffId: number;
  minutes: number;
  sessions: number;
  rooms: number;
}

export interface PrStats {
  range: { from: string; to: string };
  totals: Omit<PrStatsRow, "prStaffId">;
  rows: PrStatsRow[];
}

export interface ManagedUser extends User {
  phone: string | null;
  active: boolean;
  hasPassword: boolean;
  createdAt: string;
}

// Excel import (POST /imports/*): what each row does or did.
export type ImportAction = "CREATE" | "UPDATE" | "SKIP" | "ERROR";

export interface ImportRowResult {
  row: number;
  name: string;
  action: ImportAction;
  message?: string;
}

export interface ImportResult {
  rows: ImportRowResult[];
  summary: { create: number; update: number; skip: number; error: number };
  totalAmount?: number; // phiếu nhập kho
  document?: { id: number; code: string; totalAmount: string };
}

// Nhật ký xóa dữ liệu (GET /admin/purge/logs), newest first.
export interface DataPurgeLog {
  id: number;
  createdAt: string;
  userId: number;
  username: string;
  fullName: string;
  scope: "BRANCH" | "ALL";
  branchCode: string | null;
  branchName: string | null;
  // false: refused for a wrong password, nothing was deleted.
  success: boolean;
  deleted: Record<string, number> | null;
  userAgent: string | null;
}

export type Adjustments = Pick<
  Order,
  "discountPercent" | "hourlyDiscountPercent" | "taxPercent"
> & { discountAmount: number; hourlyDiscountAmount: number };

export type DiscountRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
export type DiscountSource = "REQUEST" | "DIRECT" | "PAID_EDIT";

export interface PendingDiscount {
  id: number;
  after: Adjustments;
  note: string | null;
  amountBefore: string | number;
  amountAfter: string | number;
  createdAt: string;
  requestedBy: StaffRef | null;
}

// GET /discount-requests (queue, log, one request).
export interface DiscountRequestRow extends Omit<PendingDiscount, "after"> {
  branchId: number;
  orderId: number;
  status: DiscountRequestStatus;
  source: DiscountSource;
  before: Adjustments;
  after: Adjustments;
  decidedAt: string | null;
  decisionNote: string | null;
  decidedBy: StaffRef | null;
  branch: { id: number; code: string; name: string };
  order: { id: number; billNumber: string | null; status: OrderStatus; room: { id: number; name: string } | null };
}

// Hóa đơn điện tử (spec 2026-10-01).
export type EinvoiceStatus = "DRAFT" | "SENDING" | "UNCERTAIN" | "ISSUED";
export type VatRate = 0 | 5 | 8 | 10;

export interface EinvoiceLine {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number; // whole đồng, before VAT
  vatRate: VatRate;
  vatAmount?: number; // filler line only
}

export interface EinvoiceDraft {
  buyerAddress: string | null;
  buyerEmail: string | null;
  lines: EinvoiceLine[];
}

// An e-invoice as the lists and the panel show it.
export interface EinvoiceRow {
  id: number;
  branchId: number;
  // Its bill: a paid bill, or a bill thêm tay of the report site (exactly one).
  orderId: number | null;
  manualBillId: number | null;
  status: EinvoiceStatus;
  amount: string;
  vatAmount: string;
  buyerTaxCode: string | null;
  buyerName: string | null;
  symbolCode: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  invoiceNumber: number | null;
  lastError: string | null;
  createdAt: string;
  issuedAt: string | null;
  createdBy: StaffRef | null;
  issuedBy: StaffRef | null;
  order: {
    id: number;
    billNumber: string | null;
    finalAmount: string;
    endTime: string | null;
    cancelledAt: string | null;
    editedAt: string | null;
    room: { name: string } | null;
  } | null;
}

// One invoice with its draft; once issued only its lines are kept (none for the ones issued before 02/10/2026).
export interface EinvoiceDetail extends EinvoiceRow {
  draft: EinvoiceDraft | null;
  sellerTaxCode: string | null;
  minvoiceId: string | null;
  // When the last send started (null once settled).
  sendingAt: string | null;
  updatedAt: string;
  updatedBy: StaffRef | null;
  numberEditedAt: string | null;
  numberEditedBy: StaffRef | null;
}

// GET /einvoices/bills: the bills of the left column.
export interface EinvoiceBill {
  orderId: number;
  billNumber: string | null;
  roomName: string | null;
  endTime: string | null;
  cancelledAt: string | null;
  finalAmount: string;
  allocated: number;
  einvoiceCount: number;
}

// GET /einvoices/bill/:orderId.
export interface EinvoiceBillDetail {
  order: {
    id: number;
    branchId: number;
    status: OrderStatus;
    billNumber: string | null;
    startTime: string | null;
    endTime: string | null;
    finalAmount: string;
    taxAmount: string;
    taxPercent: number;
    pricePerHour: string;
    hourlyFee: string;
    discountAmount: string;
    hourlyDiscountAmount: string;
    cancelledAt: string | null;
    editedAt: string | null;
    billedHours: number;
    room: { name: string } | null;
    items: { name: string; unit: string; quantity: number; price: string }[];
  };
  einvoices: EinvoiceDetail[];
  allocated: number;
}

export interface EinvoiceSummary {
  draftCount: number;
  errorCount: number;
  uncertainCount: number;
  issuedCount: number;
  issuedAmount: number;
  issuedVat: number;
}

// GET /einvoice/config: never the password, cookie or token.
export interface EinvoiceConfigView {
  branchTaxCode: string | null;
  username: string | null;
  symbolCode: string | null;
  registerInvoiceId: string | null;
  sellerName: string | null;
  loginError: string | null;
  minInvoiceDate: string | null;
  latestInvoiceNumber: number | null;
  needsLogin: boolean;
  configured: boolean;
}

export interface InvoiceSymbol {
  registerInvoiceId: string;
  symbolCode: string;
  invoiceTypeName: string | null;
  invoiceYear: number | null;
  creationTime: string | null;
}

export interface TaxPayer {
  taxCode: string;
  name: string;
  address: string;
  status: string;
  active: boolean;
  source: "gdt" | "xinvoice";
}

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
