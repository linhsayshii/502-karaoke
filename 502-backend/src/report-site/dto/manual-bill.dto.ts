import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Thêm hóa đơn of the report site's Quản lý bán hàng (spec 2026-10-02 §6.1).
export class CreateManualBillDto {
  @ApiProperty({
    description: 'Ngày kinh doanh của bill, YYYY-MM-DD, không sau hôm nay',
  })
  @Matches(DATE_RE, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  businessDate: string;

  @ApiProperty({ description: 'Phòng của cơ sở, vào số bill' })
  @IsInt()
  roomId: number;

  @ApiProperty({ description: 'Số tiền HĐĐT đầu tiên, đã gồm VAT, đồng' })
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  amount: number;
}

export class CancelManualBillDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MaxLength(300)
  @Matches(/\S/, { message: 'Vui lòng nhập lý do hủy' })
  reason: string;
}

// Quản lý bán hàng of the report site: one row per e-invoice (spec
// 2026-10-02-bao-cao-theo-tung-hddt §5.2).
export class ReportSiteEinvoicesQuery {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false, description: 'Từ ngày hóa đơn' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, description: 'Đến ngày hóa đơn' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  to?: string;

  @ApiProperty({
    required: false,
    description: 'Tìm theo đầu số hóa đơn của trang báo cáo, mọi ngày',
  })
  @IsOptional()
  @Matches(/^\d{1,15}$/, { message: 'Số hóa đơn chỉ gồm chữ số' })
  number?: string;
}
