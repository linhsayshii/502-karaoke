import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ description: 'Mã dùng trên URL, vd cs5' })
  @Matches(/^[a-z0-9-]{2,20}$/)
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Mã số thuế: 10 số hoặc 10 số kèm -3 số; null để xóa',
  })
  @IsOptional()
  @ValidateIf((dto: CreateBranchDto) => dto.taxCode !== null)
  @Matches(/^\d{10}(-\d{3})?$/, {
    message: 'Mã số thuế phải có 10 số, hoặc 10 số kèm -3 số',
  })
  taxCode?: string | null;
}
