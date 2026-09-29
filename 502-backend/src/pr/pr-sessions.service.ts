import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  businessDateOf,
  businessDatesBetween,
  businessDayRange,
} from '../common/dates';
import { orderDetailInclude } from '../orders/order-include';
import { lockOrderRow } from '../orders/order-lock';
import { canAssignPr, canViewPr } from './pr.service';
import { checkSessionTimes } from './pr-session-rules';
import {
  AddPrSessionDto,
  PrStatsQuery,
  UpdatePrSessionDto,
} from './dto/pr-session.dto';

type Db = Prisma.TransactionClient;

const CLOSED_MESSAGE = 'Phòng đã đóng, không sửa PR được nữa';
const AVAILABLE_LIMIT = 500;

export interface AvailablePr {
  id: number;
  code: string | null;
  name: string;
  checkedIn: boolean;
  currentRoom: { orderId: number; roomName: string | null } | null;
}

@Injectable()
export class PrSessionsService {
  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Active PR/KTV of the branch for the room page: who is on today's roll
  // call (first), and the room each one is sitting in right now.
  async available(
    user: AuthUser,
    branch?: string,
  ): Promise<[AvailablePr[], number]> {
    this.assertAssign(user);
    const branchId = await this.branchScope.resolveBranchId(user, branch);
    const today = new Date(`${businessDateOf(new Date())}T00:00:00Z`);
    const where: Prisma.PrStaffWhereInput = { branchId, active: true };
    const [rows, total] = await Promise.all([
      this.prisma.prStaff.findMany({
        where,
        orderBy: { name: 'asc' },
        take: AVAILABLE_LIMIT,
        select: {
          id: true,
          code: true,
          name: true,
          // Unique (prStaffId, businessDate) index.
          attendances: {
            where: { businessDate: today, checkOutAt: null },
            select: { id: true },
            take: 1,
          },
          // PrSession(prStaffId, endAt) index.
          sessions: {
            where: { endAt: null },
            select: {
              orderId: true,
              order: { select: { room: { select: { name: true } } } },
            },
            take: 1,
          },
        },
      }),
      this.prisma.prStaff.count({ where }),
    ]);
    const list = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      checkedIn: r.attendances.length > 0,
      currentRoom: r.sessions[0]
        ? {
            orderId: r.sessions[0].orderId,
            roomName: r.sessions[0].order.room?.name ?? null,
          }
        : null,
    }));
    // Sorting at most 500 rows already loaded (nothing is summed).
    list.sort((a, b) => Number(b.checkedIn) - Number(a.checkedIn));
    return [list, total];
  }

  // Puts a PR/KTV into an open room from `startAt` (default now).
  add(user: AuthUser, dto: AddPrSessionDto) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOpenOrder(tx, user, dto.orderId);
      const staff = await this.lockStaff(tx, dto.prStaffId);
      if (staff.branchId !== order.branchId) {
        throw new BadRequestException('PR/KTV không thuộc cơ sở này');
      }
      if (!staff.active) {
        throw new BadRequestException(`${staff.name} đã nghỉ, không gán được`);
      }
      await this.assertNotElsewhere(tx, staff);
      const now = new Date();
      const startAt = dto.startAt ? new Date(dto.startAt) : now;
      this.assertTimes(order.startTime, startAt, null, now);
      await tx.prSession.create({
        data: {
          branchId: order.branchId,
          orderId: order.id,
          prStaffId: staff.id,
          startAt,
          createdById: user.id,
        },
      });
      return this.detail(tx, order.id);
    });
  }

  // "Ra": the visit ends now.
  end(user: AuthUser, id: number) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisit(tx, user, id);
      const order = await this.lockOpenOrder(tx, user, visit.orderId);
      // Re-read under the order lock: another device may have ended it.
      const current = await tx.prSession.findUniqueOrThrow({
        where: { id },
        select: { startAt: true, endAt: true },
      });
      if (current.endAt) throw new ConflictException('PR đã ra khỏi phòng');
      const now = new Date();
      await tx.prSession.update({
        where: { id },
        data: { endAt: now < current.startAt ? current.startAt : now },
      });
      return this.detail(tx, order.id);
    });
  }

  // Corrects the times of a visit; endAt null puts the PR back in the room.
  update(user: AuthUser, id: number, dto: UpdatePrSessionDto) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisit(tx, user, id);
      const order = await this.lockOpenOrder(tx, user, visit.orderId);
      const current = await tx.prSession.findUniqueOrThrow({
        where: { id },
        select: { startAt: true, endAt: true, prStaffId: true },
      });
      const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
      const endAt =
        dto.endAt === undefined
          ? current.endAt
          : dto.endAt
            ? new Date(dto.endAt)
            : null;
      if (current.endAt && endAt === null) {
        const staff = await this.lockStaff(tx, current.prStaffId);
        await this.assertNotElsewhere(tx, staff, id);
      }
      this.assertTimes(order.startTime, startAt, endAt, new Date());
      await tx.prSession.update({ where: { id }, data: { startAt, endAt } });
      return this.detail(tx, order.id);
    });
  }

  // Removes a visit entered by mistake (only while the room is open).
  remove(user: AuthUser, id: number) {
    this.assertAssign(user);
    return this.prisma.$transaction(async (tx) => {
      const visit = await this.getVisit(tx, user, id);
      const order = await this.lockOpenOrder(tx, user, visit.orderId);
      await tx.prSession.delete({ where: { id } });
      return this.detail(tx, order.id);
    });
  }

  // ---- rules ---------------------------------------------------------------

  // Hours each PR/KTV spent in rooms over business days [from, to]; a visit
  // belongs to the day it started, and an open one counts up to now. Summed in
  // SQL on the report pool (PrSession(branchId, startAt) index); minutes are
  // clamped at 0 per visit like sessionMinutes().
  async stats(user: AuthUser, query: PrStatsQuery) {
    // Also checked by PrViewGuard before the request is shared.
    if (!canViewPr(user)) {
      throw new ForbiddenException('Bạn không có quyền xem PR/KTV');
    }
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    businessDatesBetween(query.from, query.to); // 400 when too long
    const { gte, lt } = businessDayRange(query.from, query.to);
    const minutesSql = Prisma.sql`GREATEST(CEIL(EXTRACT(EPOCH FROM (COALESCE("endAt", now()) - "startAt")) / 60), 0)`;
    const where = Prisma.sql`"branchId" = ${branchId} AND "startAt" >= ${gte} AND "startAt" < ${lt}`;
    // At most one row per PR of the branch, so no LIMIT.
    const [rows, totals] = await Promise.all([
      this.reportDb.$queryRaw<
        {
          prStaffId: number;
          minutes: number;
          sessions: number;
          rooms: number;
        }[]
      >`
        SELECT "prStaffId",
               COALESCE(SUM(${minutesSql}), 0)::int AS minutes,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT "orderId")::int AS rooms
        FROM "PrSession" WHERE ${where}
        GROUP BY "prStaffId"`,
      this.reportDb.$queryRaw<
        { minutes: number; sessions: number; rooms: number }[]
      >`
        SELECT COALESCE(SUM(${minutesSql}), 0)::int AS minutes,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT "orderId")::int AS rooms
        FROM "PrSession" WHERE ${where}`,
    ]);
    return {
      range: { from: query.from, to: query.to },
      totals: totals[0],
      rows,
    };
  }

  private assertAssign(user: AuthUser) {
    if (!canAssignPr(user)) {
      throw new ForbiddenException('Bạn không có quyền gán PR/KTV vào phòng');
    }
  }

  // Order first, then the PR row (the same order everywhere, and checkout
  // only locks orders and products): no deadlocks.
  private async lockOpenOrder(tx: Db, user: AuthUser, orderId: number) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, branchId: true, startTime: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy phòng đang hát');
    this.branchScope.assertBranchAccess(user, order.branchId);
    await lockOrderRow(tx, orderId, OrderStatus.PENDING, CLOSED_MESSAGE);
    if (!order.startTime) {
      throw new BadRequestException('Phòng chưa bắt đầu tính giờ');
    }
    return { ...order, startTime: order.startTime };
  }

  // Locks the PrStaff row so two devices cannot put the same PR into two
  // rooms at once.
  private async lockStaff(tx: Db, prStaffId: number) {
    await tx.$queryRaw`SELECT id FROM "PrStaff" WHERE id = ${prStaffId} FOR UPDATE`;
    const staff = await tx.prStaff.findUnique({
      where: { id: prStaffId },
      select: { id: true, branchId: true, name: true, active: true },
    });
    if (!staff) throw new NotFoundException('Không tìm thấy PR/KTV');
    return staff;
  }

  // At most one open visit per PR (uses the PrSession(prStaffId, endAt) index).
  private async assertNotElsewhere(
    tx: Db,
    staff: { id: number; name: string },
    exceptId?: number,
  ) {
    const open = await tx.prSession.findFirst({
      where: {
        prStaffId: staff.id,
        endAt: null,
        id: exceptId ? { not: exceptId } : undefined,
      },
      select: { order: { select: { room: { select: { name: true } } } } },
    });
    if (open) {
      const room = open.order.room?.name ?? 'khác';
      throw new ConflictException(`${staff.name} đang ở phòng ${room}`);
    }
  }

  private assertTimes(
    orderStart: Date,
    startAt: Date,
    endAt: Date | null,
    now: Date,
  ) {
    const error = checkSessionTimes({ orderStart, startAt, endAt, now });
    if (error) throw new BadRequestException(error);
  }

  private async getVisit(tx: Db, user: AuthUser, id: number) {
    const visit = await tx.prSession.findUnique({
      where: { id },
      select: { id: true, branchId: true, orderId: true },
    });
    if (!visit) throw new NotFoundException('Không tìm thấy lượt PR');
    this.branchScope.assertBranchAccess(user, visit.branchId);
    return visit;
  }

  private detail(tx: Db, orderId: number) {
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderDetailInclude,
    });
  }
}
