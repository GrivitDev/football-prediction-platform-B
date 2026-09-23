import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueService } from './espn-queue.service';
import { SportsCollectionService } from './sports-collection.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { EspnService } from '../providers/espn.service';

import { SportsDerivedDataBootstrapService } from './sports-derived-data-bootstrap.service';

import { CompetitionPriority } from '../enums/competition-priority.enum';

@Injectable()
export class SportsStartupService implements OnModuleInit {
  private readonly logger = new Logger(SportsStartupService.name);

  private readonly threeHourWindowMs = 3 * 60 * 60 * 1000;

  constructor(
    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnService: EspnService,

    private readonly sportsDerivedDataBootstrapService: SportsDerivedDataBootstrapService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  /**
   * Do not block NestJS bootstrap.
   */
  onModuleInit(): void {
    this.logger.log('Starting ESPN background initialization');

    setTimeout(() => {
      void this.initializeEspn();
    }, 0);
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  private async initializeEspn(): Promise<void> {
    let catalogueEmpty = false;

    // ==========================================================
    // STEP 1 — ESPN LEAGUE CATALOGUE
    // ==========================================================

    try {
      catalogueEmpty =
        await this.espnActiveCompetitionService.isLeagueCatalogueEmpty();
    } catch (error) {
      this.logger.error(
        'Unable to check ESPN league catalogue state',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    /*
     * The catalogue is only downloaded when it does not exist.
     *
     * IMPORTANT:
     *
     * A populated catalogue does NOT mean startup is complete.
     *
     * Every subsequent startup must continue through:
     *
     * catalogue
     *   -> league details
     *   -> active competitions
     *   -> fixtures
     *   -> standings
     *   -> derived data
     *   -> queue
     *
     * This allows startup to recover collections that were only
     * partially populated during a previous process lifetime.
     */
    if (catalogueEmpty) {
      this.logger.log(
        'ESPN league catalogue is empty. Starting complete catalogue bootstrap.',
      );

      try {
        const leagues =
          await this.espnActiveCompetitionService.synchronizeLeagueCatalogue();

        this.logger.log(
          `ESPN league catalogue synchronized: ${leagues.length} leagues`,
        );
      } catch (error) {
        this.logger.error(
          'ESPN league catalogue synchronization failed',
          error instanceof Error ? error.stack : String(error),
        );

        return;
      }
    } else {
      this.logger.log(
        'ESPN league catalogue already exists. Continuing startup recovery.',
      );
    }

    // ==========================================================
    // STEP 2 — LEAGUE DETAILS + ACTIVE SEASONS
    // ==========================================================

    let detailResult: {
      processed: number;
      synchronized: number;
      active: number;
      inactive: number;
      skipped: number;
      failed: number;
    };

    try {
      /*
       * This must run even when the catalogue already existed.
       *
       * It ensures ActiveCompetition reflects the current active
       * season instead of assuming the previous startup completed
       * successfully.
       */
      detailResult =
        await this.espnActiveCompetitionService.synchronizeLeagueDetails();

      this.logger.log(
        `ESPN league season discovery completed: ` +
          `processed=${detailResult.processed}, ` +
          `synchronized=${detailResult.synchronized}, ` +
          `active=${detailResult.active}, ` +
          `inactive=${detailResult.inactive}, ` +
          `skipped=${detailResult.skipped}, ` +
          `failed=${detailResult.failed}`,
      );
    } catch (error) {
      this.logger.error(
        'ESPN league detail synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    // ==========================================================
    // STEP 3 — ACTIVE LEAGUE SOURCE-DATA RECOVERY
    // ==========================================================

    let activeLeagues: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >;

    try {
      activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Starting ESPN active-league source-data recovery for ` +
          `${activeLeagues.length} active leagues`,
      );
    } catch (error) {
      this.logger.error(
        'Unable to load active ESPN leagues for startup recovery',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    let leaguesProcessed = 0;
    let leaguesSynchronized = 0;
    let leaguesFailed = 0;
    let fixturesCollected = 0;
    let standingsCollected = 0;

    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      if (typeof league.season !== 'number') {
        leaguesFailed += 1;

        this.logger.warn(
          `Skipping startup source-data recovery for ${league.leagueId}: ` +
            `missing active season`,
        );

        continue;
      }

      if (!league.seasonStartDate) {
        leaguesFailed += 1;

        this.logger.warn(
          `Skipping startup source-data recovery for ${league.leagueId}: ` +
            `missing seasonStartDate`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        leaguesFailed += 1;

        this.logger.warn(
          `Skipping startup source-data recovery for ${league.leagueId}: ` +
            `unable to resolve ESPN league identifier`,
        );

        continue;
      }

      leaguesProcessed += 1;

      try {
        /*
         * This is the important recovery operation.
         *
         * SportsCollectionService owns the actual ESPN collection
         * workflow:
         *
         * season start
         *      ->
         * today + 8 days
         *      ->
         * fixtures
         *      ->
         * teams
         *      ->
         * standings
         *
         * The operation is idempotent, so running it again after
         * a previous interrupted collection repairs missing data
         * instead of abandoning the league.
         */
        const result =
          await this.sportsCollectionService.synchronizeEspnActiveLeague({
            leagueId,
            season: league.season,
            seasonStartDate: new Date(league.seasonStartDate),
          });

        leaguesSynchronized += 1;

        fixturesCollected += result.fixturesCollected;
        standingsCollected += result.standingsCollected;

        this.logger.log(
          `ESPN startup source-data synchronized for ${league.leagueId}: ` +
            `fixtures=${result.fixturesCollected}, ` +
            `standings=${result.standingsCollected}, ` +
            `range=${result.dateFrom}->${result.dateTo}`,
        );
      } catch (error) {
        leaguesFailed += 1;

        this.logger.error(
          `ESPN startup source-data recovery failed for ` +
            `${league.leagueId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `ESPN startup active-league source-data recovery completed: ` +
        `processed=${leaguesProcessed}, ` +
        `synchronized=${leaguesSynchronized}, ` +
        `failed=${leaguesFailed}, ` +
        `fixtures=${fixturesCollected}, ` +
        `standings=${standingsCollected}`,
    );

    // ==========================================================
    // STEP 4 — INITIAL / RECOVERY DERIVED DATA
    // ==========================================================

    try {
      await this.sportsDerivedDataBootstrapService.initialize();

      this.logger.log(
        'Derived-data bootstrap/recovery completed after ESPN source-data synchronization',
      );
    } catch (error) {
      this.logger.error(
        'Derived-data bootstrap/recovery failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    // ==========================================================
    // STEP 5 — SEED LEAGUE REFRESH QUEUE
    // ==========================================================

    try {
      const result = await this.seedInitialLeagueRefreshQueue(activeLeagues);

      this.logger.log(
        `ESPN initial league refresh queue seeded: ` +
          `active=${result.active}, ` +
          `queued=${result.queued}, ` +
          `skipped=${result.skipped}`,
      );
    } catch (error) {
      this.logger.error(
        'ESPN initial league refresh queue seeding failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    // ==========================================================
    // STEP 6 — STARTUP FINISHED MATCH SUMMARIES
    // ==========================================================

    try {
      await this.collectStartupFinishedMatchSummaries();
    } catch (error) {
      this.logger.error(
        'ESPN startup finished-match summary collection failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    // ==========================================================
    // STEP 7 — QUEUE STATE
    // ==========================================================

    try {
      const stats = await this.getQueueStats();

      this.logger.log(
        `ESPN queue state after startup seeding: ` +
          `pending=${stats.pending}, ` +
          `processing=${stats.processing}, ` +
          `completed=${stats.completed}, ` +
          `failed=${stats.failed}`,
      );
    } catch (error) {
      this.logger.warn(
        `Unable to read ESPN queue state at startup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.logger.log(
      'ESPN startup initialization finished. ' +
        'Active leagues were synchronized from season start through today + 8 days, ' +
        'and the normal queue now owns ongoing league refreshes.',
    );
  }

  // ============================================================
  // INITIAL LEAGUE REFRESH QUEUE
  // ============================================================

  /**
   * Seeds one LEAGUE_REFRESH job per active competition.
   *
   * Source-data synchronization has already populated:
   *
   * season start
   *      ->
   * today + 8 days
   *
   * The queue then takes ownership of the normal recurring refresh
   * window.
   *
   * Priority is used only to determine processing order.
   */
  private async seedInitialLeagueRefreshQueue(
    activeLeagues: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >,
  ): Promise<{
    active: number;
    queued: number;
    skipped: number;
  }> {
    let active = 0;
    let queued = 0;
    let skipped = 0;

    for (const league of activeLeagues) {
      if (!league.isActive) {
        skipped += 1;
        continue;
      }

      if (typeof league.season !== 'number') {
        skipped += 1;

        this.logger.warn(
          `Skipping initial league refresh queue seed for ` +
            `${league.leagueId}: missing season`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        skipped += 1;
        continue;
      }

      active += 1;

      const priority = this.getQueuePriority(league.priority);

      const job = await this.espnQueueService.addLeagueRefreshJob({
        leagueId,
        season: league.season,
        priority,
        scheduledFor: new Date(),
      });

      /*
       * addLeagueRefreshJob() returns an existing job when the
       * same league/season refresh already exists.
       *
       * Count it as seeded because the queue now owns that league.
       */
      if (job) {
        queued += 1;
      }
    }

    return {
      active,
      queued,
      skipped,
    };
  }

  private getQueuePriority(priority: CompetitionPriority | undefined): number {
    switch (priority) {
      case CompetitionPriority.ELITE:
        return 1;

      case CompetitionPriority.HIGH:
        return 2;

      case CompetitionPriority.REGIONAL:
        return 3;

      case CompetitionPriority.SELECTIVE:
      default:
        return 4;
    }
  }

  // ============================================================
  // STARTUP FINISHED SUMMARIES
  // ============================================================

  private async collectStartupFinishedMatchSummaries(): Promise<void> {
    const now = new Date();

    const cutoff = new Date(now.getTime() - this.threeHourWindowMs);

    /*
     * Startup only processes matches that are:
     *
     * 1. already completed by the ESPN scoreboard
     * 2. at least three hours past kickoff
     */
    const fixtures = await this.espnFixtureModel
      .find({
        completed: true,

        fixtureDate: {
          $lte: cutoff,
        },
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let processed = 0;
    let collected = 0;
    let skipped = 0;
    let failed = 0;

    this.logger.log(
      `Starting startup summary collection for ` +
        `${fixtures.length} finished ESPN fixtures`,
    );

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        skipped += 1;
        continue;
      }

      if (!fixture.leagueId) {
        skipped += 1;
        continue;
      }

      if (
        fixture.fixtureDate &&
        new Date(fixture.fixtureDate).getTime() + this.threeHourWindowMs >
          now.getTime()
      ) {
        skipped += 1;
        continue;
      }

      processed += 1;

      try {
        const hasSummary =
          await this.sportsCollectionService.hasEspnMatchSummary(
            fixture.eventId,
          );

        if (hasSummary) {
          skipped += 1;
          continue;
        }

        const summary = await this.getSummary(
          fixture.leagueId,
          fixture.eventId,
        );

        await this.sportsCollectionService.collectEspnMatchSummary({
          leagueId: fixture.leagueId,
          eventId: fixture.eventId,
          summary,
        });

        collected += 1;
      } catch (error) {
        failed += 1;

        this.logger.error(
          `Startup summary collection failed for ` +
            `${fixture.leagueId}:${fixture.eventId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `ESPN startup finished-match summaries completed: ` +
        `processed=${processed}, ` +
        `collected=${collected}, ` +
        `skipped=${skipped}, ` +
        `failed=${failed}`,
    );
  }

  private async getSummary(
    leagueId: string,
    eventId: string,
  ): Promise<Record<string, unknown>> {
    return this.espnService.getMatchSummary(leagueId, eventId);
  }

  // ============================================================
  // QUEUE STATE
  // ============================================================

  private async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return {
      pending: await this.espnQueueService.countPending(),
      processing: await this.espnQueueService.countProcessing(),
      completed: await this.espnQueueService.countCompleted(),
      failed: await this.espnQueueService.countFailed(),
    };
  }
}
