import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

describe('PrismaExceptionFilter', () => {
  const respond = (code: string) => {
    const reply = jest.fn();
    const filter = new PrismaExceptionFilter({
      reply,
      isHeadersSent: () => false,
    } as never);
    const host = {
      getArgByIndex: () => ({}),
      getArgs: () => [{}, {}],
      switchToHttp: () => ({ getResponse: () => ({}) }),
      getType: () => 'http',
    } as unknown as ArgumentsHost;
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('x', {
        code,
        clientVersion: '5.22.0',
      }),
      host,
    );
    const [, body, status] = reply.mock.calls[0] as [
      unknown,
      { message: string },
      number,
    ];
    return { status, message: body.message };
  };

  it('tells the user to retry when the database is busy', () => {
    for (const code of ['P2024', 'P2028']) {
      expect(respond(code)).toEqual({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Hệ thống đang bận, vui lòng thử lại sau giây lát',
      });
    }
  });

  it('maps duplicates to 409', () => {
    expect(respond('P2002')).toEqual({
      status: HttpStatus.CONFLICT,
      message: 'Dữ liệu bị trùng',
    });
  });
});
