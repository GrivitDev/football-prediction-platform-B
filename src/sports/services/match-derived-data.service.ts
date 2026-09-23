import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

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
  SportsOddsSnapshot,
  SportsOddsSnapshotDocument,
} from '../schemas/sports-odds-snapshot.schema';

import {
  MatchDerivedData,
  MatchDerivedDataDocument,
} from '../schemas/match-derived-data.schema';

type NumberMap = Record<string, number>;
type UnknownRecord = Record<string, unknown>;

interface GoalModel {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  expectedTotalGoals: number;
}

interface LeagueBaseline {
  homeGoals: number;
  awayGoals: number;
  totalGoals: number;
  matches: number;
}

interface PoissonMatrix {
  matrix: number[][];
  homeGoals: NumberMap;
  awayGoals: NumberMap;
  totalGoals: NumberMap;
  exactScores: NumberMap;
}

interface BookmakerData {
  impliedProbabilities: NumberMap;
  consensus: UnknownRecord;
  bookmakerCount: number;
  marketCount: number;
  qualityScore: number;
}

@Injectable()
export class MatchDerivedDataService {
  private readonly logger = new Logger(MatchDerivedDataService.name);

  private readonly MAX_GOALS = 10;
  private readonly MIN_LAMBDA = 0.15;
  private readonly MAX_LAMBDA = 4.5;

  constructor(
    @InjectModel(EspnFixture.name)
    private readonly fixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(TeamCompetitionStats.name)
    private readonly teamCompetitionStatsModel: Model<TeamCompetitionStatsDocument>,

    @InjectModel(TeamPerformanceProfile.name)
    private readonly teamPerformanceProfileModel: Model<TeamPerformanceProfileDocument>,

    @InjectModel(HeadToHead.name)
    private readonly headToHeadModel: Model<HeadToHeadDocument>,

    @InjectModel(SportsOddsSnapshot.name)
    private readonly sportsOddsSnapshotModel: Model<SportsOddsSnapshotDocument>,

    @InjectModel(MatchDerivedData.name)
    private readonly matchDerivedDataModel: Model<MatchDerivedDataDocument>,
  ) {}

  // ============================================================
  // PUBLIC API
  // ============================================================

  async rebuildForFixture(
    eventId: string,
  ): Promise<MatchDerivedDataDocument | null> {
    const fixture = await this.fixtureModel
      .findOne({
        eventId,
      })
      .lean()
      .exec();

    if (!fixture) {
      this.logger.warn(`Fixture ${eventId} not found`);
      return null;
    }

    const homeTeamId = this.toString(fixture.homeTeamId);

    const awayTeamId = this.toString(fixture.awayTeamId);
    const competitionId = this.toString(fixture.leagueId);
    const season = this.toNumber(fixture.season);

    if (!homeTeamId || !awayTeamId || !competitionId || season === null) {
      this.logger.warn(
        `Fixture ${eventId} does not contain enough identity data`,
      );

      return null;
    }

    const [
      homeStats,
      awayStats,
      homeProfile,
      awayProfile,
      headToHead,
      oddsSnapshot,
      leagueBaseline,
    ] = await Promise.all([
      this.teamCompetitionStatsModel
        .findOne({
          competitionId,
          season,
          teamId: homeTeamId,
        })
        .lean()
        .exec(),

      this.teamCompetitionStatsModel
        .findOne({
          competitionId,
          season,
          teamId: awayTeamId,
        })
        .lean()
        .exec(),

      this.teamPerformanceProfileModel
        .findOne({
          competitionId,
          season,
          teamId: homeTeamId,
        })
        .lean()
        .exec(),

      this.teamPerformanceProfileModel
        .findOne({
          competitionId,
          season,
          teamId: awayTeamId,
        })
        .lean()
        .exec(),

      this.findHeadToHead(competitionId, homeTeamId, awayTeamId),

      this.sportsOddsSnapshotModel
        .findOne({
          eventId,
        })
        .lean()
        .exec(),

      this.getLeagueBaseline(competitionId, season),
    ]);

    const goalModel = this.calculateGoalModel({
      homeStats: homeStats as UnknownRecord | null,
      awayStats: awayStats as UnknownRecord | null,
      homeProfile: homeProfile as UnknownRecord | null,
      awayProfile: awayProfile as UnknownRecord | null,
      headToHead: headToHead as UnknownRecord | null,
      leagueBaseline,
    });

    const poisson = this.buildPoissonModel(
      goalModel.expectedHomeGoals,
      goalModel.expectedAwayGoals,
    );

    const firstHalfProbabilities = this.calculateHalfProbabilities(
      homeProfile as UnknownRecord | null,
      awayProfile as UnknownRecord | null,
      goalModel.expectedHomeGoals,
      goalModel.expectedAwayGoals,
    );

    const secondHalfProbabilities = this.calculateSecondHalfProbabilities(
      homeProfile as UnknownRecord | null,
      awayProfile as UnknownRecord | null,
      goalModel.expectedHomeGoals,
      goalModel.expectedAwayGoals,
    );

    const halfTimeFullTimeProbabilities = this.calculateHalfTimeFullTime(
      firstHalfProbabilities,
      secondHalfProbabilities,
    );

    const marketProbabilities = this.buildMarketProbabilities({
      poisson,
      firstHalfProbabilities,
      secondHalfProbabilities,
      halfTimeFullTimeProbabilities,
    });

    const bookmakerData = this.extractBookmakerData(oddsSnapshot?.payload, {
      payload: fixture.payload,
      homeTeamName: this.getFixtureTeamName(fixture, 'home'),
      awayTeamName: this.getFixtureTeamName(fixture, 'away'),
    });

    const probabilityEdge = this.calculateProbabilityEdge(
      marketProbabilities,
      bookmakerData.impliedProbabilities,
    );

    const marketAgreement = this.calculateMarketAgreement(
      marketProbabilities,
      bookmakerData.impliedProbabilities,
    );

    const dataCompletenessScore = this.calculateDataCompletenessScore({
      homeStats: homeStats as UnknownRecord | null,
      awayStats: awayStats as UnknownRecord | null,
      homeProfile: homeProfile as UnknownRecord | null,
      awayProfile: awayProfile as UnknownRecord | null,
      headToHead: headToHead as UnknownRecord | null,
    });

    const statisticalReliabilityScore =
      this.calculateStatisticalReliabilityScore({
        homeStats: homeStats as UnknownRecord | null,
        awayStats: awayStats as UnknownRecord | null,
        homeProfile: homeProfile as UnknownRecord | null,
        awayProfile: awayProfile as UnknownRecord | null,
      });

    const marketDataQualityScore = bookmakerData.qualityScore;

    const overallDataQualityScore = this.calculateOverallDataQuality({
      dataCompletenessScore,
      statisticalReliabilityScore,
      marketDataQualityScore,
    });

    const leagueContext = {
      competitionId,
      season,
      leagueAverageHomeGoals: this.round(leagueBaseline.homeGoals, 4),
      leagueAverageAwayGoals: this.round(leagueBaseline.awayGoals, 4),
      leagueAverageTotalGoals: this.round(leagueBaseline.totalGoals, 4),
      completedMatchesUsed: leagueBaseline.matches,
    };

    const document = {
      eventId,
      competitionId,
      season,
      fixtureDate: fixture.fixtureDate,

      homeTeamId,
      awayTeamId,

      homeTeamName: this.getFixtureTeamName(fixture, 'home'),

      awayTeamName: this.getFixtureTeamName(fixture, 'away'),

      homeProfile: homeProfile ?? undefined,

      awayProfile: awayProfile ?? undefined,

      homeTeamStats: homeStats ?? undefined,

      awayTeamStats: awayStats ?? undefined,

      headToHead: headToHead ?? undefined,

      leagueContext,

      expectedHomeGoals: this.round(goalModel.expectedHomeGoals, 4),

      expectedAwayGoals: this.round(goalModel.expectedAwayGoals, 4),

      expectedTotalGoals: this.round(goalModel.expectedTotalGoals, 4),

      expectedGoalModel: {
        method: 'deterministic_poisson',
        maxGoals: this.MAX_GOALS,
        expectedHomeGoals: this.round(goalModel.expectedHomeGoals, 4),
        expectedAwayGoals: this.round(goalModel.expectedAwayGoals, 4),
        expectedTotalGoals: this.round(goalModel.expectedTotalGoals, 4),
        leagueBaseline,
      },

      exactScoreProbabilities: poisson.exactScores,

      homeGoalsProbabilities: poisson.homeGoals,

      awayGoalsProbabilities: poisson.awayGoals,

      totalGoalsProbabilities: poisson.totalGoals,

      marketProbabilities,

      firstHalfProbabilities,

      secondHalfProbabilities,

      halfTimeFullTimeProbabilities,

      scoringFirstProbabilities:
        this.calculateScoringFirstProbabilities(poisson),

      bookmakerImpliedProbabilities: bookmakerData.impliedProbabilities,

      bookmakerConsensus: bookmakerData.consensus,

      bookmakerMovement: {},

      valueAnalysis: {
        probabilityEdge,
        marketAgreement,
      },

      probabilityEdge,

      marketAgreement,

      dataCompletenessScore,
      statisticalReliabilityScore,
      marketDataQualityScore,
      overallDataQualityScore,

      dataSources: [
        'espn_fixture',
        homeStats ? 'team_competition_stats_home' : null,
        awayStats ? 'team_competition_stats_away' : null,
        homeProfile ? 'team_performance_profile_home' : null,
        awayProfile ? 'team_performance_profile_away' : null,
        headToHead ? 'head_to_head' : null,
        oddsSnapshot ? 'the_odds_api' : null,
      ].filter(Boolean),

      calculatedAt: new Date(),
    };

    const result = await this.matchDerivedDataModel
      .findOneAndUpdate(
        {
          eventId,
        },
        {
          $set: document,
        },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    this.logger.debug(`Match-derived data rebuilt for ${eventId}`);

    return result;
  }

  async rebuildForFixtures(eventIds: string[]): Promise<number> {
    if (!eventIds.length) {
      return 0;
    }

    let rebuilt = 0;

    for (const eventId of eventIds) {
      try {
        const result = await this.rebuildForFixture(eventId);

        if (result) {
          rebuilt += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to rebuild derived data for ${eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return rebuilt;
  }

  async rebuildUpcoming(competitionId?: string): Promise<number> {
    const now = new Date();

    const filter: Record<string, unknown> = {
      fixtureDate: {
        $gte: now,
      },
    };

    if (competitionId) {
      filter.leagueId = competitionId;
    }

    const fixtures = await this.fixtureModel
      .find(filter)
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    return this.rebuildForFixtures(
      fixtures
        .map((fixture) => fixture.eventId)
        .filter(
          (eventId): eventId is string =>
            typeof eventId === 'string' && eventId.length > 0,
        ),
    );
  }

  async rebuildUpcomingForTeams(
    competitionId: string,
    season: number,
    teamIds: string[],
  ): Promise<number> {
    const normalizedCompetitionId = competitionId.trim().toLowerCase();

    const normalizedTeamIds = [
      ...new Set(teamIds.map((teamId) => teamId.trim()).filter(Boolean)),
    ];

    if (!normalizedTeamIds.length) {
      return 0;
    }

    const fixtures = await this.fixtureModel
      .find({
        leagueId: normalizedCompetitionId,
        season,
        fixtureDate: {
          $gte: new Date(),
        },
        completed: {
          $ne: true,
        },
        $or: [
          {
            homeTeamId: {
              $in: normalizedTeamIds,
            },
          },
          {
            awayTeamId: {
              $in: normalizedTeamIds,
            },
          },
        ],
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    return this.rebuildForFixtures(
      fixtures
        .map((fixture) => fixture.eventId)
        .filter(
          (eventId): eventId is string =>
            typeof eventId === 'string' && eventId.length > 0,
        ),
    );
  }
  // ============================================================
  // HEAD TO HEAD
  // ============================================================

  private async findHeadToHead(
    _competitionId: string,
    homeTeamId: string,
    awayTeamId: string,
  ): Promise<HeadToHeadDocument | null> {
    return this.headToHeadModel
      .findOne({
        $or: [
          {
            teamAId: homeTeamId,
            teamBId: awayTeamId,
          },
          {
            teamAId: awayTeamId,
            teamBId: homeTeamId,
          },
        ],
      })
      .lean()
      .exec();
  }

  // ============================================================
  // LEAGUE BASELINE
  // ============================================================

  private async getLeagueBaseline(
    competitionId: string,
    season: number,
  ): Promise<LeagueBaseline> {
    const matches = await this.fixtureModel
      .find({
        leagueId: competitionId,
        season,
        completed: true,
        $or: [
          {
            homeScore: {
              $gte: 0,
            },
          },
          {
            awayScore: {
              $gte: 0,
            },
          },
        ],
      })
      .select({
        homeScore: 1,
        awayScore: 1,
      })
      .lean()
      .exec();

    let homeGoals = 0;
    let awayGoals = 0;
    let validMatches = 0;

    for (const match of matches) {
      const home = this.toNumber(match.homeScore);

      const away = this.toNumber(match.awayScore);

      if (home === null || away === null) {
        continue;
      }

      homeGoals += Math.max(0, home);
      awayGoals += Math.max(0, away);
      validMatches += 1;
    }

    if (!validMatches) {
      return {
        homeGoals: 1.45,
        awayGoals: 1.15,
        totalGoals: 2.6,
        matches: 0,
      };
    }

    const averageHome = homeGoals / validMatches;

    const averageAway = awayGoals / validMatches;

    return {
      homeGoals: averageHome,
      awayGoals: averageAway,
      totalGoals: averageHome + averageAway,
      matches: validMatches,
    };
  }

  // ============================================================
  // EXPECTED GOALS
  // ============================================================

  private calculateGoalModel(params: {
    homeStats: UnknownRecord | null;
    awayStats: UnknownRecord | null;
    homeProfile: UnknownRecord | null;
    awayProfile: UnknownRecord | null;
    headToHead: UnknownRecord | null;
    leagueBaseline: LeagueBaseline;
  }): GoalModel {
    const {
      homeStats,
      awayStats,
      homeProfile,
      awayProfile,
      headToHead,
      leagueBaseline,
    } = params;

    const homeScoring =
      this.firstNumber([
        this.getPath(homeStats, 'averageGoalsScored'),
        this.getPath(homeProfile, 'homeAverageGoalsScored'),
        this.getPath(homeProfile, 'homeGoalsPerMatch'),
        this.getPath(homeProfile, 'averageGoalsScored'),
      ]) ?? leagueBaseline.homeGoals;

    const homeConceding =
      this.firstNumber([
        this.getPath(homeStats, 'averageGoalsConceded'),
        this.getPath(homeProfile, 'homeAverageGoalsConceded'),
        this.getPath(homeProfile, 'homeGoalsConcededPerMatch'),
        this.getPath(homeProfile, 'averageGoalsConceded'),
      ]) ?? leagueBaseline.awayGoals;

    const awayScoring =
      this.firstNumber([
        this.getPath(awayStats, 'averageGoalsScored'),
        this.getPath(awayProfile, 'awayAverageGoalsScored'),
        this.getPath(awayProfile, 'awayGoalsPerMatch'),
        this.getPath(awayProfile, 'averageGoalsScored'),
      ]) ?? leagueBaseline.awayGoals;

    const awayConceding =
      this.firstNumber([
        this.getPath(awayStats, 'averageGoalsConceded'),
        this.getPath(awayProfile, 'awayAverageGoalsConceded'),
        this.getPath(awayProfile, 'awayGoalsConcededPerMatch'),
        this.getPath(awayProfile, 'averageGoalsConceded'),
      ]) ?? leagueBaseline.homeGoals;

    const homeAttackRatio = this.safeRatio(
      homeScoring,
      leagueBaseline.homeGoals,
    );

    const awayDefenseRatio = this.safeRatio(
      awayConceding,
      leagueBaseline.homeGoals,
    );

    const awayAttackRatio = this.safeRatio(
      awayScoring,
      leagueBaseline.awayGoals,
    );

    const homeDefenseRatio = this.safeRatio(
      homeConceding,
      leagueBaseline.awayGoals,
    );

    let expectedHome =
      leagueBaseline.homeGoals *
      this.weightedRatio(homeAttackRatio, awayDefenseRatio);

    let expectedAway =
      leagueBaseline.awayGoals *
      this.weightedRatio(awayAttackRatio, homeDefenseRatio);

    // ==========================================================
    // RECENT FORM ADJUSTMENT
    // ==========================================================

    const homeForm = this.firstNumber([
      this.getPath(homeProfile, 'predictiveScores.formScore'),
      this.getPath(homeProfile, 'formScore'),
      this.getPath(homeProfile, 'strengthScores.form'),
    ]);

    const awayForm = this.firstNumber([
      this.getPath(awayProfile, 'predictiveScores.formScore'),
      this.getPath(awayProfile, 'formScore'),
      this.getPath(awayProfile, 'strengthScores.form'),
    ]);

    if (homeForm !== null) {
      expectedHome *= 0.92 + this.clamp(homeForm, 0, 100) / 1000;
    }

    if (awayForm !== null) {
      expectedAway *= 0.92 + this.clamp(awayForm, 0, 100) / 1000;
    }

    // ==========================================================
    // H2H ADJUSTMENT
    // ==========================================================

    const h2hGoals = this.firstNumber([
      this.getPath(headToHead, 'averageGoals'),
      this.getPath(headToHead, 'averageTotalGoals'),
    ]);

    if (h2hGoals !== null && h2hGoals > 0) {
      const leagueTotal = leagueBaseline.totalGoals;

      const h2hAdjustment = this.clamp(
        h2hGoals / Math.max(0.5, leagueTotal),
        0.9,
        1.1,
      );

      expectedHome *= h2hAdjustment;
      expectedAway *= h2hAdjustment;
    }

    expectedHome = this.clamp(expectedHome, this.MIN_LAMBDA, this.MAX_LAMBDA);

    expectedAway = this.clamp(expectedAway, this.MIN_LAMBDA, this.MAX_LAMBDA);

    return {
      expectedHomeGoals: expectedHome,
      expectedAwayGoals: expectedAway,
      expectedTotalGoals: expectedHome + expectedAway,
    };
  }

  // ============================================================
  // POISSON
  // ============================================================

  private buildPoissonModel(
    homeLambda: number,
    awayLambda: number,
  ): PoissonMatrix {
    const matrix: number[][] = [];

    const homeGoals: NumberMap = {};
    const awayGoals: NumberMap = {};
    const totalGoals: NumberMap = {};
    const exactScores: NumberMap = {};

    let matrixTotal = 0;

    for (let home = 0; home <= this.MAX_GOALS; home += 1) {
      matrix[home] = [];

      for (let away = 0; away <= this.MAX_GOALS; away += 1) {
        const probability =
          this.poissonProbability(home, homeLambda) *
          this.poissonProbability(away, awayLambda);

        matrix[home][away] = probability;

        matrixTotal += probability;

        const scoreKey = `${home}-${away}`;

        exactScores[scoreKey] = (exactScores[scoreKey] ?? 0) + probability;

        const homeKey = String(home);

        homeGoals[homeKey] = (homeGoals[homeKey] ?? 0) + probability;

        const awayKey = String(away);

        awayGoals[awayKey] = (awayGoals[awayKey] ?? 0) + probability;

        const totalKey = String(home + away);

        totalGoals[totalKey] = (totalGoals[totalKey] ?? 0) + probability;
      }
    }

    const normalizer = matrixTotal > 0 ? matrixTotal : 1;

    this.normalizeMap(homeGoals);
    this.normalizeMap(awayGoals);
    this.normalizeMap(totalGoals);
    this.normalizeMap(exactScores);

    for (let home = 0; home <= this.MAX_GOALS; home += 1) {
      for (let away = 0; away <= this.MAX_GOALS; away += 1) {
        matrix[home][away] /= normalizer;
      }
    }

    return {
      matrix,
      homeGoals,
      awayGoals,
      totalGoals,
      exactScores,
    };
  }

  // ============================================================
  // MARKET PROBABILITIES
  // ============================================================

  private buildMarketProbabilities(params: {
    poisson: PoissonMatrix;
    firstHalfProbabilities: NumberMap;
    secondHalfProbabilities: NumberMap;
    halfTimeFullTimeProbabilities: NumberMap;
  }): NumberMap {
    const {
      poisson,
      firstHalfProbabilities,
      secondHalfProbabilities,
      halfTimeFullTimeProbabilities,
    } = params;

    const markets: NumberMap = {};

    const homeWin = this.probabilityHomeWin(poisson.matrix);

    const draw = this.probabilityDraw(poisson.matrix);

    const awayWin = this.probabilityAwayWin(poisson.matrix);

    markets.DOUBLE_CHANCE_HOME_OR_DRAW = homeWin + draw;

    markets.DOUBLE_CHANCE_AWAY_OR_DRAW = awayWin + draw;

    markets.DOUBLE_CHANCE_HOME_OR_AWAY = homeWin + awayWin;

    markets.DRAW_NO_BET_HOME = this.conditionalWithoutDraw(homeWin, draw);

    markets.DRAW_NO_BET_AWAY = this.conditionalWithoutDraw(awayWin, draw);

    markets.BOTH_TEAMS_TO_SCORE_YES = this.probabilityBttsYes(poisson.matrix);

    markets.BOTH_TEAMS_TO_SCORE_NO = 1 - markets.BOTH_TEAMS_TO_SCORE_YES;

    for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
      markets[`OVER_UNDER_OVER_${line}`] = this.probabilityOver(
        poisson.totalGoals,
        line,
      );

      markets[`OVER_UNDER_UNDER_${line}`] =
        1 - markets[`OVER_UNDER_OVER_${line}`];
    }

    for (const line of [0.5, 1.5, 2.5, 3.5]) {
      markets[`TEAM_TOTAL_HOME_OVER_${line}`] = this.probabilityTeamOver(
        poisson.homeGoals,
        line,
      );

      markets[`TEAM_TOTAL_HOME_UNDER_${line}`] =
        1 - markets[`TEAM_TOTAL_HOME_OVER_${line}`];

      markets[`TEAM_TOTAL_AWAY_OVER_${line}`] = this.probabilityTeamOver(
        poisson.awayGoals,
        line,
      );

      markets[`TEAM_TOTAL_AWAY_UNDER_${line}`] =
        1 - markets[`TEAM_TOTAL_AWAY_OVER_${line}`];
    }

    for (let goals = 0; goals <= 6; goals += 1) {
      markets[`EXACT_GOALS_HOME_${goals}`] =
        poisson.homeGoals[String(goals)] ?? 0;

      markets[`EXACT_GOALS_AWAY_${goals}`] =
        poisson.awayGoals[String(goals)] ?? 0;
    }

    markets.CLEAN_SHEET_HOME = this.probabilityCleanSheet(
      poisson.matrix,
      'home',
    );

    markets.CLEAN_SHEET_AWAY = this.probabilityCleanSheet(
      poisson.matrix,
      'away',
    );

    markets.FIRST_HALF_HOME = firstHalfProbabilities.HOME_WIN ?? 0;

    markets.FIRST_HALF_DRAW = firstHalfProbabilities.DRAW ?? 0;

    markets.FIRST_HALF_AWAY = firstHalfProbabilities.AWAY_WIN ?? 0;

    markets.SECOND_HALF_HOME = secondHalfProbabilities.HOME_WIN ?? 0;

    markets.SECOND_HALF_DRAW = secondHalfProbabilities.DRAW ?? 0;

    markets.SECOND_HALF_AWAY = secondHalfProbabilities.AWAY_WIN ?? 0;

    for (const [key, value] of Object.entries(halfTimeFullTimeProbabilities)) {
      markets[`HALF_TIME_FULL_TIME_${key}`] = value;
    }

    for (const line of [0.5, 1.5, 2.5, 3.5]) {
      markets[`FIRST_HALF_GOALS_OVER_${line}`] =
        firstHalfProbabilities[`OVER_${line}`] ?? 0;

      markets[`FIRST_HALF_GOALS_UNDER_${line}`] =
        1 - markets[`FIRST_HALF_GOALS_OVER_${line}`];

      markets[`SECOND_HALF_GOALS_OVER_${line}`] =
        secondHalfProbabilities[`OVER_${line}`] ?? 0;

      markets[`SECOND_HALF_GOALS_UNDER_${line}`] =
        1 - markets[`SECOND_HALF_GOALS_OVER_${line}`];
    }

    // ==========================================================
    // GOAL RANGE
    // ==========================================================

    markets.GOAL_RANGE_0 = poisson.totalGoals['0'] ?? 0;

    markets.GOAL_RANGE_1_2 = this.sumGoalRange(poisson.totalGoals, 1, 2);

    markets.GOAL_RANGE_3_4 = this.sumGoalRange(poisson.totalGoals, 3, 4);

    markets.GOAL_RANGE_5_PLUS = this.sumGoalRange(
      poisson.totalGoals,
      5,
      this.MAX_GOALS * 2,
    );

    // ==========================================================
    // ASIAN HANDICAP
    // ==========================================================

    for (const handicap of [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]) {
      const result = this.calculateAsianHandicap(
        poisson.matrix,
        handicap,
        'home',
      );

      markets[`ASIAN_HANDICAP_HOME_${handicap}_WIN`] = result.win;

      markets[`ASIAN_HANDICAP_HOME_${handicap}_PUSH`] = result.push;

      markets[`ASIAN_HANDICAP_HOME_${handicap}_LOSE`] = result.lose;
    }

    // ==========================================================
    // EUROPEAN HANDICAP
    // ==========================================================

    for (const handicap of [-2, -1, 0, 1, 2]) {
      markets[`EUROPEAN_HANDICAP_HOME_${handicap}_WIN`] =
        this.calculateEuropeanHandicap(poisson.matrix, handicap, 'home');

      markets[`EUROPEAN_HANDICAP_DRAW_${handicap}`] =
        this.calculateEuropeanHandicap(poisson.matrix, handicap, 'draw');

      markets[`EUROPEAN_HANDICAP_AWAY_${handicap}_WIN`] =
        this.calculateEuropeanHandicap(poisson.matrix, handicap, 'away');
    }

    markets.FIRST_HALF_GOALS = firstHalfProbabilities.TOTAL_GOALS ?? 0;

    markets.SECOND_HALF_GOALS = secondHalfProbabilities.TOTAL_GOALS ?? 0;

    return this.clampProbabilityMap(markets);
  }

  // ============================================================
  // FIRST HALF
  // ============================================================

  private calculateHalfProbabilities(
    homeProfile: UnknownRecord | null,
    awayProfile: UnknownRecord | null,
    expectedHomeGoals: number,
    expectedAwayGoals: number,
  ): NumberMap {
    const homeFirstHalf = this.firstNumber([
      this.getPath(homeProfile, 'firstHalfAverageGoalsScored'),
      this.getPath(homeProfile, 'timing.firstHalfAverageGoalsScored'),
      this.getPath(homeProfile, 'firstHalfGoalsAverage'),
    ]);

    const awayFirstHalf = this.firstNumber([
      this.getPath(awayProfile, 'firstHalfAverageGoalsScored'),
      this.getPath(awayProfile, 'timing.firstHalfAverageGoalsScored'),
      this.getPath(awayProfile, 'firstHalfGoalsAverage'),
    ]);

    const homeLambda =
      homeFirstHalf !== null ? homeFirstHalf : expectedHomeGoals * 0.45;

    const awayLambda =
      awayFirstHalf !== null ? awayFirstHalf : expectedAwayGoals * 0.45;

    return this.buildHalfResultProbabilities(homeLambda, awayLambda);
  }

  private calculateSecondHalfProbabilities(
    homeProfile: UnknownRecord | null,
    awayProfile: UnknownRecord | null,
    expectedHomeGoals: number,
    expectedAwayGoals: number,
  ): NumberMap {
    const homeSecondHalf = this.firstNumber([
      this.getPath(homeProfile, 'secondHalfAverageGoalsScored'),
      this.getPath(homeProfile, 'timing.secondHalfAverageGoalsScored'),
      this.getPath(homeProfile, 'secondHalfGoalsAverage'),
    ]);

    const awaySecondHalf = this.firstNumber([
      this.getPath(awayProfile, 'secondHalfAverageGoalsScored'),
      this.getPath(awayProfile, 'timing.secondHalfAverageGoalsScored'),
      this.getPath(awayProfile, 'secondHalfGoalsAverage'),
    ]);

    const homeLambda =
      homeSecondHalf !== null ? homeSecondHalf : expectedHomeGoals * 0.55;

    const awayLambda =
      awaySecondHalf !== null ? awaySecondHalf : expectedAwayGoals * 0.55;

    return this.buildHalfResultProbabilities(homeLambda, awayLambda);
  }

  private buildHalfResultProbabilities(
    homeLambda: number,
    awayLambda: number,
  ): NumberMap {
    const matrix: number[][] = [];

    let homeWin = 0;
    let draw = 0;
    let awayWin = 0;
    let totalGoals = 0;

    let matrixSum = 0;

    for (let home = 0; home <= 8; home += 1) {
      matrix[home] = [];

      for (let away = 0; away <= 8; away += 1) {
        const p =
          this.poissonProbability(home, homeLambda) *
          this.poissonProbability(away, awayLambda);

        matrix[home][away] = p;
        matrixSum += p;

        if (home > away) {
          homeWin += p;
        } else if (home === away) {
          draw += p;
        } else {
          awayWin += p;
        }

        if (home + away > 0) {
          totalGoals += p;
        }
      }
    }

    const normalizer = matrixSum > 0 ? matrixSum : 1;

    return {
      HOME_WIN: homeWin / normalizer,

      DRAW: draw / normalizer,

      AWAY_WIN: awayWin / normalizer,

      TOTAL_GOALS: 1 - totalGoals / normalizer,

      'OVER_0.5': 1 - this.poissonProbability(0, homeLambda + awayLambda),

      'OVER_1.5':
        1 -
        (this.poissonProbability(0, homeLambda + awayLambda) +
          this.poissonProbability(1, homeLambda + awayLambda)),

      'OVER_2.5':
        1 -
        (this.poissonProbability(0, homeLambda + awayLambda) +
          this.poissonProbability(1, homeLambda + awayLambda) +
          this.poissonProbability(2, homeLambda + awayLambda)),

      'OVER_3.5':
        1 -
        (this.poissonProbability(0, homeLambda + awayLambda) +
          this.poissonProbability(1, homeLambda + awayLambda) +
          this.poissonProbability(2, homeLambda + awayLambda) +
          this.poissonProbability(3, homeLambda + awayLambda)),
    };
  }

  // ============================================================
  // HALF TIME / FULL TIME
  // ============================================================

  private calculateHalfTimeFullTime(
    firstHalf: NumberMap,
    secondHalf: NumberMap,
  ): NumberMap {
    const results: NumberMap = {};

    const firstHalfStates = {
      HOME: firstHalf.HOME_WIN ?? 0,
      DRAW: firstHalf.DRAW ?? 0,
      AWAY: firstHalf.AWAY_WIN ?? 0,
    };

    const secondHalfStates = {
      HOME: secondHalf.HOME_WIN ?? 0,
      DRAW: secondHalf.DRAW ?? 0,
      AWAY: secondHalf.AWAY_WIN ?? 0,
    };

    for (const [ht, htProbability] of Object.entries(firstHalfStates)) {
      for (const [ftShift, shiftProbability] of Object.entries(
        secondHalfStates,
      )) {
        let fullTime: 'HOME' | 'DRAW' | 'AWAY';

        if (ht === 'HOME') {
          if (ftShift === 'AWAY') {
            fullTime = 'AWAY';
          } else {
            fullTime = 'HOME';
          }
        } else if (ht === 'AWAY') {
          if (ftShift === 'HOME') {
            fullTime = 'HOME';
          } else {
            fullTime = 'AWAY';
          }
        } else {
          fullTime =
            ftShift === 'HOME' ? 'HOME' : ftShift === 'AWAY' ? 'AWAY' : 'DRAW';
        }

        const key = `${ht}_${fullTime}`;

        results[key] = (results[key] ?? 0) + htProbability * shiftProbability;
      }
    }

    return this.clampProbabilityMap(results);
  }

  // ============================================================
  // SCORING FIRST
  // ============================================================

  private calculateScoringFirstProbabilities(
    poisson: PoissonMatrix,
  ): NumberMap {
    let homeFirst = 0;
    let awayFirst = 0;

    for (let home = 0; home <= this.MAX_GOALS; home += 1) {
      for (let away = 0; away <= this.MAX_GOALS; away += 1) {
        const p = poisson.matrix[home]?.[away] ?? 0;

        if (home > away && home > 0) {
          homeFirst += p;
        }

        if (away > home && away > 0) {
          awayFirst += p;
        }
      }
    }

    const noGoalFirst = Math.max(0, 1 - homeFirst - awayFirst);

    const total = homeFirst + awayFirst + noGoalFirst;

    return {
      HOME: total > 0 ? homeFirst / total : 0,

      AWAY: total > 0 ? awayFirst / total : 0,

      NONE: total > 0 ? noGoalFirst / total : 0,
    };
  }

  // ============================================================
  // ODDS API
  // ============================================================

  private extractBookmakerData(
    payload: UnknownRecord | undefined,
    fixture: {
      payload: unknown;
      homeTeamName?: string;
      awayTeamName?: string;
    },
  ): BookmakerData {
    const impliedProbabilities: NumberMap = {};

    const consensus: UnknownRecord = {
      markets: {},
      bookmakers: {},
    };

    if (!payload) {
      return {
        impliedProbabilities,
        consensus,
        bookmakerCount: 0,
        marketCount: 0,
        qualityScore: 0,
      };
    }

    const bookmakers = this.readArray(payload.bookmakers);

    let validBookmakers = 0;
    let marketCount = 0;

    for (const bookmaker of bookmakers) {
      const bookmakerRecord = this.asRecord(bookmaker);

      if (!bookmakerRecord) {
        continue;
      }

      const markets = this.readArray(bookmakerRecord.markets);

      if (!markets.length) {
        continue;
      }

      validBookmakers += 1;

      for (const market of markets) {
        const marketRecord = this.asRecord(market);

        if (!marketRecord) {
          continue;
        }

        const marketKey = this.toString(marketRecord.key);

        if (!marketKey) {
          continue;
        }

        const outcomes = this.readArray(marketRecord.outcomes);

        if (!outcomes.length) {
          continue;
        }

        marketCount += 1;

        for (const outcome of outcomes) {
          const outcomeRecord = this.asRecord(outcome);

          if (!outcomeRecord) {
            continue;
          }

          const price = this.toNumber(outcomeRecord.price);

          if (price === null || price <= 1) {
            continue;
          }

          const implied = 1 / price;

          const key = this.mapOddsOutcomeKey(marketKey, outcomeRecord, fixture);

          if (!key) {
            continue;
          }

          if (!impliedProbabilities[key]) {
            impliedProbabilities[key] = 0;
          }

          impliedProbabilities[key] += implied;
        }
      }
    }

    const marketCounts = new Map<string, number>();

    for (const key of Object.keys(impliedProbabilities)) {
      const existing = marketCounts.get(key) ?? 0;

      marketCounts.set(key, existing + 1);
    }

    for (const key of Object.keys(impliedProbabilities)) {
      const count = marketCounts.get(key) ?? 1;

      impliedProbabilities[key] = this.clamp(
        impliedProbabilities[key] / count,
        0,
        1,
      );
    }

    const h2h = Object.entries(impliedProbabilities).filter(([key]) =>
      key.startsWith('H2H_'),
    );

    const totals = Object.entries(impliedProbabilities).filter(([key]) =>
      key.startsWith('TOTALS_'),
    );

    consensus.markets = {
      h2h: Object.fromEntries(h2h),
      totals: Object.fromEntries(totals),
      all: {
        ...impliedProbabilities,
      },
    };

    consensus.bookmakers = {
      bookmakerCount: validBookmakers,
      marketCount,
    };

    const qualityScore = this.calculateOddsQuality(
      validBookmakers,
      marketCount,
    );

    return {
      impliedProbabilities,
      consensus,
      bookmakerCount: validBookmakers,
      marketCount,
      qualityScore,
    };
  }

  private mapOddsOutcomeKey(
    marketKey: string,
    outcome: UnknownRecord,
    fixture: UnknownRecord,
  ): string | null {
    const outcomeName = this.toString(outcome.name);

    if (!outcomeName) {
      return null;
    }

    const homeName = this.toString(fixture.homeTeamName) ?? '';

    const awayName = this.toString(fixture.awayTeamName) ?? '';

    const normalized = outcomeName.trim().toLowerCase();

    if (marketKey === 'h2h' || marketKey === 'moneyline') {
      if (normalized === homeName.trim().toLowerCase()) {
        return 'H2H_HOME';
      }

      if (normalized === awayName.trim().toLowerCase()) {
        return 'H2H_AWAY';
      }

      if (normalized === 'draw') {
        return 'H2H_DRAW';
      }
    }

    if (marketKey === 'totals') {
      const point = this.toNumber(outcome.point);

      const side =
        normalized === 'over'
          ? 'OVER'
          : normalized === 'under'
            ? 'UNDER'
            : null;

      if (point !== null && side) {
        return `TOTALS_${side}_${point}`;
      }
    }

    if (marketKey === 'btts') {
      if (normalized === 'yes') {
        return 'BTTS_YES';
      }

      if (normalized === 'no') {
        return 'BTTS_NO';
      }
    }

    if (marketKey === 'double_chance') {
      if (normalized.includes('home') && normalized.includes('draw')) {
        return 'DOUBLE_CHANCE_HOME_OR_DRAW';
      }

      if (normalized.includes('away') && normalized.includes('draw')) {
        return 'DOUBLE_CHANCE_AWAY_OR_DRAW';
      }

      if (normalized.includes('home') && normalized.includes('away')) {
        return 'DOUBLE_CHANCE_HOME_OR_AWAY';
      }
    }

    if (marketKey === 'draw_no_bet') {
      if (normalized === homeName.trim().toLowerCase()) {
        return 'DNB_HOME';
      }

      if (normalized === awayName.trim().toLowerCase()) {
        return 'DNB_AWAY';
      }
    }

    return null;
  }

  // ============================================================
  // EDGES
  // ============================================================

  private calculateProbabilityEdge(
    modelProbabilities: NumberMap,
    bookmakerProbabilities: NumberMap,
  ): NumberMap {
    const edge: NumberMap = {};

    for (const [key, modelProbability] of Object.entries(modelProbabilities)) {
      const bookmakerProbability = this.findMatchingBookmakerProbability(
        key,
        bookmakerProbabilities,
      );

      if (bookmakerProbability === null) {
        continue;
      }

      edge[key] = this.round(modelProbability - bookmakerProbability, 6);
    }

    return edge;
  }

  private calculateMarketAgreement(
    modelProbabilities: NumberMap,
    bookmakerProbabilities: NumberMap,
  ): NumberMap {
    const agreement: NumberMap = {};

    for (const [key, modelProbability] of Object.entries(modelProbabilities)) {
      const bookmakerProbability = this.findMatchingBookmakerProbability(
        key,
        bookmakerProbabilities,
      );

      if (bookmakerProbability === null) {
        continue;
      }

      agreement[key] = this.round(
        1 - Math.abs(modelProbability - bookmakerProbability),
        6,
      );
    }

    return agreement;
  }

  private findMatchingBookmakerProbability(
    marketKey: string,
    bookmakerProbabilities: NumberMap,
  ): number | null {
    const direct = bookmakerProbabilities[marketKey];

    if (typeof direct === 'number') {
      return direct;
    }

    if (marketKey === 'BOTH_TEAMS_TO_SCORE_YES') {
      return bookmakerProbabilities.BTTS_YES ?? null;
    }

    if (marketKey === 'BOTH_TEAMS_TO_SCORE_NO') {
      return bookmakerProbabilities.BTTS_NO ?? null;
    }

    if (marketKey === 'DOUBLE_CHANCE_HOME_OR_DRAW') {
      return bookmakerProbabilities.DOUBLE_CHANCE_HOME_OR_DRAW ?? null;
    }

    if (marketKey === 'DOUBLE_CHANCE_AWAY_OR_DRAW') {
      return bookmakerProbabilities.DOUBLE_CHANCE_AWAY_OR_DRAW ?? null;
    }

    return null;
  }

  // ============================================================
  // DATA QUALITY
  // ============================================================

  private calculateDataCompletenessScore(data: {
    homeStats: UnknownRecord | null;
    awayStats: UnknownRecord | null;
    homeProfile: UnknownRecord | null;
    awayProfile: UnknownRecord | null;
    headToHead: UnknownRecord | null;
  }): number {
    let score = 0;
    let total = 0;

    const fields: Array<keyof typeof data> = [
      'homeStats',
      'awayStats',
      'homeProfile',
      'awayProfile',
      'headToHead',
    ];

    for (const field of fields) {
      total += 1;

      if (data[field]) {
        score += 1;
      }
    }

    return total > 0 ? this.round((score / total) * 100, 2) : 0;
  }

  private calculateStatisticalReliabilityScore(data: {
    homeStats: UnknownRecord | null;
    awayStats: UnknownRecord | null;
    homeProfile: UnknownRecord | null;
    awayProfile: UnknownRecord | null;
  }): number {
    const sampleSizes: number[] = [];

    for (const source of [
      data.homeStats,
      data.awayStats,
      data.homeProfile,
      data.awayProfile,
    ]) {
      if (!source) {
        continue;
      }

      const sample = this.firstNumber([
        this.getPath(source, 'sampleSize'),
        this.getPath(source, 'matchesPlayed'),
        this.getPath(source, 'played'),
        this.getPath(source, 'sampleMatches'),
      ]);

      if (sample !== null) {
        sampleSizes.push(Math.max(0, sample));
      }
    }

    if (!sampleSizes.length) {
      return 25;
    }

    const averageSample =
      sampleSizes.reduce((sum, value) => sum + value, 0) / sampleSizes.length;

    return this.round(this.clamp((averageSample / 20) * 100, 0, 100), 2);
  }

  private calculateOverallDataQuality(data: {
    dataCompletenessScore: number;
    statisticalReliabilityScore: number;
    marketDataQualityScore: number;
  }): number {
    return this.round(
      data.dataCompletenessScore * 0.3 +
        data.statisticalReliabilityScore * 0.5 +
        data.marketDataQualityScore * 0.2,
      2,
    );
  }

  private calculateOddsQuality(
    bookmakerCount: number,
    marketCount: number,
  ): number {
    if (bookmakerCount <= 0 || marketCount <= 0) {
      return 0;
    }

    const bookmakerScore = this.clamp(bookmakerCount / 10, 0, 1);

    const marketScore = this.clamp(marketCount / 30, 0, 1);

    return this.round((bookmakerScore * 0.6 + marketScore * 0.4) * 100, 2);
  }

  // ============================================================
  // POISSON HELPERS
  // ============================================================

  private poissonProbability(goals: number, lambda: number): number {
    if (goals < 0 || lambda < 0) {
      return 0;
    }

    const exponent = Math.exp(-lambda);

    let factorial = 1;

    for (let i = 2; i <= goals; i += 1) {
      factorial *= i;
    }

    return (exponent * Math.pow(lambda, goals)) / factorial;
  }

  private probabilityHomeWin(matrix: number[][]): number {
    let probability = 0;

    for (let home = 0; home < matrix.length; home += 1) {
      for (let away = 0; away < matrix[home].length; away += 1) {
        if (home > away) {
          probability += matrix[home][away];
        }
      }
    }

    return this.clamp(probability, 0, 1);
  }

  private probabilityDraw(matrix: number[][]): number {
    let probability = 0;

    for (let i = 0; i < matrix.length; i += 1) {
      if (matrix[i]?.[i] !== undefined) {
        probability += matrix[i][i];
      }
    }

    return this.clamp(probability, 0, 1);
  }

  private probabilityAwayWin(matrix: number[][]): number {
    let probability = 0;

    for (let home = 0; home < matrix.length; home += 1) {
      for (let away = 0; away < matrix[home].length; away += 1) {
        if (away > home) {
          probability += matrix[home][away];
        }
      }
    }

    return this.clamp(probability, 0, 1);
  }

  private probabilityBttsYes(matrix: number[][]): number {
    let probability = 0;

    for (let home = 1; home < matrix.length; home += 1) {
      for (let away = 1; away < matrix[home].length; away += 1) {
        probability += matrix[home][away];
      }
    }

    return this.clamp(probability, 0, 1);
  }

  private probabilityCleanSheet(
    matrix: number[][],
    side: 'home' | 'away',
  ): number {
    let probability = 0;

    for (let home = 0; home < matrix.length; home += 1) {
      for (let away = 0; away < matrix[home].length; away += 1) {
        if (side === 'home' && away === 0) {
          probability += matrix[home][away];
        }

        if (side === 'away' && home === 0) {
          probability += matrix[home][away];
        }
      }
    }

    return this.clamp(probability, 0, 1);
  }

  private probabilityOver(distribution: NumberMap, line: number): number {
    let probability = 0;

    for (const [total, value] of Object.entries(distribution)) {
      if (Number(total) > line) {
        probability += value;
      }
    }

    return this.clamp(probability, 0, 1);
  }

  private probabilityTeamOver(distribution: NumberMap, line: number): number {
    return this.probabilityOver(distribution, line);
  }

  private conditionalWithoutDraw(probability: number, draw: number): number {
    const denominator = 1 - draw;

    if (denominator <= 0) {
      return 0;
    }

    return this.clamp(probability / denominator, 0, 1);
  }

  private sumGoalRange(
    distribution: NumberMap,
    min: number,
    max: number,
  ): number {
    let total = 0;

    for (const [key, value] of Object.entries(distribution)) {
      const goals = Number(key);

      if (goals >= min && goals <= max) {
        total += value;
      }
    }

    return this.clamp(total, 0, 1);
  }

  // ============================================================
  // ASIAN HANDICAP
  // ============================================================

  private calculateAsianHandicap(
    matrix: number[][],
    handicap: number,
    side: 'home' | 'away',
  ): {
    win: number;
    push: number;
    lose: number;
  } {
    let win = 0;
    let push = 0;
    let lose = 0;

    for (let home = 0; home < matrix.length; home += 1) {
      for (let away = 0; away < matrix[home].length; away += 1) {
        const probability = matrix[home][away];

        const margin =
          side === 'home' ? home - away + handicap : away - home + handicap;

        if (margin > 0) {
          win += probability;
        } else if (Math.abs(margin) < 0.000001) {
          push += probability;
        } else {
          lose += probability;
        }
      }
    }

    return {
      win: this.clamp(win, 0, 1),
      push: this.clamp(push, 0, 1),
      lose: this.clamp(lose, 0, 1),
    };
  }

  // ============================================================
  // EUROPEAN HANDICAP
  // ============================================================

  private calculateEuropeanHandicap(
    matrix: number[][],
    handicap: number,
    outcome: 'home' | 'draw' | 'away',
  ): number {
    let probability = 0;

    for (let home = 0; home < matrix.length; home += 1) {
      for (let away = 0; away < matrix[home].length; away += 1) {
        const adjusted = home + handicap - away;

        if (outcome === 'home' && adjusted > 0) {
          probability += matrix[home][away];
        }

        if (outcome === 'draw' && Math.abs(adjusted) < 0.000001) {
          probability += matrix[home][away];
        }

        if (outcome === 'away' && adjusted < 0) {
          probability += matrix[home][away];
        }
      }
    }

    return this.clamp(probability, 0, 1);
  }

  // ============================================================
  // GENERAL HELPERS
  // ============================================================

  private weightedRatio(first: number, second: number): number {
    return first * 0.55 + second * 0.45;
  }

  private safeRatio(numerator: number, denominator: number): number {
    if (denominator <= 0) {
      return 1;
    }

    return this.clamp(numerator / denominator, 0.35, 2.5);
  }

  private normalizeMap(map: NumberMap): void {
    const total = Object.values(map).reduce((sum, value) => sum + value, 0);

    if (total <= 0) {
      return;
    }

    for (const key of Object.keys(map)) {
      map[key] = map[key] / total;
    }
  }

  private clampProbabilityMap(map: NumberMap): NumberMap {
    for (const key of Object.keys(map)) {
      map[key] = this.clamp(map[key], 0, 1);
    }

    return map;
  }

  private firstNumber(values: unknown[]): number | null {
    for (const value of values) {
      const number = this.toNumber(value);

      if (number !== null && Number.isFinite(number)) {
        return number;
      }
    }

    return null;
  }

  private getPath(source: UnknownRecord | null, path: string): unknown {
    if (!source) {
      return undefined;
    }

    const parts = path.split('.');

    let current: unknown = source;

    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      current = (current as UnknownRecord)[part];
    }

    return current;
  }

  private asRecord(value: unknown): UnknownRecord | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as UnknownRecord;
    }

    return null;
  }

  private readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private toString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    return null;
  }

  private round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);

    return Math.round(value * factor) / factor;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getFixtureTeamName(
    fixture: EspnFixtureDocument,
    side: 'home' | 'away',
  ): string {
    const payload = this.asRecord(fixture.payload);
    const competitions = this.readArray(payload?.competitions);
    const event = this.asRecord(payload?.event);
    const eventCompetitions = this.readArray(event?.competitions);
    const competition =
      this.asRecord(competitions[0]) ??
      this.asRecord(payload?.competition) ??
      this.asRecord(eventCompetitions[0]);

    const competitors = this.readArray(competition?.competitors);

    const competitor =
      competitors.find((item) => {
        const competitorRecord = this.asRecord(item);

        return (
          competitorRecord?.homeAway === side ||
          (side === 'home'
            ? competitorRecord?.isHome === true
            : competitorRecord?.isAway === true)
        );
      }) ?? competitors[side === 'home' ? 0 : 1];

    const competitorRecord = this.asRecord(competitor);
    const team = this.asRecord(competitorRecord?.team) ?? competitorRecord;

    return (
      this.toString(team?.displayName) ??
      this.toString(team?.name) ??
      this.toString(team?.shortDisplayName) ??
      `Team ${side === 'home' ? fixture.homeTeamId : fixture.awayTeamId}`
    );
  }
}
