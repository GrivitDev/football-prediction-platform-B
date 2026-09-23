import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { EspnService } from '../providers/espn.service';
import { EspnActiveCompetitionService } from '../services/espn-active-competition.service';
import { SportsCollectionService } from '../services/sports-collection.service';

@Injectable()
export class NewsScheduler {
  private readonly logger = new Logger(NewsScheduler.name);

  private running = false;
  private catalogueRefreshRunning = false;
  private liveMatchesRunning = false;

  constructor(
    private readonly espnService: EspnService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly sportsCollectionService: SportsCollectionService,
  ) {}

  // ============================================================
  // LIVE MATCHES
  // ============================================================

  /**
   * Refresh the live ESPN scoreboard every five seconds.
   *
   * This is ONLY for keeping live matches current in MongoDB.
   *
   * It does not create queue jobs and does not call:
   *
   * - summary
   * - standings
   * - odds
   * - YouTube
   */
  @Cron('*/5 * * * * *', {
    name: 'espn-live-matches',
    timeZone: 'Africa/Lagos',
  })
  async refreshLiveMatches(): Promise<void> {
    if (this.liveMatchesRunning) {
      return;
    }

    this.liveMatchesRunning = true;

    try {
      const response = await this.espnService.getLiveMatches();

      const result =
        await this.sportsCollectionService.collectEspnLiveMatches(response);

      this.logger.debug(
        `ESPN live scoreboard refreshed: ` +
          `received=${result.received}, ` +
          `updated=${result.updated}, ` +
          `cleared=${result.cleared}`,
      );
    } catch (error) {
      this.logger.error(
        'ESPN live scoreboard refresh failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.liveMatchesRunning = false;
    }
  }

  // ============================================================
  // MORNING NEWS — 08:00
  // ============================================================

  @Cron('0 8 * * *', {
    name: 'espn-news-morning',
    timeZone: 'Africa/Lagos',
  })
  async collectMorningNews(): Promise<void> {
    await this.collectNews('morning');
  }

  // ============================================================
  // AFTERNOON NEWS — 15:00
  // ============================================================

  @Cron('0 15 * * *', {
    name: 'espn-news-afternoon',
    timeZone: 'Africa/Lagos',
  })
  async collectAfternoonNews(): Promise<void> {
    await this.collectNews('afternoon');
  }

  // ============================================================
  // EVENING NEWS — 20:00
  // ============================================================

  @Cron('0 20 * * *', {
    name: 'espn-news-evening',
    timeZone: 'Africa/Lagos',
  })
  async collectEveningNews(): Promise<void> {
    await this.collectNews('evening');
  }

  // ============================================================
  // NIGHT NEWS — 23:25
  // ============================================================

  @Cron('25 23 * * *', {
    name: 'espn-news-night',
    timeZone: 'Africa/Lagos',
  })
  async collectNightNews(): Promise<void> {
    await this.collectNews('night');
  }

  // ============================================================
  // MONTHLY ESPN CATALOGUE REFRESH
  // ============================================================

  @Cron('0 2 1 * *', {
    name: 'espn-monthly-catalogue-refresh',
    timeZone: 'Africa/Lagos',
  })
  async refreshEspnCatalogue(): Promise<void> {
    if (this.catalogueRefreshRunning) {
      this.logger.warn(
        'Skipping monthly ESPN catalogue refresh because another catalogue refresh is already running',
      );

      return;
    }

    this.catalogueRefreshRunning = true;

    try {
      this.logger.log('Starting monthly ESPN league catalogue refresh');

      // ========================================================
      // STEP 1 — COMPLETE ESPN CATALOGUE
      // ========================================================

      const leagues =
        await this.espnActiveCompetitionService.synchronizeLeagueCatalogue();

      this.logger.log(
        `Monthly ESPN league catalogue synchronized: ${leagues.length} leagues`,
      );

      // ========================================================
      // STEP 2 — LEAGUE DETAILS + ACTIVE SEASONS
      // ========================================================

      const result =
        await this.espnActiveCompetitionService.synchronizeLeagueDetails();

      this.logger.log(
        `Monthly ESPN league season refresh completed: ` +
          `processed=${result.processed}, ` +
          `synchronized=${result.synchronized}, ` +
          `skipped=${result.skipped}, ` +
          `failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error(
        'Monthly ESPN league catalogue refresh failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.catalogueRefreshRunning = false;
    }
  }

  // ============================================================
  // COLLECT NEWS
  // ============================================================

  private async collectNews(
    period: 'morning' | 'afternoon' | 'evening' | 'night',
  ): Promise<void> {
    if (this.running) {
      this.logger.warn(
        `Skipping ${period} ESPN news collection because another news collection is already running`,
      );

      return;
    }

    this.running = true;

    try {
      const response = await this.espnService.getNews();

      const result =
        await this.sportsCollectionService.collectEspnNews(response);

      this.logger.log(
        `ESPN ${period} news collection completed: ` +
          `received=${result.received}, ` +
          `created=${result.created}, ` +
          `updated=${result.updated}, ` +
          `skipped=${result.skipped}`,
      );
    } catch (error) {
      this.logger.error(
        `ESPN ${period} news collection failed`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
