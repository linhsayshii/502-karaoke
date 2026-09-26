import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, TransactionType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { DateRangeQuery } from '../../inventory/dto/inventory-queries';

export class ListFundTransactionsQuery extends DateRangeQuery {
  @ApiProperty({ required: false, enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiProperty({ required: false, enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}
