import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, authUserSelect } from '../auth/auth-user';
import { REPORT_ACCESS_ROLES } from '../auth/roles';
import {
  BranchScopeService,
  FORBIDDEN_BRANCH,
} from '../common/branch-scope.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQuery } from './dto/list-users.query';

// Roles a branch manager may hand out (and manage) inside their own branch.
export const BRANCH_MANAGEABLE_ROLES: Role[] = [Role.CASHIER, Role.STAFF];

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  phone: true,
  role: true,
  position: true,
  managesPr: true,
  reportAccess: true,
  branchId: true,
  active: true,
  password: true,
  createdAt: true,
  branch: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

// Never expose the hash; tell the UI whether the account can log in yet.
function toPublic({ password, ...user }: SelectedUser) {
  return { ...user, hasPassword: !!password };
}

// Vào trang báo cáo (spec 2026-10-02-trang-bao-cao-hddt §3.1): only the chain
// manager grants it, only to a branch manager or HĐQT, and an account moved
// to another role loses it in the same write.
function reportAccessFor(
  actor: AuthUser,
  role: Role,
  wanted: boolean | undefined,
  current: boolean,
): boolean {
  if (wanted !== undefined && actor.role !== Role.CHAIN_MANAGER) {
    throw new ForbiddenException(
      'Chỉ quản lý hệ thống được cấp quyền vào trang báo cáo',
    );
  }
  if (wanted && !REPORT_ACCESS_ROLES.includes(role)) {
    throw new BadRequestException(
      'Chỉ tài khoản quản lý cơ sở hoặc HĐQT được vào trang báo cáo',
    );
  }
  return (wanted ?? current) && REPORT_ACCESS_ROLES.includes(role);
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // ---- used by auth ----------------------------------------------------

  findOne(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // The request's AuthUser, or null when the account is missing/locked.
  findAuthUser(id: number): Promise<AuthUser | null> {
    return this.prisma.user.findFirst({
      where: { id, active: true },
      select: authUserSelect,
    });
  }

  updatePassword(id: number, password: string) {
    return this.prisma.user.update({ where: { id }, data: { password } });
  }

  // ---- account management ------------------------------------------------

  async list(actor: AuthUser, query: ListUsersQuery) {
    const branchId = await this.branchScope.resolveOptionalBranchId(
      actor,
      query.branch,
    );
    const users = await this.prisma.user.findMany({
      where: {
        branchId,
        role: query.role,
        active: query.includeInactive ? undefined : true,
      },
      select: userSelect,
      orderBy: [{ branchId: 'asc' }, { role: 'asc' }, { fullName: 'asc' }],
    });
    return users.map(toPublic);
  }

  // Active employees with a floor position, to pick CSKH / phục vụ for a room.
  async floorStaff(actor: AuthUser, branchCode?: string) {
    const branchId = await this.branchScope.resolveBranchId(actor, branchCode);
    return this.prisma.user.findMany({
      where: { branchId, active: true, position: { not: null } },
      select: { id: true, fullName: true, position: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const assignment = await this.checkAssignment(
      actor,
      dto.role,
      dto.branchId ?? null,
    );
    const existing = await this.findOne(dto.username);
    if (existing) throw new ConflictException('Tên đăng nhập đã tồn tại');
    const reportAccess = reportAccessFor(
      actor,
      assignment.role,
      dto.reportAccess,
      false,
    );

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        password: dto.password ? await bcrypt.hash(dto.password, 10) : null,
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        position: dto.position ?? null,
        managesPr: dto.managesPr ?? false,
        reportAccess,
        ...assignment,
      },
      select: userSelect,
    });
    if (reportAccess) {
      this.logger.log(`User ${user.id}: report access on by user ${actor.id}`);
    }
    return toPublic(user);
  }

  async update(actor: AuthUser, id: number, dto: UpdateUserDto) {
    const target = await this.getManageable(actor, id);

    const isSelf = target.id === actor.id;
    const changesAccess =
      (dto.role !== undefined && dto.role !== target.role) ||
      (dto.branchId !== undefined && dto.branchId !== target.branchId) ||
      dto.active === false;
    if (isSelf && changesAccess) {
      throw new ForbiddenException(
        'Không thể tự đổi vai trò, cơ sở hoặc khóa tài khoản của chính mình',
      );
    }

    const assignment = await this.checkAssignment(
      actor,
      dto.role ?? target.role,
      dto.branchId !== undefined ? dto.branchId : target.branchId,
    );
    const reportAccess = reportAccessFor(
      actor,
      assignment.role,
      dto.reportAccess,
      target.reportAccess,
    );

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone,
        position: dto.position,
        managesPr: dto.managesPr,
        reportAccess,
        active: dto.active,
        ...assignment,
      },
      select: userSelect,
    });
    if (reportAccess !== target.reportAccess) {
      this.logger.log(
        `User ${id}: report access ${reportAccess ? 'on' : 'off'} by user ${actor.id}`,
      );
    }
    return toPublic(user);
  }

  async resetPassword(actor: AuthUser, id: number, password: string) {
    await this.getManageable(actor, id);
    await this.updatePassword(id, await bcrypt.hash(password, 10));
    return { message: 'Đã đặt lại mật khẩu' };
  }

  async deactivate(actor: AuthUser, id: number) {
    if (id === actor.id) {
      throw new ForbiddenException('Không thể khóa tài khoản của chính mình');
    }
    await this.getManageable(actor, id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: userSelect,
    });
    return toPublic(user);
  }

  // ---- rules ---------------------------------------------------------------

  // Chain manager manages everyone; a branch manager only cashiers and staff
  // of their own branch.
  private async getManageable(actor: AuthUser, id: number): Promise<User> {
    const target = await this.findById(id);
    if (!target) throw new NotFoundException('Không tìm thấy tài khoản');
    if (actor.role === Role.CHAIN_MANAGER) return target;
    if (
      actor.role === Role.BRANCH_MANAGER &&
      target.branchId === actor.branchId &&
      BRANCH_MANAGEABLE_ROLES.includes(target.role)
    ) {
      return target;
    }
    throw new ForbiddenException('Bạn không có quyền quản lý tài khoản này');
  }

  // Validates the role/branch an actor wants to give an account and returns
  // the normalized pair (chain manager: no branch; everyone else: one branch).
  // Also used by the Excel import of accounts.
  async checkAssignment(
    actor: AuthUser,
    role: Role,
    branchId: number | null,
  ): Promise<{ role: Role; branchId: number | null }> {
    if (actor.role === Role.BRANCH_MANAGER) {
      if (!BRANCH_MANAGEABLE_ROLES.includes(role)) {
        throw new ForbiddenException(
          'Quản lý cơ sở chỉ được quản lý tài khoản thu ngân và nhân viên',
        );
      }
      if (branchId !== null && branchId !== actor.branchId) {
        throw new ForbiddenException(FORBIDDEN_BRANCH);
      }
      return { role, branchId: actor.branchId };
    }
    if (actor.role !== Role.CHAIN_MANAGER) {
      throw new ForbiddenException('Bạn không có quyền quản lý tài khoản');
    }

    if (role === Role.CHAIN_MANAGER || role === Role.BOARD) {
      return { role, branchId: null };
    }
    if (branchId === null) {
      throw new BadRequestException('Vui lòng chọn cơ sở cho tài khoản');
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Không tìm thấy cơ sở');
    return { role, branchId };
  }
}
