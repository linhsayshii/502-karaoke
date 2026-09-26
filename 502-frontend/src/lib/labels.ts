import type {
  FundType,
  OrderStatus,
  PaymentMethod,
  StockDocType,
  StockMovementType,
} from "@/lib/types";

// Vietnamese labels of the business enums.

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Đang mở",
  COMPLETED: "Đã thanh toán",
  CANCELLED: "Đã hủy",
};

export const DOC_TYPE_LABELS: Record<StockDocType, string> = {
  IMPORT: "Phiếu nhập",
  EXPORT: "Phiếu xuất",
};

export const FUND_TYPE_LABELS: Record<FundType, string> = {
  INCOME: "Thu",
  EXPENSE: "Chi",
};

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  IMPORT: "Nhập kho",
  EXPORT: "Xuất kho",
  SALE: "Bán hàng",
  ADJUSTMENT: "Điều chỉnh",
  REVERSAL: "Hủy chứng từ",
};

// Business day as the backend counts it (06:00 → 06:00 next morning).
export const BUSINESS_DAY_HINT =
  "Ngày kinh doanh tính từ 06:00 đến 06:00 sáng hôm sau (giờ mở cửa 11:30 – 06:00).";
