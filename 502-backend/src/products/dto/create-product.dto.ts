import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Stock and cost price are not set here: they change only through
// inventory documents (phiếu nhập/xuất) and checkout.
export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: 'Đơn vị tính: lon, dĩa, chai...' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;
}
