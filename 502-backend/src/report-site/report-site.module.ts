import { Module } from '@nestjs/common';
import { EinvoiceModule } from '../einvoice/einvoice.module';
import { ManualBillsService } from './manual-bills.service';
import { ReportSiteController } from './report-site.controller';

// Trang báo cáo theo hóa đơn điện tử (spec 2026-10-02-trang-bao-cao-hddt).
@Module({
  imports: [EinvoiceModule],
  controllers: [ReportSiteController],
  providers: [ManualBillsService],
})
export class ReportSiteModule {}
