import { Injectable } from '@nestjs/common';

import { Cron, CronExpression } from '@nestjs/schedule';

import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionsScheduler {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, {
    timeZone: 'Africa/Lagos',
  })
  async checkSubscriptions() {
    // ==========================
    // EXPIRING IN 3 DAYS
    // ==========================

    const expiring = await this.subscriptionsService.getExpiringSubscriptions();

    for (const subscription of expiring) {
      await this.subscriptionsService.sendExpiringEmail(subscription);
    }

    // ==========================
    // EXPIRED
    // ==========================

    const expired = await this.subscriptionsService.getSubscriptionsExpired();

    for (const subscription of expired) {
      await this.subscriptionsService.sendExpiredEmail(subscription);
    }
  }
}
