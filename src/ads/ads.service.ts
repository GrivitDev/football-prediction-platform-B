import { Injectable } from '@nestjs/common';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class AdsService {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async getPolicy(userId?: string) {
    // Guest users behave like Free users
    if (!userId) {
      return {
        plan: 'free',
        showAds: true,
        showPopupAds: true,
        adInterval: 0, // Let the provider control frequency
      };
    }

    const plan = await this.subscriptionsService.getUserPlan(userId);

    switch (plan) {
      case 'vip':
        return {
          plan,
          showAds: false,
          showPopupAds: false,
          adInterval: 0,
        };

      case 'regular':
        return {
          plan,
          showAds: true,
          showPopupAds: false,
          adInterval: 15, // minutes
        };

      default:
        return {
          plan: 'free',
          showAds: true,
          showPopupAds: true,
          adInterval: 0,
        };
    }
  }
}
