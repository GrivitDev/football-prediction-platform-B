import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from './schemas/prediction.schema';

import { AccessService } from './access/access.service';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { PredictionPurchasesService } from '../prediction-purchases/prediction-purchases.service';

@Injectable()
export class PredictionUserService {
  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly accessService: AccessService,

    private readonly purchaseService: PredictionPurchasesService,

    private readonly subscriptionService: SubscriptionsService,
  ) {}

  // =====================================
  // GET ALL USER PREDICTIONS
  // =====================================

  async getUserPredictions(user: any, league?: string) {
    const query: any = {
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

  private async formatPrediction(user: any, prediction: PredictionDocument) {
    const access = await this.accessService.canAccessPrediction(
      user,
      prediction,
    );

    const userPlan = user
      ? await this.subscriptionService.getUserPlan(user._id.toString())
      : 'free';

    const purchased = user
      ? await this.purchaseService.hasPurchased(
          user._id.toString(),
          prediction._id.toString(),
        )
      : false;

    const base = {
      id: prediction._id,

      homeTeam: prediction.homeTeam,

      awayTeam: prediction.awayTeam,

      homeTeamBadge: prediction.homeTeamBadge,

      awayTeamBadge: prediction.awayTeamBadge,

      league: prediction.league,

      leagueCode: prediction.leagueCode,

      matchDate: prediction.matchDate,

      status: prediction.status,

      accessType: prediction.accessType,

      price: prediction.price,

      preview: {
        prediction: prediction.prediction,

        confidence: prediction.confidence,
      },
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

          purchased,

          plan: userPlan,

          message: null,
        },

        data: {
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

        purchased,

        plan: userPlan,

        message: access.message,
      },

      actions: this.getActions(userPlan, prediction),

      data: null,
    };
  }

  // =====================================
  // FILTER MARKETS
  // =====================================

  private filterMarkets(markets: any[], allowedMarkets: string[]) {
    if (!allowedMarkets?.length) {
      return [];
    }

    return markets.filter((market) => allowedMarkets.includes(market.market));
  }

  // =====================================
  // SINGLE PREDICTION
  // =====================================

  async getUserPredictionById(user: any, id: string) {
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
