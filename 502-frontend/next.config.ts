import type { NextConfig } from "next";

// Where `/api/*` is proxied. Read at build time (rewrites are baked into the build),
// so the Docker image sets it as a build arg; unset, it keeps pointing at production.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'https://kara.hvlsv.uk';

// The API origin the browser calls, when it is not the app's own origin (/api),
// and the WebSocket (/api/ws) of the same API origin.
function apiOrigin() {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  try {
    return new URL(url).origin;
  } catch {
    return null; // relative: same origin
  }
}

// Only this app's own scripts, styles and fonts run; no other site can frame it.
// Inline scripts stay allowed (Next's bootstrap and next-themes use them). Production
// only: the dev server needs eval and a websocket for hot reload.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin() ? ` ${apiOrigin()} ${apiOrigin()!.replace(/^http/, 'ws')}` : ''}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }]
    : []),
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) for the Docker image
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    // Every API call goes browser → Cloudflare → this rewrite → backend, and
    // Next's proxy cuts a rewritten request after 30 s by default (a 500
    // "Internal Server Error" while the backend carries on): too short for a
    // slow report or an e-invoice send (up to ~80 s of Minvoice timeouts).
    // Kept just below Cloudflare's own limit (100 s, then a 524), so this
    // proxy is never the first to give up.
    proxyTimeout: 95_000,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
