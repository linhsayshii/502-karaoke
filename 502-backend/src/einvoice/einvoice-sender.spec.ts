import { BadRequestException } from '@nestjs/common';
import type { IssueConfig } from './einvoice-config.service';
import { EinvoiceSender } from './einvoice-sender';
import {
  MinvoiceHttpError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
} from './minvoice/minvoice-errors';

const session = { cookie: 'c', token: 't', userName: 'admin' };
const ready: IssueConfig = {
  branchId: 1,
  taxCode: '0107811836',
  symbolCode: '1C26MTT',
  registerInvoiceId: 'range-1',
  currencyId: 'vnd-id',
  seller: {} as IssueConfig['seller'],
  session,
};
const build = (config: IssueConfig) => ({
  registerInvoiceId: config.registerInvoiceId,
});
const refused = () =>
  new MinvoiceHttpError(401, '{}', 'Minvoice trả lỗi HTTP 401');
const ok = (invoiceNumber: number) => ({
  id: `inv-${invoiceNumber}`,
  invoiceNumber,
});

function setup(results: Array<{ id: string; invoiceNumber: number } | Error>) {
  const client = {
    createInvoice: jest.fn((...args: unknown[]) => {
      void args;
      const next = results.shift()!;
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    }),
  };
  const config = {
    relogin: jest.fn(() => Promise.resolve({ ...session, token: 'fresh' })),
    refreshRange: jest.fn((c: IssueConfig, s: typeof session) =>
      Promise.resolve({ ...c, registerInvoiceId: 'range-2', session: s }),
    ),
  };
  return {
    sender: new EinvoiceSender(client as never, config as never),
    client,
    config,
  };
}

describe('EinvoiceSender (spec §9.1)', () => {
  it('issues on the first try without logging in', async () => {
    const { sender, config } = setup([ok(5)]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'issued',
      invoiceNumber: 5,
    });
    expect(config.relogin).not.toHaveBeenCalled();
  });

  it('logs in first when no session is stored', async () => {
    const { sender, config } = setup([ok(5)]);
    await sender.send({ ...ready, session: null }, build);
    expect(config.relogin).toHaveBeenCalledTimes(1);
  });

  it('logs in again, takes the new range and resends once', async () => {
    const { sender, client, config } = setup([refused(), ok(6)]);
    const outcome = await sender.send(ready, build);
    expect(outcome).toMatchObject({
      kind: 'issued',
      invoiceNumber: 6,
      config: { registerInvoiceId: 'range-2' },
    });
    expect(config.relogin).toHaveBeenCalledTimes(1);
    expect(config.refreshRange).toHaveBeenCalledTimes(1);
    expect(client.createInvoice.mock.calls.map((call) => call[2])).toEqual([
      { registerInvoiceId: 'range-1' },
      { registerInvoiceId: 'range-2' },
    ]);
  });

  it('gives up after the second refusal', async () => {
    const { sender, client } = setup([refused(), refused()]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'failed',
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(2);
  });

  it('resends when the request never left', async () => {
    const { sender } = setup([
      new MinvoiceNetworkError(false, 'ECONNREFUSED'),
      ok(7),
    ]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'issued',
      invoiceNumber: 7,
    });
  });

  it('never resends what may have been created', async () => {
    const { sender, client, config } = setup([
      new MinvoiceNetworkError(true, 'timeout'),
    ]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'uncertain',
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
    expect(config.relogin).not.toHaveBeenCalled();
  });

  it('never resends a 2xx that carries no invoice', async () => {
    const { sender, client } = setup([
      new MinvoiceUnexpectedResponse('Minvoice trả về dữ liệu không đọc được'),
    ]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'uncertain',
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('stays uncertain when the resend has no answer', async () => {
    const { sender, client } = setup([
      refused(),
      new MinvoiceNetworkError(true, 'timeout'),
    ]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'uncertain',
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(2);
  });

  it('never resends a date refused for its order', async () => {
    const dateRefused = new MinvoiceHttpError(
      400,
      JSON.stringify({
        error: { message: 'Ngày hóa đơn nhỏ hơn ngày hóa đơn mới nhất' },
      }),
      'Minvoice trả lỗi HTTP 400',
    );
    const { sender, client } = setup([dateRefused]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'failed',
      dateOrder: true,
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('never resends Minvoice error 296 either', async () => {
    const code296 = new MinvoiceHttpError(
      400,
      JSON.stringify({ error: { code: '296' } }),
      'Minvoice trả lỗi HTTP 400',
    );
    const { sender, client, config } = setup([code296]);
    await expect(sender.send(ready, build)).resolves.toMatchObject({
      kind: 'failed',
      dateOrder: true,
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
    expect(config.relogin).not.toHaveBeenCalled();
  });

  it('stops when the stored password is refused on the re-login', async () => {
    const { sender, config } = setup([refused()]);
    config.relogin.mockRejectedValueOnce(
      new BadRequestException(
        'Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại',
      ),
    );
    await expect(sender.send(ready, build)).resolves.toEqual({
      kind: 'failed',
      message: 'Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại',
    });
  });

  it('stops when the symbol is gone from the account', async () => {
    const { sender, client, config } = setup([refused()]);
    config.refreshRange.mockRejectedValueOnce(
      new BadRequestException(
        'Ký hiệu 1C26MTT không còn dùng được, chọn ký hiệu khác',
      ),
    );
    await expect(sender.send(ready, build)).resolves.toEqual({
      kind: 'failed',
      message: 'Ký hiệu 1C26MTT không còn dùng được, chọn ký hiệu khác',
    });
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
  });
});
