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
}) {
  const db = {
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
    const [rows, total] = await service.list(user, {});
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
    const [rows] = await service.list(user, {});
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
    const [voided, live] = (await service.list(user, {}))[0];
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
});
