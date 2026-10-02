import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurgeScope } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth-user';
import { LoginThrottle } from '../auth/login-throttle';
import { PurgeDataDto } from './purge.dto';

// A wipe of the whole system may take a while on a big database.
const PURGE_TIMEOUT_MS = 10 * 60 * 1000;
const LOG_LIMIT = 500;

// Wipes the business data of one branch or of the whole system. Branches and
// accounts stay (so nobody is locked out); everything the branches recorded
// or set up goes: bills (with their discount requests and time-unlock log),
// stock, fund, catalog, rooms and the PR/KTV list with its roll call. Every
// purge, and every attempt refused for a wrong password, is written to
// DataPurgeLog.
@Injectable()
export class DataPurgeService {
  private throttle = new LoginThrottle();

  constructor(private prisma: PrismaService) {}

  async purge(actor: AuthUser, dto: PurgeDataDto, userAgent?: string) {
    const scope = dto.scope === 'all' ? PurgeScope.ALL : PurgeScope.BRANCH;
    let branch: { id: number; code: string; name: string } | null = null;
    if (scope === PurgeScope.BRANCH) {
      if (!dto.branch) throw new BadRequestException('Vui lòng chọn cơ sở');
      branch = await this.prisma.branch.findUnique({
        where: { code: dto.branch },
        select: { id: true, code: true, name: true },
      });
      if (!branch) throw new NotFoundException('Không tìm thấy cơ sở');
    }
    const entry = {
      userId: actor.id,
      username: actor.username,
      fullName: actor.fullName,
      scope,
      branchCode: branch?.code ?? null,
      branchName: branch?.name ?? null,
      userAgent: userAgent?.slice(0, 500) ?? null,
    };

    const key = `purge:${actor.id}`;
    this.throttle.assertAllowed(key, 'Nhập sai mật khẩu');
    const account = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { password: true },
    });
    const ok =
      !!account?.password &&
      (await bcrypt.compare(dto.password, account.password));
    if (!ok) {
      this.throttle.recordFailure(key);
      await this.prisma.dataPurgeLog.create({
        data: { ...entry, success: false },
      });
      // Not 401: the browser would take it for an expired session.
      throw new ForbiddenException('Mật khẩu không đúng');
    }
    this.throttle.recordSuccess(key);

    const branchId = branch?.id;
    const own = branchId === undefined ? {} : { branchId };
    const viaOrder =
      branchId === undefined ? {} : { order: { is: { branchId } } };
    const viaDocument =
      branchId === undefined ? {} : { document: { is: { branchId } } };

    // The wipe and its log entry commit together or not at all.
    const deleted = await this.prisma.$transaction(
      async (tx) => {
        // Children before parents (foreign keys).
        const counts = {
          fundTransactions: (
            await tx.fundTransaction.deleteMany({ where: own })
          ).count,
          stockMovements: (await tx.stockMovement.deleteMany({ where: own }))
            .count,
          // Before orders: both point at an order.
          discountRequests: (
            await tx.discountRequest.deleteMany({ where: own })
          ).count,
          orderEvents: (await tx.orderEvent.deleteMany({ where: own })).count,
          // Before orders: an e-invoice points at its bill.
          einvoices: (await tx.einvoice.deleteMany({ where: own })).count,
          // After e-invoices, before rooms (a bill thêm tay points at both).
          manualBills: (await tx.manualBill.deleteMany({ where: own })).count,
          orderItems: (await tx.orderItem.deleteMany({ where: viaOrder }))
            .count,
          // Before orders: a visit points at an order and a PR.
          prSessions: (await tx.prSession.deleteMany({ where: own })).count,
          orders: (await tx.order.deleteMany({ where: own })).count,
          stockDocumentLines: (
            await tx.stockDocumentLine.deleteMany({ where: viaDocument })
          ).count,
          stockDocuments: (await tx.stockDocument.deleteMany({ where: own }))
            .count,
          billCounters: (await tx.billCounter.deleteMany({ where: own })).count,
          reportCounters: (await tx.reportCounter.deleteMany({ where: own }))
            .count,
          prAttendances: (await tx.prAttendance.deleteMany({ where: own }))
            .count,
          prStaff: (await tx.prStaff.deleteMany({ where: own })).count,
          products: (await tx.product.deleteMany({ where: own })).count,
          categories: (await tx.category.deleteMany({ where: own })).count,
          rooms: (await tx.room.deleteMany({ where: own })).count,
        };
        await tx.dataPurgeLog.create({
          data: { ...entry, success: true, deleted: counts },
        });
        return counts;
      },
      { timeout: PURGE_TIMEOUT_MS, maxWait: 30_000 },
    );

    return {
      message: branch
        ? `Đã xóa toàn bộ dữ liệu của ${branch.name}`
        : 'Đã xóa toàn bộ dữ liệu hệ thống',
      deleted,
    };
  }

  // Newest first.
  logs() {
    return this.prisma.dataPurgeLog.findMany({
      orderBy: { id: 'desc' },
      take: LOG_LIMIT,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        username: true,
        fullName: true,
        scope: true,
        branchCode: true,
        branchName: true,
        success: true,
        deleted: true,
        userAgent: true,
      } satisfies Prisma.DataPurgeLogSelect,
    });
  }
}
