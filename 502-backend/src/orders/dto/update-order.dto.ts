import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { OrderItemDto } from './order-item.dto';

// What may change on an open session besides discounts/VAT (see OrderAdjustmentsDto).
export class UpdateOrderDto {
  @ApiProperty({
    type: [OrderItemDto],
    required: false,
    description: 'Thay toàn bộ món',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  cskhId?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  serverId?: number | null;
}
