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
