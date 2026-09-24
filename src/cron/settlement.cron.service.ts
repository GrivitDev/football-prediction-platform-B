import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { SettlementService } from '../predictions/settlement/settlement.service';

import { SystemMonitorService } from '../system-monitor/system-monitor.service';

@Injectable()
export class SettlementCronService {
  private readonly logger = new Logger(SettlementCronService.name);

  private readonly cronKey = 'automatic-prediction-settlement';

  private static readonly cronExpression = '0 * * * *';

  constructor(
    private readonly settlementService: SettlementService,

    private readonly systemMonitorService: SystemMonitorService,
  ) {}

  // ==========================================================
  // AUTOMATIC SETTLEMENT
  // ==========================================================
  //
  // Runs every hour.
  //
  // The service itself decides which predictions are eligible.
  //
  // ==========================================================

  @Cron(SettlementCronService.cronExpression, {
    name: 'automatic-prediction-settlement',
  })
  async handleAutomaticSettlement(): Promise<void> {
    try {
      await this.systemMonitorService.trackCron(
        {
          key: this.cronKey,

          module: 'predictions',

          name: 'Automatic Prediction Settlement',

          expression: SettlementCronService.cronExpression,
        },

        async () => {
          this.logger.log('Running automatic prediction settlement...');

          const result =
            await this.settlementService.settlePendingPredictions();

          this.logger.log(`Settlement result: ${JSON.stringify(result)}`);
        },
      );
    } catch (error) {
      this.logger.error(
        'Automatic prediction settlement failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
