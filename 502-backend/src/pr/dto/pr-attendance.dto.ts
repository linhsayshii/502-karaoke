import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)';

export class ListAttendanceQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({
    required: false,
    description: 'Ngày kinh doanh; mặc định hôm nay',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  businessDate?: string;
}

export class CheckInDto {
  @ApiProperty()
  @IsInt()
  prStaffId: number;

  @ApiProperty({
    required: false,
    description: 'Ngày kinh doanh; mặc định hôm nay',
  })
  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  businessDate?: string;

  @ApiProperty({ required: false, description: 'Giờ vào; mặc định bây giờ' })
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateAttendanceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'null: chưa ra',
  })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string | null;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
