import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Connections of the report pool. However many people download reports at
// once, their queries queue here among themselves, and the main pool
// (PrismaService, connection_limit of DATABASE_URL) stays free for the
// cashiers. Kept below the database's CPUs plus one so reports cannot take
// the whole database either.
export const REPORT_CONNECTION_LIMIT = 3;
// Seconds a report query may wait for a connection (then 503 "Hệ thống đang
// bận"); below the 60s after which Nginx gives up on the request.
export const REPORT_POOL_TIMEOUT = 50;

// DATABASE_URL with the report pool's own size and wait.
export function reportDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('connection_limit', String(REPORT_CONNECTION_LIMIT));
  parsed.searchParams.set('pool_timeout', String(REPORT_POOL_TIMEOUT));
  return parsed.toString();
}

// Read-only client of the report endpoints (src/reports, the fund summary):
// the same database through a small pool of its own.
@Injectable()
export class ReportPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = reportDatabaseUrl(process.env.DATABASE_URL);
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
