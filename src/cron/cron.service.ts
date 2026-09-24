import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { PaymentsService } from '../payments/payments.service';

import { SystemMonitorService } from '../system-monitor/system-monitor.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  private static readonly paymentCleanupCronExpression = '*/5 * * * *';

  private static readonly databaseCleanupCronExpression = '0 3 * * 0';

  constructor(
    private readonly paymentsService: PaymentsService,

    private readonly systemMonitorService: SystemMonitorService,
  ) {}

  // =====================================
  // CLEANUP EXPIRED GATEWAY PAYMENTS
  // =====================================
  // Runs every 5 minutes.
  //
  // Deletes Paystack and OPay payments
  // that have remained pending for more
  // than 30 minutes.
  // =====================================

  @Cron(CronService.paymentCleanupCronExpression, {
    name: 'payments-cleanup-expired-gateway-payments',
  })
  async cleanupExpiredGatewayPayments(): Promise<void> {
    try {
      await this.systemMonitorService.trackCron(
        {
          key: 'payments-cleanup-expired-gateway-payments',

          module: 'payments',

          name: 'Cleanup Expired Gateway Payments',

          expression: CronService.paymentCleanupCronExpression,
        },

        async () => {
          this.logger.log('Checking for expired pending gateway payments...');

          const deletedCount =
            await this.paymentsService.deleteExpiredPendingGatewayPayments();

          if (deletedCount > 0) {
            this.logger.log(
              `Deleted ${deletedCount} expired pending gateway payment(s).`,
            );
          }
        },
      );
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

  @Cron(CronService.databaseCleanupCronExpression, {
    name: 'database-weekly-cleanup',
  })
  async cleanupDatabase(): Promise<void> {
    try {
      await this.systemMonitorService.trackCron(
        {
          key: 'database-weekly-cleanup',

          module: 'system',

          name: 'Weekly Database Cleanup',

          expression: CronService.databaseCleanupCronExpression,
        },

        () => {
          this.logger.log('Running weekly database cleanup...');

          // Future weekly cleanup tasks.
        },
      );
    } catch (error) {
      this.logger.error(
        'Weekly database cleanup failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
