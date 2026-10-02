import { Injectable } from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { businessDateOf, fromDbDate, toDbDate } from '../common/dates';
import {
  EinvoiceBillsQuery,
  EinvoiceSummaryQuery,
} from '../einvoice/dto/einvoice.dto';
import { dateRange, statusWhere } from '../einvoice/einvoice-filters';
import { EinvoicesService } from '../einvoice/einvoices.service';
import { billNumberPrefixRange } from '../orders/bill-number';
import { ReportPrismaService } from '../prisma/report-prisma.service';
import { type EinvoiceSums, toEinvoiceMetrics } from './einvoice-metrics';
import { countedWhere, EINVOICE_SUM_COLUMNS } from './einvoice-sql';

// The newest bills a screen gets (docs/resource-rules.md §1.1).
const LIST_CAP = 500;

// A bill of the report site: a paid bill holding an e-invoice, or a bill thêm tay.
export interface ReportSiteBill {
  orderId: number | null;
  manualBillId: number | null;
  billNumber: string | null;
  businessDate: string | null;
  roomName: string | null;
  // When the bill was paid, or when the bill thêm tay was added.
  time: Date | null;
  cancelledAt: Date | null;
  // The bill's own total; null for a bill thêm tay (its invoices are its total).
  finalAmount: number | null;
  // Every invoice of the bill (what the HĐĐT page splits).
  allocated: number;
  // The sums of the invoices counted (spec §5.1): all of the bill's, or only
  // the issued ones when the bill is voided.
  total: number;
  vat: number;
  // How many invoices the bill holds, whatever their status, and how many of
  // them are issued; not the counted ones, so a voided bill's drafts are in
  // einvoiceCount.
  einvoiceCount: number;
  issuedCount: number;
}

interface Tally {
  count: number;
  amount: number;
  vat: number;
}
const tally = (): Tally => ({ count: 0, amount: 0, vat: 0 });

@Injectable()
export class ReportSiteBillsService {
  constructor(
    private db: ReportPrismaService,
    private scope: BranchScopeService,
    private einvoices: EinvoicesService,
  ) {}

  // Like GET /einvoices/bills (spec 2026-10-02 §6.1): the Bill tab lists the
  // days, a bill number every day, a status the bills holding an invoice of
  // it (every day for drafts, errors and uncertain ones; by day for issued).
  async list(
    user: AuthUser,
    query: EinvoiceBillsQuery,
  ): Promise<[ReportSiteBill[], number]> {
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const today = toDbDate(businessDateOf(new Date()));
    const days = dateRange(query.from, query.to) ?? { gte: today, lte: today };
    const number = query.billNumber
      ? { billNumber: billNumberPrefixRange(query.billNumber) }
      : {};
    const byDay =
      !query.billNumber && (!query.status || query.status === 'ISSUED');
    // Einvoice (branchId, businessDate) or (branchId, status, createdAt): a
    // bill's e-invoices carry its day.
    const einvoices = {
      some: {
        branchId,
        ...(query.status ? statusWhere(query.status) : {}),
        ...(byDay ? { businessDate: days } : {}),
      },
    };
    const orderWhere: Prisma.OrderWhereInput = {
      branchId,
      ...number,
      einvoices,
    };
    // Every bill thêm tay of the days, with or without an invoice; by status
    // or number like the paid bills.
    const manualWhere: Prisma.ManualBillWhereInput = {
      branchId,
      ...number,
      ...(query.status
        ? { einvoices }
        : query.billNumber
          ? {}
          : { businessDate: days }),
    };
    const newest = [
      { businessDate: 'desc' as const },
      { billSeq: 'desc' as const },
    ];
    const [orders, orderCount, manualBills, manualCount] = await Promise.all([
      this.db.order.findMany({
        where: orderWhere,
        select: {
          id: true,
          billNumber: true,
          businessDate: true,
          billSeq: true,
          endTime: true,
          cancelledAt: true,
          finalAmount: true,
          room: { select: { name: true } },
        },
        orderBy: newest,
        take: LIST_CAP,
      }),
      this.db.order.count({ where: orderWhere }),
      this.db.manualBill.findMany({
        where: manualWhere,
        select: {
          id: true,
          billNumber: true,
          businessDate: true,
          billSeq: true,
          createdAt: true,
          cancelledAt: true,
          room: { select: { name: true } },
        },
        orderBy: newest,
        take: LIST_CAP,
      }),
      this.db.manualBill.count({ where: manualWhere }),
    ]);

    // Newest day first, then the day's sequence, which both kinds share.
    const bills = [
      ...orders.map((o) => ({ kind: 'order' as const, ...o })),
      ...manualBills.map((m) => ({ kind: 'manual' as const, ...m })),
    ]
      .sort(
        (a, b) =>
          (b.businessDate?.getTime() ?? 0) - (a.businessDate?.getTime() ?? 0) ||
          (b.billSeq ?? 0) - (a.billSeq ?? 0),
      )
      .slice(0, LIST_CAP);

    // Per bill and status, in SQL (Einvoice orderId / manualBillId indexes).
    const orderIds = bills.filter((b) => b.kind === 'order').map((b) => b.id);
    const manualIds = bills.filter((b) => b.kind === 'manual').map((b) => b.id);
    const groups =
      bills.length === 0
        ? []
        : await this.db.einvoice.groupBy({
            by: ['orderId', 'manualBillId', 'status'],
            where: {
              OR: [
                { orderId: { in: orderIds } },
                { manualBillId: { in: manualIds } },
              ],
            },
            _sum: { amount: true, vatAmount: true },
            _count: { _all: true },
          });
    const sums = new Map<string, { all: Tally; issued: Tally }>();
    for (const group of groups) {
      const key =
        group.orderId !== null
          ? `order:${group.orderId}`
          : `manual:${group.manualBillId}`;
      const entry = sums.get(key) ?? { all: tally(), issued: tally() };
      const parts =
        group.status === EinvoiceStatus.ISSUED
          ? [entry.all, entry.issued]
          : [entry.all];
      for (const part of parts) {
        part.count += group._count._all;
        part.amount += Number(group._sum.amount ?? 0);
        part.vat += Number(group._sum.vatAmount ?? 0);
      }
      sums.set(key, entry);
    }

    const rows = bills.map((bill): ReportSiteBill => {
      const entry = sums.get(`${bill.kind}:${bill.id}`) ?? {
        all: tally(),
        issued: tally(),
      };
      // Only the issued invoices of a bill voided since (spec §5.1).
      const counted =
        bill.kind === 'order' && bill.cancelledAt ? entry.issued : entry.all;
      return {
        orderId: bill.kind === 'order' ? bill.id : null,
        manualBillId: bill.kind === 'manual' ? bill.id : null,
        billNumber: bill.billNumber,
        businessDate: bill.businessDate ? fromDbDate(bill.businessDate) : null,
        roomName: bill.room?.name ?? null,
        time: bill.kind === 'order' ? bill.endTime : bill.createdAt,
        cancelledAt: bill.cancelledAt,
        finalAmount: bill.kind === 'order' ? Number(bill.finalAmount) : null,
        allocated: entry.all.amount,
        total: counted.amount,
        vat: counted.vat,
        einvoiceCount: entry.all.count,
        issuedCount: entry.issued.count,
      };
    });
    return [rows, orderCount + manualCount];
  }

  // The tab counts (every invoice of the branch) and the sums of the days
  // for the Quản lý bán hàng tiles, both in SQL on the report pool.
  async summary(user: AuthUser, query: EinvoiceSummaryQuery) {
    // from and to reach the SQL below as text for ::date: check them here
    // instead of relying on einvoices.summary, which does it first.
    dateRange(query.from, query.to);
    const counts = await this.einvoices.summary(user, query, 'report');
    const branchId = await this.scope.resolveBranchId(user, query.branch);
    const today = businessDateOf(new Date());
    const from = query.from ?? query.to ?? today;
    const to = query.to ?? query.from ?? today;
    const [sums] = await this.db.$queryRaw<EinvoiceSums[]>`
      SELECT ${EINVOICE_SUM_COLUMNS}
      FROM "Einvoice" e
      LEFT JOIN "Order" o ON o."id" = e."orderId"
      WHERE ${countedWhere(branchId, from, to)}`;
    return { ...counts, ...toEinvoiceMetrics(sums) };
  }
}
