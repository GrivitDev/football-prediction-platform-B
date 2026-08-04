import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CronService } from './cron.service';

import { UsersModule } from '../users/users.module';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule],
  providers: [CronService],
})
export class CronModule {}
