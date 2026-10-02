import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { toDateString, toDbDate } from '../common/dates';
import type { IssueConfig } from './einvoice-config.service';
import type { SendOutcome } from './einvoice-sender';
import { EinvoicesService, RESEND_WAIT_MS } from './einvoices.service';
import type { MarkerSearch } from './minvoice/minvoice-client';

const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
const ready: IssueConfig = {
  branchId: 1,
  taxCode: '0107811836',
  symbolCode: `1C${yy}MTT`,
  registerInvoiceId: 'range-1',
  currencyId: 'vnd-id',
  seller: {} as IssueConfig['seller'],
  session: { cookie: 'sess-secret', token: 'xsrf-secret', userName: 'admin' },
};
const line = {
  name: 'Dịch vụ karaoke bí mật',
  unit: 'Lần',
  quantity: 1,
  unitPrice: 909091,
  vatRate: 10,
};
const user = { id: 7, role: 'CHAIN_MANAGER' } as AuthUser;
const dto = { invoiceDate: toDateString(new Date()) };
const dbDown = () =>
  new Prisma.PrismaClientKnownRequestError('Timed out fetching a connection', {
    code: 'P2024',
    clientVersion: '5.22.0',
  });
const clash = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
const issued: SendOutcome = {
  kind: 'issued',
  minvoiceId: 'inv-1015',
  invoiceNumber: 1015,
  config: ready,
};

// The row issue() reads for a draft.
const draftRow = () => ({
  branchId: 1,
  status: 'DRAFT',
  amount: 1000000,
  buyerTaxCode: null,
  buyerName: null,
  draft: { buyerAddress: null, buyerEmail: null, lines: [line] },
  updatedAt: new Date(),
  sellerTaxCode: null,
  symbolCode: null,
  registerInvoiceId: null,
  invoiceDate: toDbDate('2026-10-01'),
  order: { status: 'COMPLETED' },
});

function setup(outcome: SendOutcome) {
  const einvoice = {
    findUnique: jest.fn().mockResolvedValue(draftRow()),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue({ id: 3 }),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
  };
  const order = { findUnique: jest.fn() };
  const sender = { send: jest.fn().mockResolvedValue(outcome) };
  const config = {
    readyForIssue: jest.fn().mockResolvedValue(ready),
    latestIssued: jest.fn().mockResolvedValue(null),
    findByMarker: jest.fn<Promise<MarkerSearch>, unknown[]>(),
  };
  const service = new EinvoicesService(
    { einvoice, order } as never,
    {} as never,
    { assertBranchAccess: jest.fn() } as never,
    config as never,
    sender as never,
  );
  const log = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  return { service, einvoice, order, sender, config, log };
}

// Spec §9.1: a failed write of the outcome is logged with the invoice and
// what Minvoice answered, never the payload, draft or session.
describe('EinvoicesService.issue when saving the outcome fails', () => {
  afterEach(() => jest.restoreAllMocks());

  const logged = (log: jest.SpyInstance) => {
    expect(log).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(log.mock.calls[0]);
    for (const secret of ['sess-secret', 'xsrf-secret', line.name]) {
      expect(text).not.toContain(secret);
    }
    return text;
  };

  it('logs the number Minvoice issued, then rethrows', async () => {
    const { service, einvoice, log } = setup(issued);
    const error = dbDown();
    einvoice.update.mockRejectedValueOnce(error);
    await expect(service.issue(user, 12, dto)).rejects.toBe(error);
    const text = logged(log);
    for (const part of ['Einvoice 12', 'issued', '1015', 'inv-1015', 'P2024']) {
      expect(text).toContain(part);
    }
    // The send has ended: the row left SENDING may now be swept.
    einvoice.findUnique.mockResolvedValueOnce({
      id: 12,
      branchId: 1,
      status: 'SENDING',
      invoiceDate: toDbDate('2026-10-01'),
    });
    await service.findOne(user, 12);
    expect(einvoice.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 12,
          status: 'SENDING',
        }) as unknown,
      }),
    );
  });

  it('logs a failed write after a number clash too', async () => {
    const { service, einvoice, log } = setup(issued);
    const error = dbDown();
    einvoice.update.mockRejectedValueOnce(clash()).mockRejectedValueOnce(error);
    await expect(service.issue(user, 12, dto)).rejects.toBe(error);
    const text = logged(log);
    expect(text).toContain('1015');
    expect(text).toContain('inv-1015');
  });

  it.each<SendOutcome>([
    { kind: 'failed', message: 'Minvoice trả lỗi HTTP 400' },
    { kind: 'uncertain', message: 'Minvoice không trả lời kịp' },
  ])('logs a failed write of a $kind outcome', async (outcome) => {
    const { service, einvoice, log } = setup(outcome);
    const error = dbDown();
    einvoice.update.mockRejectedValueOnce(error);
    await expect(service.issue(user, 12, dto)).rejects.toBe(error);
    expect(logged(log)).toContain(`${outcome.kind} outcome`);
  });

  it('logs nothing when the outcome is saved', async () => {
    const { service, einvoice, log } = setup(issued);
    await service.issue(user, 12, dto);
    expect(einvoice.update).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});

// The stale-SENDING sweep never touches a send this backend is still
// running, however old its sendingAt looks.
describe('EinvoicesService stale SENDING sweep', () => {
  afterEach(() => jest.restoreAllMocks());

  const sending = {
    id: 12,
    branchId: 1,
    status: 'SENDING',
    invoiceDate: toDbDate('2026-10-01'),
  };
  const sweeps = (einvoice: ReturnType<typeof setup>['einvoice']) =>
    einvoice.updateMany.mock.calls
      .map(([arg]) => (arg as { where: Record<string, unknown> }).where)
      .filter((where) => where.status === 'SENDING' && 'sendingAt' in where);

  it('skips an id whose send is running, sweeps it once the send ended', async () => {
    const { service, einvoice, order, sender } = setup(issued);
    let finish!: (outcome: SendOutcome) => void;
    sender.send.mockReturnValueOnce(
      new Promise<SendOutcome>((resolve) => (finish = resolve)),
    );
    order.findUnique.mockResolvedValue({
      id: 5,
      branchId: 1,
      status: 'COMPLETED',
      startTime: null,
      endTime: null,
      items: [],
    });
    einvoice.findMany.mockResolvedValue([sending]);

    const issuing = service.issue(user, 12, dto);
    await new Promise((resolve) => setImmediate(resolve));
    expect(sender.send).toHaveBeenCalledTimes(1);

    einvoice.findUnique.mockResolvedValueOnce(sending);
    await service.findOne(user, 12);
    expect(sweeps(einvoice)).toEqual([]);
    await service.billDetail(user, 5);
    expect(sweeps(einvoice)).toEqual([
      expect.objectContaining({ orderId: 5, id: { notIn: [12] } }),
    ]);

    finish(issued);
    await issuing;
    einvoice.updateMany.mockClear();
    einvoice.findUnique.mockResolvedValueOnce(sending);
    await service.findOne(user, 12);
    await service.billDetail(user, 5);
    const [byId, byOrder] = sweeps(einvoice);
    expect(byId).toMatchObject({ id: 12 });
    expect((byId.sendingAt as { lt: unknown }).lt).toBeInstanceOf(Date);
    expect(byOrder).toMatchObject({ orderId: 5 });
    expect(byOrder).not.toHaveProperty('id');
  });
});

// Spec §9.2: an uncertain invoice is looked up by our reference before it is
// ever sent again; only a sure answer moves it on.
describe('EinvoicesService.issue of an uncertain invoice', () => {
  afterEach(() => jest.restoreAllMocks());

  const sentSymbol = `1C${yy}OLD`;
  const sentDate = `${new Date().getFullYear()}-01-02`;
  // When the lost send started: long enough ago for a resend by default.
  const lostAt = new Date(Date.now() - RESEND_WAIT_MS - 60_000);
  const sent = {
    status: 'UNCERTAIN',
    sellerTaxCode: ready.taxCode,
    symbolCode: sentSymbol,
    registerInvoiceId: 'range-0',
    invoiceDate: toDbDate(sentDate),
    sendingAt: lostAt,
  };
  const uncertain = (fields: Record<string, unknown> = {}) => {
    const context = setup(issued);
    context.einvoice.findUnique.mockResolvedValueOnce({
      ...draftRow(),
      ...sent,
      ...fields,
    });
    // No other row holds the number found.
    context.einvoice.findFirst.mockResolvedValue(null);
    return context;
  };
  const writes = (einvoice: ReturnType<typeof setup>['einvoice']) =>
    einvoice.update.mock.calls.map(
      ([arg]) => (arg as { data: Record<string, unknown> }).data,
    );
  const MANUAL = 'kiểm tra trên Minvoice rồi đối chiếu bằng tay';

  it('locks it without touching what was sent, then records the invoice found', async () => {
    const { service, einvoice, sender, config } = uncertain();
    config.findByMarker.mockResolvedValue({
      kind: 'found',
      id: 'inv-2001',
      invoiceNumber: 2001,
      invoiceDate: sentDate,
      markerSeen: true,
    });
    await service.issue(user, 12, dto);

    const [lock] = einvoice.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(lock.where).toMatchObject({ id: 12, status: 'UNCERTAIN' });
    expect(lock.where.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(lock.data).sort()).toEqual([
      'lastError',
      'sendingAt',
      'status',
    ]);
    expect(lock.data.status).toBe('SENDING');
    expect(lock.data.sendingAt).not.toEqual(lostAt);
    expect(config.findByMarker).toHaveBeenCalledWith(1, ready.taxCode, {
      symbolCode: sentSymbol,
      invoiceDate: sentDate,
      marker: 'K502-12',
    });
    expect(sender.send).not.toHaveBeenCalled();
    // (sellerTaxCode, symbolCode, invoiceNumber) is unique: an index lookup.
    expect(einvoice.findFirst).toHaveBeenCalledWith({
      where: {
        sellerTaxCode: ready.taxCode,
        symbolCode: sentSymbol,
        invoiceNumber: 2001,
        id: { not: 12 },
      },
      select: { id: true },
    });
    expect(writes(einvoice)).toEqual([
      expect.objectContaining({
        status: 'ISSUED',
        invoiceNumber: 2001,
        minvoiceId: 'inv-2001',
        sellerTaxCode: ready.taxCode,
        symbolCode: sentSymbol,
        registerInvoiceId: 'range-0',
        invoiceDate: toDbDate(sentDate),
        draft: { lines: [line] },
        lastError: null,
        sendingAt: null,
      }),
    ]);
  });

  // A row that does not show orderNumber (the real list does, 01/10/2026;
  // this is the defensive case): a single row is ours only if Minvoice really
  // filtered by it.
  it.each([false, true])(
    'takes a row that does not show our reference only when the search is confirmed (%s)',
    async (confirmed) => {
      const { service, einvoice, sender, config } = uncertain();
      service.markerSearchConfirmed = confirmed;
      config.findByMarker.mockResolvedValue({
        kind: 'found',
        id: 'inv-2001',
        invoiceNumber: 2001,
        invoiceDate: sentDate,
        markerSeen: false,
      });
      await service.issue(user, 12, dto);
      expect(sender.send).not.toHaveBeenCalled();
      const [write] = writes(einvoice);
      expect(writes(einvoice)).toHaveLength(1);
      if (confirmed) {
        expect(write).toMatchObject({ status: 'ISSUED', invoiceNumber: 2001 });
        return;
      }
      expect(write).toEqual({
        status: 'UNCERTAIN',
        lastError: `Có thể là hóa đơn số 2001 ngày ${sentDate.split('-').reverse().join('/')} trên Minvoice (chưa chắc Minvoice lọc theo mã K502-12); ${MANUAL}`,
        sendingAt: lostAt,
      });
    },
  );

  // Our own rows disagree with the search: doubt, never a silent fix.
  it('leaves it uncertain with its draft when the number found is already ours', async () => {
    const { service, einvoice, config } = uncertain();
    config.findByMarker.mockResolvedValue({
      kind: 'found',
      id: 'inv-2001',
      invoiceNumber: 2001,
      invoiceDate: sentDate,
      markerSeen: true,
    });
    einvoice.findFirst.mockResolvedValue({ id: 3 });
    await service.issue(user, 12, dto);
    expect(writes(einvoice)).toEqual([
      {
        status: 'UNCERTAIN',
        lastError: `Số 2001 mà Minvoice trả về cho K502-12 đã có ở hóa đơn #3; ${MANUAL}`,
        sendingAt: lostAt,
      },
    ]);
  });

  it('does the same when the number is taken while it is written', async () => {
    const { service, einvoice, config } = uncertain();
    config.findByMarker.mockResolvedValue({
      kind: 'found',
      id: 'inv-2001',
      invoiceNumber: 2001,
      invoiceDate: sentDate,
      markerSeen: true,
    });
    einvoice.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 5 });
    einvoice.update.mockRejectedValueOnce(clash());
    await service.issue(user, 12, dto);
    const [attempt, fallback] = writes(einvoice);
    expect(attempt).toMatchObject({ status: 'ISSUED', invoiceNumber: 2001 });
    expect(fallback).toEqual({
      status: 'UNCERTAIN',
      lastError: `Số 2001 mà Minvoice trả về cho K502-12 đã có ở hóa đơn #5; ${MANUAL}`,
      sendingAt: lostAt,
    });
  });

  it.each<[string, () => Promise<MarkerSearch>, RegExp]>([
    [
      'an ambiguous answer',
      () => Promise.resolve({ kind: 'ambiguous' }),
      /^Minvoice trả về kết quả không rõ khi tìm hóa đơn K502-12/,
    ],
    [
      'a failed search',
      () =>
        Promise.reject(new Error('Không kết nối được Minvoice (ENOTFOUND)')),
      /^Không tìm được hóa đơn K502-12 trên Minvoice, .*ENOTFOUND/,
    ],
    [
      'nothing found while the search is unconfirmed',
      () => Promise.resolve({ kind: 'none' }),
      // Never worded as leave to press "Chưa có": the search is not trusted.
      /^Tìm tự động không thấy hóa đơn K502-12, nhưng cách tìm này chưa được kiểm chứng: chưa chắc Minvoice chưa có hóa đơn; /,
    ],
  ])(
    'leaves it uncertain after %s, sending nothing',
    async (_, search, message) => {
      const { service, einvoice, sender, config } = uncertain();
      config.findByMarker.mockImplementation(search);
      await service.issue(user, 12, dto);
      expect(sender.send).not.toHaveBeenCalled();
      const [write] = writes(einvoice);
      expect(writes(einvoice)).toHaveLength(1);
      // Back to the time of the lost send, not of this search.
      expect(write).toEqual({
        status: 'UNCERTAIN',
        lastError: expect.stringMatching(message) as unknown,
        sendingAt: lostAt,
      });
      expect(write.lastError).toContain(MANUAL);
    },
  );

  it.each<[string, Record<string, unknown>, RegExp]>([
    ['without the symbol of the send', { symbolCode: null }, /ký hiệu/],
    ['without the date of the send', { invoiceDate: null }, /ký hiệu/],
    [
      'sent under another tax code',
      { sellerTaxCode: '0100000001' },
      /MST 0100000001/,
    ],
  ])('does not search %s', async (_, fields, message) => {
    const { service, einvoice, sender, config } = uncertain(fields);
    await service.issue(user, 12, dto);
    expect(config.findByMarker).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
    expect(writes(einvoice)).toEqual([
      {
        status: 'UNCERTAIN',
        lastError: expect.stringMatching(message) as unknown,
        sendingAt: lostAt,
      },
    ]);
  });

  // Minvoice may still be saving a send whose answer was lost: an empty list
  // proves nothing until that send is well past (RESEND_WAIT_MS).
  it.each<[string, Date | null, RegExp]>([
    [
      'started moments ago',
      new Date(Date.now() - 10_000),
      /^Chưa tìm thấy hóa đơn K502-12 trên Minvoice nhưng lần gửi trước còn quá mới; kiểm tra lại sau vài phút/,
    ],
    [
      'of unknown time',
      null,
      /^Chưa tìm thấy hóa đơn K502-12 trên Minvoice và không rõ lúc gửi trước; /,
    ],
  ])(
    'does not send again after a lost send %s, even when trusted',
    async (_, sendingAt, message) => {
      const { service, einvoice, sender, config } = uncertain({ sendingAt });
      service.markerSearchConfirmed = true;
      config.findByMarker.mockResolvedValue({ kind: 'none' });
      await service.issue(user, 12, dto);
      expect(sender.send).not.toHaveBeenCalled();
      const [write] = writes(einvoice);
      expect(writes(einvoice)).toHaveLength(1);
      expect(write).toEqual({
        status: 'UNCERTAIN',
        lastError: expect.stringMatching(message) as unknown,
        sendingAt,
      });
      expect(write.lastError).toContain(MANUAL);
    },
  );

  it('sends once more when nothing is found and the search is confirmed', async () => {
    const { service, einvoice, sender, config } = uncertain();
    service.markerSearchConfirmed = true;
    config.findByMarker.mockResolvedValue({ kind: 'none' });
    await service.issue(user, 12, dto);
    expect(sender.send).toHaveBeenCalledTimes(1);
    const [header, outcome] = writes(einvoice);
    // The header of this request is written before anything goes out.
    expect(header).toEqual({
      sellerTaxCode: ready.taxCode,
      symbolCode: ready.symbolCode,
      registerInvoiceId: ready.registerInvoiceId,
      invoiceDate: toDbDate(dto.invoiceDate),
      // The time of this send, for a later recheck of it.
      sendingAt: expect.any(Date) as unknown,
    });
    expect(header.sendingAt).not.toEqual(lostAt);
    expect(einvoice.update.mock.invocationCallOrder[0]).toBeLessThan(
      sender.send.mock.invocationCallOrder[0],
    );
    expect(outcome).toMatchObject({ status: 'ISSUED', invoiceNumber: 1015 });
  });

  it('keeps the stale-SENDING sweep away while it searches', async () => {
    const { service, einvoice, config } = uncertain();
    let answer!: (result: MarkerSearch) => void;
    config.findByMarker.mockReturnValue(
      new Promise<MarkerSearch>((resolve) => (answer = resolve)),
    );
    const issuing = service.issue(user, 12, dto);
    await new Promise((resolve) => setImmediate(resolve));
    expect(config.findByMarker).toHaveBeenCalledTimes(1);
    einvoice.findUnique.mockResolvedValueOnce({
      id: 12,
      branchId: 1,
      status: 'SENDING',
      invoiceDate: toDbDate('2026-10-01'),
    });
    await service.findOne(user, 12);
    // Only the lock ran, no sweep.
    expect(einvoice.updateMany).toHaveBeenCalledTimes(1);
    answer({ kind: 'ambiguous' });
    await issuing;
  });

  it('refuses an invoice being sent', async () => {
    const { service, config } = uncertain({ status: 'SENDING' });
    await expect(service.issue(user, 12, dto)).rejects.toThrow(
      'Hóa đơn đang được gửi',
    );
    expect(config.findByMarker).not.toHaveBeenCalled();
  });
});

describe('EinvoicesService.issue after an unexpected error', () => {
  afterEach(() => jest.restoreAllMocks());

  it('marks it uncertain with a Vietnamese reason', async () => {
    const { service, einvoice, sender } = setup(issued);
    sender.send.mockRejectedValue(new Error('boom'));
    await service.issue(user, 12, dto);
    expect(einvoice.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: {
        status: 'UNCERTAIN',
        lastError:
          'Lỗi không xác định khi gửi, hãy đối chiếu trên Minvoice: boom',
      },
    });
  });
});

// Spec §9.2: "Chưa có — gửi lại" sends the invoice back to draft, from where
// it may be posted again. Minvoice may still be saving the lost request (our
// timeout is not its own), so not before RESEND_WAIT_MS after that send.
describe('EinvoicesService.resolve', () => {
  afterEach(() => jest.restoreAllMocks());

  const hhmm = (date: Date) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const uncertainRow = (fields: Record<string, unknown>) => ({
    branchId: 1,
    status: 'UNCERTAIN',
    draft: { buyerAddress: null, buyerEmail: null, lines: [line] },
    sellerTaxCode: ready.taxCode,
    symbolCode: ready.symbolCode,
    updatedAt: new Date(),
    ...fields,
  });
  const resolving = (fields: Record<string, unknown>) => {
    const context = setup(issued);
    context.einvoice.findUnique.mockResolvedValueOnce(uncertainRow(fields));
    return context;
  };

  it('refuses to send back to draft a send that is still too recent', async () => {
    const sendingAt = new Date(Date.now() - 30_000);
    const { service, einvoice } = resolving({ sendingAt });
    const error = await service
      .resolve(user, 12, { found: false })
      .catch((e: unknown) => e);
    // The minute from which it may be done, rounded up.
    const allowed = new Date(
      Math.ceil((sendingAt.getTime() + RESEND_WAIT_MS) / 60_000) * 60_000,
    );
    expect(error).toMatchObject({
      status: 409,
      message: `Lần gửi lúc ${hhmm(sendingAt)} còn quá mới, đợi đến ${hhmm(allowed)} rồi kiểm tra lại trên Minvoice`,
    });
    expect(einvoice.updateMany).not.toHaveBeenCalled();
  });

  it('sends back to draft once the send is old enough, checked in the write', async () => {
    const sendingAt = new Date(Date.now() - RESEND_WAIT_MS - 1000);
    const { service, einvoice } = resolving({ sendingAt });
    einvoice.findUnique.mockResolvedValueOnce({
      id: 12,
      branchId: 1,
      status: 'DRAFT',
      invoiceDate: toDbDate('2026-10-01'),
    });
    await service.resolve(user, 12, { found: false });
    const [{ where, data }] = einvoice.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    // A send started after the row was read (a recheck) is not cleared.
    expect(where).toEqual({
      id: 12,
      status: 'UNCERTAIN',
      OR: [
        { sendingAt: { lte: expect.any(Date) as unknown } },
        { sendingAt: null, updatedAt: { lte: expect.any(Date) as unknown } },
      ],
    });
    expect(data).toMatchObject({ status: 'DRAFT', sendingAt: null });
    // The date stays: on a draft it is the date planned.
    expect(data).not.toHaveProperty('invoiceDate');
  });

  it('goes by the last write when the time of the send is unknown', async () => {
    const updatedAt = new Date(Date.now() - 30_000);
    const { service, einvoice } = resolving({ sendingAt: null, updatedAt });
    await expect(
      service.resolve(user, 12, { found: false }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(
        new RegExp(
          `^Không rõ lúc gửi; hóa đơn đổi lần cuối lúc ${hhmm(updatedAt)}, đợi đến `,
        ),
      ) as unknown,
    });
    expect(einvoice.updateMany).not.toHaveBeenCalled();
  });

  it('records a number found on Minvoice whatever the age of the send', async () => {
    const { service, einvoice } = resolving({ sendingAt: new Date() });
    einvoice.findUnique.mockResolvedValueOnce({
      id: 12,
      branchId: 1,
      status: 'ISSUED',
      invoiceDate: toDbDate('2026-10-01'),
    });
    await service.resolve(user, 12, { found: true, invoiceNumber: 1015 });
    const [{ where }] = einvoice.updateMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toEqual({ id: 12, status: 'UNCERTAIN' });
  });

  it('explains a send that became recent between the read and the write', async () => {
    const { service, einvoice } = resolving({
      sendingAt: new Date(Date.now() - RESEND_WAIT_MS - 1000),
    });
    einvoice.updateMany.mockResolvedValueOnce({ count: 0 });
    const sendingAt = new Date();
    einvoice.findUnique.mockResolvedValueOnce(uncertainRow({ sendingAt }));
    await expect(
      service.resolve(user, 12, { found: false }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(
        new RegExp(`^Lần gửi lúc ${hhmm(sendingAt)} còn quá mới`),
      ) as unknown,
    });
  });
});

describe('EinvoicesService.editNumber', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs who changed the number from what to what', async () => {
    const { service, einvoice } = setup(issued);
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    einvoice.findUnique
      .mockResolvedValueOnce({
        branchId: 1,
        sellerTaxCode: ready.taxCode,
        symbolCode: ready.symbolCode,
        invoiceNumber: 1015,
      })
      .mockResolvedValueOnce({
        id: 12,
        branchId: 1,
        status: 'ISSUED',
        invoiceDate: toDbDate('2026-10-01'),
      });
    await service.editNumber(user, 12, { invoiceNumber: 1016 });
    expect(log).toHaveBeenCalledWith(
      'Einvoice 12: number 1015 → 1016 by user 7',
    );
  });

  it('logs nothing when the number was not changed', async () => {
    const { service, einvoice } = setup(issued);
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    einvoice.findUnique.mockResolvedValueOnce({
      branchId: 1,
      sellerTaxCode: ready.taxCode,
      symbolCode: ready.symbolCode,
      invoiceNumber: 1015,
    });
    einvoice.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.editNumber(user, 12, { invoiceNumber: 1016 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(log).not.toHaveBeenCalled();
  });
});

// A SENDING row is pending work too: one whose send was cut off stays
// SENDING until it is opened, and must not drop out of the tabs meanwhile.
describe('EinvoicesService pending "Không rõ" work', () => {
  const pending = { in: ['SENDING', 'UNCERTAIN'] };

  it('counts them together', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const service = new EinvoicesService(
      {} as never,
      {
        einvoice: {
          count,
          aggregate: jest.fn().mockResolvedValue({
            _count: { _all: 0 },
            _sum: { amount: null, vatAmount: null },
          }),
        },
      } as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      {} as never,
      {} as never,
    );
    await service.summary(user, {});
    expect(count).toHaveBeenCalledWith({
      where: { branchId: 1, orderId: { not: null }, status: pending },
    });
  });

  it('counts every invoice of the branch for the report site', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const service = new EinvoicesService(
      {} as never,
      {
        einvoice: {
          count,
          aggregate: jest.fn().mockResolvedValue({
            _count: { _all: 0 },
            _sum: { amount: null, vatAmount: null },
          }),
        },
      } as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      {} as never,
      {} as never,
    );
    await service.summary(user, {}, 'report');
    expect(count).toHaveBeenCalledWith({
      where: { branchId: 1, status: pending },
    });
  });
});

// A service whose prisma creates and updates drafts (create, update). A bill
// thêm tay is read under its lock in a transaction (`tx`).
const creating = () => {
  const einvoice = {
    create: jest.fn().mockResolvedValue({ id: 40 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn().mockResolvedValue({
      id: 40,
      branchId: 1,
      status: 'DRAFT',
      invoiceDate: toDbDate('2026-10-01'),
    }),
  };
  const order = { findUnique: jest.fn() };
  // The bill's row, or the next report number (ReportCounter).
  const billRow = {
    branchId: 3,
    businessDate: toDbDate('2026-09-01'),
    cancelledAt: null,
    roomName: 'P401',
  };
  const tx = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray): Promise<object[]> =>
        Promise.resolve(
          strings.join('').includes('"ReportCounter"')
            ? [{ lastSeq: 7 }]
            : [billRow],
        ),
    ),
    einvoice,
  };
  const prisma = {
    einvoice,
    order,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const scope = {
    resolveBranchId: jest.fn().mockResolvedValue(3),
    assertBranchAccess: jest.fn(),
  };
  const service = new EinvoicesService(
    prisma as never,
    {} as never,
    scope as never,
    {} as never,
    {} as never,
  );
  return { service, einvoice, order, scope, tx };
};
// The `data` of the n-th call of a prisma create/update mock.
const dataOf = (mock: jest.Mock, call = 0) =>
  (mock.mock.calls[call] as [{ data: Record<string, unknown> }])[0].data;

describe('EinvoicesService invoices of a bill thêm tay', () => {
  afterEach(() => jest.restoreAllMocks());
  const cashier = { id: 8, role: 'CASHIER', reportAccess: false } as AuthUser;

  it('need exactly one bill', async () => {
    const { service } = creating();
    await expect(
      service.create(user, { amount: 0, lines: [] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(user, {
        orderId: 5,
        manualBillId: 9,
        amount: 0,
        lines: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('are made under the lock of their bill, on its branch and day', async () => {
    const { service, einvoice, tx } = creating();
    await service.create(user, { manualBillId: 9, amount: 110000, lines: [] });
    // The bill's lock, then its number.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(dataOf(einvoice.create)).toMatchObject({
      branchId: 3,
      manualBillId: 9,
      businessDate: toDbDate('2026-09-01'),
      invoiceDate: toDbDate('2026-09-01'),
      reportDate: toDbDate('2026-09-01'),
      reportSeq: 7,
      reportNumber: '01094010007',
      amount: 110000,
      vatAmount: 10000,
    });
    expect(dataOf(einvoice.create)).not.toHaveProperty('orderId');
  });

  it('are refused on a cancelled bill', async () => {
    const { service, tx, einvoice } = creating();
    tx.$queryRaw.mockResolvedValueOnce([
      {
        branchId: 3,
        businessDate: toDbDate('2026-09-01'),
        cancelledAt: new Date(),
        roomName: null,
      },
    ]);
    await expect(
      service.create(user, { manualBillId: 9, amount: 1, lines: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(einvoice.create).not.toHaveBeenCalled();
  });

  it('are out of reach of whoever may not use the report site', async () => {
    const { service, tx, einvoice } = creating();
    await expect(
      service.create(cashier, { manualBillId: 9, amount: 1, lines: [] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    einvoice.findUnique.mockResolvedValueOnce({
      id: 41,
      branchId: 1,
      manualBillId: 9,
      status: 'DRAFT',
      invoiceDate: toDbDate('2026-10-01'),
    });
    await expect(service.findOne(cashier, 41)).rejects.toMatchObject({
      status: 403,
    });
  });

  // The routes only the chain manager reaches (issue, resolve, number) cannot
  // show this over HTTP, so the service is called with a cashier directly.
  it('are refused on every route that takes an invoice by id', async () => {
    const { service, einvoice } = setup(issued);
    einvoice.findUnique.mockResolvedValue({ ...draftRow(), manualBillId: 9 });
    const calls = [
      () => service.update(cashier, 12, { amount: 0, lines: [] }),
      () => service.remove(cashier, 12),
      () => service.issue(cashier, 12, dto),
      () => service.resolve(cashier, 12, { found: false }),
      () => service.editNumber(cashier, 12, { invoiceNumber: 1 }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ status: 403 });
    }
    expect(einvoice.updateMany).not.toHaveBeenCalled();
    expect(einvoice.update).not.toHaveBeenCalled();
  });

  it('are issued without an order to check', async () => {
    const { service, einvoice, sender } = setup(issued);
    einvoice.findUnique.mockResolvedValueOnce({
      ...draftRow(),
      order: null,
      manualBillId: 9,
    });
    await service.issue(user, 12, dto);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});

describe('EinvoicesService invoice dates', () => {
  afterEach(() => jest.restoreAllMocks());

  it('dates a new draft by the calendar day its bill was paid, not its business day', async () => {
    const { service, einvoice, order } = creating();
    order.findUnique.mockResolvedValue({
      id: 5,
      branchId: 1,
      status: 'COMPLETED',
      businessDate: toDbDate('2026-09-29'),
      endTime: new Date(2026, 8, 30, 0, 24),
    });
    await service.create(user, { orderId: 5, amount: 0, lines: [] });
    // Numbered on the invoice date, inside a transaction.
    expect(dataOf(einvoice.create)).toMatchObject({
      businessDate: toDbDate('2026-09-29'),
      invoiceDate: toDbDate('2026-09-30'),
      reportDate: toDbDate('2026-09-30'),
      reportNumber: '30090000007',
    });
  });

  it('dates a draft of a bill thêm tay by the day of the bill, or as asked', async () => {
    const { service, einvoice } = creating();
    await service.create(user, { manualBillId: 9, amount: 0, lines: [] });
    await service.create(user, {
      manualBillId: 9,
      amount: 0,
      lines: [],
      invoiceDate: '2026-12-31',
    });
    expect(dataOf(einvoice.create, 0).invoiceDate).toEqual(
      toDbDate('2026-09-01'),
    );
    expect(dataOf(einvoice.create, 1).invoiceDate).toEqual(
      toDbDate('2026-12-31'),
    );
  });

  it('changes the date of a draft only when one is sent', async () => {
    const { service, einvoice } = creating();
    await service.update(user, 40, {
      amount: 0,
      lines: [],
      invoiceDate: '2026-10-02',
    });
    await service.update(user, 40, { amount: 0, lines: [] });
    expect(dataOf(einvoice.updateMany, 0).invoiceDate).toEqual(
      toDbDate('2026-10-02'),
    );
    expect(dataOf(einvoice.updateMany, 1)).not.toHaveProperty('invoiceDate');
    await expect(
      service.update(user, 40, {
        amount: 0,
        lines: [],
        invoiceDate: '2026-02-30',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the date of a send that ends as a draft', async () => {
    const { service, einvoice } = setup({
      kind: 'failed',
      message: 'Minvoice từ chối',
    });
    await service.issue(user, 12, dto);
    const data = dataOf(einvoice.update);
    expect(data).toMatchObject({ status: 'DRAFT', symbolCode: null });
    expect(data).not.toHaveProperty('invoiceDate');
  });
});

describe('EinvoicesService.bills', () => {
  const listing = () => {
    const order = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const service = new EinvoicesService(
      { order, einvoice: { groupBy: jest.fn() } } as never,
      {} as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      {} as never,
      {} as never,
    );
    const whereOf = () =>
      (order.findMany.mock.calls[0] as [{ where: unknown }])[0].where;
    return { service, whereOf };
  };
  const september = {
    gte: toDbDate('2026-09-01'),
    lte: toDbDate('2026-09-30'),
  };

  it('lists the paid bills of a range of days', async () => {
    const { service, whereOf } = listing();
    await service.bills(user, { from: '2026-09-01', to: '2026-09-30' });
    expect(whereOf()).toEqual({
      branchId: 1,
      status: 'COMPLETED',
      businessDate: september,
    });
  });

  it('lists the bills holding pending work whatever their day, voided ones too', async () => {
    const { service, whereOf } = listing();
    await service.bills(user, {
      status: 'UNCERTAIN',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(whereOf()).toEqual({
      branchId: 1,
      einvoices: {
        some: { branchId: 1, status: { in: ['SENDING', 'UNCERTAIN'] } },
      },
    });
  });

  it('dates issued invoices, not their bills', async () => {
    const { service, whereOf } = listing();
    await service.bills(user, {
      status: 'ISSUED',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(whereOf()).toEqual({
      branchId: 1,
      einvoices: {
        some: { branchId: 1, status: 'ISSUED', businessDate: september },
      },
    });
  });

  it('refuses a range that ends before it starts', async () => {
    const { service } = listing();
    await expect(
      service.bills(user, { from: '2026-09-30', to: '2026-09-01' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
