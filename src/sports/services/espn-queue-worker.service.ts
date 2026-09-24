import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnService } from '../providers/espn.service';
import { TheOddsApiService } from '../providers/the-odds-api.service';

import { SportsProviderRateLimitService } from './sports-provider-rate-limit.service';
import { SportsCollectionService } from './sports-collection.service';
import { EspnQueueService } from './espn-queue.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
import { PriorityCompetitionService } from './priority-competition.service';
import { YoutubeHighlightService } from './youtube-highlight.service';
import { ActiveCompetitionService } from './active-competition.service';
import { SportsSyncStateService } from './sports-sync-state.service';

import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

import { HeadToHeadService } from './head-to-head.service';
import { MatchDerivedDataService } from './match-derived-data.service';
import { TeamCompetitionStatsService } from './team-competition-stats.service';
import { TeamPerformanceProfileService } from './team-performance-profile.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

@Injectable()
export class EspnQueueWorkerService implements OnModuleInit {
  private readonly logger = new Logger(EspnQueueWorkerService.name);

  private readonly POLL_INTERVAL_MS = 5000;

  private readonly threeHourWindowMs = 3 * 60 * 60 * 1000;

  private readonly queueCleanupIntervalMs = 60 * 60 * 1000;

  private readonly staleRecoveryIntervalMs = 60 * 1000;

  private polling = false;

  private timer?: NodeJS.Timeout;

  private cleanupTimer?: NodeJS.Timeout;

  private lastStaleRecoveryAt = 0;

  constructor(
    private readonly espnService: EspnService,

    private readonly theOddsApiService: TheOddsApiService,

    private readonly sportsProviderRateLimitService: SportsProviderRateLimitService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly priorityCompetitionService: PriorityCompetitionService,

    private readonly youtubeHighlightService: YoutubeHighlightService,

    private readonly teamCompetitionStatsService: TeamCompetitionStatsService,

    private readonly teamPerformanceProfileService: TeamPerformanceProfileService,

    private readonly headToHeadService: HeadToHeadService,

    private readonly matchDerivedDataService: MatchDerivedDataService,

    private readonly activeCompetitionService: ActiveCompetitionService,

    private readonly sportsSyncStateService: SportsSyncStateService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

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

      await this.espnQueueBuilderService.watchThreeHourFixtures();

      await this.processNextJob();
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

  private async processNextJob(params?: {
    jobTypes?: EspnQueueJobType[];
    includeFailed?: boolean;
  }): Promise<void> {
    const job = await this.espnQueueService.getNextJob(params);

    if (!job) {
      return;
    }

    const queueJob = job as unknown as Record<string, unknown>;

    this.logger.debug(
      `Processing ESPN queue job ${String(
        queueJob.jobKey ?? queueJob._id,
      )} (${String(queueJob.type)})`,
    );

    try {
      await this.processJob(queueJob);

      const stateKey = this.getStateKeyFromJob(queueJob);

      const complete = await this.sportsSyncStateService.isComplete(stateKey);

      if (!complete) {
        throw new Error(`Synchronization state ${stateKey} is not complete`);
      }

      await this.espnQueueService.markCompleted(String(queueJob._id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `ESPN queue job ${String(queueJob._id)} failed: ${message}`,
      );

      await this.espnQueueService.markFailed(job, message);
    }
  }

  private async processJob(job: Record<string, unknown>): Promise<void> {
    switch (job.type) {
      case EspnQueueJobType.LEAGUE_REFRESH:
        await this.processLeagueRefresh(job);
        return;

      case EspnQueueJobType.FIXTURE_RECOVERY:
        await this.processFixtureRecovery(job);
        return;

      case EspnQueueJobType.UPCOMING_MATCH:
        await this.processUpcomingMatch(job);
        return;

      case EspnQueueJobType.FINISHED_MATCH:
        await this.processFinishedMatch(job);
        return;

      default:
        throw new Error(`Unsupported ESPN queue job type: ${String(job.type)}`);
    }
  }

  // ============================================================
  // FIXTURE RECOVERY
  // ============================================================

  private async processFixtureRecovery(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId) {
      throw new Error('Fixture recovery job has no leagueId');
    }

    if (typeof job.season !== 'number') {
      throw new Error('Fixture recovery job requires season');
    }

    const leagueId = this.stringifyJobId(job.leagueId);

    const season = job.season;

    const competition =
      await this.activeCompetitionService.getByEspnLeagueSlug(leagueId);

    if (!competition) {
      throw new Error(
        `No ActiveCompetition found for fixture recovery league ${leagueId}`,
      );
    }

    if (
      typeof competition.season !== 'number' ||
      competition.season !== season
    ) {
      throw new Error(
        `ActiveCompetition season mismatch for ${leagueId}: ` +
          `queue=${season}, ` +
          `active=${competition.season ?? 'missing'}`,
      );
    }

    if (!competition.seasonStartDate) {
      throw new Error(`ActiveCompetition ${leagueId} has no seasonStartDate`);
    }

    const stateKey = this.getStateKeyFromJob(job);

    await this.sportsSyncStateService.ensureDateWindow({
      stateKey,

      dateFrom: this.toDateOnly(new Date(competition.seasonStartDate)),

      dateTo: this.toDateOnly(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)),

      trackingMode: 'HISTORY',
    });

    await this.sportsSyncStateService.ensureStepUnits(stateKey, [
      'standings',
      'finishedMatches',
    ]);

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    const incompleteDates =
      await this.sportsSyncStateService.getIncompleteDates(stateKey);

    const failures: string[] = [];

    for (const dateKey of incompleteDates) {
      try {
        await this.processFixtureDate(stateKey, leagueId, dateKey);
      } catch (error) {
        failures.push(
          `${dateKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Fixture recovery still has failed dates for ${leagueId}: ${failures.join(
          '; ',
        )}`,
      );
    }

    await this.runTrackedStep(stateKey, 'standings', async () => {
      const response = await this.espnService.getStandings(leagueId);

      await this.sportsCollectionService.collectEspnStandings(
        leagueId,
        response,
        season,
      );
    });

    await this.runTrackedStep(stateKey, 'finishedMatches', async () => {
      await this.queueMissingFinishedMatchSummaries(
        leagueId,
        season,
        this.getQueuePriority(competition.priority),
      );
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);
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
  // LEAGUE REFRESH
  // ============================================================

  private async processLeagueRefresh(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId) {
      throw new Error('League refresh job has no leagueId');
    }

    if (typeof job.season !== 'number') {
      throw new Error('League refresh job requires season');
    }

    const leagueId = this.stringifyJobId(job.leagueId);

    const season = job.season;

    const stateKey = this.getStateKeyFromJob(job);

    const dateFrom = this.toDateOnly(new Date());

    const dateTo = this.toDateOnly(
      new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    );

    await this.sportsSyncStateService.ensureDateWindow({
      stateKey,

      dateFrom,

      dateTo,

      trackingMode: 'WINDOW',
    });

    await this.sportsSyncStateService.ensureStepUnits(stateKey, ['matchJobs']);

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    const incompleteDates =
      await this.sportsSyncStateService.getIncompleteDates(stateKey);

    const failures: string[] = [];

    for (const dateKey of incompleteDates) {
      try {
        await this.processFixtureDate(stateKey, leagueId, dateKey);
      } catch (error) {
        failures.push(
          `${dateKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `League refresh still has failed dates for ${leagueId}: ${failures.join(
          '; ',
        )}`,
      );
    }

    await this.runTrackedStep(stateKey, 'matchJobs', async () => {
      await this.espnQueueBuilderService.buildLeagueMatchJobs(leagueId, season);

      await this.queueMissingFinishedMatchSummaries(
        leagueId,
        season,
        await this.getLeaguePriority(leagueId),
        dateFrom,
        dateTo,
      );
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);
  }

  // ============================================================
  // UPCOMING MATCH
  // ============================================================

  private async processUpcomingMatch(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId || !job.eventId) {
      throw new Error('Upcoming match job requires leagueId and eventId');
    }

    const leagueId = this.stringifyJobId(job.leagueId);

    const eventId = this.stringifyJobId(job.eventId);

    const stateKey = this.getStateKeyFromJob(job);

    await this.sportsSyncStateService.ensureStepUnits(stateKey, [
      'odds',
      'derivedData',
    ]);

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    await this.runTrackedStep(stateKey, 'odds', async () => {
      await this.processOddsApi(leagueId, eventId);
    });

    await this.runTrackedStep(stateKey, 'derivedData', async () => {
      await this.matchDerivedDataService.rebuildForFixture(eventId);
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);
  }

  // ============================================================
  // FINISHED MATCH
  // ============================================================

  private async processFinishedMatch(
    job: Record<string, unknown>,
  ): Promise<void> {
    if (!job.leagueId || !job.eventId) {
      throw new Error('Finished match job requires leagueId and eventId');
    }

    if (typeof job.season !== 'number') {
      throw new Error('Finished match job requires season');
    }

    const leagueId = this.stringifyJobId(job.leagueId);

    const eventId = this.stringifyJobId(job.eventId);

    const season = job.season;

    const stateKey = this.getStateKeyFromJob(job);

    await this.sportsSyncStateService.ensureStepUnits(stateKey, [
      'summary',
      'standings',
      'teamCompetitionStats',
      'teamPerformanceProfile',
      'headToHead',
      'derivedData',
      'youtube',
    ]);

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    const fixture = await this.espnFixtureModel
      .findOne({
        eventId,
      })
      .lean()
      .exec();

    if (!fixture) {
      throw new Error(
        `Finished match fixture ${eventId} not found in sports_espn_fixtures`,
      );
    }

    const homeTeamId = fixture.homeTeamId?.trim();

    const awayTeamId = fixture.awayTeamId?.trim();

    if (!homeTeamId || !awayTeamId) {
      throw new Error(
        `Finished match fixture ${eventId} is missing homeTeamId or awayTeamId`,
      );
    }

    await this.runTrackedStep(stateKey, 'summary', async () => {
      if (fixture.payload?.summary) {
        return;
      }

      const summary = await this.espnService.getMatchSummary(leagueId, eventId);

      await this.sportsCollectionService.collectEspnMatchSummary({
        leagueId,

        eventId,

        summary,
      });
    });

    await this.runTrackedStep(stateKey, 'standings', async () => {
      const standingsResponse = await this.espnService.getStandings(leagueId);

      await this.sportsCollectionService.collectEspnStandings(
        leagueId,
        standingsResponse,
        season,
      );
    });

    await this.runTrackedStep(stateKey, 'teamCompetitionStats', async () => {
      await this.teamCompetitionStatsService.refreshForFixture(
        leagueId,
        season,
        eventId,
      );
    });

    await this.runTrackedStep(stateKey, 'teamPerformanceProfile', async () => {
      await this.teamPerformanceProfileService.refreshForFixture(eventId);
    });

    await this.runTrackedStep(stateKey, 'headToHead', async () => {
      await this.headToHeadService.refreshForFixture(eventId);
    });

    await this.runTrackedStep(stateKey, 'derivedData', async () => {
      await this.matchDerivedDataService.rebuildUpcomingForTeams(
        leagueId,
        season,
        [homeTeamId, awayTeamId],
      );
    });

    await this.runTrackedStep(stateKey, 'youtube', async () => {
      await this.youtubeHighlightService.processFixture(eventId);
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);
  }

  // ============================================================
  // FINISHED MATCH QUEUEING
  // ============================================================

  private async queueMissingFinishedMatchSummaries(
    leagueId: string,
    season: number,
    priority: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - this.threeHourWindowMs);

    const query: Record<string, unknown> = {
      leagueId,

      season,

      completed: true,

      fixtureDate: {
        $lte: cutoff,
      },

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
    };

    if (dateFrom && dateTo) {
      (query.fixtureDate as Record<string, unknown>).$gte = new Date(
        `${dateFrom}T00:00:00.000Z`,
      );

      (query.fixtureDate as Record<string, unknown>).$lte = new Date(
        `${dateTo}T23:59:59.999Z`,
      );
    }

    const fixtures = await this.espnFixtureModel
      .find(query)
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

      const job = await this.espnQueueService.addFinishedMatchJob({
        leagueId,

        eventId: fixture.eventId,

        season,

        priority,

        scheduledFor: new Date(),
      });

      if (String(job.status) === 'PENDING' && Number(job.attempts ?? 0) === 0) {
        queued += 1;
      }
    }

    if (queued > 0) {
      this.logger.log(`Queued ${queued} FINISHED_MATCH jobs for ${leagueId}`);
    }

    return queued;
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
  // ODDS API
  // ============================================================

  private async processOddsApi(
    leagueId: string,
    eventId: string,
  ): Promise<void> {
    const competition = this.priorityCompetitionService.getById(leagueId);

    if (!competition) {
      return;
    }

    const competitionData = competition as unknown as {
      oddsEnabled?: unknown;

      providers?: {
        oddsApiSportKey?: unknown;
      };
    };

    const oddsEnabled = Boolean(competitionData.oddsEnabled);

    const sportKey = competitionData.providers?.oddsApiSportKey;

    if (!oddsEnabled || typeof sportKey !== 'string' || !sportKey) {
      return;
    }

    const remaining =
      (await this.sportsProviderRateLimitService.getRemainingMonthlyRequests(
        'odds-api',
      )) ?? 0;

    if (remaining <= 0) {
      this.logger.warn(
        'The Odds API monthly quota is exhausted. Skipping request.',
      );

      return;
    }

    const odds = await this.theOddsApiService.getOdds(sportKey, 'eu', [
      'h2h',
      'totals',
      'spreads',
    ]);

    if (odds.length > 0) {
      await this.sportsCollectionService.collectOdds(odds);
    }
  }

  // ============================================================
  // PRIORITY
  // ============================================================

  private getQueuePriority(priority: unknown): number {
    switch (String(priority).toUpperCase()) {
      case 'ELITE':
        return 1;

      case 'HIGH':
        return 2;

      case 'REGIONAL':
        return 3;

      case 'SELECTIVE':
      default:
        return 4;
    }
  }

  private async getLeaguePriority(leagueId: string): Promise<number> {
    const league =
      await this.activeCompetitionService.getByEspnLeagueSlug(leagueId);

    if (!league) {
      return 4;
    }

    return this.getQueuePriority(league.priority);
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
    });
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
