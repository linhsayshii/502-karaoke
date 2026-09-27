import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { MANAGERS } from '../auth/roles';
import { ReportsService } from './reports.service';
import { ReportQuery } from './dto/report-query';

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...MANAGERS)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Revenue (before VAT, VAT apart) per period; the whole chain when the
  // chain manager leaves out ?branch.
  @Get('revenue')
  revenue(@CurrentUser() user: AuthUser, @Query() query: ReportQuery) {
    return this.reportsService.revenue(user, query);
  }
}
