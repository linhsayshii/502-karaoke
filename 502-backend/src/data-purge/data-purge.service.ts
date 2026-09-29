import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { LoginThrottle } from '../auth/login-throttle';
import { PurgeDataDto } from './purge.dto';

// Wipes the business data of one branch or of the whole system. Branches and
// accounts stay (so nobody is locked out); everything the branches recorded
// or set up goes: bills, stock, fund, catalog and rooms.
@Injectable()
export class DataPurgeService {
  private throttle = new LoginThrottle();

  constructor(private prisma: PrismaService) {}

  async purge(actor: AuthUser, dto: PurgeDataDto) {
    const key = `purge:${actor.id}`;
    this.throttle.assertAllowed(key);
    const account = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { password: true },
    });
    const ok =
      !!account?.password &&
      (await bcrypt.compare(dto.password, account.password));
    if (!ok) {
      this.throttle.recordFailure(key);
      // Not 401: the browser would take it for an expired session.
      throw new ForbiddenException('Mật khẩu không đúng');
    }
    this.throttle.recordSuccess(key);

    let branchId: number | undefined;
    if (dto.scope === 'branch') {
      if (!dto.branch) throw new BadRequestException('Vui lòng chọn cơ sở');
      const branch = await this.prisma.branch.findUnique({
        where: { code: dto.branch },
      });
      if (!branch) throw new NotFoundException('Không tìm thấy cơ sở');
      branchId = branch.id;
    }

    const own = branchId === undefined ? {} : { branchId };
    const viaOrder =
      branchId === undefined ? {} : { order: { is: { branchId } } };
    const viaDocument =
      branchId === undefined ? {} : { document: { is: { branchId } } };
    const [funds, movements, items, orders, lines, documents] =
      await this.prisma.$transaction([
        this.prisma.fundTransaction.deleteMany({ where: own }),
        this.prisma.stockMovement.deleteMany({ where: own }),
        this.prisma.orderItem.deleteMany({ where: viaOrder }),
        this.prisma.order.deleteMany({ where: own }),
        this.prisma.stockDocumentLine.deleteMany({ where: viaDocument }),
        this.prisma.stockDocument.deleteMany({ where: own }),
        this.prisma.billCounter.deleteMany({ where: own }),
        this.prisma.product.deleteMany({ where: own }),
        this.prisma.category.deleteMany({ where: own }),
        this.prisma.room.deleteMany({ where: own }),
      ]);
    return {
      message:
        branchId === undefined
          ? 'Đã xóa toàn bộ dữ liệu hệ thống'
          : `Đã xóa toàn bộ dữ liệu cơ sở ${dto.branch}`,
      deleted: {
        orders: orders.count,
        orderItems: items.count,
        stockDocuments: documents.count,
        stockDocumentLines: lines.count,
        stockMovements: movements.count,
        fundTransactions: funds.count,
      },
    };
  }
}
