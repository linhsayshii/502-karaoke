import { classifySendError } from './classify-send-error';
import {
  MinvoiceHttpError,
  MinvoiceNetworkError,
  MinvoiceUnexpectedResponse,
} from './minvoice-errors';

describe('classifySendError (spec §9.1)', () => {
  const http = (status: number, message: string) =>
    new MinvoiceHttpError(
      status,
      JSON.stringify({ error: { message } }),
      `HTTP ${status}: ${message}`,
    );
  // A body that carries only Minvoice's error code (the web shows its own text).
  const httpCode = (code: string | number, message?: string) =>
    new MinvoiceHttpError(
      400,
      JSON.stringify({ error: { code, message } }),
      'HTTP 400',
    );

  it('resends after an answer Minvoice refused', () => {
    expect(classifySendError(http(401, 'Unauthorized')).kind).toBe('retry');
    expect(classifySendError(http(400, 'Dải hóa đơn không hợp lệ')).kind).toBe(
      'retry',
    );
    expect(classifySendError(http(500, 'Internal error')).kind).toBe('retry');
  });

  it('resends when the request never left', () => {
    expect(
      classifySendError(new MinvoiceNetworkError(false, 'ECONNREFUSED')).kind,
    ).toBe('retry');
  });

  it('never resends a date refused for its order', () => {
    expect(
      classifySendError(http(400, 'Ngày hóa đơn nhỏ hơn ngày hóa đơn mới nhất'))
        .kind,
    ).toBe('date-order');
  });

  it('knows the date-order sentence of ErrorCode-296', () => {
    const failure = classifySendError(
      http(400, 'Ngày hóa đơn phải đảm bảo quy luật tăng dần của số hóa đơn'),
    );
    expect(failure.kind).toBe('date-order');
    expect(failure.message).toBe(
      'Ngày hóa đơn phải đảm bảo quy luật tăng dần của số hóa đơn',
    );
  });

  it("knows Minvoice's English date-order sentence and leaves the stack trace out", () => {
    // HTTP 500 of the real Minvoice, 01/10/2026, for a date before the newest
    // invoice of the symbol.
    const message =
      'Create invoice fail because date is [30/09/2026 12:00:00 SA] use with other invoice before';
    const failure = classifySendError(
      new MinvoiceHttpError(
        500,
        JSON.stringify({
          error: {
            message,
            details: `MInvoiceBusinessException: ${message} STACK TRACE: at MInvoice.Invoices.InvoiceAppService.ValidDate()`,
          },
        }),
        'HTTP 500',
      ),
    );
    expect(failure).toEqual({ kind: 'date-order', message });
  });

  it('knows the date-order error by its code when the message says something else', () => {
    expect(classifySendError(httpCode('296', 'Lỗi không xác định')).kind).toBe(
      'date-order',
    );
    expect(classifySendError(httpCode(296, 'Lỗi không xác định')).kind).toBe(
      'date-order',
    );
  });

  it('words a date-order error that carries a code only', () => {
    const failure = classifySendError(httpCode('296'));
    expect(failure.kind).toBe('date-order');
    expect(failure.message).toBe(
      'Ngày hóa đơn phải đảm bảo quy luật tăng dần của số hóa đơn',
    );
  });

  it('resends the other date errors, which resending can fix or never reach', () => {
    // ErrorCode-295, 29504 and 31524 of the Minvoice web.
    expect(
      classifySendError(
        http(400, 'Ngày hóa đơn không được phép lớn hơn ngày hiện tại'),
      ).kind,
    ).toBe('retry');
    expect(
      classifySendError(
        http(
          400,
          'Ngày hóa đơn không được nhỏ hơn ngày của tờ khai. Vui lòng kiểm tra lại',
        ),
      ).kind,
    ).toBe('retry');
    expect(
      classifySendError(
        http(
          400,
          'Năm của Ngày lập hóa đơn KHÔNG KHỚP với năm của Ký hiệu hóa đơn',
        ),
      ).kind,
    ).toBe('retry');
    expect(classifySendError(httpCode('29504')).kind).toBe('retry');
  });

  it('does not resend a 5xx that is not an ABP error: the invoice may exist', () => {
    // A gateway page or an empty body says nothing about what Minvoice did.
    const raw = (status: number, body: string) =>
      new MinvoiceHttpError(status, body, `HTTP ${status}`);
    expect(
      classifySendError(raw(502, '<html><body>Bad gateway</body></html>')).kind,
    ).toBe('uncertain');
    expect(
      classifySendError(raw(504, '<html>Gateway Time-out</html>')).kind,
    ).toBe('uncertain');
    expect(classifySendError(raw(520, '<html>Unknown error</html>')).kind).toBe(
      'uncertain',
    );
    expect(classifySendError(raw(500, '')).kind).toBe('uncertain');
    expect(classifySendError(raw(503, '{"message":"busy"}')).kind).toBe(
      'uncertain',
    );
  });

  it('resends what Minvoice answered with an ABP error or below 500', () => {
    const raw = (status: number, body: string) =>
      new MinvoiceHttpError(status, body, `HTTP ${status}`);
    expect(
      classifySendError(raw(500, '{"error":{"message":"Internal error"}}'))
        .kind,
    ).toBe('retry');
    expect(classifySendError(raw(404, '<html>Not found</html>')).kind).toBe(
      'retry',
    );
    expect(classifySendError(raw(302, '')).kind).toBe('retry');
    // The login page served instead of the API, with a 200.
    expect(classifySendError(raw(200, '<html>login</html>')).kind).toBe(
      'retry',
    );
  });

  it('keeps the date-order check first on a 5xx', () => {
    const failure = classifySendError(
      new MinvoiceHttpError(500, '{"error":{"code":"296"}}', 'HTTP 500'),
    );
    expect(failure.kind).toBe('date-order');
  });

  it('marks as uncertain what may have been created', () => {
    expect(
      classifySendError(new MinvoiceNetworkError(true, 'timeout')).kind,
    ).toBe('uncertain');
    expect(
      classifySendError(new MinvoiceUnexpectedResponse('no number')).kind,
    ).toBe('uncertain');
    expect(classifySendError(new Error('bug')).kind).toBe('uncertain');
  });
});
