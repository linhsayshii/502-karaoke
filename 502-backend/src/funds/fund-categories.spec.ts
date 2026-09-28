import { BadRequestException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import {
  EXPENSE_CATEGORIES,
  expenseCategoryOf,
  manualCategory,
} from './fund-categories';

describe('fund categories', () => {
  it('lists the fixed expense categories, "Khác" last', () => {
    expect(EXPENSE_CATEGORIES).toEqual([
      'Lương',
      'Mặt bằng',
      'Điện nước',
      'Sửa chữa – bảo trì',
      'Marketing',
      'Vật tư tiêu hao',
      'Thuế – phí',
      'Khác',
    ]);
  });

  it('defaults a manual entry to "Khác" / "Thu khác"', () => {
    expect(manualCategory(TransactionType.EXPENSE)).toBe('Khác');
    expect(manualCategory(TransactionType.INCOME, '')).toBe('Thu khác');
  });

  it('only takes the categories of the entry type', () => {
    expect(manualCategory(TransactionType.EXPENSE, 'Điện nước')).toBe(
      'Điện nước',
    );
    expect(() => manualCategory(TransactionType.INCOME, 'Lương')).toThrow(
      BadRequestException,
    );
    expect(() => manualCategory(TransactionType.EXPENSE, 'Thu khác')).toThrow(
      BadRequestException,
    );
  });

  it('counts entries from before the fixed list as "Khác"', () => {
    expect(expenseCategoryOf('Marketing')).toBe('Marketing');
    expect(expenseCategoryOf('Chi linh tinh')).toBe('Khác');
    expect(expenseCategoryOf(null)).toBe('Khác');
  });
});
