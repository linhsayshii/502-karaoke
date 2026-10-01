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

// Why Minvoice refused a login: a wrong username/password, no active tenant
// for the MST, or an account it will not let in (ABP's NotAllowed, LockedOut,
// RequiresTwoFactor), which is not a wrong password.
export type MinvoiceLoginReason =
  | 'password'
  | 'tenant'
  | 'not-allowed'
  | 'locked'
  | 'two-factor';

export class MinvoiceLoginError extends Error {
  constructor(
    readonly reason: MinvoiceLoginReason,
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

// The body an error keeps. A long ABP error (Minvoice puts the .NET stack
// trace in `error.details`) is kept as JSON with only the fields read here,
// each cut short: cutting the raw text would leave JSON that no longer parses,
// and a Minvoice refusal would then look like a gateway page (uncertain).
const KEPT_BODY = 2000;
const KEPT_FIELD = 500;
export function keptBody(body: string): string {
  if (body.length <= KEPT_BODY) return body;
  const json = parseBody(body);
  if (!json) return body.slice(0, KEPT_BODY);
  const cut = (value: unknown) =>
    typeof value === 'string' ? value.slice(0, KEPT_FIELD) : undefined;
  const error = json.error;
  return JSON.stringify({
    error:
      typeof error === 'object' && error !== null
        ? {
            code: typeof error.code === 'number' ? error.code : cut(error.code),
            message: cut(error.message),
            details: cut(error.details),
          }
        : undefined,
    message: cut(json.message),
    description: cut(json.description),
  });
}

// `error.details` without the stack trace Minvoice appends, and nothing when
// all that is left repeats the message ("MInvoiceBusinessException: <message>").
function detailsOf(details: unknown, message: unknown): string {
  if (typeof details !== 'string') return '';
  const text = details.split(/\s*STACK TRACE:/i)[0].trim();
  return typeof message === 'string' && message && text.includes(message)
    ? ''
    : text;
}

// The message inside an ABP error body ({error: {message, details}}), or ''
// when the body is not JSON or carries none.
export function minvoiceJsonMessage(body: string): string {
  const json = parseBody(body);
  if (!json) return '';
  const message = json.error?.message ?? json.message ?? json.description;
  return [message, detailsOf(json.error?.details, message)]
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
