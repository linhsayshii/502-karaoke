import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { READERS } from '../auth/roles';
import { SharedRequestInterceptor } from '../common/shared-request.interceptor';
import {
  ReportQuery,
  ReportRangeQuery,
  RoomReportQuery,
} from '../reports/dto/report-query';
import { EinvoiceReportsService } from './einvoice-reports.service';
import { ReportSiteGuard } from './report-site.guard';

// Doanh thu, Phòng, Hàng hóa of the report site (spec 2026-10-02 §6.1). The
// guard runs before the interceptor, so a shared computation only serves
// callers let in.
@ApiTags('report-site')
@ApiBearerAuth()
@Roles(...READERS)
@UseGuards(ReportSiteGuard)
@UseInterceptors(SharedRequestInterceptor)
@Controller('report-site/reports')
export class ReportSiteReportsController {
  constructor(private readonly reports: EinvoiceReportsService) {}

  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.reports.revenue(user, query);
  }

  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser, @Query() query: RoomReportQuery) {
    return this.reports.rooms(user, query);
  }

  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() query: ReportRangeQuery) {
    return this.reports.products(user, query);
  }
}
