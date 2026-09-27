import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDatesBetween, MAX_REPORT_RANGE_DAYS } from '../common/dates';
import { ReportRangeQuery } from './dto/report-query';

// The branch a report covers (undefined: the whole chain, for the chain
// manager without ?branch), after checking the dates and the range length.
export async function reportScope(
  branchScope: BranchScopeService,
  user: AuthUser,
  query: ReportRangeQuery,
): Promise<number | undefined> {
  const branchId = await branchScope.resolveOptionalBranchId(
    user,
    query.branch,
  );
  businessDatesBetween(query.from, query.to, MAX_REPORT_RANGE_DAYS);
  return branchId;
}
