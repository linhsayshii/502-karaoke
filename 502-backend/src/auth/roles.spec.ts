import { Role } from '@prisma/client';
import { canUseReportSite } from './roles';

describe('canUseReportSite', () => {
  it('lets the chain manager in without the right', () => {
    expect(
      canUseReportSite({ role: Role.CHAIN_MANAGER, reportAccess: false }),
    ).toBe(true);
  });

  it('lets a branch manager or HĐQT in only with the right', () => {
    for (const role of [Role.BRANCH_MANAGER, Role.BOARD]) {
      expect(canUseReportSite({ role, reportAccess: true })).toBe(true);
      expect(canUseReportSite({ role, reportAccess: false })).toBe(false);
    }
  });

  it('never lets the cashier or the floor staff in', () => {
    for (const role of [Role.CASHIER, Role.STAFF]) {
      expect(canUseReportSite({ role, reportAccess: true })).toBe(false);
    }
  });
});
