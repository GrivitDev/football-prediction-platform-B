import { Injectable } from '@nestjs/common';

import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

import { PredictionPurchasesService } from '../../prediction-purchases/prediction-purchases.service';

import { PlanLevels, PlanType } from '../constants/plan-levels';

interface User {
  _id: {
    toString(): string;
  };
}

interface Prediction {
  accessType: PlanType;

  _id: {
    toString(): string;
  };
}

@Injectable()
export class AccessService {
  constructor(
    private readonly subscriptionService: SubscriptionsService,

    private readonly purchaseService: PredictionPurchasesService,
  ) {}

  async canAccessPrediction(user: User | null, prediction: Prediction) {
    if (!user) {
      return {
        allowed: false,

        state: 'login_required',

        purchased: false,

        message: 'Login required',
      };
    }

    const purchased = await this.purchaseService.hasPurchased(
      user._id.toString(),
      prediction._id.toString(),
    );

    if (purchased) {
      return {
        allowed: true,

        state: 'purchased',

        purchased: true,

        message: null,
      };
    }

    const rawPlan = await this.subscriptionService.getUserPlan(
      user._id.toString(),
    );

    const userPlan = this.normalizePlan(rawPlan);

    const userLevel = PlanLevels[userPlan];

    const predictionLevel = PlanLevels[prediction.accessType];

    if (userLevel < predictionLevel) {
      return {
        allowed: false,

        state: 'upgrade_required',

        purchased: false,

        message: `${prediction.accessType} subscription required`,
      };
    }

    return {
      allowed: true,

      state: 'subscription',

      purchased: false,

      message: null,
    };
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
