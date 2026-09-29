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
import { orderDetailInclude } from '../orders/order-include';
import { lockOrderRow } from '../orders/order-lock';
import { AdjustOrderDto } from './dto/adjust-order.dto';

type Db = Prisma.TransactionClient;

const CLOSED_MESSAGE = 'Phiên đã đóng';

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
}
