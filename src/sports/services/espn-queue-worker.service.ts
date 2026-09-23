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

  private polling = false;

  private timer?: NodeJS.Timeout;

  private cleanupTimer?: NodeJS.Timeout;

  private startupWaitLogged = false;

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

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  onModuleInit(): void {
    this.logger.log('ESPN queue worker initialized');

    this.scheduleNextPoll(0);
    this.scheduleQueueCleanup();
  }

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

    /*
     * Startup owns the initial recovery decision.
     *
     * Do not allow the worker to consume existing queue jobs
     * before startup has completed catalogue/detail/local-gap
     * inspection.
     */
    if (!this.espnQueueService.isStartupReady()) {
      if (!this.startupWaitLogged) {
        this.logger.log(
          'ESPN queue worker waiting for startup initialization to complete',
        );

        this.startupWaitLogged = true;
      }

      this.scheduleNextPoll();
      return;
    }

    this.startupWaitLogged = false;

    this.polling = true;

    try {
      /*
       * Normal recurring three-hour detection begins only after
       * startup has finished.
       */
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

  private async processNextJob(): Promise<void> {
    const job = await this.espnQueueService.getNextJob();

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

    /*
     * ActiveCompetition contains the authoritative season start
     * discovered during league-detail synchronization.
     *
     * No ESPN request is made here to discover the season.
     */
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
          `queue=${season}, active=${competition.season ?? 'missing'}`,
      );
    }

    if (!competition.seasonStartDate) {
      throw new Error(`ActiveCompetition ${leagueId} has no seasonStartDate`);
    }

    /*
     * THIS is the only point where startup-detected historical
     * fixture recovery enters the expensive ESPN fixture workflow.
     *
     * The collection service will perform:
     *
     * seasonStartDate
     *      ->
     * today + 8 days
     *
     * using its existing ESPN day-by-day request behavior.
     *
     * Startup itself never calls this method.
     */
    const result =
      await this.sportsCollectionService.synchronizeEspnActiveLeague({
        leagueId,
        season,
        seasonStartDate: new Date(competition.seasonStartDate),
      });

    this.logger.log(
      `ESPN fixture recovery completed for ${leagueId}: ` +
        `fixtures=${result.fixturesCollected}, ` +
        `standings=${result.standingsCollected}, ` +
        `range=${result.dateFrom}->${result.dateTo}`,
    );

    /*
     * The recovery may have just inserted historical completed
     * fixtures that have never had their summaries collected.
     *
     * Convert those into normal FINISHED_MATCH jobs.
     */
    await this.queueRecoveredFinishedMatches({
      leagueId,
      season,
      priority: this.getQueuePriority(competition.priority),
      fixtureIds: result.fixtureIds,
    });
  }

  private async queueRecoveredFinishedMatches(params: {
    leagueId: string;
    season: number;
    priority: number;
    fixtureIds: string[];
  }): Promise<void> {
    if (params.fixtureIds.length === 0) {
      return;
    }

    const cutoff = new Date(Date.now() - this.threeHourWindowMs);

    const fixtures = await this.espnFixtureModel
      .find({
        eventId: {
          $in: params.fixtureIds,
        },

        leagueId: params.leagueId,

        season: params.season,

        completed: true,

        fixtureDate: {
          $lte: cutoff,
        },
      })
      .select({
        eventId: 1,
        fixtureDate: 1,
        'payload.summary': 1,
      })
      .lean()
      .exec();

    let queued = 0;

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        continue;
      }

      if (fixture.payload?.summary) {
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

    if (queued > 0) {
      this.logger.log(
        `Queued ${queued} recovered FINISHED_MATCH jobs for ${params.leagueId}`,
      );
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

    const leagueId = this.stringifyJobId(job.leagueId);

    if (typeof job.season !== 'number') {
      throw new Error('League refresh job requires season');
    }

    const season = job.season;

    const result = await this.sportsCollectionService.processEspnLeagueRefresh({
      leagueId,
      season,
    });

    await this.espnQueueBuilderService.buildLeagueMatchJobs(
      leagueId,
      season,
      result.scoreboard,
    );
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

    await this.processOddsApi(leagueId, eventId);
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

    const leagueId = this.stringifyJobId(job.leagueId);
    const eventId = this.stringifyJobId(job.eventId);

    if (typeof job.season !== 'number') {
      throw new Error('Finished match job requires season');
    }

    const season = job.season;

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

    // ========================================================
    // SUMMARY
    // ========================================================

    const summary = await this.espnService.getMatchSummary(leagueId, eventId);

    await this.sportsCollectionService.collectEspnMatchSummary({
      leagueId,
      eventId,
      summary,
    });

    // ========================================================
    // STANDINGS
    // ========================================================

    const standingsResponse = await this.espnService.getStandings(leagueId);

    await this.sportsCollectionService.collectEspnStandings(
      leagueId,
      standingsResponse,
      season,
    );

    await this.teamCompetitionStatsService.refreshForFixture(
      leagueId,
      season,
      eventId,
    );

    await this.teamPerformanceProfileService.refreshForFixture(eventId);

    await this.headToHeadService.refreshForFixture(eventId);

    await this.matchDerivedDataService.rebuildUpcomingForTeams(
      leagueId,
      season,
      [homeTeamId, awayTeamId],
    );

    // ========================================================
    // YOUTUBE
    // ========================================================

    await this.youtubeHighlightService.processFixture(eventId);
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

    await this.matchDerivedDataService.rebuildForFixture(eventId);
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
