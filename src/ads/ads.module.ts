import { Module } from '@nestjs/common';

import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],

  controllers: [AdsController],

  providers: [AdsService],

  exports: [AdsService],
})
export class AdsModule {}
