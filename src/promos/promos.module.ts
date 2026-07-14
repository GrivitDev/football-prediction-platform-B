import { Module, forwardRef } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { Promo, PromoSchema } from './schemas/promo.schema';

import { PromoReward, PromoRewardSchema } from './schemas/promo-reward.schema';

import { PromosService } from './promos.service';

import { PromosController } from './promos.controller';

import { PromoEngineService } from './promo-engine.service';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

import { UsersModule } from '../users/users.module';
import { ReferralsModule } from 'src/referrals/referrals.module';
import {
  PromoParticipant,
  PromoParticipantSchema,
} from './schemas/promo-participant.schema';

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

      {
        name: PromoParticipant.name,
        schema: PromoParticipantSchema,
      },
    ]),

    forwardRef(() => ReferralsModule),

    SubscriptionsModule,

    UsersModule,
  ],

  controllers: [PromosController],

  providers: [PromosService, PromoEngineService],

  exports: [PromosService, PromoEngineService],
})
export class PromosModule {}
