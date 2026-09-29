import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Ngày không hợp lệ (định dạng YYYY-MM-DD)';

export class AddPrSessionDto {
  @ApiProperty()
  @IsInt()
  orderId: number;

  @ApiProperty()
  @IsInt()
  prStaffId: number;

  @ApiProperty({ required: false, description: 'Giờ vào; mặc định bây giờ' })
  @IsOptional()
  @IsDateString()
  startAt?: string;
}

export class UpdatePrSessionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'null: còn trong phòng',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endAt?: string | null;
}

export class PrBranchQuery {
  @ApiProperty({ required: false, description: 'Mã cơ sở, vd cs1' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class PrStatsQuery extends PrBranchQuery {
  @ApiProperty({ description: 'Ngày kinh doanh đầu (YYYY-MM-DD)' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  from: string;

  @ApiProperty({ description: 'Ngày kinh doanh cuối (YYYY-MM-DD)' })
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  to: string;
}
