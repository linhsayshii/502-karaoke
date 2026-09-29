import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { FundsModule } from './funds/funds.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { RoomsModule } from './rooms/rooms.module';
import { BranchesModule } from './branches/branches.module';
import { InventoryModule } from './inventory/inventory.module';
import { ImportsModule } from './imports/imports.module';
import { ReportsModule } from './reports/reports.module';
import { DataPurgeModule } from './data-purge/data-purge.module';
import { PrModule } from './pr/pr.module';
import { DiscountsModule } from './discounts/discounts.module';

@Module({
  imports: [
    // Loads .env into process.env (real env vars win).
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    RoomsModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    InventoryModule,
    FundsModule,
    ImportsModule,
    ReportsModule,
    DataPurgeModule,
    PrModule,
    DiscountsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
