import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { AdsController } from './ads.controller';

import { AdminAdsController } from './admin-ads.controller';

import { AdsService } from './ads.service';

import { Ad, AdSchema } from './schemas/ad.schema';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Ad.name,
        schema: AdSchema,
      },
    ]),

    SubscriptionsModule,
  ],

  controllers: [AdsController, AdminAdsController],

  providers: [AdsService],

  exports: [AdsService],
})
export class AdsModule {}
