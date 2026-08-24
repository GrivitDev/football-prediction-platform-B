import { Injectable } from '@nestjs/common';

import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { PredictionPurchasesService } from '../../prediction-purchases/prediction-purchases.service';

import { PlanLevels } from '../constants/plan-levels';
import { PredictionAccessRules } from '../constants/access-rules';

interface User {
  _id: {
    toString(): string;
  };
}

interface Prediction {
  accessType: 'free' | 'regular' | 'vip';

  kickoffTimestamp: number;

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

  private getHoursLeft(kickoffTimestamp: number) {
    return (kickoffTimestamp - Date.now()) / (1000 * 60 * 60);
  }

  private getReleaseData(
    kickoffTimestamp: number,

    releaseHoursBeforeKickoff: number,
  ) {
    const releaseAt =
      kickoffTimestamp - releaseHoursBeforeKickoff * 60 * 60 * 1000;

    return {
      releaseAt,

      released: Date.now() >= releaseAt,
    };
  }

  async canAccessPrediction(
    user: User | null,

    prediction: Prediction,
  ) {
    let userPlan: 'free' | 'regular' | 'vip' = 'free';

    if (user) {
      userPlan = await this.subscriptionService.getUserPlan(
        user._id.toString(),
      );
    }

    const rule = PredictionAccessRules[userPlan];

    const release = this.getReleaseData(
      prediction.kickoffTimestamp,

      rule.releaseHoursBeforeKickoff,
    );

    const hoursLeft = this.getHoursLeft(prediction.kickoffTimestamp);

    // ==========================
    // LOGIN REQUIRED
    // ==========================

    if (!user) {
      return {
        allowed: false,

        state: 'login_required',

        purchased: false,

        ...release,

        showProbabilities: false,

        allowedMarkets: [],

        message: 'Login required',
      };
    }

    // ==========================
    // ONE TIME PURCHASE
    // ==========================

    const purchased = await this.purchaseService.hasPurchased(
      user._id.toString(),

      prediction._id.toString(),
    );

    if (purchased) {
      return {
        allowed: true,

        state: 'purchased',

        purchased: true,

        ...release,

        showProbabilities: true,

        allowedMarkets: null,
      };
    }

    // ==========================
    // SUBSCRIPTION LEVEL CHECK
    // ==========================

    const userLevel = PlanLevels[userPlan] ?? 0;

    const predictionLevel = PlanLevels[prediction.accessType] ?? 0;

    if (userLevel < predictionLevel) {
      return {
        allowed: false,

        state: 'upgrade_required',

        purchased: false,

        ...release,

        showProbabilities: false,

        allowedMarkets: [],

        message: `${prediction.accessType} subscription required`,
      };
    }

    // ==========================
    // RELEASE WINDOW CHECK
    // ==========================

    if (hoursLeft > rule.releaseHoursBeforeKickoff) {
      return {
        allowed: false,

        state: 'locked',

        purchased: false,

        ...release,

        showProbabilities: false,

        allowedMarkets: [],

        message: `Available ${rule.releaseHoursBeforeKickoff} hours before kickoff`,
      };
    }

    // ==========================
    // FULL ACCESS
    // ==========================

    return {
      allowed: true,

      state: 'subscription',

      purchased: false,

      ...release,

      showProbabilities: rule.showProbabilities,

      allowedMarkets: rule.allowedMarkets,
    };
  }
}
