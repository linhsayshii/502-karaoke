import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { SALES } from '../auth/roles';
import { DiscountsService } from './discounts.service';
import { AdjustOrderDto } from './dto/adjust-order.dto';

@ApiTags('discounts')
@ApiBearerAuth()
@Controller()
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  // Discounts / VAT of an open session (not PATCH /orders/:id).
  @Post('orders/:id/adjustments')
  @Roles(...SALES)
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustOrderDto,
  ) {
    return this.discounts.adjust(user, id, dto);
  }
}
