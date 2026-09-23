// src/sports/services/sports-startup.service.ts

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
    /*
     * ==========================================================
     * STEP 1 — ALWAYS SYNCHRONIZE ESPN CATALOGUE
     * ==========================================================
     *
     * This is intentionally performed on every startup.
     *
     * It does NOT collect fixtures.
     */
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

    /*
     * ==========================================================
     * STEP 2 — ONLY FETCH MISSING LEAGUE DETAILS
     * ==========================================================
     *
     * Existing detailed leagues do not call ESPN here.
     *
     * synchronizeMissingLeagueDetails() also updates
     * ActiveCompetition for newly detailed active leagues.
     */
    try {
      const detailResult =
        await this.espnActiveCompetitionService.synchronizeMissingLeagueDetails();

      this.logger.log(
        `ESPN missing league-detail synchronization completed: ` +
          `processed=${detailResult.processed}, ` +
          `synchronized=${detailResult.synchronized}, ` +
          `active=${detailResult.active}, ` +
          `inactive=${detailResult.inactive}, ` +
          `skipped=${detailResult.skipped}, ` +
          `failed=${detailResult.failed}`,
      );
    } catch (error) {
      this.logger.error(
        'ESPN missing league-detail synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    /*
     * ==========================================================
     * STEP 3 — LOCAL FIXTURE GAP INSPECTION
     * ==========================================================
     *
     * MongoDB only.
     *
     * No ESPN fixture endpoint is called here.
     *
     * A league gets FIXTURE_RECOVERY only when:
     *
     * - an unexplained historical fixture-date gap > 6 days exists
     * - OR the active season has no stored completed/current
     *   fixture dates yet and its season has already started
     *
     * The worker later performs the expensive recovery.
     */
    let activeLeagues: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >;

    try {
      activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Inspecting local ESPN fixture completeness for ` +
          `${activeLeagues.length} active leagues`,
      );
    } catch (error) {
      this.logger.error(
        'Unable to load active ESPN leagues for local fixture inspection',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    let recoveryQueued = 0;
    let recoveryAlreadyQueued = 0;
    let gapLeagues = 0;
    let summaryJobsQueued = 0;

    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      if (typeof league.season !== 'number') {
        this.logger.warn(
          `Skipping fixture completeness inspection for ` +
            `${league.leagueId}: missing season`,
        );

        continue;
      }

      if (!league.seasonStartDate) {
        this.logger.warn(
          `Skipping fixture completeness inspection for ` +
            `${league.leagueId}: missing seasonStartDate`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        continue;
      }

      /*
       * --------------------------------------------------------
       * 3A — DETECT LOCAL FIXTURE GAP
       * --------------------------------------------------------
       */
      const gap = await this.detectFixtureGap({
        leagueId,
        season: league.season,
        seasonStartDate: new Date(league.seasonStartDate),
      });

      const priority = this.getQueuePriority(league.priority);

      if (gap.hasGap) {
        gapLeagues += 1;

        const job = await this.espnQueueService.addFixtureRecoveryJob({
          leagueId,
          season: league.season,
          priority,
          scheduledFor: new Date(),
        });

        if (String(job.status) === 'PENDING') {
          recoveryQueued += 1;
        } else {
          recoveryAlreadyQueued += 1;
        }

        this.logger.log(
          `Fixture recovery required for ${leagueId}: ` +
            `largestGap=${gap.largestGapDays} days` +
            `${
              gap.gapFrom && gap.gapTo
                ? ` (${gap.gapFrom.toISOString()} -> ${gap.gapTo.toISOString()})`
                : ''
            }`,
        );
      }

      /*
       * --------------------------------------------------------
       * 3B — QUEUE EXISTING FINISHED FIXTURES WITHOUT SUMMARY
       * --------------------------------------------------------
       *
       * This is MongoDB-only.
       *
       * If a FIXTURE_RECOVERY job is created, the newly recovered
       * fixtures will be checked again by the worker after the
       * recovery finishes.
       */
      const summaryQueued = await this.queueMissingFinishedMatchSummaries({
        leagueId,
        season: league.season,
        priority,
      });

      summaryJobsQueued += summaryQueued;
    }

    this.logger.log(
      `ESPN startup local fixture inspection completed: ` +
        `active=${activeLeagues.length}, ` +
        `gapLeagues=${gapLeagues}, ` +
        `recoveryQueued=${recoveryQueued}, ` +
        `recoveryExisting=${recoveryAlreadyQueued}, ` +
        `summaryJobsQueued=${summaryJobsQueued}`,
    );

    /*
     * ==========================================================
     * STEP 4 — DERIVED DATA BOOTSTRAP
     * ==========================================================
     *
     * This performs no startup fixture collection.
     *
     * The source-data recovery itself belongs to the queue.
     */
    try {
      await this.sportsDerivedDataBootstrapService.initialize();

      this.logger.log('Derived-data bootstrap/recovery completed');
    } catch (error) {
      this.logger.error(
        'Derived-data bootstrap/recovery failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    /*
     * ==========================================================
     * STEP 5 — SEED NORMAL LEAGUE REFRESH JOBS
     * ==========================================================
     *
     * These are normal recurring refresh jobs.
     *
     * They do NOT perform historical startup recovery.
     */
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

    /*
     * ==========================================================
     * STEP 6 — QUEUE STATE
     * ==========================================================
     */
    try {
      const stats = await this.getQueueStats();

      this.logger.log(
        `ESPN queue state before worker release: ` +
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

    /*
     * ==========================================================
     * STEP 7 — RELEASE QUEUE WORKER
     * ==========================================================
     *
     * Only now can the worker consume:
     *
     * FIXTURE_RECOVERY
     * FINISHED_MATCH
     * UPCOMING_MATCH
     * LEAGUE_REFRESH
     */
    this.espnQueueService.markStartupReady();

    this.logger.log(
      'ESPN startup initialization finished. ' +
        'No historical fixture collection was performed during startup. ' +
        'Queued recovery and normal jobs are now released to the worker.',
    );
  }

  // ============================================================
  // FIXTURE GAP DETECTION
  // ============================================================

  private async detectFixtureGap(params: {
    leagueId: string;
    season: number;
    seasonStartDate: Date;
  }): Promise<{
    hasGap: boolean;
    largestGapDays: number;
    gapFrom?: Date;
    gapTo?: Date;
  }> {
    const now = new Date();

    /*
     * Only dates up to today are relevant for historical
     * completeness.
     *
     * Future fixtures must not hide a historical gap.
     */
    const todayStart = this.startOfUtcDay(now);

    const fixtures = await this.espnFixtureModel
      .find({
        leagueId: params.leagueId,
        season: params.season,

        fixtureDate: {
          $gte: params.seasonStartDate,
          $lte: todayStart,
        },
      })
      .select({
        fixtureDate: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    /*
     * Distinct UTC fixture dates.
     */
    const dayKeys = Array.from(
      new Set(
        fixtures
          .map((fixture) => fixture.fixtureDate)
          .filter(Boolean)
          .map((date) => this.startOfUtcDay(new Date(date)).getTime()),
      ),
    ).sort((a, b) => a - b);

    /*
     * If the active season has started but there is no local
     * fixture data at all, recovery is required.
     */
    if (
      dayKeys.length === 0 &&
      params.seasonStartDate.getTime() <= todayStart.getTime()
    ) {
      return {
        hasGap: true,
        largestGapDays: 0,
      };
    }

    let largestGapDays = 0;
    let gapFrom: Date | undefined;
    let gapTo: Date | undefined;

    /*
     * Internal fixture-date gaps.
     *
     * A 5-day gap is acceptable.
     * A 6-day gap is acceptable.
     * Only > 6 days triggers recovery.
     */
    for (let index = 1; index < dayKeys.length; index += 1) {
      const previous = dayKeys[index - 1];
      const current = dayKeys[index];

      const gapDays = Math.floor((current - previous) / (24 * 60 * 60 * 1000));

      if (gapDays > largestGapDays) {
        largestGapDays = gapDays;
        gapFrom = new Date(previous);
        gapTo = new Date(current);
      }
    }

    /*
     * Also check the last stored fixture against today.
     *
     * Example:
     *
     * Aug 22 -> Sep 1
     *
     * means the local collection has stopped and needs recovery.
     */
    if (dayKeys.length > 0) {
      const lastFixtureDay = dayKeys[dayKeys.length - 1];

      const daysSinceLastFixture = Math.floor(
        (todayStart.getTime() - lastFixtureDay) / (24 * 60 * 60 * 1000),
      );

      if (daysSinceLastFixture > largestGapDays) {
        largestGapDays = daysSinceLastFixture;
        gapFrom = new Date(lastFixtureDay);
        gapTo = todayStart;
      }
    }

    return {
      hasGap: largestGapDays > 6,
      largestGapDays,
      gapFrom,
      gapTo,
    };
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  // ============================================================
  // FINISHED MATCH SUMMARY QUEUE
  // ============================================================

  private async queueMissingFinishedMatchSummaries(params: {
    leagueId: string;
    season: number;
    priority: number;
  }): Promise<number> {
    const cutoff = new Date(Date.now() - this.threeHourWindowMs);

    const fixtures = await this.espnFixtureModel
      .find({
        leagueId: params.leagueId,
        season: params.season,

        completed: true,

        fixtureDate: {
          $lte: cutoff,
        },

        /*
         * Only fixtures whose stored payload does not contain
         * a summary need a FINISHED_MATCH job.
         */
        $or: [
          {
            'payload.summary': {
              $exists: false,
            },
          },
          {
            'payload.summary': null,
          },
        ],
      })
      .select({
        eventId: 1,
        fixtureDate: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let queued = 0;

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        continue;
      }

      await this.espnQueueService.addFinishedMatchJob({
        leagueId: params.leagueId,
        eventId: fixture.eventId,
        season: params.season,
        priority: params.priority,
        scheduledFor: new Date(),
      });

      queued += 1;
    }

    return queued;
  }

  // ============================================================
  // INITIAL LEAGUE REFRESH QUEUE
  // ============================================================

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
