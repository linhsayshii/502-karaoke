import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';

// Khoản mục of the manual phiếu thu / phiếu chi: a fixed list, so the profit
// report can split the operating expenses. Entries written by sales and
// imports keep SALES_CATEGORY / PURCHASE_CATEGORY (fund-ledger.ts).
export const EXPENSE_CATEGORIES = [
  'Lương',
  'Mặt bằng',
  'Điện nước',
  'Sửa chữa – bảo trì',
  'Marketing',
  'Vật tư tiêu hao',
  'Thuế – phí',
  'Khác',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const INCOME_CATEGORIES = ['Thu khác'] as const;

export const MANUAL_CATEGORIES: readonly string[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
];

export const OTHER_EXPENSE: ExpenseCategory = 'Khác';
export const OTHER_INCOME = 'Thu khác';

const CATEGORIES_OF: Record<TransactionType, readonly string[]> = {
  EXPENSE: EXPENSE_CATEGORIES,
  INCOME: INCOME_CATEGORIES,
};

// The category of a new manual entry: one of its type's, or the type's
// default when left out.
export function manualCategory(
  type: TransactionType,
  category?: string,
): string {
  if (!category) {
    return type === TransactionType.EXPENSE ? OTHER_EXPENSE : OTHER_INCOME;
  }
  if (!CATEGORIES_OF[type].includes(category)) {
    throw new BadRequestException(
      `Khoản mục "${category}" không dùng cho phiếu ${
        type === TransactionType.EXPENSE ? 'chi' : 'thu'
      }`,
    );
  }
  return category;
}

// The profit report line a phiếu chi counts in: entries from before the
// fixed list (free text, or none) count as "Khác".
export function expenseCategoryOf(category: string | null): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')
    ? (category as ExpenseCategory)
    : OTHER_EXPENSE;
}
