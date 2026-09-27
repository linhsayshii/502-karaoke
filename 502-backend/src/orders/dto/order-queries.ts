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
    description:
      'Từ ngày kinh doanh YYYY-MM-DD (06:00 → 06:00), theo giờ thanh toán/hủy',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({ required: false, description: 'Đến ngày kinh doanh' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiProperty({
    required: false,
    description: 'Một ngày kinh doanh (viết tắt của from = to)',
  })
  @IsOptional()
  @IsString()
  businessDate?: string;

  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
