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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ListOrdersQuery, StatisticsQuery } from './dto/order-queries';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { EditPaidOrderDto } from './dto/edit-paid-order.dto';
import { CancelReasonDto } from '../common/dto/cancel-reason.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS, SALES } from '../auth/roles';

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

  @Get('statistics')
  @Roles(...MANAGERS)
  getStatistics(
    @CurrentUser() user: AuthUser,
    @Query() query: StatisticsQuery,
  ) {
    return this.ordersService.getStatistics(user, query);
  }

  // Bill history is a report (managers); staff get their open sessions.
  @Get()
  @Roles(...MANAGERS, Role.STAFF)
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQuery) {
    return this.ordersService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordersService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(...SALES)
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

  // Corrects a paid bill: stock and the fund receipt follow the new amounts.
  @Patch(':id/paid')
  @Roles(...MANAGERS)
  editPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditPaidOrderDto,
  ) {
    return this.ordersService.editPaid(user, id, dto);
  }

  // Voids a paid bill: stock goes back, the fund receipt is cancelled.
  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @Roles(...MANAGERS)
  voidPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelReasonDto,
  ) {
    return this.ordersService.voidPaid(user, id, dto.reason);
  }
}
