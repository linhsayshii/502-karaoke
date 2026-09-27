export type Role = "CHAIN_MANAGER" | "BRANCH_MANAGER" | "CASHIER" | "STAFF";
export type StaffPosition = "CSKH" | "SERVER";

export interface BranchRef {
  id: number;
  code: string;
  name: string;
}

export interface Branch extends BranchRef {
  address: string | null;
  active: boolean;
}

// The logged-in account (GET /auth/me).
export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  position: StaffPosition | null;
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
  product: Product;
}

export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface Order {
  id: number;
  branchId: number;
  status: OrderStatus;
  roomId: number | null;
  room: Room | null;
  cskhId: number | null;
  serverId: number | null;
  cskh: StaffRef | null;
  server: StaffRef | null;
  createdBy?: StaffRef | null;
  checkedOutBy?: StaffRef | null;
  cancelledBy?: StaffRef | null;
  startTime: string;
  endTime: string | null;
  updatedAt: string;
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
  serviceFeePercent: number;
  serviceFeeAmount: string | number;
  taxPercent: number;
  taxAmount: string | number;
  finalAmount: string | number;
}

type BillAmounts =
  | "hourlyFee"
  | "totalProductPrice"
  | "discountAmount"
  | "hourlyDiscountAmount"
  | "serviceFeeAmount"
  | "taxAmount"
  | "finalAmount";

// GET /orders/:id/preview: the live bill (or the stored one once closed).
export interface BillPreview extends Omit<Order, BillAmounts> {
  durationMinutes: number;
  hourlyFee: number;
  totalProductPrice: number;
  discountAmount: number;
  hourlyDiscountAmount: number;
  serviceFeeAmount: number;
  totalBeforeTax: number;
  taxAmount: number;
  finalAmount: number;
}

// GET /orders/statistics: one business day.
export interface DailyStat {
  date: string;
  orderCount: number;
  totalRevenue: number;
  hourlyFee: number;
  productRevenue: number;
  discount: number;
  serviceFee: number;
  tax: number;
  cash: number;
  transfer: number;
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
