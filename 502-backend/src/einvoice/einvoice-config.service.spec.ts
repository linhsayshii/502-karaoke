import { BadRequestException } from '@nestjs/common';
import { EinvoiceConfigService } from './einvoice-config.service';
import { encryptSecret } from './einvoice-secret';
import type {
  MinvoiceClient,
  MinvoiceSession,
} from './minvoice/minvoice-client';
import { MinvoiceLoginError } from './minvoice/minvoice-errors';

const TAX_CODE = '0107811836';
const session = (id: string): MinvoiceSession => ({
  cookie: `sess=${id}`,
  token: `tok-${id}`,
  userName: 'admin',
});
// Lets the pending promises of the service run.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('EinvoiceConfigService.relogin', () => {
  let logins: Array<(result: MinvoiceSession | Error) => void>;
  let login: jest.Mock<Promise<MinvoiceSession>, [string, string, string]>;
  let update: jest.Mock;
  let service: EinvoiceConfigService;

  beforeEach(() => {
    logins = [];
    // Every login waits for the test to settle it.
    login = jest.fn(
      () =>
        new Promise<MinvoiceSession>((resolve, reject) => {
          logins.push((result) =>
            result instanceof Error ? reject(result) : resolve(result),
          );
        }),
    );
    update = jest.fn().mockResolvedValue({});
    const prisma = {
      branch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ taxCode: TAX_CODE }),
      },
      einvoiceConfig: {
        findUnique: jest.fn().mockResolvedValue({
          taxCode: TAX_CODE,
          username: 'admin',
          passwordEnc: encryptSecret('the-stored-password'),
          sessionEnc: null,
          loginError: null,
        }),
        update,
      },
    };
    service = new EinvoiceConfigService(
      prisma as never,
      {} as never,
      { login } as unknown as MinvoiceClient,
    );
  });

  it('shares one login between concurrent calls of a branch', async () => {
    const calls = [service.relogin(1), service.relogin(1), service.relogin(1)];
    await flush();
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(
      TAX_CODE,
      'admin',
      'the-stored-password',
    );

    logins[0](session('a'));
    await expect(Promise.all(calls)).resolves.toEqual([
      session('a'),
      session('a'),
      session('a'),
    ]);
    expect(login).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('logs in again on a call after the first one settled', async () => {
    const first = service.relogin(1);
    await flush();
    logins[0](session('a'));
    await expect(first).resolves.toEqual(session('a'));

    const second = service.relogin(1);
    await flush();
    expect(login).toHaveBeenCalledTimes(2);
    logins[1](session('b'));
    await expect(second).resolves.toEqual(session('b'));
  });

  it('keeps branches apart', async () => {
    const calls = [service.relogin(1), service.relogin(2)];
    await flush();
    expect(login).toHaveBeenCalledTimes(2);
    logins[0](session('a'));
    logins[1](session('b'));
    await Promise.all(calls);
  });

  it('does not keep a failed login either', async () => {
    const failed = service.relogin(1);
    const alsoFailed = service.relogin(1);
    await flush();
    logins[0](new MinvoiceLoginError('password', 'Sai mật khẩu'));
    await expect(failed).rejects.toBeInstanceOf(BadRequestException);
    await expect(alsoFailed).rejects.toThrow(
      'Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại',
    );
    expect(login).toHaveBeenCalledTimes(1);

    const next = service.relogin(1);
    await flush();
    expect(login).toHaveBeenCalledTimes(2);
    logins[1](session('c'));
    await expect(next).resolves.toEqual(session('c'));
  });
});

describe('EinvoiceConfigService.latestIssued', () => {
  const findFirst = jest.fn();
  const service = new EinvoiceConfigService(
    { einvoice: { findFirst } } as never,
    {} as never,
    {} as MinvoiceClient,
  );

  beforeEach(() => findFirst.mockReset());

  // The number of the newest day is its highest one; a row whose number is
  // null (clashed with a hand-edited one) must not hide it: Postgres sorts
  // NULL first on DESC unless told otherwise.
  it('asks for the newest day, then its highest number, nulls last', async () => {
    findFirst.mockResolvedValue({
      invoiceDate: new Date('2026-10-01T00:00:00Z'),
      invoiceNumber: 1015,
    });
    await expect(service.latestIssued(TAX_CODE, '1C26MTT')).resolves.toEqual({
      invoiceDate: '2026-10-01',
      invoiceNumber: 1015,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        sellerTaxCode: TAX_CODE,
        symbolCode: '1C26MTT',
        status: 'ISSUED',
        invoiceDate: { not: null },
      },
      orderBy: [
        { invoiceDate: 'desc' },
        { invoiceNumber: { sort: 'desc', nulls: 'last' } },
      ],
      select: { invoiceDate: true, invoiceNumber: true },
    });
  });

  it('is null while nothing was issued under the symbol', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.latestIssued(TAX_CODE, '1C26MTT')).resolves.toBeNull();
  });
});
