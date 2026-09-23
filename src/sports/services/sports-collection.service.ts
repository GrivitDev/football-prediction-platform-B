import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnService } from '../providers/espn.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import {
  EspnStanding,
  EspnStandingDocument,
} from '../schemas/espn/espn-standing.schema';

import { EspnTeam, EspnTeamDocument } from '../schemas/espn/espn-team.schema';

import {
  FootballDataCompetition,
  FootballDataCompetitionDocument,
} from '../schemas/football-data/football-data-competition.schema';

import {
  FootballDataMatch,
  FootballDataMatchDocument,
} from '../schemas/football-data/football-data-match.schema';

import {
  FootballDataStanding,
  FootballDataStandingDocument,
} from '../schemas/football-data/football-data-standing.schema';

import {
  FootballDataTeam,
  FootballDataTeamDocument,
} from '../schemas/football-data/football-data-team.schema';

import {
  OddsApiSport,
  OddsApiSportDocument,
} from '../schemas/odds-api-sport.schema';

import {
  SportsOddsSnapshot,
  SportsOddsSnapshotDocument,
} from '../schemas/sports-odds-snapshot.schema';

import {
  FootballDataCompetition as FootballDataCompetitionPayload,
  FootballDataMatch as FootballDataMatchPayload,
  FootballDataStandingTable,
  FootballDataTeam as FootballDataTeamPayload,
} from '../providers/football-data.interfaces';

import {
  OddsApiSport as OddsApiSportPayload,
  OddsApiEventOdds,
} from '../providers/the-odds-api.interfaces';
import {
  EspnNewsResponse,
  EspnStandingEntry,
  EspnStandingsResponse,
} from '../providers/espn.interfaces';
import { EspnNews, EspnNewsDocument } from '../schemas/espn/espn-news.schema';

@Injectable()
export class SportsCollectionService {
  private readonly logger = new Logger(SportsCollectionService.name);

  private readonly STARTUP_FIXTURE_FORWARD_DAYS = 4;

  private readonly LEAGUE_REFRESH_PAST_DAYS = 0;

  private readonly LEAGUE_REFRESH_FORWARD_DAYS = 8;

  constructor(
    private readonly espnService: EspnService,

    // ----------------------------------------------------------
    // ESPN
    // ----------------------------------------------------------

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(EspnStanding.name)
    private readonly espnStandingModel: Model<EspnStandingDocument>,

    @InjectModel(EspnTeam.name)
    private readonly espnTeamModel: Model<EspnTeamDocument>,

    @InjectModel(EspnNews.name)
    private readonly espnNewsModel: Model<EspnNewsDocument>,

    // ----------------------------------------------------------
    // Football-Data
    // ----------------------------------------------------------

    @InjectModel(FootballDataCompetition.name)
    private readonly footballDataCompetitionModel: Model<FootballDataCompetitionDocument>,

    @InjectModel(FootballDataMatch.name)
    private readonly footballDataMatchModel: Model<FootballDataMatchDocument>,

    @InjectModel(FootballDataStanding.name)
    private readonly footballDataStandingModel: Model<FootballDataStandingDocument>,

    @InjectModel(FootballDataTeam.name)
    private readonly footballDataTeamModel: Model<FootballDataTeamDocument>,

    // ----------------------------------------------------------
    // Odds API
    // ----------------------------------------------------------

    @InjectModel(OddsApiSport.name)
    private readonly oddsApiSportModel: Model<OddsApiSportDocument>,

    @InjectModel(SportsOddsSnapshot.name)
    private readonly sportsOddsSnapshotModel: Model<SportsOddsSnapshotDocument>,
  ) {}

  // ============================================================
  // ESPN — STARTUP SEASON FIXTURE COLLECTION
  // ============================================================

  /**
   * Collect fixtures for the complete currently active season
   * of one ESPN league.
   *
   * Range:
   *
   * season start date
   *        ->
   * today + 4 days
   *
   * This is intended for startup / full season bootstrap.
   */
  async collectEspnSeasonFixtures(params: {
    leagueId: string;
    season?: number;
    seasonStartDate?: Date;
  }): Promise<{
    fixtureIds: string[];
    collected: number;
    dateFrom?: string;
    dateTo: string;
  }> {
    const now = new Date();

    const dateFrom = this.toUtcDateOnly(params.seasonStartDate ?? now);

    const dateToDate = new Date(
      now.getTime() + this.STARTUP_FIXTURE_FORWARD_DAYS * 24 * 60 * 60 * 1000,
    );

    const dateTo = this.toUtcDateOnly(dateToDate);

    const response = await this.espnService.getFixtures(
      params.leagueId,
      dateFrom,
      dateTo,
    );

    const result = await this.collectEspnFixtures(params.leagueId, response);

    this.logger.log(
      `ESPN startup fixtures collected for ${params.leagueId}: ` +
        `${result.collected} fixtures (${dateFrom} -> ${dateTo})`,
    );

    return {
      fixtureIds: result.fixtureIds,
      collected: result.collected,
      dateFrom,
      dateTo,
    };
  }

  // ============================================================
  // ESPN — LEAGUE REFRESH
  // ============================================================

  /**
   * Refresh a league's recent and upcoming fixture window.
   *
   * Range:
   *
   * yesterday
   *     ->
   * today + 6 days
   *
   * This method performs ONLY:
   *
   * 1. scoreboard request
   * 2. fixture update/create
   *
   * Standings are intentionally NOT collected here.
   *
   * The fresh scoreboard response is returned so the queue
   * builder can identify completed matches and create
   * FINISHED_MATCH jobs.
   */
  async processEspnLeagueRefresh(params: {
    leagueId: string;
    season?: number;
  }): Promise<{
    scoreboard: unknown;
    fixtureIds: string[];
    collected: number;
    dateFrom: string;
    dateTo: string;
  }> {
    const now = new Date();

    const dateFromDate = new Date(
      now.getTime() - this.LEAGUE_REFRESH_PAST_DAYS * 24 * 60 * 60 * 1000,
    );

    const dateToDate = new Date(
      now.getTime() + this.LEAGUE_REFRESH_FORWARD_DAYS * 24 * 60 * 60 * 1000,
    );

    const dateFrom = this.toUtcDateOnly(dateFromDate);

    const dateTo = this.toUtcDateOnly(dateToDate);

    const scoreboard = await this.espnService.getFixtures(
      params.leagueId,
      dateFrom,
      dateTo,
    );

    const fixtureResult = await this.collectEspnFixtures(
      params.leagueId,
      scoreboard,
    );

    this.logger.log(
      `ESPN league refresh completed for ${params.leagueId}: ` +
        `${fixtureResult.collected} fixtures ` +
        `(${dateFrom} -> ${dateTo})`,
    );

    return {
      scoreboard,
      fixtureIds: fixtureResult.fixtureIds,
      collected: fixtureResult.collected,
      dateFrom,
      dateTo,
    };
  }

  // ============================================================
  // ESPN — FIXTURES / SCOREBOARD
  // ============================================================

  async collectEspnFixtures(
    leagueId: string,
    response: unknown,
  ): Promise<{
    fixtureIds: string[];
    collected: number;
  }> {
    const events = this.extractArray(response, ['events', 'items']);

    const fixtureIds: string[] = [];

    for (const event of events) {
      if (!event || typeof event !== 'object') {
        continue;
      }

      const eventId = this.toStringValue((event as { id?: unknown }).id);

      const fixtureDate = this.parseDate((event as { date?: unknown }).date);

      if (!eventId || !fixtureDate) {
        continue;
      }

      type EspnCompetitor = {
        homeAway?: unknown;
        isHome?: unknown;
        isAway?: unknown;
        score?: unknown;
        [key: string]: unknown;
      };

      const competition = (
        event as {
          competitions?: Array<{
            competitors?: EspnCompetitor[];
            season?: { year?: unknown };
            status?: { period?: unknown };
            venue?: {
              id?: unknown;
              fullName?: unknown;
              name?: unknown;
            };
          }>;
        }
      ).competitions?.[0];

      const competitors = competition?.competitors ?? [];

      const home =
        competitors.find(
          (item) => item.homeAway === 'home' || item.isHome === true,
        ) ?? competitors[0];

      const away =
        competitors.find(
          (item) => item.homeAway === 'away' || item.isAway === true,
        ) ?? competitors[1];

      const season =
        this.toNumber(
          (event as { season?: { year?: unknown } }).season?.year,
        ) ??
        this.toNumber(competition?.season?.year) ??
        fixtureDate.getUTCFullYear();

      const status = this.extractStatus(event);

      const completed = this.isCompleted(event);

      const payload = event as Record<string, unknown>;

      await this.espnFixtureModel
        .updateOne(
          {
            eventId,
          },
          {
            $set: {
              eventId,
              leagueId,
              season,
              fixtureDate,
              status,

              statusDetail: this.getNestedString(competition, [
                'status',
                'type',
                'description',
              ]),

              statusShortDetail: this.getNestedString(competition, [
                'status',
                'type',
                'shortDetail',
              ]),

              period: this.toNumber(competition?.status?.period),

              completed,

              live: this.isLiveEvent(event),

              displayClock:
                this.getNestedString(event, ['status', 'displayClock']) ??
                this.getNestedString(competition, ['status', 'displayClock']),

              homeTeamId: this.getTeamId(home),

              awayTeamId: this.getTeamId(away),

              homeScore: this.toNumber(home?.score),

              awayScore: this.toNumber(away?.score),

              venueId: this.toStringValue(competition?.venue?.id),

              venueName:
                this.getNestedString(competition, ['venue', 'fullName']) ??
                this.getNestedString(competition, ['venue', 'name']),

              payload,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      await this.collectEspnTeams(leagueId, competitors);

      fixtureIds.push(eventId);
    }

    return {
      fixtureIds,
      collected: fixtureIds.length,
    };
  }

  // ============================================================
  // ESPN — LIVE MATCHES
  // ============================================================

  /**
   * Synchronize the current ESPN global live scoreboard.
   *
   * This method ONLY maintains live match state in MongoDB.
   *
   * It does not:
   *
   * - create queue jobs
   * - collect summary
   * - collect standings
   * - collect odds
   * - collect YouTube
   *
   * Existing fixture documents are updated by eventId.
   */
  async collectEspnLiveMatches(response: unknown): Promise<{
    received: number;
    updated: number;
    cleared: number;
  }> {
    const events = this.extractArray(response, ['events', 'items']);

    const leagueMap = this.buildLiveLeagueMap(response);

    const liveEventIds = new Set<string>();

    let updated = 0;

    for (const event of events) {
      if (!event || typeof event !== 'object') {
        continue;
      }

      const eventRecord = event as Record<string, unknown>;

      const eventId = this.toStringValue(eventRecord.id);

      if (!eventId) {
        continue;
      }

      if (!this.isLiveEvent(event)) {
        continue;
      }

      const fixtureDate = this.parseDate(eventRecord.date);

      if (!fixtureDate) {
        continue;
      }

      /*
       * First try to resolve the league from ESPN's live payload.
       */
      let leagueId = this.resolveLiveEventLeagueId(event, leagueMap);

      /*
       * If ESPN does not expose enough league information in the
       * global scoreboard, use the fixture already stored in MongoDB.
       *
       * This is the primary safety fallback because startup and league
       * refreshes already populate fixtures with their canonical league.
       */
      let existingFixture: {
        leagueId?: string;
        season?: number;
      } | null = null;

      if (!leagueId) {
        existingFixture = await this.espnFixtureModel
          .findOne({
            eventId,
          })
          .select({
            leagueId: 1,
            season: 1,
          })
          .lean()
          .exec();

        leagueId = existingFixture?.leagueId;
      }

      /*
       * Never create a fixture with an untrusted/invented league ID.
       */
      if (!leagueId) {
        this.logger.debug(
          `Skipping live ESPN event ${eventId}: unable to resolve leagueId`,
        );

        continue;
      }

      const competition = this.getFirstCompetition(event);

      const competitors = this.extractArray(competition, ['competitors']);

      const home =
        competitors.find(
          (item) => this.getNestedString(item, ['homeAway']) === 'home',
        ) ?? competitors[0];

      const away =
        competitors.find(
          (item) => this.getNestedString(item, ['homeAway']) === 'away',
        ) ?? competitors[1];

      const season =
        this.toNumber(this.getNestedString(event, ['season', 'year'])) ??
        this.toNumber(this.getNestedString(competition, ['season', 'year'])) ??
        existingFixture?.season ??
        fixtureDate.getUTCFullYear();

      const status = this.extractStatus(event);

      const displayClock =
        this.getNestedString(event, ['status', 'displayClock']) ??
        this.getNestedString(competition, ['status', 'displayClock']);

      const normalizedLeagueId = leagueId.trim().toLowerCase();

      await this.espnFixtureModel
        .updateOne(
          {
            eventId,
          },
          {
            $set: {
              eventId,

              leagueId: normalizedLeagueId,

              season,

              fixtureDate,

              status,

              statusDetail: this.getNestedString(competition, [
                'status',
                'type',
                'description',
              ]),

              statusShortDetail: this.getNestedString(competition, [
                'status',
                'type',
                'shortDetail',
              ]),

              period:
                this.toNumber(
                  this.getNestedString(event, ['status', 'period']),
                ) ??
                this.toNumber(
                  this.getNestedString(competition, ['status', 'period']),
                ),

              displayClock,

              completed: this.isCompleted(event),

              live: true,

              homeTeamId: this.getTeamId(home),

              awayTeamId: this.getTeamId(away),

              homeScore: this.toNumber(this.getNestedString(home, ['score'])),

              awayScore: this.toNumber(this.getNestedString(away, ['score'])),

              venueId: this.getNestedString(competition, ['venue', 'id']),

              venueName:
                this.getNestedString(competition, ['venue', 'fullName']) ??
                this.getNestedString(competition, ['venue', 'name']),

              /*
               * Always replace the stored live payload with the
               * newest ESPN event snapshot.
               */
              payload: eventRecord,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      await this.collectEspnTeams(normalizedLeagueId, competitors);

      liveEventIds.add(eventId);

      updated += 1;
    }

    /*
     * Clear fixtures that were previously live but are not present
     * in the latest live scoreboard.
     */
    const clearedResult = await this.espnFixtureModel
      .updateMany(
        {
          live: true,

          fixtureDate: {
            $gte: this.getUtcStartOfDay(
              new Date(Date.now() - 24 * 60 * 60 * 1000),
            ),
          },

          eventId: {
            $nin: [...liveEventIds],
          },
        },
        {
          $set: {
            live: false,
            collectedAt: new Date(),
          },
        },
      )
      .exec();

    return {
      received: events.length,
      updated,
      cleared: clearedResult.modifiedCount,
    };
  }

  // ============================================================
  // LIVE EVENT HELPERS
  // ============================================================

  private isLiveEvent(event: unknown): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    const eventRecord = event as Record<string, unknown>;

    const status =
      eventRecord.status && typeof eventRecord.status === 'object'
        ? (eventRecord.status as Record<string, unknown>)
        : undefined;

    const statusType =
      status?.type && typeof status.type === 'object'
        ? (status.type as Record<string, unknown>)
        : undefined;

    if (status?.completed === true || statusType?.completed === true) {
      return false;
    }

    const state = this.toStringValue(
      statusType?.state ?? status?.state,
    )?.toLowerCase();

    if (
      state &&
      ['post', 'final', 'completed', 'complete', 'finished'].includes(state)
    ) {
      return false;
    }

    return Boolean(state && ['in', 'live', 'inprogress'].includes(state));
  }

  /**
   * Builds the canonical league lookup from response.leagues[].
   */
  private buildLiveLeagueMap(response: unknown): Map<string, string> {
    const map = new Map<string, string>();

    if (!response || typeof response !== 'object') {
      return map;
    }

    const responseRecord = response as Record<string, unknown>;

    const leagues = Array.isArray(responseRecord.leagues)
      ? responseRecord.leagues
      : [];

    for (const league of leagues) {
      const leagueRecord = this.asRecord(league);

      if (!leagueRecord) {
        continue;
      }

      const id = this.toStringValue(leagueRecord.id);

      const slug = this.toStringValue(
        leagueRecord.slug ??
          this.getNestedString(leagueRecord, ['league', 'slug']),
      );

      if (!id || !slug) {
        continue;
      }

      const normalizedId = id.trim().toLowerCase();
      const normalizedSlug = slug.trim().toLowerCase();

      map.set(normalizedId, normalizedSlug);
      map.set(normalizedSlug, normalizedSlug);
    }

    return map;
  }

  /**
   * Resolves the canonical ESPN league slug for a live event.
   */
  private resolveLiveEventLeagueId(
    event: unknown,
    leagueMap: Map<string, string>,
  ): string | undefined {
    const eventRecord = this.asRecord(event);

    if (!eventRecord) {
      return undefined;
    }

    const competition = this.getFirstCompetition(event);

    const directCandidates: unknown[] = [
      this.getNestedString(event, ['league', 'slug']),
      this.getNestedString(event, ['league', 'id']),
      this.getNestedString(event, ['league', 'uid']),

      this.getNestedString(competition, ['league', 'slug']),
      this.getNestedString(competition, ['league', 'id']),
      this.getNestedString(competition, ['league', 'uid']),

      this.getNestedString(event, ['sport', 'league', 'slug']),
      this.getNestedString(event, ['sport', 'league', 'id']),
      this.getNestedString(event, ['sport', 'league', 'uid']),
    ];

    for (const candidate of directCandidates) {
      const value = this.toStringValue(candidate);

      if (!value) {
        continue;
      }

      const normalized = value.trim().toLowerCase();

      const mapped = leagueMap.get(normalized);

      if (mapped) {
        return mapped;
      }

      if (normalized.includes('.')) {
        return normalized;
      }
    }

    const uid = this.toStringValue(eventRecord.uid);

    if (uid) {
      const leagueMatch = uid.match(/(?:^|~)l:([^~]+)/i);

      if (leagueMatch?.[1]) {
        const encodedLeagueId = leagueMatch[1].trim().toLowerCase();

        const mappedLeague = leagueMap.get(encodedLeagueId);

        if (mappedLeague) {
          return mappedLeague;
        }
      }
    }

    const fallbackCandidates: unknown[] = [
      this.getNestedString(event, ['leagueId']),
      this.getNestedString(competition, ['leagueId']),
    ];

    for (const candidate of fallbackCandidates) {
      const value = this.toStringValue(candidate);

      if (!value) {
        continue;
      }

      const mappedLeague = leagueMap.get(value.trim().toLowerCase());

      if (mappedLeague) {
        return mappedLeague;
      }
    }

    return undefined;
  }

  private getUtcStartOfDay(date: Date): Date {
    const result = new Date(date);

    result.setUTCHours(0, 0, 0, 0);

    return result;
  }
  // ============================================================
  // ESPN — TEAMS FROM SCOREBOARD
  // ============================================================

  async collectEspnTeams(
    leagueId: string,
    competitors: unknown[],
  ): Promise<number> {
    let collected = 0;

    for (const competitor of competitors) {
      const competitorRecord = this.asRecord(competitor);
      const team = this.asRecord(competitorRecord?.team);

      const teamId = this.toStringValue(team?.id ?? competitorRecord?.id);

      if (!teamId) {
        continue;
      }

      await this.espnTeamModel
        .updateOne(
          {
            teamId,
            leagueId,
          },
          {
            $set: {
              teamId,
              leagueId,

              name: team?.name ?? team?.displayName ?? `Team ${teamId}`,

              displayName: team?.displayName ?? team?.name ?? `Team ${teamId}`,

              shortDisplayName:
                team?.shortDisplayName ?? team?.name ?? `Team ${teamId}`,

              abbreviation: team?.abbreviation,

              location: team?.location,

              logo: this.getTeamLogo(team),

              colors: team?.color ?? team?.colors,

              active: team?.isActive ?? true,

              payload: team ?? competitor,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      collected += 1;
    }

    return collected;
  }

  // ============================================================
  // ESPN — STANDINGS
  // ============================================================

  async collectEspnStandings(
    leagueId: string,
    response: unknown,
    season?: number,
  ): Promise<number> {
    const entries = this.extractStandingEntries(
      response as Record<string, unknown> | null | undefined,
    );

    if (!entries.length) {
      return 0;
    }

    const resolvedSeason =
      season ??
      this.toNumber(
        (response as { season?: { year?: unknown } } | null)?.season?.year,
      ) ??
      new Date().getUTCFullYear();

    const activeTeamIds = new Set<string>();

    let collected = 0;

    for (const entry of entries) {
      const entryRecord = this.asRecord(entry);
      const teamRecord = this.asRecord(entryRecord?.team);
      const teamId = this.toStringValue(teamRecord?.id ?? entryRecord?.teamId);

      if (!teamId) {
        continue;
      }

      activeTeamIds.add(teamId);

      const statistics = Array.isArray(entryRecord?.stats)
        ? (entryRecord.stats as unknown[])
        : [];

      const value = (name: string): number | undefined =>
        this.getStatisticNumber(statistics, name);

      const form = this.getStatisticDisplayValue(statistics, ['form']);

      await this.espnStandingModel
        .updateOne(
          {
            leagueId,
            season: resolvedSeason,
            teamId,
          },
          {
            $set: {
              leagueId,
              season: resolvedSeason,
              teamId,

              rank:
                value('rank') ??
                this.toNumber(entryRecord?.rank ?? entryRecord?.position) ??
                0,

              points: value('points'),

              played: value('gamesPlayed') ?? value('played'),

              wins: value('wins'),

              draws: value('ties') ?? value('draws'),

              losses: value('losses'),

              goalsFor: value('pointsFor') ?? value('goalsFor'),

              goalsAgainst: value('pointsAgainst') ?? value('goalsAgainst'),

              goalDifference: value('goalDifference'),

              form,

              description: this.getStatisticDisplayValue(statistics, [
                'description',
              ]),

              payload: entry,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      collected += 1;
    }

    await this.espnStandingModel
      .deleteMany({
        leagueId,
        season: resolvedSeason,
        teamId: {
          $nin: [...activeTeamIds],
        },
      })
      .exec();

    return collected;
  }

  // ============================================================
  // ESPN — NEWS
  // ============================================================

  async collectEspnNews(response: EspnNewsResponse): Promise<{
    received: number;
    created: number;
    updated: number;
    skipped: number;
  }> {
    const articles = Array.isArray(response.headlines)
      ? response.headlines
      : [];

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const article of articles) {
      const payload = article as Record<string, unknown>;

      const articleId = this.extractString(payload, 'id', 'articleId', 'uid');

      if (!articleId) {
        skipped++;
        continue;
      }

      const leagueId = this.extractNewsLeagueId(payload);

      if (!leagueId) {
        skipped++;
        continue;
      }

      const headline = this.extractString(payload, 'headline', 'title');

      const description = this.extractString(payload, 'description', 'summary');

      const published = this.parseDate(
        this.extractString(payload, 'published', 'publishedAt'),
      );

      const lastModified = this.parseDate(
        this.extractString(payload, 'lastModified', 'updated', 'updatedAt'),
      );

      const link = this.extractNewsLink(payload);

      const imageUrl = this.extractNewsImage(payload);

      const type = this.extractString(payload, 'type', 'contentType');

      const author = this.extractNewsAuthor(payload);

      const collectedAt = new Date();

      const existing = await this.espnNewsModel
        .findOne({
          articleId,
        })
        .select({
          _id: 1,
        })
        .lean()
        .exec();

      await this.espnNewsModel
        .updateOne(
          {
            articleId,
          },
          {
            $set: {
              articleId,
              leagueId,
              headline,
              description,
              published,
              lastModified,
              link,
              imageUrl,
              type,
              author,
              payload,
              collectedAt,
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      if (existing) {
        updated++;
      } else {
        created++;
      }
    }

    return {
      received: articles.length,
      created,
      updated,
      skipped,
    };
  }
  private extractNewsLeagueId(
    payload: Record<string, unknown>,
  ): string | undefined {
    const directLeagueId = this.extractString(payload, 'leagueId');

    if (directLeagueId) {
      return directLeagueId.trim().toLowerCase();
    }

    const league = payload['league'];

    if (league && typeof league === 'object' && !Array.isArray(league)) {
      const leagueObject = league as Record<string, unknown>;

      const leagueId = this.extractString(
        leagueObject,
        'slug',
        'abbreviation',
        'id',
      );

      if (leagueId) {
        return leagueId.trim().toLowerCase();
      }
    }

    const categories = payload['categories'];

    if (!Array.isArray(categories)) {
      return undefined;
    }

    for (const category of categories) {
      if (
        !category ||
        typeof category !== 'object' ||
        Array.isArray(category)
      ) {
        continue;
      }

      const categoryObject = category as Record<string, unknown>;

      if (
        this.extractString(categoryObject, 'type')?.toLowerCase() !== 'league'
      ) {
        continue;
      }

      const leagueObject = categoryObject['league'];

      if (
        leagueObject &&
        typeof leagueObject === 'object' &&
        !Array.isArray(leagueObject)
      ) {
        const leagueRecord = leagueObject as Record<string, unknown>;

        const leagueSlug = this.extractString(leagueRecord, 'slug');

        if (leagueSlug) {
          return leagueSlug.trim().toLowerCase();
        }

        const abbreviation = this.extractString(leagueRecord, 'abbreviation');

        if (abbreviation) {
          return abbreviation.trim().toLowerCase();
        }

        const leagueId = this.extractString(leagueRecord, 'id');

        if (leagueId) {
          return leagueId.trim().toLowerCase();
        }
      }

      const leagueId = this.extractString(categoryObject, 'leagueId');

      if (leagueId) {
        return leagueId.trim().toLowerCase();
      }
    }

    return undefined;
  }
  private extractNewsLink(
    payload: Record<string, unknown>,
  ): string | undefined {
    const directLink = this.extractString(payload, 'link', 'url');

    if (directLink) {
      return directLink;
    }

    const links = payload['links'];

    if (links && typeof links === 'object' && !Array.isArray(links)) {
      const linksObject = links as Record<string, unknown>;

      const web = linksObject['web'];

      if (web && typeof web === 'object' && !Array.isArray(web)) {
        return this.extractString(
          web as Record<string, unknown>,
          'href',
          'url',
        );
      }

      return this.extractString(linksObject, 'href', 'url');
    }

    return undefined;
  }

  private extractNewsImage(
    payload: Record<string, unknown>,
  ): string | undefined {
    const directImage = this.extractString(payload, 'imageUrl', 'image');

    if (directImage) {
      return directImage;
    }

    const images = payload['images'];

    if (!Array.isArray(images)) {
      return undefined;
    }

    for (const image of images) {
      if (!image || typeof image !== 'object' || Array.isArray(image)) {
        continue;
      }

      const imageObject = image as Record<string, unknown>;

      const url = imageObject['url'];

      if (typeof url === 'string' && url.trim()) {
        return url.trim();
      }

      if (Array.isArray(url)) {
        for (const item of url) {
          if (typeof item === 'string' && item.trim()) {
            return item.trim();
          }
        }
      }

      const href = imageObject['href'];

      if (typeof href === 'string' && href.trim()) {
        return href.trim();
      }
    }

    return undefined;
  }

  private extractNewsAuthor(
    payload: Record<string, unknown>,
  ): string | undefined {
    const directAuthor = this.extractString(payload, 'author', 'byline');

    if (directAuthor) {
      return directAuthor;
    }

    const authorObject = payload['author'];

    if (
      authorObject &&
      typeof authorObject === 'object' &&
      !Array.isArray(authorObject)
    ) {
      return this.extractString(
        authorObject as Record<string, unknown>,
        'name',
        'displayName',
      );
    }

    return undefined;
  }

  private extractString(
    payload: Record<string, unknown>,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }

    return undefined;
  }

  // ============================================================
  // ESPN — MATCH DETAILS
  // ============================================================

  async collectEspnMatchDetails(params: {
    leagueId: string;
    event: unknown;
  }): Promise<void> {
    const event = this.asRecord(params.event) ?? {};

    const competition = this.asRecord(
      (Array.isArray(event.competitions) ? event.competitions : [])[0],
    );

    const eventId = this.toStringValue(event?.id);

    const fixtureDate = this.parseDate(
      event?.date ?? competition?.date ?? competition?.startDate,
    );

    if (!eventId || !fixtureDate) {
      throw new Error('Invalid ESPN match payload');
    }

    const competitors: unknown[] = Array.isArray(competition?.competitors)
      ? (competition.competitors as unknown[])
      : [];

    const home =
      competitors.find((item) => {
        const competitor = this.asRecord(item);
        return competitor?.homeAway === 'home' || competitor?.isHome === true;
      }) ?? competitors[0];

    const away =
      competitors.find((item) => {
        const competitor = this.asRecord(item);
        return competitor?.homeAway === 'away' || competitor?.isAway === true;
      }) ?? competitors[1];

    const homeCompetitor = this.asRecord(home);
    const awayCompetitor = this.asRecord(away);

    const season =
      this.toNumber(this.getNestedString(event, ['season', 'year'])) ??
      this.toNumber(this.getNestedString(competition, ['season', 'year'])) ??
      fixtureDate.getUTCFullYear();

    const status = this.extractStatus(event);

    const completed = this.isCompleted(event);

    await this.espnFixtureModel
      .updateOne(
        {
          eventId,
        },
        {
          $set: {
            eventId,

            leagueId: params.leagueId.trim().toLowerCase(),

            season,

            fixtureDate,

            status,

            statusDetail: this.getNestedString(competition, [
              'status',
              'type',
              'description',
            ]),

            statusShortDetail: this.getNestedString(competition, [
              'status',
              'type',
              'shortDetail',
            ]),

            period: this.toNumber(
              this.getNestedString(competition, ['status', 'period']),
            ),

            completed,

            homeTeamId: this.getTeamId(home),

            awayTeamId: this.getTeamId(away),

            homeScore: this.toNumber(homeCompetitor?.score),

            awayScore: this.toNumber(awayCompetitor?.score),

            venueId: this.getNestedString(competition, ['venue', 'id']),

            venueName:
              this.getNestedString(competition, ['venue', 'fullName']) ??
              this.getNestedString(competition, ['venue', 'name']),

            payload: event,

            collectedAt: new Date(),
          },
        },
        {
          upsert: true,
        },
      )
      .exec();

    await this.collectEspnTeams(params.leagueId, competitors);
  }

  // ============================================================
  // ESPN — CHECK STORED MATCH SUMMARY
  // ============================================================

  async hasEspnMatchSummary(eventId: string): Promise<boolean> {
    const fixture = await this.espnFixtureModel
      .findOne({
        eventId: eventId.trim(),
      })
      .select({
        'payload.summary': 1,
      })
      .lean()
      .exec();

    return Boolean(
      fixture?.payload &&
      typeof fixture.payload === 'object' &&
      'summary' in fixture.payload &&
      fixture.payload.summary,
    );
  }

  // ============================================================
  // ESPN — MATCH SUMMARY
  // ============================================================

  async collectEspnMatchSummary(params: {
    leagueId: string;
    eventId: string;
    summary: unknown;
  }): Promise<void> {
    const fixture = await this.espnFixtureModel
      .findOne({
        eventId: params.eventId,
      })
      .lean()
      .exec();

    const existingPayload = fixture?.payload ?? {};

    await this.espnFixtureModel
      .updateOne(
        {
          eventId: params.eventId,
        },
        {
          $set: {
            leagueId: params.leagueId,

            payload: {
              ...existingPayload,

              summary: params.summary,

              summaryCollectedAt: new Date(),
            },

            collectedAt: new Date(),
          },
        },
      )
      .exec();
  }

  // ============================================================
  // FOOTBALL-DATA — COMPETITION
  // ============================================================

  async collectFootballDataCompetition(
    competition: FootballDataCompetitionPayload,
  ): Promise<void> {
    if (typeof competition.id !== 'number' || !competition.code) {
      return;
    }

    await this.footballDataCompetitionModel
      .updateOne(
        {
          competitionId: competition.id,
        },
        {
          $set: {
            competitionId: competition.id,

            code: competition.code.trim().toUpperCase(),

            name: competition.name ?? '',

            type: competition.type,

            payload: competition as unknown as Record<string, unknown>,

            collectedAt: new Date(),
          },
        },
        {
          upsert: true,
        },
      )
      .exec();
  }

  // ============================================================
  // FOOTBALL-DATA — MATCHES
  // ============================================================

  async collectFootballDataMatches(
    matches: FootballDataMatchPayload[],
  ): Promise<number> {
    let collected = 0;

    for (const match of matches) {
      if (
        typeof match.id !== 'number' ||
        !match.utcDate ||
        typeof match.competition?.id !== 'number' ||
        typeof match.homeTeam?.id !== 'number' ||
        typeof match.awayTeam?.id !== 'number'
      ) {
        continue;
      }

      const utcDate = new Date(match.utcDate);

      if (Number.isNaN(utcDate.getTime())) {
        continue;
      }

      await this.footballDataMatchModel
        .updateOne(
          {
            matchId: match.id,
          },
          {
            $set: {
              matchId: match.id,

              competitionId: match.competition.id,

              competitionCode:
                match.competition.code?.trim().toUpperCase() ?? '',

              seasonId: match.season?.id ?? 0,

              status: match.status ?? '',

              utcDate,

              homeTeamId: match.homeTeam.id,

              awayTeamId: match.awayTeam.id,

              payload: match as unknown as Record<string, unknown>,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      collected += 1;
    }

    return collected;
  }

  // ============================================================
  // FOOTBALL-DATA — STANDINGS
  // ============================================================

  async collectFootballDataStandings(
    standings: FootballDataStandingTable[],
    competition: FootballDataCompetitionPayload,
    seasonId: number,
  ): Promise<number> {
    if (
      typeof competition.id !== 'number' ||
      !competition.code ||
      typeof seasonId !== 'number'
    ) {
      return 0;
    }

    const competitionCode = competition.code.trim().toUpperCase();

    let collected = 0;

    for (const standing of standings) {
      for (const row of standing.table ?? []) {
        if (typeof row.team?.id !== 'number') {
          continue;
        }

        await this.footballDataStandingModel
          .updateOne(
            {
              competitionId: competition.id,

              competitionCode,

              seasonId,

              stage: standing.stage ?? 'REGULAR_SEASON',

              type: standing.type ?? 'TOTAL',

              group: standing.group ?? null,

              teamId: row.team.id,
            },
            {
              $set: {
                competitionId: competition.id,

                competitionCode,

                seasonId,

                stage: standing.stage ?? 'REGULAR_SEASON',

                type: standing.type ?? 'TOTAL',

                group: standing.group ?? null,

                teamId: row.team.id,

                payload: row as unknown as Record<string, unknown>,

                collectedAt: new Date(),
              },
            },
            {
              upsert: true,
            },
          )
          .exec();

        collected += 1;
      }
    }

    return collected;
  }

  // ============================================================
  // FOOTBALL-DATA — TEAMS
  // ============================================================

  async collectFootballDataTeams(
    teams: FootballDataTeamPayload[],
    competitionId: number,
    competitionCode: string,
  ): Promise<number> {
    let collected = 0;

    for (const team of teams) {
      if (typeof team.id !== 'number' || !team.name) {
        continue;
      }

      await this.footballDataTeamModel
        .updateOne(
          {
            teamId: team.id,

            competitionId,
          },
          {
            $set: {
              teamId: team.id,

              competitionId,

              competitionCode: competitionCode.trim().toUpperCase(),

              name: team.name,

              payload: team as unknown as Record<string, unknown>,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      collected += 1;
    }

    return collected;
  }

  // ============================================================
  // ODDS API — SPORTS
  // ============================================================

  async collectOddsSports(sports: OddsApiSportPayload[]): Promise<number> {
    let collected = 0;

    for (const sport of sports) {
      if (!sport.key) {
        continue;
      }

      await this.oddsApiSportModel
        .updateOne(
          {
            sportKey: sport.key,
          },
          {
            $set: {
              sportKey: sport.key,

              title: sport.title ?? sport.key,

              active: Boolean(sport.active),

              hasOutrights: Boolean(sport.has_outrights),

              payload: sport as unknown as Record<string, unknown>,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      collected += 1;
    }

    return collected;
  }

  // ============================================================
  // ODDS API — EVENT ODDS
  // ============================================================

  async collectOdds(events: OddsApiEventOdds[]): Promise<number> {
    let collected = 0;

    for (const event of events) {
      if (
        !event.id ||
        !event.sport_key ||
        !event.home_team ||
        !event.away_team
      ) {
        continue;
      }

      const commenceTime = new Date(event.commence_time);

      if (Number.isNaN(commenceTime.getTime())) {
        continue;
      }

      await this.sportsOddsSnapshotModel
        .updateOne(
          {
            eventId: event.id,
          },
          {
            $set: {
              eventId: event.id,

              sportKey: event.sport_key,

              homeTeam: event.home_team,

              awayTeam: event.away_team,

              commenceTime,

              payload: event as unknown as Record<string, unknown>,

              collectedAt: new Date(),
            },
          },
          {
            upsert: true,
          },
        )
        .exec();

      collected += 1;
    }

    return collected;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private extractArray(value: unknown, keys: string[] = []): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const object = value as Record<string, unknown>;

    for (const key of keys) {
      if (Array.isArray(object[key])) {
        return object[key];
      }
    }

    return [];
  }

  private extractStandingEntries(
    response:
      | EspnStandingsResponse
      | Record<string, unknown>
      | null
      | undefined,
  ): EspnStandingEntry[] {
    if (!response || typeof response !== 'object') {
      return [];
    }

    const root = this.asRecord(response);

    if (!root) {
      return [];
    }

    // ============================================================
    // DIRECT:
    // standings: {
    //   entries: [...]
    // }
    // ============================================================

    const directStandings = this.asRecord(root.standings);

    if (Array.isArray(directStandings?.entries)) {
      return directStandings.entries as EspnStandingEntry[];
    }

    // ============================================================
    // CHILD GROUPS:
    //
    // children: [
    //   {
    //     standings: {
    //       entries: [...]
    //     }
    //   }
    // ]
    // ============================================================

    const children = Array.isArray(root.children)
      ? (root.children as unknown[])
      : [];

    const entries: EspnStandingEntry[] = [];

    for (const child of children) {
      this.collectStandingEntriesFromGroup(child, entries);
    }

    if (entries.length > 0) {
      return entries;
    }

    // ============================================================
    // LEGACY / ALTERNATIVE:
    //
    // standings: [
    //   {
    //     entries: [...]
    //   }
    // ]
    // ============================================================

    if (Array.isArray(root.standings)) {
      for (const group of root.standings as unknown[]) {
        this.collectStandingEntriesFromGroup(group, entries);
      }

      if (entries.length > 0) {
        return entries;
      }
    }

    // ============================================================
    // GROUPS:
    //
    // groups: [
    //   {
    //     standings: {
    //       entries: [...]
    //     }
    //   }
    // ]
    // ============================================================

    const groups = Array.isArray(root.groups) ? (root.groups as unknown[]) : [];

    for (const group of groups) {
      this.collectStandingEntriesFromGroup(group, entries);
    }

    return entries;
  }

  private collectStandingEntriesFromGroup(
    value: unknown,
    output: EspnStandingEntry[],
  ): void {
    const group = this.asRecord(value);

    if (!group) {
      return;
    }

    // Direct standings container:
    //
    // standings: {
    //   entries: [...]
    // }
    const standings = this.asRecord(group.standings);

    if (Array.isArray(standings?.entries)) {
      output.push(...(standings.entries as EspnStandingEntry[]));
    }

    // Alternative direct entries:
    if (Array.isArray(group.entries)) {
      output.push(...(group.entries as EspnStandingEntry[]));
    }

    // Nested children:
    if (Array.isArray(group.children)) {
      for (const child of group.children as unknown[]) {
        this.collectStandingEntriesFromGroup(child, output);
      }
    }
  }

  private getStatisticNumber(
    stats: unknown[],
    ...names: string[]
  ): number | undefined {
    for (const item of stats) {
      const statistic =
        item !== null && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : undefined;
      const nameValue =
        statistic?.name ?? statistic?.type ?? statistic?.key ?? '';
      const name =
        typeof nameValue === 'string' || typeof nameValue === 'number'
          ? String(nameValue).toLowerCase()
          : '';

      if (names.some((candidate) => name === candidate.toLowerCase())) {
        return (
          this.toNumber(statistic?.value) ??
          this.toNumber(statistic?.displayValue)
        );
      }
    }

    return undefined;
  }

  private getStatisticDisplayValue(
    stats: unknown[],
    names: string[],
  ): string | undefined {
    for (const item of stats) {
      const statistic =
        item !== null && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : undefined;
      const nameValue =
        statistic?.name ?? statistic?.type ?? statistic?.key ?? '';
      const name =
        typeof nameValue === 'string' || typeof nameValue === 'number'
          ? String(nameValue).toLowerCase()
          : '';

      if (names.some((candidate) => name === candidate.toLowerCase())) {
        return this.toStringValue(statistic?.displayValue ?? statistic?.value);
      }
    }

    return undefined;
  }

  private getNestedString(value: unknown, path: string[]): string | undefined {
    let current: unknown = value;

    for (const key of path) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return this.toStringValue(current);
  }

  private getTeamId(competitor: unknown): string {
    return (
      this.getNestedString(competitor, ['team', 'id']) ??
      this.getNestedString(competitor, ['id']) ??
      ''
    );
  }

  private getTeamLogo(team: unknown): string | undefined {
    if (typeof team !== 'object' || team === null) {
      return undefined;
    }

    const teamRecord = team as Record<string, unknown>;
    const logo = teamRecord.logo;

    if (typeof logo === 'string') {
      return logo;
    }

    const logos = teamRecord.logos;

    if (Array.isArray(logos)) {
      const firstLogo: unknown = logos[0];

      if (typeof firstLogo === 'object' && firstLogo !== null) {
        const href = (firstLogo as Record<string, unknown>).href;

        if (typeof href === 'string') {
          return href;
        }
      }
    }

    return undefined;
  }

  private getFirstCompetition(event: unknown): unknown {
    if (event === null || typeof event !== 'object') {
      return undefined;
    }

    const competitions = (event as Record<string, unknown>).competitions;

    return Array.isArray(competitions) ? competitions[0] : undefined;
  }

  private extractStatus(event: unknown): string {
    const competition = this.getFirstCompetition(event);

    return (
      this.getNestedString(competition, ['status', 'type', 'name']) ??
      this.getNestedString(competition, ['status', 'type', 'state']) ??
      this.getNestedString(event, ['status', 'type', 'name']) ??
      'UNKNOWN'
    );
  }

  private isCompleted(event: unknown): boolean {
    const competition = this.getFirstCompetition(event);
    const competitionRecord =
      competition !== null && typeof competition === 'object'
        ? (competition as Record<string, unknown>)
        : undefined;
    const eventRecord =
      event !== null && typeof event === 'object'
        ? (event as Record<string, unknown>)
        : undefined;

    const status = competitionRecord?.status ?? eventRecord?.status;
    const statusRecord =
      status !== null && typeof status === 'object'
        ? (status as Record<string, unknown>)
        : undefined;
    const statusType =
      statusRecord?.type !== null && typeof statusRecord?.type === 'object'
        ? (statusRecord.type as Record<string, unknown>)
        : undefined;

    if (statusType?.completed === true || statusRecord?.completed === true) {
      return true;
    }

    const rawState = statusType?.state ?? statusRecord?.state;
    const state =
      typeof rawState === 'string' || typeof rawState === 'number'
        ? String(rawState).toLowerCase()
        : '';

    return ['post', 'final', 'completed', 'complete', 'finished'].includes(
      state,
    );
  }

  private getSeasonFromFixtures(response: unknown): number | undefined {
    const events = this.extractArray(response, ['events', 'items']);

    for (const event of events) {
      const season = this.toNumber(
        this.getNestedString(event, ['season', 'year']),
      );

      if (season !== undefined) {
        return season;
      }
    }

    return undefined;
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value !== 'string' && !(value instanceof Date)) {
      return undefined;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toStringValue(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    const result = String(value).trim();

    return result ? result : undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const cleaned = value.replace('%', '').trim();

    const result = Number(cleaned);

    return Number.isFinite(result) ? result : undefined;
  }

  /**
   * Converts a Date into the UTC calendar date
   * expected by ESPN's dates parameter.
   *
   * Result:
   *
   * YYYY-MM-DD
   */
  private toUtcDateOnly(value: Date): string {
    const date = new Date(value);

    const year = date.getUTCFullYear();

    const month = String(date.getUTCMonth() + 1).padStart(2, '0');

    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
