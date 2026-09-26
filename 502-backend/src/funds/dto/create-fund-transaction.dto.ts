import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

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
    description: 'Khoản mục, vd: Điện nước, Lương',
  })
  @IsOptional()
  @IsString()
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
