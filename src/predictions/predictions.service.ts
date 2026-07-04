import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prediction, PredictionDocument } from './schemas/prediction.schema';

@Injectable()
export class PredictionsService {
  constructor(
    @InjectModel(Prediction.name)
    private predictionModel: Model<PredictionDocument>,
  ) {}

  // =========================
  // PROBABILITY VALIDATION
  // =========================
  private validateProbabilities(dto: any) {
    if (!dto.probabilities) return;

    const total =
      dto.probabilities.home + dto.probabilities.draw + dto.probabilities.away;

    if (total !== 100) {
      throw new BadRequestException('Probabilities must total 100%');
    }
  }

  // =========================
  // AUTO PREDICTION ENGINE
  // =========================
  private getPredictionFromProbabilities(
    home: number,
    draw: number,
    away: number,
  ): 'HOME' | 'DRAW' | 'AWAY' {
    const max = Math.max(home, draw, away);

    if (max === home) return 'HOME';
    if (max === away) return 'AWAY';
    return 'DRAW';
  }

  // =========================
  // NORMALIZE MARKETS
  // =========================
  private normalizeMarkets(markets: any[] = []) {
    return markets
      .filter((m) => m?.market)
      .map((m) => ({
        market: m.market.trim(),
        selection: m.selection?.trim() || '',
      }));
  }
  // =========================
  // CREATE PREDICTION
  // =========================
  async create(dto: any) {
    this.validateProbabilities(dto);

    const prediction = this.getPredictionFromProbabilities(
      dto.probabilities.home,
      dto.probabilities.draw,
      dto.probabilities.away,
    );

    const markets = this.normalizeMarkets(dto.markets);

    return this.predictionModel.create({
      ...dto,
      prediction,
      markets,
      kickoffTimestamp: new Date(dto.matchDate).getTime(),
    });
  }
  // =========================
  // GET ALL
  // =========================
  async findAll() {
    return this.predictionModel
      .find({ deleted: false })
      .sort({ createdAt: -1 });
  }

  // =========================
  // GET ONE
  // =========================
  async findOne(id: string) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    return prediction;
  }

  // =========================
  // UPDATE PREDICTION
  // =========================
  async update(id: string, dto: any) {
    const prediction = await this.findOne(id);

    if (prediction.settled) {
      throw new ForbiddenException('Prediction is locked after settlement');
    }

    this.validateProbabilities(dto);

    if (dto.probabilities) {
      dto.prediction = this.getPredictionFromProbabilities(
        dto.probabilities.home,
        dto.probabilities.draw,
        dto.probabilities.away,
      );
    }

    if (dto.markets) {
      dto.markets = this.normalizeMarkets(dto.markets);
    }

    return this.predictionModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...dto,
          ...(dto.markets && {
            markets: dto.markets,
          }),
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );
  }

  // =========================
  // DELETE (SOFT)
  // =========================
  async delete(id: string) {
    const prediction = await this.findOne(id);

    if (prediction.settled) {
      throw new ForbiddenException('Prediction is locked after settlement');
    }

    return this.predictionModel.findByIdAndUpdate(
      id,
      { $set: { deleted: true } },
      { new: true },
    );
  }

  // =========================
  // USER VIEW
  // =========================
  async getForUser(id: string, user: any) {
    const prediction = await this.findOne(id);

    return {
      ...prediction.toObject(),
      markets: prediction.markets || [],
    };
  }

  // =========================
  // COUNT
  // =========================
  async countPredictions() {
    return this.predictionModel.countDocuments({ deleted: false });
  }
}
