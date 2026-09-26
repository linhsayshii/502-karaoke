import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  Role,
  RoomStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { getBusinessDayRange } from '../common/dates';
import { InventoryService } from '../inventory/inventory.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ListOrdersQuery, StatisticsQuery } from './dto/order-queries';
import { computeBill } from './billing';

const staffRef = { select: { id: true, fullName: true } };
const orderInclude = {
  room: true,
  cskh: staffRef,
  server: staffRef,
  createdBy: staffRef,
  checkedOutBy: staffRef,
  items: { include: { product: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

type Db = Prisma.TransactionClient;

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

  // Opens a room session: room must belong to the branch and be free.
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

  async findAll(user: AuthUser, query: ListOrdersQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const where: Prisma.OrderWhereInput = { branchId, status: query.status };

    if (query.businessDate) {
      const { start, end } = getBusinessDayRange(query.businessDate);
      where.startTime = { gte: start, lt: end };
    }
    if (user.role === Role.STAFF) {
      where.status = OrderStatus.PENDING;
      where.OR = [{ serverId: user.id }, { cskhId: user.id }];
    }

    return this.prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { startTime: 'desc' },
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
    const order = await this.findOne(user, id);
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('Hóa đơn đã đóng, không thể sửa');
    }
    await this.assertFloorStaff(this.prisma, order.branchId, [
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

      const products = await this.prisma.product.findMany({
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

    return this.prisma.order.update({
      where: { id, status: OrderStatus.PENDING },
      data,
      include: orderInclude,
    });
  }

  // Live bill for an open session; closed bills use their stored end time.
  async preview(user: AuthUser, id: number) {
    const order = await this.findOne(user, id);
    if (!order.startTime) {
      throw new BadRequestException('Hóa đơn chưa bắt đầu tính giờ');
    }

    const endTime =
      order.status === OrderStatus.PENDING || !order.endTime
        ? new Date()
        : order.endTime;
    const bill = computeBill({
      startTime: order.startTime,
      endTime,
      pricePerHour: Number(order.room?.pricePerHour ?? 0),
      items: order.items.map((i) => ({
        price: Number(i.price),
        quantity: i.quantity,
      })),
      discountAmount: Number(order.discountAmount),
      hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
      serviceFeeAmount: Number(order.serviceFeeAmount),
      taxPercent: order.taxPercent,
    });

    return { ...order, endTime, ...bill };
  }

  // Closes the bill, frees the room and deducts sold items from stock —
  // all or nothing.
  checkout(user: AuthUser, id: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          include: { room: true, items: { include: { product: true } } },
        });
        if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
        this.branchScope.assertBranchAccess(user, order.branchId);
        if (order.status !== OrderStatus.PENDING) {
          throw new ConflictException('Hóa đơn đã được thanh toán hoặc đã hủy');
        }
        if (!order.startTime) {
          throw new BadRequestException('Hóa đơn chưa bắt đầu tính giờ');
        }

        const endTime = new Date();
        const bill = computeBill({
          startTime: order.startTime,
          endTime,
          pricePerHour: Number(order.room?.pricePerHour ?? 0),
          items: order.items.map((i) => ({
            price: Number(i.price),
            quantity: i.quantity,
          })),
          discountAmount: Number(order.discountAmount),
          hourlyDiscountAmount: Number(order.hourlyDiscountAmount),
          serviceFeeAmount: Number(order.serviceFeeAmount),
          taxPercent: order.taxPercent,
        });

        const { count } = await tx.order.updateMany({
          where: { id, status: OrderStatus.PENDING },
          data: {
            status: OrderStatus.COMPLETED,
            endTime,
            hourlyFee: bill.hourlyFee,
            totalProductPrice: bill.totalProductPrice,
            taxAmount: bill.taxAmount,
            finalAmount: bill.finalAmount,
            checkedOutById: user.id,
          },
        });
        if (count === 0) {
          throw new ConflictException('Hóa đơn đã được thanh toán hoặc đã hủy');
        }

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
        for (const [productId, quantity] of sold) {
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

        return tx.order.findUniqueOrThrow({
          where: { id },
          include: orderInclude,
        });
      },
      { timeout: 15000 },
    );
  }

  // Managers only: drop an open session without billing it.
  cancel(user: AuthUser, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
      this.branchScope.assertBranchAccess(user, order.branchId);

      const { count } = await tx.order.updateMany({
        where: { id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED, endTime: new Date() },
      });
      if (count === 0) {
        throw new ConflictException('Chỉ hủy được hóa đơn đang mở');
      }
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

  // Per business day: number of completed bills and revenue.
  async getStatistics(user: AuthUser, query: StatisticsQuery) {
    const branchId = await this.branchScope.resolveBranchId(user, query.branch);
    const stats: { date: string; orderCount: number; totalRevenue: number }[] =
      [];
    const current = new Date(`${query.from}T00:00:00`);
    const endDate = new Date(`${query.to}T00:00:00`);
    if (isNaN(current.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Ngày không hợp lệ (định dạng YYYY-MM-DD)');
    }

    while (current <= endDate) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
      const { start, end } = getBusinessDayRange(dateStr);

      const result = await this.prisma.order.aggregate({
        where: {
          branchId,
          status: OrderStatus.COMPLETED,
          startTime: { gte: start, lt: end },
        },
        _count: true,
        _sum: { finalAmount: true },
      });

      stats.push({
        date: dateStr,
        orderCount: result._count,
        totalRevenue: Number(result._sum.finalAmount ?? 0),
      });
      current.setDate(current.getDate() + 1);
    }
    return stats;
  }
}
