import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { validationExceptionFactory } from './common/validation';
import { swaggerEnabled } from './config/env';

const API_PREFIX = 'api';

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp<T extends NestExpressApplication>(app: T): T {
  // Security headers (nosniff, no framing, no X-Powered-By, …). The API only
  // serves JSON; the CSP is relaxed for the Swagger UI page.
  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled() ? false : undefined,
    }),
  );
  // A body is read whole into memory before any guard runs, even for callers
  // without a token, so only the Excel imports (up to 1000 rows as JSON) may
  // send 5mb; every other route 1mb. The first parser marks the request as
  // parsed and the second one then skips it.
  app.use(`/${API_PREFIX}/imports`, json({ limit: '5mb' }));
  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  return app;
}
