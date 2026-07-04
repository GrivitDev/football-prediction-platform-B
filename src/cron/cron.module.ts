import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CronService } from './cron.service';

import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule, SubscriptionsModule],
  providers: [CronService],
})
export class CronModule {}
