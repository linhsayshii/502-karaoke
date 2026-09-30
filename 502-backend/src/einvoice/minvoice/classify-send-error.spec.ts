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
