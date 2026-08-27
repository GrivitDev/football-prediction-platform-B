import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { SettlementService } from '../predictions/settlement/settlement.service';

@Injectable()
export class SettlementCronService {
  private readonly logger = new Logger(SettlementCronService.name);

  constructor(private readonly settlementService: SettlementService) {}

  // ==========================================================
  // AUTOMATIC SETTLEMENT
  // ==========================================================
  //
  // Runs every hour.
  //
  // The service itself decides which predictions are eligible.
  //
  // ==========================================================

  @Cron('0 * * * *')
  async handleAutomaticSettlement() {
    this.logger.log('Running automatic prediction settlement...');

    try {
      const result = await this.settlementService.settlePendingPredictions();

      this.logger.log(`Settlement result: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(
        'Automatic prediction settlement failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
