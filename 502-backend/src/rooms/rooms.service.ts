import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role, RoomStatus } from '@prisma/client';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';

const staffRef = { select: { id: true, fullName: true } };
const roomInclude = {
  orders: {
    where: { status: OrderStatus.PENDING },
    take: 1,
    select: {
      id: true,
      startTime: true,
      cskhId: true,
      serverId: true,
      cskh: staffRef,
      server: staffRef,
    },
  },
} satisfies Prisma.RoomInclude;

type RoomWithOrders = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

// Flattens the active session onto the room (startTime/activeOrderId kept
// for the room map).
function withActiveOrder({ orders, ...room }: RoomWithOrders) {
  const activeOrder = orders[0] ?? null;
  return {
    ...room,
    activeOrder,
    activeOrderId: activeOrder?.id,
    startTime: activeOrder?.startTime,
  };
}

// Staff only see rooms whose running session they serve.
export function servingFilter(user: AuthUser): Prisma.OrderWhereInput {
  return {
    status: OrderStatus.PENDING,
    OR: [{ serverId: user.id }, { cskhId: user.id }],
  };
}

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private branchScope: BranchScopeService,
  ) {}

  async create(
    user: AuthUser,
    branchCode: string | undefined,
    dto: CreateRoomDto,
  ) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    return this.prisma.room.create({ data: { ...dto, branchId } });
  }

  async findAll(user: AuthUser, branchCode?: string) {
    const branchId = await this.branchScope.resolveBranchId(user, branchCode);
    const rooms = await this.prisma.room.findMany({
      where: {
        branchId,
        ...(user.role === Role.STAFF && {
          orders: { some: servingFilter(user) },
        }),
      },
      orderBy: { name: 'asc' },
      include: roomInclude,
    });
    return rooms.map(withActiveOrder);
  }

  async findOne(user: AuthUser, id: number) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: roomInclude,
    });
    if (!room) throw new NotFoundException('Không tìm thấy phòng');
    this.branchScope.assertBranchAccess(user, room.branchId);

    const result = withActiveOrder(room);
    if (
      user.role === Role.STAFF &&
      result.activeOrder?.serverId !== user.id &&
      result.activeOrder?.cskhId !== user.id
    ) {
      throw new ForbiddenException('Bạn chỉ xem được phòng mình đang phục vụ');
    }
    return result;
  }

  private async getRoom(user: AuthUser, id: number) {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) throw new NotFoundException('Không tìm thấy phòng');
    this.branchScope.assertBranchAccess(user, room.branchId);
    return room;
  }

  // The price of an open session is fixed when it opens, so editing the room
  // never changes a running bill. The status only changes while no session
  // runs (checked in the same statement, so a room opened meanwhile wins).
  async update(user: AuthUser, id: number, dto: UpdateRoomDto) {
    const room = await this.getRoom(user, id);
    if (dto.status && dto.status !== room.status) {
      const { count } = await this.prisma.room.updateMany({
        where: { id, status: { not: RoomStatus.ACTIVE } },
        data: dto,
      });
      if (count === 0) {
        throw new ConflictException(
          'Phòng đang có khách, không thể đổi trạng thái',
        );
      }
      return this.prisma.room.findUniqueOrThrow({ where: { id } });
    }
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async remove(user: AuthUser, id: number) {
    await this.getRoom(user, id);
    const orderCount = await this.prisma.order.count({ where: { roomId: id } });
    if (orderCount > 0) {
      throw new ConflictException(
        'Phòng đã có lịch sử hóa đơn, không thể xóa. Hãy chuyển sang trạng thái bảo trì.',
      );
    }
    return this.prisma.room.delete({ where: { id } });
  }
}
