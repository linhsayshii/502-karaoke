import { BadRequestException, ValidationError } from '@nestjs/common';

function collectFields(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    return e.children?.length ? collectFields(e.children, path) : [path];
  });
}

// ValidationPipe exceptionFactory: one Vietnamese message naming the fields.
export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException(
    `Dữ liệu không hợp lệ: ${collectFields(errors).join(', ')}`,
  );
}
