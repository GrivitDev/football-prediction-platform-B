import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from './schemas/prediction.schema';

import { CreatePredictionDto } from './dto/create-prediction.dto';

import { UpdatePredictionDto } from './dto/update-prediction.dto';

import { PredictionCalculationService } from './prediction-calculation.service';

@Injectable()
export class PredictionsService {
  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly calculationService: PredictionCalculationService,
  ) {}

  async calculate(dto: CreatePredictionDto) {
    return this.calculationService.calculate(dto.matchId, dto.markets);
  }

  async create(dto: CreatePredictionDto) {
    const existingPrediction = await this.predictionModel.findOne({
      matchId: dto.matchId,
    });

    if (existingPrediction && !existingPrediction.deleted) {
      throw new BadRequestException(
        'A prediction already exists for this match',
      );
    }

    if (existingPrediction?.deleted) {
      throw new BadRequestException(
        'A deleted prediction already exists for this match. Restore or permanently remove it before creating another.',
      );
    }

    const calculated = await this.calculationService.calculate(
      dto.matchId,
      dto.markets,
    );

    return this.predictionModel.create({
      matchId: calculated.matchId,
      leagueCode: calculated.leagueCode,
      league: calculated.league,

      homeTeam: calculated.homeTeam,
      awayTeam: calculated.awayTeam,

      homeTeamBadge: calculated.homeTeamBadge,
      awayTeamBadge: calculated.awayTeamBadge,

      prediction: calculated.prediction,

      predictionProbability: calculated.predictionProbability,
      probabilitySource: calculated.probabilitySource,
      confidence: calculated.confidence,

      predictionOdds: calculated.predictionOdds,
      predictionFairOdds: calculated.predictionFairOdds,
      predictionOddsSource: calculated.predictionOddsSource,

      markets: calculated.markets,

      sportsDataSnapshot: calculated.sportsDataSnapshot,
      modelVersion: calculated.modelVersion,
      calculatedAt: calculated.calculatedAt,

      accessType: dto.accessType,
      price: dto.price ?? 0,

      matchDate: calculated.matchDate,
      kickoffTimestamp: calculated.kickoffTimestamp,
    });
  }

  async findAll() {
    return this.predictionModel
      .find({
        deleted: false,
      })
      .sort({
        createdAt: -1,
      });
  }

  async findOne(id: string) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    return prediction;
  }

  async update(id: string, dto: UpdatePredictionDto) {
    const prediction = await this.findOne(id);

    if (prediction.settled) {
      throw new ForbiddenException('Prediction is locked after settlement');
    }

    let calculated: Awaited<
      ReturnType<PredictionCalculationService['calculate']>
    > | null = null;

    if (dto.markets) {
      calculated = await this.calculationService.calculate(
        prediction.matchId,
        dto.markets,
      );
    }

    const updateData: Record<string, unknown> = {};

    if (dto.accessType !== undefined) {
      updateData.accessType = dto.accessType;
    }

    if (dto.price !== undefined) {
      updateData.price = dto.price;
    }

    if (calculated) {
      updateData.leagueCode = calculated.leagueCode;
      updateData.league = calculated.league;

      updateData.homeTeam = calculated.homeTeam;
      updateData.awayTeam = calculated.awayTeam;

      updateData.homeTeamBadge = calculated.homeTeamBadge;
      updateData.awayTeamBadge = calculated.awayTeamBadge;

      updateData.matchDate = calculated.matchDate;
      updateData.kickoffTimestamp = calculated.kickoffTimestamp;

      updateData.prediction = calculated.prediction;

      updateData.predictionProbability = calculated.predictionProbability;
      updateData.probabilitySource = calculated.probabilitySource;
      updateData.confidence = calculated.confidence;

      updateData.predictionOdds = calculated.predictionOdds;
      updateData.predictionFairOdds = calculated.predictionFairOdds;
      updateData.predictionOddsSource = calculated.predictionOddsSource;

      updateData.markets = calculated.markets;

      updateData.sportsDataSnapshot = calculated.sportsDataSnapshot;
      updateData.modelVersion = calculated.modelVersion;
      updateData.calculatedAt = calculated.calculatedAt;
    }

    if (!Object.keys(updateData).length) {
      return prediction;
    }

    return this.predictionModel.findByIdAndUpdate(
      id,
      {
        $set: updateData,
      },
      {
        returnDocument: 'after',
        runValidators: true,
      },
    );
  }

  async delete(id: string) {
    const prediction = await this.findOne(id);

    if (prediction.settled) {
      throw new ForbiddenException('Prediction is locked after settlement');
    }

    return this.predictionModel.findByIdAndUpdate(
      id,
      {
        $set: {
          deleted: true,
        },
      },
      {
        returnDocument: 'after',
      },
    );
  }

  async getForUser(id: string) {
    const prediction = await this.findOne(id);

    return {
      ...prediction.toObject(),
      markets: prediction.markets || [],
    };
  }

  async countPredictions() {
    return this.predictionModel.countDocuments({
      deleted: false,
    });
  }

  async findSettledWins() {
    const predictions = await this.predictionModel
      .find({
        status: 'won',
        settled: true,
        deleted: false,
      })
      .sort({
        settledAt: -1,
      })
      .limit(50)
      .lean()
      .exec();

    return predictions.map((prediction) => ({
      ...prediction,

      data: {
        prediction: prediction.prediction,
        predictionProbability: prediction.predictionProbability,
        probabilitySource: prediction.probabilitySource,
        confidence: prediction.confidence,
        markets: prediction.markets ?? [],
      },

      accessType: prediction.accessType,
      price: prediction.price,

      access: {
        allowed: true,
        state: 'settled',
        purchased: false,
        plan: prediction.accessType,
        message: null,
      },
    }));
  }
}
