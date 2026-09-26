import { ApiProperty } from '@nestjs/swagger';
import { StockDocType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class DateRangeQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    required: false,
    description: 'Từ ngày kinh doanh YYYY-MM-DD (06:00 → 06:00 hôm sau)',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({
    required: false,
    description: 'Đến ngày kinh doanh YYYY-MM-DD',
  })
  @IsOptional()
  @IsString()
  to?: string;
}

export class ListDocumentsQuery extends DateRangeQuery {
  @ApiProperty({ required: false, enum: StockDocType })
  @IsOptional()
  @IsEnum(StockDocType)
  type?: StockDocType;
}

export class ListMovementsQuery extends DateRangeQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;
}
