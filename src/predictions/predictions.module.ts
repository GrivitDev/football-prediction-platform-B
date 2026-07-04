import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';

import { Prediction, PredictionSchema } from './schemas/prediction.schema';

import { PredictionPurchasesModule } from '../prediction-purchases/prediction-purchases.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'; // ✅ ADD THIS

import { SettlementService } from './settlement/settlement.service';
import { AccessService } from './access/access.service';

import { SettlementController } from './settlement/settlement.controller';
import { PredictionUserService } from './prediction-user.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Prediction.name,
        schema: PredictionSchema,
      },
    ]),
    PredictionPurchasesModule,
    SubscriptionsModule,
  ],

  controllers: [PredictionsController, SettlementController],

  providers: [
    PredictionsService,
    SettlementService,
    AccessService,
    PredictionUserService,
  ],

  exports: [PredictionsService, SettlementService],
})
export class PredictionsModule {}
