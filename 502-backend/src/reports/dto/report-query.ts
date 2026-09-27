import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { GROUP_BYS, type GroupBy } from '../buckets';

export class ReportQuery {
  @ApiProperty({
    required: false,
    description:
      'Mã cơ sở, vd cs1. Quản lý hệ thống bỏ trống để xem toàn chuỗi.',
  })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ description: 'Ngày kinh doanh đầu tiên, YYYY-MM-DD' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Ngày kinh doanh cuối cùng, YYYY-MM-DD' })
  @IsString()
  to: string;

  @ApiProperty({ required: false, enum: GROUP_BYS, default: 'day' })
  @IsOptional()
  @IsIn(GROUP_BYS)
  groupBy?: GroupBy;

  @ApiProperty({
    required: false,
    description: 'So với kỳ liền trước cùng số ngày (1 / true)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  compare?: boolean;
}
