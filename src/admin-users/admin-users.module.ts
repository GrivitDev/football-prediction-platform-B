import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PredictionPurchasesModule } from '../prediction-purchases/prediction-purchases.module';
import { UserSessionModule } from '../user-session/user-session.module';

import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [
    UsersModule,
    PaymentsModule,
    SubscriptionsModule,
    PredictionPurchasesModule,
    UserSessionModule,
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
