import { MinvoiceClient, minvoiceBaseUrl } from './minvoice-client';
import {
  MinvoiceHttpError,
  MinvoiceLoginError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
} from './minvoice-errors';

type Call = { url: string; init: RequestInit };
const reply = (body: unknown, status = 200, cookies: string[] = []) =>
  ({
    status,
    headers: { getSetCookie: () => cookies },
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

describe('MinvoiceClient', () => {
  const client = new MinvoiceClient();
  const session = { cookie: 'a=b', token: 'tok', userName: 'admin' };
  let calls: Call[];
  let replies: Array<Response | Error>;

  beforeEach(() => {
    calls = [];
    replies = [];
    jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
      calls.push({
        url: url instanceof Request ? url.url : url.toString(),
        init: init ?? {},
      });
      const next = replies.shift();
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next as Response);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const header = (call: Call, name: string) =>
    (call.init.headers as Record<string, string>)[name];

  it('logs in: tenant cookie, XSRF token, login, then the token of the user', async () => {
    replies.push(
      reply({ success: true, tenantId: 't1', isActive: true }),
      reply({}, 200, ['XSRF-TOKEN=anon; path=/']),
      reply({ result: 1 }, 200, [
        '.AspNetCore.Identity.Application=s1; path=/; httponly',
      ]),
      reply({ currentUser: { isAuthenticated: true } }, 200, [
        'XSRF-TOKEN=user%3Dtok; path=/',
      ]),
    );
    const result = await client.login('0107811836', 'admin', 'pw');

    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/api/abp/multi-tenancy/tenants/by-name/0107811836',
      '/api/api/abp/application-configuration',
      '/api/api/account/login',
      '/api/api/abp/application-configuration',
    ]);
    expect(new URL(calls[0].url).host).toBe('0107811836.minvoice.net');
    expect(header(calls[1], 'cookie')).toBe('__tenant=t1');
    expect(header(calls[2], 'RequestVerificationToken')).toBe('anon');
    expect(JSON.parse(calls[2].init.body as string)).toEqual({
      userNameOrEmailAddress: 'admin',
      password: 'pw',
      rememberMe: false,
    });
    expect(calls.every((c) => c.init.redirect === 'manual')).toBe(true);
    expect(result).toEqual({
      cookie:
        '__tenant=t1; XSRF-TOKEN=user%3Dtok; .AspNetCore.Identity.Application=s1',
      token: 'user=tok',
      userName: 'admin',
    });
  });

  it('tells a wrong password from a missing tenant', async () => {
    replies.push(reply({ success: false }));
    await expect(
      client.login('0107811836', 'admin', 'pw'),
    ).rejects.toMatchObject({
      reason: 'tenant',
    });
    replies.push(
      reply({ success: true, tenantId: 't1', isActive: true }),
      reply({}, 200, ['XSRF-TOKEN=anon']),
      reply({ result: 2, description: 'Invalid username or password!' }),
    );
    const error = await client
      .login('0107811836', 'admin', 'x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MinvoiceLoginError);
    expect(error).toMatchObject({ reason: 'password' });
  });

  it('sends an invoice with the session and reads its number', async () => {
    replies.push(reply({ id: 'inv-1', invoiceNumber: 1015, invoiceStatus: 0 }));
    await expect(
      client.createInvoice('0107811836', session, { a: 1 }),
    ).resolves.toEqual({
      id: 'inv-1',
      invoiceNumber: 1015,
    });
    expect(calls[0].init.method).toBe('POST');
    expect(header(calls[0], 'cookie')).toBe('a=b');
    expect(header(calls[0], 'RequestVerificationToken')).toBe('tok');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ a: 1 });
  });

  it('sorts the failures of a send', async () => {
    replies.push(reply({ id: 'inv-1' }));
    await expect(
      client.createInvoice('0107811836', session, {}),
    ).rejects.toBeInstanceOf(MinvoiceUnexpectedResponse);
    replies.push(reply({ error: { message: 'Unauthorized' } }, 401));
    await expect(
      client.createInvoice('0107811836', session, {}),
    ).rejects.toMatchObject({
      status: 401,
    });
    replies.push(reply('<html>login</html>', 200));
    await expect(
      client.createInvoice('0107811836', session, {}),
    ).rejects.toBeInstanceOf(MinvoiceHttpError);
    // A 2xx may mean Minvoice committed the invoice: a body that is neither
    // JSON nor a page (cut short) is an unknown outcome, never a refusal.
    replies.push(reply('{"id":"inv-1","invoiceNu', 200));
    await expect(
      client.createInvoice('0107811836', session, {}),
    ).rejects.toBeInstanceOf(MinvoiceUnexpectedResponse);
    replies.push(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      }),
    );
    await expect(
      client.createInvoice('0107811836', session, {}),
    ).rejects.toMatchObject({
      sent: false,
    });
    replies.push(
      Object.assign(new TypeError('fetch failed'), {
        cause: { code: 'UND_ERR_SOCKET' },
      }),
    );
    await expect(
      client.createInvoice('0107811836', session, {}),
    ).rejects.toMatchObject({
      sent: true,
    });
    replies.push(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    const error = await client
      .createInvoice('0107811836', session, {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MinvoiceNetworkError);
    expect(error).toMatchObject({ sent: true });
  });

  it('lists the symbols of a year, newest first, in use only', async () => {
    replies.push(
      reply({
        items: [
          {
            id: 'old',
            symbolCode: '1C25MTT',
            invoiceYear: 25,
            use: true,
            creationTime: '2025-01-01T00:00:00+07:00',
          },
          {
            id: 'tms',
            symbolCode: '1C26TMS',
            invoiceYear: 26,
            use: true,
            invoiceTypeName: 'Hóa đơn giá trị gia tăng',
            creationTime: '2026-01-02T11:09:23+07:00',
          },
          {
            id: 'mms',
            symbolCode: '1C26MTT',
            invoiceYear: 26,
            use: true,
            creationTime: '2026-01-02T11:09:22+07:00',
          },
          {
            id: 'off',
            symbolCode: '1C26OFF',
            invoiceYear: 26,
            use: false,
            creationTime: '2026-02-01T00:00:00+07:00',
          },
        ],
      }),
    );
    const symbols = await client.listSymbols('0107811836', session, 2026);
    expect(symbols.map((s) => s.symbolCode)).toEqual(['1C26TMS', '1C26MTT']);
    expect(symbols[0]).toEqual({
      registerInvoiceId: 'tms',
      symbolCode: '1C26TMS',
      invoiceTypeName: 'Hóa đơn giá trị gia tăng',
      invoiceYear: 26,
      creationTime: '2026-01-02T11:09:23+07:00',
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/api/api/app/register-invoice/using-list');
    expect(url.searchParams.get('userName')).toBe('admin');
    expect(url.searchParams.get('Sorting')).toBe('creationTime');
    expect(url.searchParams.get('SortType')).toBe('DESCEND');
  });

  it('checks the MST before building a host name', () => {
    expect(() => minvoiceBaseUrl('evil.com/x')).toThrow();
    expect(minvoiceBaseUrl('0107811836')).toBe(
      'https://0107811836.minvoice.net',
    );
  });
});
