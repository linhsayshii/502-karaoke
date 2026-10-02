import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { EinvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { canUseReportSite } from '../auth/roles';
import { BranchScopeService } from '../common/branch-scope.service';
import {
  businessDateOf,
  fromDbDate,
  toDateString,
  toDbDate,
} from '../common/dates';
import { billNumberPrefixRange, nextReportNumber } from '../orders/bill-number';
import { billedHoursOf } from '../orders/billing';
import { staffRef } from '../orders/order-include';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import {
  CreateEinvoiceDto,
  EinvoiceBillsQuery,
  EinvoiceDraftDto,
  EinvoiceNumberDto,
  EinvoiceSummaryQuery,
  IssueEinvoiceDto,
  ResolveEinvoiceDto,
} from './dto/einvoice.dto';
import {
  EinvoiceConfigService,
  type IssueConfig,
} from './einvoice-config.service';
import { billLines, billMinutesOf, RETAIL_BUYER } from './bill-lines';
import { draftData, issuedDraft, parseDraft } from './einvoice-draft';
import { dateRange, dbDay, NOT_SETTLED, statusWhere } from './einvoice-filters';
import { issueProblem, totalsOf } from './einvoice-math';
import { einvoiceDetailSelect, toEinvoiceRow } from './einvoice-select';
import { EinvoiceSender, type SendOutcome } from './einvoice-sender';
import type { EinvoiceDraft, EinvoiceLine } from './einvoice-types';
import {
  MARKER_SEARCH_CONFIRMED,
  type MarkerSearch,
} from './minvoice/minvoice-client';
import { buildMinvoicePayload } from './minvoice/minvoice-payload';

const INVALID_INVOICE_DATE = 'Ngày hóa đơn không hợp lệ';

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
const REPORT_SITE_ONLY =
  'Hóa đơn của bill thêm tay chỉ mở được ở trang báo cáo';

// What a new draft writes besides its bill.
type Written = ReturnType<typeof draftData> & {
  createdById: number;
  updatedById: number;
};

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
// How long after a lost send it may go back to draft ("Chưa có — gửi lại"),
// or be resent after a search that found nothing: Minvoice may still be
// saving it. Apart from STALE_SENDING_MS, which must outlast our own sends.
export const RESEND_WAIT_MS = 60_000;
const STALE_SENDING_ERROR = 'Lần gửi bị cắt ngang, hãy đối chiếu trên Minvoice';

const twoDigits = (n: number) => String(n).padStart(2, '0');
// HH:mm in the server's time zone (the venue's, TZ).
const hhmm = (date: Date) =>
  `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;

// Why an uncertain send may not go back to draft yet, or null. Going back to
// draft leads to a new POST, and Minvoice may still be saving the lost one
// (our timeout is not its own) until RESEND_WAIT_MS after it started.
// Every path to UNCERTAIN keeps sendingAt (the lock stamps it, the outcome
// and the sweeps keep it, a recheck puts the lost send's back); a row without
// it is timed from its last write, which never comes before its last send.
function tooRecent(
  row: { sendingAt: Date | null; updatedAt: Date },
  now = Date.now(),
): string | null {
  const since = row.sendingAt ?? row.updatedAt;
  if (now - since.getTime() >= RESEND_WAIT_MS) return null;
  // Rounded up to the minute, so the time named is surely late enough.
  const allowed = new Date(
    Math.ceil((since.getTime() + RESEND_WAIT_MS) / 60_000) * 60_000,
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

  // Pending work counts every day; issued ones the chosen days. Summed in SQL
  // on the report pool. The main site counts the invoices of its own bills
  // only, the report site every invoice of the branch (spec 2026-10-02 §6.2).
  async summary(
    user: AuthUser,
    query: EinvoiceSummaryQuery,
    site: 'main' | 'report' = 'main',
  ) {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const days = dateRange(query.from, query.to);
    const own: Prisma.EinvoiceWhereInput =
      site === 'main' ? { branchId, orderId: { not: null } } : { branchId };
    const [draftCount, errorCount, uncertainCount, issued] = await Promise.all([
      this.reportDb.einvoice.count({
        where: { ...own, status: EinvoiceStatus.DRAFT, lastError: null },
      }),
      this.reportDb.einvoice.count({
        where: {
          ...own,
          status: EinvoiceStatus.DRAFT,
          lastError: { not: null },
        },
      }),
      this.reportDb.einvoice.count({
        where: { ...own, status: NOT_SETTLED },
      }),
      this.reportDb.einvoice.aggregate({
        // The report site counts an invoice on its invoice date (spec
        // 2026-10-02-bao-cao-theo-tung-hddt §3), the main site on its bill's
        // business day.
        where: {
          ...own,
          status: EinvoiceStatus.ISSUED,
          ...(site === 'main' ? { businessDate: days } : { invoiceDate: days }),
        },
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

    const { einvoices, allocated } = await this.invoicesOf({ orderId });
    const minutes = billMinutesOf(order.startTime, order.endTime);
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
      einvoices,
      allocated,
    };
  }

  // A bill thêm tay with its e-invoices, for the report site's panel (spec
  // 2026-10-02 §6.1); ReportSiteGuard let the caller in. On the main pool,
  // not the report one: reading may sweep a stale send (a write), as in
  // billDetail.
  async manualBillDetail(user: AuthUser, id: number) {
    const bill = await this.prisma.manualBill.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        billNumber: true,
        businessDate: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        room: { select: { name: true } },
        createdBy: staffRef,
      },
    });
    if (!bill) throw new NotFoundException('Không tìm thấy bill');
    this.scope.assertBranchAccess(user, bill.branchId);
    return {
      bill: { ...bill, businessDate: fromDbDate(bill.businessDate) },
      ...(await this.invoicesOf({ manualBillId: id })),
    };
  }

  // The invoices of one bill (with their drafts) and what they add up to,
  // for its panel. A bill split into more than 200 invoices is not a real
  // case; the cap keeps the answer bounded. A send cut off long ago is swept
  // first, then the invoices are read again.
  private async invoicesOf(
    bill: { orderId: number } | { manualBillId: number },
  ) {
    const readInvoices = () =>
      this.prisma.einvoice.findMany({
        where: bill,
        select: einvoiceDetailSelect,
        orderBy: { id: 'asc' },
        take: 200,
      });
    const [listed, allocated] = await Promise.all([
      readInvoices(),
      this.prisma.einvoice.aggregate({ where: bill, _sum: { amount: true } }),
    ]);
    const einvoices =
      listed.some((e) => e.status === EinvoiceStatus.SENDING) &&
      (await this.sweepStaleSending(bill))
        ? await readInvoices()
        : listed;
    return {
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
    this.assertRowAccess(user, row);
    if (
      row.status === EinvoiceStatus.SENDING &&
      (await this.sweepStaleSending({ id }))
    ) {
      row = (await read()) ?? row;
    }
    return toEinvoiceRow(row);
  }

  async create(user: AuthUser, dto: CreateEinvoiceDto) {
    // Every invoice belongs to exactly one bill (spec 2026-10-02 §4.2): a paid
    // bill, or a bill thêm tay of the report site.
    if ((dto.orderId == null) === (dto.manualBillId == null)) {
      throw new BadRequestException('Chọn bill cho hóa đơn');
    }
    const written: Written = {
      createdById: user.id,
      updatedById: user.id,
      ...draftData(dto),
    };
    if (dto.manualBillId != null) {
      return this.createForManualBill(
        user,
        dto.manualBillId,
        written,
        dto.invoiceDate,
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: {
        id: true,
        branchId: true,
        status: true,
        businessDate: true,
        room: { select: { name: true } },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy hóa đơn');
    this.scope.assertBranchAccess(user, order.branchId);
    if (order.status !== OrderStatus.COMPLETED || !order.businessDate) {
      throw new BadRequestException(
        'Chỉ tạo hóa đơn điện tử cho bill đã thanh toán và chưa hủy',
      );
    }
    const { businessDate } = order;
    // The bill's business day, as reportBill dates its draft (spec
    // 2026-10-02-bao-cao-theo-tung-hddt §2): a bill paid at 00:24 shows on the
    // report site on the day it belongs to, whichever button made its invoice.
    // Issuing asks for the date again.
    const invoiceDate = dto.invoiceDate ?? fromDbDate(businessDate);
    const invoiceDay = dbDay(invoiceDate, INVALID_INVOICE_DATE);
    // Short: the day's ReportCounter row stays locked until this commits.
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextReportNumber(
        tx,
        order.branchId,
        invoiceDate,
        order.room?.name,
      );
      const created = await tx.einvoice.create({
        data: {
          branchId: order.branchId,
          orderId: order.id,
          businessDate,
          invoiceDate: invoiceDay,
          ...number,
          ...written,
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.findOne(user, id);
  }

  // "Thêm hóa đơn vào báo cáo" (spec 2026-10-02-bao-cao-theo-tung-hddt §5.1):
  // one draft for the whole paid bill, on its business day, to a retail buyer,
  // with its hours and items as lines. Only for a bill with no invoice yet:
  // the bill's row is locked first, so two clicks never make two drafts.
  async reportBill(user: AuthUser, orderId: number) {
    const id = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      if (!locked) throw new NotFoundException('Không tìm thấy hóa đơn');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          branchId: true,
          status: true,
          businessDate: true,
          startTime: true,
          endTime: true,
          finalAmount: true,
          hourlyFee: true,
          pricePerHour: true,
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
      this.scope.assertBranchAccess(user, order.branchId);
      if (order.status !== OrderStatus.COMPLETED || !order.businessDate) {
        throw new BadRequestException(
          'Chỉ tạo hóa đơn điện tử cho bill đã thanh toán và chưa hủy',
        );
      }
      if ((await tx.einvoice.count({ where: { orderId } })) > 0) {
        throw new ConflictException('Bill đã có trong báo cáo');
      }
      const day = fromDbDate(order.businessDate);
      const number = await nextReportNumber(
        tx,
        order.branchId,
        day,
        order.room?.name,
      );
      const created = await tx.einvoice.create({
        data: {
          branchId: order.branchId,
          orderId,
          businessDate: order.businessDate,
          invoiceDate: order.businessDate,
          ...number,
          createdById: user.id,
          updatedById: user.id,
          ...draftData({
            amount: Math.round(Number(order.finalAmount)),
            buyerName: RETAIL_BUYER,
            lines: billLines({
              minutes: billMinutesOf(order.startTime, order.endTime),
              hourlyFee: Number(order.hourlyFee),
              pricePerHour: Number(order.pricePerHour),
              items: order.items.map((item) => ({
                name: item.product.name,
                unit: item.product.unit,
                quantity: item.quantity,
                price: Number(item.price),
              })),
            }),
          }),
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.findOne(user, id);
  }

  // A draft of a bill thêm tay. The bill's row is locked while the draft is
  // inserted, so it never lands on a bill being cancelled (the cancel deletes
  // the drafts under the same lock, ManualBillsService.cancel).
  private async createForManualBill(
    user: AuthUser,
    manualBillId: number,
    written: Written,
    invoiceDate?: string,
  ) {
    if (!canUseReportSite(user)) throw new ForbiddenException(REPORT_SITE_ONLY);
    const id = await this.prisma.$transaction(async (tx) => {
      const [bill] = await tx.$queryRaw<
        {
          branchId: number;
          businessDate: Date;
          cancelledAt: Date | null;
          roomName: string | null;
        }[]
      >`SELECT m."branchId", m."businessDate", m."cancelledAt", r."name" AS "roomName"
        FROM "ManualBill" m LEFT JOIN "Room" r ON r."id" = m."roomId"
        WHERE m."id" = ${manualBillId} FOR UPDATE OF m`;
      if (!bill) throw new NotFoundException('Không tìm thấy bill');
      this.scope.assertBranchAccess(user, bill.branchId);
      if (bill.cancelledAt) {
        throw new BadRequestException('Bill đã hủy, không thêm được hóa đơn');
      }
      // The day of the bill, unless the draft says otherwise (spec §4.2).
      const day = invoiceDate ?? fromDbDate(bill.businessDate);
      const invoiceDay = dbDay(day, INVALID_INVOICE_DATE);
      const number = await nextReportNumber(
        tx,
        bill.branchId,
        day,
        bill.roomName,
      );
      const created = await tx.einvoice.create({
        data: {
          branchId: bill.branchId,
          manualBillId,
          businessDate: bill.businessDate,
          invoiceDate: invoiceDay,
          ...number,
          ...written,
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.findOne(user, id);
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
        manualBillId: true,
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
    this.assertRowAccess(user, row);
    // An uncertain invoice is looked up before anything is sent (spec §9.2).
    const recheck = row.status === EinvoiceStatus.UNCERTAIN;
    if (row.status !== EinvoiceStatus.DRAFT && !recheck) {
      throw new ConflictException(
        row.status === EinvoiceStatus.ISSUED
          ? 'Hóa đơn đã xuất'
          : 'Hóa đơn đang được gửi',
      );
    }
    // A bill thêm tay has no order: it is never voided (a cancelled one has no
    // invoice left).
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
  // at least RESEND_WAIT_MS ago. Anything else leaves it uncertain, draft
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
    if (Date.now() - row.sendingAt.getTime() < RESEND_WAIT_MS) {
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
        manualBillId: true,
        status: true,
        draft: true,
        sellerTaxCode: true,
        symbolCode: true,
        sendingAt: true,
        updatedAt: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.assertRowAccess(user, row);
    // Before the draft is read: an invoice issued before spec 2026-10-02 §4.3
    // has none (those issued since keep their lines).
    if (row.status !== EinvoiceStatus.UNCERTAIN) {
      throw new ConflictException(NOT_UNCERTAIN);
    }
    // "Chưa có — gửi lại": a draft may be posted again.
    const recent = dto.found ? null : tooRecent(row);
    if (recent) throw new ConflictException(recent);
    const cutoff = new Date(Date.now() - RESEND_WAIT_MS);
    // An issued row keeps its lines (spec 2026-10-02 §4.3).
    const lines = dto.found ? parseDraft(row.draft).lines : [];
    const data: Prisma.EinvoiceUncheckedUpdateManyInput = dto.found
      ? {
          status: EinvoiceStatus.ISSUED,
          invoiceNumber: dto.invoiceNumber,
          vatAmount: totalsOf(lines).vatAmount,
          draft: issuedDraft(lines),
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
        manualBillId: true,
        sellerTaxCode: true,
        symbolCode: true,
        invoiceNumber: true,
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.assertRowAccess(user, row);
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
    // Gone meanwhile: its bill thêm tay was cancelled with its drafts.
    if (!now) return new NotFoundException('Không tìm thấy hóa đơn điện tử');
    if (now.status === EinvoiceStatus.DRAFT) {
      return new ConflictException(
        'Hóa đơn vừa được sửa, kiểm tra lại rồi xuất',
      );
    }
    return new ConflictException(
      now.status === EinvoiceStatus.UNCERTAIN
        ? 'Hóa đơn vừa được kiểm tra lại, tải lại rồi thử lại'
        : 'Hóa đơn đang được gửi hoặc đã xuất',
    );
  }

  // A SENDING row whose send has long ended (spec §9.1: saving its outcome
  // failed) becomes UNCERTAIN; a send still running here is left alone.
  // record() still writes by id, so a result that arrives later lands over it.
  private async sweepStaleSending(
    target: { id: number } | { orderId: number } | { manualBillId: number },
  ) {
    let where: Prisma.EinvoiceWhereInput;
    if ('id' in target) {
      if (this.sending.has(target.id)) return false;
      where = { id: target.id };
    } else {
      where = {
        ...target,
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
    // Issued: the header and the lines stay, the buyer's details go (spec
    // 2026-10-02 §4.3).
    const header = {
      status: EinvoiceStatus.ISSUED,
      minvoiceId: outcome.minvoiceId,
      sellerTaxCode: outcome.config.taxCode,
      symbolCode: outcome.config.symbolCode,
      registerInvoiceId: outcome.config.registerInvoiceId,
      ...(extra.foundDate ? { invoiceDate: toDbDate(extra.foundDate) } : {}),
      vatAmount: totalsOf(lines).vatAmount,
      draft: issuedDraft(lines),
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

  private async assertAccess(user: AuthUser, id: number) {
    const row = await this.prisma.einvoice.findUnique({
      where: { id },
      select: { branchId: true, manualBillId: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy hóa đơn điện tử');
    this.assertRowAccess(user, row);
  }

  // The branch of an invoice, and for one of a bill thêm tay the report site
  // too (spec 2026-10-02 §8): invoice ids are easy to guess, so every route
  // reaching one by id checks both. manualBillId is required, not optional:
  // a read that forgets to select it must not compile, or the report-site
  // check would pass for every row.
  private assertRowAccess(
    user: AuthUser,
    row: { branchId: number; manualBillId: number | null },
  ) {
    this.scope.assertBranchAccess(user, row.branchId);
    if (row.manualBillId != null && !canUseReportSite(user)) {
      throw new ForbiddenException(REPORT_SITE_ONLY);
    }
  }
}
