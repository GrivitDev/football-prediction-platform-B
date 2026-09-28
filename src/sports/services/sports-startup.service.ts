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

  fixtureStateKey: string;

  summaryStateKey: string;
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
      // PREPARE ACTIVE-LEAGUE SYNC STATES
      // --------------------------------------------------------

      const leagueContexts = await this.prepareLeagueContexts(activeLeagues);

      // --------------------------------------------------------
      // PHASE 3
      // FIXTURE COLLECTION
      // --------------------------------------------------------

      await this.runFixturePhase(leagueContexts);

      this.logger.log('ESPN FIXTURE PHASE completed. Moving to SUMMARY PHASE.');

      // --------------------------------------------------------
      // PHASE 4
      // SUMMARY COLLECTION
      //
      // Startup only synchronizes fixtures + summaries.
      // YouTube is deliberately not part of startup.
      // --------------------------------------------------------

      const summaryResult = await this.runStartupSummaryPhase(leagueContexts);

      this.logger.log(
        `ESPN SUMMARY PHASE completed: ` +
          `checked=${summaryResult.checked}, ` +
          `missing=${summaryResult.missingSummary}, ` +
          `processed=${summaryResult.processed}, ` +
          `skipped=${summaryResult.skipped}`,
      );

      // --------------------------------------------------------
      // FINAL STATE VALIDATION
      // --------------------------------------------------------

      for (const context of leagueContexts) {
        const fixtureComplete = await this.sportsSyncStateService.isComplete(
          context.fixtureStateKey,
        );

        if (!fixtureComplete) {
          throw new Error(
            `Fixture synchronization state ${context.fixtureStateKey} is not complete`,
          );
        }

        const summaryComplete = await this.sportsSyncStateService.isComplete(
          context.summaryStateKey,
        );

        if (!summaryComplete) {
          throw new Error(
            `Summary synchronization state ${context.summaryStateKey} is not complete`,
          );
        }
      }

      // --------------------------------------------------------
      // RESTORE PRE-EXISTING NORMAL FIXTURE QUEUE WORK
      //
      // Summary jobs are not restored from state because the
      // summary state is league/season scoped and contains many
      // event units. Normal summary queue discovery rebuilds
      // operational jobs from that persistent state after startup.
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

      // --------------------------------------------------------
      // FIXTURE STATE
      // --------------------------------------------------------

      const fixtureState =
        await this.sportsSyncStateService.ensureFixtureRefreshState({
          leagueId,

          season: league.season,

          priority,

          dateFrom: this.toDateOnly(new Date(league.seasonStartDate)),

          dateTo: this.toDateOnly(
            this.addUtcDays(
              this.startOfUtcDay(new Date()),
              this.startupFixtureForwardDays,
            ),
          ),

          trackingMode: 'HISTORY',
        });

      await this.sportsSyncStateService.resetInterruptedUnits(
        fixtureState.stateKey,
      );

      // --------------------------------------------------------
      // SUMMARY STATE
      // --------------------------------------------------------

      const summaryState =
        await this.sportsSyncStateService.ensureSummaryRefreshState({
          leagueId,

          season: league.season,

          priority,

          trackingMode: 'HISTORY',
        });

      await this.sportsSyncStateService.resetInterruptedUnits(
        summaryState.stateKey,
      );

      contexts.push({
        league,

        leagueId,

        season: league.season,

        priority,

        fixtureStateKey: fixtureState.stateKey,

        summaryStateKey: summaryState.stateKey,
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
        await this.sportsSyncStateService.getIncompleteDates(
          context.fixtureStateKey,
        );

      this.logger.log(
        `Fixture bootstrap for ${context.leagueId}: ` +
          `remainingDates=${incompleteDates.length}`,
      );

      for (const dateKey of incompleteDates) {
        try {
          await this.processFixtureDate(
            context.fixtureStateKey,
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

      await this.sportsSyncStateService.refreshOverallStatus(
        context.fixtureStateKey,
      );
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
  // SUMMARY COLLECTION
  // ============================================================

  private async runStartupSummaryPhase(
    contexts: StartupLeagueContext[],
  ): Promise<{
    checked: number;
    missingSummary: number;
    processed: number;
    skipped: number;
  }> {
    let checked = 0;

    let missingSummary = 0;

    let processed = 0;

    let skipped = 0;

    this.logger.log(
      `ESPN STARTUP SUMMARY PHASE started: leagues=${contexts.length}`,
    );

    for (const context of contexts) {
      await this.sportsSyncStateService.resetInterruptedUnits(
        context.summaryStateKey,
      );

      const state = await this.sportsSyncStateService.requireState(
        context.summaryStateKey,
      );

      const incompleteEvents =
        await this.sportsSyncStateService.getIncompleteSummaryEvents(
          context.summaryStateKey,
        );

      checked += state.units.length;

      missingSummary += incompleteEvents.length;

      this.logger.log(
        `Summary bootstrap for ${context.leagueId}: ` +
          `checked=${state.units.length}, ` +
          `remainingEvents=${incompleteEvents.length}`,
      );

      for (const eventId of incompleteEvents) {
        const stepKey = this.sportsSyncStateService.getSummaryStepKey(eventId);

        try {
          await this.runTrackedStep(
            context.summaryStateKey,
            stepKey,
            async () => {
              const currentFixture = await this.espnFixtureModel
                .findOne({
                  eventId,

                  leagueId: context.leagueId,

                  season: context.season,
                })
                .select({
                  eventId: 1,

                  'payload.summary': 1,
                })
                .lean()
                .exec();

              if (!currentFixture) {
                throw new Error(`Startup Summary fixture ${eventId} not found`);
              }

              if (this.hasSummary(currentFixture)) {
                return;
              }

              const summary = await this.espnService.getMatchSummary(
                context.leagueId,
                eventId,
              );

              await this.sportsCollectionService.collectEspnMatchSummary({
                leagueId: context.leagueId,

                eventId,

                summary,
              });
            },
          );

          processed += 1;
        } catch (error) {
          skipped += 1;

          this.logger.error(
            `Startup Summary failed for ${context.leagueId}/${eventId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await this.sportsSyncStateService.refreshOverallStatus(
        context.summaryStateKey,
      );

      const complete = await this.sportsSyncStateService.isComplete(
        context.summaryStateKey,
      );

      if (!complete) {
        throw new Error(
          `Startup Summary synchronization state ${context.summaryStateKey} is not complete`,
        );
      }
    }

    if (skipped > 0) {
      throw new Error(
        `Startup Summary phase did not complete for ${skipped} fixture(s)`,
      );
    }

    return {
      checked,

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
    ]);

    let queued = 0;

    let skipped = 0;

    for (const state of states) {
      if (!state.leagueId) {
        skipped += 1;
        continue;
      }

      try {
        if (state.jobType !== EspnQueueJobType.FIXTURE_REFRESH) {
          skipped += 1;
          continue;
        }

        if (typeof state.season !== 'number') {
          skipped += 1;
          continue;
        }

        /*
         * The persistent FIXTURE_REFRESH state is independent of
         * the operational trigger that originally created work.
         *
         * Rebuilding one normal fixture queue job is enough because
         * the worker reads the persistent state and processes every
         * incomplete fixture date.
         */
        const job = await this.espnQueueService.addFixtureRefreshJob({
          leagueId: state.leagueId,

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
}
