import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { GROUP_BYS, type GroupBy } from '../buckets';

export const STAFF_ROLES = ['cskh', 'server', 'cashier'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ROOM_GROUPS = ['room', 'type'] as const;
export type RoomGroup = (typeof ROOM_GROUPS)[number];
export const PRODUCT_GROUPS = ['product', 'category'] as const;
export type ProductGroup = (typeof PRODUCT_GROUPS)[number];

// Branch and business days of a report.
export class ReportRangeQuery {
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
}

// A report over time: its periods and the comparison with the period before.
export class ReportQuery extends ReportRangeQuery {
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

export class StaffReportQuery extends ReportRangeQuery {
  @ApiProperty({
    required: false,
    enum: STAFF_ROLES,
    default: 'cskh',
    description: 'cskh: CSKH, server: phục vụ, cashier: người thanh toán',
  })
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;
}

export class RoomReportQuery extends ReportRangeQuery {
  @ApiProperty({ required: false, enum: ROOM_GROUPS, default: 'room' })
  @IsOptional()
  @IsIn(ROOM_GROUPS)
  by?: RoomGroup;
}

export class ProductReportQuery extends ReportRangeQuery {
  @ApiProperty({ required: false, enum: PRODUCT_GROUPS, default: 'product' })
  @IsOptional()
  @IsIn(PRODUCT_GROUPS)
  by?: ProductGroup;
}
