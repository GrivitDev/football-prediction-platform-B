import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from './schemas/prediction.schema';

import { AccessService } from './access/access.service';
import { PredictionPurchasesService } from '../prediction-purchases/prediction-purchases.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class PredictionUserService {
  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly accessService: AccessService,
    private readonly purchaseService: PredictionPurchasesService,
    private readonly subscriptionService: SubscriptionsService,
  ) {}

  // ==============================
  // GET USER PREDICTIONS (MAIN)
  // ==============================
  async getUserPredictions(user: any, league?: string) {
    const query: any = { deleted: false };

    if (league) query.leagueCode = league;

    const predictions = await this.predictionModel
      .find(query)
      .sort({ createdAt: -1 });

    return Promise.all(
      predictions.map(async (prediction) => {
        const access = await this.accessService.canAccessPrediction(
          user,
          prediction,
        );

        const base = {
          id: prediction._id,

          homeTeam: prediction.homeTeam,
          awayTeam: prediction.awayTeam,
          leagueCode: prediction.leagueCode,

          matchDate: prediction.matchDate,
          status: prediction.status,
          accessType: prediction.accessType,

          preview: {
            prediction: prediction.prediction,
            confidence: prediction.confidence,
          },
        };

        // ======================
        // FULL ACCESS
        // ======================
        if (access.allowed) {
          return {
            ...base,

            access: {
              allowed: true,
              state: 'full',
              price: prediction.price,
              message: null,
              showProbabilities: access.showProbabilities,
              showMarket: access.showMarket,
            },

            data: {
              probabilities: access.showProbabilities
                ? prediction.probabilities
                : null,

              markets: access.showMarket ? prediction.markets : [],
            },
          };
        }

        // ======================
        // LOCKED
        // ======================
        return {
          ...base,

          access: {
            allowed: false,
            state: 'locked',
            price: prediction.price,
            message: access.message,
          },

          data: {
            probabilities: null,
            markets: [],
          },
        };
      }),
    );
  }
  // ==============================
  // GET AVAILABLE LEAGUES
  // ==============================
  async getLeagues() {
    return this.predictionModel.distinct('leagueCode', {
      deleted: false,
    });
  }

  // ==============================
  // SINGLE PREDICTION (DETAIL VIEW)
  // ==============================
  async getUserPredictionById(user: any, id: string) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new Error('Prediction not found');
    }

    const access = await this.accessService.canAccessPrediction(
      user,
      prediction,
    );

    const purchased = user
      ? await this.purchaseService.hasPurchased(
          user._id.toString(),
          prediction._id.toString(),
        )
      : false;

    return {
      id: prediction._id,

      homeTeam: prediction.homeTeam,
      awayTeam: prediction.awayTeam,
      leagueCode: prediction.leagueCode,

      matchDate: prediction.matchDate,
      status: prediction.status,

      // ADD THESE
      accessType: prediction.accessType,
      price: prediction.price,

      preview: {
        prediction: prediction.prediction,
        confidence: prediction.confidence,
      },

      access: {
        allowed: access.allowed,
        state: access.allowed ? 'full' : 'locked',
        purchased: !!purchased,
        message: access.message,
      },

      data: access.allowed
        ? {
            probabilities: prediction.probabilities,
            markets: prediction.markets,
          }
        : null,
    };
  }

  // ==============================
  // ACTION LOGIC (UI BUTTONS)
  // ==============================
  private getActions(userPlan: string, accessType: string): string[] {
    const actions: string[] = [];

    if (userPlan === 'free') {
      actions.push('subscribe', 'buy');
    }

    if (userPlan === 'regular' && accessType === 'vip') {
      actions.push('upgrade', 'buy');
    }

    if (userPlan === 'regular' && accessType === 'regular') {
      actions.push('buy');
    }

    if (userPlan === 'vip') {
      actions.push('buy'); // optional fallback
    }

    return actions;
  }
}
