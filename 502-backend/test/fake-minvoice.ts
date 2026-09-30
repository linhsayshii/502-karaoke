import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

// A stand-in for the Minvoice web API, answering the requests of
// src/einvoice/minvoice/minvoice-client.ts. Used by test/einvoice.e2e-spec.ts
// and for a manual browser check:
//   npx ts-node test/fake-minvoice.ts 4555
//   MINVOICE_URL_TEMPLATE=http://127.0.0.1:4555/{taxCode} (backend, not production)

// 'drop': the connection is cut before anything is created;
// 'drop-after-create': the invoice is created, then the answer is lost.
export type SendBehaviour =
  | 'ok'
  | 'drop'
  | 'drop-after-create'
  | 'date-order'
  | 'reject';

export class FakeMinvoice {
  password = 'minvoice-pass';
  // Current range of the symbol: change it to make an old id fail.
  rangeId = 'range-1';
  // One entry per POST invoice, used in order; nothing left = 'ok'.
  behaviours: SendBehaviour[] = [];
  delayMs = 0;
  // A list that does not filter by orderNumber (a server that ignores it).
  ignoreMarkerFilter = false;
  logins = 0;
  posts = 0;
  // Each created invoice: the payload, with the id and number it was given.
  invoices: Record<string, unknown>[] = [];
  private sessions = new Set<string>();
  private nextNumber = 1001;
  private server?: Server;

  // 1C<yy>MTT of this year (0) or of an earlier one (-1).
  symbolCode(yearOffset = 0) {
    const year = (new Date().getFullYear() + yearOffset) % 100;
    return `1C${String(year).padStart(2, '0')}MTT`;
  }

  expireSessions() {
    this.sessions.clear();
  }

  async start(port = 0): Promise<string> {
    const server = createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server = server;
    await new Promise<void>((resolve) =>
      server.listen(port, '127.0.0.1', resolve),
    );
    const { port: actual } = server.address() as AddressInfo;
    return `http://127.0.0.1:${actual}/{taxCode}`;
  }

  async stop() {
    const server = this.server;
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://fake');
    const [, taxCode, ...rest] = url.pathname.split('/');
    const path = `/${rest.join('/')}`;
    const cookies = new Map(
      (req.headers.cookie ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map(
          (part) =>
            [
              part.slice(0, part.indexOf('=')),
              part.slice(part.indexOf('=') + 1),
            ] as const,
        ),
    );
    const session = cookies.get('.AspNetCore.Identity.Application');
    const loggedIn = !!session && this.sessions.has(session);
    const token = req.headers['requestverificationtoken'];
    const authed = loggedIn && token === `xsrf-${session}`;
    const body = req.method === 'POST' ? await readBody(req) : null;
    const json = (status: number, data: unknown, setCookies: string[] = []) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        ...(setCookies.length ? { 'set-cookie': setCookies } : {}),
      });
      res.end(JSON.stringify(data));
    };
    const year = new Date().getFullYear();

    if (path === `/api/api/abp/multi-tenancy/tenants/by-name/${taxCode}`) {
      return json(200, {
        success: true,
        tenantId: `tenant-${taxCode}`,
        name: taxCode,
        isActive: true,
      });
    }
    if (path === '/api/api/abp/application-configuration') {
      const xsrf = loggedIn ? `xsrf-${session}` : 'xsrf-anon';
      return json(200, { currentUser: { isAuthenticated: loggedIn } }, [
        `XSRF-TOKEN=${xsrf}; path=/`,
      ]);
    }
    if (path === '/api/api/account/login' && req.method === 'POST') {
      if (token !== 'xsrf-anon') {
        return json(400, {
          error: {
            message: 'The required antiforgery request token was not provided',
          },
        });
      }
      if ((body as { password?: string }).password !== this.password) {
        return json(200, {
          result: 2,
          description: 'Invalid username or password!',
        });
      }
      const id = `sess-${++this.logins}`;
      this.sessions.add(id);
      return json(200, { result: 1 }, [
        `.AspNetCore.Identity.Application=${id}; path=/; httponly`,
      ]);
    }
    // Every invoice POST is counted, also one refused for its session.
    if (path === '/api/api/app/invoice' && req.method === 'POST') {
      this.posts += 1;
    }
    if (!authed) {
      return json(401, {
        error: { message: 'Current user did not login to the application!' },
      });
    }
    if (path === '/api/api/app/tenant-company/') {
      return json(200, {
        taxCode,
        name: 'CÔNG TY TNHH KARAOKE THỬ NGHIỆM',
        address: 'Số 1 Phố Thử, Hà Nội',
        email: 'ketoan@example.com',
        tel: '',
        bankAccount: '0123456789',
        bankName: 'ACB',
        fax: '',
        webSite: '',
      });
    }
    if (path === '/api/api/app/register-invoice/using-list') {
      return json(200, {
        items: [
          {
            id: this.rangeId,
            symbolCode: this.symbolCode(),
            invoiceYear: year % 100,
            use: true,
            invoiceTypeName: 'Hóa đơn giá trị gia tăng - Máy tính tiền',
            creationTime: `${year}-01-02T11:09:22+07:00`,
          },
          {
            id: 'range-old',
            symbolCode: this.symbolCode(-1),
            invoiceYear: (year - 1) % 100,
            use: true,
            invoiceTypeName: 'Hóa đơn giá trị gia tăng - Máy tính tiền',
            creationTime: `${year - 1}-01-02T11:09:22+07:00`,
          },
        ],
      });
    }
    if (path === '/api/api/app/currency') {
      return json(200, {
        items: [
          { id: 'usd-id', code: 'USD' },
          { id: 'vnd-id', code: 'VND' },
        ],
      });
    }
    // The invoice list, filtered by column name like the web app's table;
    // its rows do not show orderNumber (plan Task 0).
    if (path === '/api/api/app/invoice' && req.method === 'GET') {
      const serial = url.searchParams.get('invoiceSerial');
      const marker = url.searchParams.get('orderNumber');
      const skip = Number(url.searchParams.get('skipCount') ?? 0);
      const max = Number(url.searchParams.get('maxResultCount') ?? 10);
      const matches = this.invoices.filter(
        (invoice) =>
          (serial === null || invoice.invoiceSerial === serial) &&
          (marker === null ||
            this.ignoreMarkerFilter ||
            invoice.orderNumber === marker),
      );
      return json(200, {
        items: matches.slice(skip, skip + max).map((invoice) => ({
          id: invoice.id,
          invoiceSerial: invoice.invoiceSerial,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: `${invoice.invoiceDate as string}T00:00:00`,
          invoiceStatus: 0,
        })),
        totalCount: matches.length,
      });
    }
    if (path === '/api/api/app/invoice' && req.method === 'POST') {
      const behaviour = this.behaviours.shift() ?? 'ok';
      if (this.delayMs)
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      if (behaviour === 'drop') {
        req.socket.destroy();
        return;
      }
      if (behaviour === 'date-order') {
        return json(400, {
          error: {
            code: '296',
            message:
              'Ngày hóa đơn phải đảm bảo quy luật tăng dần của số hóa đơn',
          },
        });
      }
      if (behaviour === 'reject')
        return json(400, { error: { message: 'ModelState is not valid' } });
      const invoice = body as Record<string, unknown>;
      if (invoice.registerInvoiceId !== this.rangeId) {
        return json(400, { error: { message: 'Dải hóa đơn không hợp lệ' } });
      }
      const number = this.nextNumber++;
      this.invoices.push({
        ...invoice,
        id: `inv-${number}`,
        invoiceNumber: number,
      });
      if (behaviour === 'drop-after-create') {
        req.socket.destroy();
        return;
      }
      return json(200, {
        id: `inv-${number}`,
        invoiceNumber: number,
        invoiceStatus: 0,
        sendTaxStatus: 1,
      });
    }
    return json(404, {
      error: { message: `No route ${req.method} ${path}` },
    });
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as unknown) : {};
}

if (require.main === module) {
  const fake = new FakeMinvoice();
  void fake.start(Number(process.argv[2] ?? 4555)).then((template) => {
    console.log(
      `Minvoice giả: MINVOICE_URL_TEMPLATE=${template} — mật khẩu ${fake.password}`,
    );
  });
}
