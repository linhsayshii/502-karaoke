import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Order,
  OrderStatus,
  PaymentMethod,
  Prisma,
  Role,
  RoomStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  businessDateOf,
  businessDatesBetween,
  businessDayRange,
} from '../common/dates';
import { InventoryService } from '../inventory/inventory.service';
import { cancelLinkedEntry, recordSaleReceipt } from '../funds/fund-ledger';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ListOrdersQuery, StatisticsQuery } from './dto/order-queries';
import { Bill, computeBill } from './billing';
import { billNumberPrefixRange, nextBillNumber } from './bill-number';

const staffRef = { select: { id: true, fullName: true } };
const orderInclude = {
  room: true,
  cskh: staffRef,
  server: staffRef,
  createdBy: staffRef,
  checkedOutBy: staffRef,
  cancelledBy: staffRef,
  items: { include: { product: true }, orderBy: { id: 'asc' } },
  fundTransaction: {
    select: { id: true, method: true, amount: true, cancelledAt: true },
  },
} satisfies Prisma.OrderInclude;

type Db = Prisma.TransactionClient;
type BillableOrder = Pick<
  Order,
  | 'startTime'
  | 'pricePerHour'
  | 'discountPercent'
  | 'discountAmount'
  | 'hourlyDiscountPercent'
  | 'hourlyDiscountAmount'
  | 'serviceFeePercent'
  | 'serviceFeeAmount'
  | 'taxPercent'
> & { items: { price: Prisma.Decimal; quantity: number }[] };

// The bill of a session ending at `endTime`, from what is stored on it.
function billOf(order: BillableOrder, endTime: Date): Bill {
  if (!order.startTime) {
    throw new BadRequestException('Hóa đơn chưa bắt đầu tính giờ');
  }
  return computeBill({
    startTime: order.startTime,
    endTime,
    pricePerHour: Number(order.pricePerHour),
    items: order.items.map((i) => ({
      price: Number(i.price),
      quantity: i.quantity,
    })),
    discountPercent: order.discountPercent,
    discountAmount: Number(order.discountAmount),
    hourlyDiscountPercent: order.hourlyDiscountPercent,
    hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
    serviceFeePercent: order.serviceFeePercent,
    serviceFeeAmount: Number(order.serviceFeeAmount),
    taxPercent: order.taxPercent,
  });
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
    private inventory: InventoryService,
  ) {}

  // CSKH / phục vụ must be active employees of the order's branch.
  private async assertFloorStaff(
    db: Db,
    branchId: number,
    ids: (number | null | undefined)[],
  ) {
    const wanted = ids.filter((id): id is number => typeof id === 'number');
    if (wanted.length === 0) return;
    const found = await db.user.count({
      where: { id: { in: wanted }, branchId, active: true },
    });
    if (found !== new Set(wanted).size) {
      throw new BadRequestException('Nhân viên không thuộc cơ sở này');
    }
  }

  private assertCanView(
    user: AuthUser,
    order: {
      branchId: number;
      status: OrderStatus;
      serverId: number | null;
      cskhId: number | null;
    },
  ) {
    this.branchScope.assertBranchAccess(user, order.branchId);
    if (
      user.role === Role.STAFF &&
      !(
        order.status === OrderStatus.PENDING &&
        (order.serverId === user.id || order.cskhId === user.id)
      )
    ) {
      throw new ForbiddenException('Bạn chỉ xem được phòng mình đang phục vụ');
    }
  }

  // Loads an order the user may act on and locks its row until the
  // transaction ends, provided it still has `status`. Every writer of an
  // order goes through here first, so an item edit and a checkout of the
  // same session can never interleave.
  private async lockOrder(
    tx: Db,
    user: AuthUser,
    id: number,
    status: OrderStatus,
    conflictMessage: string,
  ) {
    const order = await tx.order.findUnique({
      where: { id },
      select: { branchId: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.branchScope.assertBranchAccess(user, order.branchId);

    // UPDATE takes the row lock; a concurrent writer waits here and then
    // re-checks the status.
    const { count } = await tx.order.updateMany({
      where: { id, status },
      data: { updatedAt: new Date() },
    });
    if (count === 0) throw new ConflictException(conflictMessage);

    return tx.order.findUniqueOrThrow({
      where: { id },
      include: { room: true, items: { include: { product: true } } },
    });
  }

  // Opens a room session: room must belong to the branch and be free. The
  // room's hourly price is fixed for the session.
  create(user: AuthUser, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: dto.roomId } });
      if (!room) throw new NotFoundException('Không tìm thấy phòng');
      this.branchScope.assertBranchAccess(user, room.branchId);
      await this.assertFloorStaff(tx, room.branchId, [
        dto.cskhId,
        dto.serverId,
      ]);

      const { count } = await tx.room.updateMany({
        where: { id: room.id, status: RoomStatus.AVAILABLE },
        data: { status: RoomStatus.ACTIVE },
      });
      if (count === 0) {
        throw new ConflictException('Phòng đang có khách hoặc đang bảo trì');
      }

      return tx.order.create({
        data: {
          branchId: room.branchId,
          roomId: room.id,
          pricePerHour: room.pricePerHour,
          cskhId: dto.cskhId ?? null,
          serverId: dto.serverId ?? null,
          createdById: user.id,
          status: OrderStatus.PENDING,
          startTime: new Date(),
        },
        include: orderInclude,
      });
    });
  }

  // Managers: bills of a period (by payment / cancel time, business days).
  // Staff: the open sessions they serve.
  async findAll(user: AuthUser, query: ListOrdersQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const where: Prisma.OrderWhereInput = { branchId, status: query.status };

    // A bill number is looked up over every day.
    const from = query.from ?? query.businessDate;
    const to = query.to ?? query.businessDate;
    if (query.billNumber) {
      where.billNumber = billNumberPrefixRange(query.billNumber);
    } else if (from || to) {
      where.endTime = businessDayRange(from, to);
    }

    if (user.role === Role.STAFF) {
      where.status = OrderStatus.PENDING;
      where.endTime = undefined;
      where.billNumber = undefined;
      where.OR = [{ serverId: user.id }, { cskhId: user.id }];
    }

    return this.prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ endTime: 'desc' }, { startTime: 'desc' }],
      take: 1000,
    });
  }

  async findOne(user: AuthUser, id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.assertCanView(user, order);
    return order;
  }

  async update(user: AuthUser, id: number, dto: UpdateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(
        tx,
        user,
        id,
        OrderStatus.PENDING,
        'Hóa đơn đã đóng, không thể sửa',
      );
      await this.assertFloorStaff(tx, order.branchId, [
        dto.cskhId,
        dto.serverId,
      ]);

      const { items, ...fields } = dto;
      const data: Prisma.OrderUncheckedUpdateInput = { ...fields };

      if (items) {
        // Merge duplicate lines; keep the price each product was ordered at.
        const quantities = new Map<number, number>();
        for (const item of items) {
          quantities.set(
            item.productId,
            (quantities.get(item.productId) ?? 0) + item.quantity,
          );
        }
        const snapshot = new Map<number, Prisma.Decimal>();
        for (const item of order.items) {
          if (!snapshot.has(item.productId)) {
            snapshot.set(item.productId, item.price);
          }
        }

        const products = await tx.product.findMany({
          where: { id: { in: [...quantities.keys()] } },
        });
        const productById = new Map(products.map((p) => [p.id, p]));

        const lines = [...quantities].map(([productId, quantity]) => {
          const product = productById.get(productId);
          const price = snapshot.get(productId);
          if (!product || product.branchId !== order.branchId) {
            throw new BadRequestException('Sản phẩm không thuộc cơ sở này');
          }
          if (!price && !product.active) {
            throw new BadRequestException(`"${product.name}" đã ngừng bán`);
          }
          return { productId, quantity, price: price ?? product.price };
        });

        data.items = { deleteMany: {}, create: lines };
        data.totalProductPrice = lines.reduce(
          (sum, l) => sum + Number(l.price) * l.quantity,
          0,
        );
      }

      return tx.order.update({
        where: { id },
        data,
        include: orderInclude,
      });
    });
  }

  // Live bill for an open session; closed bills show what was stored.
  async preview(user: AuthUser, id: number) {
    const order = await this.findOne(user, id);
    if (order.status !== OrderStatus.PENDING) {
      const minutes =
        order.startTime && order.endTime
          ? (order.endTime.getTime() - order.startTime.getTime()) / 60000
          : 0;
      return {
        ...order,
        durationMinutes: Math.max(0, Math.ceil(minutes)),
        hourlyFee: Number(order.hourlyFee),
        totalProductPrice: Number(order.totalProductPrice),
        discountAmount: Number(order.discountAmount),
        hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
        serviceFeeAmount: Number(order.serviceFeeAmount),
        totalBeforeTax: Number(order.finalAmount) - Number(order.taxAmount),
        taxAmount: Number(order.taxAmount),
        finalAmount: Number(order.finalAmount),
      };
    }
    const endTime = new Date();
    return { ...order, endTime, ...billOf(order, endTime) };
  }

  // Closes the bill, frees the room, deducts sold items from stock and writes
  // the fund receipt — all or nothing.
  checkout(user: AuthUser, id: number, paymentMethod?: PaymentMethod) {
    const method = paymentMethod ?? PaymentMethod.CASH;
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(
          tx,
          user,
          id,
          OrderStatus.PENDING,
          'Hóa đơn đã được thanh toán hoặc đã hủy',
        );

        const endTime = new Date();
        const bill = billOf(order, endTime);
        const number = await nextBillNumber(
          tx,
          order.branchId,
          endTime,
          order.room?.name,
        );

        await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.COMPLETED,
            endTime,
            ...number,
            hourlyFee: bill.hourlyFee,
            totalProductPrice: bill.totalProductPrice,
            discountAmount: bill.discountAmount,
            hourlyDiscountAmount: bill.hourlyDiscountAmount,
            serviceFeeAmount: bill.serviceFeeAmount,
            taxAmount: bill.taxAmount,
            finalAmount: bill.finalAmount,
            paymentMethod: method,
            checkedOutById: user.id,
          },
        });

        if (order.roomId) {
          await tx.room.update({
            where: { id: order.roomId },
            data: { status: RoomStatus.AVAILABLE },
          });
        }

        const sold = new Map<number, number>();
        for (const item of order.items) {
          if (!item.product.trackStock) continue;
          sold.set(
            item.productId,
            (sold.get(item.productId) ?? 0) + item.quantity,
          );
        }
        // Same lock order everywhere (by product id): no deadlocks between
        // concurrent checkouts.
        const soldByProduct = [...sold].sort(([a], [b]) => a - b);
        for (const [productId, quantity] of soldByProduct) {
          await this.inventory.applyMovement(tx, {
            branchId: order.branchId,
            productId,
            type: StockMovementType.SALE,
            quantity: -quantity,
            orderId: order.id,
            createdById: user.id,
            allowNegative: true,
          });
        }

        if (bill.finalAmount > 0) {
          await recordSaleReceipt(tx, {
            branchId: order.branchId,
            orderId: order.id,
            billNumber: number.billNumber,
            amount: bill.finalAmount,
            method,
            occurredAt: endTime,
            roomName: order.room?.name,
            createdById: user.id,
          });
        }

        return tx.order.findUniqueOrThrow({
          where: { id },
          include: orderInclude,
        });
      },
      { timeout: 15000 },
    );
  }

  // Managers only: drop an open session without billing it. It still takes
  // the next bill number, so the day's numbers show every closed session.
  cancel(user: AuthUser, id: number, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(
        tx,
        user,
        id,
        OrderStatus.PENDING,
        'Chỉ hủy được hóa đơn đang mở',
      );
      const now = new Date();
      const number = await nextBillNumber(
        tx,
        order.branchId,
        now,
        order.room?.name,
      );
      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          endTime: now,
          ...number,
          cancelledAt: now,
          cancelledById: user.id,
          cancelReason: reason?.trim() || null,
        },
      });
      if (order.roomId) {
        await tx.room.update({
          where: { id: order.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderInclude,
      });
    });
  }

  // Managers only: void a paid bill. The sold goods go back to stock and the
  // fund receipt is cancelled, so revenue, stock and fund stay in step. The
  // bill keeps its number.
  voidPaid(user: AuthUser, id: number, reason: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(
          tx,
          user,
          id,
          OrderStatus.COMPLETED,
          'Chỉ hủy được hóa đơn đã thanh toán',
        );
        await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledById: user.id,
            cancelReason: reason.trim(),
          },
        });

        // Put back exactly what checkout took out.
        const sales = await tx.stockMovement.groupBy({
          by: ['productId'],
          where: { orderId: id, type: StockMovementType.SALE },
          _sum: { quantity: true },
          orderBy: { productId: 'asc' },
        });
        for (const sale of sales) {
          const quantity = -(sale._sum.quantity ?? 0);
          if (quantity <= 0) continue;
          await this.inventory.applyMovement(tx, {
            branchId: order.branchId,
            productId: sale.productId,
            type: StockMovementType.REVERSAL,
            quantity,
            orderId: id,
            createdById: user.id,
          });
        }

        await cancelLinkedEntry(
          tx,
          { orderId: id },
          {
            cancelledById: user.id,
            reason: `Hủy hóa đơn ${order.billNumber ?? `#${id}`}: ${reason.trim()}`,
          },
        );

        return tx.order.findUniqueOrThrow({
          where: { id },
          include: orderInclude,
        });
      },
      { timeout: 15000 },
    );
  }

  // Revenue of paid bills per business day of payment, with its make-up.
  // Uses the same days as the fund, so the sales receipts there add up to
  // the same totals.
  async getStatistics(user: AuthUser, query: StatisticsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const dates = businessDatesBetween(query.from, query.to);
    const orders = await this.prisma.order.findMany({
      where: {
        branchId,
        status: OrderStatus.COMPLETED,
        endTime: businessDayRange(query.from, query.to),
      },
      select: {
        endTime: true,
        hourlyFee: true,
        totalProductPrice: true,
        discountAmount: true,
        hourlyDiscountAmount: true,
        serviceFeeAmount: true,
        taxAmount: true,
        finalAmount: true,
        paymentMethod: true,
      },
    });

    const empty = () => ({
      orderCount: 0,
      totalRevenue: 0,
      hourlyFee: 0,
      productRevenue: 0,
      discount: 0,
      serviceFee: 0,
      tax: 0,
      cash: 0,
      transfer: 0,
    });
    const days = new Map(dates.map((date) => [date, empty()]));
    for (const order of orders) {
      const day = days.get(businessDateOf(order.endTime!));
      if (!day) continue;
      const amount = Number(order.finalAmount);
      day.orderCount += 1;
      day.totalRevenue += amount;
      day.hourlyFee += Number(order.hourlyFee);
      day.productRevenue += Number(order.totalProductPrice);
      day.discount +=
        Number(order.discountAmount) + Number(order.hourlyDiscountAmount);
      day.serviceFee += Number(order.serviceFeeAmount);
      day.tax += Number(order.taxAmount);
      if (order.paymentMethod === PaymentMethod.TRANSFER) {
        day.transfer += amount;
      } else {
        day.cash += amount;
      }
    }
    return dates.map((date) => ({ date, ...days.get(date)! }));
  }
}
