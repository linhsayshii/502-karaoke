import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { MANUAL_CATEGORIES } from '../fund-categories';

// Phiếu thu (INCOME) / phiếu chi (EXPENSE).
export class CreateFundTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ enum: PaymentMethod, required: false, default: 'CASH' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({
    required: false,
    enum: MANUAL_CATEGORIES,
    description:
      'Khoản mục: chi theo danh sách cố định, thu là "Thu khác". Mặc định "Khác" / "Thu khác".',
  })
  @IsOptional()
  @IsIn(MANUAL_CATEGORIES, { message: 'Khoản mục không hợp lệ' })
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, description: 'Mặc định là thời điểm tạo' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;
}
