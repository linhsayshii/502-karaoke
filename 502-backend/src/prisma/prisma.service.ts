import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // The pool is small (connection_limit in DATABASE_URL): a transaction may
  // wait up to 10s for a free connection (Prisma's default is 2s) instead of
  // failing a checkout while a report download holds the connections.
  constructor() {
    super({ transactionOptions: { maxWait: 10_000 } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Stops the query engine so app.close() (and Jest) can exit.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
