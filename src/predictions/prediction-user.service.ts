import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from './schemas/prediction.schema';

import { AccessService } from './access/access.service';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { PlanLevels, PlanType } from './constants/plan-levels';

interface User {
  _id: string;
}

@Injectable()
export class PredictionUserService {
  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly accessService: AccessService,

    private readonly subscriptionService: SubscriptionsService,
  ) {}

  async getUserPredictions(user: User | null, league?: string) {
    const query: Record<string, any> = {
      deleted: false,
    };

    if (league) {
      query.leagueCode = league;
    }

    const predictions = await this.predictionModel.find(query).sort({
      createdAt: -1,
    });

    return Promise.all(
      predictions.map((prediction) => this.formatPrediction(user, prediction)),
    );
  }

  private async formatPrediction(
    user: User | null,
    prediction: PredictionDocument,
  ) {
    const access = await this.accessService.canAccessPrediction(
      user,
      prediction,
    );

    const userPlan: PlanType = user
      ? this.normalizePlan(
          await this.subscriptionService.getUserPlan(user._id.toString()),
        )
      : 'free';

    const base = {
      id: prediction._id,

      matchId: prediction.matchId,

      homeTeam: prediction.homeTeam,

      awayTeam: prediction.awayTeam,

      homeTeamBadge: prediction.homeTeamBadge,

      awayTeamBadge: prediction.awayTeamBadge,

      leagueCode: prediction.leagueCode,

      league: prediction.league,

      matchDate: prediction.matchDate,

      kickoffTimestamp: prediction.kickoffTimestamp,

      status: prediction.status,

      accessType: prediction.accessType,

      price: prediction.price,

      confidence: prediction.confidence,
    };

    if (access.allowed) {
      return {
        ...base,

        access: {
          allowed: true,

          state: access.state,

          purchased: access.purchased,

          plan: userPlan,

          message: null,
        },

        data: {
          prediction: prediction.prediction,

          probabilities: prediction.probabilities,

          markets: prediction.markets,
        },
      };
    }

    return {
      ...base,

      access: {
        allowed: false,

        state: access.state,

        purchased: access.purchased,

        plan: userPlan,

        message: access.message,
      },

      actions: this.getActions(userPlan, prediction),

      data: null,
    };
  }

  async getUserPredictionById(user: User | null, id: string) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    return this.formatPrediction(user, prediction);
  }

  private getActions(userPlan: PlanType, prediction: PredictionDocument) {
    const actions: string[] = [];

    if (prediction.price > 0) {
      actions.push('buy_prediction');
    }

    const userLevel = PlanLevels[userPlan];

    const predictionLevel = PlanLevels[prediction.accessType];

    if (userLevel < predictionLevel) {
      actions.push(`upgrade_${prediction.accessType}`);
    }

    return actions;
  }

  async getLeagues() {
    return this.predictionModel.distinct('leagueCode', {
      deleted: false,
    });
  }

  private normalizePlan(value: unknown): PlanType {
    if (
      value === 'free' ||
      value === 'regular' ||
      value === 'vip' ||
      value === 'premium'
    ) {
      return value;
    }

    return 'free';
  }
}
