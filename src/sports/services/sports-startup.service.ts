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
   * Summary requests are performed concurrently inside one league.
   *
   * The league itself remains sequential:
   *
   *   league 1 -> all summaries -> bulk write
   *   league 2 -> all summaries -> bulk write
   *   ...
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
      //
      // Catalogue/detail synchronization is complete.
      // The active competition collection is now the authoritative
      // source for which leagues participate in startup sync.
      // --------------------------------------------------------

      const activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Preparing ESPN startup pipeline for ${activeLeagues.length} active leagues`,
      );

      // --------------------------------------------------------
      // PREPARE FIXTURE SYNCHRONIZATION STATES
      //
      // IMPORTANT:
      //
      // This phase prepares ONLY FIXTURE_REFRESH state.
      //
      // SUMMARY_REFRESH state is intentionally NOT created or
      // reconciled here.
      //
      // Summary begins only after the complete fixture phase.
      // --------------------------------------------------------

      const leagueContexts = await this.prepareLeagueContexts(activeLeagues);

      this.logger.log(
        `ESPN fixture synchronization states prepared: leagues=${leagueContexts.length}`,
      );

      // --------------------------------------------------------
      // PHASE 3
      // FIXTURE COLLECTION
      //
      // Every active league must complete its fixture state before
      // startup is allowed to enter the Summary phase.
      // --------------------------------------------------------

      await this.runFixturePhase(leagueContexts);

      this.logger.log('ESPN FIXTURE PHASE completed. Moving to SUMMARY PHASE.');

      // --------------------------------------------------------
      // PHASE 4
      // SUMMARY COLLECTION
      //
      // runStartupSummaryPhase() contains a hard fixture-completion
      // barrier before it creates/reconciles any Summary state.
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
      // This is the ONLY synchronization state that is created or
      // reconciled during preparation.
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
      // DO NOT call ensureSummaryRefreshState() here.
      //
      // We only calculate the persistent key that will be used
      // after the fixture phase has completed.
      //
      // This means no Summary state is read, created, reconciled,
      // or populated before fixtures are complete.
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
              `Fixture bootstrap failed for ${context.leagueId} ${dateKey}: ` +
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

        /*
         * The state is incomplete, but there is no retryable date
         * and no future retry scheduled.
         *
         * This indicates an unexpected synchronization state.
         */
        failures.push(
          `${context.leagueId}: fixture synchronization state ` +
            `${context.fixtureStateKey} is not complete and has no scheduled retry`,
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
    // HARD PHASE BARRIER
    //
    // Every league must have completed its fixture phase before
    // Summary reconciliation can begin.
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
    // Build/reconcile the persistent Summary ledger for every
    // league before beginning collection.
    //
    // IMPORTANT:
    //
    // We reconcile ALL leagues first.
    // A failure in one league cannot prevent another league from
    // entering the Summary phase.
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
          `checked=${state.units.length}, ` +
          `missing=${incompleteEvents.length}`,
      );
    }

    // ----------------------------------------------------------
    // NON-BLOCKING LEAGUE SCHEDULER
    //
    // One pass processes every league that currently has work due.
    //
    // Failed events are NOT fatal.
    //
    // After all leagues have had their turn, the scheduler waits
    // for the earliest retry time and starts another pass.
    //
    // Therefore:
    //
    //   League A failure
    //        ↓
    //   League B continues
    //        ↓
    //   League C continues
    //        ↓
    //   retry League A when due
    // ----------------------------------------------------------

    while (true) {
      let allComplete = true;

      let roundProcessedWork = false;

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
        // Nothing currently due for this league.
        //
        // It may already be complete, or it may simply have
        // failed events waiting for their retry timestamp.
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

          if (nextRetryAt) {
            if (
              !earliestRetryAt ||
              nextRetryAt.getTime() < earliestRetryAt.getTime()
            ) {
              earliestRetryAt = nextRetryAt;
            }
          }

          continue;
        }

        allComplete = false;

        roundProcessedWork = true;

        this.logger.log(
          `Summary bootstrap processing ${context.leagueId}: ` +
            `dueEvents=${dueEvents.length}`,
        );

        // ------------------------------------------------------
        // Mark the entire current league batch PROCESSING.
        // ------------------------------------------------------

        await this.sportsSyncStateService.markSummaryEventsProcessing(
          state.stateKey,
          dueEvents,
        );

        const batchStartedAt = Date.now();

        // ------------------------------------------------------
        // FETCH ALL DUE EVENTS FOR THIS LEAGUE
        //
        // processSummaryBatch() uses 4 concurrent workers.
        //
        // A failure on one event is isolated and does not stop
        // another event from being requested.
        // ------------------------------------------------------

        const batchResults = await this.processSummaryBatch(
          context,
          state.stateKey,
          dueEvents,
        );

        const successfulResults = batchResults.filter(
          (result) => result.success && result.summary !== undefined,
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
        // BULK WRITE
        //
        // All successful Summary responses for THIS league are
        // persisted in one MongoDB bulk operation.
        //
        // A bulk-write failure is also isolated to this league.
        // It must not stop the next league from processing.
        // ------------------------------------------------------

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

            /*
             * Only successful fetches whose canonical MongoDB write
             * succeeded count as processed.
             */
            processed += successfulResults.length;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);

            this.logger.error(
              `SUMMARY fixture bulk write FAILED for ${context.leagueId}: ` +
                `${message}`,
            );

            /*
             * The ESPN calls succeeded, but canonical persistence
             * failed.
             *
             * Return those events to FAILED so they can be retried
             * during a later scheduler round.
             */
            await this.sportsSyncStateService.markSummaryBulkWriteFailed(
              state.stateKey,

              successfulResults.map((result) => result.eventId),

              error,
            );

            failedAttempts += successfulResults.length;
          }
        }

        // ------------------------------------------------------
        // RECALCULATE THE LEAGUE STATE
        // ------------------------------------------------------

        await this.sportsSyncStateService.refreshOverallStatus(state.stateKey);

        const complete = await this.sportsSyncStateService.isComplete(
          state.stateKey,
        );

        if (complete) {
          this.logger.log(
            `Summary bootstrap completed for ${context.leagueId}`,
          );
        } else {
          /*
           * This league still has failed/pending work.
           *
           * DO NOT throw.
           *
           * The scheduler immediately moves to the next league.
           */
          const nextRetryAt =
            await this.sportsSyncStateService.getNextIncompleteSummaryRetryAt(
              state.stateKey,
            );

          if (nextRetryAt) {
            if (
              !earliestRetryAt ||
              nextRetryAt.getTime() < earliestRetryAt.getTime()
            ) {
              earliestRetryAt = nextRetryAt;
            }

            this.logger.warn(
              `Summary retry scheduled for ${context.leagueId} at ` +
                `${nextRetryAt.toISOString()}`,
            );
          } else {
            const stillIncomplete =
              await this.sportsSyncStateService.getIncompleteSummaryEvents(
                state.stateKey,
              );

            if (stillIncomplete.length > 0) {
              this.logger.warn(
                `Summary synchronization remains incomplete for ` +
                  `${context.leagueId}: ` +
                  `remaining=${stillIncomplete.length}. ` +
                  `The scheduler will continue processing other leagues.`,
              );
            }
          }
        }
      }

      // ----------------------------------------------------------
      // ALL LEAGUES COMPLETE
      // ----------------------------------------------------------

      if (allComplete) {
        this.logger.log('ESPN STARTUP SUMMARY PHASE completed successfully');

        return {
          checked,

          missingSummary,

          processed,

          failedAttempts,
        };
      }

      // ----------------------------------------------------------
      // WAIT FOR THE EARLIEST RETRY
      //
      // We only wait after every league has had its current turn.
      //
      // This is what makes the scheduler non-blocking across leagues.
      // ----------------------------------------------------------

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

      // ----------------------------------------------------------
      // SAFETY FALLBACK
      //
      // There is still incomplete work but no retry timestamp.
      // This should only happen for an unexpected state transition.
      // Avoid a tight CPU loop.
      // ----------------------------------------------------------

      if (!roundProcessedWork) {
        this.logger.warn(
          'Summary scheduler found incomplete work without a retry timestamp. ' +
            'Retrying state inspection shortly.',
        );

        await this.sleep(1000);
      }
    }
  }

  // ============================================================
  // SUMMARY BATCH PROCESSING
  // ============================================================

  private async processSummaryBatch(
    context: StartupLeagueContext,
    stateKey: string,
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
          const summary = await this.espnService.getMatchSummary(
            context.leagueId,
            eventId,
          );

          const duration = Date.now() - startedAt;

          /*
           * A completed HTTP/API request without a usable Summary
           * is not a successful synchronization result.
           */
          if (!this.hasSummaryPayload(summary)) {
            throw new Error(
              `ESPN returned no usable summary for event ${eventId}`,
            );
          }

          completed += 1;

          this.logger.log(
            `SUMMARY FETCH completed: ` +
              `${context.leagueId}/${eventId} ` +
              `duration=${duration}ms ` +
              `progress=${completed}/${total}`,
          );

          try {
            await this.sportsSyncStateService.markSummaryEventFetchSuccess(
              stateKey,
              eventId,
            );
          } catch (stateError) {
            this.logger.error(
              `Failed to record Summary fetch success for ` +
                `${context.leagueId}/${eventId}: ${
                  stateError instanceof Error
                    ? stateError.message
                    : String(stateError)
                }`,
            );
          }

          results.push({
            eventId,

            success: true,

            summary,
          });
        } catch (error) {
          const duration = Date.now() - startedAt;

          completed += 1;

          const message =
            error instanceof Error ? error.message : String(error);

          this.logger.error(
            `SUMMARY FETCH failed: ` +
              `${context.leagueId}/${eventId} ` +
              `duration=${duration}ms ` +
              `progress=${completed}/${total} ` +
              `error=${message}`,
          );

          try {
            await this.sportsSyncStateService.markSummaryEventFetchFailed(
              stateKey,
              eventId,
              error,
            );
          } catch (stateError) {
            this.logger.error(
              `Failed to record Summary fetch failure for ` +
                `${context.leagueId}/${eventId}: ${
                  stateError instanceof Error
                    ? stateError.message
                    : String(stateError)
                }`,
            );
          }

          results.push({
            eventId,

            success: false,

            error,
          });
        }
      }
    };

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
  // SUMMARY
  // ============================================================

  private hasSummaryPayload(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const record = payload as Record<string, unknown>;

    const summary = record.summary;

    return Boolean(
      summary &&
      typeof summary === 'object' &&
      Object.keys(summary as Record<string, unknown>).length > 0,
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

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
