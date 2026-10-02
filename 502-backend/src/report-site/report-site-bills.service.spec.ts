import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { ReportSiteBillsService } from './report-site-bills.service';

// What the e2e suite cannot reach (it never holds 500 bills): the merge of
// the two capped lists, the cap and the count, and the counted rule per bill.

const user = { id: 1, role: 'CHAIN_MANAGER' } as AuthUser;
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const at = new Date('2026-10-02T12:00:00Z');

const order = (id: number, billSeq: number, extra = {}) => ({
  id,
  billNumber: `o${billSeq}`,
  businessDate: day('2026-10-02'),
  billSeq,
  endTime: at,
  cancelledAt: null,
  finalAmount: 500,
  room: { name: 'P401' },
  ...extra,
});
const manualBill = (id: number, billSeq: number, extra = {}) => ({
  id,
  billNumber: `m${billSeq}`,
  businessDate: day('2026-10-02'),
  billSeq,
  createdAt: at,
  cancelledAt: null,
  room: null,
  ...extra,
});
const group = (
  orderId: number,
  status: string,
  amount: number,
  vat: number,
) => ({
  orderId,
  manualBillId: null,
  status,
  _sum: { amount, vatAmount: vat },
  _count: { _all: 1 },
});

function setup(lists: {
  orders: unknown[];
  manual: unknown[];
  orderCount: number;
  manualCount: number;
  groups?: unknown[];
  picked?: unknown[];
}) {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue(lists.picked ?? []),
    order: {
      findMany: jest.fn().mockResolvedValue(lists.orders),
      count: jest.fn().mockResolvedValue(lists.orderCount),
    },
    manualBill: {
      findMany: jest.fn().mockResolvedValue(lists.manual),
      count: jest.fn().mockResolvedValue(lists.manualCount),
    },
    einvoice: { groupBy: jest.fn().mockResolvedValue(lists.groups ?? []) },
  };
  const scope = { resolveBranchId: jest.fn().mockResolvedValue(1) };
  const service = new ReportSiteBillsService(
    db as never,
    scope as never,
    {} as never,
  );
  return { service, db };
}

describe('ReportSiteBillsService.list', () => {
  it('keeps the newest 500 of both lists, and counts every match', async () => {
    // Paid bills take the even sequences, bills thêm tay the odd ones.
    const orders = Array.from({ length: 500 }, (_, i) =>
      order(i + 1, 1000 - 2 * i),
    );
    const manual = Array.from({ length: 500 }, (_, i) =>
      manualBill(10_000 + i, 999 - 2 * i),
    );
    const { service, db } = setup({
      orders,
      manual,
      orderCount: 700,
      manualCount: 650,
    });
    const [rows, total] = await service.list(user, { status: 'DRAFT' });
    expect(total).toBe(1350);
    expect(rows).toHaveLength(500);
    // 1000, 999, 998 … down to 501: the two lists interleaved.
    expect(rows.map((r) => r.billNumber?.slice(1))).toEqual(
      Array.from({ length: 500 }, (_, i) => String(1000 - i)),
    );
    expect(rows[0].orderId).toBe(1);
    expect(rows[1].manualBillId).toBe(10_000);
    for (const find of [db.order.findMany, db.manualBill.findMany]) {
      expect(find).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    }
  });

  it('puts a later day before an earlier one whatever the sequence', async () => {
    const { service } = setup({
      orders: [order(1, 999, { businessDate: day('2026-10-01') })],
      manual: [manualBill(2, 1)],
      orderCount: 1,
      manualCount: 1,
    });
    const [rows] = await service.list(user, { status: 'DRAFT' });
    expect(rows.map((r) => r.billNumber)).toEqual(['m1', 'o999']);
  });

  it('counts every invoice of a bill, only the issued ones of a voided bill', async () => {
    const { service } = setup({
      orders: [order(1, 2, { cancelledAt: at }), order(2, 1)],
      manual: [],
      orderCount: 2,
      manualCount: 0,
      groups: [1, 2].flatMap((id) => [
        group(id, 'ISSUED', 110, 10),
        group(id, 'DRAFT', 30, 3),
      ]),
    });
    const [voided, live] = (await service.list(user, { status: 'DRAFT' }))[0];
    expect(voided).toMatchObject({
      orderId: 1,
      total: 110,
      vat: 10,
      allocated: 140,
      einvoiceCount: 2,
      issuedCount: 1,
    });
    expect(live).toMatchObject({
      orderId: 2,
      total: 140,
      vat: 13,
      allocated: 140,
      einvoiceCount: 2,
      issuedCount: 1,
    });
  });

  // By day (Bill and Đã xuất tabs) the bills are picked in SQL by their
  // invoices' dates (spec 2026-10-02-bao-cao-theo-tung-hddt §3.3), then read
  // by id; a tab of every day or a search by number stays on Prisma's lists.
  it('picks the bills of the invoice dates in SQL, then reads them by id', async () => {
    const { service, db } = setup({
      orders: [order(5, 2)],
      manual: [manualBill(9, 1)],
      orderCount: 0,
      manualCount: 0,
      picked: [
        { orderId: 5, manualBillId: null, total: 812 },
        { orderId: null, manualBillId: 9, total: 812 },
      ],
    });
    const days = { from: '2026-09-01', to: '2026-09-30' };
    const [rows, total] = await service.list(user, days);
    expect(total).toBe(812);
    expect(rows.map((r) => r.billNumber)).toEqual(['o2', 'm1']);
    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [5] } } }),
    );
    expect(db.manualBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [9] } } }),
    );
    expect(db.order.count).not.toHaveBeenCalled();
    const [strings, ...params] = db.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toContain('"invoiceDate" BETWEEN');
    // The Bill tab adds the bills thêm tay of the days.
    expect(JSON.stringify(params)).toContain('ManualBill');
    expect(params).toEqual(
      expect.arrayContaining([1, '2026-09-01', '2026-09-30', 500]),
    );

    await service.list(user, { ...days, status: 'ISSUED' });
    const issuedParams = JSON.stringify(
      (db.$queryRaw.mock.calls[1] as unknown[]).slice(1),
    );
    expect(issuedParams).toContain('ISSUED');
    expect(issuedParams).not.toContain('ManualBill');
  });

  it('reads nothing more when no bill is picked', async () => {
    const { service, db } = setup({
      orders: [],
      manual: [],
      orderCount: 0,
      manualCount: 0,
    });
    expect(await service.list(user, {})).toEqual([[], 0]);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.manualBill.findMany).not.toHaveBeenCalled();
  });

  it('keeps every day for pending work and a search by number', async () => {
    const { service, db } = setup({
      orders: [],
      manual: [],
      orderCount: 0,
      manualCount: 0,
    });
    const days = { from: '2026-09-01', to: '2026-09-30' };
    await service.list(user, { ...days, status: 'DRAFT' });
    await service.list(user, { ...days, billNumber: '0110' });
    expect(db.$queryRaw).not.toHaveBeenCalled();
    const everyDay = expect.not.objectContaining({
      businessDate: expect.anything() as unknown,
    }) as unknown;
    expect(db.order.count).toHaveBeenNthCalledWith(1, { where: everyDay });
    expect(db.order.count).toHaveBeenNthCalledWith(2, { where: everyDay });
  });
});

describe('ReportSiteBillsService.summary', () => {
  // from/to reach the SQL as text for ::date, so the service checks them
  // itself instead of relying on EinvoicesService.summary running first.
  it('refuses a bad day before any SQL, whatever the counts call does', async () => {
    const db = { $queryRaw: jest.fn() };
    const scope = { resolveBranchId: jest.fn().mockResolvedValue(1) };
    const einvoices = { summary: jest.fn().mockResolvedValue({}) };
    const service = new ReportSiteBillsService(
      db as never,
      scope as never,
      einvoices as never,
    );
    for (const day of ['0000-01-01', '2026-02-30']) {
      await expect(
        service.summary(user, { from: day, to: day }),
      ).rejects.toThrow(BadRequestException);
    }
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
