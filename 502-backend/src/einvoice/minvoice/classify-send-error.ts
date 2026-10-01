import {
  MinvoiceHttpError,
  MinvoiceNetworkError,
  isAbpError,
  minvoiceErrorCode,
  minvoiceJsonMessage,
  minvoiceMessage,
} from './minvoice-errors';

// How a failed POST invoice is handled (spec 2026-10-01 §9.1):
// - retry: Minvoice refused it or it never left: log in again, fetch the
//   symbol's range again and resend once (the user's rule);
// - date-order: dated before the newest invoice of the symbol: resending
//   cannot help;
// - uncertain: it may have been created (no answer, a 2xx without the
//   invoice, a gateway 5xx): never resend blindly.
export type SendFailure = {
  kind: 'retry' | 'date-order' | 'uncertain';
  message: string;
};

// Minvoice's ErrorCode-296, the refusal of an invoice dated before the newest
// one of its symbol (plan step 0). The web app shows the text of the code when
// the answer carries `error.code`, so a body may hold only the code.
const DATE_ORDER_CODE = '296';
const DATE_ORDER_MESSAGE =
  'Ngày hóa đơn phải đảm bảo quy luật tăng dần của số hóa đơn';

// Its sentence, a looser one for a date said to be before another invoice,
// then the English sentence of the real Minvoice's HTTP 500 (01/10/2026, an
// ABP error with code null): "Create invoice fail because date is
// [30/09/2026 12:00:00 SA] use with other invoice before". Deliberately not
// "any sentence about the invoice date": ErrorCode-295 (date after today) and
// 29504 (date before the declaration) are not about the order of the numbers,
// and resending may still fix what they complain about.
export const DATE_ORDER_PATTERNS: RegExp[] = [
  /quy luật tăng dần của số hóa đơn/i,
  /ngày hóa đơn[^.]*(nhỏ hơn|trước)[^.]*hóa đơn/i,
  /because date is .* use with other invoice before/i,
];

export function classifySendError(error: unknown): SendFailure {
  if (error instanceof MinvoiceHttpError) {
    if (minvoiceErrorCode(error.body) === DATE_ORDER_CODE) {
      return {
        kind: 'date-order',
        message: minvoiceJsonMessage(error.body) || DATE_ORDER_MESSAGE,
      };
    }
    const text = minvoiceMessage(error.body);
    if (DATE_ORDER_PATTERNS.some((pattern) => pattern.test(text))) {
      return { kind: 'date-order', message: text };
    }
    // A gateway page or an empty 5xx may come from a request that Minvoice
    // went on to commit (a proxy cut the answer): only an ABP error body, or
    // a status below 500, shows Minvoice refused it.
    if (error.status >= 500 && !isAbpError(error.body)) {
      return { kind: 'uncertain', message: error.message };
    }
    return { kind: 'retry', message: error.message };
  }
  if (error instanceof MinvoiceNetworkError) {
    return { kind: error.sent ? 'uncertain' : 'retry', message: error.message };
  }
  return {
    kind: 'uncertain',
    message:
      error instanceof Error
        ? error.message
        : 'Lỗi không xác định khi gửi Minvoice',
  };
}
