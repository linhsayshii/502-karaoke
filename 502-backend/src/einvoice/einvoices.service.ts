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
import {
  MARKER_SEARCH_CONFIRMED,
  type MarkerSearch,
} from './minvoice/minvoice-client';
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

const INVALID_INVOICE_DATE = 'Ngày hóa đơn không hợp lệ';

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
const MANUAL_CHECK = 'kiểm tra trên Minvoice rồi đối chiếu bằng tay';
const UNKNOWN_SEND_ERROR =
  'Lỗi không xác định khi gửi, hãy đối chiếu trên Minvoice';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'lỗi không xác định';

// Our reference on Minvoice (spec §6.2).
const markerOf = (id: number) => `K502-${id}`;

// What a recheck adds to an outcome.
interface OutcomeExtra {
  // Set only for an invoice found by our reference (not sent): its date on
  // Minvoice. A number clash then leaves the row uncertain.
  foundDate?: string;
  // The start of the lost send, kept on a row left uncertain.
  sendingAt?: Date | null;
}

// A number found by our reference that one of our rows already holds: our
// database and the search disagree.
const foundNumberTaken = (
  invoiceNumber: number,
  marker: string,
  holderId: number | null,
) =>
  `Số ${invoiceNumber} mà Minvoice trả về cho ${marker} đã có ở hóa đơn #${holderId ?? '?'}; ${MANUAL_CHECK}`;

// The header of a send, written at the lock (global constraints, decision 5).
function sentHeader(ready: IssueConfig, dto: IssueEinvoiceDto) {
  return {
    sellerTaxCode: ready.taxCode,
    symbolCode: ready.symbolCode,
    registerInvoiceId: ready.registerInvoiceId,
    invoiceDate: toDbDate(dto.invoiceDate),
  };
}

// Longer than any send (≈80 s of Minvoice timeouts in the worst chain, plus
// database waits): a row still SENDING after this was cut off without a
// restart (e.g. saving its outcome failed) and goes to the "Không rõ" flow
// when it is read.
export const STALE_SENDING_MS = 3 * 60_000;
const STALE_SENDING_ERROR = 'Lần gửi bị cắt ngang, hãy đối chiếu trên Minvoice';

// Pending "Không rõ" work: a SENDING row whose send was cut off stays SENDING
// until it is opened (sweepStaleSending), so it is listed and counted with
// the uncertain ones. (branchId, status, createdAt) index.
const NOT_SETTLED = { in: [EinvoiceStatus.SENDING, EinvoiceStatus.UNCERTAIN] };

// The invoices of a tab: "Lỗi" is a draft with an error, "Không rõ" also
// holds sends still in flight or cut off.
function statusWhere(
  status: 'DRAFT' | 'ERROR' | 'UNCERTAIN' | 'ISSUED',
): Prisma.EinvoiceWhereInput {
  if (status === 'DRAFT') {
    return { status: EinvoiceStatus.DRAFT, lastError: null };
  }
  if (status === 'ERROR') {
    return { status: EinvoiceStatus.DRAFT, lastError: { not: null } };
  }
  if (status === 'UNCERTAIN') return { status: NOT_SETTLED };
  return { status: EinvoiceStatus.ISSUED };
}

const twoDigits = (n: number) => String(n).padStart(2, '0');
// HH:mm in the server's time zone (the venue's, TZ).
const hhmm = (date: Date) =>
  `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

// Why an uncertain send may not go back to draft yet, or null. Going back to
// draft leads to a new POST, and Minvoice may still be saving the lost one
// (our timeout is not its own) until STALE_SENDING_MS after it started.
// Every path to UNCERTAIN keeps sendingAt (the lock stamps it, the outcome
// and the sweeps keep it, a recheck puts the lost send's back); a row without
// it is timed from its last write, which never comes before its last send.
function tooRecent(
  row: { sendingAt: Date | null; updatedAt: Date },
  now = Date.now(),
): string | null {
  const since = row.sendingAt ?? row.updatedAt;
  if (now - since.getTime() >= STALE_SENDING_MS) return null;
  // Rounded up to the minute, so the time named is surely late enough.
  const allowed = new Date(
    Math.ceil((since.getTime() + STALE_SENDING_MS) / 60_000) * 60_000,
  );
  return row.sendingAt
    ? `Lần gửi lúc ${hhmm(since)} còn quá mới, đợi đến ${hhmm(allowed)} rồi kiểm tra lại trên Minvoice`
    : `Không rõ lúc gửi; hóa đơn đổi lần cuối lúc ${hhmm(since)}, đợi đến ${hhmm(allowed)} rồi kiểm tra lại trên Minvoice`;
}

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
  // Ids whose send is running in this process, so the stale-SENDING sweep
  // never takes a live send for a dead one. There is only one backend
  // (spec §8), so this is every send in flight; bounded by them, as each id
  // leaves once its outcome is written or failed to be.
  private readonly sending = new Set<number>();
  // Read through this field so the e2e test can flip it.
  markerSearchConfirmed = MARKER_SEARCH_CONFIRMED;

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
        where: { branchId, status: NOT_SETTLED },
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

  // The bills of the left column (spec 2026-10-01-hddt-bo-cuc-va-hd-tu-do §4):
  // the paid ones of a range of business days, or those holding an invoice of
  // a status. Pending work (drafts, errors, uncertain) is every day and keeps
  // voided bills, so their uncertain invoices can still be settled.
  async bills(user: AuthUser, query: EinvoiceBillsQuery) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const today = toDbDate(businessDateOf(new Date()));
    const days = dateRange(query.from, query.to) ?? { gte: today, lte: today };
    const where: Prisma.OrderWhereInput = { branchId };
    if (query.billNumber) {
      where.billNumber = billNumberPrefixRange(query.billNumber);
    }
    if (query.status) {
      // Einvoice(branchId, status, createdAt) or (branchId, businessDate).
      where.einvoices = {
        some: {
          branchId,
          ...statusWhere(query.status),
          ...(query.status === 'ISSUED' && !query.billNumber
            ? { businessDate: days }
            : {}),
        },
      };
    } else {
      where.status = OrderStatus.COMPLETED;
      if (!query.billNumber) where.businessDate = days;
    }
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          billNumber: true,
          finalAmount: true,
          endTime: true,
          cancelledAt: true,
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
      cancelledAt: order.cancelledAt,
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

  async create(user: AuthUser, dto: CreateEinvoiceDto, branch?: string) {
    const written = {
      createdById: user.id,
      updatedById: user.id,
      ...draftData(dto),
    };
    if (dto.orderId == null) {
      // A free invoice (no orderId, or a null one: @IsOptional lets both
      // through): no bill, the branch of the page, and the business day it
      // is made on for the list filters (spec
      // 2026-10-01-hddt-bo-cuc-va-hd-tu-do §4).
      const branchId = await this.scope.resolveBranchId(user, branch);
      const created = await this.prisma.einvoice.create({
        data: {
          branchId,
          orderId: null,
          businessDate: toDbDate(businessDateOf(new Date())),
          // The calendar day, never the business day (spec §2).
          invoiceDate: dbDay(
            dto.invoiceDate ?? toDateString(new Date()),
            INVALID_INVOICE_DATE,
          ),
          ...written,
        },
        select: { id: true },
      });
      return this.findOne(user, created.id);
    }
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        branchId: true,
        status: true,
        businessDate: true,
        endTime: true,
      },
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
        // The calendar day the bill was paid: a bill paid at 00:24 belongs
        // to the business day before but is invoiced on its own date (spec §2).
        invoiceDate: dbDay(
          dto.invoiceDate ?? toDateString(order.endTime ?? new Date()),
          INVALID_INVOICE_DATE,
        ),
        ...written,
      },
      select: { id: true },
    });
    return this.findOne(user, created.id);
  }

  async update(user: AuthUser, id: number, dto: EinvoiceDraftDto) {
    await this.assertAccess(user, id);
    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: EinvoiceStatus.DRAFT },
      data: {
        ...draftData(dto),
        // Left out: the date planned stays (spec §4).
        ...(dto.invoiceDate
          ? { invoiceDate: dbDay(dto.invoiceDate, INVALID_INVOICE_DATE) }
          : {}),
        lastError: null,
        updatedById: user.id,
      },
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
        // What an uncertain send went out with (spec §9.2).
        sellerTaxCode: true,
        symbolCode: true,
        registerInvoiceId: true,
        invoiceDate: true,
        // When that send started: read before the lock overwrites it.
        sendingAt: true,
        order: { select: { status: true } },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    // An uncertain invoice is looked up before anything is sent (spec §9.2).
    const recheck = row.status === EinvoiceStatus.UNCERTAIN;
    if (row.status !== EinvoiceStatus.DRAFT && !recheck) {
      throw new ConflictException(
        row.status === EinvoiceStatus.ISSUED
          ? 'Hóa đơn đã xuất'
          : 'Hóa đơn đang được gửi',
      );
    }
    // A free invoice has no bill that could have been voided.
    if (row.order && row.order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Bill đã hủy, không xuất được hóa đơn');
    }
    const draft = parseDraft(row.draft);
    const problem = issueProblem(Number(row.amount), draft.lines);
    if (problem) throw new BadRequestException(problem);
    const ready = await this.config.readyForIssue(row.branchId);
    await this.assertInvoiceDate(ready, dto);

    // Locked only as it was read: a draft saved meanwhile would otherwise
    // go out with the lines checked above but keep the amount saved since.
    // An uncertain row keeps its header: it describes what was sent, and the
    // search looks for that.
    const { count } = await this.prisma.einvoice.updateMany({
      where: { id, status: row.status, updatedAt: row.updatedAt },
      data: {
        status: EinvoiceStatus.SENDING,
        sendingAt: new Date(),
        lastError: null,
        ...(recheck ? {} : sentHeader(ready, dto)),
      },
    });
    if (count === 0) throw await this.notLocked(id);

    this.sending.add(id);
    try {
      if (recheck) await this.recheck(user, id, ready, row, draft, dto);
      else await this.send(user, id, ready, row, draft, dto);
    } finally {
      this.sending.delete(id);
    }
    return this.findOne(user, id);
  }

  // Spec §9.2: a send whose answer was lost is looked up by our reference
  // before anything goes out again, as a duplicate tax invoice must never be
  // made. Only a sure answer moves it on: found (its row shows our
  // reference, or MARKER_SEARCH_CONFIRMED says to trust the filter alone)
  // with a number none of our rows holds -> issued with that number; nothing
  // found -> sent again, only when MARKER_SEARCH_CONFIRMED is on (it is off:
  // that resend is the human's "Chưa có — gửi lại") and the lost send started
  // at least STALE_SENDING_MS ago. Anything else leaves it uncertain, draft
  // kept, for a manual check.
  private async recheck(
    user: AuthUser,
    id: number,
    ready: IssueConfig,
    row: {
      branchId: number;
      buyerTaxCode: string | null;
      buyerName: string | null;
      sellerTaxCode: string | null;
      symbolCode: string | null;
      registerInvoiceId: string | null;
      invoiceDate: Date | null;
      sendingAt: Date | null;
    },
    draft: EinvoiceDraft,
    dto: IssueEinvoiceDto,
  ) {
    const marker = markerOf(id);
    // Left uncertain with the time of the lost send, not of this search, so
    // checking again does not push back the moment a resend may be trusted.
    const uncertain = (message: string) =>
      this.record(
        user,
        id,
        ready,
        draft.lines,
        { kind: 'uncertain', message },
        { sendingAt: row.sendingAt },
      );
    const { sellerTaxCode, symbolCode, registerInvoiceId, invoiceDate } = row;
    if (!sellerTaxCode || !symbolCode || !registerInvoiceId || !invoiceDate) {
      return uncertain(
        `Không rõ ký hiệu hoặc ngày của lần gửi trước nên không tìm được hóa đơn ${marker}; ${MANUAL_CHECK}`,
      );
    }
    if (sellerTaxCode !== ready.taxCode) {
      return uncertain(
        `Hóa đơn ${marker} đã gửi với MST ${sellerTaxCode}, cơ sở nay dùng MST ${ready.taxCode}; ${MANUAL_CHECK}`,
      );
    }

    let result: MarkerSearch;
    try {
      result = await this.config.findByMarker(row.branchId, sellerTaxCode, {
        symbolCode,
        invoiceDate: fromDbDate(invoiceDate),
        marker,
      });
    } catch (error) {
      return uncertain(
        `Không tìm được hóa đơn ${marker} trên Minvoice, ${MANUAL_CHECK}: ${messageOf(error)}`,
      );
    }
    if (result.kind === 'found') {
      // Rows of the real list show orderNumber (`markerSeen`); a row that
      // does not is ours only if Minvoice filtered by it
      // (MARKER_SEARCH_CONFIRMED).
      if (!result.markerSeen && !this.markerSearchConfirmed) {
        return uncertain(
          `Có thể là hóa đơn số ${result.invoiceNumber} ngày ${dmy(result.invoiceDate)} trên Minvoice (chưa chắc Minvoice lọc theo mã ${marker}); ${MANUAL_CHECK}`,
        );
      }
      const holder = await this.numberHolder(
        sellerTaxCode,
        symbolCode,
        result.invoiceNumber,
        id,
      );
      if (holder !== null) {
        return uncertain(
          foundNumberTaken(result.invoiceNumber, marker, holder),
        );
      }
      // Recorded under the header it was sent with, not the current config.
      return this.record(
        user,
        id,
        ready,
        draft.lines,
        {
          kind: 'issued',
          minvoiceId: result.id,
          invoiceNumber: result.invoiceNumber,
          config: {
            ...ready,
            taxCode: sellerTaxCode,
            symbolCode,
            registerInvoiceId,
          },
        },
        { foundDate: result.invoiceDate, sendingAt: row.sendingAt },
      );
    }
    if (result.kind === 'ambiguous') {
      return uncertain(
        `Minvoice trả về kết quả không rõ khi tìm hóa đơn ${marker}; ${MANUAL_CHECK}`,
      );
    }
    if (!this.markerSearchConfirmed) {
      // Never worded as leave to press "Chưa có": the search is not trusted.
      return uncertain(
        `Tìm tự động không thấy hóa đơn ${marker}, nhưng cách tìm này chưa được kiểm chứng: chưa chắc Minvoice chưa có hóa đơn; ${MANUAL_CHECK}`,
      );
    }
    // Minvoice may still be saving the lost send (our timeout is not its
    // own): an empty list proves nothing until that send is well past.
    if (!row.sendingAt) {
      return uncertain(
        `Chưa tìm thấy hóa đơn ${marker} trên Minvoice và không rõ lúc gửi trước; ${MANUAL_CHECK}`,
      );
    }
    if (Date.now() - row.sendingAt.getTime() < STALE_SENDING_MS) {
      return uncertain(
        `Chưa tìm thấy hóa đơn ${marker} trên Minvoice nhưng lần gửi trước còn quá mới; kiểm tra lại sau vài phút, hoặc ${MANUAL_CHECK}`,
      );
    }
    // Nothing carries our reference: sent as a draft would be (spec §8), with
    // the header of this request.
    await this.prisma.einvoice.update({
      where: { id },
      data: { ...sentHeader(ready, dto), sendingAt: new Date() },
    });
    await this.send(user, id, ready, row, draft, dto);
  }

  // Sends the locked invoice and writes the outcome (spec §8 steps 3–5).
  private async send(
    user: AuthUser,
    id: number,
    ready: IssueConfig,
    row: { buyerTaxCode: string | null; buyerName: string | null },
    draft: EinvoiceDraft,
    dto: IssueEinvoiceDto,
  ) {
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
          marker: markerOf(id),
        }),
      );
    } catch (error) {
      // A bug after the request may have left: never guess, check on Minvoice.
      outcome = {
        kind: 'uncertain',
        message:
          error instanceof Error
            ? `${UNKNOWN_SEND_ERROR}: ${error.message}`
            : UNKNOWN_SEND_ERROR,
      };
    }
    await this.record(user, id, ready, draft.lines, outcome);
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
        sendingAt: true,
        updatedAt: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.scope.assertBranchAccess(user, row.branchId);
    // Before the draft is read: an issued row has none.
    if (row.status !== EinvoiceStatus.UNCERTAIN) {
      throw new ConflictException(NOT_UNCERTAIN);
    }
    // "Chưa có — gửi lại": a draft may be posted again.
    const recent = dto.found ? null : tooRecent(row);
    if (recent) throw new ConflictException(recent);
    const cutoff = new Date(Date.now() - STALE_SENDING_MS);
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
          // The date stays: on a draft it is the date planned (spec §3).
          sellerTaxCode: null,
          symbolCode: null,
          registerInvoiceId: null,
        };
    let count: number;
    try {
      // The status condition settles a race with another resolve; the age
      // one with a recheck that sent it again after it was read.
      ({ count } = await this.prisma.einvoice.updateMany({
        where: {
          id,
          status: EinvoiceStatus.UNCERTAIN,
          ...(dto.found
            ? {}
            : {
                OR: [
                  { sendingAt: { lte: cutoff } },
                  { sendingAt: null, updatedAt: { lte: cutoff } },
                ],
              }),
        },
        data,
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw await this.numberTaken(row, dto.invoiceNumber!);
      }
      throw error;
    }
    if (count === 0) throw await this.notResolved(id, dto.found);
    return this.findOne(user, id);
  }

  // Why the resolve found nothing to change: settled or sent again meanwhile.
  private async notResolved(id: number, found: boolean) {
    const now = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { status: true, sendingAt: true, updatedAt: true },
    });
    const recent =
      !found && now?.status === EinvoiceStatus.UNCERTAIN
        ? tooRecent(now)
        : null;
    return new ConflictException(recent ?? NOT_UNCERTAIN);
  }

  async editNumber(user: AuthUser, id: number, dto: EinvoiceNumberDto) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: {
        branchId: true,
        sellerTaxCode: true,
        symbolCode: true,
        invoiceNumber: true,
      },
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
    // The row keeps who and when, not the number it replaced: the log does.
    this.logger.log(
      `Einvoice ${id}: number ${row.invoiceNumber ?? 'none'} → ${dto.invoiceNumber} by user ${user.id}`,
    );
    return this.findOne(user, id);
  }

  // Spec §9.3: not before the newest invoice of the symbol, a future date
  // confirmed, and in the year of the symbol.
  private async assertInvoiceDate(ready: IssueConfig, dto: IssueEinvoiceDto) {
    dbDay(dto.invoiceDate, INVALID_INVOICE_DATE);
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
    if (now?.status === EinvoiceStatus.DRAFT) {
      return new ConflictException(
        'Hóa đơn vừa được sửa, kiểm tra lại rồi xuất',
      );
    }
    return new ConflictException(
      now?.status === EinvoiceStatus.UNCERTAIN
        ? 'Hóa đơn vừa được kiểm tra lại, tải lại rồi thử lại'
        : 'Hóa đơn đang được gửi hoặc đã xuất',
    );
  }

  // A SENDING row whose send has long ended (spec §9.1: saving its outcome
  // failed) becomes UNCERTAIN; a send still running here is left alone.
  // record() still writes by id, so a result that arrives later lands over it.
  private async sweepStaleSending(
    target: { id: number } | { orderId: number },
  ) {
    let where: Prisma.EinvoiceWhereInput;
    if ('id' in target) {
      if (this.sending.has(target.id)) return false;
      where = { id: target.id };
    } else {
      where = {
        orderId: target.orderId,
        ...(this.sending.size ? { id: { notIn: [...this.sending] } } : {}),
      };
    }
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
    extra: OutcomeExtra = {},
  ) {
    try {
      await this.writeOutcome(user, id, ready, lines, outcome, extra);
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
    extra: OutcomeExtra,
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
          // The date stays: on a draft it is the date planned (spec §3).
          sellerTaxCode: null,
          symbolCode: null,
          registerInvoiceId: null,
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
          ...(extra.sendingAt === undefined
            ? {}
            : { sendingAt: extra.sendingAt }),
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
      ...(extra.foundDate ? { invoiceDate: toDbDate(extra.foundDate) } : {}),
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
      const holder = await this.numberHolder(
        outcome.config.taxCode,
        outcome.config.symbolCode,
        outcome.invoiceNumber,
        id,
      );
      if (extra.foundDate) {
        // Found by our reference: a clash is doubt, not a number to fix. The
        // row keeps its draft for the manual check.
        await this.prisma.einvoice.update({
          where: { id },
          data: {
            status: EinvoiceStatus.UNCERTAIN,
            lastError: errorText(
              foundNumberTaken(outcome.invoiceNumber, markerOf(id), holder),
            ),
            ...(extra.sendingAt === undefined
              ? {}
              : { sendingAt: extra.sendingAt }),
          },
        });
        return;
      }
      await this.prisma.einvoice.update({
        where: { id },
        data: {
          ...header,
          invoiceNumber: null,
          lastError: errorText(
            `Số ${outcome.invoiceNumber} trùng hóa đơn #${holder ?? '?'}, kiểm tra và sửa số`,
          ),
        },
      });
    }
  }

  // The row other than `id` holding a number of a tenant + symbol (the
  // unique (sellerTaxCode, symbolCode, invoiceNumber) index).
  private async numberHolder(
    sellerTaxCode: string,
    symbolCode: string,
    invoiceNumber: number,
    id: number,
  ) {
    const row = await this.prisma.einvoice.findFirst({
      where: { sellerTaxCode, symbolCode, invoiceNumber, id: { not: id } },
      select: { id: true },
    });
    return row?.id ?? null;
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
    const where: Prisma.EinvoiceWhereInput = {
      branchId,
      ...(query.status ? statusWhere(query.status) : {}),
    };
    if (query.free) where.orderId = null;
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
