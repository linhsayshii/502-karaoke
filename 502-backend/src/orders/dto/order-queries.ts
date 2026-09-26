import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListOrdersQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    required: false,
    description: 'Ngày kinh doanh YYYY-MM-DD (11:30 → 06:00)',
  })
  @IsOptional()
  @IsString()
  businessDate?: string;

  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class StatisticsQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsString()
  to: string;
}
