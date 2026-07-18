import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prediction, PredictionDocument } from './schemas/prediction.schema';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';

@Injectable()
export class PredictionsService {
  constructor(
    @InjectModel(Prediction.name)
    private predictionModel: Model<PredictionDocument>,
  ) {}

  // =========================
  // PROBABILITY VALIDATION
  // =========================
  private validateProbabilities(dto: {
    probabilities?: {
      home: number;
      draw: number;
      away: number;
    };
  }) {
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
  async create(dto: CreatePredictionDto) {
    const existingPrediction = await this.predictionModel.findOne({
      matchId: dto.matchId,
      deleted: false,
    });

    if (existingPrediction) {
      throw new BadRequestException(
        'A prediction already exists for this match',
      );
    }
    this.validateProbabilities(dto);

    const prediction = this.getPredictionFromProbabilities(
      dto.probabilities.home,
      dto.probabilities.draw,
      dto.probabilities.away,
    );

    return this.predictionModel.create({
      matchId: dto.matchId,

      leagueCode: dto.leagueCode,

      league: dto.league,

      homeTeam: dto.homeTeam,

      awayTeam: dto.awayTeam,

      homeTeamBadge: dto.homeTeamBadge,

      awayTeamBadge: dto.awayTeamBadge,

      prediction,

      probabilities: dto.probabilities,

      markets: this.normalizeMarkets(dto.markets),

      confidence: dto.confidence,

      accessType: dto.accessType,

      price: dto.price ?? 0,

      matchDate: dto.matchDate,

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
  async update(id: string, dto: UpdatePredictionDto) {
    const prediction = await this.findOne(id);

    if (prediction.settled) {
      throw new ForbiddenException('Prediction is locked after settlement');
    }

    this.validateProbabilities(dto);

    const updateData: any = {
      ...dto,
    };

    if (dto.probabilities) {
      updateData.prediction = this.getPredictionFromProbabilities(
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
        $set: updateData,
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
