import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  // =========================
  // OPTIONAL CLEANUP JOB
  // =========================
  @Cron('0 3 * * 0') // Sunday 3AM
  async cleanupDatabase(): Promise<void> {
    this.logger.log('Running weekly cleanup...');

    // future tasks:
    // - remove soft-deleted predictions older than X days
    // - archive settled predictions
    // - clean failed purchases

    this.logger.log('Cleanup completed');
  }
}
