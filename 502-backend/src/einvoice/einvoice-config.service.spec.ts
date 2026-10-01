import { BadRequestException } from '@nestjs/common';
import {
  EinvoiceConfigService,
  type IssueConfig,
} from './einvoice-config.service';
import { encryptSecret } from './einvoice-secret';
import type {
  MinvoiceClient,
  MinvoiceSession,
} from './minvoice/minvoice-client';
import {
  MinvoiceHttpError,
  MinvoiceLoginError,
} from './minvoice/minvoice-errors';

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
    login = jest.fn<Promise<MinvoiceSession>, [string, string, string]>(
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

  // A locked, not allowed or two-factor account is not a changed password:
  // what is stored for the page says what happened.
  it.each([
    ['locked', 'Minvoice đang khóa tạm tài khoản'],
    ['not-allowed', 'Minvoice không cho tài khoản này đăng nhập'],
    ['two-factor', 'Tài khoản Minvoice bật xác thực hai bước'],
  ] as const)(
    'stores what happened when the account is %s',
    async (reason, message) => {
      const failed = service.relogin(1);
      await flush();
      logins[0](new MinvoiceLoginError(reason, message));
      await expect(failed).rejects.toThrow(message);
      expect(update).toHaveBeenCalledWith({
        where: { branchId: 1 },
        data: { loginError: message, sessionEnc: null },
      });
    },
  );

  // Spec §8: a send must not post to one tenant with the cookies of another.
  it('refuses a session of another tax code than the one expected', async () => {
    const calls = [
      service.relogin(1, TAX_CODE),
      service.relogin(1, '0100000001'),
    ];
    await flush();
    expect(login).toHaveBeenCalledTimes(1);
    logins[0](session('a'));
    await expect(calls[0]).resolves.toEqual(session('a'));
    await expect(calls[1]).rejects.toThrow(
      `MST của cơ sở đã đổi từ 0100000001 sang ${TAX_CODE}`,
    );
  });
});

describe('EinvoiceConfigService.login', () => {
  const dto = { username: 'admin', password: 'the-typed-password' };
  let login: jest.Mock;
  let service: EinvoiceConfigService;

  beforeEach(() => {
    login = jest.fn();
    const prisma = {
      branch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ taxCode: TAX_CODE }),
      },
    };
    service = new EinvoiceConfigService(
      prisma as never,
      { resolveBranchId: jest.fn().mockResolvedValue(1) } as never,
      { login } as unknown as MinvoiceClient,
    );
  });
  const user = { id: 1, role: 'CHAIN_MANAGER' } as never;
  const attempt = () =>
    service.login(user, 'cs1', dto).catch((e: unknown) => e);

  it('locks the branch after five wrong passwords', async () => {
    login.mockRejectedValue(
      new MinvoiceLoginError('password', 'Sai tên đăng nhập hoặc mật khẩu'),
    );
    for (let i = 0; i < 5; i++) {
      expect(await attempt()).toBeInstanceOf(BadRequestException);
    }
    expect(await attempt()).toMatchObject({ status: 429 });
    expect(login).toHaveBeenCalledTimes(5);
  });

  it.each(['locked', 'not-allowed', 'two-factor'] as const)(
    'does not count a %s account as a wrong password',
    async (reason) => {
      login.mockRejectedValue(new MinvoiceLoginError(reason, 'Không được'));
      for (let i = 0; i < 6; i++) {
        const error = await attempt();
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error).toMatchObject({ message: 'Không được' });
      }
      expect(login).toHaveBeenCalledTimes(6);
    },
  );
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

describe('EinvoiceConfigService.findByMarker', () => {
  const query = {
    symbolCode: '1C26MTT',
    invoiceDate: '2026-10-01',
    marker: 'K502-7',
  };
  const found = {
    kind: 'found' as const,
    id: 'inv-9',
    invoiceNumber: 1009,
    invoiceDate: '2026-10-01',
  };
  let findByMarker: jest.Mock;
  let login: jest.Mock;
  let service: EinvoiceConfigService;

  beforeEach(() => {
    findByMarker = jest.fn();
    login = jest.fn().mockResolvedValue(session('new'));
    const prisma = {
      branch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ taxCode: TAX_CODE }),
      },
      einvoiceConfig: {
        findUnique: jest.fn().mockResolvedValue({
          taxCode: TAX_CODE,
          username: 'admin',
          passwordEnc: encryptSecret('the-stored-password'),
          sessionEnc: encryptSecret(JSON.stringify(session('old'))),
          loginError: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new EinvoiceConfigService(
      prisma as never,
      {} as never,
      { login, findByMarker } as unknown as MinvoiceClient,
    );
  });

  it('searches with the stored session', async () => {
    findByMarker.mockResolvedValue(found);
    await expect(service.findByMarker(1, TAX_CODE, query)).resolves.toEqual(
      found,
    );
    expect(findByMarker).toHaveBeenCalledWith(TAX_CODE, session('old'), query);
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in again once when Minvoice refuses the stored session', async () => {
    findByMarker
      .mockRejectedValueOnce(new MinvoiceHttpError(401, '', 'Unauthorized'))
      .mockResolvedValueOnce(found);
    await expect(service.findByMarker(1, TAX_CODE, query)).resolves.toEqual(
      found,
    );
    expect(login).toHaveBeenCalledTimes(1);
    expect(findByMarker).toHaveBeenLastCalledWith(
      TAX_CODE,
      session('new'),
      query,
    );
  });

  it('never searches another tenant than the one it was sent to', async () => {
    await expect(service.findByMarker(1, '0100000001', query)).rejects.toThrow(
      /0100000001/,
    );
    expect(findByMarker).not.toHaveBeenCalled();
  });
});

describe('EinvoiceConfigService.refreshRange', () => {
  it('stores the new range only while the symbol is still the one sent', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn();
    const listSymbols = jest
      .fn()
      .mockResolvedValue([
        { symbolCode: '1C26MTT', registerInvoiceId: 'range-2' },
      ]);
    const service = new EinvoiceConfigService(
      { einvoiceConfig: { updateMany, update } } as never,
      {} as never,
      { listSymbols } as unknown as MinvoiceClient,
    );
    const config = {
      branchId: 1,
      taxCode: TAX_CODE,
      symbolCode: '1C26MTT',
      registerInvoiceId: 'range-1',
      currencyId: 'vnd-id',
      seller: {} as IssueConfig['seller'],
      session: null,
    };
    await expect(
      service.refreshRange(config, session('a')),
    ).resolves.toMatchObject({
      registerInvoiceId: 'range-2',
      session: session('a'),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { branchId: 1, symbolCode: '1C26MTT' },
      data: { registerInvoiceId: 'range-2' },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
