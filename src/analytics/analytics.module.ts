import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    UsersModule,
    PaymentsModule,
    PredictionsModule,
    SubscriptionsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
