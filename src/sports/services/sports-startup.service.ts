// backend/src/sports/services/sports-startup.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueService } from './espn-queue.service';
import { SportsSyncStateService } from './sports-sync-state.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { CompetitionPriority } from '../enums/competition-priority.enum';
import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

import { EspnService } from '../providers/espn.service';

import { SportsCollectionService } from './sports-collection.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
import { EspnQueueWorkerService } from './espn-queue-worker.service';

import { YoutubeHighlightService } from './youtube-highlight.service';

// ============================================================
// TYPES
// ============================================================

type ActiveLeague = Awaited<
  ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
>[number];

interface StartupLeagueContext {
  league: ActiveLeague;

  leagueId: string;

  season: number;

  priority: number;

  stateKey: string;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class SportsStartupService implements OnModuleInit {
  private readonly logger = new Logger(SportsStartupService.name);

  private readonly startupFixtureForwardDays = 8;

  constructor(
    private readonly espnService: EspnService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly espnQueueWorkerService: EspnQueueWorkerService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly sportsSyncStateService: SportsSyncStateService,

    private readonly youtubeHighlightService: YoutubeHighlightService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  // ============================================================
  // MODULE INIT
  // ============================================================

  onModuleInit(): void {
    this.logger.log('Starting ESPN background initialization');

    setTimeout(() => {
      void this.initializeEspn();
    }, 0);
  }

  // ============================================================
  // STARTUP PIPELINE
  // ============================================================

  private async initializeEspn(): Promise<void> {
    try {
      // --------------------------------------------------------
      // PHASE 1
      // LEAGUE CATALOGUE
      // --------------------------------------------------------

      const leagues =
        await this.espnActiveCompetitionService.synchronizeLeagueCatalogue();

      this.logger.log(
        `ESPN league catalogue synchronized: ${leagues.length} leagues`,
      );

      // --------------------------------------------------------
      // PHASE 2
      // LEAGUE DETAILS
      // --------------------------------------------------------

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

      const activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Preparing ESPN startup pipeline for ${activeLeagues.length} active leagues`,
      );

      // --------------------------------------------------------
      // PREPARE ACTIVE-LEAGUE FIXTURE STATES
      // --------------------------------------------------------

      const leagueContexts = await this.prepareLeagueContexts(activeLeagues);

      // --------------------------------------------------------
      // PHASE 3
      // FIXTURE COLLECTION
      //
      // Startup collects the full persisted season window for
      // active competitions through today + configured forward days.
      // No Summary/standings/derived/news work runs here.
      // --------------------------------------------------------

      await this.runFixturePhase(leagueContexts);

      this.logger.log('ESPN FIXTURE PHASE completed. Moving to SUMMARY PHASE.');

      // --------------------------------------------------------
      // PHASE 4
      // SUMMARY COLLECTION
      //
      // Startup Summary work is performed for EVERY persisted
      // ESPN fixture that does not already contain payload.summary.
      // --------------------------------------------------------

      const summaryResult = await this.runStartupSummaryPhase();

      this.logger.log(
        `ESPN SUMMARY PHASE completed: ` +
          `checked=${summaryResult.checked}, ` +
          `missing=${summaryResult.missingSummary}, ` +
          `processed=${summaryResult.processed}, ` +
          `skipped=${summaryResult.skipped}`,
      );

      // --------------------------------------------------------
      // FINALIZE ACTIVE-LEAGUE FIXTURE STATES
      // --------------------------------------------------------

      for (const context of leagueContexts) {
        await this.sportsSyncStateService.refreshOverallStatus(
          context.stateKey,
        );
      }

      // --------------------------------------------------------
      // VALIDATE STARTUP FIXTURE STATES
      // --------------------------------------------------------

      const incompleteFixtureStates =
        await this.sportsSyncStateService.getIncompleteQueueStates([
          EspnQueueJobType.FIXTURE_REFRESH,
        ]);

      if (incompleteFixtureStates.length > 0) {
        throw new Error(
          `ESPN startup bootstrap is still incomplete. ` +
            `Incomplete fixture-refresh states=${incompleteFixtureStates.length}`,
        );
      }

      // --------------------------------------------------------
      // VALIDATE STARTUP SUMMARY STATES
      // --------------------------------------------------------

      const incompleteSummaryStates =
        await this.sportsSyncStateService.getIncompleteQueueStates([
          EspnQueueJobType.SUMMARY_REFRESH,
        ]);

      if (incompleteSummaryStates.length > 0) {
        throw new Error(
          `ESPN startup bootstrap is still incomplete. ` +
            `Incomplete summary-refresh states=${incompleteSummaryStates.length}`,
        );
      }

      // --------------------------------------------------------
      // RESTORE PRE-EXISTING NORMAL QUEUE WORK
      // --------------------------------------------------------

      const restored = await this.restoreNormalOperationsQueueStates();

      this.logger.log(
        `ESPN normal queue-state restoration completed: ` +
          `states=${restored.states}, ` +
          `queued=${restored.queued}, ` +
          `skipped=${restored.skipped}`,
      );

      // --------------------------------------------------------
      // INITIAL NORMAL FIXTURE REFRESH QUEUE
      // --------------------------------------------------------

      const initialQueue =
        await this.espnQueueBuilderService.buildDailyLeagueRefreshQueue();

      this.logger.log(
        `Initial normal ESPN fixture-refresh queue created: ` +
          `active=${initialQueue.active}, ` +
          `queued=${initialQueue.queued}, ` +
          `skipped=${initialQueue.skipped}`,
      );

      // --------------------------------------------------------
      // FINAL RELEASE
      // --------------------------------------------------------

      this.espnQueueService.markStartupReady();

      this.espnQueueService.markNormalOperationsReady();

      this.logger.log(
        'ESPN startup bootstrap is completely finished. ' +
          'Normal operations are now released.',
      );

      this.espnQueueWorkerService.start();
    } catch (error) {
      this.logger.error(
        'ESPN startup bootstrap failed. Sports synchronization remains locked.',
        error instanceof Error ? error.stack : String(error),
      );

      /*
       * Deliberately do NOT release:
       *
       * markStartupReady()
       * markNormalOperationsReady()
       * espnQueueWorkerService.start()
       *
       * Startup remains locked until the complete pipeline succeeds.
       */
    }
  }

  // ============================================================
  // PREPARE LEAGUE CONTEXTS
  // ============================================================

  private async prepareLeagueContexts(
    activeLeagues: ActiveLeague[],
  ): Promise<StartupLeagueContext[]> {
    const contexts: StartupLeagueContext[] = [];

    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      if (typeof league.season !== 'number') {
        throw new Error(`Active league ${league.leagueId} has no valid season`);
      }

      if (!league.seasonStartDate) {
        throw new Error(
          `Active league ${league.leagueId} has no seasonStartDate`,
        );
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        throw new Error('Active league has no valid ESPN league ID');
      }

      const priority = this.getQueuePriority(league.priority);

      const stateKey = this.sportsSyncStateService.getQueueStateKey({
        jobType: EspnQueueJobType.FIXTURE_REFRESH,

        leagueId,

        season: league.season,
      });

      await this.sportsSyncStateService.ensureQueueState({
        jobType: EspnQueueJobType.FIXTURE_REFRESH,

        leagueId,

        season: league.season,

        priority,

        trackingMode: 'HISTORY',
      });

      await this.sportsSyncStateService.ensureDateWindow({
        stateKey,

        dateFrom: this.toDateOnly(new Date(league.seasonStartDate)),

        dateTo: this.toDateOnly(
          this.addUtcDays(
            this.startOfUtcDay(new Date()),
            this.startupFixtureForwardDays,
          ),
        ),

        trackingMode: 'HISTORY',
      });

      await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

      contexts.push({
        league,

        leagueId,

        season: league.season,

        priority,

        stateKey,
      });
    }

    return contexts;
  }

  // ============================================================
  // PHASE 3
  // FIXTURE COLLECTION
  // ============================================================

  private async runFixturePhase(
    contexts: StartupLeagueContext[],
  ): Promise<void> {
    const failures: string[] = [];

    this.logger.log(`ESPN FIXTURE PHASE started: leagues=${contexts.length}`);

    for (const context of contexts) {
      const incompleteDates =
        await this.sportsSyncStateService.getIncompleteDates(context.stateKey);

      this.logger.log(
        `Fixture bootstrap for ${context.leagueId}: ` +
          `remainingDates=${incompleteDates.length}`,
      );

      for (const dateKey of incompleteDates) {
        try {
          await this.processFixtureDate(
            context.stateKey,
            context.leagueId,
            dateKey,
          );
        } catch (error) {
          failures.push(
            `${context.leagueId} ${dateKey}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await this.sportsSyncStateService.refreshOverallStatus(context.stateKey);
    }

    if (failures.length > 0) {
      throw new Error(`Fixture phase failed: ${failures.join('; ')}`);
    }

    this.logger.log('ESPN FIXTURE PHASE completed successfully');
  }

  private async processFixtureDate(
    stateKey: string,
    leagueId: string,
    dateKey: string,
  ): Promise<void> {
    await this.sportsSyncStateService.markDateProcessing(stateKey, dateKey);

    try {
      const response = await this.espnService.getFixturesForDate(
        leagueId,
        dateKey,
      );

      await this.sportsCollectionService.collectEspnFixtures(
        leagueId,
        response,
      );

      await this.sportsSyncStateService.markDateSuccess(stateKey, dateKey);

      this.logger.debug(
        `ESPN fixture collection completed: ${leagueId} ${dateKey}`,
      );
    } catch (error) {
      await this.sportsSyncStateService.markDateFailed(
        stateKey,
        dateKey,
        error,
      );

      throw error;
    }
  }

  // ============================================================
  // PHASE 4
  // STARTUP SUMMARY
  // ============================================================

  private async runStartupSummaryPhase(): Promise<{
    checked: number;
    missingSummary: number;
    processed: number;
    skipped: number;
  }> {
    const fixtures = await this.espnFixtureModel
      .find({
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
        leagueId: 1,
        season: 1,
        completed: 1,
        payload: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let missingSummary = 0;
    let processed = 0;
    let skipped = 0;

    this.logger.log(
      `ESPN STARTUP SUMMARY PHASE started: fixtures=${fixtures.length}`,
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

      if (typeof fixture.season !== 'number') {
        skipped += 1;
        continue;
      }

      if (this.hasSummary(fixture)) {
        continue;
      }

      missingSummary += 1;

      const stateKey = this.sportsSyncStateService.getQueueStateKey({
        jobType: EspnQueueJobType.SUMMARY_REFRESH,

        leagueId: fixture.leagueId,

        season: fixture.season,

        eventId: fixture.eventId,
      });

      const priority = await this.getLeaguePriority(fixture.leagueId);

      await this.sportsSyncStateService.ensureQueueState({
        jobType: EspnQueueJobType.SUMMARY_REFRESH,

        leagueId: fixture.leagueId,

        season: fixture.season,

        eventId: fixture.eventId,

        priority,

        trackingMode: 'WINDOW',
      });

      const steps =
        fixture.completed === true ? ['summary', 'youtube'] : ['summary'];

      await this.sportsSyncStateService.ensureStepUnits(stateKey, steps);

      await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

      try {
        await this.runTrackedStep(stateKey, 'summary', async () => {
          const currentFixture = await this.espnFixtureModel
            .findOne({
              eventId: fixture.eventId,

              leagueId: fixture.leagueId,

              season: fixture.season,
            })
            .select({
              eventId: 1,
              'payload.summary': 1,
            })
            .lean()
            .exec();

          if (!currentFixture) {
            throw new Error(
              `Startup Summary fixture ${fixture.eventId} not found`,
            );
          }

          if (this.hasSummary(currentFixture)) {
            return;
          }

          const summary = await this.espnService.getMatchSummary(
            fixture.leagueId,
            fixture.eventId,
          );

          await this.sportsCollectionService.collectEspnMatchSummary({
            leagueId: fixture.leagueId,

            eventId: fixture.eventId,

            summary,
          });
        });

        if (fixture.completed === true) {
          await this.runTrackedStep(stateKey, 'youtube', async () => {
            await this.youtubeHighlightService.processFixture(fixture.eventId);
          });
        }

        await this.sportsSyncStateService.refreshOverallStatus(stateKey);

        const complete = await this.sportsSyncStateService.isComplete(stateKey);

        if (!complete) {
          throw new Error(
            `Startup Summary synchronization state ${stateKey} is not complete`,
          );
        }

        processed += 1;
      } catch (error) {
        skipped += 1;

        this.logger.error(
          `Startup Summary failed for ${fixture.leagueId}/${fixture.eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    /*
     * A failed Summary item is intentionally fatal to startup.
     * Normal queue processing must not be released with an
     * incomplete startup Summary bootstrap.
     */
    if (skipped > 0) {
      throw new Error(
        `Startup Summary phase did not complete for ${skipped} fixture(s)`,
      );
    }

    return {
      checked: fixtures.length,
      missingSummary,
      processed,
      skipped,
    };
  }

  // ============================================================
  // PERSISTENT QUEUE RESTORATION
  // ============================================================

  private async restoreNormalOperationsQueueStates(): Promise<{
    states: number;
    queued: number;
    skipped: number;
  }> {
    const states = await this.sportsSyncStateService.getIncompleteQueueStates([
      EspnQueueJobType.FIXTURE_REFRESH,
      EspnQueueJobType.SUMMARY_REFRESH,
    ]);

    let queued = 0;

    let skipped = 0;

    for (const state of states) {
      if (!state.leagueId) {
        skipped += 1;
        continue;
      }

      try {
        switch (state.jobType) {
          case EspnQueueJobType.FIXTURE_REFRESH: {
            if (typeof state.season !== 'number') {
              skipped += 1;
              continue;
            }

            const job = await this.espnQueueService.addFixtureRefreshJob({
              leagueId: state.leagueId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),

              triggerEventId: this.extractFixtureTriggerEventId(state.stateKey),
            });

            if (
              String(job.status) === 'PENDING' &&
              Number(job.attempts ?? 0) === 0
            ) {
              queued += 1;
            }

            break;
          }

          case EspnQueueJobType.SUMMARY_REFRESH: {
            if (typeof state.season !== 'number' || !state.eventId) {
              skipped += 1;
              continue;
            }

            const job = await this.espnQueueService.addSummaryRefreshJob({
              leagueId: state.leagueId,

              eventId: state.eventId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),
            });

            if (
              String(job.status) === 'PENDING' &&
              Number(job.attempts ?? 0) === 0
            ) {
              queued += 1;
            }

            break;
          }

          default:
            skipped += 1;
        }
      } catch (error) {
        skipped += 1;

        this.logger.error(
          `Failed to restore normal synchronization state ${state.stateKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      states: states.length,
      queued,
      skipped,
    };
  }

  // ============================================================
  // PRIORITY
  // ============================================================

  private async getLeaguePriority(leagueId: string): Promise<number> {
    const league =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    if (!league) {
      return 4;
    }

    return this.getQueuePriority(league.priority);
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
  // TRACKED STEP
  // ============================================================

  private async runTrackedStep(
    stateKey: string,
    stepKey: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const successful = await this.sportsSyncStateService.isUnitSuccessful(
      stateKey,
      `STEP:${stepKey}`,
    );

    if (successful) {
      return;
    }

    await this.sportsSyncStateService.markStepProcessing(stateKey, stepKey);

    try {
      await action();

      await this.sportsSyncStateService.markStepSuccess(stateKey, stepKey);
    } catch (error) {
      await this.sportsSyncStateService.markStepFailed(
        stateKey,
        stepKey,
        error,
      );

      throw error;
    }
  }

  // ============================================================
  // FIXTURE REFRESH TRIGGER EXTRACTION
  // ============================================================

  private extractFixtureTriggerEventId(stateKey: string): string | undefined {
    const parts = stateKey.split(':');

    if (parts.length < 5) {
      return undefined;
    }

    return parts.slice(4).join(':') || undefined;
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // ============================================================
  // SUMMARY
  // ============================================================

  private hasSummary(fixture: Pick<EspnFixtureDocument, 'payload'>): boolean {
    const payload = fixture.payload;

    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return Boolean(
      payload.summary &&
      typeof payload.summary === 'object' &&
      Object.keys(payload.summary).length > 0,
    );
  }
}
