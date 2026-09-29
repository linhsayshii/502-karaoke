import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS, READERS, SALES, SALES_READERS } from '../auth/roles';
import { withTotalCount } from '../common/total-count';
import { DiscountsService } from './discounts.service';
import { AdjustOrderDto } from './dto/adjust-order.dto';
import { DiscountLogQuery } from './dto/discount-queries';
import { ApproveDto, RejectDto } from './dto/decision.dto';

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

  // `pending` and `pending-count` are declared before
  // `discount-requests/:id`: Nest matches in declaration order.

  // The approval queue of the caller (branch manager: own branch; chain
  // manager: every branch), oldest first; the newest 200.
  @Get('discount-requests/pending')
  @Roles(...MANAGERS)
  pending(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.discounts.pending(user));
  }

  // The sidebar badge (polled every 15 s on managers' screens only).
  @Get('discount-requests/pending-count')
  @Roles(...MANAGERS)
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.discounts.pendingCount(user);
  }

  // Nhật ký giảm giá, newest 500.
  @Get('discount-requests')
  @Roles(...READERS)
  log(
    @CurrentUser() user: AuthUser,
    @Query() query: DiscountLogQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.discounts.log(user, query));
  }

  // The room page reads what became of its request.
  @Get('discount-requests/:id')
  @Roles(...SALES_READERS)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discounts.findOne(user, id);
  }

  @Post('discount-requests/:id/approve')
  @Roles(...MANAGERS)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveDto,
  ) {
    return this.discounts.approve(user, id, dto.note);
  }

  @Post('discount-requests/:id/reject')
  @Roles(...MANAGERS)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDto,
  ) {
    return this.discounts.reject(user, id, dto.note);
  }

  @Post('discount-requests/:id/cancel')
  @Roles(...SALES)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.discounts.cancel(user, id);
  }
}
