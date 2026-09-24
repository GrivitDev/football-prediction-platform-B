import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { EspnService } from '../providers/espn.service';
import { EspnActiveCompetitionService } from '../services/espn-active-competition.service';
import { EspnQueueBuilderService } from '../services/espn-queue-builder.service';
import { SportsCollectionService } from '../services/sports-collection.service';
import { SportsSyncStateService } from '../services/sports-sync-state.service';
import { EspnQueueService } from '../services/espn-queue.service';

@Injectable()
export class NewsScheduler {
  private readonly logger = new Logger(NewsScheduler.name);

  private readonly timeZone = 'Africa/Lagos';

  private readonly liveCronExpression = '*/5 * * * * *';

  private readonly morningCronExpression = '0 8 * * *';

  private readonly afternoonCronExpression = '0 15 * * *';

  private readonly eveningCronExpression = '0 20 * * *';

  private readonly nightCronExpression = '25 23 * * *';

  private readonly monthlyCronExpression = '0 2 1 * *';

  private readonly dailyLeagueRefreshCronExpression = '5 0 * * *';

  private running = false;

  private catalogueRefreshRunning = false;

  private liveMatchesRunning = false;

  private dailyLeagueRefreshRunning = false;

  constructor(
    private readonly espnService: EspnService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly espnQueueService: EspnQueueService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly sportsSyncStateService: SportsSyncStateService,
  ) {}

  // ============================================================
  // LIVE MATCHES
  // ============================================================

  @Cron('*/5 * * * * *', {
    name: 'espn-live-matches',
    timeZone: 'Africa/Lagos',
  })
  async refreshLiveMatches(): Promise<void> {
    if (!this.espnQueueService.isNormalOperationsReady()) {
      return;
    }

    if (this.liveMatchesRunning) {
      return;
    }

    this.liveMatchesRunning = true;

    const taskKey = 'espn-live-matches';

    const nextRunAt = this.nextEveryFiveSeconds();

    try {
      await this.startCronTracking({
        taskKey,

        cronExpression: this.liveCronExpression,

        nextRunAt,
      });

      const response = await this.espnService.getLiveMatches();

      const result =
        await this.sportsCollectionService.collectEspnLiveMatches(response);

      await this.sportsSyncStateService.markCronSuccess({
        taskKey,

        nextRunAt,
      });

      this.logger.debug(
        `ESPN live scoreboard refreshed: ` +
          `received=${result.received}, ` +
          `updated=${result.updated}, ` +
          `cleared=${result.cleared}`,
      );
    } catch (error) {
      try {
        await this.sportsSyncStateService.markCronFailure({
          taskKey,

          error: error instanceof Error ? error.message : String(error),

          nextRunAt,
        });
      } catch (trackingError) {
        this.logger.error(
          `Unable to persist ESPN live cron failure state: ${
            trackingError instanceof Error
              ? trackingError.message
              : String(trackingError)
          }`,
        );
      }

      this.logger.error(
        'ESPN live scoreboard refresh failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.liveMatchesRunning = false;
    }
  }

  // ============================================================
  // MORNING NEWS
  // ============================================================

  @Cron('0 8 * * *', {
    name: 'espn-news-morning',
    timeZone: 'Africa/Lagos',
  })
  async collectMorningNews(): Promise<void> {
    await this.collectNews({
      period: 'morning',

      taskKey: 'espn-news-morning',

      cronExpression: this.morningCronExpression,

      nextRunAt: this.nextDailyAt(8, 0),
    });
  }

  // ============================================================
  // AFTERNOON NEWS
  // ============================================================

  @Cron('0 15 * * *', {
    name: 'espn-news-afternoon',
    timeZone: 'Africa/Lagos',
  })
  async collectAfternoonNews(): Promise<void> {
    await this.collectNews({
      period: 'afternoon',

      taskKey: 'espn-news-afternoon',

      cronExpression: this.afternoonCronExpression,

      nextRunAt: this.nextDailyAt(15, 0),
    });
  }

  // ============================================================
  // EVENING NEWS
  // ============================================================

  @Cron('0 20 * * *', {
    name: 'espn-news-evening',
    timeZone: 'Africa/Lagos',
  })
  async collectEveningNews(): Promise<void> {
    await this.collectNews({
      period: 'evening',

      taskKey: 'espn-news-evening',

      cronExpression: this.eveningCronExpression,

      nextRunAt: this.nextDailyAt(20, 0),
    });
  }

  // ============================================================
  // NIGHT NEWS
  // ============================================================

  @Cron('25 23 * * *', {
    name: 'espn-news-night',
    timeZone: 'Africa/Lagos',
  })
  async collectNightNews(): Promise<void> {
    await this.collectNews({
      period: 'night',

      taskKey: 'espn-news-night',

      cronExpression: this.nightCronExpression,

      nextRunAt: this.nextDailyAt(23, 25),
    });
  }

  // ============================================================
  // DAILY LEAGUE REFRESH QUEUE
  // ============================================================

  @Cron('5 0 * * *', {
    name: 'espn-daily-league-refresh-queue',

    timeZone: 'Africa/Lagos',
  })
  async queueDailyLeagueRefreshes(): Promise<void> {
    if (!this.espnQueueService.isNormalOperationsReady()) {
      return;
    }

    if (!this.espnQueueService.isNormalOperationsReady()) {
      return;
    }

    if (this.dailyLeagueRefreshRunning) {
      this.logger.warn(
        'Skipping daily ESPN league-refresh queue seed because another run is already active',
      );

      return;
    }

    this.dailyLeagueRefreshRunning = true;

    const taskKey = 'espn-daily-league-refresh-queue';

    const nextRunAt = this.nextDailyAt(0, 5);

    try {
      await this.startCronTracking({
        taskKey,

        cronExpression: this.dailyLeagueRefreshCronExpression,

        nextRunAt,
      });

      const result =
        await this.espnQueueBuilderService.buildDailyLeagueRefreshQueue();

      await this.sportsSyncStateService.markCronSuccess({
        taskKey,

        nextRunAt,
      });

      this.logger.log(
        `Daily ESPN league-refresh queue seed completed: ` +
          `active=${result.active}, ` +
          `queued=${result.queued}, ` +
          `skipped=${result.skipped}`,
      );
    } catch (error) {
      try {
        await this.sportsSyncStateService.markCronFailure({
          taskKey,

          error: error instanceof Error ? error.message : String(error),

          nextRunAt,
        });
      } catch {
        // Preserve the original scheduler error.
      }

      this.logger.error(
        'Daily ESPN league-refresh queue seed failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.dailyLeagueRefreshRunning = false;
    }
  }

  // ============================================================
  // MONTHLY CATALOGUE REFRESH
  // ============================================================

  @Cron('0 2 1 * *', {
    name: 'espn-monthly-catalogue-refresh',

    timeZone: 'Africa/Lagos',
  })
  async refreshEspnCatalogue(): Promise<void> {
    if (!this.espnQueueService.isNormalOperationsReady()) {
      return;
    }

    if (this.catalogueRefreshRunning) {
      this.logger.warn(
        'Skipping monthly ESPN catalogue refresh because another catalogue refresh is already running',
      );

      return;
    }

    this.catalogueRefreshRunning = true;

    const taskKey = 'espn-monthly-catalogue-refresh';

    const nextRunAt = this.nextMonthlyAt(2, 0);

    try {
      await this.startCronTracking({
        taskKey,

        cronExpression: this.monthlyCronExpression,

        nextRunAt,
      });

      this.logger.log('Starting monthly ESPN league catalogue refresh');

      const leagues =
        await this.espnActiveCompetitionService.synchronizeLeagueCatalogue();

      this.logger.log(
        `Monthly ESPN league catalogue synchronized: ${leagues.length} leagues`,
      );

      const result =
        await this.espnActiveCompetitionService.synchronizeLeagueDetails();

      await this.sportsSyncStateService.markCronSuccess({
        taskKey,

        nextRunAt,
      });

      this.logger.log(
        `Monthly ESPN league season refresh completed: ` +
          `processed=${result.processed}, ` +
          `synchronized=${result.synchronized}, ` +
          `skipped=${result.skipped}, ` +
          `failed=${result.failed}`,
      );
    } catch (error) {
      try {
        await this.sportsSyncStateService.markCronFailure({
          taskKey,

          error: error instanceof Error ? error.message : String(error),

          nextRunAt,
        });
      } catch {
        // Preserve the original scheduler error.
      }

      this.logger.error(
        'Monthly ESPN league catalogue refresh failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.catalogueRefreshRunning = false;
    }
  }

  // ============================================================
  // NEWS
  // ============================================================

  private async collectNews(params: {
    period: 'morning' | 'afternoon' | 'evening' | 'night';

    taskKey: string;

    cronExpression: string;

    nextRunAt: Date;
  }): Promise<void> {
    if (!this.espnQueueService.isNormalOperationsReady()) {
      return;
    }

    if (this.running) {
      this.logger.warn(
        `Skipping ${params.period} ESPN news collection because another news collection is already running`,
      );

      return;
    }

    this.running = true;

    try {
      await this.startCronTracking({
        taskKey: params.taskKey,

        cronExpression: params.cronExpression,

        nextRunAt: params.nextRunAt,
      });

      const response = await this.espnService.getNews();

      const result =
        await this.sportsCollectionService.collectEspnNews(response);

      await this.sportsSyncStateService.markCronSuccess({
        taskKey: params.taskKey,

        nextRunAt: params.nextRunAt,
      });

      this.logger.log(
        `ESPN ${params.period} news collection completed: ` +
          `received=${result.received}, ` +
          `created=${result.created}, ` +
          `updated=${result.updated}, ` +
          `skipped=${result.skipped}`,
      );
    } catch (error) {
      try {
        await this.sportsSyncStateService.markCronFailure({
          taskKey: params.taskKey,

          error: error instanceof Error ? error.message : String(error),

          nextRunAt: params.nextRunAt,
        });
      } catch {
        // Preserve the original scheduler error.
      }

      this.logger.error(
        `ESPN ${params.period} news collection failed`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
  // ============================================================
  // CRON STATE
  // ============================================================

  private async startCronTracking(params: {
    taskKey: string;

    cronExpression: string;

    nextRunAt: Date;
  }): Promise<void> {
    await this.sportsSyncStateService.ensureCronState({
      taskKey: params.taskKey,

      cronExpression: params.cronExpression,

      timeZone: this.timeZone,

      nextRunAt: params.nextRunAt,
    });

    await this.sportsSyncStateService.markCronStarted(params.taskKey);
  }

  // ============================================================
  // NEXT RUN
  // ============================================================

  private nextEveryFiveSeconds(from = new Date()): Date {
    return new Date(from.getTime() + 5 * 1000);
  }

  private nextDailyAt(hour: number, minute: number): Date {
    const now = new Date();

    const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);

    const candidateLagosUtc = Date.UTC(
      lagosNow.getUTCFullYear(),
      lagosNow.getUTCMonth(),
      lagosNow.getUTCDate(),
      hour,
      minute,
      0,
    );

    let candidate = new Date(candidateLagosUtc - 60 * 60 * 1000);

    if (candidate.getTime() <= now.getTime()) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    }

    return candidate;
  }

  private nextMonthlyAt(hour: number, minute: number): Date {
    const now = new Date();

    const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);

    let year = lagosNow.getUTCFullYear();

    let month = lagosNow.getUTCMonth();

    let candidate = new Date(
      Date.UTC(year, month, 1, hour, minute, 0) - 60 * 60 * 1000,
    );

    if (candidate.getTime() <= now.getTime()) {
      month += 1;

      if (month > 11) {
        month = 0;

        year += 1;
      }

      candidate = new Date(
        Date.UTC(year, month, 1, hour, minute, 0) - 60 * 60 * 1000,
      );
    }

    return candidate;
  }
}
