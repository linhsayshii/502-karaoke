import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EinvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf, fromDbDate, toDbDate } from '../common/dates';
import { billNumberPrefixRange } from '../orders/bill-number';
import { billedHoursOf } from '../orders/billing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import {
  CreateEinvoiceDto,
  EinvoiceBillsQuery,
  EinvoiceDraftDto,
  EinvoiceListQuery,
} from './dto/einvoice.dto';
import { totalsOf } from './einvoice-math';
import {
  einvoiceDetailSelect,
  einvoiceListSelect,
  toEinvoiceRow,
} from './einvoice-select';
import type { EinvoiceDraft, EinvoiceLine } from './einvoice-types';

const clean = (value: string | null | undefined) => value?.trim() || null;

// The columns a saved draft writes (spec §4.1): the details go in `draft`.
function draftData(dto: EinvoiceDraftDto) {
  const lines: EinvoiceLine[] = dto.lines.map((line) => ({
    name: line.name.trim(),
    unit: line.unit.trim(),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    ...(line.vatAmount === undefined ? {} : { vatAmount: line.vatAmount }),
  }));
  const draft: EinvoiceDraft = {
    buyerAddress: clean(dto.buyerAddress),
    buyerEmail: clean(dto.buyerEmail),
    lines,
  };
  return {
    amount: dto.amount,
    vatAmount: totalsOf(lines).vatAmount,
    buyerTaxCode: clean(dto.buyerTaxCode),
    buyerName: clean(dto.buyerName),
    draft: draft as unknown as Prisma.InputJsonObject,
  };
}

// A YYYY-MM-DD as a @db.Date value. The DTO only checks the shape: a day that
// does not exist (2026-13-01 fails in Prisma, 2026-02-30 rolls into March) is
// refused here.
function dbDay(value: string): Date {
  const date = toDbDate(value);
  if (isNaN(date.getTime()) || fromDbDate(date) !== value) {
    throw new BadRequestException('Ngày không hợp lệ (định dạng YYYY-MM-DD)');
  }
  return date;
}

function dateRange(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  if (from && to && from > to) {
    throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  }
  return {
    ...(from ? { gte: dbDay(from) } : {}),
    ...(to ? { lte: dbDay(to) } : {}),
  };
}

@Injectable()
export class EinvoicesService {
  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
    private scope: BranchScopeService,
  ) {}

  // Newest bills first, the newest 500 (spec §7.3).
  async list(user: AuthUser, query: EinvoiceListQuery) {
    const where = await this.listWhere(user, query);
    const [rows, total] = await Promise.all([
      this.prisma.einvoice.findMany({
        where,
        select: einvoiceListSelect,
        orderBy: [{ businessDate: 'desc' }, { orderId: 'desc' }, { id: 'asc' }],
        take: 500,
      }),
      this.prisma.einvoice.count({ where }),
    ]);
    const mapped = rows.map(toEinvoiceRow);
    return [mapped, total] as [typeof mapped, number];
  }

  // Pending work counts every day; issued ones the chosen days. Summed in SQL
  // on the report pool.
  async summary(user: AuthUser, query: EinvoiceListQuery) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const businessDate = dateRange(query.from, query.to);
    const [draftCount, errorCount, uncertainCount, issued] = await Promise.all([
      this.reportDb.einvoice.count({
        where: { branchId, status: EinvoiceStatus.DRAFT, lastError: null },
      }),
      this.reportDb.einvoice.count({
        where: {
          branchId,
          status: EinvoiceStatus.DRAFT,
          lastError: { not: null },
        },
      }),
      this.reportDb.einvoice.count({
        where: { branchId, status: EinvoiceStatus.UNCERTAIN },
      }),
      this.reportDb.einvoice.aggregate({
        where: { branchId, status: EinvoiceStatus.ISSUED, businessDate },
        _count: { _all: true },
        _sum: { amount: true, vatAmount: true },
      }),
    ]);
    return {
      draftCount,
      errorCount,
      uncertainCount,
      issuedCount: issued._count._all,
      issuedAmount: Number(issued._sum.amount ?? 0),
      issuedVat: Number(issued._sum.vatAmount ?? 0),
    };
  }

  // Paid bills of a business day for the picker, with what is split already.
  async bills(user: AuthUser, query: EinvoiceBillsQuery) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const where: Prisma.OrderWhereInput = {
      branchId,
      status: OrderStatus.COMPLETED,
    };
    if (query.billNumber) {
      where.billNumber = billNumberPrefixRange(query.billNumber);
    } else {
      where.businessDate = dbDay(
        query.businessDate ?? businessDateOf(new Date()),
      );
    }
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          billNumber: true,
          finalAmount: true,
          endTime: true,
          room: { select: { name: true } },
        },
        orderBy: { endTime: 'desc' },
        take: 500,
      }),
      this.prisma.order.count({ where }),
    ]);
    // Einvoice(orderId) index.
    const sums =
      orders.length === 0
        ? []
        : await this.prisma.einvoice.groupBy({
            by: ['orderId'],
            where: { orderId: { in: orders.map((o) => o.id) } },
            _sum: { amount: true },
            _count: { _all: true },
          });
    const byOrder = new Map(sums.map((sum) => [sum.orderId, sum]));
    const rows = orders.map((order) => ({
      orderId: order.id,
      billNumber: order.billNumber,
      roomName: order.room?.name ?? null,
      endTime: order.endTime,
      finalAmount: order.finalAmount,
      allocated: Number(byOrder.get(order.id)?._sum.amount ?? 0),
      einvoiceCount: byOrder.get(order.id)?._count._all ?? 0,
    }));
    return [rows, total] as [typeof rows, number];
  }

  // A bill with its e-invoices (and their drafts) for the panel.
  async billDetail(user: AuthUser, orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        branchId: true,
        status: true,
        billNumber: true,
        startTime: true,
        endTime: true,
        finalAmount: true,
        taxAmount: true,
        taxPercent: true,
        pricePerHour: true,
        hourlyFee: true,
        discountAmount: true,
        hourlyDiscountAmount: true,
        cancelledAt: true,
        editedAt: true,
        room: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            price: true,
            product: { select: { name: true, unit: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.scope.assertBranchAccess(user, order.branchId);
    if (order.status === OrderStatus.PENDING) {
      throw new BadRequestException('Phòng chưa thanh toán');
    }

    const [einvoices, allocated] = await Promise.all([
      // A bill split into more than 200 invoices is not a real case; the cap
      // keeps the answer bounded.
      this.prisma.einvoice.findMany({
        where: { orderId },
        select: einvoiceDetailSelect,
        orderBy: { id: 'asc' },
        take: 200,
      }),
      this.prisma.einvoice.aggregate({
        where: { orderId },
        _sum: { amount: true },
      }),
    ]);
    const minutes =
      order.startTime && order.endTime
        ? Math.max(
            0,
            Math.ceil(
              (order.endTime.getTime() - order.startTime.getTime()) / 60_000,
            ),
          )
        : 0;
    const { items, ...bill } = order;
    return {
      order: {
        ...bill,
        billedHours: billedHoursOf(minutes),
        items: items.map((item) => ({
          name: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
          price: item.price,
        })),
      },
      einvoices: einvoices.map(toEinvoiceRow),
      allocated: Number(allocated._sum.amount ?? 0),
    };
  }

  async findOne(user: AuthUser, id: number) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: einvoiceDetailSelect,
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    return toEinvoiceRow(row);
  }

  async create(user: AuthUser, dto: CreateEinvoiceDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, branchId: true, status: true, businessDate: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.scope.assertBranchAccess(user, order.branchId);
    if (order.status !== OrderStatus.COMPLETED || !order.businessDate) {
      throw new BadRequestException(
        'Chỉ tạo hóa đơn điện tử cho bill đã thanh toán và chưa hủy',
      );
    }
    const created = await this.prisma.einvoice.create({
      data: {
        branchId: order.branchId,
        orderId: order.id,
        businessDate: order.businessDate,
        createdById: user.id,
        updatedById: user.id,
        ...draftData(dto),
      },
      select: { id: true },
    });
    return this.findOne(user, created.id);
  }

  async update(user: AuthUser, id: number, dto: EinvoiceDraftDto) {
    await this.assertAccess(user, id);
    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: EinvoiceStatus.DRAFT },
      data: { ...draftData(dto), lastError: null, updatedById: user.id },
    });
    if (count === 0) throw new ConflictException('Chỉ sửa được hóa đơn nháp');
    return this.findOne(user, id);
  }

  async remove(user: AuthUser, id: number) {
    await this.assertAccess(user, id);
    const { count } = await this.prisma.einvoice.deleteMany({
      where: { id, status: EinvoiceStatus.DRAFT },
    });
    if (count === 0) throw new ConflictException('Chỉ xóa được hóa đơn nháp');
    return { id };
  }

  private async listWhere(
    user: AuthUser,
    query: EinvoiceListQuery,
  ): Promise<Prisma.EinvoiceWhereInput> {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const where: Prisma.EinvoiceWhereInput = { branchId };
    if (query.status === 'DRAFT') {
      where.status = EinvoiceStatus.DRAFT;
      where.lastError = null;
    } else if (query.status === 'ERROR') {
      where.status = EinvoiceStatus.DRAFT;
      where.lastError = { not: null };
    } else if (query.status) {
      where.status = query.status;
    }
    // Pending work (drafts, errors, uncertain) is listed whatever its day.
    const dated = !query.status || query.status === 'ISSUED';
    if (query.billNumber) {
      where.order = {
        is: { billNumber: billNumberPrefixRange(query.billNumber) },
      };
    } else if (dated) {
      where.businessDate = dateRange(query.from, query.to);
    }
    return where;
  }

  private async assertAccess(user: AuthUser, id: number) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { branchId: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
  }
}
