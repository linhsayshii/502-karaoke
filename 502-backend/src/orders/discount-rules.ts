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

// Each discount is a percent and an amount; billing (billing.ts) uses the
// percent while it is > 0 and ignores the amount.
const DISCOUNT_PAIRS = [
  ['discountPercent', 'discountAmount'],
  ['hourlyDiscountPercent', 'hourlyDiscountAmount'],
] as const;

// Field by field, not by total: a percent follows the live bill, so totals
// move with time. Any discount going up or VAT going down lowers what the
// customer pays and needs a manager. So does a percent falling to 0 over an
// amount: the amount it hid becomes the discount.
export function needsApproval(before: Adjustments, after: Adjustments) {
  return (
    DISCOUNT_KEYS.some((key) => after[key] > before[key]) ||
    DISCOUNT_PAIRS.some(
      ([percent, amount]) =>
        before[percent] > 0 && after[percent] <= 0 && after[amount] > 0,
    ) ||
    after.taxPercent < before.taxPercent
  );
}

// A percent > 0 wins over its amount, so the amount is stored as 0: no
// amount waits unseen behind a percent (and comes back when it is dropped).
export function normalizeAdjustments(after: Adjustments): Adjustments {
  const normal = { ...after };
  for (const [percent, amount] of DISCOUNT_PAIRS) {
    if (normal[percent] > 0) normal[amount] = 0;
  }
  return normal;
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
