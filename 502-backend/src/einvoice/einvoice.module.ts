import { Module, OnModuleInit } from '@nestjs/common';
import { EinvoiceConfigController } from './einvoice-config.controller';
import { EinvoiceConfigService } from './einvoice-config.service';
import { assertEinvoiceSecret } from './einvoice-secret';
import { MinvoiceClient } from './minvoice/minvoice-client';
import { TaxPayerService } from './tax-payer.service';

// Hóa đơn điện tử through Minvoice (spec 2026-10-01).
@Module({
  controllers: [EinvoiceConfigController],
  providers: [MinvoiceClient, TaxPayerService, EinvoiceConfigService],
})
export class EinvoiceModule implements OnModuleInit {
  // Production refuses to start without a valid EINVOICE_SECRET (spec §11).
  onModuleInit() {
    assertEinvoiceSecret();
  }
}
