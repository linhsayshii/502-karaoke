import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { MANAGERS, SALES } from '../auth/roles';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf, getBusinessDayRange } from '../common/dates';
import {
  CreatePrStaffDto,
  ListPrStaffQuery,
  UpdatePrStaffDto,
} from './dto/pr-staff.dto';
import {
  CheckInDto,
  ListAttendanceQuery,
  UpdateAttendanceDto,
} from './dto/pr-attendance.dto';

// A branch has a few dozen PR/KTV; the caps only guard against runaway data.
const STAFF_LIMIT = 500;
const ATTENDANCE_LIMIT = 500;

// Branch/chain managers, and any account marked "Quản lý PR/KTV".
export function canManagePr(user: AuthUser): boolean {
  return MANAGERS.includes(user.role) || user.managesPr;
}

// HĐQT sees the lists, read only.
export function canViewPr(user: AuthUser): boolean {
  return canManagePr(user) || user.role === Role.BOARD;
}

// Who may put PR/KTV into a room: anyone who sells (cashiers, managers) and
// any account marked "Quản lý PR/KTV".
export function canAssignPr(user: AuthUser): boolean {
  return SALES.includes(user.role) || user.managesPr;
}

const staffSelect = {
  id: true,
  branchId: true,
  code: true,
  name: true,
  phone: true,
  note: true,
  active: true,
} satisfies Prisma.PrStaffSelect;

const attendanceSelect = {
  id: true,
  prStaffId: true,
  businessDate: true,
  checkInAt: true,
  checkOutAt: true,
  note: true,
  prStaff: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PrAttendanceSelect;

type SelectedAttendance = Prisma.PrAttendanceGetPayload<{
  select: typeof attendanceSelect;
}>;

// @db.Date values are read back as UTC midnight.
const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

function toPublicAttendance(row: SelectedAttendance) {
  return { ...row, businessDate: fromDbDate(row.businessDate) };
}

const trimOrNull = (value?: string) =>
  value === undefined ? undefined : value.trim() || null;

@Injectable()
export class PrService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // ---- danh sách PR/KTV ------------------------------------------------------

  async listStaff(user: AuthUser, query: ListPrStaffQuery) {
    this.assertView(user);
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const where: Prisma.PrStaffWhereInput = {
      branchId,
      active: query.includeInactive ? undefined : true,
    };
    return Promise.all([
      this.prisma.prStaff.findMany({
        where,
        select: staffSelect,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        take: STAFF_LIMIT,
      }),
      this.prisma.prStaff.count({ where }),
    ]);
  }

  async createStaff(
    user: AuthUser,
    branch: string | undefined,
    dto: CreatePrStaffDto,
  ) {
    this.assertManage(user);
    const branchId = await this.branchScope.resolveBranchId(user, branch);
    const code = trimOrNull(dto.code) ?? null;
    await this.assertCodeFree(branchId, code);
    return this.prisma.prStaff.create({
      data: {
        branchId,
        name: dto.name.trim(),
        code,
        phone: trimOrNull(dto.phone),
        note: trimOrNull(dto.note),
      },
      select: staffSelect,
    });
  }

  async updateStaff(user: AuthUser, id: number, dto: UpdatePrStaffDto) {
    this.assertManage(user);
    const target = await this.getStaff(user, id);
    const code = trimOrNull(dto.code);
    if (code) await this.assertCodeFree(target.branchId, code, id);
    const name = dto.name?.trim();
    if (name === '') throw new BadRequestException('Vui lòng nhập tên');
    return this.prisma.prStaff.update({
      where: { id },
      data: {
        name,
        code,
        phone: trimOrNull(dto.phone),
        note: trimOrNull(dto.note),
        active: dto.active,
      },
      select: staffSelect,
    });
  }

  // Removes someone never on a roll call; otherwise marks them as left, so
  // past roll calls keep their name.
  async removeStaff(user: AuthUser, id: number) {
    this.assertManage(user);
    await this.getStaff(user, id);
    const attended = await this.prisma.prAttendance.findFirst({
      where: { prStaffId: id },
      select: { id: true },
    });
    if (attended) {
      await this.prisma.prStaff.update({
        where: { id },
        data: { active: false },
      });
      return { deleted: false };
    }
    await this.prisma.prStaff.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- điểm danh ---------------------------------------------------------------

  async listAttendance(
    user: AuthUser,
    query: ListAttendanceQuery,
  ): Promise<[ReturnType<typeof toPublicAttendance>[], number]> {
    this.assertView(user);
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const date = query.businessDate ?? businessDateOf(new Date());
    getBusinessDayRange(date); // rejects impossible dates
    const where: Prisma.PrAttendanceWhereInput = {
      branchId,
      businessDate: toDbDate(date),
    };
    const [rows, total] = await Promise.all([
      this.prisma.prAttendance.findMany({
        where,
        select: attendanceSelect,
        orderBy: [{ checkInAt: 'asc' }, { id: 'asc' }],
        take: ATTENDANCE_LIMIT,
      }),
      this.prisma.prAttendance.count({ where }),
    ]);
    return [rows.map(toPublicAttendance), total];
  }

  async checkIn(user: AuthUser, dto: CheckInDto) {
    this.assertManage(user);
    const staff = await this.getStaff(user, dto.prStaffId);
    if (!staff.active) {
      throw new BadRequestException(
        `${staff.name} đã nghỉ, không điểm danh được`,
      );
    }
    const now = new Date();
    const today = businessDateOf(now);
    const date = dto.businessDate ?? today;
    if (date > today) {
      throw new BadRequestException('Không điểm danh trước cho ngày sau');
    }
    let checkInAt = now;
    if (dto.checkInAt) checkInAt = new Date(dto.checkInAt);
    else if (date !== today) {
      throw new BadRequestException('Vui lòng nhập giờ vào cho ngày đã qua');
    }
    this.assertInDay(date, checkInAt);

    const existing = await this.prisma.prAttendance.findUnique({
      where: {
        prStaffId_businessDate: {
          prStaffId: staff.id,
          businessDate: toDbDate(date),
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`${staff.name} đã được điểm danh ngày này`);
    }
    const row = await this.prisma.prAttendance.create({
      data: {
        branchId: staff.branchId,
        prStaffId: staff.id,
        businessDate: toDbDate(date),
        checkInAt,
        note: trimOrNull(dto.note),
        createdById: user.id,
      },
      select: attendanceSelect,
    });
    return toPublicAttendance(row);
  }

  async checkOut(user: AuthUser, id: number) {
    this.assertManage(user);
    const row = await this.getAttendance(user, id);
    if (row.checkOutAt) throw new ConflictException('Đã chấm giờ ra');
    const now = new Date();
    const updated = await this.prisma.prAttendance.update({
      where: { id },
      data: { checkOutAt: now < row.checkInAt ? row.checkInAt : now },
      select: attendanceSelect,
    });
    return toPublicAttendance(updated);
  }

  // Corrects the times or the note of a roll call entry.
  async updateAttendance(user: AuthUser, id: number, dto: UpdateAttendanceDto) {
    this.assertManage(user);
    const row = await this.getAttendance(user, id);
    const date = fromDbDate(row.businessDate);
    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : row.checkInAt;
    const checkOutAt =
      dto.checkOutAt === undefined
        ? row.checkOutAt
        : dto.checkOutAt && new Date(dto.checkOutAt);
    this.assertInDay(date, checkInAt);
    if (checkOutAt && checkOutAt < checkInAt) {
      throw new BadRequestException('Giờ ra phải sau giờ vào');
    }
    const updated = await this.prisma.prAttendance.update({
      where: { id },
      data: { checkInAt, checkOutAt, note: trimOrNull(dto.note) },
      select: attendanceSelect,
    });
    return toPublicAttendance(updated);
  }

  // Undoes a roll call entry made by mistake.
  async removeAttendance(user: AuthUser, id: number) {
    this.assertManage(user);
    await this.getAttendance(user, id);
    await this.prisma.prAttendance.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- rules ---------------------------------------------------------------

  private assertView(user: AuthUser) {
    if (!canViewPr(user)) {
      throw new ForbiddenException('Bạn không có quyền xem PR/KTV');
    }
  }

  private assertManage(user: AuthUser) {
    if (!canManagePr(user)) {
      throw new ForbiddenException('Bạn không có quyền quản lý PR/KTV');
    }
  }

  private async getStaff(user: AuthUser, id: number) {
    const staff = await this.prisma.prStaff.findUnique({
      where: { id },
      select: staffSelect,
    });
    if (!staff) throw new NotFoundException('Không tìm thấy PR/KTV');
    this.branchScope.assertBranchAccess(user, staff.branchId);
    return staff;
  }

  private async getAttendance(user: AuthUser, id: number) {
    const row = await this.prisma.prAttendance.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        businessDate: true,
        checkInAt: true,
        checkOutAt: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lượt điểm danh');
    this.branchScope.assertBranchAccess(user, row.branchId);
    return row;
  }

  // Codes are unique among a branch's PR/KTV (names may repeat).
  private async assertCodeFree(
    branchId: number,
    code: string | null,
    exceptId?: number,
  ) {
    if (!code) return;
    const taken = await this.prisma.prStaff.findFirst({
      where: {
        branchId,
        code: { equals: code, mode: 'insensitive' },
        id: exceptId ? { not: exceptId } : undefined,
      },
      select: { name: true },
    });
    if (taken) {
      throw new ConflictException(`Mã ${code} đã dùng cho ${taken.name}`);
    }
  }

  private assertInDay(date: string, moment: Date) {
    const { start, end } = getBusinessDayRange(date);
    if (moment < start || moment >= end) {
      throw new BadRequestException(
        'Giờ vào phải nằm trong ngày kinh doanh (06:00 hôm đó đến 06:00 hôm sau)',
      );
    }
  }
}
