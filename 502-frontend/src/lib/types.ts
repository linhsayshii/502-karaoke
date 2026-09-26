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

export interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  price: string | number;
  product: Product;
}

export interface Order {
  id: number;
  branchId: number;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  roomId: number | null;
  room: Room | null;
  cskhId: number | null;
  serverId: number | null;
  cskh: StaffRef | null;
  server: StaffRef | null;
  startTime: string;
  endTime: string | null;
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

export interface BillPreview extends Omit<Order, "hourlyFee" | "totalProductPrice" | "taxAmount" | "finalAmount"> {
  durationMinutes: number;
  hourlyFee: number;
  totalProductPrice: number;
  totalBeforeTax: number;
  taxAmount: number;
  finalAmount: number;
}

// GET /users/floor-staff: employees that can be assigned to a room.
export interface FloorStaff extends StaffRef {
  position: StaffPosition;
}

export type StockDocType = "IMPORT" | "EXPORT";
export type StockMovementType = "IMPORT" | "EXPORT" | "SALE" | "ADJUSTMENT";

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
  document: { id: number; code: string } | null;
  createdBy: StaffRef | null;
}

export type FundType = "INCOME" | "EXPENSE";

export interface FundTransaction {
  id: number;
  type: FundType;
  amount: string | number;
  category: string | null;
  description: string | null;
  occurredAt: string;
  createdBy: StaffRef | null;
}

// GET /users: an account as managers see it.
export interface ManagedUser extends User {
  phone: string | null;
  active: boolean;
  hasPassword: boolean;
  createdAt: string;
}
