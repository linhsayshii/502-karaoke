import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { EinvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  businessDateOf,
  fromDbDate,
  toDateString,
  toDbDate,
} from '../common/dates';
import { billNumberPrefixRange } from '../orders/bill-number';
import { billedHoursOf } from '../orders/billing';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import {
  CreateEinvoiceDto,
  EinvoiceBillsQuery,
  EinvoiceDraftDto,
  EinvoiceListQuery,
  EinvoiceNumberDto,
  IssueEinvoiceDto,
  ResolveEinvoiceDto,
} from './dto/einvoice.dto';
import {
  EinvoiceConfigService,
  type IssueConfig,
} from './einvoice-config.service';
import { parseDraft } from './einvoice-draft';
import { issueProblem, totalsOf } from './einvoice-math';
import {
  einvoiceDetailSelect,
  einvoiceListSelect,
  toEinvoiceRow,
} from './einvoice-select';
import { EinvoiceSender, type SendOutcome } from './einvoice-sender';
import type { EinvoiceDraft, EinvoiceLine } from './einvoice-types';
import { buildMinvoicePayload } from './minvoice/minvoice-payload';

const clean = (value: string | null | undefined) => value?.trim() || null;

// The columns a saved draft writes (spec §4.1): the details go in `draft`,
// only in a shape parseDraft reads back (a blank name is refused, a null
// vatAmount is left out).
function draftData(dto: EinvoiceDraftDto) {
  const lines: EinvoiceLine[] = dto.lines.map((line, index) => {
    const name = line.name.trim();
    if (!name) {
      throw new BadRequestException(
        `Dòng ${index + 1}: tên hàng không được để trống`,
      );
    }
    return {
      name,
      unit: line.unit.trim(),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.vatAmount == null ? {} : { vatAmount: line.vatAmount }),
    };
  });
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
function dbDay(
  value: string,
  message = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)',
): Date {
  const date = toDbDate(value);
  if (isNaN(date.getTime()) || fromDbDate(date) !== value) {
    throw new BadRequestException(message);
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

const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

// 1C26MTT: characters 3–4 are the year (Thông tư 78/2021).
function symbolYearOf(symbolCode: string): number | null {
  const yy = Number(symbolCode.slice(2, 4));
  return Number.isInteger(yy) ? 2000 + yy : null;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

// Einvoice.lastError holds at most 300 characters (spec §4).
const errorText = (message: string) => message.slice(0, 300);

const NOT_UNCERTAIN = 'Hóa đơn không ở trạng thái "Không rõ"';

// Longer than any send (≈80 s of Minvoice timeouts in the worst chain, plus
// database waits): a row still SENDING after this was cut off without a
// restart (e.g. saving its outcome failed) and goes to the "Không rõ" flow
// when it is read.
export const STALE_SENDING_MS = 3 * 60_000;
const STALE_SENDING_ERROR = 'Lần gửi bị cắt ngang, hãy đối chiếu trên Minvoice';

// The kind and Prisma code of an error, for a log line: never its message,
// which may quote the values written.
function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? `${error.name} ${code}` : error.name;
}

@Injectable()
export class EinvoicesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EinvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private reportDb: ReportPrismaService,
    private scope: BranchScopeService,
    private config: EinvoiceConfigService,
    private sender: EinvoiceSender,
  ) {}

  // One backend process: at start-up no send is still running, so a row left
  // SENDING was cut off (spec §8). Runs once per start on a small table.
  async onApplicationBootstrap() {
    await this.prisma.einvoice.updateMany({
      where: { status: EinvoiceStatus.SENDING },
      data: {
        status: EinvoiceStatus.UNCERTAIN,
        lastError: errorText(
          'Server khởi động lại khi đang gửi; hãy đối chiếu trên Minvoice',
        ),
      },
    });
  }

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

    // A bill split into more than 200 invoices is not a real case; the cap
    // keeps the answer bounded.
    const readInvoices = () =>
      this.prisma.einvoice.findMany({
        where: { orderId },
        select: einvoiceDetailSelect,
        orderBy: { id: 'asc' },
        take: 200,
      });
    const [listed, allocated] = await Promise.all([
      readInvoices(),
      this.prisma.einvoice.aggregate({
        where: { orderId },
        _sum: { amount: true },
      }),
    ]);
    const einvoices =
      listed.some((e) => e.status === EinvoiceStatus.SENDING) &&
      (await this.sweepStaleSending({ orderId }))
        ? await readInvoices()
        : listed;
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
    const read = () =>
      this.prisma.einvoice.findUnique({
        where: { id },
        select: einvoiceDetailSelect,
      });
    let row = await read();
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    if (
      row.status === EinvoiceStatus.SENDING &&
      (await this.sweepStaleSending({ id }))
    ) {
      row = (await read()) ?? row;
    }
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

  // Spec §8. Answers 200 with the row once it is locked: the outcome is its
  // status (ISSUED, DRAFT with lastError, UNCERTAIN); checks before the lock
  // answer 400 / 409.
  async issue(user: AuthUser, id: number, dto: IssueEinvoiceDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: {
        branchId: true,
        status: true,
        amount: true,
        buyerTaxCode: true,
        buyerName: true,
        draft: true,
        updatedAt: true,
        order: { select: { status: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    if (row.status !== EinvoiceStatus.DRAFT) {
      throw new ConflictException(
        row.status === EinvoiceStatus.ISSUED
          ? 'Hóa đơn đã xuất'
          : 'Hóa đơn đang được gửi hoặc chưa rõ kết quả; đối chiếu trên Minvoice trước khi gửi lại',
      );
    }
    if (row.order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Bill đã hủy, không xuất được hóa đơn');
    }
    const draft = parseDraft(row.draft);
    const problem = issueProblem(Number(row.amount), draft.lines);
    if (problem) throw new BadRequestException(problem);
    const ready = await this.config.readyForIssue(row.branchId);
    await this.assertInvoiceDate(ready, dto);

    // Locked only as it was read: a draft saved meanwhile would otherwise
    // go out with the lines checked above but keep the amount saved since.
    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: EinvoiceStatus.DRAFT, updatedAt: row.updatedAt },
      data: {
        status: EinvoiceStatus.SENDING,
        sendingAt: new Date(),
        lastError: null,
        sellerTaxCode: ready.taxCode,
        symbolCode: ready.symbolCode,
        registerInvoiceId: ready.registerInvoiceId,
        invoiceDate: toDbDate(dto.invoiceDate),
      },
    });
    if (count === 0) throw await this.notLocked(id);

    let outcome: SendOutcome;
    try {
      outcome = await this.sender.send(ready, (config) =>
        buildMinvoicePayload({
          taxCode: config.taxCode,
          symbolCode: config.symbolCode,
          registerInvoiceId: config.registerInvoiceId,
          currencyId: config.currencyId,
          seller: config.seller,
          invoiceDate: dto.invoiceDate,
          buyer: {
            taxCode: row.buyerTaxCode,
            name: row.buyerName,
            address: draft.buyerAddress,
            email: draft.buyerEmail,
          },
          lines: draft.lines,
          marker: `K502-${id}`,
        }),
      );
    } catch (error) {
      // A bug after the request may have left: never guess, check on Minvoice.
      outcome = {
        kind: 'uncertain',
        message:
          error instanceof Error ? error.message : 'Lỗi không xác định khi gửi',
      };
    }
    await this.record(user, id, ready, draft.lines, outcome);
    return this.findOne(user, id);
  }

  // Spec §9.2 (without a search): the chain manager looked on Minvoice.
  async resolve(user: AuthUser, id: number, dto: ResolveEinvoiceDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: {
        branchId: true,
        status: true,
        draft: true,
        sellerTaxCode: true,
        symbolCode: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    // Before the draft is read: an issued row has none.
    if (row.status !== EinvoiceStatus.UNCERTAIN) {
      throw new ConflictException(NOT_UNCERTAIN);
    }
    const data: Prisma.EinvoiceUncheckedUpdateManyInput = dto.found
      ? {
          status: EinvoiceStatus.ISSUED,
          invoiceNumber: dto.invoiceNumber,
          vatAmount: totalsOf(parseDraft(row.draft).lines).vatAmount,
          draft: Prisma.DbNull,
          issuedById: user.id,
          issuedAt: new Date(),
          lastError: null,
          sendingAt: null,
        }
      : {
          status: EinvoiceStatus.DRAFT,
          lastError: null,
          sendingAt: null,
          sellerTaxCode: null,
          symbolCode: null,
          registerInvoiceId: null,
          invoiceDate: null,
        };
    let count: number;
    try {
      // The status condition settles a race with another resolve.
      ({ count } = await this.prisma.einvoice.updateMany({
        where: { id, status: EinvoiceStatus.UNCERTAIN },
        data,
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw await this.numberTaken(row, dto.invoiceNumber!);
      }
      throw error;
    }
    if (count === 0) throw new ConflictException(NOT_UNCERTAIN);
    return this.findOne(user, id);
  }

  async editNumber(user: AuthUser, id: number, dto: EinvoiceNumberDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { branchId: true, sellerTaxCode: true, symbolCode: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    let count: number;
    try {
      ({ count } = await this.prisma.einvoice.updateMany({
        where: { id, status: EinvoiceStatus.ISSUED },
        data: {
          invoiceNumber: dto.invoiceNumber,
          lastError: null,
          numberEditedById: user.id,
          numberEditedAt: new Date(),
        },
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw await this.numberTaken(row, dto.invoiceNumber);
      }
      throw error;
    }
    if (count === 0)
      throw new ConflictException('Chỉ sửa số của hóa đơn đã xuất');
    return this.findOne(user, id);
  }

  // Spec §9.3: not before the newest invoice of the symbol, a future date
  // confirmed, and in the year of the symbol.
  private async assertInvoiceDate(ready: IssueConfig, dto: IssueEinvoiceDto) {
    dbDay(dto.invoiceDate, 'Ngày hóa đơn không hợp lệ');
    const latest = await this.config.latestIssued(
      ready.taxCode,
      ready.symbolCode,
    );
    if (latest && dto.invoiceDate < latest.invoiceDate) {
      throw new BadRequestException(
        `Ngày hóa đơn phải từ ${dmy(latest.invoiceDate)} trở đi (hóa đơn số ${latest.invoiceNumber ?? '?'} cùng ký hiệu ${ready.symbolCode} mang ngày này)`,
      );
    }
    if (dto.invoiceDate > toDateString(new Date()) && !dto.confirmFutureDate) {
      throw new BadRequestException(
        'Ngày hóa đơn sau hôm nay: cần xác nhận trước khi xuất',
      );
    }
    const year = symbolYearOf(ready.symbolCode);
    if (year !== null && Number(dto.invoiceDate.slice(0, 4)) !== year) {
      throw new BadRequestException(
        `Ký hiệu ${ready.symbolCode} là của năm ${year}, ngày hóa đơn là ${dmy(dto.invoiceDate)}`,
      );
    }
  }

  // Why the lock found nothing to take: another issue got there first, or
  // the draft was saved after it was checked.
  private async notLocked(id: number) {
    const now = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { status: true },
    });
    return new ConflictException(
      now?.status === EinvoiceStatus.DRAFT
        ? 'Hóa đơn vừa được sửa, kiểm tra lại rồi xuất'
        : 'Hóa đơn đang được gửi hoặc đã xuất',
    );
  }

  // A SENDING row whose send has long ended (spec §9.1: saving its outcome
  // failed) becomes UNCERTAIN. record() still writes by id, so a result that
  // arrives later lands over it.
  private async sweepStaleSending(where: { id: number } | { orderId: number }) {
    const { count } = await this.prisma.einvoice.updateMany({
      where: {
        ...where,
        status: EinvoiceStatus.SENDING,
        sendingAt: { lt: new Date(Date.now() - STALE_SENDING_MS) },
      },
      data: {
        status: EinvoiceStatus.UNCERTAIN,
        lastError: errorText(STALE_SENDING_ERROR),
      },
    });
    return count > 0;
  }

  // Any failed write leaves the row SENDING (a restart or a read after
  // STALE_SENDING_MS makes it UNCERTAIN); the log keeps what Minvoice
  // answered, never the payload, draft or session.
  private async record(
    user: AuthUser,
    id: number,
    ready: IssueConfig,
    lines: EinvoiceLine[],
    outcome: SendOutcome,
  ) {
    try {
      await this.writeOutcome(user, id, ready, lines, outcome);
    } catch (error) {
      const answer =
        outcome.kind === 'issued'
          ? ` (Minvoice number ${outcome.invoiceNumber}, id ${outcome.minvoiceId})`
          : '';
      this.logger.error(
        `Einvoice ${id}: saving the ${outcome.kind} outcome${answer} failed: ${errorKind(error)}`,
      );
      throw error;
    }
  }

  private async writeOutcome(
    user: AuthUser,
    id: number,
    ready: IssueConfig,
    lines: EinvoiceLine[],
    outcome: SendOutcome,
  ) {
    if (outcome.kind === 'failed') {
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          status: EinvoiceStatus.DRAFT,
          lastError: errorText(
            outcome.dateOrder
              ? `Minvoice từ chối ngày hóa đơn: phải từ ngày của hóa đơn mới nhất cùng ký hiệu ${ready.symbolCode} trở đi. ${outcome.message}`
              : outcome.message,
          ),
          sendingAt: null,
          sellerTaxCode: null,
          symbolCode: null,
          registerInvoiceId: null,
          invoiceDate: null,
        },
      });
      return;
    }
    if (outcome.kind === 'uncertain') {
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          status: EinvoiceStatus.UNCERTAIN,
          lastError: errorText(outcome.message),
        },
      });
      return;
    }
    // Issued: the header stays, the details go (spec §4).
    const header = {
      status: EinvoiceStatus.ISSUED,
      minvoiceId: outcome.minvoiceId,
      sellerTaxCode: outcome.config.taxCode,
      symbolCode: outcome.config.symbolCode,
      registerInvoiceId: outcome.config.registerInvoiceId,
      vatAmount: totalsOf(lines).vatAmount,
      draft: Prisma.DbNull,
      issuedById: user.id,
      issuedAt: new Date(),
      sendingAt: null,
    };
    try {
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          ...header,
          invoiceNumber: outcome.invoiceNumber,
          lastError: null,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const holder = await this.prisma.einvoice.findFirst({
        where: {
          sellerTaxCode: outcome.config.taxCode,
          symbolCode: outcome.config.symbolCode,
          invoiceNumber: outcome.invoiceNumber,
        },
        select: { id: true },
      });
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          ...header,
          invoiceNumber: null,
          lastError: errorText(
            `Số ${outcome.invoiceNumber} trùng hóa đơn #${holder?.id ?? '?'}, kiểm tra và sửa số`,
          ),
        },
      });
    }
  }

  private async numberTaken(
    row: { sellerTaxCode: string | null; symbolCode: string | null },
    invoiceNumber: number,
  ) {
    const holder = await this.prisma.einvoice.findFirst({
      where: {
        sellerTaxCode: row.sellerTaxCode,
        symbolCode: row.symbolCode,
        invoiceNumber,
      },
      select: { id: true },
    });
    return new ConflictException(
      `Số ${invoiceNumber} đã có ở hóa đơn #${holder?.id ?? '?'}`,
    );
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
      // (branchId, billNumber) index of Order.
      where.order = {
        is: { branchId, billNumber: billNumberPrefixRange(query.billNumber) },
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
