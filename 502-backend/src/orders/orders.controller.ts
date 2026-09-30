import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ListOrdersQuery } from './dto/order-queries';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { EditPaidOrderDto } from './dto/edit-paid-order.dto';
import { CancelReasonDto } from '../common/dto/cancel-reason.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { CHAIN_ONLY, MANAGERS, SALES, SALES_READERS } from '../auth/roles';
import { withTotalCount } from '../common/total-count';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Opens a room session.
  @Post()
  @Roles(...SALES)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user, dto);
  }

  // Bill history of the branch (managers, HĐQT and the cashier); staff get
  // their open sessions. The newest 1000; X-Total-Count says how many match.
  @Get()
  @Roles(...SALES_READERS, Role.STAFF)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.ordersService.findAll(user, query));
  }

  // Totals of every bill the same filters select (the Hóa đơn page).
  @Get('summary')
  @Roles(...SALES_READERS)
  @UseInterceptors(SharedRequestInterceptor)
  summary(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQuery) {
    return this.ordersService.summary(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.findOne(user, id);
  }

  // Sales roles; the server of the room may only change its items (checked in the service).
  @Patch(':id')
  @Roles(...SALES, Role.STAFF)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(user, id, dto);
  }

  @Get(':id/preview')
  preview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.preview(user, id);
  }

  @Post(':id/checkout')
  @HttpCode(HttpStatus.OK)
  @Roles(...SALES)
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CheckoutOrderDto,
  ) {
    return this.ordersService.checkout(user, id, dto.paymentMethod);
  }

  // Chốt giờ: sales roles and the server of the room (checked in the service).
  @Post(':id/lock-time')
  @Roles(...SALES, Role.STAFF)
  lockTime(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.lockTime(user, id);
  }

  @Post(':id/unlock-time')
  @Roles(...SALES)
  unlockTime(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.unlockTime(user, id);
  }

  // Drops an open session without billing it.
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(...MANAGERS)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(user, id, dto.reason);
  }

  // Chain manager only: corrects a paid bill; stock and the fund receipt
  // follow the new amounts.
  @Patch(':id/paid')
  @Roles(...CHAIN_ONLY)
  editPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditPaidOrderDto,
  ) {
    return this.ordersService.editPaid(user, id, dto);
  }

  // Chain manager only: voids a paid bill; stock goes back, the fund receipt
  // is cancelled.
  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @Roles(...CHAIN_ONLY)
  voidPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReasonDto,
  ) {
    return this.ordersService.voidPaid(user, id, dto.reason);
  }
}
