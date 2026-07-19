import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

import { Payment, PaymentSchema } from './schemas/payment.schema';

import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PredictionPurchasesModule } from '../prediction-purchases/prediction-purchases.module'; // ✅ ADD THIS
import { TelegramModule } from 'src/telegram/telegram.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { PlanConfigModule } from 'src/plan-config/plan-config.module';
import { EmailModule } from 'src/notifications/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Payment.name,
        schema: PaymentSchema,
      },
    ]),

    UsersModule,
    SubscriptionsModule,
    PredictionPurchasesModule,
    TelegramModule,
    RealtimeModule,
    ReferralsModule,
    PlanConfigModule,
    EmailModule,
  ],

  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
