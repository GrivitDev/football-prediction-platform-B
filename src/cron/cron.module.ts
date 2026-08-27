import { Module } from '@nestjs/common';

import { CronService } from './cron.service';
import { SettlementCronService } from './settlement.cron.service';

import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { PredictionsModule } from '../predictions/predictions.module';

@Module({
  imports: [UsersModule, PaymentsModule, PredictionsModule],

  providers: [CronService, SettlementCronService],
})
export class CronModule {}
