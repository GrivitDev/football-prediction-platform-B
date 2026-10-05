// backend/src/sports/services/espn-queue-worker.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { EspnService } from '../providers/espn.service';

import { SportsCollectionService } from './sports-collection.service';
import { EspnQueueService } from './espn-queue.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
import { YoutubeHighlightService } from './youtube-highlight.service';
import { ActiveCompetitionService } from './active-competition.service';
import { SportsSyncStateService } from './sports-sync-state.service';

import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class EspnQueueWorkerService implements OnModuleInit {
  private readonly logger = new Logger(EspnQueueWorkerService.name);

  private readonly POLL_INTERVAL_MS = 5000;

  private readonly queueCleanupIntervalMs = 60 * 60 * 1000;

  private readonly staleRecoveryIntervalMs = 60 * 1000;

  private readonly summaryQueueBuildIntervalMs = 60 * 1000;

  private readonly youtubeQueueBuildIntervalMs = 60 * 1000;

  private readonly staleFixtureQueueBuildIntervalMs = 15 * 60 * 1000;

  private readonly normalJobConcurrency = 10;

  private readonly fixtureDayConcurrency = 9;

  private polling = false;

  private timer?: NodeJS.Timeout;

  private cleanupTimer?: NodeJS.Timeout;

  private lastStaleRecoveryAt = 0;

  private lastSummaryQueueBuildAt = 0;

  private lastYoutubeQueueBuildAt = 0;

  private lastStaleFixtureQueueBuildAt = 0;

  constructor(
    private readonly espnService: EspnService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly youtubeHighlightService: YoutubeHighlightService,

    private readonly activeCompetitionService: ActiveCompetitionService,

    private readonly sportsSyncStateService: SportsSyncStateService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  // ============================================================
  // MODULE INIT
  // ============================================================

  onModuleInit(): void {
    this.logger.log(
      'ESPN queue worker initialized and waiting for startup release',
    );
  }

  start(): void {
    if (this.timer || this.cleanupTimer) {
      return;
    }

    this.logger.log(
      'ESPN queue worker released. Starting normal queue processing.',
    );

    this.scheduleNextPoll(0);

    this.scheduleQueueCleanup();
  }

  // ============================================================
  // POLLING
  // ============================================================

  private scheduleNextPoll(delay = this.POLL_INTERVAL_MS): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.poll();
    }, delay);
  }

  private scheduleQueueCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    this.cleanupTimer = setTimeout(() => {
      void this.cleanupCompletedQueueJobs();
    }, this.queueCleanupIntervalMs);
  }

  private async cleanupCompletedQueueJobs(): Promise<void> {
    try {
      const deleted = await this.espnQueueService.cleanupCompletedJobs(7);

      if (deleted > 0) {
        this.logger.log(
          `Removed ${deleted} completed ESPN queue jobs older than 7 days`,
        );
      }
    } catch (error) {
      this.logger.error(
        `ESPN queue cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.scheduleQueueCleanup();
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      this.scheduleNextPoll();

      return;
    }

    if (!this.espnQueueService.isNormalOperationsReady()) {
      this.scheduleNextPoll();

      return;
    }

    this.polling = true;

    try {
      await this.recoverStaleJobsIfDue();

      await this.buildNormalQueueWorkIfDue();

      await this.processNextJobs(this.normalJobConcurrency);
    } catch (error) {
      this.logger.error(
        `ESPN queue polling failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.polling = false;

      this.scheduleNextPoll();
    }
  }

  private async buildNormalQueueWorkIfDue(): Promise<void> {
    const now = Date.now();

    if (
      now - this.lastSummaryQueueBuildAt >=
      this.summaryQueueBuildIntervalMs
    ) {
      this.lastSummaryQueueBuildAt = now;

      try {
        const result =
          await this.espnQueueBuilderService.buildSummaryRefreshQueue();

        if (result.queued > 0) {
          this.logger.log(
            `Queued ${result.queued} SUMMARY_REFRESH jobs ` +
              `(upcoming checked=${result.upcomingChecked}, ` +
              `finished checked=${result.finishedChecked})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `ESPN Summary queue discovery failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (
      now - this.lastYoutubeQueueBuildAt >=
      this.youtubeQueueBuildIntervalMs
    ) {
      this.lastYoutubeQueueBuildAt = now;

      try {
        const result =
          await this.espnQueueBuilderService.buildYoutubeHighlightQueue();

        if (result.queued > 0) {
          this.logger.log(
            `Queued ${result.queued} YOUTUBE_HIGHLIGHT jobs ` +
              `(eligible=${result.eligible}, checked=${result.checked})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `ESPN YouTube highlight queue discovery failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (
      now - this.lastStaleFixtureQueueBuildAt >=
      this.staleFixtureQueueBuildIntervalMs
    ) {
      this.lastStaleFixtureQueueBuildAt = now;

      try {
        const result =
          await this.espnQueueBuilderService.buildStaleFixtureRefreshQueue();

        if (result.queued > 0) {
          this.logger.log(`Queued ${result.queued} stale FIXTURE_REFRESH jobs`);
        }
      } catch (error) {
        this.logger.error(
          `ESPN stale fixture queue discovery failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  // ============================================================
  // STALE RECOVERY
  // ============================================================

  private async recoverStaleJobsIfDue(): Promise<void> {
    const now = Date.now();

    if (now - this.lastStaleRecoveryAt < this.staleRecoveryIntervalMs) {
      return;
    }

    this.lastStaleRecoveryAt = now;

    try {
      const recovered = await this.espnQueueService.recoverStaleJobs(15);

      if (recovered > 0) {
        this.logger.warn(`Recovered ${recovered} stale ESPN queue jobs`);
      }
    } catch (error) {
      this.logger.error(
        `ESPN stale queue recovery failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ============================================================
  // JOB EXECUTION
  // ============================================================

  private async processNextJobs(
    concurrency: number,
    params?: {
      jobTypes?: EspnQueueJobType[];
      includeFailed?: boolean;
    },
  ): Promise<void> {
    const workerCount = Math.max(
      1,
      Math.min(concurrency, this.normalJobConcurrency),
    );

    const runWorker = async (): Promise<void> => {
      while (true) {
        const processed = await this.processNextJob(params);

        if (!processed) {
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  private async processNextJob(params?: {
    jobTypes?: EspnQueueJobType[];
    includeFailed?: boolean;
  }): Promise<boolean> {
    const job = await this.espnQueueService.getNextJob(params);

    if (!job) {
      return false;
    }

    const queueJob = job as unknown as Record<string, unknown>;

    this.logger.debug(
      `Processing ESPN queue job ${String(
        queueJob.jobKey ?? queueJob._id,
      )} (${String(queueJob.type)})`,
    );

    try {
      await this.processJob(queueJob);

      switch (queueJob.type) {
        case EspnQueueJobType.FIXTURE_REFRESH: {
          const stateKey = this.getStateKeyFromJob(queueJob);
          const complete =
            await this.sportsSyncStateService.isComplete(stateKey);

          if (!complete) {
            throw new Error(
              `Synchronization state ${stateKey} is not complete`,
            );
          }

          break;
        }

        case EspnQueueJobType.SUMMARY_REFRESH: {
          const stateKey = this.getStateKeyFromJob(queueJob);

          if (!queueJob.eventId) {
            throw new Error(
              'Summary refresh queue job has no eventId after processing',
            );
          }

          const eventId = this.stringifyJobId(queueJob.eventId);

          const successful =
            await this.sportsSyncStateService.isSummaryEventSuccessful(
              stateKey,
              eventId,
            );

          if (!successful) {
            throw new Error(
              `Summary synchronization for ${eventId} is not complete in ${stateKey}`,
            );
          }

          break;
        }

        case EspnQueueJobType.YOUTUBE_HIGHLIGHT:
          break;

        default:
          break;
      }

      await this.espnQueueService.markCompleted(String(queueJob._id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `ESPN queue job ${String(queueJob._id)} failed: ${message}`,
      );

      await this.espnQueueService.markFailed(job, message);
    }

    return true;
  }

  private async processJob(job: Record<string, unknown>): Promise<void> {
    switch (job.type) {
      case EspnQueueJobType.FIXTURE_REFRESH:
        await this.processFixtureRefresh(job);
        return;

      case EspnQueueJobType.SUMMARY_REFRESH:
        await this.processSummaryRefresh(job);
        return;

      case EspnQueueJobType.YOUTUBE_HIGHLIGHT:
        await this.processYoutubeHighlight(job);
        return;

      default:
        throw new Error(`Unsupported ESPN queue job type: ${String(job.type)}`);
    }
  }

  // ============================================================
  // FIXTURE REFRESH
  // ============================================================

  private async processFixtureRefresh(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId) {
      throw new Error('Fixture refresh job has no leagueId');
    }

    if (typeof job.season !== 'number') {
      throw new Error('Fixture refresh job requires season');
    }

    const leagueId = this.stringifyJobId(job.leagueId);
    const season = job.season;

    const competition =
      await this.activeCompetitionService.getByEspnLeagueSlug(leagueId);

    if (!competition) {
      throw new Error(
        `No ActiveCompetition found for fixture refresh league ${leagueId}`,
      );
    }

    if (
      typeof competition.season !== 'number' ||
      competition.season !== season
    ) {
      throw new Error(
        `ActiveCompetition season mismatch for ${leagueId}: ` +
          `queue=${season}, active=${competition.season ?? 'missing'}`,
      );
    }

    const priority =
      typeof job.priority === 'number' && Number.isFinite(job.priority)
        ? job.priority
        : 4;

    const forwardDays =
      this.espnQueueBuilderService.getFixtureRefreshForwardDays();

    let dateFrom = this.toDateOnly(new Date());
    let dateTo = this.toDateOnly(
      new Date(Date.now() + forwardDays * 24 * 60 * 60 * 1000),
    );

    const triggerEventId = String(job.triggerEventId ?? '');

    let forcedFinishedDate: string | undefined;

    if (triggerEventId.startsWith('FINISHED:')) {
      const eventId = triggerEventId.slice('FINISHED:'.length).trim();

      if (eventId) {
        const finishedFixture = await this.espnFixtureModel
          .findOne({ eventId })
          .select({ fixtureDate: 1, season: 1 })
          .lean()
          .exec();

        if (
          finishedFixture?.fixtureDate &&
          (!finishedFixture.season || finishedFixture.season === season)
        ) {
          const finishedDate = new Date(finishedFixture.fixtureDate);

          if (!Number.isNaN(finishedDate.getTime())) {
            forcedFinishedDate = this.toDateOnly(finishedDate);
            dateFrom = forcedFinishedDate;
            dateTo = forcedFinishedDate;
          }
        }
      }
    }

    const state = await this.sportsSyncStateService.ensureFixtureRefreshState({
      leagueId,
      season,
      priority,
      dateFrom,
      dateTo,
      trackingMode: 'WINDOW',
      granularity: 'DAY',
    });

    const canonicalStateKey = state.stateKey;

    await this.sportsSyncStateService.resetInterruptedUnits(canonicalStateKey);

    if (forcedFinishedDate) {
      await this.sportsSyncStateService.resetDateForRefresh(
        canonicalStateKey,
        forcedFinishedDate,
      );
    }

    const incompleteDates =
      await this.sportsSyncStateService.getIncompleteDates(canonicalStateKey);

    const failures: string[] = [];

    for (
      let index = 0;
      index < incompleteDates.length;
      index += this.fixtureDayConcurrency
    ) {
      const batch = incompleteDates.slice(
        index,
        index + this.fixtureDayConcurrency,
      );

      const results = await Promise.allSettled(
        batch.map((dateKey) =>
          this.processFixtureDate(canonicalStateKey, leagueId, dateKey),
        ),
      );

      results.forEach((result, resultIndex) => {
        if (result.status === 'rejected') {
          failures.push(
            `${batch[resultIndex]}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          );
        }
      });
    }

    if (failures.length > 0) {
      throw new Error(
        `Fixture refresh still has failed dates for ${leagueId}: ${failures.join(
          '; ',
        )}`,
      );
    }

    await this.sportsSyncStateService.refreshOverallStatus(canonicalStateKey);
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
  // SUMMARY REFRESH
  // ============================================================

  private async processSummaryRefresh(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId || !job.eventId) {
      throw new Error('Summary refresh job requires leagueId and eventId');
    }

    if (typeof job.season !== 'number') {
      throw new Error('Summary refresh job requires season');
    }

    const season = job.season;
    const leagueId = this.stringifyJobId(job.leagueId);
    const eventId = this.stringifyJobId(job.eventId);

    const priority =
      typeof job.priority === 'number' && Number.isFinite(job.priority)
        ? job.priority
        : 4;

    /*
     * Normal event-driven Summary refresh must NOT reconcile every fixture
     * in the league/season. Startup performs that expensive reconciliation;
     * normal operation tracks only the specific event being processed.
     */
    const currentFixture = await this.espnFixtureModel
      .findOne({
        eventId,
        leagueId,
        season,
      })
      .select({
        eventId: 1,
        'payload.summary': 1,
      })
      .lean()
      .exec();

    if (!currentFixture) {
      throw new Error(
        `Summary refresh fixture ${eventId} not found in sports_espn_fixtures`,
      );
    }

    const hasSummary = this.hasSummary(currentFixture);

    const state = await this.sportsSyncStateService.ensureSummaryEventState({
      leagueId,
      season,
      eventId,
      priority,
      hasSummary,
      trackingMode: 'WINDOW',
    });

    const stateKey = state.stateKey;

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    const summaryStepKey =
      this.sportsSyncStateService.getSummaryStepKey(eventId);

    await this.runTrackedStep(stateKey, summaryStepKey, async () => {
      /*
       * The sync-state reconciliation above already confirmed whether the
       * Summary exists. Do not perform another content check after ESPN
       * responds. Persist the response exactly as returned.
       */
      const summary = await this.espnService.getMatchSummary(leagueId, eventId);

      await this.sportsCollectionService.collectEspnMatchSummary({
        leagueId,
        eventId,
        summary,
      });
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);
  }

  // ============================================================
  // YOUTUBE HIGHLIGHT
  // ============================================================

  private async processYoutubeHighlight(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId || !job.eventId) {
      throw new Error('YouTube highlight job requires leagueId and eventId');
    }

    if (typeof job.season !== 'number') {
      throw new Error('YouTube highlight job requires season');
    }

    const eventId = this.stringifyJobId(job.eventId);

    /*
     * YouTube is intentionally not represented in SportsSyncState.
     *
     * The operational queue owns the job and its retries.
     */
    await this.youtubeHighlightService.processFixture(eventId);
  }

  // ============================================================
  // TRACKED STEP EXECUTION
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
  // STATE KEY
  // ============================================================

  private getStateKeyFromJob(job: Record<string, unknown>): string {
    if (!job.type) {
      throw new Error('Queue job has no type');
    }

    if (!job.leagueId) {
      throw new Error('Queue job has no leagueId');
    }

    return this.sportsSyncStateService.getQueueStateKey({
      jobType: this.stringifyJobId(job.type),

      leagueId: this.stringifyJobId(job.leagueId),

      season: typeof job.season === 'number' ? job.season : undefined,

      eventId: job.eventId ? this.stringifyJobId(job.eventId) : undefined,

      triggerEventId: job.triggerEventId
        ? this.stringifyJobId(job.triggerEventId)
        : undefined,

      queueJobKey: job.jobKey ? this.stringifyJobId(job.jobKey) : undefined,
    });
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

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // ============================================================
  // JOB ID
  // ============================================================

  private stringifyJobId(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }

    if (value && typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;

      if (typeof objectValue['$oid'] === 'string') {
        return objectValue['$oid'];
      }

      if (typeof objectValue['toHexString'] === 'function') {
        return (objectValue['toHexString'] as () => string)();
      }

      const stringValue = Reflect.get(objectValue, 'toString');

      if (
        typeof stringValue === 'function' &&
        stringValue !== Object.prototype.toString
      ) {
        const result = Reflect.apply(stringValue, value, []) as unknown;

        if (typeof result === 'string') {
          return result;
        }
      }
    }

    throw new Error('Job ID must be a string, number, or identifiable object');
  }
}
