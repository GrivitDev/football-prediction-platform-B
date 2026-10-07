// backend/src/sports/services/sports-data-read.service.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';

// ============================================================
// ACTIVE COMPETITION
// ============================================================

import {
  ActiveCompetition,
  ActiveCompetitionDocument,
} from '../schemas/active-competition.schema';

import { ActiveCompetitionStatus } from '../interfaces/active-competition.interface';

import { SportsDataFilter } from '../interfaces/sports-data-filter.interface';

import {
  SportsPredictionData,
  SportsSettlementData,
} from '../interfaces/prediction-data.interface';

// ============================================================
// ESPN
// ============================================================

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import {
  EspnLeague,
  EspnLeagueDocument,
} from '../schemas/espn/espn-league.schema';

import { EspnNews, EspnNewsDocument } from '../schemas/espn/espn-news.schema';

import {
  EspnStanding,
  EspnStandingDocument,
} from '../schemas/espn/espn-standing.schema';

import { EspnTeam, EspnTeamDocument } from '../schemas/espn/espn-team.schema';

// ============================================================
// ESPN QUEUE
// ============================================================

import { EspnQueue, EspnQueueDocument } from '../schemas/espn-queue.schema';

import {
  EspnQueueJobType,
  EspnQueueStatus,
} from '../interfaces/espn-queue.interface';

// ============================================================
// SYNC STATE
// ============================================================

import {
  SportsSyncState,
  SportsSyncStateDocument,
  SportsSyncStateKind,
  SportsSyncStateStatus,
  SportsSyncUnitStatus,
  SportsSyncUnitType,
} from '../schemas/sports-sync-state.schema';

// ============================================================
// FOOTBALL-DATA
// ============================================================

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

// ============================================================
// ODDS API
// ============================================================

import {
  OddsApiSport,
  OddsApiSportDocument,
} from '../schemas/odds-api-sport.schema';

import {
  SportsOddsSnapshot,
  SportsOddsSnapshotDocument,
} from '../schemas/sports-odds-snapshot.schema';

// ============================================================
// RATE LIMIT
// ============================================================

import {
  SportsProviderRateLimit,
  SportsProviderRateLimitDocument,
} from '../schemas/sports-provider-rate-limit.schema';

// ============================================================
// YOUTUBE
// ============================================================

import {
  YouTubeHighlight,
  YouTubeHighlightDocument,
} from '../schemas/youtube-highlight.schema';

// ============================================================
// QUERY TYPES
// ============================================================

export interface SportsAdminQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';

  status?: string;
  type?: string;
  kind?: string;
  leagueId?: string;
  season?: number;
  eventId?: string;
  competitionId?: string;
  teamId?: string;
  provider?: string;
  stateKey?: string;

  from?: Date;
  to?: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FootballNewsFeedItem {
  kind: 'NEWS' | 'VIDEO';
  eventId: string;
  leagueId: string;
  fixtureDate: Date;
  publishedAt?: string;
  payload: Record<string, unknown>;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class SportsDataReadService {
  constructor(
    // ----------------------------------------------------------
    // ACTIVE COMPETITION
    // ----------------------------------------------------------

    @InjectModel(ActiveCompetition.name)
    private readonly activeCompetitionModel: Model<ActiveCompetitionDocument>,

    // ----------------------------------------------------------
    // ESPN
    // ----------------------------------------------------------

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(EspnLeague.name)
    private readonly espnLeagueModel: Model<EspnLeagueDocument>,

    @InjectModel(EspnNews.name)
    private readonly espnNewsModel: Model<EspnNewsDocument>,

    @InjectModel(EspnStanding.name)
    private readonly espnStandingModel: Model<EspnStandingDocument>,

    @InjectModel(EspnTeam.name)
    private readonly espnTeamModel: Model<EspnTeamDocument>,

    // ----------------------------------------------------------
    // ESPN QUEUE
    // ----------------------------------------------------------

    @InjectModel(EspnQueue.name)
    private readonly espnQueueModel: Model<EspnQueueDocument>,

    // ----------------------------------------------------------
    // SYNC STATE
    // ----------------------------------------------------------

    @InjectModel(SportsSyncState.name)
    private readonly sportsSyncStateModel: Model<SportsSyncStateDocument>,

    // ----------------------------------------------------------
    // FOOTBALL-DATA
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
    // ODDS API
    // ----------------------------------------------------------

    @InjectModel(OddsApiSport.name)
    private readonly oddsApiSportModel: Model<OddsApiSportDocument>,

    @InjectModel(SportsOddsSnapshot.name)
    private readonly sportsOddsSnapshotModel: Model<SportsOddsSnapshotDocument>,

    // ----------------------------------------------------------
    // RATE LIMIT
    // ----------------------------------------------------------

    @InjectModel(SportsProviderRateLimit.name)
    private readonly sportsProviderRateLimitModel: Model<SportsProviderRateLimitDocument>,

    // ----------------------------------------------------------
    // YOUTUBE
    // ----------------------------------------------------------

    @InjectModel(YouTubeHighlight.name)
    private readonly youtubeHighlightModel: Model<YouTubeHighlightDocument>,
  ) {}

  // ============================================================
  // PUBLIC / APPLICATION SPORTS DATA
  // ============================================================

  async getLive(): Promise<unknown[]> {
    return this.getLiveFixtures();
  }

  async getFixtures(filters: SportsDataFilter = {}): Promise<unknown[]> {
    return this.getUpcomingFixtures(filters);
  }

  async getResults(filters: SportsDataFilter = {}): Promise<unknown[]> {
    return this.getFinishedFixtures(filters);
  }

  async getStandings(
    competitionId: string,
    teamId?: string,
  ): Promise<unknown[]> {
    return this.getLeagueTable(competitionId, teamId);
  }

  async getTeams(competitionId: string, teamId?: string): Promise<unknown[]> {
    const normalizedCompetitionId = this.normalizeCompetitionId(competitionId);

    if (!normalizedCompetitionId) {
      return [];
    }

    const filter: Record<string, unknown> = {
      leagueId: normalizedCompetitionId,
    };

    const normalizedTeamId = this.normalizeTeamId(teamId);

    if (normalizedTeamId) {
      filter.teamId = normalizedTeamId;
    }

    return this.espnTeamModel
      .find(filter)
      .sort({
        name: 1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // COMPETITIONS
  // ============================================================

  async getCompetitions(
    options: {
      activeOnly?: boolean;
      predictionEnabled?: boolean;
    } = {},
  ) {
    let competitions = await this.activeCompetitionModel
      .find()
      .sort({
        priority: 1,
        name: 1,
      })
      .lean()
      .exec();

    if (options.activeOnly) {
      competitions = competitions.filter(
        (competition) =>
          competition.status === ActiveCompetitionStatus.ACTIVE ||
          competition.status === ActiveCompetitionStatus.UPCOMING,
      );
    }

    if (options.predictionEnabled) {
      return competitions;
    }

    return competitions;
  }

  async getActiveCompetitions(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({
        status: {
          $in: [
            ActiveCompetitionStatus.UPCOMING,
            ActiveCompetitionStatus.ACTIVE,
          ],
        },
      })
      .sort({
        priority: 1,
        name: 1,
      })
      .lean()
      .exec();
  }

  async getCompetition(
    competitionId: string,
  ): Promise<ActiveCompetitionDocument | null> {
    return this.activeCompetitionModel
      .findOne({
        competitionId: this.normalizeCompetitionId(competitionId),
      })
      .lean()
      .exec();
  }

  // ============================================================
  // FIXTURES
  // ============================================================

  async getUpcomingFixtures(
    filters: SportsDataFilter = {},
  ): Promise<unknown[]> {
    const mongoFilter: Record<string, unknown> = {};

    this.applyFixtureFilters(mongoFilter, filters);

    /*
     * Preserve the old public behavior:
     * upcoming fixtures without an explicit date/range start from "now".
     */
    if (!filters.date && !filters.from && !filters.to) {
      mongoFilter.fixtureDate = {
        $gte: new Date(),
      };
    }

    return this.espnFixtureModel
      .find(mongoFilter)
      .select({
        _id: 0,
        eventId: 1,
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
        status: 1,
        statusDetail: 1,
        statusShortDetail: 1,
        period: 1,
        completed: 1,
        live: 1,
        displayClock: 1,
        homeTeamId: 1,
        awayTeamId: 1,
        homeScore: 1,
        awayScore: 1,
        venueId: 1,
        venueName: 1,
        collectedAt: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();
  }

  async getLiveFixtures(filters: SportsDataFilter = {}): Promise<unknown[]> {
    const mongoFilter: Record<string, unknown> = {
      live: true,
    };

    this.applyFixtureFilters(mongoFilter, filters);

    return this.espnFixtureModel
      .find(mongoFilter)
      .select({
        _id: 0,
        eventId: 1,
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
        status: 1,
        statusDetail: 1,
        statusShortDetail: 1,
        period: 1,
        completed: 1,
        live: 1,
        displayClock: 1,
        homeTeamId: 1,
        awayTeamId: 1,
        homeScore: 1,
        awayScore: 1,
        venueId: 1,
        venueName: 1,
        collectedAt: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // FOOTBALL NEWS FEED
  //
  // Reads the stored ESPN Summary fragments directly from the
  // canonical sports_espn_fixtures documents.
  //
  // News source:
  //   payload.summary.news.articles
  //
  // Video source:
  //   payload.summary.videos
  //
  // The two sources are deliberately merged into one feed.
  // ============================================================

  async getFootballNews(
    filters: SportsDataFilter = {},
    page = 1,
    limit = 30,
  ): Promise<PaginatedResult<FootballNewsFeedItem>> {
    const mongoFilter: Record<string, unknown> = {
      completed: true,
    };

    this.applyFixtureFilters(mongoFilter, filters);

    const normalizedPage = Number.isFinite(page)
      ? Math.max(Math.floor(page), 1)
      : 1;

    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 100)
      : 30;

    const skip = (normalizedPage - 1) * normalizedLimit;

    const pipeline: PipelineStage[] = [
      {
        $match: mongoFilter,
      },
      {
        $project: {
          eventId: 1,
          leagueId: 1,
          fixtureDate: 1,
          feedItems: {
            $concatArrays: [
              {
                $map: {
                  input: {
                    $ifNull: ['$payload.summary.news.articles', []],
                  },
                  as: 'article',
                  in: {
                    kind: 'NEWS',
                    payload: '$$article',
                    publishedAt: '$$article.published',
                  },
                },
              },
              {
                $map: {
                  input: {
                    $ifNull: ['$payload.summary.videos', []],
                  },
                  as: 'video',
                  in: {
                    kind: 'VIDEO',
                    payload: '$$video',
                    publishedAt: '$$video.originalPublishDate',
                  },
                },
              },
            ],
          },
        },
      },
      {
        $unwind: '$feedItems',
      },
      {
        $project: {
          _id: 0,
          kind: '$feedItems.kind',
          eventId: 1,
          leagueId: 1,
          fixtureDate: 1,
          publishedAt: '$feedItems.publishedAt',
          payload: '$feedItems.payload',
          sortAt: {
            $convert: {
              input: '$feedItems.publishedAt',
              to: 'date',
              onError: '$fixtureDate',
              onNull: '$fixtureDate',
            },
          },
        },
      },
      {
        $sort: {
          sortAt: -1,
          fixtureDate: -1,
          eventId: 1,
        },
      },
      {
        $facet: {
          data: [
            {
              $skip: skip,
            },
            {
              $limit: normalizedLimit,
            },
          ],
          meta: [
            {
              $count: 'total',
            },
          ],
        },
      },
    ];

    const [result] = await this.espnFixtureModel
      .aggregate(pipeline)
      .allowDiskUse(true)
      .exec();

    const total = result?.meta?.[0]?.total ?? 0;

    const data = Array.isArray(result?.data) ? result.data : [];

    return {
      data,
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages: total > 0 ? Math.ceil(total / normalizedLimit) : 0,
    };
  }

  async getFinishedFixtures(
    filters: SportsDataFilter = {},
  ): Promise<unknown[]> {
    const mongoFilter: Record<string, unknown> = {
      completed: true,
    };

    this.applyFixtureFilters(mongoFilter, filters);

    return this.espnFixtureModel
      .find(mongoFilter)
      .select({
        _id: 0,
        eventId: 1,
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
        status: 1,
        statusDetail: 1,
        statusShortDetail: 1,
        period: 1,
        completed: 1,
        live: 1,
        displayClock: 1,
        homeTeamId: 1,
        awayTeamId: 1,
        homeScore: 1,
        awayScore: 1,
        venueId: 1,
        venueName: 1,
        collectedAt: 1,
      })
      .sort({
        fixtureDate: -1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // ESPN FIXTURE PAYLOAD — SINGULAR READS
  // ============================================================

  async getFixtureId(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.id': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.id ?? null;
  }

  async getFixtureUid(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.uid': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.uid ?? null;
  }

  async getFixtureDate(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.date': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.date ?? null;
  }

  async getFixtureName(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.name': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.name ?? null;
  }

  async getFixtureShortName(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.shortName': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.shortName ?? null;
  }

  async getFixtureTimeValid(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.timeValid': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.timeValid ?? null;
  }

  async getFixtureSeason(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.season': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.season ?? null;
  }

  async getFixtureSeasonType(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.seasonType': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.seasonType ?? null;
  }

  async getFixtureCompetitions(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.competitions': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.competitions ?? null;
  }

  async getFixtureLinks(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.links': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.links ?? null;
  }

  async getFixtureLeague(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.league': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.league ?? null;
  }

  async getFixtureStatus(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.status': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.status ?? null;
  }

  async getFixtureVenue(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.venue': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.venue ?? null;
  }

  // ============================================================
  // ESPN SUMMARY — SINGULAR READS
  // ============================================================

  async getFixtureSummaryBoxscore(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.boxscore': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.boxscore ?? null;
  }

  async getFixtureSummaryFormat(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.format': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.format ?? null;
  }

  async getFixtureSummaryGameInfo(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.gameInfo': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.gameInfo ?? null;
  }

  async getFixtureSummaryLastFiveGames(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.lastFiveGames': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.lastFiveGames ?? null;
  }

  async getFixtureSummaryLeaders(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.leaders': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.leaders ?? null;
  }

  async getFixtureSummaryBroadcasts(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.broadcasts': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.broadcasts ?? null;
  }

  async getFixtureSummaryPickcenter(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.pickcenter': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.pickcenter ?? null;
  }

  async getFixtureSummaryOdds(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.odds': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.odds ?? null;
  }

  async getFixtureSummaryHasOdds(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.hasOdds': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.hasOdds ?? null;
  }

  async getFixtureSummaryRosters(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.rosters': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.rosters ?? null;
  }

  async getFixtureSummaryNews(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.news': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.news ?? null;
  }

  async getFixtureSummarySeasonSeries(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.seasonseries': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.seasonseries ?? null;
  }

  async getFixtureSummaryVideos(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.videos': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.videos ?? null;
  }

  async getFixtureSummaryHeader(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.header': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.header ?? null;
  }

  async getFixtureSummaryKeyEvents(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.keyEvents': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.keyEvents ?? null;
  }

  async getFixtureSummaryCommentary(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.commentary': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.commentary ?? null;
  }

  async getFixtureSummaryWallclockAvailable(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.wallclockAvailable': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.wallclockAvailable ?? null;
  }

  async getFixtureSummaryMeta(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.meta': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.meta ?? null;
  }

  async getFixtureSummaryStandings(eventId: string): Promise<unknown> {
    const fixture = await this.espnFixtureModel
      .findOne({ eventId: eventId.trim() })
      .select({
        _id: 0,
        'payload.summary.standings': 1,
      })
      .lean()
      .exec();

    return fixture?.payload?.summary?.standings ?? null;
  }

  // ============================================================
  // LEAGUE TABLE — DIRECT STORED DATA
  // ============================================================

  async getLeagueTable(
    competitionId: string,
    teamId?: string,
  ): Promise<unknown[]> {
    const filter: Record<string, unknown> = {
      leagueId: this.normalizeCompetitionId(competitionId),
    };

    const normalizedTeamId = this.normalizeTeamId(teamId);

    if (normalizedTeamId) {
      filter.teamId = normalizedTeamId;
    }

    return this.espnStandingModel
      .find(filter)
      .sort({
        rank: 1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // ODDS
  // ============================================================

  async getOddsForEvent(eventId: string): Promise<unknown[]> {
    const normalizedEventId = eventId.trim();

    return this.sportsOddsSnapshotModel
      .find({
        eventId: normalizedEventId,
      })
      .sort({
        collectedAt: -1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // YOUTUBE
  // ============================================================

  async getYoutubeHighlight(
    fixtureId: string,
  ): Promise<YouTubeHighlightDocument | null> {
    return this.youtubeHighlightModel
      .findOne({
        fixtureId: fixtureId.trim(),
      })
      .sort({
        searchedAt: -1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // STANDARD SPORTS FILTERS
  // ============================================================

  /**
   * Applies the standard public sports filter contract:
   *
   * - date OR from/to
   * - competitionId
   * - teamId
   *
   * The date filter is always applied against the canonical
   * fixtureDate field. Team matching includes either home or away.
   */
  private applyFixtureFilters(
    filter: Record<string, unknown>,
    filters: SportsDataFilter,
  ): void {
    const normalizedCompetitionId = this.normalizeCompetitionId(
      filters.competitionId,
    );

    if (normalizedCompetitionId) {
      filter.leagueId = normalizedCompetitionId;
    }

    const normalizedTeamId = this.normalizeTeamId(filters.teamId);

    if (normalizedTeamId) {
      filter.$or = [
        {
          homeTeamId: normalizedTeamId,
        },
        {
          awayTeamId: normalizedTeamId,
        },
      ];
    }

    const dateRange = this.resolveSportsDateRange(filters);

    if (dateRange) {
      filter.fixtureDate = dateRange;
    }
  }

  private resolveSportsDateRange(
    filters: SportsDataFilter,
  ): { $gte?: Date; $lt?: Date } | undefined {
    if (filters.date) {
      const start = this.startOfUtcDay(filters.date);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

      return {
        $gte: start,
        $lt: end,
      };
    }

    if (!filters.from && !filters.to) {
      return undefined;
    }

    const range: { $gte?: Date; $lt?: Date } = {};

    if (filters.from) {
      range.$gte = filters.from;
    }

    if (filters.to) {
      range.$lt = filters.to;
    }

    return range;
  }

  private startOfUtcDay(value: Date): Date {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private normalizeCompetitionId(value?: string): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private normalizeTeamId(value?: string): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  // ============================================================
  // ADMIN PAGINATION
  // ============================================================

  private async paginateModel<T = any>(
    model: Model<any>,
    query: SportsAdminQuery,
    filter: Record<string, unknown> = {},
  ): Promise<PaginatedResult<T>> {
    const page = this.normalizePage(query.page);

    const limit = this.normalizeLimit(query.limit);

    const sortBy = this.normalizeSortField(query.sortBy);

    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      model
        .find(filter)
        .sort({
          [sortBy]: sortOrder,
        })
        .skip(skip)
        .limit(limit)
        .lean<T[]>()
        .exec(),

      model.countDocuments(filter).exec(),
    ]);

    return {
      data,

      page,

      limit,

      total,

      totalPages: Math.ceil(total / limit),
    };
  }

  private normalizePage(value?: number): number {
    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.max(Math.floor(value as number), 1);
  }

  private normalizeLimit(value?: number): number {
    if (!Number.isFinite(value)) {
      return 50;
    }

    return Math.min(Math.max(Math.floor(value as number), 1), 200);
  }

  private normalizeSortField(value?: string): string {
    if (!value?.trim()) {
      return 'createdAt';
    }

    const normalized = value.trim();

    if (!/^[a-zA-Z0-9_]+$/.test(normalized)) {
      return 'createdAt';
    }

    return normalized;
  }

  private addDateRange(
    filter: Record<string, unknown>,
    field: string,
    from?: Date,
    to?: Date,
  ): void {
    if (!from && !to) {
      return;
    }

    filter[field] = {};

    if (from) {
      (filter[field] as Record<string, Date>).$gte = from;
    }

    if (to) {
      (filter[field] as Record<string, Date>).$lt = to;
    }
  }

  // ============================================================
  // ADMIN: ACTIVE COMPETITIONS
  // ============================================================

  async getAdminActiveCompetitions(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.competitionId) {
      filter.competitionId = query.competitionId.trim().toLowerCase();
    }

    if (typeof query.season === 'number') {
      filter.season = query.season;
    }

    return this.paginateModel(this.activeCompetitionModel, query, filter);
  }

  // ============================================================
  // ADMIN: SPORTS SYNC STATES
  // ============================================================

  async getAdminSportsSyncStates(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.kind) {
      filter.kind = query.kind;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.type) {
      filter.jobType = query.type;
    }

    if (query.stateKey) {
      filter.stateKey = query.stateKey.trim();
    }

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim().toLowerCase();
    }

    if (typeof query.season === 'number') {
      filter.season = query.season;
    }

    if (query.eventId) {
      filter.eventId = query.eventId.trim();
    }

    const result = await this.paginateModel<SportsSyncStateDocument>(
      this.sportsSyncStateModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'updatedAt',
      },
      filter,
    );

    return {
      ...result,

      data: result.data.map((state) => this.summarizeSyncState(state)),
    };
  }

  async getAdminSportsSyncStateSummary(): Promise<unknown> {
    const [
      queueStates,
      cronStates,
      processingStates,
      pendingStates,
      partialStates,
      failedStates,
      successfulStates,
    ] = await Promise.all([
      this.sportsSyncStateModel.countDocuments({
        kind: SportsSyncStateKind.QUEUE,
      }),

      this.sportsSyncStateModel.countDocuments({
        kind: SportsSyncStateKind.CRON,
      }),

      this.sportsSyncStateModel.countDocuments({
        status: SportsSyncStateStatus.PROCESSING,
      }),

      this.sportsSyncStateModel.countDocuments({
        status: SportsSyncStateStatus.PENDING,
      }),

      this.sportsSyncStateModel.countDocuments({
        status: SportsSyncStateStatus.PARTIAL,
      }),

      this.sportsSyncStateModel.countDocuments({
        status: SportsSyncStateStatus.FAILED,
      }),

      this.sportsSyncStateModel.countDocuments({
        status: SportsSyncStateStatus.SUCCESS,
      }),
    ]);

    const current = await this.sportsSyncStateModel
      .findOne({
        status: SportsSyncStateStatus.PROCESSING,
      })
      .sort({
        updatedAt: -1,
      })
      .lean()
      .exec();

    return {
      total: queueStates + cronStates,

      kind: {
        queue: queueStates,
        cron: cronStates,
      },

      status: {
        pending: pendingStates,
        processing: processingStates,
        partial: partialStates,
        failed: failedStates,
        success: successfulStates,
      },

      current: current
        ? {
            ...this.summarizeSyncState(current),

            currentUnit: this.getCurrentSyncUnit(current),
          }
        : null,
    };
  }

  async getAdminSportsSyncState(stateKey: string) {
    const normalizedStateKey = stateKey.trim();

    if (!normalizedStateKey) {
      return null;
    }

    const state = await this.sportsSyncStateModel
      .findOne({
        stateKey: normalizedStateKey,
      })
      .lean()
      .exec();

    if (!state) {
      return null;
    }

    const units = state.units ?? [];

    const dates = units.filter((unit) => unit.type === SportsSyncUnitType.DATE);

    const steps = units.filter((unit) => unit.type === SportsSyncUnitType.STEP);

    return {
      ...state,

      progress: {
        total: units.length,

        completed: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.SUCCESS,
        ).length,

        processing: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.PROCESSING,
        ).length,

        pending: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.PENDING,
        ).length,

        failed: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.FAILED,
        ).length,

        dates: {
          total: dates.length,

          completed: dates.filter(
            (unit) => unit.status === SportsSyncUnitStatus.SUCCESS,
          ).length,

          processing: dates.filter(
            (unit) => unit.status === SportsSyncUnitStatus.PROCESSING,
          ).length,

          pending: dates.filter(
            (unit) => unit.status === SportsSyncUnitStatus.PENDING,
          ).length,

          failed: dates.filter(
            (unit) => unit.status === SportsSyncUnitStatus.FAILED,
          ).length,
        },

        steps: {
          total: steps.length,

          completed: steps.filter(
            (unit) => unit.status === SportsSyncUnitStatus.SUCCESS,
          ).length,

          processing: steps.filter(
            (unit) => unit.status === SportsSyncUnitStatus.PROCESSING,
          ).length,

          pending: steps.filter(
            (unit) => unit.status === SportsSyncUnitStatus.PENDING,
          ).length,

          failed: steps.filter(
            (unit) => unit.status === SportsSyncUnitStatus.FAILED,
          ).length,
        },

        percent:
          units.length > 0
            ? Math.round(
                (units.filter(
                  (unit) => unit.status === SportsSyncUnitStatus.SUCCESS,
                ).length /
                  units.length) *
                  100,
              )
            : 0,
      },

      currentUnit: this.getCurrentSyncUnit(state),

      incompleteUnits: units
        .filter(
          (unit) =>
            unit.status === SportsSyncUnitStatus.PENDING ||
            unit.status === SportsSyncUnitStatus.PROCESSING ||
            unit.status === SportsSyncUnitStatus.FAILED,
        )
        .map((unit) => ({
          key: unit.key,
          type: unit.type,
          dateKey: unit.dateKey,
          stepKey: unit.stepKey,
          status: unit.status,
          attempts: unit.attempts,
          startedAt: unit.startedAt,
          completedAt: unit.completedAt,
          nextAttemptAt: unit.nextAttemptAt,
          lastError: unit.lastError,
        })),
    };
  }

  private summarizeSyncState(state: SportsSyncStateDocument) {
    const units = state.units ?? [];

    const completed = units.filter(
      (unit) => unit.status === SportsSyncUnitStatus.SUCCESS,
    ).length;

    return {
      stateKey: state.stateKey,

      kind: state.kind,

      jobType: state.jobType,

      taskKey: state.taskKey,

      leagueId: state.leagueId,

      season: state.season,

      eventId: state.eventId,

      priority: state.priority,

      status: state.status,

      trackingMode: state.trackingMode,

      dateFrom: state.dateFrom,

      dateTo: state.dateTo,

      cronExpression: state.cronExpression,

      timeZone: state.timeZone,

      lastStartedAt: state.lastStartedAt,

      lastSuccessfulAt: state.lastSuccessfulAt,

      nextRunAt: state.nextRunAt,

      lastCompletedAt: state.lastCompletedAt,

      lastQueueJobKey: state.lastQueueJobKey,

      consecutiveFailures: state.consecutiveFailures,

      lastError: state.lastError,

      units,

      updatedAt: state.updatedAt,

      createdAt: state.createdAt,

      progress: {
        total: units.length,

        completed,

        processing: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.PROCESSING,
        ).length,

        pending: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.PENDING,
        ).length,

        failed: units.filter(
          (unit) => unit.status === SportsSyncUnitStatus.FAILED,
        ).length,

        percent:
          units.length > 0 ? Math.round((completed / units.length) * 100) : 0,
      },

      currentUnit: this.getCurrentSyncUnit(state),
    };
  }

  private getCurrentSyncUnit(state: Pick<SportsSyncState, 'units'> | null) {
    if (!state?.units?.length) {
      return null;
    }

    const unit =
      state.units.find(
        (candidate) => candidate.status === SportsSyncUnitStatus.PROCESSING,
      ) ??
      state.units.find(
        (candidate) =>
          candidate.status === SportsSyncUnitStatus.FAILED ||
          candidate.status === SportsSyncUnitStatus.PENDING,
      );

    if (!unit) {
      return null;
    }

    return {
      key: unit.key,

      type: unit.type,

      dateKey: unit.dateKey,

      stepKey: unit.stepKey,

      status: unit.status,

      attempts: unit.attempts,

      startedAt: unit.startedAt,

      completedAt: unit.completedAt,

      nextAttemptAt: unit.nextAttemptAt,

      lastError: unit.lastError,
    };
  }

  // ============================================================
  // ADMIN: ESPN QUEUE
  // ============================================================

  async getAdminEspnQueues(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.type) {
      filter.type = query.type;
    }

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim();
    }

    if (query.eventId) {
      filter.eventId = query.eventId.trim();
    }

    if (query.competitionId) {
      filter.competitionId = query.competitionId.trim();
    }

    if (typeof query.season === 'number') {
      filter.season = query.season;
    }

    this.addDateRange(filter, 'scheduledFor', query.from, query.to);

    return this.paginateModel(
      this.espnQueueModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'scheduledFor',
      },
      filter,
    );
  }

  async getAdminEspnQueueSummary() {
    const [
      pending,
      processing,
      completed,
      failed,
      fixtureRefresh,
      summaryRefresh,
      total,
    ] = await Promise.all([
      this.espnQueueModel.countDocuments({
        status: EspnQueueStatus.PENDING,
      }),

      this.espnQueueModel.countDocuments({
        status: EspnQueueStatus.PROCESSING,
      }),

      this.espnQueueModel.countDocuments({
        status: EspnQueueStatus.COMPLETED,
      }),

      this.espnQueueModel.countDocuments({
        status: EspnQueueStatus.FAILED,
      }),

      this.espnQueueModel.countDocuments({
        type: EspnQueueJobType.FIXTURE_REFRESH,
      }),

      this.espnQueueModel.countDocuments({
        type: EspnQueueJobType.SUMMARY_REFRESH,
      }),

      this.espnQueueModel.countDocuments(),
    ]);

    return {
      total,

      status: {
        pending,
        processing,
        completed,
        failed,
      },

      type: {
        fixtureRefresh,
        summaryRefresh,
      },
    };
  }

  // ============================================================
  // ADMIN: ESPN FIXTURES
  // ============================================================

  async getAdminEspnFixtures(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim();
    }

    if (query.eventId) {
      filter.eventId = query.eventId.trim();
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (typeof query.season === 'number') {
      filter.season = query.season;
    }

    if (query.teamId) {
      filter.$or = [
        {
          homeTeamId: query.teamId.trim(),
        },
        {
          awayTeamId: query.teamId.trim(),
        },
      ];
    }

    this.addDateRange(filter, 'fixtureDate', query.from, query.to);

    return this.paginateModel(
      this.espnFixtureModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'fixtureDate',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: ESPN LEAGUES
  // ============================================================

  async getAdminEspnLeagues(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim();
    }

    if (query.status) {
      filter.isActive = query.status === 'active';
    }

    return this.paginateModel(
      this.espnLeagueModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'name',
        sortOrder: query.sortOrder ?? 'asc',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: ESPN LIVE MATCHES
  // ============================================================

  async getAdminEspnLiveMatches(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {
      live: true,
    };

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim().toLowerCase();
    }

    if (query.eventId) {
      filter.eventId = query.eventId.trim();
    }

    return this.paginateModel(
      this.espnFixtureModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'fixtureDate',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: ESPN NEWS
  // ============================================================

  async getAdminEspnNews(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    this.addDateRange(filter, 'collectedAt', query.from, query.to);

    return this.paginateModel(
      this.espnNewsModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'collectedAt',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: ESPN STANDINGS FALLBACK
  // ============================================================

  async getAdminEspnStandings(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim();
    }

    if (query.teamId) {
      filter.teamId = query.teamId.trim();
    }

    if (typeof query.season === 'number') {
      filter.season = query.season;
    }

    return this.paginateModel(
      this.espnStandingModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'rank',
        sortOrder: query.sortOrder ?? 'asc',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: ESPN TEAMS
  // ============================================================

  async getAdminEspnTeams(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.leagueId) {
      filter.leagueId = query.leagueId.trim();
    }

    if (query.teamId) {
      filter.teamId = query.teamId.trim();
    }

    return this.paginateModel(
      this.espnTeamModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'name',
        sortOrder: query.sortOrder ?? 'asc',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: FOOTBALL-DATA COMPETITIONS
  // ============================================================

  async getAdminFootballDataCompetitions(query: SportsAdminQuery = {}) {
    return this.paginateModel(this.footballDataCompetitionModel, {
      ...query,
      sortBy: query.sortBy ?? 'name',
      sortOrder: query.sortOrder ?? 'asc',
    });
  }

  // ============================================================
  // ADMIN: FOOTBALL-DATA MATCHES
  // ============================================================

  async getAdminFootballDataMatches(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.competitionId) {
      filter.competitionCode = query.competitionId.trim().toUpperCase();
    }

    if (query.status) {
      filter.status = query.status;
    }

    this.addDateRange(filter, 'utcDate', query.from, query.to);

    return this.paginateModel(
      this.footballDataMatchModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'utcDate',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: FOOTBALL-DATA STANDINGS
  // ============================================================

  async getAdminFootballDataStandings(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.competitionId) {
      filter.competitionCode = query.competitionId.trim().toUpperCase();
    }

    if (typeof query.season === 'number') {
      filter.seasonId = query.season;
    }

    return this.paginateModel(
      this.footballDataStandingModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'seasonId',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: FOOTBALL-DATA TEAMS
  // ============================================================

  async getAdminFootballDataTeams(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.competitionId) {
      filter.competitionCode = query.competitionId.trim().toUpperCase();
    }

    if (query.teamId) {
      filter.teamId = Number(query.teamId);
    }

    return this.paginateModel(
      this.footballDataTeamModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'name',
        sortOrder: query.sortOrder ?? 'asc',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: ODDS API SPORTS
  // ============================================================

  async getAdminOddsApiSports(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.provider) {
      filter.sportKey = query.provider.trim();
    }

    return this.paginateModel(
      this.oddsApiSportModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'title',
        sortOrder: query.sortOrder ?? 'asc',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: SPORTS ODDS SNAPSHOTS
  // ============================================================

  async getAdminSportsOddsSnapshots(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.eventId) {
      filter.eventId = query.eventId.trim();
    }

    if (query.provider) {
      filter.provider = query.provider.trim();
    }

    this.addDateRange(filter, 'collectedAt', query.from, query.to);

    return this.paginateModel(
      this.sportsOddsSnapshotModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'collectedAt',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: PROVIDER RATE LIMITS
  // ============================================================

  async getAdminProviderRateLimits(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.provider) {
      filter.provider = query.provider.trim();
    }

    return this.paginateModel(
      this.sportsProviderRateLimitModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'provider',
        sortOrder: query.sortOrder ?? 'asc',
      },
      filter,
    );
  }

  // ============================================================
  // ADMIN: YOUTUBE HIGHLIGHTS
  // ============================================================

  async getAdminYoutubeHighlights(query: SportsAdminQuery = {}) {
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.eventId) {
      filter.fixtureId = query.eventId.trim();
    }

    if (query.competitionId) {
      filter.competitionId = query.competitionId.trim();
    }

    this.addDateRange(filter, 'searchedAt', query.from, query.to);

    return this.paginateModel(
      this.youtubeHighlightModel,
      {
        ...query,
        sortBy: query.sortBy ?? 'searchedAt',
      },
      filter,
    );
  }

  // ============================================================
  // PREDICTION READ CONTRACT
  // ============================================================

  /**
   * Returns the canonical Sports snapshot that Predictions are allowed
   * to consume. This method owns all Sports-side readiness checks.
   *
   * No caller in the Predictions module should reconstruct fixture,
   * Summary, team, or competition readiness independently.
   */
  async getPredictionData(
    eventId: string,
  ): Promise<SportsPredictionData | null> {
    const normalizedEventId = eventId.trim();

    if (!normalizedEventId) {
      return null;
    }

    /*
     * Prediction calculation must never hydrate the complete ESPN fixture
     * document or complete Summary payload.
     *
     * Only the fixture identity/state fields, prediction-relevant Summary
     * sections, active competition metadata, and the two participating teams
     * are loaded.
     */
    const fixture = await this.espnFixtureModel
      .findOne({
        eventId: normalizedEventId,
      })
      .select({
        _id: 0,
        eventId: 1,
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
        live: 1,
        completed: 1,
        homeTeamId: 1,
        awayTeamId: 1,
        collectedAt: 1,
        'payload.summary.predictor': 1,
        'payload.summary.winprobability': 1,
        'payload.summary.winProbability': 1,
        'payload.summary.pickcenter': 1,
        'payload.summary.odds': 1,
        'payload.summaryCollectedAt': 1,
      })
      .lean()
      .exec();

    if (!fixture) {
      return null;
    }

    const [competition, teams] = await Promise.all([
      this.activeCompetitionModel
        .findOne({
          competitionId: fixture.leagueId,
        })
        .select({
          _id: 0,
          competitionId: 1,
          name: 1,
          status: 1,
          season: 1,
          espnPayload: 1,
        })
        .lean()
        .exec(),

      this.espnTeamModel
        .find({
          leagueId: fixture.leagueId,
          teamId: {
            $in: [fixture.homeTeamId, fixture.awayTeamId],
          },
        })
        .select({
          _id: 0,
          teamId: 1,
          leagueId: 1,
          name: 1,
          displayName: 1,
          shortDisplayName: 1,
          logo: 1,
          collectedAt: 1,
        })
        .lean()
        .exec(),
    ]);

    const payload =
      fixture.payload && typeof fixture.payload === 'object'
        ? (fixture.payload as Record<string, unknown>)
        : {};

    const storedSummary =
      payload.summary && typeof payload.summary === 'object'
        ? (payload.summary as Record<string, unknown>)
        : {};

    const summary: SportsPredictionData['summary'] = {
      predictor: storedSummary.predictor,
      winprobability: storedSummary.winprobability,
      winProbability: storedSummary.winProbability,
      pickcenter: storedSummary.pickcenter,
      odds: storedSummary.odds,
    };

    const summaryAvailable = Object.values(summary).some(
      (section) => section !== undefined && section !== null,
    );

    const summaryCollectedAt = payload.summaryCollectedAt ?? null;

    const now = new Date();

    const fixtureIsFuture = fixture.fixtureDate > now;
    const fixtureIsNotLive = fixture.live !== true;
    const fixtureIsNotCompleted = fixture.completed !== true;
    const summaryTimestampAvailable = Boolean(summaryCollectedAt);
    const competitionAvailable = Boolean(competition);
    const competitionOperational = Boolean(
      competition &&
      [
        ActiveCompetitionStatus.ACTIVE,
        ActiveCompetitionStatus.UPCOMING,
      ].includes(competition.status),
    );
    const seasonMatches = Boolean(
      !competition?.season || competition.season === fixture.season,
    );
    const homeTeam = teams.find(
      (team) => String(team.teamId) === String(fixture.homeTeamId),
    );
    const awayTeam = teams.find(
      (team) => String(team.teamId) === String(fixture.awayTeamId),
    );
    const teamsAvailable = Boolean(homeTeam && awayTeam);

    const notReadyReasons: string[] = [];

    if (!fixtureIsFuture) {
      notReadyReasons.push('FIXTURE_NOT_FUTURE');
    }

    if (!fixtureIsNotLive) {
      notReadyReasons.push('FIXTURE_LIVE');
    }

    if (!fixtureIsNotCompleted) {
      notReadyReasons.push('FIXTURE_COMPLETED');
    }

    if (!summaryAvailable) {
      notReadyReasons.push('SUMMARY_MISSING');
    }

    if (!summaryTimestampAvailable) {
      notReadyReasons.push('SUMMARY_TIMESTAMP_MISSING');
    }

    if (!competitionAvailable) {
      notReadyReasons.push('COMPETITION_MISSING');
    } else if (!competitionOperational) {
      notReadyReasons.push('COMPETITION_NOT_OPERATIONAL');
    }

    if (!seasonMatches) {
      notReadyReasons.push('SEASON_MISMATCH');
    }

    if (!teamsAvailable) {
      notReadyReasons.push('TEAMS_MISSING');
    }

    const fixtureSnapshot: SportsPredictionData['fixture'] = {
      eventId: fixture.eventId,
      leagueId: fixture.leagueId,
      season: fixture.season,
      fixtureDate: fixture.fixtureDate,
      live: fixture.live,
      completed: fixture.completed,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      collectedAt: fixture.collectedAt,
    };

    const competitionSnapshot: SportsPredictionData['competition'] = competition
      ? {
          competitionId: competition.competitionId,
          name: competition.name,
          status: competition.status,
          season: competition.season,
          espnPayload: competition.espnPayload,
        }
      : null;

    return {
      ready: notReadyReasons.length === 0,
      reason: notReadyReasons[0] ?? null,
      reasons: notReadyReasons,

      fixture: fixtureSnapshot,

      summary,

      competition: competitionSnapshot,

      homeTeam: homeTeam ?? null,
      awayTeam: awayTeam ?? null,

      fixtureCollectedAt: fixture.collectedAt,
      summaryCollectedAt,
    };
  }

  // ============================================================
  // SETTLEMENT READ CONTRACT
  // ============================================================

  async getSettlementData(
    eventId: string,
  ): Promise<SportsSettlementData | null> {
    const normalizedEventId = eventId.trim();

    if (!normalizedEventId) {
      return null;
    }

    const fixture = await this.espnFixtureModel
      .findOne({
        eventId: normalizedEventId,
      })
      .lean()
      .exec();

    if (!fixture) {
      return null;
    }

    const payload =
      fixture.payload && typeof fixture.payload === 'object'
        ? fixture.payload
        : undefined;

    const summary =
      payload?.summary && typeof payload.summary === 'object'
        ? (payload.summary as Record<string, unknown>)
        : null;

    return {
      fixture,
      summary,
      summaryCollectedAt: payload?.summaryCollectedAt ?? null,
    };
  }

  async getSettlementDataByEventIds(
    eventIds: string[],
  ): Promise<SportsSettlementData[]> {
    const normalizedEventIds = [
      ...new Set(eventIds.map((id) => id.trim()).filter(Boolean)),
    ];

    if (!normalizedEventIds.length) {
      return [];
    }

    const fixtures = await this.espnFixtureModel
      .find({
        eventId: {
          $in: normalizedEventIds,
        },
      })
      .lean()
      .exec();

    return fixtures.map((fixture) => {
      const payload =
        fixture.payload && typeof fixture.payload === 'object'
          ? fixture.payload
          : undefined;

      const summary =
        payload?.summary && typeof payload.summary === 'object'
          ? (payload.summary as Record<string, unknown>)
          : null;

      return {
        fixture,
        summary,
        summaryCollectedAt: payload?.summaryCollectedAt ?? null,
      };
    });
  }

  // ============================================================
  // FIXTURE HELPERS
  // ============================================================

  async getFixtureByEventId(
    eventId: string,
  ): Promise<EspnFixtureDocument | null> {
    const normalizedEventId = eventId.trim();

    if (!normalizedEventId) {
      return null;
    }

    return this.espnFixtureModel
      .findOne({
        eventId: normalizedEventId,
      })
      .lean()
      .exec();
  }

  async getFixturesByEventIds(
    eventIds: string[],
  ): Promise<EspnFixtureDocument[]> {
    const normalizedEventIds = [
      ...new Set(eventIds.map((id) => id.trim()).filter(Boolean)),
    ];

    if (!normalizedEventIds.length) {
      return [];
    }

    return this.espnFixtureModel
      .find({
        eventId: {
          $in: normalizedEventIds,
        },
      })
      .lean()
      .exec();
  }
}
