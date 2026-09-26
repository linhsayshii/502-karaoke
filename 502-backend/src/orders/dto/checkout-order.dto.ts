import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class CheckoutOrderDto {
  @ApiProperty({
    enum: PaymentMethod,
    required: false,
    default: PaymentMethod.CASH,
    description: 'Tiền mặt hoặc chuyển khoản; ghi vào phiếu thu của quỹ',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
