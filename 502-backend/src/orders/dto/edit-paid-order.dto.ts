import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { UpdateOrderDto } from './update-order.dto';
import { OrderAdjustmentsDto } from './order-adjustments.dto';

// What a manager may correct on a paid bill. The bill is recomputed and the
// stock and fund receipt follow it. Without new times or price the room fee
// that was charged is kept.
export class EditPaidOrderDto extends IntersectionType(
  UpdateOrderDto,
  OrderAdjustmentsDto,
) {
  @ApiProperty({ required: false, description: 'Giờ vào (ISO)' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiProperty({ required: false, description: 'Giờ ra (ISO)' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiProperty({ required: false, description: 'Giá phòng theo giờ' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerHour?: number;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ description: 'Lý do sửa', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
