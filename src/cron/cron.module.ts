import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CronService } from './cron.service';

import { UsersModule } from '../users/users.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule, PaymentsModule],
  providers: [CronService],
})
export class CronModule {}
