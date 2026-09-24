import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  ActiveCompetition,
  ActiveCompetitionDocument,
} from '../schemas/active-competition.schema';

import {
  EspnLeague,
  EspnLeagueDocument,
} from '../schemas/espn/espn-league.schema';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { EspnTeam, EspnTeamDocument } from '../schemas/espn/espn-team.schema';

import {
  EspnStanding,
  EspnStandingDocument,
} from '../schemas/espn/espn-standing.schema';

import { EspnNews, EspnNewsDocument } from '../schemas/espn/espn-news.schema';

import { EspnQueue, EspnQueueDocument } from '../schemas/espn-queue.schema';

import {
  EspnQueueJobType,
  EspnQueueStatus,
} from '../interfaces/espn-queue.interface';

import {
  SportsSyncState,
  SportsSyncStateDocument,
  SportsSyncStateKind,
  SportsSyncStateStatus,
  SportsSyncUnitStatus,
} from '../schemas/sports-sync-state.schema';

import {
  SportsProviderRateLimit,
  SportsProviderRateLimitDocument,
} from '../schemas/sports-provider-rate-limit.schema';

import {
  TeamCompetitionStats,
  TeamCompetitionStatsDocument,
} from '../schemas/team-competition-stats.schema';

import {
  TeamPerformanceProfile,
  TeamPerformanceProfileDocument,
} from '../schemas/team-performance-profile.schema';

import { HeadToHead, HeadToHeadDocument } from '../schemas/head-to-head.schema';

import {
  MatchDerivedData,
  MatchDerivedDataDocument,
} from '../schemas/match-derived-data.schema';

import {
  YouTubeHighlight,
  YouTubeHighlightDocument,
} from '../schemas/youtube-highlight.schema';

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

import { SportsProviderRateLimitService } from './sports-provider-rate-limit.service';

import {
  MonitorCoverageMetric,
  MonitorDerivedSummary,
  MonitorExpectedWork,
  MonitorInventory,
  MonitorLeagueSummary,
  MonitorPipelineDefinition,
  MonitorProviderSummary,
  MonitorQueueItem,
  MonitorQueueSummary,
  MonitorSyncFailure,
  MonitorSyncStageSummary,
  MonitorSyncSummary,
  MonitorUpcomingFixture,
  MonitorUpcomingSummary,
  SportsSystemMonitorQuery,
  SportsSystemMonitorResponse,
} from '../interfaces/sports-system-monitor.interface';

interface LeagueContext {
  competition: ActiveCompetitionDocument;
  key: string;
  aliases: string[];
  season?: number;
}

interface FixtureAggregate {
  total: number;
  upcoming: number;
  live: number;
  finished: number;
  finishedWithSummary: number;
  finishedMissingSummary: number;
  latestCollectedAt?: Date;
  storedSeasons: number;
}

interface TeamAggregate {
  documents: number;
  teamIds: Set<string>;
  latestCollectedAt?: Date;
}

interface StandingAggregate {
  rows: number;
  teamIds: Set<string>;
  latestCollectedAt?: Date;
}

interface NewsAggregate {
  total: number;
  last24Hours: number;
  latestPublishedAt?: Date;
  latestCollectedAt?: Date;
}

interface DerivedTeamAggregate {
  documents: number;
  teamIds: Set<string>;
  latestCalculatedAt?: Date;
}

interface DerivedMatchAggregate {
  documents: number;
  latestCalculatedAt?: Date;
}

interface DerivedAggregate {
  teamStats: Map<string, DerivedTeamAggregate>;
  profiles: Map<string, DerivedTeamAggregate>;
  matchDerived: Map<string, DerivedMatchAggregate>;
  h2hPairs: Map<string, Set<string>>;
  h2hLatestMeetingAt: Map<string, Date | undefined>;
  h2hLatestCalculatedAt: Map<string, Date | undefined>;
}

interface QueueAggregate {
  total: number;
  byStatus: Map<string, number>;
  byType: Map<string, number>;
  byTypeAndStatus: Map<string, number>;
  staleProcessing: number;
  latestFailureAt?: Date;
  latestFailure?: string;
  latestCompletedAt?: Date;
}

interface SyncAggregate {
  stateCounts: Record<string, number>;
  queueStates: number;
  cronStates: number;
  unitProgress: {
    total: number;
    success: number;
    processing: number;
    pending: number;
    failed: number;
  };
  currentStages: MonitorSyncStageSummary[];
  failures: MonitorSyncFailure[];
  cron: SportsSystemMonitorResponse['sync']['cron'];
  latestSuccessfulAt?: Date;
  latestCompletedAt?: Date;
  nextRunAt?: Date;
}

interface OperationalSeasonData {
  fixtures: Map<string, FixtureAggregate>;
  expectedTeams: Map<string, Set<string>>;
  expectedPairs: Map<string, Set<string>>;
  standings: Map<string, StandingAggregate>;
}

interface UpcomingIndexes {
  stats: Set<string>;
  profiles: Set<string>;
  derived: Set<string>;
  h2h: Set<string>;
  odds: Set<string>;
}

interface ProviderConfig {
  minIntervalSeconds: number;
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
}

interface ProviderStatePeriods {
  dailyPeriod?: Date | string;
  monthlyPeriod?: Date | string;
}

const COMPLETED_STATUSES = new Set([
  'FT',
  'AET',
  'PEN',
  'FINAL',
  'FINISHED',
  'COMPLETED',
  'POST',
  'STATUS_FINAL',
]);

const QUEUE_COMPLETED_RETENTION_DAYS = 7;
const STALE_PROCESSING_MINUTES = 15;
const UPCOMING_WINDOW_DAYS = 4;

type ConfiguredSportsProvider = Parameters<
  SportsProviderRateLimitService['getDailyUsage']
>[0];

const PROVIDER_CONFIG: Record<ConfiguredSportsProvider, ProviderConfig> = {
  espn: {
    minIntervalSeconds: 2,
    dailyRequestLimit: null,
    monthlyRequestLimit: null,
  },
  'football-data': {
    minIntervalSeconds: 60,
    dailyRequestLimit: null,
    monthlyRequestLimit: null,
  },
  'odds-api': {
    minIntervalSeconds: 60,
    dailyRequestLimit: null,
    monthlyRequestLimit: 500,
  },
  youtube: {
    minIntervalSeconds: 200,
    dailyRequestLimit: 90,
    monthlyRequestLimit: null,
  },
};

@Injectable()
export class SportsSystemMonitorService {
  constructor(
    @InjectModel(ActiveCompetition.name)
    private readonly activeCompetitionModel: Model<ActiveCompetitionDocument>,

    @InjectModel(EspnLeague.name)
    private readonly espnLeagueModel: Model<EspnLeagueDocument>,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(EspnTeam.name)
    private readonly espnTeamModel: Model<EspnTeamDocument>,

    @InjectModel(EspnStanding.name)
    private readonly espnStandingModel: Model<EspnStandingDocument>,

    @InjectModel(EspnNews.name)
    private readonly espnNewsModel: Model<EspnNewsDocument>,

    @InjectModel(EspnQueue.name)
    private readonly espnQueueModel: Model<EspnQueueDocument>,

    @InjectModel(SportsSyncState.name)
    private readonly sportsSyncStateModel: Model<SportsSyncStateDocument>,

    @InjectModel(SportsProviderRateLimit.name)
    private readonly sportsProviderRateLimitModel: Model<SportsProviderRateLimitDocument>,

    @InjectModel(TeamCompetitionStats.name)
    private readonly teamCompetitionStatsModel: Model<TeamCompetitionStatsDocument>,

    @InjectModel(TeamPerformanceProfile.name)
    private readonly teamPerformanceProfileModel: Model<TeamPerformanceProfileDocument>,

    @InjectModel(HeadToHead.name)
    private readonly headToHeadModel: Model<HeadToHeadDocument>,

    @InjectModel(MatchDerivedData.name)
    private readonly matchDerivedDataModel: Model<MatchDerivedDataDocument>,

    @InjectModel(YouTubeHighlight.name)
    private readonly youtubeHighlightModel: Model<YouTubeHighlightDocument>,

    @InjectModel(FootballDataCompetition.name)
    private readonly footballDataCompetitionModel: Model<FootballDataCompetitionDocument>,

    @InjectModel(FootballDataMatch.name)
    private readonly footballDataMatchModel: Model<FootballDataMatchDocument>,

    @InjectModel(FootballDataStanding.name)
    private readonly footballDataStandingModel: Model<FootballDataStandingDocument>,

    @InjectModel(FootballDataTeam.name)
    private readonly footballDataTeamModel: Model<FootballDataTeamDocument>,

    @InjectModel(OddsApiSport.name)
    private readonly oddsApiSportModel: Model<OddsApiSportDocument>,

    @InjectModel(SportsOddsSnapshot.name)
    private readonly sportsOddsSnapshotModel: Model<SportsOddsSnapshotDocument>,

    private readonly providerRateLimitService: SportsProviderRateLimitService,
  ) {}

  // ============================================================
  // PUBLIC
  // ============================================================

  async getSystemMonitor(
    query: SportsSystemMonitorQuery = {},
  ): Promise<SportsSystemMonitorResponse> {
    const generatedAt = new Date();

    const activeCompetitions = await this.getActiveCompetitions(query);

    const catalogue = await this.espnLeagueModel.find({}).lean().exec();

    const catalogueById = new Map<string, EspnLeagueDocument>();

    for (const league of catalogue) {
      catalogueById.set(this.normalize(league.leagueId), league);
    }

    const contexts = activeCompetitions.map((competition) => ({
      competition,
      key: this.normalize(competition.competitionId),
      aliases: [
        ...new Set(
          [competition.competitionId, competition.espnLeagueSlug]
            .map((value) => this.normalize(value))
            .filter(Boolean),
        ),
      ],
      season:
        typeof competition.season === 'number' ? competition.season : undefined,
    }));

    const [inventory, queue, sync, providers] = await Promise.all([
      this.buildInventory(),
      this.buildQueueSummary(),
      this.buildSyncSummary(),
      this.buildProviderSummaries(),
    ]);

    const pipeline = this.buildPipelineDefinitions(sync);

    if (!contexts.length) {
      return {
        generatedAt,
        scope: {
          activeLeagueFilter: query.leagueId
            ? this.normalize(query.leagueId)
            : undefined,
          activeCompetitions: 0,
          catalogueCompetitions: catalogue.length,
          operationalSeasonScope: true,
        },
        inventory,
        queue,
        sync,
        pipeline,
        providers,
        expectedWork: this.emptyExpectedWork(),
        leagues: [],
        architectureNotes: this.getArchitectureNotes(),
      };
    }

    const operationalSeasonData = await this.buildOperationalSeasonData(
      contexts,
      generatedAt,
    );

    const teamAggregates = await this.aggregateTeams(contexts);

    const newsAggregates = await this.aggregateNews(contexts, generatedAt);

    const derivedAggregates = await this.aggregateDerivedData(contexts);

    const queueAggregates = await this.aggregateQueueData(contexts);

    const syncAggregates = await this.aggregateSyncData(contexts);

    const upcomingFixtures = await this.loadUpcomingFixtures(
      contexts,
      generatedAt,
    );

    const upcomingIndexes = await this.buildUpcomingIndexes(
      contexts,
      upcomingFixtures,
    );

    const leagues = contexts.map((context) =>
      this.buildLeagueSummary({
        context,
        catalogueById,
        operationalSeasonData,
        teamAggregates,
        newsAggregates,
        derivedAggregates,
        queueAggregates,
        syncAggregates,
        upcomingFixtures,
        upcomingIndexes,
      }),
    );

    const expectedWork = this.sumExpectedWork(
      leagues.map((league) => league.expectedWork),
    );

    return {
      generatedAt,
      scope: {
        activeLeagueFilter: query.leagueId
          ? this.normalize(query.leagueId)
          : undefined,
        activeCompetitions: activeCompetitions.length,
        catalogueCompetitions: catalogue.length,
        operationalSeasonScope: true,
      },
      inventory,
      queue,
      sync,
      pipeline,
      providers,
      expectedWork,
      leagues,
      architectureNotes: this.getArchitectureNotes(),
    };
  }

  // ============================================================
  // ACTIVE COMPETITIONS
  // ============================================================

  private async getActiveCompetitions(
    query: SportsSystemMonitorQuery,
  ): Promise<ActiveCompetitionDocument[]> {
    const filter: Record<string, unknown> = {};

    if (query.leagueId?.trim()) {
      const normalized = this.normalize(query.leagueId);

      filter.$or = [
        {
          competitionId: normalized,
        },
        {
          espnLeagueSlug: normalized,
        },
      ];
    }

    return this.activeCompetitionModel
      .find(filter)
      .sort({
        priority: 1,
        nextFixtureDate: 1,
        name: 1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // INVENTORY
  // ============================================================

  private async buildInventory(): Promise<MonitorInventory> {
    const [
      activeCompetitions,
      espnCatalogue,
      espnFixtures,
      espnTeams,
      espnStandings,
      espnNews,
      espnQueue,
      sportsSyncStates,
      footballDataCompetitions,
      footballDataMatches,
      footballDataStandings,
      footballDataTeams,
      oddsApiSports,
      sportsOddsSnapshots,
      teamCompetitionStats,
      teamPerformanceProfiles,
      headToHeadPairs,
      matchDerivedData,
      youtubeHighlights,
    ] = await Promise.all([
      this.activeCompetitionModel.countDocuments(),
      this.espnLeagueModel.countDocuments(),
      this.espnFixtureModel.countDocuments(),
      this.espnTeamModel.countDocuments(),
      this.espnStandingModel.countDocuments(),
      this.espnNewsModel.countDocuments(),
      this.espnQueueModel.countDocuments(),
      this.sportsSyncStateModel.countDocuments(),
      this.footballDataCompetitionModel.countDocuments(),
      this.footballDataMatchModel.countDocuments(),
      this.footballDataStandingModel.countDocuments(),
      this.footballDataTeamModel.countDocuments(),
      this.oddsApiSportModel.countDocuments(),
      this.sportsOddsSnapshotModel.countDocuments(),
      this.teamCompetitionStatsModel.countDocuments(),
      this.teamPerformanceProfileModel.countDocuments(),
      this.headToHeadModel.countDocuments(),
      this.matchDerivedDataModel.countDocuments(),
      this.youtubeHighlightModel.countDocuments(),
    ]);

    return {
      activeCompetitions,
      espnCatalogue,
      espnFixtures,
      espnTeams,
      espnStandings,
      espnNews,
      espnQueue,
      sportsSyncStates,
      footballDataCompetitions,
      footballDataMatches,
      footballDataStandings,
      footballDataTeams,
      oddsApiSports,
      sportsOddsSnapshots,
      teamCompetitionStats,
      teamPerformanceProfiles,
      headToHeadPairs,
      matchDerivedData,
      youtubeHighlights,
    };
  }

  // ============================================================
  // OPERATIONAL SEASON DATA
  // ============================================================

  private async buildOperationalSeasonData(
    contexts: LeagueContext[],
    now: Date,
  ): Promise<OperationalSeasonData> {
    const clauses = contexts
      .filter((context) => typeof context.season === 'number')
      .flatMap((context) =>
        context.aliases.map((leagueId) => ({
          leagueId,
          season: context.season,
        })),
      );

    const contextByAlias = new Map<string, LeagueContext>();

    for (const context of contexts) {
      for (const alias of context.aliases) {
        contextByAlias.set(alias, context);
      }
    }

    const fixtureRows = clauses.length
      ? await this.espnFixtureModel
          .aggregate<{
            _id: {
              leagueId: string;
              season: number;
            };
            total: number;
            upcoming: number;
            live: number;
            finished: number;
            finishedWithSummary: number;
            latestCollectedAt?: Date;
          }>([
            {
              $match: {
                $or: clauses,
              },
            },
            {
              $group: {
                _id: {
                  leagueId: '$leagueId',
                  season: '$season',
                },
                total: {
                  $sum: 1,
                },
                upcoming: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $gte: ['$fixtureDate', now],
                          },
                          {
                            $ne: ['$completed', true],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                live: {
                  $sum: {
                    $cond: [
                      {
                        $eq: ['$live', true],
                      },
                      1,
                      0,
                    ],
                  },
                },
                finished: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          {
                            $eq: ['$completed', true],
                          },
                          {
                            $in: ['$status', [...COMPLETED_STATUSES]],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                finishedWithSummary: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          {
                            $or: [
                              {
                                $eq: ['$completed', true],
                              },
                              {
                                $in: ['$status', [...COMPLETED_STATUSES]],
                              },
                            ],
                          },
                          {
                            $ne: [
                              {
                                $ifNull: ['$payload.summary', null],
                              },
                              null,
                            ],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                latestCollectedAt: {
                  $max: '$collectedAt',
                },
              },
            },
          ])
          .exec()
      : [];

    const expectedTeams = new Map<string, Set<string>>();

    const expectedPairs = new Map<string, Set<string>>();

    const fixtures = clauses.length
      ? await this.espnFixtureModel
          .find({
            $or: clauses,
          })
          .select({
            leagueId: 1,
            season: 1,
            homeTeamId: 1,
            awayTeamId: 1,
            completed: 1,
            status: 1,
          })
          .lean()
          .exec()
      : [];

    for (const fixture of fixtures) {
      const context = contextByAlias.get(this.normalize(fixture.leagueId));

      if (!context) {
        continue;
      }

      const key = context.key;

      if (!expectedTeams.has(key)) {
        expectedTeams.set(key, new Set<string>());
      }

      if (fixture.homeTeamId) {
        expectedTeams.get(key)!.add(fixture.homeTeamId);
      }

      if (fixture.awayTeamId) {
        expectedTeams.get(key)!.add(fixture.awayTeamId);
      }

      if (this.isCompletedFixture(fixture)) {
        const pair = this.pairKey(fixture.homeTeamId, fixture.awayTeamId);

        if (pair) {
          if (!expectedPairs.has(key)) {
            expectedPairs.set(key, new Set<string>());
          }

          expectedPairs.get(key)!.add(pair);
        }
      }
    }

    const standingRows = clauses.length
      ? await this.espnStandingModel
          .aggregate<{
            _id: {
              leagueId: string;
              season: number;
            };
            rows: number;
            teamIds: string[];
            latestCollectedAt?: Date;
          }>([
            {
              $match: {
                $or: clauses,
              },
            },
            {
              $group: {
                _id: {
                  leagueId: '$leagueId',
                  season: '$season',
                },
                rows: {
                  $sum: 1,
                },
                teamIds: {
                  $addToSet: '$teamId',
                },
                latestCollectedAt: {
                  $max: '$collectedAt',
                },
              },
            },
          ])
          .exec()
      : [];

    for (const row of standingRows) {
      const context = contextByAlias.get(this.normalize(row._id.leagueId));

      if (!context) {
        continue;
      }

      const key = context.key;

      if (!expectedTeams.has(key)) {
        expectedTeams.set(key, new Set<string>());
      }

      for (const teamId of row.teamIds ?? []) {
        if (teamId) {
          expectedTeams.get(key)!.add(teamId);
        }
      }
    }

    const standings = new Map<string, StandingAggregate>();

    for (const row of standingRows) {
      const context = contextByAlias.get(this.normalize(row._id.leagueId));

      if (!context) {
        continue;
      }

      const key = context.key;

      const existing = standings.get(key);

      const incomingTeamIds = new Set((row.teamIds ?? []).filter(Boolean));

      if (!existing) {
        standings.set(key, {
          rows: Number(row.rows ?? 0),
          teamIds: incomingTeamIds,
          latestCollectedAt: row.latestCollectedAt,
        });
        continue;
      }

      existing.rows += Number(row.rows ?? 0);

      for (const teamId of incomingTeamIds) {
        existing.teamIds.add(teamId);
      }

      if (
        row.latestCollectedAt &&
        (!existing.latestCollectedAt ||
          new Date(row.latestCollectedAt).getTime() >
            new Date(existing.latestCollectedAt).getTime())
      ) {
        existing.latestCollectedAt = row.latestCollectedAt;
      }
    }

    const fixtureAggregates = new Map<string, FixtureAggregate>();

    for (const row of fixtureRows) {
      const context = contextByAlias.get(this.normalize(row._id.leagueId));

      if (!context) {
        continue;
      }

      const key = context.key;
      const existing = fixtureAggregates.get(key);

      const incoming: FixtureAggregate = {
        total: Number(row.total ?? 0),
        upcoming: Number(row.upcoming ?? 0),
        live: Number(row.live ?? 0),
        finished: Number(row.finished ?? 0),
        finishedWithSummary: Number(row.finishedWithSummary ?? 0),
        finishedMissingSummary: Math.max(
          0,
          Number(row.finished ?? 0) - Number(row.finishedWithSummary ?? 0),
        ),
        latestCollectedAt: row.latestCollectedAt,
        storedSeasons: 1,
      };

      if (!existing) {
        fixtureAggregates.set(key, incoming);
        continue;
      }

      existing.total += incoming.total;
      existing.upcoming += incoming.upcoming;
      existing.live += incoming.live;
      existing.finished += incoming.finished;
      existing.finishedWithSummary += incoming.finishedWithSummary;
      existing.finishedMissingSummary += incoming.finishedMissingSummary;
      existing.storedSeasons += 1;

      if (
        incoming.latestCollectedAt &&
        (!existing.latestCollectedAt ||
          new Date(incoming.latestCollectedAt).getTime() >
            new Date(existing.latestCollectedAt).getTime())
      ) {
        existing.latestCollectedAt = incoming.latestCollectedAt;
      }
    }

    return {
      fixtures: fixtureAggregates,
      expectedTeams,
      expectedPairs,
      standings,
    };
  }

  // ============================================================
  // TEAMS
  // ============================================================

  private async aggregateTeams(
    contexts: LeagueContext[],
  ): Promise<Map<string, TeamAggregate>> {
    const aliases = [
      ...new Set(contexts.flatMap((context) => context.aliases)),
    ];

    if (!aliases.length) {
      return new Map();
    }

    const contextByAlias = new Map<string, LeagueContext>();

    for (const context of contexts) {
      for (const alias of context.aliases) {
        contextByAlias.set(alias, context);
      }
    }

    const rows = await this.espnTeamModel
      .aggregate<{
        _id: string;
        documents: number;
        teamIds: string[];
        latestCollectedAt?: Date;
      }>([
        {
          $match: {
            leagueId: {
              $in: aliases,
            },
          },
        },
        {
          $group: {
            _id: '$leagueId',
            documents: {
              $sum: 1,
            },
            teamIds: {
              $addToSet: '$teamId',
            },
            latestCollectedAt: {
              $max: '$collectedAt',
            },
          },
        },
      ])
      .exec();

    const result = new Map<string, TeamAggregate>();

    for (const row of rows) {
      const context = contextByAlias.get(this.normalize(row._id));

      if (!context) {
        continue;
      }

      const current = result.get(context.key);

      const incoming: TeamAggregate = {
        documents: Number(row.documents ?? 0),
        teamIds: new Set((row.teamIds ?? []).filter(Boolean)),
        latestCollectedAt: row.latestCollectedAt,
      };

      if (!current) {
        result.set(context.key, incoming);
        continue;
      }

      current.documents += incoming.documents;

      for (const teamId of incoming.teamIds) {
        current.teamIds.add(teamId);
      }

      if (
        incoming.latestCollectedAt &&
        (!current.latestCollectedAt ||
          incoming.latestCollectedAt.getTime() >
            current.latestCollectedAt.getTime())
      ) {
        current.latestCollectedAt = incoming.latestCollectedAt;
      }
    }

    return result;
  }

  // ============================================================
  // NEWS
  // ============================================================

  private async aggregateNews(
    contexts: LeagueContext[],
    now: Date,
  ): Promise<Map<string, NewsAggregate>> {
    const aliases = [
      ...new Set(contexts.flatMap((context) => context.aliases)),
    ];

    if (!aliases.length) {
      return new Map();
    }

    const contextByAlias = new Map<string, LeagueContext>();

    for (const context of contexts) {
      for (const alias of context.aliases) {
        contextByAlias.set(alias, context);
      }
    }

    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const rows = await this.espnNewsModel
      .aggregate<{
        _id: string;
        total: number;
        last24Hours: number;
        latestPublishedAt?: Date;
        latestCollectedAt?: Date;
      }>([
        {
          $match: {
            leagueId: {
              $in: aliases,
            },
          },
        },
        {
          $group: {
            _id: '$leagueId',
            total: {
              $sum: 1,
            },
            last24Hours: {
              $sum: {
                $cond: [
                  {
                    $gte: ['$published', cutoff],
                  },
                  1,
                  0,
                ],
              },
            },
            latestPublishedAt: {
              $max: '$published',
            },
            latestCollectedAt: {
              $max: '$collectedAt',
            },
          },
        },
      ])
      .exec();

    const result = new Map<string, NewsAggregate>();

    for (const row of rows) {
      const context = contextByAlias.get(this.normalize(row._id));

      if (!context) {
        continue;
      }

      const current = result.get(context.key);

      const incoming: NewsAggregate = {
        total: Number(row.total ?? 0),
        last24Hours: Number(row.last24Hours ?? 0),
        latestPublishedAt: row.latestPublishedAt,
        latestCollectedAt: row.latestCollectedAt,
      };

      if (!current) {
        result.set(context.key, incoming);
        continue;
      }

      current.total += incoming.total;

      current.last24Hours += incoming.last24Hours;

      if (
        incoming.latestPublishedAt &&
        (!current.latestPublishedAt ||
          incoming.latestPublishedAt.getTime() >
            current.latestPublishedAt.getTime())
      ) {
        current.latestPublishedAt = incoming.latestPublishedAt;
      }

      if (
        incoming.latestCollectedAt &&
        (!current.latestCollectedAt ||
          incoming.latestCollectedAt.getTime() >
            current.latestCollectedAt.getTime())
      ) {
        current.latestCollectedAt = incoming.latestCollectedAt;
      }
    }

    return result;
  }

  // ============================================================
  // DERIVED
  // ============================================================

  private async aggregateDerivedData(
    contexts: LeagueContext[],
  ): Promise<DerivedAggregate> {
    const clauses = contexts
      .filter((context) => typeof context.season === 'number')
      .flatMap((context) =>
        context.aliases.map((competitionId) => ({
          competitionId,
          season: context.season,
        })),
      );

    const contextByAlias = new Map<string, LeagueContext>();

    for (const context of contexts) {
      for (const alias of context.aliases) {
        contextByAlias.set(alias, context);
      }
    }

    const [statsRows, profileRows, matchRows] = clauses.length
      ? await Promise.all([
          this.teamCompetitionStatsModel
            .aggregate<{
              _id: {
                competitionId: string;
                season: number;
              };
              documents: number;
              teamIds: string[];
              latestCalculatedAt?: Date;
            }>([
              {
                $match: {
                  $or: clauses,
                },
              },
              {
                $group: {
                  _id: {
                    competitionId: '$competitionId',
                    season: '$season',
                  },
                  documents: {
                    $sum: 1,
                  },
                  teamIds: {
                    $addToSet: '$teamId',
                  },
                  latestCalculatedAt: {
                    $max: '$calculatedAt',
                  },
                },
              },
            ])
            .exec(),

          this.teamPerformanceProfileModel
            .aggregate<{
              _id: {
                competitionId: string;
                season: number;
              };
              documents: number;
              teamIds: string[];
              latestCalculatedAt?: Date;
            }>([
              {
                $match: {
                  $or: clauses,
                },
              },
              {
                $group: {
                  _id: {
                    competitionId: '$competitionId',
                    season: '$season',
                  },
                  documents: {
                    $sum: 1,
                  },
                  teamIds: {
                    $addToSet: '$teamId',
                  },
                  latestCalculatedAt: {
                    $max: '$calculatedAt',
                  },
                },
              },
            ])
            .exec(),

          this.matchDerivedDataModel
            .aggregate<{
              _id: {
                competitionId: string;
                season: number;
              };
              documents: number;
              latestCalculatedAt?: Date;
            }>([
              {
                $match: {
                  $or: clauses,
                },
              },
              {
                $group: {
                  _id: {
                    competitionId: '$competitionId',
                    season: '$season',
                  },
                  documents: {
                    $sum: 1,
                  },
                  latestCalculatedAt: {
                    $max: '$calculatedAt',
                  },
                },
              },
            ])
            .exec(),
        ])
      : [[], [], []];

    const h2hClauses = contexts
      .filter((context) => typeof context.season === 'number')
      .flatMap((context) =>
        context.aliases.map((competitionId) => ({
          'meetings.competitionId': competitionId,
          'meetings.season': context.season,
        })),
      );

    const h2hRows = h2hClauses.length
      ? await this.headToHeadModel
          .aggregate<{
            _id: {
              competitionId: string;
              season: number;
            };
            pairKeys: string[];
            latestMeetingAt?: Date;
            latestCalculatedAt?: Date;
          }>([
            {
              $unwind: '$meetings',
            },
            {
              $match: {
                $or: h2hClauses,
              },
            },
            {
              $group: {
                _id: {
                  competitionId: '$meetings.competitionId',
                  season: '$meetings.season',
                },
                pairKeys: {
                  $addToSet: '$pairKey',
                },
                latestMeetingAt: {
                  $max: '$meetings.date',
                },
                latestCalculatedAt: {
                  $max: '$calculatedAt',
                },
              },
            },
          ])
          .exec()
      : [];

    const result: DerivedAggregate = {
      teamStats: new Map(),
      profiles: new Map(),
      matchDerived: new Map(),
      h2hPairs: new Map(),
      h2hLatestMeetingAt: new Map(),
      h2hLatestCalculatedAt: new Map(),
    };

    for (const row of statsRows) {
      const context = contextByAlias.get(this.normalize(row._id.competitionId));

      if (!context) {
        continue;
      }

      result.teamStats.set(this.seasonKey(context, row._id.season), {
        documents: Number(row.documents ?? 0),
        teamIds: new Set((row.teamIds ?? []).filter(Boolean)),
        latestCalculatedAt: row.latestCalculatedAt,
      });
    }

    for (const row of profileRows) {
      const context = contextByAlias.get(this.normalize(row._id.competitionId));

      if (!context) {
        continue;
      }

      result.profiles.set(this.seasonKey(context, row._id.season), {
        documents: Number(row.documents ?? 0),
        teamIds: new Set((row.teamIds ?? []).filter(Boolean)),
        latestCalculatedAt: row.latestCalculatedAt,
      });
    }

    for (const row of matchRows) {
      const context = contextByAlias.get(this.normalize(row._id.competitionId));

      if (!context) {
        continue;
      }

      result.matchDerived.set(this.seasonKey(context, row._id.season), {
        documents: Number(row.documents ?? 0),
        latestCalculatedAt: row.latestCalculatedAt,
      });
    }

    for (const row of h2hRows) {
      const context = contextByAlias.get(this.normalize(row._id.competitionId));

      if (!context) {
        continue;
      }

      const key = this.seasonKey(context, row._id.season);

      result.h2hPairs.set(key, new Set((row.pairKeys ?? []).filter(Boolean)));

      result.h2hLatestMeetingAt.set(key, row.latestMeetingAt);

      result.h2hLatestCalculatedAt.set(key, row.latestCalculatedAt);
    }

    return result;
  }

  // ============================================================
  // QUEUE
  // ============================================================

  private async buildQueueSummary(): Promise<MonitorQueueSummary> {
    const staleCutoff = new Date(
      Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000,
    );

    const [
      statusRows,
      typeRows,
      typeStatusRows,
      latestFailure,
      latestCompleted,
      staleProcessing,
    ] = await Promise.all([
      this.espnQueueModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          {
            $group: {
              _id: '$status',
              count: {
                $sum: 1,
              },
            },
          },
        ])
        .exec(),

      this.espnQueueModel
        .aggregate<{
          _id: string;
          count: number;
        }>([
          {
            $group: {
              _id: '$type',
              count: {
                $sum: 1,
              },
            },
          },
        ])
        .exec(),

      this.espnQueueModel
        .aggregate<{
          _id: {
            type: string;
            status: string;
          };
          count: number;
        }>([
          {
            $group: {
              _id: {
                type: '$type',
                status: '$status',
              },
              count: {
                $sum: 1,
              },
            },
          },
        ])
        .exec(),

      this.espnQueueModel
        .findOne({
          status: EspnQueueStatus.FAILED,
        })
        .sort({
          _id: -1,
        })
        .lean()
        .exec(),

      this.espnQueueModel
        .findOne({
          status: EspnQueueStatus.COMPLETED,
        })
        .sort({
          _id: -1,
        })
        .lean()
        .exec(),

      this.espnQueueModel.countDocuments({
        status: EspnQueueStatus.PROCESSING,
        updatedAt: {
          $lt: staleCutoff,
        },
      }),
    ]);

    const byStatus: Record<string, number> = {};

    for (const row of statusRows) {
      byStatus[String(row._id)] = Number(row.count ?? 0);
    }

    const byType: Record<string, number> = {};

    for (const row of typeRows) {
      byType[String(row._id)] = Number(row.count ?? 0);
    }

    const byTypeAndStatus: MonitorQueueItem[] = typeStatusRows.map((row) => ({
      type: String(row._id.type),
      status: String(row._id.status),
      count: Number(row.count ?? 0),
    }));

    return {
      total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
      pending: byStatus[EspnQueueStatus.PENDING] ?? 0,
      processing: byStatus[EspnQueueStatus.PROCESSING] ?? 0,
      completedRetained: byStatus[EspnQueueStatus.COMPLETED] ?? 0,
      failed: byStatus[EspnQueueStatus.FAILED] ?? 0,
      staleProcessing,
      completedRetentionDays: QUEUE_COMPLETED_RETENTION_DAYS,
      byType,
      byTypeAndStatus,
      latestFailureAt: latestFailure?._id
        ? latestFailure._id.getTimestamp()
        : undefined,
      latestFailure:
        (
          latestFailure as unknown as {
            lastError?: string;
            error?: string;
          } | null
        )?.lastError ??
        (
          latestFailure as unknown as {
            error?: string;
          } | null
        )?.error,
      latestCompletedAt: latestCompleted?._id
        ? latestCompleted._id.getTimestamp()
        : undefined,
    };
  }

  private async aggregateQueueData(
    contexts: LeagueContext[],
  ): Promise<Map<string, QueueAggregate>> {
    const clauses = contexts.flatMap((context) =>
      context.aliases.map((leagueId) => ({
        leagueId,
        ...(typeof context.season === 'number'
          ? {
              season: context.season,
            }
          : {}),
      })),
    );

    if (!clauses.length) {
      return new Map();
    }

    const contextByAlias = new Map<string, LeagueContext>();

    for (const context of contexts) {
      for (const alias of context.aliases) {
        contextByAlias.set(alias, context);
      }
    }

    const rows = await this.espnQueueModel
      .aggregate<{
        _id: {
          leagueId: string;
          type: string;
          status: string;
        };
        count: number;
      }>([
        {
          $match: {
            $or: clauses,
          },
        },
        {
          $group: {
            _id: {
              leagueId: '$leagueId',
              type: '$type',
              status: '$status',
            },
            count: {
              $sum: 1,
            },
          },
        },
      ])
      .exec();

    const result = new Map<string, QueueAggregate>();

    for (const row of rows) {
      const context = contextByAlias.get(this.normalize(row._id.leagueId));

      if (!context) {
        continue;
      }

      let aggregate = result.get(context.key);

      if (!aggregate) {
        aggregate = {
          total: 0,
          byStatus: new Map(),
          byType: new Map(),
          byTypeAndStatus: new Map(),
          staleProcessing: 0,
        };

        result.set(context.key, aggregate);
      }

      const count = Number(row.count ?? 0);

      aggregate.total += count;

      aggregate.byStatus.set(
        String(row._id.status),
        (aggregate.byStatus.get(String(row._id.status)) ?? 0) + count,
      );

      aggregate.byType.set(
        String(row._id.type),
        (aggregate.byType.get(String(row._id.type)) ?? 0) + count,
      );

      const compoundKey = `${row._id.type}:${row._id.status}`;

      aggregate.byTypeAndStatus.set(
        compoundKey,
        (aggregate.byTypeAndStatus.get(compoundKey) ?? 0) + count,
      );
    }

    const staleCutoff = new Date(
      Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000,
    );

    const staleRows = await this.espnQueueModel
      .aggregate<{
        _id: string;
        count: number;
      }>([
        {
          $match: {
            $or: clauses,
            status: EspnQueueStatus.PROCESSING,
            updatedAt: {
              $lt: staleCutoff,
            },
          },
        },
        {
          $group: {
            _id: '$leagueId',
            count: {
              $sum: 1,
            },
          },
        },
      ])
      .exec();

    for (const row of staleRows) {
      const context = contextByAlias.get(this.normalize(row._id));

      if (!context) {
        continue;
      }

      const aggregate = result.get(context.key);

      if (aggregate) {
        aggregate.staleProcessing += Number(row.count ?? 0);
      }
    }

    return result;
  }

  // ============================================================
  // SYNC
  // ============================================================

  private async buildSyncSummary(): Promise<MonitorSyncSummary> {
    const states = await this.sportsSyncStateModel.find({}).lean().exec();

    const byStatus: Record<string, number> = {};

    let queueStates = 0;
    let cronStates = 0;

    let totalUnits = 0;
    let successUnits = 0;
    let processingUnits = 0;
    let pendingUnits = 0;
    let failedUnits = 0;

    let successfulStates = 0;

    let latestSuccessfulAt: Date | undefined;

    let latestCompletedAt: Date | undefined;

    let nextRunAt: Date | undefined;

    const stages: MonitorSyncStageSummary[] = [];

    const failures: MonitorSyncFailure[] = [];

    const cron: SportsSystemMonitorResponse['sync']['cron'] = [];

    for (const state of states) {
      const status = String(state.status);

      byStatus[status] = (byStatus[status] ?? 0) + 1;

      if (state.kind === SportsSyncStateKind.QUEUE) {
        queueStates += 1;
      }

      if (state.kind === SportsSyncStateKind.CRON) {
        cronStates += 1;

        cron.push({
          stateKey: state.stateKey,
          taskKey: state.taskKey,
          status,
          cronExpression: state.cronExpression,
          timeZone: state.timeZone,
          lastStartedAt: state.lastStartedAt,
          lastSuccessfulAt: state.lastSuccessfulAt,
          lastCompletedAt: state.lastCompletedAt,
          nextRunAt: state.nextRunAt,
          consecutiveFailures: state.consecutiveFailures ?? 0,
          lastError: state.lastError,
        });
      }

      if (state.status === SportsSyncStateStatus.SUCCESS) {
        successfulStates += 1;
      }

      if (state.lastSuccessfulAt) {
        const value = new Date(state.lastSuccessfulAt);

        if (
          !latestSuccessfulAt ||
          value.getTime() > latestSuccessfulAt.getTime()
        ) {
          latestSuccessfulAt = value;
        }
      }

      if (state.lastCompletedAt) {
        const value = new Date(state.lastCompletedAt);

        if (
          !latestCompletedAt ||
          value.getTime() > latestCompletedAt.getTime()
        ) {
          latestCompletedAt = value;
        }
      }

      if (state.nextRunAt) {
        const value = new Date(state.nextRunAt);

        if (!nextRunAt || value.getTime() < nextRunAt.getTime()) {
          nextRunAt = value;
        }
      }

      for (const unit of state.units ?? []) {
        totalUnits += 1;

        switch (unit.status) {
          case SportsSyncUnitStatus.SUCCESS:
            successUnits += 1;
            break;

          case SportsSyncUnitStatus.PROCESSING:
            processingUnits += 1;
            break;

          case SportsSyncUnitStatus.PENDING:
            pendingUnits += 1;
            break;

          case SportsSyncUnitStatus.FAILED:
            failedUnits += 1;
            break;
        }

        if (unit.status !== SportsSyncUnitStatus.SUCCESS) {
          stages.push({
            jobType: state.jobType,
            stage: unit.stepKey ?? unit.dateKey ?? unit.key,
            unitType: String(unit.type),
            status: String(unit.status),
            count: 1,
          });
        }
      }

      if (
        state.status === SportsSyncStateStatus.FAILED ||
        (state.consecutiveFailures ?? 0) > 0 ||
        state.lastError
      ) {
        failures.push({
          stateKey: state.stateKey,
          jobType: state.jobType,
          leagueId: state.leagueId,
          season: state.season,
          eventId: state.eventId,
          error: state.lastError,
          at: state.lastCompletedAt ?? state.lastStartedAt ?? state.updatedAt,
          consecutiveFailures: state.consecutiveFailures ?? 0,
        });
      }
    }

    const groupedStages = this.groupSyncStages(stages);

    failures.sort(
      (a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime(),
    );

    return {
      totalStates: states.length,
      queueStates,
      cronStates,
      byStatus,
      unitProgress: {
        total: totalUnits,
        success: successUnits,
        processing: processingUnits,
        pending: pendingUnits,
        failed: failedUnits,
        completionPercent:
          totalUnits > 0 ? this.percent(successUnits, totalUnits) : 0,
      },
      stateCompletionPercent:
        states.length > 0 ? this.percent(successfulStates, states.length) : 0,
      currentStages: groupedStages,
      failures: failures.slice(0, 100),
      cron,
      latestSuccessfulAt,
      latestCompletedAt,
      nextRunAt,
    };
  }

  private async aggregateSyncData(
    contexts: LeagueContext[],
  ): Promise<Map<string, SyncAggregate>> {
    const clauses = contexts.flatMap((context) =>
      context.aliases.map((leagueId) => ({
        leagueId,
        ...(typeof context.season === 'number'
          ? {
              season: context.season,
            }
          : {}),
      })),
    );

    if (!clauses.length) {
      return new Map();
    }

    const contextByAlias = new Map<string, LeagueContext>();

    for (const context of contexts) {
      for (const alias of context.aliases) {
        contextByAlias.set(alias, context);
      }
    }

    const states = await this.sportsSyncStateModel
      .find({
        $or: clauses,
      })
      .lean()
      .exec();

    const result = new Map<string, SyncAggregate>();

    for (const state of states) {
      const context = contextByAlias.get(this.normalize(state.leagueId));

      if (!context) {
        continue;
      }

      let aggregate = result.get(context.key);

      if (!aggregate) {
        aggregate = {
          stateCounts: {},
          queueStates: 0,
          cronStates: 0,
          unitProgress: {
            total: 0,
            success: 0,
            processing: 0,
            pending: 0,
            failed: 0,
          },
          currentStages: [],
          failures: [],
          cron: [],
        };

        result.set(context.key, aggregate);
      }

      const status = String(state.status);

      aggregate.stateCounts[status] = (aggregate.stateCounts[status] ?? 0) + 1;

      if (state.kind === SportsSyncStateKind.QUEUE) {
        aggregate.queueStates += 1;
      }

      if (state.kind === SportsSyncStateKind.CRON) {
        aggregate.cronStates += 1;

        aggregate.cron.push({
          stateKey: state.stateKey,
          taskKey: state.taskKey,
          status,
          cronExpression: state.cronExpression,
          timeZone: state.timeZone,
          lastStartedAt: state.lastStartedAt,
          lastSuccessfulAt: state.lastSuccessfulAt,
          lastCompletedAt: state.lastCompletedAt,
          nextRunAt: state.nextRunAt,
          consecutiveFailures: state.consecutiveFailures ?? 0,
          lastError: state.lastError,
        });
      }

      if (state.lastSuccessfulAt) {
        const value = new Date(state.lastSuccessfulAt);

        if (
          !aggregate.latestSuccessfulAt ||
          value.getTime() > aggregate.latestSuccessfulAt.getTime()
        ) {
          aggregate.latestSuccessfulAt = value;
        }
      }

      if (state.lastCompletedAt) {
        const value = new Date(state.lastCompletedAt);

        if (
          !aggregate.latestCompletedAt ||
          value.getTime() > aggregate.latestCompletedAt.getTime()
        ) {
          aggregate.latestCompletedAt = value;
        }
      }

      if (state.nextRunAt) {
        const value = new Date(state.nextRunAt);

        if (
          !aggregate.nextRunAt ||
          value.getTime() < aggregate.nextRunAt.getTime()
        ) {
          aggregate.nextRunAt = value;
        }
      }

      for (const unit of state.units ?? []) {
        aggregate.unitProgress.total += 1;

        switch (unit.status) {
          case SportsSyncUnitStatus.SUCCESS:
            aggregate.unitProgress.success += 1;
            break;

          case SportsSyncUnitStatus.PROCESSING:
            aggregate.unitProgress.processing += 1;
            break;

          case SportsSyncUnitStatus.PENDING:
            aggregate.unitProgress.pending += 1;
            break;

          case SportsSyncUnitStatus.FAILED:
            aggregate.unitProgress.failed += 1;
            break;
        }

        if (unit.status !== SportsSyncUnitStatus.SUCCESS) {
          aggregate.currentStages.push({
            jobType: state.jobType,
            stage: unit.stepKey ?? unit.dateKey ?? unit.key,
            unitType: String(unit.type),
            status: String(unit.status),
            count: 1,
          });
        }
      }

      if (
        state.status === SportsSyncStateStatus.FAILED ||
        (state.consecutiveFailures ?? 0) > 0 ||
        state.lastError
      ) {
        aggregate.failures.push({
          stateKey: state.stateKey,
          jobType: state.jobType,
          leagueId: state.leagueId,
          season: state.season,
          eventId: state.eventId,
          error: state.lastError,
          at: state.lastCompletedAt ?? state.lastStartedAt ?? state.updatedAt,
          consecutiveFailures: state.consecutiveFailures ?? 0,
        });
      }
    }

    for (const aggregate of result.values()) {
      aggregate.currentStages = this.groupSyncStages(aggregate.currentStages);

      aggregate.failures.sort(
        (a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime(),
      );
    }

    return result;
  }

  // ============================================================
  // UPCOMING
  // ============================================================

  private async loadUpcomingFixtures(
    contexts: LeagueContext[],
    now: Date,
  ): Promise<EspnFixtureDocument[]> {
    const clauses = contexts
      .filter((context) => typeof context.season === 'number')
      .flatMap((context) =>
        context.aliases.map((leagueId) => ({
          leagueId,
          season: context.season,
        })),
      );

    if (!clauses.length) {
      return [];
    }

    const until = new Date(
      now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    return this.espnFixtureModel
      .find({
        $or: clauses,
        fixtureDate: {
          $gte: now,
          $lte: until,
        },
        completed: {
          $ne: true,
        },
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();
  }

  private async buildUpcomingIndexes(
    contexts: LeagueContext[],
    fixtures: EspnFixtureDocument[],
  ): Promise<UpcomingIndexes> {
    const stats = new Set<string>();
    const profiles = new Set<string>();
    const derived = new Set<string>();
    const h2h = new Set<string>();
    const odds = new Set<string>();

    if (!fixtures.length) {
      return {
        stats,
        profiles,
        derived,
        h2h,
        odds,
      };
    }

    const fixtureIds = fixtures
      .map((fixture) => fixture.eventId)
      .filter(Boolean);

    const clauses = contexts
      .filter((context) => typeof context.season === 'number')
      .flatMap((context) =>
        context.aliases.map((competitionId) => ({
          competitionId,
          season: context.season,
        })),
      );

    const [statsDocs, profileDocs, derivedDocs, oddsDocs] = await Promise.all([
      this.teamCompetitionStatsModel
        .find({
          $or: clauses,
        })
        .select({
          competitionId: 1,
          season: 1,
          teamId: 1,
        })
        .lean()
        .exec(),

      this.teamPerformanceProfileModel
        .find({
          $or: clauses,
        })
        .select({
          competitionId: 1,
          season: 1,
          teamId: 1,
        })
        .lean()
        .exec(),

      this.matchDerivedDataModel
        .find({
          eventId: {
            $in: fixtureIds,
          },
        })
        .select({
          eventId: 1,
        })
        .lean()
        .exec(),

      this.sportsOddsSnapshotModel
        .find({
          eventId: {
            $in: fixtureIds,
          },
        })
        .select({
          eventId: 1,
        })
        .lean()
        .exec(),
    ]);

    for (const doc of statsDocs) {
      stats.add(
        this.teamSeasonKey(
          this.normalize(doc.competitionId),
          doc.season,
          doc.teamId,
        ),
      );
    }

    for (const doc of profileDocs) {
      profiles.add(
        this.teamSeasonKey(
          this.normalize(doc.competitionId),
          doc.season,
          doc.teamId,
        ),
      );
    }

    for (const doc of derivedDocs) {
      if (doc.eventId) {
        derived.add(doc.eventId);
      }
    }

    for (const doc of oddsDocs) {
      if (doc.eventId) {
        odds.add(doc.eventId);
      }
    }

    const pairKeys = [
      ...new Set(
        fixtures
          .map((fixture) =>
            this.pairKey(fixture.homeTeamId, fixture.awayTeamId),
          )
          .filter(Boolean),
      ),
    ];

    if (pairKeys.length) {
      const h2hDocs = await this.headToHeadModel
        .find({
          pairKey: {
            $in: pairKeys,
          },
        })
        .select({
          pairKey: 1,
        })
        .lean()
        .exec();

      for (const doc of h2hDocs) {
        if (doc.pairKey) {
          h2h.add(doc.pairKey);
        }
      }
    }

    return {
      stats,
      profiles,
      derived,
      h2h,
      odds,
    };
  }

  // ============================================================
  // LEAGUES
  // ============================================================

  private buildLeagueSummary(params: {
    context: LeagueContext;
    catalogueById: Map<string, EspnLeagueDocument>;
    operationalSeasonData: OperationalSeasonData;
    teamAggregates: Map<string, TeamAggregate>;
    newsAggregates: Map<string, NewsAggregate>;
    derivedAggregates: DerivedAggregate;
    queueAggregates: Map<string, QueueAggregate>;
    syncAggregates: Map<string, SyncAggregate>;
    upcomingFixtures: EspnFixtureDocument[];
    upcomingIndexes: UpcomingIndexes;
  }): MonitorLeagueSummary {
    const {
      context,
      catalogueById,
      operationalSeasonData,
      teamAggregates,
      newsAggregates,
      derivedAggregates,
      queueAggregates,
      syncAggregates,
      upcomingFixtures,
      upcomingIndexes,
    } = params;

    const competition = context.competition;

    const catalogue =
      catalogueById.get(this.normalize(competition.espnLeagueSlug)) ??
      catalogueById.get(this.normalize(competition.competitionId));

    const fixtureSummary = operationalSeasonData.fixtures.get(context.key) ?? {
      total: 0,
      upcoming: 0,
      live: 0,
      finished: 0,
      finishedWithSummary: 0,
      finishedMissingSummary: 0,
      storedSeasons: 0,
    };

    const expectedTeamIds =
      operationalSeasonData.expectedTeams.get(context.key) ?? new Set<string>();

    const expectedPairIds =
      operationalSeasonData.expectedPairs.get(context.key) ?? new Set<string>();

    const standingSummary = operationalSeasonData.standings.get(
      context.key,
    ) ?? {
      rows: 0,
      teamIds: new Set<string>(),
    };

    const teamSummary = teamAggregates.get(context.key) ?? {
      documents: 0,
      teamIds: new Set<string>(),
    };

    const newsSummary = newsAggregates.get(context.key) ?? {
      total: 0,
      last24Hours: 0,
    };

    const derivedKey = this.seasonKey(context, context.season);

    const stats = derivedAggregates.teamStats.get(derivedKey);

    const profiles = derivedAggregates.profiles.get(derivedKey);

    const matchDerived = derivedAggregates.matchDerived.get(derivedKey);

    const h2hPairs =
      derivedAggregates.h2hPairs.get(derivedKey) ?? new Set<string>();

    const expectedTeams = expectedTeamIds.size;

    const statsCovered = [...expectedTeamIds].filter((teamId) =>
      stats?.teamIds.has(teamId),
    ).length;

    const profilesCovered = [...expectedTeamIds].filter((teamId) =>
      profiles?.teamIds.has(teamId),
    ).length;

    const standingsCovered = [...expectedTeamIds].filter((teamId) =>
      standingSummary.teamIds.has(teamId),
    ).length;

    const upcoming = this.buildUpcomingSummary(
      context,
      upcomingFixtures,
      upcomingIndexes,
    );

    const queue = this.toQueueSummary(queueAggregates.get(context.key));

    const sync = this.toSyncSummary(syncAggregates.get(context.key));

    const derivedData: MonitorDerivedSummary = {
      teamCompetitionStats: this.buildCoverageMetric(
        stats?.documents ?? 0,
        expectedTeams,
        stats?.latestCalculatedAt,
        Math.max(0, expectedTeams - statsCovered),
      ),

      teamPerformanceProfiles: this.buildCoverageMetric(
        profiles?.documents ?? 0,
        expectedTeams,
        profiles?.latestCalculatedAt,
        Math.max(0, expectedTeams - profilesCovered),
      ),

      headToHead: {
        pairs: h2hPairs.size,
        expectedPairs: expectedPairIds.size,
        missingPairs: Math.max(0, expectedPairIds.size - h2hPairs.size),
        coveragePercent:
          expectedPairIds.size > 0
            ? this.percent(
                [...expectedPairIds].filter((pairKey) => h2hPairs.has(pairKey))
                  .length,
                expectedPairIds.size,
              )
            : 0,
        latestMeetingAt: derivedAggregates.h2hLatestMeetingAt.get(derivedKey),
        latestCalculatedAt:
          derivedAggregates.h2hLatestCalculatedAt.get(derivedKey),
      },

      matchDerivedData: {
        documents: matchDerived?.documents ?? 0,
        expectedUpcomingFixtures: upcoming.total,
        missingUpcomingFixtures: upcoming.missingDerivedData,
        coveragePercent:
          upcoming.total > 0
            ? this.percent(upcoming.withDerivedData, upcoming.total)
            : 0,
        latestCalculatedAt: matchDerived?.latestCalculatedAt,
      },
    };

    const expectedWork: MonitorExpectedWork = {
      finishedFixturesMissingSummary: fixtureSummary.finishedMissingSummary,

      standingsMissingTeams: Math.max(0, expectedTeams - standingsCovered),

      teamCompetitionStatsMissing: Math.max(0, expectedTeams - statsCovered),

      teamPerformanceProfilesMissing: Math.max(
        0,
        expectedTeams - profilesCovered,
      ),

      upcomingFixturesMissingOdds: upcoming.fixtures.filter(
        (fixture) => fixture.sources.oddsMatchable && !fixture.sources.odds,
      ).length,

      upcomingFixturesMissingDerivedData: upcoming.missingDerivedData,
    };

    return {
      competitionId: competition.competitionId,

      espnLeagueSlug: competition.espnLeagueSlug,

      name: competition.name,

      type: competition.type,

      region: competition.region,

      priority: competition.priority,

      status: competition.status,

      season: competition.season,

      seasonStartDate: competition.seasonStartDate,

      seasonEndDate: competition.seasonEndDate,

      nextFixtureDate: competition.nextFixtureDate,

      lastFixtureDate: competition.lastFixtureDate,

      catalogue: {
        exists: Boolean(catalogue),

        name: catalogue?.name,

        country: catalogue?.country,

        isActive: catalogue?.isActive,

        isPriority: catalogue?.isPriority,

        lastSyncedAt: catalogue?.lastSyncedAt,

        detailLastSyncedAt: catalogue?.detailLastSyncedAt,
      },

      fixtures: {
        ...fixtureSummary,

        summaryCoveragePercent:
          fixtureSummary.finished > 0
            ? this.percent(
                fixtureSummary.finishedWithSummary,
                fixtureSummary.finished,
              )
            : 0,
      },

      teams: {
        documents: teamSummary.documents,

        distinctTeams: teamSummary.teamIds.size,

        expectedCurrentSeasonTeams: expectedTeams,

        missingCurrentSeasonTeams: Math.max(
          0,
          expectedTeams -
            [...expectedTeamIds].filter((teamId) =>
              teamSummary.teamIds.has(teamId),
            ).length,
        ),

        coveragePercent:
          expectedTeams > 0
            ? this.percent(
                [...expectedTeamIds].filter((teamId) =>
                  teamSummary.teamIds.has(teamId),
                ).length,
                expectedTeams,
              )
            : 0,

        latestCollectedAt: teamSummary.latestCollectedAt,
      },

      standings: {
        rows: standingSummary.rows,

        teams: standingSummary.teamIds.size,

        expectedTeams,

        missingTeams: Math.max(0, expectedTeams - standingsCovered),

        coveragePercent:
          expectedTeams > 0 ? this.percent(standingsCovered, expectedTeams) : 0,

        latestCollectedAt: standingSummary.latestCollectedAt,
      },

      news: newsSummary,

      derivedData,

      upcoming,

      queue,

      sync,

      expectedWork,
    };
  }

  // ============================================================
  // UPCOMING READINESS
  // ============================================================

  private buildUpcomingSummary(
    context: LeagueContext,
    allFixtures: EspnFixtureDocument[],
    indexes: UpcomingIndexes,
  ): MonitorUpcomingSummary {
    const fixtures = allFixtures.filter(
      (fixture) =>
        context.aliases.includes(this.normalize(fixture.leagueId)) &&
        fixture.season === context.season,
    );

    const readiness = fixtures.map((fixture): MonitorUpcomingFixture => {
      const competitionId = this.normalize(fixture.leagueId);

      const homeStats =
        Boolean(fixture.homeTeamId) &&
        indexes.stats.has(
          this.teamSeasonKey(competitionId, fixture.season, fixture.homeTeamId),
        );

      const awayStats =
        Boolean(fixture.awayTeamId) &&
        indexes.stats.has(
          this.teamSeasonKey(competitionId, fixture.season, fixture.awayTeamId),
        );

      const homeProfile =
        Boolean(fixture.homeTeamId) &&
        indexes.profiles.has(
          this.teamSeasonKey(competitionId, fixture.season, fixture.homeTeamId),
        );

      const awayProfile =
        Boolean(fixture.awayTeamId) &&
        indexes.profiles.has(
          this.teamSeasonKey(competitionId, fixture.season, fixture.awayTeamId),
        );

      const pair = this.pairKey(fixture.homeTeamId, fixture.awayTeamId);

      const h2h = pair ? indexes.h2h.has(pair) : false;

      const derived = Boolean(
        fixture.eventId && indexes.derived.has(fixture.eventId),
      );

      const odds = Boolean(
        fixture.eventId && indexes.odds.has(fixture.eventId),
      );

      const oddsMatchable = odds;

      const missingSources: string[] = [];

      if (!homeStats) {
        missingSources.push('homeTeamStats');
      }

      if (!awayStats) {
        missingSources.push('awayTeamStats');
      }

      if (!homeProfile) {
        missingSources.push('homeProfile');
      }

      if (!awayProfile) {
        missingSources.push('awayProfile');
      }

      if (!h2h) {
        missingSources.push('headToHead');
      }

      if (!derived) {
        missingSources.push('matchDerivedData');
      }

      if (oddsMatchable && !odds) {
        missingSources.push('odds');
      }

      const requiredCore = [
        homeStats,
        awayStats,
        homeProfile,
        awayProfile,
        h2h,
        derived,
      ];

      let status: 'READY' | 'PARTIAL' | 'MISSING';

      const readyCount = requiredCore.filter(Boolean).length;

      if (readyCount === requiredCore.length) {
        status = 'READY';
      } else if (readyCount > 0) {
        status = 'PARTIAL';
      } else {
        status = 'MISSING';
      }

      return {
        eventId: fixture.eventId,
        fixtureDate: fixture.fixtureDate,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeTeamName: this.extractFixtureTeamName(fixture, 'home'),
        awayTeamName: this.extractFixtureTeamName(fixture, 'away'),
        sources: {
          espnFixture: true,
          odds,
          oddsMatchable,
          homeTeamStats: homeStats,
          awayTeamStats: awayStats,
          homeProfile,
          awayProfile,
          headToHead: h2h,
          matchDerivedData: derived,
        },
        status,
        missingSources,
      };
    });

    const ready = readiness.filter(
      (fixture) => fixture.status === 'READY',
    ).length;

    const partial = readiness.filter(
      (fixture) => fixture.status === 'PARTIAL',
    ).length;

    const missing = readiness.filter(
      (fixture) => fixture.status === 'MISSING',
    ).length;

    const withOdds = readiness.filter((fixture) => fixture.sources.odds).length;

    const withDerivedData = readiness.filter(
      (fixture) => fixture.sources.matchDerivedData,
    ).length;

    return {
      total: readiness.length,

      ready,

      partial,

      missing,

      withOdds,

      withDerivedData,

      missingDerivedData: readiness.length - withDerivedData,

      nextFixtureDate: readiness[0]?.fixtureDate,

      fixtures: readiness,
    };
  }

  // ============================================================
  // PROVIDERS
  // ============================================================

  private async buildProviderSummaries(): Promise<MonitorProviderSummary[]> {
    const result: MonitorProviderSummary[] = [];

    for (const provider of Object.keys(
      PROVIDER_CONFIG,
    ) as ConfiguredSportsProvider[]) {
      const config = PROVIDER_CONFIG[provider];

      const [
        dailyRequests,
        monthlyRequests,
        remainingDailyRequests,
        remainingMonthlyRequests,
        providerState,
        endpointDocuments,
      ] = await Promise.all([
        this.providerRateLimitService.getDailyUsage(provider),
        this.providerRateLimitService.getMonthlyUsage(provider),
        this.providerRateLimitService.getRemainingDailyRequests(provider),
        this.providerRateLimitService.getRemainingMonthlyRequests(provider),
        this.providerRateLimitService.getProviderState(provider),
        this.sportsProviderRateLimitModel
          .find({
            provider,
            endpoint: {
              $ne: '__provider_quota__',
            },
          })
          .sort({
            endpoint: 1,
          })
          .lean()
          .exec(),
      ]);

      const providerStatePeriods = providerState as unknown as
        ProviderStatePeriods | null | undefined;

      const endpoints = endpointDocuments.map((document) => ({
        endpoint: document.endpoint,

        dailyRequests: Number(document.dailyRequests ?? 0),

        monthlyRequests: Number(document.monthlyRequests ?? 0),

        lastRequestAt: document.lastRequestAt,

        lockedUntil: document.lockedUntil,
      }));

      const activeLocks = endpoints.filter(
        (endpoint) =>
          endpoint.lockedUntil &&
          new Date(endpoint.lockedUntil).getTime() > Date.now(),
      ).length;

      const latestEndpointRequest = endpoints
        .map((endpoint) =>
          endpoint.lastRequestAt ? new Date(endpoint.lastRequestAt) : undefined,
        )
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      result.push({
        provider,

        limits: {
          minIntervalSeconds: config.minIntervalSeconds,

          dailyRequestLimit: config.dailyRequestLimit,

          monthlyRequestLimit: config.monthlyRequestLimit,
        },

        usage: {
          dailyRequests: Number(dailyRequests ?? 0),

          monthlyRequests: Number(monthlyRequests ?? 0),

          remainingDailyRequests: remainingDailyRequests ?? null,

          remainingMonthlyRequests: remainingMonthlyRequests ?? null,
          dailyPeriod:
            providerStatePeriods?.dailyPeriod instanceof Date
              ? providerStatePeriods.dailyPeriod.toISOString()
              : providerStatePeriods?.dailyPeriod,

          monthlyPeriod:
            providerStatePeriods?.monthlyPeriod instanceof Date
              ? providerStatePeriods.monthlyPeriod.toISOString()
              : providerStatePeriods?.monthlyPeriod,

          lastRequestAt: latestEndpointRequest,

          activeLocks,
        },

        endpoints,

        telemetry: {
          historicalRequestEventsAvailable: false,

          historicalRateByHourAvailable: false,

          historicalRateByLeagueAvailable: false,

          note: 'The current rate-limit collection stores current-period aggregate usage, endpoint usage, last request and lock state. It does not store immutable outbound request events.',
        },
      });
    }

    return result;
  }

  // ============================================================
  // PIPELINE
  // ============================================================

  private buildPipelineDefinitions(
    sync: MonitorSyncSummary,
  ): Record<string, MonitorPipelineDefinition> {
    const stateCounts = this.getPipelineStateCounts(sync);

    return {
      [EspnQueueJobType.LEAGUE_REFRESH]: {
        stages: [
          'DATE_WINDOW',
          'FIXTURES',
          'TEAMS',
          'UPCOMING_JOB_DISCOVERY',
          'FINISHED_SUMMARY_DISCOVERY',
        ],

        operations: {
          DATE_WINDOW: {
            source: 'ESPN',
            operation:
              'Collect current rolling league fixtures from today through today+8 days.',
          },

          FIXTURES: {
            source: 'ESPN',
            operation:
              'Upsert ESPN fixtures and preserve already-collected match summaries.',
          },

          TEAMS: {
            source: 'ESPN',
            operation:
              'Persist ESPN teams using the league-scoped team identity.',
          },

          UPCOMING_JOB_DISCOVERY: {
            source: 'QUEUE',
            operation:
              'Create UPCOMING_MATCH work for upcoming fixtures inside the four-day queue window.',
          },

          FINISHED_SUMMARY_DISCOVERY: {
            source: 'QUEUE',
            operation:
              'Discover completed fixtures whose ESPN summary is still missing.',
          },
        },

        stateCounts: stateCounts[EspnQueueJobType.LEAGUE_REFRESH] ?? {},
      },

      [EspnQueueJobType.FIXTURE_RECOVERY]: {
        stages: ['SEASON_FIXTURE_WINDOW', 'STANDINGS', 'FINISHED_SUMMARY'],

        operations: {
          SEASON_FIXTURE_WINDOW: {
            source: 'ESPN',
            operation:
              'Recover fixtures from season start through today+8 days.',
          },

          STANDINGS: {
            source: 'ESPN',
            operation: 'Collect and persist current-season standings.',
          },

          FINISHED_SUMMARY: {
            source: 'QUEUE',
            operation:
              'Recover finished-match processing and missing ESPN summaries.',
          },
        },

        stateCounts: stateCounts[EspnQueueJobType.FIXTURE_RECOVERY] ?? {},
      },

      [EspnQueueJobType.UPCOMING_MATCH]: {
        stages: ['ODDS', 'DERIVED_DATA'],

        operations: {
          ODDS: {
            source: 'ODDS_API',
            operation: 'Collect Odds API data for the upcoming fixture.',
          },

          DERIVED_DATA: {
            source: 'APPLICATION',
            operation:
              'Build MatchDerivedData from ESPN fixture, season-scoped team stats, performance profiles, H2H, league context and stored odds context.',
            note: 'External bookmaker odds are not the 2xPredict pricing layer.',
          },
        },

        stateCounts: stateCounts[EspnQueueJobType.UPCOMING_MATCH] ?? {},
      },

      [EspnQueueJobType.FINISHED_MATCH]: {
        stages: [
          'SUMMARY',
          'STANDINGS',
          'TEAM_COMPETITION_STATS',
          'TEAM_PERFORMANCE_PROFILE',
          'HEAD_TO_HEAD',
          'DERIVED_DATA',
          'YOUTUBE',
        ],

        operations: {
          SUMMARY: {
            source: 'ESPN',
            operation:
              'Fetch ESPN match-summary data and store it under fixture.payload.summary.',
          },

          STANDINGS: {
            source: 'ESPN',
            operation:
              'Refresh the competition standings after a completed match.',
          },

          TEAM_COMPETITION_STATS: {
            source: 'APPLICATION',
            operation: 'Rebuild season-scoped TeamCompetitionStats.',
          },

          TEAM_PERFORMANCE_PROFILE: {
            source: 'APPLICATION',
            operation: 'Rebuild season-scoped TeamPerformanceProfile.',
          },

          HEAD_TO_HEAD: {
            source: 'APPLICATION',
            operation:
              'Rebuild the pair-based H2H document from completed ESPN fixtures.',
          },

          DERIVED_DATA: {
            source: 'APPLICATION',
            operation:
              'Recalculate MatchDerivedData after upstream completed-match data becomes available.',
          },

          YOUTUBE: {
            source: 'YOUTUBE',
            operation:
              'Search directly for an embeddable highlight without a separate YouTube queue.',
            conditional: true,
          },
        },

        stateCounts: stateCounts[EspnQueueJobType.FINISHED_MATCH] ?? {},
      },
    };
  }

  private getPipelineStateCounts(
    sync: MonitorSyncSummary,
  ): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};

    for (const stage of sync.currentStages) {
      const jobType = stage.jobType ?? 'UNKNOWN';

      if (!result[jobType]) {
        result[jobType] = {};
      }

      result[jobType][stage.status] =
        (result[jobType][stage.status] ?? 0) + stage.count;
    }

    return result;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private toQueueSummary(aggregate?: QueueAggregate): MonitorQueueSummary {
    if (!aggregate) {
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completedRetained: 0,
        failed: 0,
        staleProcessing: 0,
        completedRetentionDays: QUEUE_COMPLETED_RETENTION_DAYS,
        byType: {},
        byTypeAndStatus: [],
      };
    }

    const byType: Record<string, number> = {};

    for (const [type, count] of aggregate.byType) {
      byType[type] = count;
    }

    const byTypeAndStatus: MonitorQueueItem[] = [];

    for (const [compoundKey, count] of aggregate.byTypeAndStatus) {
      const separator = compoundKey.indexOf(':');

      byTypeAndStatus.push({
        type: separator >= 0 ? compoundKey.slice(0, separator) : compoundKey,

        status: separator >= 0 ? compoundKey.slice(separator + 1) : 'UNKNOWN',

        count,
      });
    }

    return {
      total: aggregate.total,

      pending: aggregate.byStatus.get(EspnQueueStatus.PENDING) ?? 0,

      processing: aggregate.byStatus.get(EspnQueueStatus.PROCESSING) ?? 0,

      completedRetained: aggregate.byStatus.get(EspnQueueStatus.COMPLETED) ?? 0,

      failed: aggregate.byStatus.get(EspnQueueStatus.FAILED) ?? 0,

      staleProcessing: aggregate.staleProcessing,

      completedRetentionDays: QUEUE_COMPLETED_RETENTION_DAYS,

      byType,

      byTypeAndStatus,

      latestFailureAt: aggregate.latestFailureAt,

      latestFailure: aggregate.latestFailure,

      latestCompletedAt: aggregate.latestCompletedAt,
    };
  }

  private toSyncSummary(aggregate?: SyncAggregate): MonitorSyncSummary {
    if (!aggregate) {
      return {
        totalStates: 0,
        queueStates: 0,
        cronStates: 0,
        byStatus: {},
        unitProgress: {
          total: 0,
          success: 0,
          processing: 0,
          pending: 0,
          failed: 0,
          completionPercent: 0,
        },
        stateCompletionPercent: 0,
        currentStages: [],
        failures: [],
        cron: [],
      };
    }

    const totalStates = Object.values(aggregate.stateCounts).reduce(
      (sum, value) => sum + value,
      0,
    );

    const successfulStates =
      aggregate.stateCounts[SportsSyncStateStatus.SUCCESS] ?? 0;

    return {
      totalStates,

      queueStates: aggregate.queueStates,

      cronStates: aggregate.cronStates,

      byStatus: aggregate.stateCounts,

      unitProgress: {
        ...aggregate.unitProgress,
        completionPercent:
          aggregate.unitProgress.total > 0
            ? this.percent(
                aggregate.unitProgress.success,
                aggregate.unitProgress.total,
              )
            : 0,
      },

      stateCompletionPercent:
        totalStates > 0 ? this.percent(successfulStates, totalStates) : 0,

      currentStages: aggregate.currentStages,

      failures: aggregate.failures.slice(0, 50),

      cron: aggregate.cron,

      latestSuccessfulAt: aggregate.latestSuccessfulAt,

      latestCompletedAt: aggregate.latestCompletedAt,

      nextRunAt: aggregate.nextRunAt,
    };
  }

  private groupSyncStages(
    stages: MonitorSyncStageSummary[],
  ): MonitorSyncStageSummary[] {
    const grouped = new Map<string, MonitorSyncStageSummary>();

    for (const stage of stages) {
      const key = [
        stage.jobType ?? 'UNKNOWN',
        stage.stage,
        stage.unitType,
        stage.status,
      ].join(':');

      const existing = grouped.get(key);

      if (existing) {
        existing.count += stage.count;
      } else {
        grouped.set(key, {
          ...stage,
        });
      }
    }

    return [...grouped.values()];
  }

  private buildCoverageMetric(
    documents: number,
    expected: number,
    latestCalculatedAt?: Date,
    explicitMissing?: number,
  ): MonitorCoverageMetric {
    const missing = explicitMissing ?? Math.max(0, expected - documents);

    const covered = Math.max(0, expected - missing);

    return {
      documents,
      expected,
      missing,
      coveragePercent: expected > 0 ? this.percent(covered, expected) : 0,
      latestCalculatedAt,
    };
  }

  private sumExpectedWork(items: MonitorExpectedWork[]): MonitorExpectedWork {
    return items.reduce(
      (total, item) => ({
        finishedFixturesMissingSummary:
          total.finishedFixturesMissingSummary +
          item.finishedFixturesMissingSummary,

        standingsMissingTeams:
          total.standingsMissingTeams + item.standingsMissingTeams,

        teamCompetitionStatsMissing:
          total.teamCompetitionStatsMissing + item.teamCompetitionStatsMissing,

        teamPerformanceProfilesMissing:
          total.teamPerformanceProfilesMissing +
          item.teamPerformanceProfilesMissing,

        upcomingFixturesMissingOdds:
          total.upcomingFixturesMissingOdds + item.upcomingFixturesMissingOdds,

        upcomingFixturesMissingDerivedData:
          total.upcomingFixturesMissingDerivedData +
          item.upcomingFixturesMissingDerivedData,
      }),
      this.emptyExpectedWork(),
    );
  }

  private emptyExpectedWork(): MonitorExpectedWork {
    return {
      finishedFixturesMissingSummary: 0,
      standingsMissingTeams: 0,
      teamCompetitionStatsMissing: 0,
      teamPerformanceProfilesMissing: 0,
      upcomingFixturesMissingOdds: 0,
      upcomingFixturesMissingDerivedData: 0,
    };
  }

  private seasonKey(context: LeagueContext, season?: number): string {
    return `${context.key}:${season ?? 'unknown'}`;
  }

  private teamSeasonKey(
    competitionId: string,
    season: number,
    teamId: string,
  ): string {
    return `${this.normalize(competitionId)}:${season}:${teamId.trim()}`;
  }

  private pairKey(first?: string, second?: string): string {
    const ids = [first?.trim() ?? '', second?.trim() ?? '']
      .filter(Boolean)
      .sort((a, b) =>
        a.localeCompare(b, undefined, {
          numeric: true,
        }),
      );

    return ids.length === 2 ? `${ids[0]}:${ids[1]}` : '';
  }

  private normalize(value?: string): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private percent(numerator: number, denominator: number): number {
    if (denominator <= 0 || numerator <= 0) {
      return 0;
    }

    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  private isCompletedFixture(
    fixture: Pick<EspnFixtureDocument, 'completed' | 'status'>,
  ): boolean {
    if (fixture.completed) {
      return true;
    }

    return COMPLETED_STATUSES.has(String(fixture.status).trim().toUpperCase());
  }

  private extractFixtureTeamName(
    fixture: EspnFixtureDocument,
    side: 'home' | 'away',
  ): string | undefined {
    const payload =
      fixture.payload && typeof fixture.payload === 'object'
        ? fixture.payload
        : {};

    const competitions = Array.isArray(payload.competitions)
      ? payload.competitions
      : [];

    const competition =
      competitions[0] && typeof competitions[0] === 'object'
        ? (competitions[0] as Record<string, unknown>)
        : undefined;

    const competitors: unknown[] = Array.isArray(competition?.competitors)
      ? (competition.competitors as unknown[])
      : [];

    const competitor =
      competitors.find(
        (item: unknown) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).homeAway === side,
      ) ?? competitors[side === 'home' ? 0 : 1];

    if (!competitor || typeof competitor !== 'object') {
      return undefined;
    }

    const record = competitor as Record<string, unknown>;

    const team =
      record.team && typeof record.team === 'object'
        ? (record.team as Record<string, unknown>)
        : record;

    return (
      (typeof team.displayName === 'string' ? team.displayName : undefined) ??
      (typeof team.name === 'string' ? team.name : undefined) ??
      (typeof team.shortDisplayName === 'string'
        ? team.shortDisplayName
        : undefined)
    );
  }

  private getArchitectureNotes() {
    return {
      activeCompetitionSourceOfTruth:
        'sports_active_competitions defines the operational competition set used by the monitor.',

      catalogueRole:
        'sports_espn_leagues is the complete ESPN catalogue/reference and is not treated as the active-league source of truth.',

      fixtureSummaryLocation:
        'ESPN match-summary data is stored in sports_espn_fixtures.payload.summary with payload.summaryCollectedAt.',

      queueHistoryWindow:
        'Queue COMPLETED documents are retained operational history only. The current worker removes completed jobs older than seven days.',

      syncProgressSource:
        'sports_sync_states.units[] is used for real stage/date progress. Top-level state status is reported separately.',

      providerTelemetryLimit:
        'The current rate-limit collection exposes current-period usage, endpoint usage, locks and last requests, but not immutable outbound request events.',

      oddsMatchingLimit:
        'Odds API event identifiers are provider-specific. The monitor only treats an exact stored eventId match as a confirmed odds record and does not infer absence of provider odds from that alone.',

      h2hStorageModel:
        'Head-to-head data is stored as pair-root documents with competition and season inside embedded meetings; per-season coverage is therefore derived by inspecting meetings.',
    };
  }
}
