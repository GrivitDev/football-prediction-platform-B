import { Injectable } from '@nestjs/common';

import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { PredictionPurchasesService } from '../../prediction-purchases/prediction-purchases.service';

import { PlanLevels } from '../constants/plan-levels';
import { PredictionAccessRules } from '../constants/access-rules';
import { PredictionMarkets } from '../constants/prediction-markets';

interface User {
  _id: { toString(): string };
}

interface Prediction {
  accessType: string;
  kickoffTimestamp: number;
  _id: { toString(): string };
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

  async canAccessPrediction(user: User | null, prediction: Prediction) {
    const rule = PredictionAccessRules[prediction.accessType] as NonNullable<
      (typeof PredictionAccessRules)[keyof typeof PredictionAccessRules]
    >;

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

        ...release,

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

    const userLevel = PlanLevels[plan] ?? 0;

    const predictionLevel =
      PlanLevels[prediction.accessType as keyof typeof PlanLevels] ?? 0;

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
    // 3. CHECK RELEASE TIME
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
    // 4. RETURN ACCESS
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
