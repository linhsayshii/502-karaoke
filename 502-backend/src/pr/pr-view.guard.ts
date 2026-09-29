import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { canViewPr } from './pr.service';

// Who may read PR/KTV data, checked before any interceptor runs (guards come
// before interceptors), so a shared computation only ever serves callers with
// the same right.
@Injectable()
export class PrViewGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !canViewPr(user)) {
      throw new ForbiddenException('Bạn không có quyền xem PR/KTV');
    }
    return true;
  }
}
