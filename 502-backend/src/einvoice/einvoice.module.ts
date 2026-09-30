import { Module, OnModuleInit } from '@nestjs/common';
import { EinvoiceConfigController } from './einvoice-config.controller';
import { EinvoiceConfigService } from './einvoice-config.service';
import { EinvoicesController } from './einvoices.controller';
import { EinvoicesService } from './einvoices.service';
import { assertEinvoiceSecret } from './einvoice-secret';
import { MinvoiceClient } from './minvoice/minvoice-client';
import { TaxPayerService } from './tax-payer.service';

// Hóa đơn điện tử through Minvoice (spec 2026-10-01).
@Module({
  controllers: [EinvoiceConfigController, EinvoicesController],
  providers: [
    MinvoiceClient,
    TaxPayerService,
    EinvoiceConfigService,
    EinvoicesService,
  ],
})
export class EinvoiceModule implements OnModuleInit {
  // Production refuses to start without a valid EINVOICE_SECRET (spec §11).
  onModuleInit() {
    assertEinvoiceSecret();
  }
}
