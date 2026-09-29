import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, lastValueFrom, Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';
import { ALL_BRANCH_ROLES } from '../auth/roles';

// Identical read requests running at the same time share one computation:
// when the chain manager and the board download "this month, whole chain"
// together, the database computes it once. Only requests still in flight are
// shared (nothing is kept afterwards), so a result is never older than the
// computation it joins. The key holds the caller's branch scope, so a result
// only goes to someone who would get exactly the same one.
@Injectable()
export class SharedRequestInterceptor implements NestInterceptor {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const key = requestKey(request);
    let shared = this.inFlight.get(key);
    if (!shared) {
      shared = lastValueFrom(next.handle()).finally(() =>
        this.inFlight.delete(key),
      );
      this.inFlight.set(key, shared);
    }
    return from(shared);
  }

  get size() {
    return this.inFlight.size;
  }
}

// Path, sorted query and scope: the whole chain for the roles that see every
// branch (they get the same answer for the same ?branch), else the caller's
// own branch (they are always scoped to it).
export function requestKey(request: Request & { user?: AuthUser }): string {
  const user = request.user;
  const scope = !user
    ? 'anonymous'
    : ALL_BRANCH_ROLES.includes(user.role)
      ? 'all'
      : `branch:${user.branchId}`;
  const url = new URL(request.originalUrl, 'http://local');
  url.searchParams.sort();
  return `${request.method} ${url.pathname}?${url.searchParams} ${scope}`;
}
