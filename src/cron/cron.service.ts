import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // =====================================
  // CLEANUP EXPIRED GATEWAY PAYMENTS
  // =====================================
  // Runs every 5 minutes.
  //
  // Deletes Paystack and OPay payments
  // that have remained pending for more
  // than 30 minutes.
  // =====================================

  @Cron('*/5 * * * *')
  async cleanupExpiredGatewayPayments(): Promise<void> {
    this.logger.log('Checking for expired pending gateway payments...');

    try {
      const deletedCount =
        await this.paymentsService.deleteExpiredPendingGatewayPayments();

      if (deletedCount > 0) {
        this.logger.log(
          `Deleted ${deletedCount} expired pending gateway payment(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to clean up expired gateway payments.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // =====================================
  // OTHER DATABASE CLEANUP
  // =====================================
  @Cron('0 3 * * 0')
  async cleanupDatabase(): Promise<void> {
    this.logger.log('Running weekly database cleanup...');

    // Future weekly cleanup tasks
  }
}
