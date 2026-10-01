import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BUYER_TAX_CODE_RE } from './einvoice-types';

// Buyer lookup by MST (spec 2026-10-01 §6.3): the GDT tax portal first, then
// api.xinvoice.vn, which answers when the portal blocks the server (seen
// 01/10/2026). Neither has a contract: a failed lookup never stops an invoice,
// the buyer is typed by hand.

export interface TaxPayer {
  taxCode: string;
  name: string;
  address: string;
  status: string;
  active: boolean;
  source: 'gdt' | 'xinvoice';
}

const GDT_URL = 'https://hoadondientu.gdt.gov.vn/api/category/public/dsdkts';
const XINVOICE_URL = 'https://api.xinvoice.vn/gdt-api/tax-payer';
const GDT_TIMEOUT_MS = 8_000;
// A tax code xinvoice has not seen takes it ~20 s.
const XINVOICE_TIMEOUT_MS = 30_000;
const CACHE_MAX = 1000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
// xinvoice's own limit (ratelimit-policy "10-in-30sec"), shared by the chain.
const XINVOICE_MAX_CALLS = 10;
const XINVOICE_WINDOW_MS = 30_000;
// Distinct tax codes looked up at the same time (resource rules: capped map).
// A lookup can run 38 s (8 s portal + 30 s xinvoice), so the map must not be
// left to grow while callers keep asking for new codes.
export const MAX_LOOKUPS_IN_FLIGHT = 50;

const BUSY_MESSAGE = 'Tra cứu nhiều quá, thử lại sau ít giây';

class LookupFailed extends Error {
  constructor(
    readonly notFound: boolean,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class TaxPayerService {
  // Capped (resource rules): the oldest entry goes first when full.
  private cache = new Map<string, { value: TaxPayer; at: number }>();
  // Lookups in flight, one per tax code, at most MAX_LOOKUPS_IN_FLIGHT.
  private inflight = new Map<string, Promise<TaxPayer>>();
  private xinvoiceCalls: number[] = [];
  now = () => Date.now();

  lookup(raw: string): Promise<TaxPayer> {
    const taxCode = raw.trim();
    if (!BUYER_TAX_CODE_RE.test(taxCode)) {
      return Promise.reject(
        new BadRequestException(
          'MST phải có 10 số, 10 số kèm -3 số, hoặc 12 số',
        ),
      );
    }
    const hit = this.cache.get(taxCode);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) {
      return Promise.resolve(hit.value);
    }

    const running = this.inflight.get(taxCode);
    if (running) return running;
    if (this.inflight.size >= MAX_LOOKUPS_IN_FLIGHT) {
      return Promise.reject(
        new HttpException(BUSY_MESSAGE, HttpStatus.TOO_MANY_REQUESTS),
      );
    }
    const promise = this.fetchEither(taxCode)
      .then((value) => {
        this.remember(taxCode, value);
        return value;
      })
      .finally(() => this.inflight.delete(taxCode));
    this.inflight.set(taxCode, promise);
    return promise;
  }

  private async fetchEither(taxCode: string): Promise<TaxPayer> {
    let portalError: LookupFailed;
    try {
      return await this.fromGdt(taxCode);
    } catch (error) {
      portalError = asFailure(error);
    }
    this.takeXinvoiceSlot();
    try {
      return await this.fromXinvoice(taxCode);
    } catch (error) {
      const fallback = asFailure(error);
      if (fallback.notFound) {
        throw new NotFoundException(`Không tìm thấy MST ${taxCode}`);
      }
      throw new HttpException(
        `Không tra được MST ${taxCode}. Cổng thuế: ${portalError.message}. xinvoice: ${fallback.message}`,
        HttpStatus.FAILED_DEPENDENCY,
      );
    }
  }

  private async fromGdt(taxCode: string): Promise<TaxPayer> {
    const body = (await getJson(
      `${GDT_URL}/${encodeURIComponent(taxCode)}/manager`,
      GDT_TIMEOUT_MS,
    )) as Record<string, string | undefined> | null;
    if (!body?.mst) throw new LookupFailed(true, 'không có dữ liệu');
    const address = [
      body.dctsdchi,
      body.dctsxaten || body.dctstxa,
      body.dctshuyenten || body.dctsthuyen,
      body.dctstinhten || body.dctstinh,
    ]
      .map((part) => String(part ?? '').trim())
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join(', ');
    const active = body.tthai === '00';
    return {
      taxCode: body.mst,
      name: body.tennnt ?? '',
      address,
      status: active
        ? 'NNT đang hoạt động'
        : `Mã trạng thái ${body.tthai ?? '?'}`,
      active,
      source: 'gdt',
    };
  }

  private async fromXinvoice(taxCode: string): Promise<TaxPayer> {
    const body = (await getJson(
      `${XINVOICE_URL}/${encodeURIComponent(taxCode)}`,
      XINVOICE_TIMEOUT_MS,
    )) as Record<string, string | undefined> | null;
    if (!body?.taxID) throw new LookupFailed(true, 'không có dữ liệu');
    const status = body.status ?? '';
    return {
      taxCode: body.taxID,
      name: body.name ?? '',
      address: String(body.address ?? '').trim(),
      status,
      active: /^NNT đang hoạt động/i.test(status),
      source: 'xinvoice',
    };
  }

  // Sliding window over the last 30 s.
  private takeXinvoiceSlot() {
    const now = this.now();
    this.xinvoiceCalls = this.xinvoiceCalls.filter(
      (time) => now - time < XINVOICE_WINDOW_MS,
    );
    if (this.xinvoiceCalls.length >= XINVOICE_MAX_CALLS) {
      throw new HttpException(BUSY_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.xinvoiceCalls.push(now);
  }

  private remember(taxCode: string, value: TaxPayer) {
    this.cache.delete(taxCode);
    this.cache.set(taxCode, { value, at: this.now() });
    while (this.cache.size > CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
  }
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    // A redirect is never followed (spec §11): it counts as a failed lookup.
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new LookupFailed(
      false,
      name === 'TimeoutError' ? 'quá thời gian chờ' : 'không kết nối được',
    );
  }
  const text = await response.text().catch(() => '');
  if (response.status === 404) throw new LookupFailed(true, 'không tìm thấy');
  if (!response.ok) throw new LookupFailed(false, `HTTP ${response.status}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LookupFailed(false, 'dữ liệu không đọc được');
  }
}

function asFailure(error: unknown): LookupFailed {
  return error instanceof LookupFailed
    ? error
    : new LookupFailed(false, String((error as Error)?.message ?? error));
}
