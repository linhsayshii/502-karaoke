import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [InventoryModule, UsersModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
