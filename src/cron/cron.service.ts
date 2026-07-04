import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // =========================
  // EXPIRE SUBSCRIPTIONS
  // =========================
  @Cron('0 0 * * *') // every midnight
  async handleExpiredSubscriptions() {
    this.logger.log('Checking expired subscriptions...');

    try {
      const expired = await this.subscriptionsService.getExpiredSubscriptions();

      if (!expired.length) {
        this.logger.log('No expired subscriptions found');
        return;
      }

      for (const sub of expired) {
        await this.subscriptionsService.deactivateSubscription(
          sub._id.toString(),
        );

        this.logger.log(
          `Subscription expired: user=${sub._id}, plan=${sub.plan}`,
        );
      }

      this.logger.log(`Expired subscriptions processed: ${expired.length}`);
    } catch (err) {
      this.logger.error('Subscription expiry job failed', err);
    }
  }

  // =========================
  // OPTIONAL CLEANUP JOB
  // =========================
  @Cron('0 3 * * 0') // Sunday 3AM
  async cleanupDatabase() {
    this.logger.log('Running weekly cleanup...');

    // future tasks:
    // - remove soft-deleted predictions older than X days
    // - archive settled predictions
    // - clean failed purchases

    this.logger.log('Cleanup completed');
  }
}
