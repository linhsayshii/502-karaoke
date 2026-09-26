import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

// The price is never taken from the client: new items use the product's
// current price, existing items keep the price snapshotted when ordered.
export class OrderItemDto {
  @ApiProperty()
  @IsInt()
  productId: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
