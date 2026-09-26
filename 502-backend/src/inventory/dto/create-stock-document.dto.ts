import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, StockDocType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockDocumentLineDto {
  @ApiProperty()
  @IsInt()
  productId: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    required: false,
    description: 'Đơn giá nhập; phiếu xuất mặc định lấy giá vốn hiện tại',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class CreateStockDocumentDto {
  @ApiProperty({ enum: StockDocType })
  @IsEnum(StockDocType)
  type: StockDocType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    required: false,
    enum: PaymentMethod,
    description:
      'Chỉ phiếu nhập: đã trả tiền từ quỹ (ghi phiếu chi). Bỏ trống nếu mua nợ.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ type: [StockDocumentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockDocumentLineDto)
  lines: StockDocumentLineDto[];
}
