import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { ReportsService } from './reports.service';
import { BreakdownReportsService } from './breakdown-reports.service';
import {
  ProductReportQuery,
  ReportQuery,
  RoomReportQuery,
  StaffReportQuery,
} from './dto/report-query';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly breakdowns: BreakdownReportsService,
  ) {}

  // Revenue (before VAT, VAT apart) per period; the whole chain when the
  // chain manager leaves out ?branch.
  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.reportsService.revenue(user, query);
  }

  // Branch comparison: every branch side by side (chain manager only).
  @Get('branches')
  @Roles(Role.CHAIN_MANAGER)
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
}
