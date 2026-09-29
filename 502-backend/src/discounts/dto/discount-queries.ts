import { ApiProperty } from '@nestjs/swagger';
import { DiscountRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày phải có dạng YYYY-MM-DD';

export class DiscountBranchQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class DiscountLogQuery extends DiscountBranchQuery {
  @ApiProperty({ description: 'Từ ngày kinh doanh YYYY-MM-DD' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from: string;

  @ApiProperty({ description: 'Đến ngày kinh doanh YYYY-MM-DD' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to: string;

  @ApiProperty({ required: false, enum: DiscountRequestStatus })
  @IsOptional()
  @IsEnum(DiscountRequestStatus)
  status?: DiscountRequestStatus;
}
