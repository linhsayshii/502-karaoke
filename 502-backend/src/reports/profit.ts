import {
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  expenseCategoryOf,
} from '../funds/fund-categories';
import { RevenueSums, toMetrics } from './revenue-metrics';

// Profit and loss (lãi lỗ) of a period:
//   revenue (before VAT) − cost of goods sold = gross profit,
//   − operating expenses (manual phiếu chi, by category)
//   − goods exported (hao hụt) + other income (manual phiếu thu) = profit.
// VAT (owed to the state) and the purchases (bought goods become stock, a
// cost only once sold or exported) are shown apart.
export interface ProfitSums {
  roomFee: number;
  roomDiscount: number;
  productSales: number;
  productDiscount: number;
  revenue: number;
  vat: number;
  cogs: number;
  expenses: Record<ExpenseCategory, number>;
  losses: number;
  otherIncome: number;
  purchases: number;
}

export interface ProfitMetrics extends ProfitSums {
  grossProfit: number;
  grossMargin: number | null; // of revenue; null without revenue
  expenseTotal: number;
  profit: number;
  profitMargin: number | null;
}

// One row of one of the profit report's queries, on a business day.
export interface ProfitDay {
  date: string;
  sales?: RevenueSums;
  cogs?: number;
  expense?: { category: string | null; amount: number };
  otherIncome?: number;
  losses?: number;
  purchases?: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

export function emptyProfit(): ProfitSums {
  return {
    roomFee: 0,
    roomDiscount: 0,
    productSales: 0,
    productDiscount: 0,
    revenue: 0,
    vat: 0,
    cogs: 0,
    expenses: Object.fromEntries(
      EXPENSE_CATEGORIES.map((category) => [category, 0]),
    ) as Record<ExpenseCategory, number>,
    losses: 0,
    otherIncome: 0,
    purchases: 0,
  };
}

export function addProfit(acc: ProfitSums, day: ProfitDay): void {
  if (day.sales) {
    const sales = toMetrics(day.sales);
    acc.roomFee += sales.roomFee;
    acc.roomDiscount += sales.roomDiscount;
    acc.productSales += sales.productSales;
    acc.productDiscount += sales.productDiscount;
    acc.revenue += sales.revenue;
    acc.vat += sales.vat;
  }
  if (day.expense) {
    acc.expenses[expenseCategoryOf(day.expense.category)] += Number(
      day.expense.amount,
    );
  }
  acc.cogs += Number(day.cogs ?? 0);
  acc.losses += Number(day.losses ?? 0);
  acc.otherIncome += Number(day.otherIncome ?? 0);
  acc.purchases += Number(day.purchases ?? 0);
}

export function sumProfit(days: ProfitDay[]): ProfitSums {
  const acc = emptyProfit();
  for (const day of days) addProfit(acc, day);
  return acc;
}

export function toProfitMetrics(sums: ProfitSums): ProfitMetrics {
  const expenses = Object.fromEntries(
    Object.entries(sums.expenses).map(([category, value]) => [
      category,
      cents(value),
    ]),
  ) as Record<ExpenseCategory, number>;
  const revenue = cents(sums.revenue);
  const cogs = cents(sums.cogs);
  const losses = cents(sums.losses);
  const otherIncome = cents(sums.otherIncome);
  const grossProfit = cents(revenue - cogs);
  const expenseTotal = cents(
    Object.values(expenses).reduce((sum, value) => sum + value, 0),
  );
  const profit = cents(grossProfit - expenseTotal - losses + otherIncome);
  return {
    roomFee: cents(sums.roomFee),
    roomDiscount: cents(sums.roomDiscount),
    productSales: cents(sums.productSales),
    productDiscount: cents(sums.productDiscount),
    revenue,
    vat: cents(sums.vat),
    cogs,
    expenses,
    losses,
    otherIncome,
    purchases: cents(sums.purchases),
    grossProfit,
    grossMargin: revenue ? grossProfit / revenue : null,
    expenseTotal,
    profit,
    profitMargin: revenue ? profit / revenue : null,
  };
}
