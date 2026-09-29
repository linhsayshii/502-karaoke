// The discount / VAT fields of a bill, and which changes a manager must
// approve (spec 2026-09-30 §6). Mirrored in 502-frontend/src/lib/discount-rules.ts.

export const ADJUSTMENT_KEYS = [
  'discountPercent',
  'discountAmount',
  'hourlyDiscountPercent',
  'hourlyDiscountAmount',
  'taxPercent',
] as const;
export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];
export type Adjustments = Record<AdjustmentKey, number>;

const DISCOUNT_KEYS: AdjustmentKey[] = [
  'discountPercent',
  'discountAmount',
  'hourlyDiscountPercent',
  'hourlyDiscountAmount',
];

// Field by field, not by total: a percent follows the live bill, so totals
// move with time. Any discount going up or VAT going down lowers what the
// customer pays and needs a manager.
export function needsApproval(before: Adjustments, after: Adjustments) {
  return (
    DISCOUNT_KEYS.some((key) => after[key] > before[key]) ||
    after.taxPercent < before.taxPercent
  );
}

export function changedKeys(before: Adjustments, after: Adjustments) {
  return ADJUSTMENT_KEYS.filter((key) => before[key] !== after[key]);
}

// The adjustment fields that were sent (a DTO also carries other fields).
export function pickAdjustments(
  source: Partial<Record<AdjustmentKey, number | undefined>>,
): Partial<Adjustments> {
  const picked: Partial<Adjustments> = {};
  for (const key of ADJUSTMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
