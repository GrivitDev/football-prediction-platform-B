import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from './schemas/prediction.schema';

import { AccessService } from './access/access.service';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

interface User {
  _id: string;
}

interface AccessResult {
  allowed: boolean;
  state: string;
  released: boolean;
  releaseAt: number;
  purchased: boolean;
  message?: string | null;
  showProbabilities: boolean;
  allowedMarkets: readonly string[] | null;
}

@Injectable()
export class PredictionUserService {
  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly accessService: AccessService,

    private readonly subscriptionService: SubscriptionsService,
  ) {}

  // =====================================
  // GET ALL USER PREDICTIONS
  // =====================================

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

  // =====================================
  // FORMAT RESPONSE
  // =====================================

  private async formatPrediction(
    user: User | null,
    prediction: PredictionDocument,
  ) {
    const access: AccessResult = await this.accessService.canAccessPrediction(
      user,
      prediction,
    );

    const userPlan = user
      ? await this.subscriptionService.getUserPlan(user._id.toString())
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

    // =====================================
    // FULL ACCESS
    // =====================================

    if (access.allowed) {
      return {
        ...base,

        access: {
          allowed: true,

          state: access.state,

          purchased: access.purchased ?? false,

          plan: userPlan,

          released: access.released,

          releaseAt: access.releaseAt,

          message: null,
        },

        data: {
          prediction: prediction.prediction,
          probabilities: access.showProbabilities
            ? prediction.probabilities
            : null,

          markets: this.filterMarkets(
            prediction.markets,
            access.allowedMarkets,
          ),
        },
      };
    }

    // =====================================
    // LOCKED
    // =====================================

    return {
      ...base,

      access: {
        allowed: false,

        state: access.state,

        purchased: access.purchased ?? false,

        plan: userPlan,

        released: access.released,

        releaseAt: access.releaseAt,

        message: access.message,
      },

      actions: this.getActions(userPlan, prediction),

      data: null,
    };
  }

  // =====================================
  // FILTER MARKETS
  // =====================================

  private filterMarkets(
    markets: Array<{ market: string; [key: string]: unknown }>,

    allowedMarkets: readonly string[] | null,
  ): Array<{ market: string; [key: string]: unknown }> {
    // VIP
    // No filtering
    if (allowedMarkets === null) {
      return markets;
    }

    // FREE
    if (!allowedMarkets.length) {
      return [];
    }

    // REGULAR
    return markets.filter((market) => allowedMarkets.includes(market.market));
  }

  // =====================================
  // SINGLE PREDICTION
  // =====================================

  async getUserPredictionById(user: User | null, id: string) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    return this.formatPrediction(user, prediction);
  }

  // =====================================
  // ACTIONS FOR FRONTEND
  // =====================================

  private getActions(userPlan: string, prediction: PredictionDocument) {
    const actions: string[] = [];

    if (prediction.price > 0) {
      actions.push('buy_prediction');
    }

    if (prediction.accessType === 'vip' && userPlan !== 'vip') {
      actions.push('upgrade_vip');
    }

    if (userPlan === 'free' && prediction.accessType === 'regular') {
      actions.push('subscribe_regular');
    }

    if (userPlan === 'free' && prediction.accessType === 'vip') {
      actions.push('subscribe_vip');
    }

    if (prediction.accessType === 'free') {
      actions.push('wait_for_release');
    }

    return actions;
  }

  // =====================================
  // AVAILABLE LEAGUES
  // =====================================

  async getLeagues() {
    return this.predictionModel.distinct('leagueCode', {
      deleted: false,
    });
  }
}
