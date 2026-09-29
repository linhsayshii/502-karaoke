import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { orderDetailInclude } from '../orders/order-include';
import { lockOrderRow } from '../orders/order-lock';
import { canAssignPr } from './pr.service';
import { checkSessionTimes } from './pr-session-rules';
import { AddPrSessionDto, UpdatePrSessionDto } from './dto/pr-session.dto';

type Db = Prisma.TransactionClient;

const CLOSED_MESSAGE = 'Phòng đã đóng, không sửa PR được nữa';

@Injectable()
export class PrSessionsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

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
