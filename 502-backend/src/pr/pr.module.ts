import { Module } from '@nestjs/common';
import { PrController } from './pr.controller';
import { PrService } from './pr.service';
import { PrSessionsService } from './pr-sessions.service';

@Module({
  controllers: [PrController],
  providers: [PrService, PrSessionsService],
})
export class PrModule {}
