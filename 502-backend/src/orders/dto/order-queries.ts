import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

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

  @ApiProperty({
    required: false,
    description:
      'Số hóa đơn hoặc phần đầu của nó (vd 2709 = mọi hóa đơn ngày 27/09); tìm trên mọi ngày, bỏ qua from/to',
  })
  @IsOptional()
  @Matches(/^\d{1,20}$/, { message: 'Số hóa đơn chỉ gồm chữ số' })
  billNumber?: string;
}
