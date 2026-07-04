import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from '../schemas/prediction.schema';

@Injectable()
export class SettlementService {
  constructor(
    @InjectModel(Prediction.name)
    private predictionModel: Model<PredictionDocument>,
  ) {}

  async settlePrediction(
    id: string,
    actualResult: 'HOME' | 'AWAY' | 'DRAW' | 'VOID',
  ) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction) {
      throw new NotFoundException('Prediction not found');
    }

    if (prediction.settled) {
      throw new BadRequestException('Prediction already settled');
    }

    if (actualResult === 'VOID') {
      prediction.status = 'void';
    } else {
      prediction.status =
        prediction.prediction === actualResult ? 'won' : 'lost';
    }

    prediction.settled = true;
    prediction.settledAt = new Date();

    return prediction.save();
  }
}
