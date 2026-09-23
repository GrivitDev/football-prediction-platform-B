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

  private polling = false;

  private timer?: NodeJS.Timeout;

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

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  onModuleInit(): void {
    this.logger.log('ESPN queue worker initialized');

    this.scheduleNextPoll(0);
  }

  private scheduleNextPoll(delay = this.POLL_INTERVAL_MS): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.poll();
    }, delay);
  }

  private async poll(): Promise<void> {
    if (this.polling) {
      this.scheduleNextPoll();
      return;
    }

    this.polling = true;

    try {
      /*
       * The three-hour check is part of the normal
       * five-second worker cycle.
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
      throw new Error('Finished match job requires season');
    }

    const season = job.season;

    /*
     * Exactly one provider operation here:
     *
     * scoreboard yesterday -> today + 6 days
     *
     * The collection service only updates fixtures.
     */
    const result = await this.sportsCollectionService.processEspnLeagueRefresh({
      leagueId,
      season,
    });

    /*
     * The returned scoreboard then determines:
     *
     * UPCOMING_MATCH
     * FINISHED_MATCH
     */
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

    /*
     * UPCOMING_MATCH = ODDS ONLY.
     *
     * No match endpoint.
     * No summary.
     * No standings.
     * No YouTube.
     */
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

    /*
     * The scoreboard already supplied the final fixture.
     *
     * There is no getMatch() request.
     */

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

    /*
     * Standings are league-level data.
     *
     * FINISHED_MATCH refreshes the owning league's standings.
     */
    const standingsResponse = await this.espnService.getStandings(leagueId);

    await this.sportsCollectionService.collectEspnStandings(
      leagueId,
      standingsResponse,
      typeof job.season === 'number' ? job.season : undefined,
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

    /*
     * One Odds API request.
     *
     * Only the required football prediction markets
     * currently requested by the project are included.
     */
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
