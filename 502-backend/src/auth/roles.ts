import { Role } from '@prisma/client';

export const MANAGERS: Role[] = [Role.CHAIN_MANAGER, Role.BRANCH_MANAGER];
// Everyone doing cashier work: open rooms, order, checkout.
export const SALES: Role[] = [...MANAGERS, Role.CASHIER];
export const ALL_ROLES: Role[] = [...SALES, Role.STAFF];
// HĐQT (board): read-only. It sees every page the managers see, in every
// branch, but no route that changes data is open to it (except the purge).
export const READERS: Role[] = [...MANAGERS, Role.BOARD];
export const SALES_READERS: Role[] = [...SALES, Role.BOARD];
// Accounts that look at every branch (no branch of their own).
export const ALL_BRANCH_ROLES: Role[] = [Role.CHAIN_MANAGER, Role.BOARD];
