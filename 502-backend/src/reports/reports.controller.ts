import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { READERS, ALL_BRANCH_ROLES } from '../auth/roles';
import { ReportsService } from './reports.service';
import { BreakdownReportsService } from './breakdown-reports.service';
import { AccountingReportsService } from './accounting-reports.service';
import {
  ProductReportQuery,
  ReportQuery,
  ReportRangeQuery,
  RoomReportQuery,
  StaffReportQuery,
} from './dto/report-query';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...READERS)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly breakdowns: BreakdownReportsService,
    private readonly accounting: AccountingReportsService,
  ) {}

  // Revenue (before VAT, VAT apart) per period; the whole chain when the
  // chain manager leaves out ?branch.
  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.reportsService.revenue(user, query);
  }

  // Branch comparison: every branch side by side (chain manager only).
  @Get('branches')
  @Roles(...ALL_BRANCH_ROLES)
  branches(@Query() query: ReportQuery) {
    return this.reportsService.branches(query);
  }

  // Revenue per CSKH, server or cashier; each bill counts in full for each.
  @Get('staff')
  staff(@CurrentUser() user: AuthUser, @Query() query: StaffReportQuery) {
    return this.breakdowns.staff(user, query);
  }

  // Revenue and occupancy per room or room type.
  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser, @Query() query: RoomReportQuery) {
    return this.breakdowns.rooms(user, query);
  }

  // Sales per product or category, with the bills' discounts spread over
  // the lines.
  @Get('products')
  products(@CurrentUser() user: AuthUser, @Query() query: ProductReportQuery) {
    return this.breakdowns.products(user, query);
  }

  // Heatmap: weekday of the business day × hour the sessions started.
  @Get('hours')
  hours(@CurrentUser() user: AuthUser, @Query() query: ReportRangeQuery) {
    return this.breakdowns.hours(user, query);
  }

  // Profit and loss per period: revenue before VAT − cost of goods sold −
  // operating expenses − goods exported + other income.
  @Get('profit')
  profit(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.accounting.profit(user, query);
  }

  // Nhập – xuất – tồn per product, valued at the movements' cost.
  @Get('inventory')
  inventory(@CurrentUser() user: AuthUser, @Query() query: ReportRangeQuery) {
    return this.accounting.inventory(user, query);
  }
}
