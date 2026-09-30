import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { jwtSecret } from '../config/env';
import { LiveEventsService } from './live-events.service';
import { LiveGateway } from './live.gateway';

// Global: OrdersService, DiscountsService and PrSessionsService emit events
// without importing anything. The JwtModule here only verifies access
// tokens (same secret as AuthModule); it signs nothing.
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({ useFactory: () => ({ secret: jwtSecret() }) }),
  ],
  providers: [LiveEventsService, LiveGateway],
  exports: [LiveEventsService],
})
export class LiveModule {}
