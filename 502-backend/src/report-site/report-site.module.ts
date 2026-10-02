import { Module } from '@nestjs/common';
import { EinvoiceModule } from '../einvoice/einvoice.module';
import { EinvoiceReportsService } from './einvoice-reports.service';
import { ManualBillsService } from './manual-bills.service';
import { ReportSiteBillsService } from './report-site-bills.service';
import { ReportSiteReportsController } from './report-site-reports.controller';
import { ReportSiteController } from './report-site.controller';

// Trang báo cáo theo hóa đơn điện tử (spec 2026-10-02-trang-bao-cao-hddt).
@Module({
  imports: [EinvoiceModule],
  controllers: [ReportSiteController, ReportSiteReportsController],
  providers: [
    ManualBillsService,
    ReportSiteBillsService,
    EinvoiceReportsService,
  ],
})
export class ReportSiteModule {}
