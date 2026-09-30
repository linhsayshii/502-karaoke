import { BadRequestException, Injectable } from '@nestjs/common';
import { BRANCH_TAX_CODE_RE, type SellerProfile } from '../einvoice-types';
import { CookieJar } from './cookie-jar';
import {
  MinvoiceHttpError,
  MinvoiceLoginError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
  minvoiceMessage,
} from './minvoice-errors';

// The Minvoice web app's own API (no public API exists), as mapped by
// minvoice-hddt-sender/docs/api-integration.md (spec 2026-10-01 §6.1).

const LOGIN_TIMEOUT_MS = 10_000; // the whole login sequence
const READ_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 25_000;

// Connection failures where the request never reached Minvoice.
const NOT_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export interface MinvoiceSession {
  cookie: string;
  // RequestVerificationToken header (the XSRF-TOKEN cookie of the logged-in user).
  token: string;
  userName: string;
}

export interface InvoiceSymbol {
  registerInvoiceId: string;
  symbolCode: string;
  invoiceTypeName: string | null;
  invoiceYear: number | null;
  creationTime: string | null;
}

// https://<MST>.minvoice.net. Tests point it at a fake server with
// MINVOICE_URL_TEMPLATE (ignored in production). The MST is checked before
// it becomes part of a host name.
export function minvoiceBaseUrl(taxCode: string): string {
  if (!BRANCH_TAX_CODE_RE.test(taxCode)) {
    throw new BadRequestException('Mã số thuế của cơ sở không hợp lệ');
  }
  const template =
    process.env.NODE_ENV === 'production'
      ? undefined
      : process.env.MINVOICE_URL_TEMPLATE;
  return (template || 'https://{taxCode}.minvoice.net').replace(
    '{taxCode}',
    taxCode,
  );
}

interface CallInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

// A field of a Minvoice answer as text: strings and numbers only.
const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

@Injectable()
export class MinvoiceClient {
  async login(
    taxCode: string,
    username: string,
    password: string,
  ): Promise<MinvoiceSession> {
    const base = minvoiceBaseUrl(taxCode);
    const signal = AbortSignal.timeout(LOGIN_TIMEOUT_MS);
    const jar = new CookieJar();

    const tenant = (await this.call(
      `${base}/api/api/abp/multi-tenancy/tenants/by-name/${encodeURIComponent(taxCode)}`,
      { signal },
      jar,
    )) as { success?: boolean; tenantId?: string; isActive?: boolean } | null;
    if (!tenant?.success || !tenant.tenantId || !tenant.isActive) {
      throw new MinvoiceLoginError(
        'tenant',
        `MST ${taxCode} chưa có hoặc chưa kích hoạt trên Minvoice`,
      );
    }
    jar.set('__tenant', tenant.tenantId);

    await this.call(
      `${base}/api/api/abp/application-configuration`,
      { signal },
      jar,
    );
    const anonymousToken = decodeURIComponent(jar.get('XSRF-TOKEN') ?? '');
    if (!anonymousToken)
      throw new MinvoiceUnexpectedResponse('Minvoice không cấp XSRF-TOKEN');

    const result = (await this.call(
      `${base}/api/api/account/login`,
      {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          RequestVerificationToken: anonymousToken,
        },
        body: JSON.stringify({
          userNameOrEmailAddress: username,
          password,
          rememberMe: false,
        }),
      },
      jar,
    )) as { result?: number } | null;
    if (result?.result !== 1) {
      throw new MinvoiceLoginError(
        'password',
        'Sai tên đăng nhập hoặc mật khẩu Minvoice',
      );
    }

    // The anti-forgery token is bound to the user: fetch the logged-in one.
    await this.call(
      `${base}/api/api/abp/application-configuration`,
      { signal },
      jar,
    );
    return {
      cookie: jar.header(),
      token: decodeURIComponent(jar.get('XSRF-TOKEN') ?? anonymousToken),
      userName: username,
    };
  }

  async getSeller(
    taxCode: string,
    session: MinvoiceSession,
  ): Promise<SellerProfile> {
    const raw = await this.authed(
      taxCode,
      session,
      '/api/api/app/tenant-company/',
    );
    const source = unwrap(raw);
    const first = (...values: unknown[]) =>
      values.map((v) => text(v).trim()).find(Boolean) ?? '';
    return {
      legalName: first(source.name, source.legalName, source.companyName),
      address: first(source.address, source.companyAddress),
      email: first(source.email),
      tel: first(source.tel, source.mobile, source.phone),
      bankAccount: first(source.bankAccount, source.sellBankAccount),
      bankName: first(source.bankName),
      fax: first(source.fax),
      website: first(source.webSite, source.website),
    };
  }

  // Symbols the logged-in user may use, newest first, `use !== false`; of one
  // year (4 digits) when given (the same query as the Minvoice web app).
  async listSymbols(
    taxCode: string,
    session: MinvoiceSession,
    year?: number,
  ): Promise<InvoiceSymbol[]> {
    const data = (await this.authed(
      taxCode,
      session,
      '/api/api/app/register-invoice/using-list',
      {
        maxResultCount: '1000',
        userName: session.userName,
        Sorting: 'creationTime',
        SortType: 'DESCEND',
      },
    )) as { items?: Record<string, unknown>[] } | null;
    const twoDigits = year === undefined ? undefined : year % 100;
    return (data?.items ?? [])
      .filter((item) => item.use !== false && typeof item.id === 'string')
      .filter(
        (item) =>
          twoDigits === undefined || Number(item.invoiceYear) === twoDigits,
      )
      .map((item) => ({
        registerInvoiceId: item.id as string,
        symbolCode: text(item.symbolCode),
        invoiceTypeName: (item.invoiceTypeName as string | undefined) ?? null,
        invoiceYear: item.invoiceYear == null ? null : Number(item.invoiceYear),
        creationTime: (item.creationTime as string | undefined) ?? null,
      }))
      .sort(
        (a, b) =>
          (Date.parse(b.creationTime ?? '') || 0) -
          (Date.parse(a.creationTime ?? '') || 0),
      );
  }

  async getVndCurrencyId(
    taxCode: string,
    session: MinvoiceSession,
  ): Promise<string> {
    const data = (await this.authed(taxCode, session, '/api/api/app/currency', {
      maxResultCount: '1000',
    })) as { items?: Record<string, unknown>[] } | null;
    const vnd = (data?.items ?? []).find(
      (item) => text(item.code ?? item.currencyCode).toUpperCase() === 'VND',
    );
    if (typeof vnd?.id !== 'string') {
      throw new MinvoiceUnexpectedResponse(
        'Tenant Minvoice không có tiền tệ VND',
      );
    }
    return vnd.id;
  }

  async createInvoice(
    taxCode: string,
    session: MinvoiceSession,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; invoiceNumber: number }> {
    const base = minvoiceBaseUrl(taxCode);
    const body = (await this.call(`${base}/api/api/app/invoice`, {
      method: 'POST',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        ...authHeaders(base, session),
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })) as { id?: unknown; invoiceNumber?: unknown } | null;
    const invoiceNumber = Number(body?.invoiceNumber);
    if (
      typeof body?.id !== 'string' ||
      !Number.isInteger(invoiceNumber) ||
      invoiceNumber < 1
    ) {
      throw new MinvoiceUnexpectedResponse(
        'Minvoice trả về hóa đơn không có id hoặc số hóa đơn',
      );
    }
    return { id: body.id, invoiceNumber };
  }

  private authed(
    taxCode: string,
    session: MinvoiceSession,
    path: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const base = minvoiceBaseUrl(taxCode);
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return this.call(url.toString(), {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      headers: authHeaders(base, session),
    });
  }

  private async call(
    url: string,
    init: CallInit,
    jar?: CookieJar,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      ...(init.headers ?? {}),
    };
    const cookie = jar?.header();
    if (cookie) headers.cookie = cookie;

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, redirect: 'manual' });
    } catch (error) {
      throw networkError(error);
    }
    jar?.store(response.headers.getSetCookie());

    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      throw networkError(error, true);
    }
    if (response.status >= 300) {
      throw new MinvoiceHttpError(
        response.status,
        body.slice(0, 2000),
        `Minvoice trả lỗi HTTP ${response.status}: ${minvoiceMessage(body)}`,
      );
    }
    try {
      return body ? (JSON.parse(body) as unknown) : null;
    } catch {
      throw new MinvoiceHttpError(
        response.status,
        body.slice(0, 2000),
        'Minvoice trả về trang web thay vì dữ liệu (phiên đăng nhập có thể đã hết)',
      );
    }
  }
}

function authHeaders(
  base: string,
  session: MinvoiceSession,
): Record<string, string> {
  return {
    cookie: session.cookie,
    RequestVerificationToken: session.token,
    origin: new URL(base).origin,
    referer: `${new URL(base).origin}/`,
  };
}

function networkError(
  error: unknown,
  sentKnown?: boolean,
): MinvoiceNetworkError {
  const e = error as { name?: string; cause?: { code?: string } } | undefined;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return new MinvoiceNetworkError(true, 'Minvoice không trả lời kịp');
  }
  const code = e?.cause?.code;
  const sent = sentKnown ?? !(code && NOT_SENT_CODES.has(code));
  return new MinvoiceNetworkError(
    sent,
    `Không kết nối được Minvoice${code ? ` (${code})` : ''}`,
  );
}

// tenant-company answers an object, a list or {result|data: …} depending on
// the tenant (minvoice-seller.js unwrapTenantCompany).
function unwrap(raw: unknown): Record<string, unknown> {
  const value = raw as Record<string, unknown> | unknown[] | null;
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? {};
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value.items))
    return (value.items[0] as Record<string, unknown>) ?? {};
  for (const key of ['result', 'data']) {
    if (value[key] && typeof value[key] === 'object') return unwrap(value[key]);
  }
  return value;
}
