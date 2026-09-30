// Failures of the Minvoice web API, sorted so the sender can tell a request
// Minvoice surely refused from one whose outcome is unknown (spec §9.1).

// Minvoice answered with a status >= 300, or with a web page instead of JSON.
export class MinvoiceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
  }
}

// No answer. `sent` is false only when the connection itself failed, so the
// request surely never reached Minvoice.
export class MinvoiceNetworkError extends Error {
  constructor(
    readonly sent: boolean,
    message: string,
  ) {
    super(message);
  }
}

// Wrong username/password, or no active tenant for the MST.
export class MinvoiceLoginError extends Error {
  constructor(
    readonly reason: 'password' | 'tenant',
    message: string,
  ) {
    super(message);
  }
}

// A 200 without what it must carry (e.g. an invoice without its number).
export class MinvoiceUnexpectedResponse extends Error {}

interface AbpErrorBody {
  error?: { code?: unknown; message?: string; details?: string };
  message?: string;
  description?: string;
}

function parseBody(body: string): AbpErrorBody | null {
  try {
    const json = JSON.parse(body) as unknown;
    return json && typeof json === 'object' ? (json as AbpErrorBody) : null;
  } catch {
    return null; // Not JSON: a page.
  }
}

// The message inside an ABP error body ({error: {message, details}}), or ''
// when the body is not JSON or carries none.
export function minvoiceJsonMessage(body: string): string {
  const json = parseBody(body);
  if (!json) return '';
  return [
    json.error?.message ?? json.message ?? json.description,
    json.error?.details,
  ]
    .filter(Boolean)
    .join(' — ')
    .slice(0, 300);
}

// The message inside an ABP error body, or the text of a page, cut to 300
// characters.
export function minvoiceMessage(body: string): string {
  const text = minvoiceJsonMessage(body);
  if (text) return text;
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// Whether the body is an ABP error ({error: {...}}): Minvoice's own answer to a
// request it refused, as opposed to a gateway page or an empty body.
export function isAbpError(body: string): boolean {
  const error = parseBody(body)?.error;
  return typeof error === 'object' && error !== null;
}

// `error.code` of an ABP error body ("296" for ErrorCode-296: the Minvoice web
// shows its own text for that code), as a string, or null when there is none.
export function minvoiceErrorCode(body: string): string | null {
  const code = parseBody(body)?.error?.code;
  if (typeof code === 'string' && code.trim()) return code.trim();
  if (typeof code === 'number') return String(code);
  return null;
}
