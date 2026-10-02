import { Role } from '@prisma/client';

export const MANAGERS: Role[] = [Role.CHAIN_MANAGER, Role.BRANCH_MANAGER];
// Everyone doing cashier work: open rooms, order, checkout.
export const SALES: Role[] = [...MANAGERS, Role.CASHIER];
export const ALL_ROLES: Role[] = [...SALES, Role.STAFF];
// HĐQT (board): read-only. It sees every page the managers see, in every
// branch, but no route that changes data is open to it (except the purge).
export const READERS: Role[] = [...MANAGERS, Role.BOARD];
export const SALES_READERS: Role[] = [...SALES, Role.BOARD];
// Every account; for routes whose right also depends on something besides the
// role (the PR/KTV pages: User.managesPr), checked by the service.
export const EVERY_ROLE: Role[] = [...ALL_ROLES, Role.BOARD];
// Accounts that look at every branch (no branch of their own).
export const ALL_BRANCH_ROLES: Role[] = [Role.CHAIN_MANAGER, Role.BOARD];
// Corrects or voids a paid bill (spec 2026-09-30): neither the branch manager
// nor the cashier may touch a bill once it is paid.
export const CHAIN_ONLY: Role[] = [Role.CHAIN_MANAGER];

// Hóa đơn điện tử (spec 2026-10-01 §3): drafts by the sales roles, read by
// them and HĐQT; issuing, numbers and the Minvoice account are CHAIN_ONLY.
export const EINVOICE_WRITERS: Role[] = SALES;
export const EINVOICE_READERS: Role[] = SALES_READERS;

// Trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1): the chain manager
// always; a branch manager or HĐQT whose account has "Vào trang báo cáo";
// never the cashier or the floor staff. The account is reloaded on every
// request, so a change applies at once. Copied in the frontend's
// lib/permissions.ts.
export const REPORT_ACCESS_ROLES: Role[] = [Role.BRANCH_MANAGER, Role.BOARD];

export function canUseReportSite(user: {
  role: Role;
  reportAccess: boolean;
}): boolean {
  return (
    user.role === Role.CHAIN_MANAGER ||
    (user.reportAccess && REPORT_ACCESS_ROLES.includes(user.role))
  );
}
