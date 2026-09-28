import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BreakdownReportsService } from './breakdown-reports.service';
import { AccountingReportsService } from './accounting-reports.service';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    BreakdownReportsService,
    AccountingReportsService,
  ],
})
export class ReportsModule {}
