import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import {
  PredictionPurchase,
  PredictionPurchaseSchema,
} from './schemas/prediction-purchase.schema';

import {
  Prediction,
  PredictionSchema,
} from '../predictions/schemas/prediction.schema';

import { PredictionPurchasesController } from './prediction-purchases.controller';

import { PredictionPurchasesService } from './prediction-purchases.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PredictionPurchase.name,
        schema: PredictionPurchaseSchema,
      },

      {
        name: Prediction.name,
        schema: PredictionSchema,
      },
    ]),
  ],

  controllers: [PredictionPurchasesController],

  providers: [PredictionPurchasesService],

  exports: [PredictionPurchasesService],
})
export class PredictionPurchasesModule {}
