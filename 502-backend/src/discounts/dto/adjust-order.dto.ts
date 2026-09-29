import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderAdjustmentsDto } from '../../orders/dto/order-adjustments.dto';

export class AdjustOrderDto extends OrderAdjustmentsDto {
  @ApiProperty({
    required: false,
    maxLength: 500,
    description: 'Lý do; bắt buộc khi cần quản lý duyệt',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
