import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EinvoiceStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf } from '../common/dates';
import { draftData } from '../einvoice/einvoice-draft';
import { dbDay } from '../einvoice/einvoice-filters';
import { nextBillNumberOn } from '../orders/bill-number';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelManualBillDto,
  CreateManualBillDto,
} from './dto/manual-bill.dto';

// Bills thêm tay (spec 2026-10-02-trang-bao-cao-hddt §4.1, §6.1): made on the
// report site only to issue e-invoices, numbered in the branch's sequence of
// their day. Nothing of the main site reads them.
@Injectable()
export class ManualBillsService {
  constructor(
    private prisma: PrismaService,
    private scope: BranchScopeService,
  ) {}

  async create(user: AuthUser, dto: CreateManualBillDto, branch?: string) {
    const branchId = await this.scope.resolveBranchId(user, branch);
    dbDay(dto.businessDate);
    if (dto.businessDate > businessDateOf(new Date())) {
      throw new BadRequestException('Không thêm bill cho ngày sau hôm nay');
    }
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      select: { branchId: true, name: true },
    });
    if (!room || room.branchId !== branchId) {
      throw new BadRequestException('Phòng không thuộc cơ sở này');
    }
    // Short: the day's BillCounter row stays locked until this commits, as
    // in a checkout of the same day.
    return this.prisma.$transaction(async (tx) => {
      const number = await nextBillNumberOn(
        tx,
        branchId,
        dto.businessDate,
        room.name,
      );
      const bill = await tx.manualBill.create({
        data: { branchId, ...number, roomId: dto.roomId, createdById: user.id },
        select: { id: true, billNumber: true },
      });
      const draft = await tx.einvoice.create({
        data: {
          branchId,
          manualBillId: bill.id,
          businessDate: number.businessDate,
          // The day of the bill is its invoice date until the draft says
          // otherwise (spec §4.2).
          invoiceDate: number.businessDate,
          createdById: user.id,
          updatedById: user.id,
          ...draftData({ amount: dto.amount, lines: [] }),
        },
        select: { id: true },
      });
      return {
        id: bill.id,
        billNumber: bill.billNumber,
        businessDate: dto.businessDate,
        einvoiceId: draft.id,
      };
    });
  }

  // Its drafts go with it; a bill holding an invoice sent, uncertain or
  // issued stays, as that invoice is (or may be) on Minvoice. The number is
  // never handed out again.
  async cancel(user: AuthUser, id: number, dto: CancelManualBillDto) {
    const bill = await this.prisma.manualBill.findUnique({
      where: { id },
      select: { branchId: true },
    });
    if (!bill) throw new NotFoundException('Không tìm thấy bill');
    this.scope.assertBranchAccess(user, bill.branchId);
    await this.prisma.$transaction(async (tx) => {
      // The write locks the bill: a draft being added to it waits
      // (EinvoicesService locks it too) and finds it cancelled.
      const { count } = await tx.manualBill.updateMany({
        where: { id, cancelledAt: null },
        data: {
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: dto.reason.trim(),
        },
      });
      if (count === 0) throw new ConflictException('Bill đã hủy');
      await tx.einvoice.deleteMany({
        where: { manualBillId: id, status: EinvoiceStatus.DRAFT },
      });
      // An issue that locked its draft first keeps it (DRAFT → SENDING).
      const left = await tx.einvoice.count({ where: { manualBillId: id } });
      if (left > 0) {
        throw new ConflictException(
          'Bill có hóa đơn đã gửi hoặc đã xuất, không hủy được',
        );
      }
    });
    return { id };
  }
}
