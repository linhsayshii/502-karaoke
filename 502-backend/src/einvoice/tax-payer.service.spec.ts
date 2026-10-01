import { HttpException } from '@nestjs/common';
import { TaxPayerService, MAX_LOOKUPS_IN_FLIGHT } from './tax-payer.service';

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as Response;

const gdtBody = {
  mst: '0107068321',
  tennnt: 'CÔNG TY CỔ PHẦN ĐẦU TƯ THƯƠNG MẠI VÀ DỊCH VỤ GIẢI TRÍ HOÀNG GIA',
  tthai: '00',
  dctsdchi: 'Số 26, phố Nhổn',
  dctsxaten: 'Phường Tây Tựu',
  dctstinhten: 'TP Hà Nội',
};
const xinvoiceBody = {
  taxID: '0107068321',
  name: 'CÔNG TY CỔ PHẦN ĐẦU TƯ THƯƠNG MẠI VÀ DỊCH VỤ GIẢI TRÍ HOÀNG GIA',
  address: 'Số 26, phố Nhổn, Phường Tây Tựu, TP Hà Nội',
  status: 'NNT đang hoạt động',
};
const blocked = {
  status: 403,
  message: 'Hệ thống phát hiện hành vi không hợp lệ. Yêu cầu đã bị chặn.',
};

describe('TaxPayerService', () => {
  let service: TaxPayerService;
  let hosts: string[];
  let inits: (RequestInit | undefined)[];
  let answers: Record<string, () => Response>;

  beforeEach(() => {
    service = new TaxPayerService();
    hosts = [];
    inits = [];
    answers = {};
    jest.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = url instanceof Request ? url.url : url.toString();
      const host = new URL(href).host;
      hosts.push(host);
      inits.push(init);
      return Promise.resolve(answers[host]());
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the tax portal first', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(200, gdtBody);
    await expect(service.lookup('0107068321')).resolves.toEqual({
      taxCode: '0107068321',
      name: gdtBody.tennnt,
      address: 'Số 26, phố Nhổn, Phường Tây Tựu, TP Hà Nội',
      status: 'NNT đang hoạt động',
      active: true,
      source: 'gdt',
    });
    expect(hosts).toEqual(['hoadondientu.gdt.gov.vn']);
  });

  it('falls back to xinvoice when the portal blocks, and caches the answer', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(403, blocked);
    answers['api.xinvoice.vn'] = () => reply(200, xinvoiceBody);
    const first = await service.lookup('0107068321');
    expect(first).toMatchObject({
      source: 'xinvoice',
      active: true,
      address: xinvoiceBody.address,
    });
    await service.lookup('0107068321');
    expect(hosts).toEqual(['hoadondientu.gdt.gov.vn', 'api.xinvoice.vn']);
  });

  it('shares one lookup between concurrent requests', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(200, gdtBody);
    await Promise.all([
      service.lookup('0107068321'),
      service.lookup('0107068321'),
    ]);
    expect(hosts).toHaveLength(1);
  });

  it('forgets an answer after 7 days', async () => {
    let now = 0;
    service.now = () => now;
    answers['hoadondientu.gdt.gov.vn'] = () => reply(200, gdtBody);
    await service.lookup('0107068321');
    now = 7 * 24 * 3600 * 1000 + 1;
    await service.lookup('0107068321');
    expect(hosts).toHaveLength(2);
  });

  it('answers 404 when neither knows the tax code, 424 when both fail', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(403, blocked);
    answers['api.xinvoice.vn'] = () =>
      reply(404, { success: false, message: 'Tax not found' });
    await expect(service.lookup('0100000000')).rejects.toMatchObject({
      status: 404,
    });
    answers['api.xinvoice.vn'] = () => reply(500, {});
    await expect(service.lookup('0100000001')).rejects.toMatchObject({
      status: 424,
    });
  });

  it('keeps xinvoice under 10 calls per 30 s', async () => {
    let now = 0;
    service.now = () => now;
    answers['hoadondientu.gdt.gov.vn'] = () => reply(403, blocked);
    answers['api.xinvoice.vn'] = () => reply(200, xinvoiceBody);
    for (let i = 0; i < 10; i++) {
      await service.lookup(`01070683${String(i).padStart(2, '0')}`);
    }
    const error = await service.lookup('0107068399').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    now = 30_001;
    await expect(service.lookup('0107068399')).resolves.toMatchObject({
      source: 'xinvoice',
    });
  });

  it('checks the format before calling out', async () => {
    await expect(service.lookup('12345')).rejects.toMatchObject({
      status: 400,
    });
    expect(hosts).toHaveLength(0);
  });

  it('never follows a redirect: a 3xx from the portal falls through to xinvoice', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(302, {});
    answers['api.xinvoice.vn'] = () => reply(200, xinvoiceBody);
    await expect(service.lookup('0107068321')).resolves.toMatchObject({
      source: 'xinvoice',
    });
    expect(hosts).toEqual(['hoadondientu.gdt.gov.vn', 'api.xinvoice.vn']);
    expect(inits.map((init) => init?.redirect)).toEqual(['manual', 'manual']);
  });

  it('counts a 3xx from xinvoice as a failed lookup, not as "not found"', async () => {
    answers['hoadondientu.gdt.gov.vn'] = () => reply(302, {});
    answers['api.xinvoice.vn'] = () => reply(301, {});
    await expect(service.lookup('0107068321')).rejects.toMatchObject({
      status: 424,
    });
  });

  describe('lookups in flight', () => {
    const codes = (count: number) =>
      Array.from(
        { length: count },
        (_, i) => `01070683${String(i).padStart(2, '0')}`,
      );
    let release: () => void;

    beforeEach(() => {
      // Every portal call waits until release() is called.
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      jest.spyOn(global, 'fetch').mockImplementation((url) => {
        const href = url instanceof Request ? url.url : url.toString();
        hosts.push(new URL(href).host);
        return gate.then(() => reply(200, gdtBody));
      });
    });

    it('refuses a new tax code with 429 at the cap, but joins one already running', async () => {
      const running = codes(MAX_LOOKUPS_IN_FLIGHT).map((code) =>
        service.lookup(code),
      );
      expect(MAX_LOOKUPS_IN_FLIGHT).toBe(50);

      const refused = await service
        .lookup('0107068399')
        .catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(HttpException);
      expect((refused as HttpException).getStatus()).toBe(429);
      expect((refused as HttpException).message).toBe(
        'Tra cứu nhiều quá, thử lại sau ít giây',
      );

      const joined = service.lookup(codes(1)[0]);
      release();
      await Promise.all([...running, joined]);
      expect(hosts).toHaveLength(MAX_LOOKUPS_IN_FLIGHT);
    });

    it('accepts new tax codes again once the running lookups end', async () => {
      const running = codes(MAX_LOOKUPS_IN_FLIGHT).map((code) =>
        service.lookup(code),
      );
      release();
      await Promise.all(running);
      await expect(service.lookup('0107068399')).resolves.toMatchObject({
        source: 'gdt',
      });
    });
  });
});
