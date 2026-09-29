import { Module } from '@nestjs/common';
import { DataPurgeController } from './data-purge.controller';
import { DataPurgeService } from './data-purge.service';

@Module({
  controllers: [DataPurgeController],
  providers: [DataPurgeService],
})
export class DataPurgeModule {}
