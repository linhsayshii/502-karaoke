import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

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
}
