import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// Maps common Prisma errors to HTTP errors with Vietnamese messages.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    let mapped: HttpException | undefined;
    switch (exception.code) {
      case 'P2002':
        mapped = new ConflictException('Dữ liệu bị trùng');
        break;
      case 'P2003':
        mapped = new ConflictException(
          'Dữ liệu đang được sử dụng ở nơi khác, không thể thực hiện',
        );
        break;
      case 'P2025':
        mapped = new NotFoundException('Không tìm thấy dữ liệu');
        break;
      // No free database connection in time (P2024), or a transaction that
      // could not start or ran out of time (P2028).
      case 'P2024':
      case 'P2028':
        mapped = new ServiceUnavailableException(
          'Hệ thống đang bận, vui lòng thử lại sau giây lát',
        );
        break;
    }
    super.catch(mapped ?? exception, host);
  }
}
