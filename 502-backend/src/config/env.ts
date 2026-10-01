// Secrets are required in production; dev/test fall back to fixed values.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return `dev-only-${name.toLowerCase()}`;
}

export const jwtSecret = () => requireEnv('JWT_SECRET');
export const jwtRefreshSecret = () => requireEnv('JWT_REFRESH_SECRET');

// Set COOKIE_SECURE=true when the app is only served over HTTPS.
export const cookieSecure = () => process.env.COOKIE_SECURE === 'true';

// A login lasts this long, then the account must log in again (use does not extend it).
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// Origins allowed to call the API from another site (CORS_ORIGINS, comma-separated).
// Unset: any origin in development, none in production, where the browser calls
// /api on the app's own origin.
export function corsOrigins(): string[] | boolean {
  const list = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (list.length > 0) return list;
  return process.env.NODE_ENV !== 'production';
}

// Swagger (/api/docs) is off in production unless SWAGGER_ENABLED=true.
export const swaggerEnabled = () =>
  process.env.NODE_ENV !== 'production' ||
  process.env.SWAGGER_ENABLED === 'true';

// Key of the Minvoice passwords and sessions (AES-256-GCM): 32 bytes, base64,
// e.g. `openssl rand -base64 32`. Required in production; dev and test use a
// fixed key so a fresh checkout runs without setup.
const DEV_EINVOICE_SECRET = Buffer.alloc(32, 7).toString('base64');
export const einvoiceSecret = () =>
  process.env.NODE_ENV === 'production'
    ? requireEnv('EINVOICE_SECRET')
    : process.env.EINVOICE_SECRET || DEV_EINVOICE_SECRET;
