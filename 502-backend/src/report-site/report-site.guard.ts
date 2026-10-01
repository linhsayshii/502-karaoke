import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { canUseReportSite } from '../auth/roles';

// Who may use the report site (spec 2026-10-02-trang-bao-cao-hddt §3, §8),
// checked before any interceptor runs (guards come before interceptors), so
// a computation shared by SharedRequestInterceptor only ever serves callers
// let in.
@Injectable()
export class ReportSiteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !canUseReportSite(user)) {
      throw new ForbiddenException('Bạn không có quyền vào trang báo cáo');
    }
    return true;
  }
}
