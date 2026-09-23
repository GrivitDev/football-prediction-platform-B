import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
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

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

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
    let catalogueEmpty: boolean;

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
     * The complete bootstrap remains a first-time bootstrap.
     *
     * Subsequent application restarts continue using the
     * stored catalogue and normal queue operation.
     */
    if (!catalogueEmpty) {
      this.logger.log(
        'ESPN league catalogue already populated. ' +
          'Skipping initial ESPN bootstrap.',
      );

      /*
       * Source ESPN data already exists, so give the derived-data
       * bootstrap an opportunity to build any derived collections
       * that are still empty.
       *
       * SportsDerivedDataBootstrapService is responsible for checking
       * whether the derived collections already contain data.
       */
      try {
        await this.sportsDerivedDataBootstrapService.initialize();

        this.logger.log(
          'Derived-data bootstrap check completed using existing ESPN source data',
        );
      } catch (error) {
        this.logger.error(
          'Derived-data bootstrap failed while using existing ESPN source data',
          error instanceof Error ? error.stack : String(error),
        );
      }

      return;
    }

    this.logger.log(
      'ESPN league catalogue is empty. ' +
        'Starting complete initial bootstrap.',
    );

    // ==========================================================
    // STEP 1 — COMPLETE ESPN CATALOGUE
    // ==========================================================

    let leagues: unknown[] = [];

    try {
      leagues =
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
    // STEP 3 — FIXTURES FROM SEASON START THROUGH TODAY
    // ==========================================================

    let activeLeagues: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >;

    try {
      activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Starting ESPN historical fixture bootstrap for ` +
          `${activeLeagues.length} active leagues`,
      );
    } catch (error) {
      this.logger.error(
        'Unable to load active ESPN leagues for fixture bootstrap',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    const today = new Date();
    const todayDate = this.toUtcDateOnly(today);

    let fixtureProcessed = 0;
    let fixtureCollected = 0;
    let fixtureFailed = 0;

    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      if (typeof league.season !== 'number' || !league.seasonStartDate) {
        this.logger.warn(
          `Skipping startup fixture bootstrap for ` +
            `${league.leagueId}: missing season or seasonStartDate`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      const seasonStartDate = this.toUtcDateOnly(
        new Date(league.seasonStartDate),
      );

      if (seasonStartDate > todayDate) {
        this.logger.warn(
          `Skipping startup fixture bootstrap for ${league.leagueId}: ` +
            `seasonStartDate ${seasonStartDate} is after today ${todayDate}`,
        );

        continue;
      }

      fixtureProcessed += 1;

      try {
        /*
         * IMPORTANT:
         *
         * Initial startup fixture collection stops at TODAY.
         *
         * We intentionally do not collect future fixtures here.
         *
         * The normal ESPN queue will take over after the initial
         * historical/current fixture population and refresh the
         * current + upcoming window continuously.
         */
        const response = await this.espnService.getFixturesRange(
          leagueId,
          seasonStartDate,
          todayDate,
        );

        const result = await this.sportsCollectionService.collectEspnFixtures(
          leagueId,
          response,
        );

        fixtureCollected += result.collected;

        this.logger.log(
          `ESPN startup fixtures collected for ${league.leagueId}: ` +
            `collected=${result.collected}, ` +
            `range=${seasonStartDate}->${todayDate}`,
        );
      } catch (error) {
        fixtureFailed += 1;

        this.logger.error(
          `ESPN startup fixture bootstrap failed for ` +
            `${league.leagueId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `ESPN startup historical fixture bootstrap completed: ` +
        `processed=${fixtureProcessed}, ` +
        `collected=${fixtureCollected}, ` +
        `failed=${fixtureFailed}`,
    );

    // ==========================================================
    // STEP 4 — INITIAL DERIVED DATA
    // ==========================================================

    try {
      await this.sportsDerivedDataBootstrapService.initialize();

      this.logger.log(
        'Initial derived-data bootstrap completed after historical fixture collection',
      );
    } catch (error) {
      this.logger.error(
        'Initial derived-data bootstrap failed',
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
    // STEP 7 — STARTUP STANDINGS
    // ==========================================================

    try {
      await this.collectStartupStandings(activeLeagues);
    } catch (error) {
      this.logger.error(
        'ESPN startup standings collection failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    // ==========================================================
    // STEP 8 — QUEUE STATE
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
      'ESPN complete initial bootstrap finished. ' +
        'Historical fixtures are populated through today and ' +
        'the normal five-second queue now owns ongoing fixture refresh.',
    );
  }

  // ============================================================
  // INITIAL LEAGUE REFRESH QUEUE
  // ============================================================

  /**
   * Seeds one LEAGUE_REFRESH job per active competition.
   *
   * Startup deliberately does not collect future fixtures itself.
   *
   * Once these jobs are processed by EspnQueueWorkerService:
   *
   * LEAGUE_REFRESH
   *      ->
   * today's scoreboard + upcoming window
   *      ->
   * sports_espn_fixtures
   *      ->
   * UPCOMING_MATCH / FINISHED_MATCH
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
  // STARTUP STANDINGS
  // ============================================================

  private async collectStartupStandings(
    activeLeagues: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >,
  ): Promise<void> {
    let processed = 0;
    let collected = 0;
    let failed = 0;

    this.logger.log(
      `Starting startup standings collection for ` +
        `${activeLeagues.length} active ESPN competitions`,
    );

    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      processed += 1;

      try {
        const standings = await this.espnService.getStandings(
          league.slug || league.leagueId,
        );

        const result = await this.sportsCollectionService.collectEspnStandings(
          league.leagueId,
          standings,
          league.season,
        );

        collected += result;
      } catch (error) {
        failed += 1;

        this.logger.error(
          `Startup standings collection failed for ` +
            `${league.leagueId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `ESPN startup standings completed: ` +
        `processed=${processed}, ` +
        `entries=${collected}, ` +
        `failed=${failed}`,
    );
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

  // ============================================================
  // DATE HELPER
  // ============================================================

  private toUtcDateOnly(value: Date): string {
    const date = new Date(value);

    const year = date.getUTCFullYear();

    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
