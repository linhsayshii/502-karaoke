import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePrStaffDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, description: 'Mã/số thẻ', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiProperty({ required: false, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdatePrStaffDto extends PartialType(CreatePrStaffDto) {
  @ApiProperty({ required: false, description: 'false: đã nghỉ' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListPrStaffQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
