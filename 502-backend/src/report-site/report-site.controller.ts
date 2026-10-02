import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGERS, READERS } from '../auth/roles';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import { withTotalCount } from '../common/total-count';
import { EinvoiceBranchQuery } from '../einvoice/dto/config.dto';
import {
  EinvoiceBillsQuery,
  EinvoiceSummaryQuery,
} from '../einvoice/dto/einvoice.dto';
import { EinvoicesService } from '../einvoice/einvoices.service';
import {
  CancelManualBillDto,
  CreateManualBillDto,
  ReportSiteEinvoicesQuery,
} from './dto/manual-bill.dto';
import { ManualBillsService } from './manual-bills.service';
import { ReportSiteBillsService } from './report-site-bills.service';
import { ReportSiteEinvoicesService } from './report-site-einvoices.service';
import { ReportSiteGuard } from './report-site.guard';

// The report site (spec 2026-10-02-trang-bao-cao-hddt §6.1): every route
// behind ReportSiteGuard; reading is the managers' and HĐQT's, writing the
// managers'.
@ApiTags('report-site')
@ApiBearerAuth()
@Roles(...READERS)
@UseGuards(ReportSiteGuard)
@Controller('report-site')
export class ReportSiteController {
  constructor(
    private readonly manualBills: ManualBillsService,
    private readonly einvoices: EinvoicesService,
    private readonly bills: ReportSiteBillsService,
    private readonly einvoiceList: ReportSiteEinvoicesService,
  ) {}

  // Quản lý bán hàng: one row per e-invoice, by invoice date (spec
  // 2026-10-02-bao-cao-theo-tung-hddt §5.2).
  @Get('einvoices')
  einvoiceRows(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportSiteEinvoicesQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.einvoiceList.list(user, query));
  }

  // The bills of the report site (spec 2026-10-02 §6.1): the paid bills
  // holding an e-invoice and the bills thêm tay.
  @Get('bills')
  billList(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBillsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withTotalCount(res, this.bills.list(user, query));
  }

  @Get('bills/summary')
  @UseInterceptors(SharedRequestInterceptor)
  billSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceSummaryQuery,
  ) {
    return this.bills.summary(user, query);
  }

  // A bill thêm tay with its e-invoices (as GET /einvoices/bill/:orderId).
  @Get('manual-bills/:id')
  manualBill(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.einvoices.manualBillDetail(user, id);
  }

  @Post('manual-bills')
  @Roles(...MANAGERS)
  createManualBill(
    @CurrentUser() user: AuthUser,
    @Query() query: EinvoiceBranchQuery,
    @Body() dto: CreateManualBillDto,
  ) {
    return this.manualBills.create(user, dto, query.branch);
  }

  @Post('manual-bills/:id/cancel')
  @HttpCode(200)
  @Roles(...MANAGERS)
  cancelManualBill(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelManualBillDto,
  ) {
    return this.manualBills.cancel(user, id, dto);
  }
}
