import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGERS, READERS } from '../auth/roles';
import { EinvoiceBranchQuery } from '../einvoice/dto/config.dto';
import { EinvoicesService } from '../einvoice/einvoices.service';
import {
  CancelManualBillDto,
  CreateManualBillDto,
} from './dto/manual-bill.dto';
import { ManualBillsService } from './manual-bills.service';
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
  ) {}

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
