import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class EinvoiceBranchQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class SymbolsQuery extends EinvoiceBranchQuery {
  @ApiProperty({
    required: false,
    description: 'Năm 4 chữ số; mặc định năm nay',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}

export class MinvoiceLoginDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

export class SelectSymbolDto {
  @ApiProperty({ description: 'registerInvoiceId của ký hiệu chọn' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  registerInvoiceId: string;
}
