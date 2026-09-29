import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class PurgeDataDto {
  @ApiProperty({ enum: ['branch', 'all'] })
  @IsIn(['branch', 'all'], { message: 'Phạm vi xóa không hợp lệ' })
  scope: 'branch' | 'all';

  @ApiPropertyOptional({ description: 'Mã cơ sở, bắt buộc khi scope=branch' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ description: 'Mật khẩu của chính tài khoản đang đăng nhập' })
  @IsString({ message: 'Vui lòng nhập mật khẩu' })
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu' })
  password: string;
}
