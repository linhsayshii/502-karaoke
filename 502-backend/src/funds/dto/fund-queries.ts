import { ApiProperty } from '@nestjs/swagger';
import { TransactionType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { DateRangeQuery } from '../../inventory/dto/inventory-queries';

export class ListFundTransactionsQuery extends DateRangeQuery {
  @ApiProperty({ required: false, enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}
