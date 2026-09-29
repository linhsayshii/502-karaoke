import type { Adjustments, Order } from "@/lib/types";

// Mirror of 502-backend/src/orders/discount-rules.ts — keep them in sync.
export const ADJUSTMENT_KEYS = [
  "discountPercent",
  "discountAmount",
  "hourlyDiscountPercent",
  "hourlyDiscountAmount",
  "taxPercent",
] as const satisfies readonly (keyof Adjustments)[];

const DISCOUNT_KEYS = ADJUSTMENT_KEYS.filter((k) => k !== "taxPercent");

// Each discount is a percent and an amount; billing uses the percent while it
// is > 0 and ignores the amount.
const DISCOUNT_PAIRS = [
  ["discountPercent", "discountAmount"],
  ["hourlyDiscountPercent", "hourlyDiscountAmount"],
] as const;

// Any discount going up or VAT going down needs a manager, and so does a
// percent falling to 0 over an amount (the amount it hid becomes the discount).
export const needsApproval = (before: Adjustments, after: Adjustments) =>
  DISCOUNT_KEYS.some((k) => after[k] > before[k]) ||
  DISCOUNT_PAIRS.some(([p, a]) => before[p] > 0 && after[p] <= 0 && after[a] > 0) ||
  after.taxPercent < before.taxPercent;

export const changedKeys = (before: Adjustments, after: Adjustments) =>
  ADJUSTMENT_KEYS.filter((k) => before[k] !== after[k]);

export const adjustmentsOf = (order: Order): Adjustments => ({
  discountPercent: order.discountPercent,
  discountAmount: Number(order.discountAmount),
  hourlyDiscountPercent: order.hourlyDiscountPercent,
  hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
  taxPercent: order.taxPercent,
});

export const ADJUSTMENT_LABELS: Record<(typeof ADJUSTMENT_KEYS)[number], string> = {
  discountPercent: "Giảm giá món (%)",
  discountAmount: "Giảm giá món (đ)",
  hourlyDiscountPercent: "Giảm giá giờ (%)",
  hourlyDiscountAmount: "Giảm giá giờ (đ)",
  taxPercent: "VAT (%)",
};
