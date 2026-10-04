// backend/src/sports/services/sports-startup.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueService } from './espn-queue.service';
import { SportsSyncStateService } from './sports-sync-state.service';

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

  /**
   * Maximum number of concurrent Summary requests
   * inside one league.
   */
  private readonly startupSummaryConcurrency = 4;

  constructor(
    private readonly espnService: EspnService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly espnQueueWorkerService: EspnQueueWorkerService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly sportsSyncStateService: SportsSyncStateService,
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

      // --------------------------------------------------------
      // AUTHORITATIVE ACTIVE LEAGUE LIST
      // --------------------------------------------------------

      const activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Preparing ESPN startup pipeline for ${activeLeagues.length} active leagues`,
      );

      // --------------------------------------------------------
      // PREPARE FIXTURE SYNCHRONIZATION STATES
      //
      // ONLY FIXTURE_REFRESH state is prepared here.
      //
      // SUMMARY_REFRESH state is deliberately not reconciled
      // until every fixture state has completed.
      // --------------------------------------------------------

      const leagueContexts = await this.prepareLeagueContexts(activeLeagues);

      this.logger.log(
        `ESPN fixture synchronization states prepared: leagues=${leagueContexts.length}`,
      );

      // --------------------------------------------------------
      // PHASE 3
      // FIXTURE COLLECTION
      // --------------------------------------------------------

      await this.runFixturePhase(leagueContexts);

      this.logger.log('ESPN FIXTURE PHASE completed. Moving to SUMMARY PHASE.');

      // --------------------------------------------------------
      // PHASE 4
      // SUMMARY COLLECTION
      // --------------------------------------------------------

      const summaryResult = await this.runStartupSummaryPhase(leagueContexts);

      this.logger.log(
        `ESPN SUMMARY PHASE completed: ` +
          `checked=${summaryResult.checked}, ` +
          `missing=${summaryResult.missingSummary}, ` +
          `processed=${summaryResult.processed}, ` +
          `failedAttempts=${summaryResult.failedAttempts}`,
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
      // RESTORE NORMAL OPERATIONS
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
      // RELEASE NORMAL OPERATIONS
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
      //
      // This is the only synchronization state prepared here.
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
      // SUMMARY STATE KEY
      //
      // Do not create/reconcile Summary state yet.
      // --------------------------------------------------------

      const summaryStateKey = this.sportsSyncStateService.getQueueStateKey({
        jobType: EspnQueueJobType.SUMMARY_REFRESH,
        leagueId,
        season: league.season,
      });

      contexts.push({
        league,
        leagueId,
        season: league.season,
        priority,
        fixtureStateKey: fixtureState.stateKey,
        summaryStateKey,
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
      while (true) {
        const incompleteDates =
          await this.sportsSyncStateService.getDueIncompleteDates(
            context.fixtureStateKey,
          );

        this.logger.log(
          `Fixture bootstrap for ${context.leagueId}: ` +
            `dueDates=${incompleteDates.length}`,
        );

        for (const dateKey of incompleteDates) {
          try {
            await this.processFixtureDate(
              context.fixtureStateKey,
              context.leagueId,
              dateKey,
            );
          } catch (error) {
            this.logger.error(
              `Fixture bootstrap failed for ` +
                `${context.leagueId} ${dateKey}: ` +
                `${error instanceof Error ? error.message : String(error)}. ` +
                `The fixture synchronization unit will be retried.`,
            );
          }
        }

        await this.sportsSyncStateService.refreshOverallStatus(
          context.fixtureStateKey,
        );

        const complete = await this.sportsSyncStateService.isComplete(
          context.fixtureStateKey,
        );

        if (complete) {
          this.logger.log(
            `Fixture bootstrap completed for ${context.leagueId}`,
          );

          break;
        }

        const nextRetryAt =
          await this.sportsSyncStateService.getNextIncompleteDateRetryAt(
            context.fixtureStateKey,
          );

        if (nextRetryAt) {
          const delay = Math.max(0, nextRetryAt.getTime() - Date.now());

          this.logger.warn(
            `Fixture retry scheduled for ${context.leagueId} at ` +
              `${nextRetryAt.toISOString()} ` +
              `(wait=${delay}ms)`,
          );

          await this.sleep(delay);

          continue;
        }

        failures.push(
          `${context.leagueId}: fixture synchronization state ` +
            `${context.fixtureStateKey} is not complete and ` +
            `has no scheduled retry`,
        );

        break;
      }
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
    failedAttempts: number;
  }> {
    let checked = 0;
    let missingSummary = 0;
    let processed = 0;
    let failedAttempts = 0;

    this.logger.log(
      `ESPN STARTUP SUMMARY PHASE started: leagues=${contexts.length}`,
    );

    // ----------------------------------------------------------
    // HARD FIXTURE BARRIER
    //
    // No Summary reconciliation or ESPN Summary request can begin
    // until EVERY fixture synchronization state is complete.
    // ----------------------------------------------------------

    for (const context of contexts) {
      await this.sportsSyncStateService.assertFixtureRefreshComplete(
        context.leagueId,
        context.season,
      );
    }

    // ----------------------------------------------------------
    // SUMMARY STATE RECONCILIATION
    //
    // This reads MongoDB fixtures and creates/reconciles the
    // persistent Summary synchronization ledger.
    //
    // No ESPN Summary API request happens here.
    // ----------------------------------------------------------

    for (const context of contexts) {
      const state = await this.sportsSyncStateService.ensureSummaryRefreshState(
        {
          leagueId: context.leagueId,
          season: context.season,
          priority: context.priority,
          trackingMode: 'HISTORY',
        },
      );

      await this.sportsSyncStateService.resetInterruptedUnits(state.stateKey);

      const incompleteEvents =
        await this.sportsSyncStateService.getIncompleteSummaryEvents(
          state.stateKey,
        );

      checked += state.units.length;
      missingSummary += incompleteEvents.length;

      this.logger.log(
        `Summary state prepared for ${context.leagueId}: ` +
          `fixtures=${state.units.length}, ` +
          `missing=${incompleteEvents.length}`,
      );
    }

    // ----------------------------------------------------------
    // NON-BLOCKING ROUND-ROBIN SUMMARY SCHEDULER
    //
    // Every league gets its turn.
    //
    // A failed league does not block the next league.
    //
    // Failed events are retried when their retry time arrives.
    // ----------------------------------------------------------

    while (true) {
      let allComplete = true;
      let processedWorkThisRound = false;
      let earliestRetryAt: Date | null = null;

      for (const context of contexts) {
        const state = await this.sportsSyncStateService.requireState(
          context.summaryStateKey,
        );

        const dueEvents =
          await this.sportsSyncStateService.getDueIncompleteSummaryEvents(
            state.stateKey,
          );

        // ------------------------------------------------------
        // NOTHING DUE FOR THIS LEAGUE
        // ------------------------------------------------------

        if (dueEvents.length === 0) {
          const complete = await this.sportsSyncStateService.isComplete(
            state.stateKey,
          );

          if (complete) {
            this.logger.log(
              `Summary bootstrap completed for ${context.leagueId}`,
            );

            continue;
          }

          allComplete = false;

          const nextRetryAt =
            await this.sportsSyncStateService.getNextIncompleteSummaryRetryAt(
              state.stateKey,
            );

          if (
            nextRetryAt &&
            (!earliestRetryAt ||
              nextRetryAt.getTime() < earliestRetryAt.getTime())
          ) {
            earliestRetryAt = nextRetryAt;
          }

          continue;
        }

        allComplete = false;
        processedWorkThisRound = true;

        this.logger.log(
          `Summary bootstrap processing ${context.leagueId}: ` +
            `dueEvents=${dueEvents.length}`,
        );

        // ------------------------------------------------------
        // MARK ENTIRE LEAGUE BATCH AS PROCESSING
        // ------------------------------------------------------

        await this.sportsSyncStateService.markSummaryEventsProcessing(
          state.stateKey,
          dueEvents,
        );

        const batchStartedAt = Date.now();

        // ------------------------------------------------------
        // ESPN SUMMARY FETCH
        //
        // IMPORTANT:
        //
        // Whatever getMatchSummary() returns is accepted exactly
        // as returned.
        //
        // There is NO hasSummaryPayload() check here.
        // ------------------------------------------------------

        const batchResults = await this.processSummaryBatch(context, dueEvents);

        const successfulResults = batchResults.filter(
          (result) => result.success,
        );

        const failedResults = batchResults.filter((result) => !result.success);

        this.logger.log(
          `SUMMARY ESPN FETCH PHASE completed for ${context.leagueId}: ` +
            `total=${batchResults.length}, ` +
            `successful=${successfulResults.length}, ` +
            `failed=${failedResults.length}, ` +
            `duration=${Date.now() - batchStartedAt}ms`,
        );

        failedAttempts += failedResults.length;

        // ------------------------------------------------------
        // ONE FIXTURE BULK WRITE FOR THIS LEAGUE
        //
        // Successful ESPN responses are written to:
        //
        //   sports_espn_fixtures.payload.summary
        //
        // No individual fixture write is performed here.
        // ------------------------------------------------------

        let fixtureBulkWriteSucceeded = true;

        if (successfulResults.length > 0) {
          const bulkStartedAt = Date.now();

          try {
            const bulkResult =
              await this.sportsCollectionService.collectEspnMatchSummariesBulk(
                successfulResults.map((result) => ({
                  leagueId: context.leagueId,
                  eventId: result.eventId,
                  summary: result.summary,
                })),
              );

            this.logger.log(
              `SUMMARY fixture bulk write completed for ${context.leagueId}: ` +
                `requested=${bulkResult.requested}, ` +
                `matched=${bulkResult.matched}, ` +
                `modified=${bulkResult.modified}, ` +
                `duration=${Date.now() - bulkStartedAt}ms`,
            );
          } catch (error) {
            fixtureBulkWriteSucceeded = false;

            const message =
              error instanceof Error ? error.message : String(error);

            this.logger.error(
              `SUMMARY fixture bulk write FAILED for ${context.leagueId}: ` +
                `${message}`,
            );

            await this.sportsSyncStateService.markSummaryBulkWriteFailed(
              state.stateKey,
              successfulResults.map((result) => result.eventId),
              error,
            );

            failedAttempts += successfulResults.length;
          }
        }

        // ------------------------------------------------------
        // MARK SUCCESSFUL FETCHES SUCCESSFUL
        //
        // Only do this after fixture persistence succeeds.
        // ------------------------------------------------------

        if (fixtureBulkWriteSucceeded) {
          await Promise.all(
            successfulResults.map((result) =>
              this.sportsSyncStateService.markSummaryEventFetchSuccess(
                state.stateKey,
                result.eventId,
              ),
            ),
          );

          processed += successfulResults.length;
        }

        // ------------------------------------------------------
        // MARK ACTUAL API FAILURES FAILED
        //
        // They receive a retry timestamp inside the sync-state
        // service.
        // ------------------------------------------------------

        await Promise.all(
          failedResults.map((result) =>
            this.sportsSyncStateService.markSummaryEventFetchFailed(
              state.stateKey,
              result.eventId,
              result.error,
            ),
          ),
        );

        // ------------------------------------------------------
        // REFRESH OVERALL STATE
        // ------------------------------------------------------

        await this.sportsSyncStateService.refreshOverallStatus(state.stateKey);

        const complete = await this.sportsSyncStateService.isComplete(
          state.stateKey,
        );

        if (complete) {
          this.logger.log(
            `Summary bootstrap completed for ${context.leagueId}`,
          );

          continue;
        }

        allComplete = false;

        const nextRetryAt =
          await this.sportsSyncStateService.getNextIncompleteSummaryRetryAt(
            state.stateKey,
          );

        if (
          nextRetryAt &&
          (!earliestRetryAt ||
            nextRetryAt.getTime() < earliestRetryAt.getTime())
        ) {
          earliestRetryAt = nextRetryAt;
        }

        this.logger.warn(
          `Summary bootstrap incomplete for ${context.leagueId}; ` +
            `failed/pending events will be retried later.`,
        );
      }

      // --------------------------------------------------------
      // ALL LEAGUES COMPLETE
      // --------------------------------------------------------

      if (allComplete) {
        this.logger.log('ESPN STARTUP SUMMARY PHASE completed successfully');

        return {
          checked,
          missingSummary,
          processed,
          failedAttempts,
        };
      }

      // --------------------------------------------------------
      // WAIT FOR EARLIEST RETRY
      //
      // Every league has already had its turn in this round.
      // --------------------------------------------------------

      if (earliestRetryAt) {
        const delay = Math.max(0, earliestRetryAt.getTime() - Date.now());

        this.logger.log(
          `Summary scheduler waiting for next retry: ` +
            `${earliestRetryAt.toISOString()} ` +
            `(wait=${delay}ms)`,
        );

        await this.sleep(delay);

        continue;
      }

      // --------------------------------------------------------
      // SAFETY FALLBACK
      // --------------------------------------------------------

      if (!processedWorkThisRound) {
        await this.sleep(1000);
      }
    }
  }

  // ============================================================
  // SUMMARY BATCH PROCESSING
  // ============================================================

  private async processSummaryBatch(
    context: StartupLeagueContext,
    eventIds: string[],
  ): Promise<
    Array<{
      eventId: string;
      success: boolean;
      summary?: unknown;
      error?: unknown;
    }>
  > {
    const results: Array<{
      eventId: string;
      success: boolean;
      summary?: unknown;
      error?: unknown;
    }> = [];

    let nextIndex = 0;
    let completed = 0;

    const total = eventIds.length;

    const workerCount = Math.min(this.startupSummaryConcurrency, total);

    const runWorker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;

        if (index >= total) {
          return;
        }

        const eventId = eventIds[index];

        const startedAt = Date.now();

        try {
          // ----------------------------------------------------
          // ACCEPT ESPN RESPONSE AS-IS
          //
          // No response-content validation.
          // No nested "summary" property check.
          // No payload-shape test.
          // ----------------------------------------------------

          const summary = await this.espnService.getMatchSummary(
            context.leagueId,
            eventId,
          );

          completed += 1;

          this.logger.log(
            `SUMMARY FETCH completed: ` +
              `${context.leagueId}/${eventId} ` +
              `duration=${Date.now() - startedAt}ms ` +
              `progress=${completed}/${total}`,
          );

          results.push({
            eventId,
            success: true,
            summary,
          });
        } catch (error) {
          completed += 1;

          this.logger.error(
            `SUMMARY FETCH failed: ` +
              `${context.leagueId}/${eventId} ` +
              `duration=${Date.now() - startedAt}ms ` +
              `progress=${completed}/${total} ` +
              `error=${error instanceof Error ? error.message : String(error)}`,
          );

          results.push({
            eventId,
            success: false,
            error,
          });
        }
      }
    };

    if (workerCount === 0) {
      return results;
    }

    await Promise.all(
      Array.from(
        {
          length: workerCount,
        },
        () => runWorker(),
      ),
    );

    return results;
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
          `Failed to restore normal synchronization state ` +
            `${state.stateKey}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
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
  // SLEEP
  // ============================================================

  private async sleep(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
