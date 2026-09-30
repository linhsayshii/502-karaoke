import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { toDateString } from '../common/dates';
import type { IssueConfig } from './einvoice-config.service';
import type { SendOutcome } from './einvoice-sender';
import { EinvoicesService } from './einvoices.service';

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

function setup(outcome: SendOutcome) {
  const einvoice = {
    findUnique: jest.fn().mockResolvedValue({
      branchId: 1,
      status: 'DRAFT',
      amount: 1000000,
      buyerTaxCode: null,
      buyerName: null,
      draft: { buyerAddress: null, buyerEmail: null, lines: [line] },
      updatedAt: new Date(),
      order: { status: 'COMPLETED' },
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue({ id: 3 }),
  };
  const service = new EinvoicesService(
    { einvoice } as never,
    {} as never,
    { assertBranchAccess: jest.fn() } as never,
    {
      readyForIssue: jest.fn().mockResolvedValue(ready),
      latestIssued: jest.fn().mockResolvedValue(null),
    } as never,
    { send: jest.fn().mockResolvedValue(outcome) } as never,
  );
  const log = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  return { service, einvoice, log };
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
