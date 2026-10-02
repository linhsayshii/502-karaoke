import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CHAIN_ONLY, EINVOICE_READERS, EINVOICE_WRITERS } from '../auth/roles';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import { withTotalCount } from '../common/total-count';
import {
  CreateEinvoiceDto,
  EinvoiceBillsQuery,
  EinvoiceDraftDto,
  EinvoiceNumberDto,
  EinvoiceSummaryQuery,
  IssueEinvoiceDto,
  ResolveEinvoiceDto,
} from './dto/einvoice.dto';
import { EinvoicesService } from './einvoices.service';

@ApiTags('einvoices')
@ApiBearerAuth()
@Controller('einvoices')
export class EinvoicesController {
  constructor(private readonly einvoices: EinvoicesService) {}

  // `summary`, `bills` and `bill/:orderId` are declared before `:id`: Nest
  // matches in declaration order.

  @Get('summary')
  @Roles(...EINVOICE_READERS)
  @UseInterceptors(SharedRequestInterceptor)
  summary(@CurrentUser() user: AuthUser, @Query() query: EinvoiceSummaryQuery) {
    return this.einvoices.summary(user, query);
  }

  @Get('bills')
  @Roles(...EINVOICE_READERS)
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

  // Issuing, resolving and numbers are the chain manager's (spec §3). Each
  // answers 200 with the row: the outcome of a send is its status.
  @Post(':id/issue')
  @HttpCode(200)
  @Roles(...CHAIN_ONLY)
  issue(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueEinvoiceDto,
  ) {
    return this.einvoices.issue(user, id, dto);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Roles(...CHAIN_ONLY)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveEinvoiceDto,
  ) {
    return this.einvoices.resolve(user, id, dto);
  }

  @Patch(':id/number')
  @Roles(...CHAIN_ONLY)
  editNumber(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EinvoiceNumberDto,
  ) {
    return this.einvoices.editNumber(user, id, dto);
  }
}
