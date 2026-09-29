import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveDto {
  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do từ chối' })
  @IsString()
  @IsNotEmpty({ message: 'Nhập lý do từ chối' })
  @MaxLength(500)
  note: string;
}
