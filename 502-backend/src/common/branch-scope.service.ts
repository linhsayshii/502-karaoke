import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';

export const FORBIDDEN_BRANCH = 'Bạn không có quyền truy cập cơ sở này';

// Decides which branch a request acts on. The branch always comes from the
// logged-in account; only the chain manager picks one via `?branch=<code>`.
@Injectable()
export class BranchScopeService {
  constructor(private prisma: PrismaService) {}

  async resolveBranchId(user: AuthUser, code?: string): Promise<number> {
    const branchId = await this.resolveOptionalBranchId(user, code);
    if (branchId === undefined) {
      throw new BadRequestException('Vui lòng chọn cơ sở');
    }
    return branchId;
  }

  // Like resolveBranchId, but the chain manager may omit the code to mean
  // "all branches" (returns undefined).
  async resolveOptionalBranchId(
    user: AuthUser,
    code?: string,
  ): Promise<number | undefined> {
    if (user.role !== Role.CHAIN_MANAGER) {
      if (!user.branchId || !user.branch) {
        throw new ForbiddenException('Tài khoản chưa được gán cơ sở');
      }
      if (code && code !== user.branch.code) {
        throw new ForbiddenException(FORBIDDEN_BRANCH);
      }
      return user.branchId;
    }

    if (!code) return undefined;
    const branch = await this.prisma.branch.findUnique({ where: { code } });
    if (!branch) throw new NotFoundException('Không tìm thấy cơ sở');
    return branch.id;
  }

  // For records fetched by id: the record's branch must be the user's branch.
  assertBranchAccess(user: AuthUser, branchId: number) {
    if (user.role === Role.CHAIN_MANAGER) return;
    if (user.branchId !== branchId) {
      throw new ForbiddenException(FORBIDDEN_BRANCH);
    }
  }
}
