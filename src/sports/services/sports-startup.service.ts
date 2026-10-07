// backend/src/sports/services/sports-startup.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueService } from './espn-queue.service';
import { SportsSyncStateService } from './sports-sync-state.service';

import { CompetitionPriority } from '../enums/competition-priority.enum';
import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

import {
  SportsSyncUnitStatus,
  SportsSyncUnitType,
} from '../schemas/sports-sync-state.schema';

import { EspnService } from '../providers/espn.service';

import { SportsCollectionService } from './sports-collection.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
import { EspnQueueWorkerService } from './espn-queue-worker.service';

import { SPORTS_DATA_COLLECTION_CONFIG } from '../config/sports-data-collection.config';

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

  private readonly startupFixtureForwardDays =
    SPORTS_DATA_COLLECTION_CONFIG.ESPN.fixtures.forwardDays;

  /**
   * Maximum number of concurrent Summary requests during the
   * Summary phase. The Summary phase does not begin until the
   * entire Fixture phase has completed.
   */
  private readonly startupSummaryConcurrency =
    SPORTS_DATA_COLLECTION_CONFIG.ESPN.summary.startupConcurrency;

  private readonly startupFixtureConcurrency =
    SPORTS_DATA_COLLECTION_CONFIG.ESPN.fixtures.startupConcurrency;

  private readonly startupSummaryBatchSize =
    SPORTS_DATA_COLLECTION_CONFIG.ESPN.summary.startupBatchSize;

  private readonly startupSummaryPersistenceBatchSize =
    SPORTS_DATA_COLLECTION_CONFIG.ESPN.summary.persistenceBatchSize;

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
        await this.sportsSyncStateService.assertFixtureStartupComplete(
          context.leagueId,
          context.season,
        );
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

      const seasonStartDate = new Date(league.seasonStartDate);

      if (Number.isNaN(seasonStartDate.getTime())) {
        throw new Error(
          `Active league ${league.leagueId} has an invalid seasonStartDate`,
        );
      }

      const todayPlusForwardDays = this.addUtcDays(
        this.startOfUtcDay(new Date()),
        this.startupFixtureForwardDays,
      );

      const configuredSeasonEndDate = league.seasonEndDate
        ? new Date(league.seasonEndDate)
        : undefined;

      const seasonEndDate =
        configuredSeasonEndDate &&
        !Number.isNaN(configuredSeasonEndDate.getTime())
          ? configuredSeasonEndDate
          : todayPlusForwardDays;

      const fixtureDateTo = this.toDateOnly(
        seasonEndDate.getTime() >= todayPlusForwardDays.getTime()
          ? seasonEndDate
          : todayPlusForwardDays,
      );

      const fixtureState =
        await this.sportsSyncStateService.ensureFixtureRefreshState({
          leagueId,
          season: league.season,
          priority,

          dateFrom: this.toDateOnly(seasonStartDate),

          dateTo: fixtureDateTo,

          trackingMode: 'HISTORY',
          granularity: 'MONTH',
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
    this.logger.log(
      `ESPN FIXTURE PHASE started: leagues=${contexts.length}, ` +
        `concurrency=${this.startupFixtureConcurrency}, ` +
        `granularity=MONTH`,
    );

    while (true) {
      const work: Array<{
        context: StartupLeagueContext;
        monthKey: string;
      }> = [];

      /*
       * Fill one bounded global work batch. The worker pool is shared across
       * all leagues so a single league cannot consume more than the available
       * startup concurrency indefinitely.
       */
      for (const context of contexts) {
        if (work.length >= this.startupFixtureConcurrency) {
          break;
        }

        const remaining = this.startupFixtureConcurrency - work.length;
        const dueMonths =
          await this.sportsSyncStateService.getDueIncompleteMonths(
            context.fixtureStateKey,
            remaining,
          );

        for (const monthKey of dueMonths) {
          work.push({
            context,
            monthKey,
          });

          if (work.length >= this.startupFixtureConcurrency) {
            break;
          }
        }
      }

      if (work.length > 0) {
        const startedAt = Date.now();

        const results = await Promise.allSettled(
          work.map(({ context, monthKey }) =>
            this.processFixtureMonth(
              context.fixtureStateKey,
              context.leagueId,
              context.season,
              monthKey,
            ),
          ),
        );

        let succeeded = 0;
        let failed = 0;

        results.forEach((result, index) => {
          const item = work[index];

          if (result.status === 'fulfilled') {
            succeeded += 1;
            return;
          }

          failed += 1;

          this.logger.error(
            `Fixture bootstrap failed for ${item.context.leagueId} ` +
              `${item.monthKey}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
              }. The month will be retried by sync state.`,
          );
        });

        this.logger.log(
          `ESPN fixture startup batch completed: ` +
            `requested=${work.length}, ` +
            `succeeded=${succeeded}, ` +
            `failed=${failed}, ` +
            `duration=${Date.now() - startedAt}ms`,
        );

        continue;
      }

      let allComplete = true;
      let earliestRetryAt: Date | null = null;

      for (const context of contexts) {
        const progress =
          await this.sportsSyncStateService.getFixtureStartupProgress(
            context.fixtureStateKey,
          );

        this.logger.log(
          `ESPN fixture startup progress ${context.leagueId}: ` +
            `${progress.successMonths}/${progress.totalMonths} months ` +
            `(${progress.completionPercent.toFixed(1)}%)`,
        );

        if (!progress.complete) {
          allComplete = false;
        }

        const nextRetryAt =
          await this.sportsSyncStateService.getNextIncompleteMonthRetryAt(
            context.fixtureStateKey,
          );

        if (
          nextRetryAt &&
          (!earliestRetryAt ||
            nextRetryAt.getTime() < earliestRetryAt.getTime())
        ) {
          earliestRetryAt = nextRetryAt;
        }
      }

      if (allComplete) {
        await Promise.all(
          contexts.map((context) =>
            this.sportsSyncStateService.refreshOverallStatus(
              context.fixtureStateKey,
            ),
          ),
        );

        this.logger.log('ESPN FIXTURE PHASE completed successfully');
        return;
      }

      if (earliestRetryAt) {
        const delay = Math.max(0, earliestRetryAt.getTime() - Date.now());

        this.logger.warn(
          `Fixture startup waiting for next retry at ` +
            `${earliestRetryAt.toISOString()} (wait=${delay}ms)`,
        );

        await this.sleep(delay);
        continue;
      }

      await this.sleep(1000);
    }
  }

  private async processFixtureMonth(
    stateKey: string,
    leagueId: string,
    season: number,
    monthKey: string,
  ): Promise<void> {
    await this.sportsSyncStateService.markMonthProcessing(stateKey, monthKey);

    try {
      const response = await this.espnService.getFixturesForMonth(
        leagueId,
        monthKey,
      );

      const seasonScopedResponse = this.filterFixtureResponseToSeason(
        response,
        season,
      );

      await this.sportsCollectionService.collectEspnFixtures(
        leagueId,
        seasonScopedResponse,
      );

      /*
       * A successful ESPN month request is a successful synchronization even
       * when the month contains zero fixtures. This is why MONTH units are
       * not inferred from fixture-document existence.
       */
      await this.sportsSyncStateService.markMonthSuccess(stateKey, monthKey);
    } catch (error) {
      await this.sportsSyncStateService.markMonthFailed(
        stateKey,
        monthKey,
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
      `ESPN STARTUP SUMMARY PHASE started: leagues=${contexts.length}, ` +
        `concurrency=${this.startupSummaryConcurrency}, ` +
        `batchSize=${this.startupSummaryBatchSize}`,
    );

    for (const context of contexts) {
      await this.sportsSyncStateService.assertFixtureStartupComplete(
        context.leagueId,
        context.season,
      );
    }

    /*
     * Reconcile the persistent Summary ledger against the canonical
     * fixture collection. Existing failed/partial work is not attempted
     * again inside startup; it is handed to the normal queue.
     */
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

      const refreshedState = await this.sportsSyncStateService.requireState(
        state.stateKey,
      );

      const summaryUnits = refreshedState.units.filter(
        (unit) =>
          unit.type === SportsSyncUnitType.STEP &&
          typeof unit.stepKey === 'string' &&
          unit.stepKey.startsWith('SUMMARY:'),
      );

      const summaryTotalAttempts =
        SPORTS_DATA_COLLECTION_CONFIG.ESPN.queue.maxAttempts + 1;

      const retryableUnits = summaryUnits.filter(
        (unit) =>
          (unit.status === SportsSyncUnitStatus.PENDING ||
            unit.status === SportsSyncUnitStatus.FAILED) &&
          unit.attempts > 0 &&
          unit.attempts < summaryTotalAttempts,
      );

      const initialUnits = summaryUnits.filter(
        (unit) =>
          unit.status === SportsSyncUnitStatus.PENDING && unit.attempts === 0,
      );

      checked += summaryUnits.length;
      missingSummary += retryableUnits.length + initialUnits.length;

      this.logger.log(
        `Summary state prepared for ${context.leagueId}: ` +
          `fixtures=${summaryUnits.length}, ` +
          `initial=${initialUnits.length}, ` +
          `background=${retryableUnits.length}`,
      );

      /*
       * Existing background work is simply restored into the normal queue.
       * The queue service preserves attempts and backoff for an existing
       * FAILED job, so startup does not reset its retry budget.
       */
      const retryScheduledFor = new Date(
        Date.now() +
          SPORTS_DATA_COLLECTION_CONFIG.ESPN.queue.retryDelayMinutes * 60_000,
      );

      for (const unit of retryableUnits) {
        const eventId = String(unit.stepKey).slice('SUMMARY:'.length);

        if (!eventId) {
          continue;
        }

        await this.espnQueueService.addSummaryRefreshJob({
          leagueId: context.leagueId,
          eventId,
          season: context.season,
          priority: context.priority,
          scheduledFor: retryScheduledFor,
        });
      }
    }

    while (true) {
      const work: Array<{
        context: StartupLeagueContext;
        eventId: string;
      }> = [];

      for (const context of contexts) {
        if (work.length >= this.startupSummaryBatchSize) {
          break;
        }

        const remaining = this.startupSummaryBatchSize - work.length;

        const initialEvents =
          await this.sportsSyncStateService.getInitialSummaryEvents(
            context.summaryStateKey,
            remaining,
          );

        for (const eventId of initialEvents) {
          work.push({
            context,
            eventId,
          });

          if (work.length >= this.startupSummaryBatchSize) {
            break;
          }
        }
      }

      if (work.length === 0) {
        this.logger.log(
          'ESPN STARTUP SUMMARY PHASE completed initial pass. ' +
            'Any failed Summary attempts are now background queue work.',
        );

        return {
          checked,
          missingSummary,
          processed,
          failedAttempts,
        };
      }

      const startedAt = Date.now();

      const processingByStateKey = new Map<string, string[]>();

      for (const item of work) {
        const eventIds =
          processingByStateKey.get(item.context.summaryStateKey) ?? [];
        eventIds.push(item.eventId);
        processingByStateKey.set(item.context.summaryStateKey, eventIds);
      }

      await Promise.all(
        [...processingByStateKey.entries()].map(([stateKey, eventIds]) =>
          this.sportsSyncStateService.markSummaryEventsProcessing(
            stateKey,
            eventIds,
          ),
        ),
      );

      const batchResults = await this.processSummaryBatch(
        work.map((item) => ({
          context: item.context,
          eventId: item.eventId,
        })),
      );

      const successfulResults = batchResults.filter((result) => result.success);

      const failedResults = batchResults.filter((result) => !result.success);

      failedAttempts += failedResults.length;

      const failedForBackgroundQueue = new Map<
        string,
        {
          context: StartupLeagueContext;
          eventId: string;
        }
      >();

      for (const result of failedResults) {
        failedForBackgroundQueue.set(
          `${result.context.summaryStateKey}:${result.eventId}`,
          {
            context: result.context,
            eventId: result.eventId,
          },
        );
      }

      let persistenceFailed = 0;

      for (
        let index = 0;
        index < successfulResults.length;
        index += this.startupSummaryPersistenceBatchSize
      ) {
        const persistenceBatch = successfulResults.slice(
          index,
          index + this.startupSummaryPersistenceBatchSize,
        );

        try {
          const bulkResult =
            await this.sportsCollectionService.collectEspnMatchSummariesBulk(
              persistenceBatch.map((result) => ({
                leagueId: result.context.leagueId,
                eventId: result.eventId,
                summary: result.summary,
              })),
            );

          const groupedSuccess = new Map<string, string[]>();

          for (const result of persistenceBatch) {
            const ids = groupedSuccess.get(result.stateKey) ?? [];
            ids.push(result.eventId);
            groupedSuccess.set(result.stateKey, ids);
          }

          await Promise.all(
            [...groupedSuccess.entries()].map(([stateKey, eventIds]) =>
              this.sportsSyncStateService.markSummaryEventFetchSuccessBatch(
                stateKey,
                eventIds,
              ),
            ),
          );

          processed += persistenceBatch.length;

          this.logger.log(
            `SUMMARY persistence batch completed: ` +
              `requested=${bulkResult.requested}, ` +
              `matched=${bulkResult.matched}, ` +
              `modified=${bulkResult.modified}`,
          );
        } catch (error) {
          persistenceFailed += persistenceBatch.length;
          failedAttempts += persistenceBatch.length;

          const groupedFailure = new Map<string, string[]>();

          for (const result of persistenceBatch) {
            failedForBackgroundQueue.set(
              `${result.stateKey}:${result.eventId}`,
              {
                context: result.context,
                eventId: result.eventId,
              },
            );

            const ids = groupedFailure.get(result.stateKey) ?? [];
            ids.push(result.eventId);
            groupedFailure.set(result.stateKey, ids);
          }

          await Promise.all(
            [...groupedFailure.entries()].map(([stateKey, eventIds]) =>
              this.sportsSyncStateService.markSummaryBulkWriteFailed(
                stateKey,
                eventIds,
                error,
              ),
            ),
          );

          this.logger.error(
            `SUMMARY persistence batch FAILED: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      await Promise.all(
        failedResults.map((result) =>
          this.sportsSyncStateService.markSummaryEventFetchFailed(
            result.stateKey,
            result.eventId,
            result.error,
          ),
        ),
      );

      const backgroundScheduledFor = new Date(
        Date.now() +
          SPORTS_DATA_COLLECTION_CONFIG.ESPN.queue.retryDelayMinutes * 60_000,
      );

      for (const item of failedForBackgroundQueue.values()) {
        await this.espnQueueService.addSummaryRefreshJob({
          leagueId: item.context.leagueId,
          eventId: item.eventId,
          season: item.context.season,
          priority: item.context.priority,
          scheduledFor: backgroundScheduledFor,
        });
      }

      const touchedStateKeys = new Set(
        work.map((item) => item.context.summaryStateKey),
      );

      await Promise.all(
        [...touchedStateKeys].map((stateKey) =>
          this.sportsSyncStateService.refreshOverallStatus(stateKey),
        ),
      );

      this.logger.log(
        `SUMMARY startup batch completed: ` +
          `requested=${batchResults.length}, ` +
          `successful=${successfulResults.length}, ` +
          `persisted=${successfulResults.length - persistenceFailed}, ` +
          `failed=${failedResults.length}, ` +
          `duration=${Date.now() - startedAt}ms`,
      );
    }
  }

  private async processSummaryBatch(
    items: Array<{
      context: StartupLeagueContext;
      eventId: string;
    }>,
  ): Promise<
    Array<{
      stateKey: string;
      leagueId: string;
      eventId: string;
      success: boolean;
      summary?: unknown;
      error?: unknown;
      context: StartupLeagueContext;
    }>
  > {
    const results: Array<{
      stateKey: string;
      leagueId: string;
      eventId: string;
      success: boolean;
      summary?: unknown;
      error?: unknown;
      context: StartupLeagueContext;
    }> = [];

    let nextIndex = 0;
    let completed = 0;

    const total = items.length;
    const workerCount = Math.min(this.startupSummaryConcurrency, total);

    const runWorker = async (): Promise<void> => {
      while (true) {
        const index = nextIndex++;

        if (index >= total) {
          return;
        }

        const item = items[index];
        const startedAt = Date.now();

        try {
          /*
           * IMPORTANT: accept the ESPN Summary response exactly as returned.
           * No summary-content validation is performed after the API call.
           */
          const summary = await this.espnService.getMatchSummary(
            item.context.leagueId,
            item.eventId,
          );

          completed += 1;

          results.push({
            stateKey: item.context.summaryStateKey,
            leagueId: item.context.leagueId,
            eventId: item.eventId,
            success: true,
            summary,
            context: item.context,
          });

          this.logger.log(
            `SUMMARY FETCH completed: ` +
              `${item.context.leagueId}/${item.eventId} ` +
              `duration=${Date.now() - startedAt}ms ` +
              `progress=${completed}/${total}`,
          );
        } catch (error) {
          completed += 1;

          results.push({
            stateKey: item.context.summaryStateKey,
            leagueId: item.context.leagueId,
            eventId: item.eventId,
            success: false,
            error,
            context: item.context,
          });

          this.logger.warn(
            `SUMMARY FETCH failed: ` +
              `${item.context.leagueId}/${item.eventId} ` +
              `duration=${Date.now() - startedAt}ms ` +
              `progress=${completed}/${total} ` +
              `error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    };

    if (workerCount === 0) {
      return results;
    }

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return results;
  }

  private filterFixtureResponseToSeason(
    response: unknown,
    season: number,
  ): unknown {
    if (!response || typeof response !== 'object') {
      return response;
    }

    const record = response as Record<string, unknown>;
    const events = record.events;

    if (!Array.isArray(events)) {
      return response;
    }

    const filteredEvents = events.filter((event) => {
      if (!event || typeof event !== 'object') {
        return false;
      }

      const eventRecord = event as Record<string, unknown>;
      const eventSeason = this.toNumber(
        (eventRecord.season as Record<string, unknown> | undefined)?.year,
      );

      if (eventSeason !== undefined) {
        return eventSeason === season;
      }

      const competitions = eventRecord.competitions;

      if (!Array.isArray(competitions) || !competitions[0]) {
        return true;
      }

      const firstCompetition = competitions[0] as Record<string, unknown>;
      const competitionSeason = this.toNumber(
        (firstCompetition.season as Record<string, unknown> | undefined)?.year,
      );

      return competitionSeason === undefined || competitionSeason === season;
    });

    return {
      ...record,
      events: filteredEvents,
    };
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());

      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
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
