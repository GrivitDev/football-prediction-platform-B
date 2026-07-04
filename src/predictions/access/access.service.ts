import { Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { PredictionPurchasesService } from '../../prediction-purchases/prediction-purchases.service';

@Injectable()
export class AccessService {
  constructor(
    private readonly subscriptionService: SubscriptionsService,
    private readonly purchaseService: PredictionPurchasesService,
  ) {}

  private getHoursLeft(matchDate: number) {
    return (matchDate - Date.now()) / (1000 * 60 * 60);
  }

  async canAccessPrediction(user: any, prediction: any) {
    const hoursLeft = this.getHoursLeft(prediction.kickoffTimestamp);

    // ======================
    // NO USER
    // ======================
    if (!user) {
      return {
        allowed: false,
        price: prediction.price,
        message: 'Login required',
      };
    }

    const plan = await this.subscriptionService.getUserPlan(user._id);

    const hasPurchased = await this.purchaseService.hasPurchased(
      user._id.toString(),
      prediction._id.toString(),
    );

    // ======================
    // FREE RULES
    // ======================
    if (prediction.accessType === 'free') {
      if (hoursLeft > 24) {
        return {
          allowed: false,
          price: prediction.price,
          message: 'Available within 24 hours before match',
        };
      }

      return {
        allowed: true,
        showProbabilities: false,
        showMarket: false,
      };
    }

    // ======================
    // REGULAR RULES
    // ======================
    if (prediction.accessType === 'regular') {
      const hasAccess =
        (plan === 'regular' || plan === 'vip' || hasPurchased) &&
        hoursLeft <= 24;

      if (!hasAccess) {
        return {
          allowed: false,
          price: prediction.price,
          message: 'Regular subscription or purchase required',
        };
      }

      return {
        allowed: true,
        showProbabilities: false,
        showMarket: false,
      };
    }

    // ======================
    // VIP RULES
    // ======================
    if (prediction.accessType === 'vip') {
      const hasAccess = (plan === 'vip' || hasPurchased) && hoursLeft <= 72;

      if (!hasAccess) {
        return {
          allowed: false,
          price: prediction.price,
          message: 'VIP subscription or purchase required',
        };
      }

      return {
        allowed: true,
        showProbabilities: true,
        showMarket: true,
      };
    }

    return {
      allowed: false,
      price: prediction.price,
      message: 'Access denied',
    };
  }
}
