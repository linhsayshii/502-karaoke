import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscountRequestStatus,
  DiscountSource,
  OrderStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDatesBetween, businessDayRange } from '../common/dates';
import { adjustmentsOf, billOf, billedEndOf } from '../orders/bill-of';
import {
  Adjustments,
  changedKeys,
  needsApproval,
  pickAdjustments,
} from '../orders/discount-rules';
import {
  logAdjustmentChange,
  pendingRequestOf,
} from '../orders/discount-ledger';
import { orderDetailInclude, staffRef } from '../orders/order-include';
import { lockOrderRow } from '../orders/order-lock';
import { AdjustOrderDto } from './dto/adjust-order.dto';
import { DiscountLogQuery } from './dto/discount-queries';
import { decidedMessage } from './decided-message';

type Db = Prisma.TransactionClient;

const CLOSED_MESSAGE = 'Phiên đã đóng';
const QUEUE_LIMIT = 200;
const LOG_LIMIT = 500;

// What the queue, the log and the room page show of a request.
const requestSelect = {
  id: true,
  branchId: true,
  orderId: true,
  status: true,
  source: true,
  before: true,
  after: true,
  amountBefore: true,
  amountAfter: true,
  note: true,
  createdAt: true,
  decidedAt: true,
  decisionNote: true,
  requestedBy: staffRef,
  decidedBy: staffRef,
  branch: { select: { id: true, code: true, name: true } },
  order: {
    select: {
      id: true,
      billNumber: true,
      status: true,
      room: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.DiscountRequestSelect;

@Injectable()
export class DiscountsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  // Loads an open session the user may act on and locks its row (every
  // writer of an order goes through the order lock first).
  async lockPendingOrder(tx: Db, user: AuthUser, orderId: number) {
    const found = await tx.order.findUnique({
      where: { id: orderId },
      select: { branchId: true },
    });
    if (!found) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.branchScope.assertBranchAccess(user, found.branchId);
    await lockOrderRow(tx, orderId, OrderStatus.PENDING, CLOSED_MESSAGE);
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { select: { price: true, quantity: true } } },
    });
  }

  // A manager's change, or one that makes nothing cheaper, applies at once
  // (and is logged); a cashier's discount becomes a request for the managers
  // of the branch.
  adjust(user: AuthUser, orderId: number, dto: AdjustOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockPendingOrder(tx, user, orderId);
      const before = adjustmentsOf(order);
      const after: Adjustments = { ...before, ...pickAdjustments(dto) };
      if (changedKeys(before, after).length === 0) {
        throw new BadRequestException('Không có thay đổi');
      }
      if (await pendingRequestOf(tx, order.id)) {
        throw new ConflictException('Đang có yêu cầu giảm giá chờ duyệt');
      }
      const end = billedEndOf(order, new Date());
      const amountBefore = billOf(order, end).finalAmount;
      const amountAfter = billOf(order, end, after).finalAmount;
      const direct =
        MANAGERS.includes(user.role) || !needsApproval(before, after);
      let branchManagers: number | undefined;

      if (direct) {
        await tx.order.update({ where: { id: order.id }, data: after });
        await logAdjustmentChange(tx, {
          branchId: order.branchId,
          orderId: order.id,
          source: DiscountSource.DIRECT,
          before,
          after,
          amountBefore,
          amountAfter,
          note: dto.note,
          userId: user.id,
        });
      } else {
        const note = dto.note?.trim();
        if (!note) throw new BadRequestException('Nhập lý do giảm giá');
        await tx.discountRequest.create({
          data: {
            branchId: order.branchId,
            orderId: order.id,
            status: DiscountRequestStatus.PENDING,
            source: DiscountSource.REQUEST,
            before: { ...before },
            after: { ...after },
            amountBefore,
            amountAfter,
            note,
            requestedById: user.id,
          },
        });
        // Whom it reaches: the branch managers who can sign in (the chain
        // managers always can). The screen warns when there is none.
        branchManagers = await tx.user.count({
          where: {
            branchId: order.branchId,
            role: Role.BRANCH_MANAGER,
            active: true,
            password: { not: null },
          },
        });
      }
      const saved = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: orderDetailInclude,
      });
      return { ...saved, branchManagers };
    });
  }

  // The branch filter of the queue and the log. Every DiscountRequest index
  // starts with branchId, so "every branch" is spelled out as the list of
  // branch ids (5 rows) rather than left open, which no index would serve.
  private async branchFilter(
    branchId: number | undefined,
  ): Promise<number | Prisma.IntFilter> {
    if (branchId !== undefined) return branchId;
    const branches = await this.prisma.branch.findMany({
      select: { id: true },
    });
    return { in: branches.map((b) => b.id) };
  }

  // Branch managers see their branch, the chain manager every branch
  // (whatever branch the screen is on).
  private async queueWhere(
    user: AuthUser,
  ): Promise<Prisma.DiscountRequestWhereInput> {
    return {
      status: DiscountRequestStatus.PENDING,
      branchId: await this.branchFilter(
        user.role === Role.CHAIN_MANAGER ? undefined : user.branchId!,
      ),
    };
  }

  // Oldest first. DiscountRequest(branchId, status) index.
  async pending(user: AuthUser) {
    const where = await this.queueWhere(user);
    return Promise.all([
      this.prisma.discountRequest.findMany({
        where,
        select: requestSelect,
        orderBy: { id: 'asc' },
        take: QUEUE_LIMIT,
      }),
      this.prisma.discountRequest.count({ where }),
    ]);
  }

  async pendingCount(user: AuthUser) {
    return {
      count: await this.prisma.discountRequest.count({
        where: await this.queueWhere(user),
      }),
    };
  }

  // Newest first, by the business day it was sent (≤ 366 days).
  // DiscountRequest(branchId, createdAt) index.
  async log(user: AuthUser, query: DiscountLogQuery) {
    businessDatesBetween(query.from, query.to, 366);
    const branchId = await this.branchScope.resolveOptionalBranchId(
      user,
      query.branch,
    );
    const where: Prisma.DiscountRequestWhereInput = {
      branchId: await this.branchFilter(branchId),
      status: query.status,
      createdAt: businessDayRange(query.from, query.to),
    };
    return Promise.all([
      this.prisma.discountRequest.findMany({
        where,
        select: requestSelect,
        orderBy: { id: 'desc' },
        take: LOG_LIMIT,
      }),
      this.prisma.discountRequest.count({ where }),
    ]);
  }

  async findOne(user: AuthUser, id: number) {
    const request = await this.prisma.discountRequest.findUnique({
      where: { id },
      select: requestSelect,
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu');
    this.branchScope.assertBranchAccess(user, request.branchId);
    return request;
  }

  approve(user: AuthUser, id: number, note?: string) {
    return this.decide(user, id, DiscountRequestStatus.APPROVED, note);
  }

  reject(user: AuthUser, id: number, note: string) {
    // The DTO refuses an empty note; a note of spaces only is refused here.
    if (!note.trim()) throw new BadRequestException('Nhập lý do từ chối');
    return this.decide(user, id, DiscountRequestStatus.REJECTED, note);
  }

  // Any cashier or manager of the branch may withdraw a request (spec §3).
  cancel(user: AuthUser, id: number) {
    return this.decide(user, id, DiscountRequestStatus.CANCELLED);
  }

  // Whoever acts first wins: the order is locked first (as by every writer
  // of an order), then the request only moves while still PENDING. A stale
  // request (the bill's discounts changed meanwhile) expires instead of
  // overwriting a newer value, as does a request left on a closed session;
  // either is committed before the 409 is thrown.
  private async decide(
    user: AuthUser,
    id: number,
    status: DiscountRequestStatus,
    note?: string,
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const request = await tx.discountRequest.findUnique({
        where: { id },
        select: { orderId: true, branchId: true },
      });
      if (!request) throw new NotFoundException('Không tìm thấy yêu cầu');
      this.branchScope.assertBranchAccess(user, request.branchId);

      // A closed session already expired its request (checkout, cancel).
      const { count: open } = await tx.order.updateMany({
        where: { id: request.orderId, status: OrderStatus.PENDING },
        data: { updatedAt: new Date() },
      });
      const current = await tx.discountRequest.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          decidedAt: true,
          decidedBy: { select: { fullName: true } },
          before: true,
          after: true,
        },
      });
      if (current.status !== DiscountRequestStatus.PENDING) {
        throw new ConflictException(decidedMessage(current));
      }
      const now = new Date();
      // Closing a session expires its request; one left waiting on a closed
      // session is expired here (committed) before the 409.
      if (open === 0) {
        await tx.discountRequest.update({
          where: { id },
          data: { status: DiscountRequestStatus.EXPIRED, decidedAt: now },
        });
        return 'closed' as const;
      }

      if (status === DiscountRequestStatus.APPROVED) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: request.orderId },
          include: { items: { select: { price: true, quantity: true } } },
        });
        const before = current.before as Adjustments;
        if (changedKeys(before, adjustmentsOf(order)).length > 0) {
          await tx.discountRequest.update({
            where: { id },
            data: { status: DiscountRequestStatus.EXPIRED, decidedAt: now },
          });
          return 'stale' as const;
        }
        await tx.order.update({
          where: { id: request.orderId },
          data: current.after as Adjustments,
        });
      }
      await tx.discountRequest.update({
        where: { id },
        data: {
          status,
          decidedById: user.id,
          decidedAt: now,
          decisionNote: note?.trim() || null,
        },
      });
      return 'done' as const;
    });
    if (outcome === 'closed') throw new ConflictException(CLOSED_MESSAGE);
    if (outcome === 'stale') {
      throw new ConflictException(
        'Giảm giá của hóa đơn đã thay đổi, thu ngân cần gửi lại yêu cầu',
      );
    }
    return this.prisma.discountRequest.findUniqueOrThrow({
      where: { id },
      select: requestSelect,
    });
  }
}
