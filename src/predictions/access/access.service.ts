import { Injectable } from '@nestjs/common';

import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

import { PredictionPurchasesService } from '../../prediction-purchases/prediction-purchases.service';

import { PlanLevels } from '../constants/plan-levels';

import { PredictionAccessRules } from '../constants/access-rules';

import { PredictionMarkets } from '../constants/prediction-markets';

@Injectable()
export class AccessService {
  constructor(
    private readonly subscriptionService: SubscriptionsService,

    private readonly purchaseService: PredictionPurchasesService,
  ) {}

  private getHoursLeft(kickoffTimestamp: number) {
    return (kickoffTimestamp - Date.now()) / (1000 * 60 * 60);
  }

  async canAccessPrediction(user: any, prediction: any) {
    if (!user) {
      return {
        allowed: false,
        state: 'login_required',
      };
    }

    // ==========================
    // 1. CHECK ONE TIME PURCHASE
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

        showProbabilities: true,

        allowedMarkets: Object.values(PredictionMarkets),
      };
    }

    // ==========================
    // 2. CHECK SUBSCRIPTION
    // ==========================

    const plan = await this.subscriptionService.getUserPlan(
      user._id.toString(),
    );

    const userLevel = PlanLevels[plan];

    const predictionLevel = PlanLevels[prediction.accessType];

    if (userLevel < predictionLevel) {
      return {
        allowed: false,

        state: 'upgrade_required',

        message: `${prediction.accessType} subscription required`,
      };
    }

    // ==========================
    // 3. CHECK RELEASE TIME
    // ==========================

    const rule = PredictionAccessRules[prediction.accessType];

    const hoursLeft = this.getHoursLeft(prediction.kickoffTimestamp);

    if (hoursLeft > rule.releaseHoursBeforeKickoff) {
      return {
        allowed: false,

        state: 'locked',

        message: `Available ${rule.releaseHoursBeforeKickoff} hours before kickoff`,
      };
    }

    // ==========================
    // 4. RETURN ACCESS
    // ==========================

    return {
      allowed: true,

      state: 'subscription',

      purchased: false,

      showProbabilities: rule.showProbabilities,

      allowedMarkets: rule.allowedMarkets,
    };
  }
}
