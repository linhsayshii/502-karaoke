import { Role } from '@prisma/client';

export const MANAGERS: Role[] = [Role.CHAIN_MANAGER, Role.BRANCH_MANAGER];
// Everyone doing cashier work: open rooms, order, checkout.
export const SALES: Role[] = [...MANAGERS, Role.CASHIER];
export const ALL_ROLES: Role[] = [...SALES, Role.STAFF];
