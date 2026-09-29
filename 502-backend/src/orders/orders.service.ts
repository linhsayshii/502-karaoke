import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  Prisma,
  Role,
  RoomStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDayRange } from '../common/dates';
import { InventoryService } from '../inventory/inventory.service';
import { roundCost } from '../inventory/costing';
import {
  cancelLinkedEntry,
  recordSaleReceipt,
  syncSaleReceipt,
} from '../funds/fund-ledger';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { EditPaidOrderDto } from './dto/edit-paid-order.dto';
import { OrderItemDto } from './dto/order-item.dto';
import { ListOrdersQuery } from './dto/order-queries';
import { Bill, billedHoursOf, computeBill } from './billing';
import { billNumberPrefixRange, nextBillNumber } from './bill-number';
import { orderDetailInclude, orderInclude } from './order-include';
import { closeOpenPrSessions, lockOrderRow } from './order-lock';
import { adjustmentsOf, billedEndOf, billOf } from './bill-of';
import { isServerOf, SERVE_FORBIDDEN } from './order-access';
import {
  assertNoPendingRequest,
  expirePendingRequests,
} from './discount-ledger';

type Db = Prisma.TransactionClient;

// DTO fields that were not sent are own `undefined` properties; drop them
// so they do not overwrite stored values.
const sentFields = <T extends object>(dto: T) =>
  Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

// The amounts of a computed bill as stored on the order. The service fee is
// no longer charged: its legacy columns are cleared whenever a bill is
// (re)computed, so they never disagree with the total.
const billAmounts = (bill: Bill) => ({
  hourlyFee: bill.hourlyFee,
  totalProductPrice: bill.totalProductPrice,
  discountAmount: bill.discountAmount,
  hourlyDiscountAmount: bill.hourlyDiscountAmount,
  serviceFeePercent: 0,
  serviceFeeAmount: 0,
  taxAmount: bill.taxAmount,
  finalAmount: bill.finalAmount,
});

// Cost per unit of what a bill took of a product (0 when it took none).
function unitCostOf(taken?: { quantity: number; value: number }): number {
  return taken && taken.quantity > 0
    ? roundCost(taken.value / taken.quantity)
    : 0;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
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

    await lockOrderRow(tx, id, status, conflictMessage);

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
        include: orderDetailInclude,
      });
    });
  }

  // Managers: bills of a period (by payment / cancel time, business days),
  // the newest 1000, and how many match in all.
  // Staff: the open sessions they serve.
  async findAll(user: AuthUser, query: ListOrdersQuery) {
    const where = await this.listWhere(user, query);
    return Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ endTime: 'desc' }, { startTime: 'desc' }],
        take: 1000,
      }),
      this.prisma.order.count({ where }),
    ]);
  }

  // Totals of every bill the list filters select, not only of the 1000 it
  // returns: paid (collected, VAT included, and that VAT) and cancelled.
  // Summed in SQL on the report pool.
  async summary(user: AuthUser, query: ListOrdersQuery) {
    const groups = await this.reportDb.order.groupBy({
      by: ['status'],
      where: await this.listWhere(user, query),
      _count: { _all: true },
      _sum: { finalAmount: true, taxAmount: true },
    });
    const paid = groups.find((g) => g.status === OrderStatus.COMPLETED);
    return {
      billCount: groups.reduce((sum, g) => sum + g._count._all, 0),
      paidCount: paid?._count._all ?? 0,
      cancelledCount:
        groups.find((g) => g.status === OrderStatus.CANCELLED)?._count._all ??
        0,
      collected: Number(paid?._sum.finalAmount ?? 0),
      vat: Number(paid?._sum.taxAmount ?? 0),
    };
  }

  private async listWhere(
    user: AuthUser,
    query: ListOrdersQuery,
  ): Promise<Prisma.OrderWhereInput> {
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
    return where;
  }

  async findOne(user: AuthUser, id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
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
      if (user.role === Role.STAFF) {
        if (!isServerOf(user, order)) {
          throw new ForbiddenException(SERVE_FORBIDDEN);
        }
        // The server only orders: the CSKH / server of the room are not
        // theirs (discounts and VAT go through /adjustments, closed to them).
        const onlyItems = Object.entries(dto).every(
          ([key, value]) => key === 'items' || value === undefined,
        );
        if (!onlyItems) {
          throw new ForbiddenException('Phục vụ chỉ được gọi món');
        }
      }
      await this.assertFloorStaff(tx, order.branchId, [
        dto.cskhId,
        dto.serverId,
      ]);

      const { items, ...fields } = dto;
      const data: Prisma.OrderUncheckedUpdateInput = { ...fields };

      if (items) {
        const lines = await this.resolveLines(tx, order, items);
        data.items = { deleteMany: {}, create: lines };
        data.totalProductPrice = lines.reduce(
          (sum, l) => sum + Number(l.price) * l.quantity,
          0,
        );
      }

      return tx.order.update({
        where: { id },
        data,
        include: orderDetailInclude,
      });
    });
  }

  // New item lines of an order: duplicates merged, each product keeps the
  // price it was ordered at, new ones take the current price.
  private async resolveLines(
    tx: Db,
    order: {
      branchId: number;
      items: { productId: number; price: Prisma.Decimal }[];
    },
    items: OrderItemDto[],
  ) {
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

    return [...quantities].map(([productId, quantity]) => {
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
  }

  // Live bill for an open session; closed bills show what was stored.
  async preview(user: AuthUser, id: number) {
    const order = await this.findOne(user, id);
    if (order.status !== OrderStatus.PENDING) {
      const minutes =
        order.startTime && order.endTime
          ? (order.endTime.getTime() - order.startTime.getTime()) / 60000
          : 0;
      const durationMinutes = Math.max(0, Math.ceil(minutes));
      return {
        ...order,
        durationMinutes,
        billedHours: billedHoursOf(durationMinutes),
        hourlyFee: Number(order.hourlyFee),
        totalProductPrice: Number(order.totalProductPrice),
        discountAmount: Number(order.discountAmount),
        hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
        totalBeforeTax: Number(order.finalAmount) - Number(order.taxAmount),
        taxAmount: Number(order.taxAmount),
        finalAmount: Number(order.finalAmount),
      };
    }
    const endTime = billedEndOf(order, new Date());
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
        await assertNoPendingRequest(tx, id);

        // A locked session ends when it was locked: the bill's duration, its
        // business day, number and fund receipt all use that moment.
        const endTime = billedEndOf(order, new Date());
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
            ...billAmounts(bill),
            paymentMethod: method,
            checkedOutById: user.id,
          },
        });
        await closeOpenPrSessions(tx, id, endTime);

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
        await this.snapshotItemCosts(tx, order.id);

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
          include: orderDetailInclude,
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
      await expirePendingRequests(tx, id, now);
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
      await closeOpenPrSessions(tx, id, now);
      if (order.roomId) {
        await tx.room.update({
          where: { id: order.roomId },
          data: { status: RoomStatus.AVAILABLE },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderDetailInclude,
      });
    });
  }

  // Chốt giờ: the room fee stops now; PR/KTV still in the room leave now.
  // Sales roles, and the server assigned to the session.
  lockTime(user: AuthUser, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(
        tx,
        user,
        id,
        OrderStatus.PENDING,
        'Phòng đã đóng',
      );
      if (user.role === Role.STAFF && !isServerOf(user, order)) {
        throw new ForbiddenException(SERVE_FORBIDDEN);
      }
      if (order.timeLockedAt) {
        throw new ConflictException('Phòng đã chốt giờ');
      }
      const now = new Date();
      await tx.order.update({
        where: { id },
        data: { timeLockedAt: now, timeLockedById: user.id },
      });
      await closeOpenPrSessions(tx, id, now);
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderDetailInclude,
      });
    });
  }

  // The clock runs again from the start time (the locked gap is billed).
  // Logged: who unlocked, when, and when it had been locked.
  unlockTime(user: AuthUser, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(
        tx,
        user,
        id,
        OrderStatus.PENDING,
        'Phòng đã đóng',
      );
      if (!order.timeLockedAt) {
        throw new ConflictException('Phòng chưa chốt giờ');
      }
      await tx.order.update({
        where: { id },
        data: { timeLockedAt: null, timeLockedById: null },
      });
      await tx.orderEvent.create({
        data: {
          branchId: order.branchId,
          orderId: id,
          type: OrderEventType.TIME_UNLOCK,
          lockedAt: order.timeLockedAt,
          createdById: user.id,
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderDetailInclude,
      });
    });
  }

  // Chain manager only: void a paid bill. The sold goods go back to stock and the
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

        // Put back exactly what the bill took out (checkout and later
        // corrections), at the cost it left at.
        const taken = await this.stockTakenBy(tx, id);
        for (const [productId, entry] of taken) {
          if (entry.quantity <= 0) continue;
          await this.inventory.applyMovement(tx, {
            branchId: order.branchId,
            productId,
            type: StockMovementType.REVERSAL,
            quantity: entry.quantity,
            unitCost: unitCostOf(entry),
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
          include: orderDetailInclude,
        });
      },
      { timeout: 15000 },
    );
  }

  // Chain manager only: correct a paid bill (items, adjustments, staff, times,
  // price, payment method). The bill is recomputed; stock follows the new
  // quantities and the fund receipt the new total, method and payment time,
  // so revenue, stock and fund stay in step. The room fee that was charged
  // is kept unless the times or the price change.
  editPaid(user: AuthUser, id: number, dto: EditPaidOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(
          tx,
          user,
          id,
          OrderStatus.COMPLETED,
          'Chỉ sửa được hóa đơn đã thanh toán',
        );
        await this.assertFloorStaff(tx, order.branchId, [
          dto.cskhId,
          dto.serverId,
        ]);
        if (!order.startTime || !order.endTime) {
          throw new BadRequestException('Hóa đơn không có giờ vào/giờ ra');
        }

        const {
          items,
          reason,
          startTime: newStart,
          endTime: newEnd,
          pricePerHour: newPrice,
          paymentMethod,
          ...rest
        } = dto;
        const fields = sentFields(rest);
        const startTime = newStart ? new Date(newStart) : order.startTime;
        const endTime = newEnd ? new Date(newEnd) : order.endTime;
        if (endTime <= startTime) {
          throw new BadRequestException('Giờ ra phải sau giờ vào');
        }
        if (endTime > new Date()) {
          throw new BadRequestException('Giờ ra không được ở tương lai');
        }
        const pricePerHour = newPrice ?? Number(order.pricePerHour);
        const roomFeeChanged =
          startTime.getTime() !== order.startTime.getTime() ||
          endTime.getTime() !== order.endTime.getTime() ||
          pricePerHour !== Number(order.pricePerHour);

        const lines = items
          ? await this.resolveLines(tx, order, items)
          : order.items;
        const bill = computeBill({
          startTime,
          endTime,
          pricePerHour,
          items: lines.map((l) => ({
            price: Number(l.price),
            quantity: l.quantity,
          })),
          ...adjustmentsOf(order),
          ...fields,
          hourlyFee: roomFeeChanged ? undefined : Number(order.hourlyFee),
        });
        const method =
          paymentMethod ?? order.paymentMethod ?? PaymentMethod.CASH;

        await tx.order.update({
          where: { id },
          data: {
            ...fields,
            ...(items && {
              items: {
                deleteMany: {},
                create: lines.map(({ productId, quantity, price }) => ({
                  productId,
                  quantity,
                  price,
                })),
              },
            }),
            startTime,
            endTime,
            pricePerHour,
            ...billAmounts(bill),
            paymentMethod: method,
            editedAt: new Date(),
            editedById: user.id,
            editReason: reason.trim(),
          },
        });

        await this.syncSoldStock(tx, order.branchId, id, user.id);
        await this.snapshotItemCosts(tx, id);
        await syncSaleReceipt(
          tx,
          {
            branchId: order.branchId,
            orderId: id,
            billNumber: order.billNumber ?? `#${id}`,
            amount: bill.finalAmount,
            method,
            occurredAt: endTime,
            roomName: order.room?.name,
            createdById: user.id,
          },
          Number(order.finalAmount) === 0,
        );

        return tx.order.findUniqueOrThrow({
          where: { id },
          include: orderDetailInclude,
        });
      },
      { timeout: 15000 },
    );
  }

  // What a bill took from stock, per product in id order: the net quantity
  // and its cost (Σ −quantity × unitCost of the bill's movements).
  private async stockTakenBy(tx: Db, orderId: number) {
    const movements = await tx.stockMovement.findMany({
      where: { orderId },
      select: { productId: true, quantity: true, unitCost: true },
      orderBy: [{ productId: 'asc' }, { id: 'asc' }],
    });
    const taken = new Map<number, { quantity: number; value: number }>();
    for (const m of movements) {
      const entry = taken.get(m.productId) ?? { quantity: 0, value: 0 };
      entry.quantity -= m.quantity;
      entry.value -= m.quantity * Number(m.unitCost);
      taken.set(m.productId, entry);
    }
    return taken;
  }

  // Puts on each line of a bill the cost per unit of what the bill took from
  // stock (0 for products without stock tracking), so the reports' cost of
  // goods sold is Σ quantity × unitCost. Divides by the bill's own item
  // quantity (not the stock taken) so a bill correction after a product's
  // tracking was turned off still reports the value stock actually gave,
  // even though syncSoldStock can no longer true up the taken quantity to
  // match the item quantity for that product.
  private async snapshotItemCosts(tx: Db, orderId: number) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });
    const wanted = new Map<number, number>();
    for (const item of items) {
      wanted.set(
        item.productId,
        (wanted.get(item.productId) ?? 0) + item.quantity,
      );
    }
    const taken = await this.stockTakenBy(tx, orderId);
    for (const productId of new Set(items.map((item) => item.productId))) {
      const entry = taken.get(productId);
      const quantity = wanted.get(productId) ?? 0;
      const unitCost =
        entry && entry.quantity > 0 && quantity > 0
          ? roundCost(entry.value / quantity)
          : 0;
      await tx.orderItem.updateMany({
        where: { orderId, productId },
        data: { unitCost },
      });
    }
  }

  // Brings the stock taken by a paid bill in line with its items: more of a
  // product is sold (SALE, at the current average), less is put back
  // (REVERSAL, at the cost the bill took it at). Products that are no longer
  // stock-tracked are left alone. Locks rows by product id, as checkout
  // does.
  private async syncSoldStock(
    tx: Db,
    branchId: number,
    orderId: number,
    userId: number,
  ) {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    const wanted = new Map<number, number>();
    for (const item of items) {
      wanted.set(
        item.productId,
        (wanted.get(item.productId) ?? 0) + item.quantity,
      );
    }
    const taken = await this.stockTakenBy(tx, orderId);
    const ids = [...new Set([...wanted.keys(), ...taken.keys()])];
    const tracked = new Set(
      (
        await tx.product.findMany({
          where: { id: { in: ids }, trackStock: true },
          select: { id: true },
        })
      ).map((p) => p.id),
    );

    for (const productId of ids.sort((a, b) => a - b)) {
      if (!tracked.has(productId)) continue;
      const delta =
        (wanted.get(productId) ?? 0) - (taken.get(productId)?.quantity ?? 0);
      if (delta === 0) continue;
      await this.inventory.applyMovement(tx, {
        branchId,
        productId,
        type: delta > 0 ? StockMovementType.SALE : StockMovementType.REVERSAL,
        quantity: -delta,
        unitCost: unitCostOf(taken.get(productId)),
        orderId,
        createdById: userId,
        allowNegative: true,
      });
    }
  }
}
