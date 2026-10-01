import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    required: false,
    enum: ['report'],
    description: 'report: đăng nhập trang báo cáo',
  })
  @IsOptional()
  @IsIn(['report'])
  site?: 'report';
}
