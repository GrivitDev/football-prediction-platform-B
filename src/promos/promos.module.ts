import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { Promo, PromoSchema } from './schemas/promo.schema';

import { PromoReward, PromoRewardSchema } from './schemas/promo-reward.schema';

import { PromosService } from './promos.service';

import { PromosController } from './promos.controller';

import { PromoEngineService } from './promo-engine.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

import { ReferralsModule } from '../referrals/referrals.module';

import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Promo.name,
        schema: PromoSchema,
      },

      {
        name: PromoReward.name,
        schema: PromoRewardSchema,
      },
    ]),

    ReferralsModule,

    SubscriptionsModule,

    UsersModule,
  ],

  controllers: [PromosController],

  providers: [PromosService, PromoEngineService],

  exports: [PromosService, PromoEngineService],
})
export class PromosModule {}
