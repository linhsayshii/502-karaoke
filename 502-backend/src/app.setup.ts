import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { validationExceptionFactory } from './common/validation';

// Shared by main.ts and the e2e tests so both run the same pipeline.
export function configureApp<T extends NestExpressApplication>(app: T): T {
  // Excel imports send up to 1000 rows as JSON (the default limit is 100kb).
  app.useBodyParser('json', { limit: '5mb' });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
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
