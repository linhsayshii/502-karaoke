import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth-user';
import { EINVOICE_READERS, EINVOICE_WRITERS } from '../auth/roles';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import { withTotalCount } from '../common/total-count';
import {
  CreateEinvoiceDto,
  EinvoiceBillsQuery,
  EinvoiceDraftDto,
  EinvoiceListQuery,
} from './dto/einvoice.dto';
import { EinvoicesService } from './einvoices.service';

@ApiTags('einvoices')
@ApiBearerAuth()
@Controller('einvoices')
export class EinvoicesController {
  constructor(private readonly einvoices: EinvoicesService) {}

  // `summary`, `bills` and `bill/:orderId` are declared before `:id`: Nest
  // matches in declaration order.

  @Get()
  @Roles(...EINVOICE_READERS)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceListQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.einvoices.list(user, query));
  }

  @Get('summary')
  @Roles(...EINVOICE_READERS)
  @UseInterceptors(SharedRequestInterceptor)
  summary(@CurrentUser() user: AuthUser, @Query() query: EinvoiceListQuery) {
    return this.einvoices.summary(user, query);
  }

  @Get('bills')
  @Roles(...EINVOICE_WRITERS)
  bills(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBillsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.einvoices.bills(user, query));
  }

  @Get('bill/:orderId')
  @Roles(...EINVOICE_READERS)
  billDetail(
    @CurrentUser() user: AuthUser,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.einvoices.billDetail(user, orderId);
  }

  @Get(':id')
  @Roles(...EINVOICE_READERS)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.einvoices.findOne(user, id);
  }

  @Post()
  @Roles(...EINVOICE_WRITERS)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEinvoiceDto) {
    return this.einvoices.create(user, dto);
  }

  @Patch(':id')
  @Roles(...EINVOICE_WRITERS)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EinvoiceDraftDto,
  ) {
    return this.einvoices.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(...EINVOICE_WRITERS)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.einvoices.remove(user, id);
  }
}
