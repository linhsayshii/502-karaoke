import type { NextConfig } from "next";

// Where `/api/*` is proxied. Read at build time (rewrites are baked into the build),
// so the Docker image sets it as a build arg; unset, it keeps pointing at production.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'https://kara.hvlsv.uk';

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) for the Docker image
  output: 'standalone',
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
