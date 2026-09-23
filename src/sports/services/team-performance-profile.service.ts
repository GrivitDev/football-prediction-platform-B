import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  TeamPerformanceProfile,
  TeamPerformanceProfileDocument,
} from '../schemas/team-performance-profile.schema';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { EspnTeam, EspnTeamDocument } from '../schemas/espn/espn-team.schema';

interface MatchStatValues {
  possession?: number;
  shots?: number;
  shotsOnTarget?: number;
  corners?: number;
  fouls?: number;
  offsides?: number;
  yellowCards?: number;
  redCards?: number;
  saves?: number;
  expectedGoals?: number;
}

type EspnCompetition = Record<string, unknown> & {
  details?: Array<Record<string, unknown>>;
};

interface TeamMatch {
  fixtureId: string;
  date: Date;
  competitionId: string;

  teamId: string;
  teamName: string;

  opponentId: string;
  opponentName: string;

  home: boolean;

  goalsFor: number;
  goalsAgainst: number;

  result: 'W' | 'D' | 'L';

  totalGoals: number;

  firstHalfGoalsFor: number;
  firstHalfGoalsAgainst: number;

  secondHalfGoalsFor: number;
  secondHalfGoalsAgainst: number;

  halfTimeResult: 'W' | 'D' | 'L';

  scoredFirst: boolean;
  concededFirst: boolean;

  cameFromBehind: boolean;
  protectedLead: boolean;

  btts: boolean;
  cleanSheet: boolean;
  failedToScore: boolean;

  statistics: MatchStatValues;
}

interface MatchSummary {
  fixture: EspnFixtureDocument;
  teamMatch: TeamMatch;
  eventId?: string;
  fixtureDate?: Date;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore?: number;
  awayScore?: number;
  homeHalfTimeScore?: number;
  awayHalfTimeScore?: number;
  payload?: Record<string, unknown>;

  [key: string]: any;
}

interface AggregateStats {
  played: number;

  wins: number;
  draws: number;
  losses: number;
  points: number;

  goalsScored: number;
  goalsConceded: number;

  cleanSheets: number;
  failedToScore: number;

  btts: number;

  over05: number;
  over15: number;
  over25: number;
  over35: number;
  over45: number;
  over55: number;

  under05: number;
  under15: number;
  under25: number;
  under35: number;
  under45: number;
  under55: number;

  firstHalfGoalsScored: number;
  firstHalfGoalsConceded: number;

  secondHalfGoalsScored: number;
  secondHalfGoalsConceded: number;

  firstHalfWins: number;
  firstHalfDraws: number;
  firstHalfLosses: number;

  secondHalfWins: number;
  secondHalfDraws: number;
  secondHalfLosses: number;

  scoredFirst: number;
  concededFirst: number;

  cameFromBehind: number;
  protectedLead: number;

  possessionTotal: number;
  possessionCount: number;

  shotsTotal: number;
  shotsCount: number;

  shotsOnTargetTotal: number;
  shotsOnTargetCount: number;

  cornersTotal: number;
  cornersCount: number;

  foulsTotal: number;
  foulsCount: number;

  offsidesTotal: number;
  offsidesCount: number;

  yellowCardsTotal: number;
  yellowCardsCount: number;

  redCardsTotal: number;
  redCardsCount: number;

  savesTotal: number;
  savesCount: number;

  expectedGoalsTotal: number;
  expectedGoalsCount: number;

  goalDistribution: number[];

  exactScoreDistribution: Record<string, number>;

  halfTimeScoreDistribution: Record<string, number>;

  secondHalfScoreDistribution: Record<string, number>;
}

interface WindowStats {
  possessionTotal: number;
  possessionCount: number;

  shotsTotal: number;
  shotsCount: number;

  shotsOnTargetTotal: number;
  shotsOnTargetCount: number;

  cornersTotal: number;
  cornersCount: number;

  foulsTotal: number;
  foulsCount: number;

  offsidesTotal: number;
  offsidesCount: number;

  yellowCardsTotal: number;
  yellowCardsCount: number;

  redCardsTotal: number;
  redCardsCount: number;

  savesTotal: number;
  savesCount: number;

  expectedGoalsTotal: number;
  expectedGoalsCount: number;
}

@Injectable()
export class TeamPerformanceProfileService {
  private readonly logger = new Logger(TeamPerformanceProfileService.name);

  private readonly completedStatuses = new Set([
    'FT',
    'AET',
    'PEN',
    'FINAL',
    'FINISHED',
    'COMPLETED',
    'POST',
    'STATUS_FINAL',
  ]);

  constructor(
    @InjectModel(TeamPerformanceProfile.name)
    private readonly profileModel: Model<TeamPerformanceProfileDocument>,

    @InjectModel(EspnFixture.name)
    private readonly fixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(EspnTeam.name)
    private readonly teamModel: Model<EspnTeamDocument>,
  ) {}

  // ============================================================
  // REBUILD COMPETITION
  // ============================================================

  async rebuildCompetition(
    competitionId: string,
    season: number,
  ): Promise<number> {
    const leagueId = competitionId.trim().toLowerCase();

    const fixtures = await this.fixtureModel
      .find({
        leagueId,
        season,
      })
      .sort({
        fixtureDate: -1,
      })
      .lean()
      .exec();

    const completedFixtures = fixtures.filter((fixture) =>
      this.isCompletedFixture(fixture),
    );

    if (!completedFixtures.length) {
      return 0;
    }

    const teamIds = new Set<string>();

    for (const fixture of completedFixtures) {
      if (fixture.homeTeamId) {
        teamIds.add(fixture.homeTeamId);
      }

      if (fixture.awayTeamId) {
        teamIds.add(fixture.awayTeamId);
      }
    }

    const teams = await this.getTeamNames(leagueId, [...teamIds]);

    const summaries = this.buildMatchSummaries(completedFixtures, teams);

    let rebuilt = 0;

    for (const teamId of teamIds) {
      const matches = summaries
        .filter((item) => item.teamMatch.teamId === teamId)
        .sort(
          (a, b) => b.teamMatch.date.getTime() - a.teamMatch.date.getTime(),
        );

      if (!matches.length) {
        continue;
      }

      await this.rebuildTeamProfile(leagueId, season, teamId, matches);

      rebuilt += 1;
    }

    return rebuilt;
  }

  // ============================================================
  // REFRESH TEAM
  // ============================================================

  async refreshForTeam(
    competitionId: string,
    season: number,
    teamId: string,
  ): Promise<boolean> {
    const leagueId = competitionId.trim().toLowerCase();
    const normalizedTeamId = teamId.trim();

    if (!normalizedTeamId) {
      return false;
    }

    const fixtures = await this.fixtureModel
      .find({
        leagueId,
        season,
        $or: [
          { homeTeamId: normalizedTeamId },
          { awayTeamId: normalizedTeamId },
        ],
      })
      .sort({
        fixtureDate: -1,
      })
      .lean()
      .exec();

    const completedFixtures = fixtures.filter((fixture) =>
      this.isCompletedFixture(fixture),
    );

    if (!completedFixtures.length) {
      return false;
    }

    const ids = new Set<string>([normalizedTeamId]);

    for (const fixture of completedFixtures) {
      const opponent =
        fixture.homeTeamId === normalizedTeamId
          ? fixture.awayTeamId
          : fixture.homeTeamId;

      if (opponent) {
        ids.add(opponent);
      }
    }

    const teams = await this.getTeamNames(leagueId, [...ids]);

    const summaries = this.buildMatchSummaries(
      completedFixtures,
      teams,
      normalizedTeamId,
    );

    const matches = summaries
      .filter((item) => item.teamMatch.teamId === normalizedTeamId)
      .sort((a, b) => b.teamMatch.date.getTime() - a.teamMatch.date.getTime());

    if (!matches.length) {
      return false;
    }

    await this.rebuildTeamProfile(leagueId, season, normalizedTeamId, matches);

    return true;
  }

  // ============================================================
  // REFRESH FROM FIXTURE
  // ============================================================

  async refreshForFixture(fixtureId: string): Promise<number> {
    const fixture = await this.fixtureModel
      .findOne({
        eventId: fixtureId.trim(),
      })
      .lean()
      .exec();

    if (!fixture || !this.isCompletedFixture(fixture)) {
      return 0;
    }

    const teamIds = [fixture.homeTeamId, fixture.awayTeamId].filter(
      (value): value is string => Boolean(value),
    );

    let refreshed = 0;

    for (const teamId of teamIds) {
      if (await this.refreshForTeam(fixture.leagueId, fixture.season, teamId)) {
        refreshed += 1;
      }
    }

    return refreshed;
  }

  // ============================================================
  // REBUILD PROFILE
  // ============================================================

  private async rebuildTeamProfile(
    leagueId: string,
    season: number,
    teamId: string,
    summaries: MatchSummary[],
  ): Promise<void> {
    const matches = summaries
      .map((item) => item.teamMatch)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (!matches.length) {
      return;
    }

    const lastFive = matches.slice(0, 5);
    const lastTen = matches.slice(0, 10);

    const overall = this.createAggregateStats();
    const home = this.createAggregateStats();
    const away = this.createAggregateStats();

    for (const summary of summaries) {
      this.applyMatch(overall, summary.teamMatch);

      if (summary.teamMatch.home) {
        this.applyMatch(home, summary.teamMatch);
      } else {
        this.applyMatch(away, summary.teamMatch);
      }
    }

    const lastFiveSummaries = summaries
      .filter((item) =>
        lastFive.some((match) => match.fixtureId === item.teamMatch.fixtureId),
      )
      .slice(0, 5);

    const lastFiveStats = this.calculateWindowStats(lastFiveSummaries);

    const lastFiveAverage = this.calculateWindowAverages(lastFiveStats);

    const timing = {
      firstHalfGoalsScored: overall.firstHalfGoalsScored,

      firstHalfGoalsConceded: overall.firstHalfGoalsConceded,

      secondHalfGoalsScored: overall.secondHalfGoalsScored,

      secondHalfGoalsConceded: overall.secondHalfGoalsConceded,
    };

    const recentFormScore = this.calculateFormScore(lastFive);

    const attackingFormScore = this.calculateAttackingFormScore(lastFive);

    const defensiveFormScore = this.calculateDefensiveFormScore(lastFive);

    const homeFormScore = this.calculateFormScore(
      matches.filter((match) => match.home).slice(0, 5),
    );

    const awayFormScore = this.calculateFormScore(
      matches.filter((match) => !match.home).slice(0, 5),
    );

    const momentumScore = this.calculateMomentumScore(matches);

    const overallPerformanceScore = this.calculateOverallPerformanceScore(
      overall,
      recentFormScore,
      momentumScore,
    );

    const previousMatch = matches[0];

    const nextFixture = await this.getNextFixture(leagueId, season, teamId);

    const team = await this.teamModel
      .findOne({
        leagueId,
        teamId,
      })
      .lean()
      .exec();

    const teamName = team?.name ?? previousMatch?.teamName ?? `Team ${teamId}`;

    const teamLogo = team?.logo;

    const historicalProbabilities =
      this.calculateHistoricalProbabilities(overall);

    const goalDistribution = this.toPercentDistribution(
      overall.goalDistribution,
      overall.played,
    );

    const exactScoreDistribution = this.toPercentMap(
      overall.exactScoreDistribution,
      overall.played,
    );

    const totalGoalsProbabilities =
      this.calculateTotalGoalsProbabilities(overall);

    const halfTimeProbabilities = this.calculateHalfTimeProbabilities(matches);

    const secondHalfProbabilities =
      this.calculateSecondHalfProbabilities(matches);

    const scoringTimingProbabilities =
      this.calculateScoringTimingProbabilities(overall);

    const dataCoverage = this.calculateDataCoverage(matches);

    const dataCompletenessScore = this.calculateDataCompletenessScore(
      matches,
      dataCoverage,
    );

    const statisticalSampleScore = this.calculateStatisticalSampleScore(
      matches.length,
    );

    const profileReliabilityScore = Number(
      (dataCompletenessScore * 0.55 + statisticalSampleScore * 0.45).toFixed(2),
    );

    const recentWins = lastFive.filter((match) => match.result === 'W').length;

    const recentDraws = lastFive.filter((match) => match.result === 'D').length;

    const recentLosses = lastFive.filter(
      (match) => match.result === 'L',
    ).length;

    const streaks = this.calculateStreaks(matches);

    const homeAdvancedStats = this.serializeAdvancedAggregate(home);

    const awayAdvancedStats = this.serializeAdvancedAggregate(away);

    await this.profileModel
      .updateOne(
        {
          competitionId: leagueId,
          season,
          teamId,
        },
        {
          $set: {
            competitionId: leagueId,
            season,
            teamId,
            teamName,
            teamLogo,

            matchesAnalyzed: matches.length,
            matchesLastFive: lastFive.length,
            matchesLastTen: lastTen.length,

            formLastFive: lastFive.map((match) => match.result),

            formLastTen: lastTen.map((match) => match.result),

            lastFivePoints: this.getFormPoints(lastFive),

            lastTenPoints: this.getFormPoints(lastTen),

            currentWinStreak: streaks.currentWinStreak,

            currentDrawStreak: streaks.currentDrawStreak,

            currentLossStreak: streaks.currentLossStreak,

            unbeatenStreak: streaks.unbeatenStreak,

            winlessStreak: streaks.winlessStreak,

            scoringStreak: streaks.scoringStreak,

            cleanSheetStreak: streaks.cleanSheetStreak,

            recentWins,
            recentDraws,
            recentLosses,

            recentWinRate: this.rate(recentWins, lastFive.length),

            recentDrawRate: this.rate(recentDraws, lastFive.length),

            recentLossRate: this.rate(recentLosses, lastFive.length),

            recentPointsPerMatch: this.average(
              this.getFormPoints(lastFive),
              lastFive.length,
            ),

            wins: overall.wins,
            draws: overall.draws,
            losses: overall.losses,
            points: overall.points,

            goalsScored: overall.goalsScored,

            goalsConceded: overall.goalsConceded,

            averageGoalsScored: this.average(
              overall.goalsScored,
              overall.played,
            ),

            averageGoalsConceded: this.average(
              overall.goalsConceded,
              overall.played,
            ),

            goalDifference: overall.goalsScored - overall.goalsConceded,

            averageGoalDifference: this.average(
              overall.goalsScored - overall.goalsConceded,
              overall.played,
            ),

            cleanSheets: overall.cleanSheets,

            cleanSheetRate: this.rate(overall.cleanSheets, overall.played),

            failedToScore: overall.failedToScore,

            failedToScoreRate: this.rate(overall.failedToScore, overall.played),

            bttsCount: overall.btts,

            bttsRate: this.rate(overall.btts, overall.played),

            over05Count: overall.over05,

            over05Rate: this.rate(overall.over05, overall.played),

            over15Count: overall.over15,

            over15Rate: this.rate(overall.over15, overall.played),

            over25Count: overall.over25,

            over25Rate: this.rate(overall.over25, overall.played),

            over35Count: overall.over35,

            over35Rate: this.rate(overall.over35, overall.played),

            over45Count: overall.over45,

            over45Rate: this.rate(overall.over45, overall.played),

            over55Count: overall.over55,

            over55Rate: this.rate(overall.over55, overall.played),

            under15Rate: this.rate(overall.under15, overall.played),

            under25Rate: this.rate(overall.under25, overall.played),

            under35Rate: this.rate(overall.under35, overall.played),

            under45Rate: this.rate(overall.under45, overall.played),

            under55Rate: this.rate(overall.under55, overall.played),

            goalDistribution,

            exactScoreDistribution,

            historicalProbabilities,

            totalGoalsProbabilities,

            homeMatches: home.played,

            homeWins: home.wins,

            homeDraws: home.draws,

            homeLosses: home.losses,

            homePoints: home.points,

            homeWinRate: this.rate(home.wins, home.played),

            homeDrawRate: this.rate(home.draws, home.played),

            homeLossRate: this.rate(home.losses, home.played),

            homeGoalsScored: home.goalsScored,

            homeGoalsConceded: home.goalsConceded,

            homeAverageGoalsScored: this.average(home.goalsScored, home.played),

            homeAverageGoalsConceded: this.average(
              home.goalsConceded,
              home.played,
            ),

            homeCleanSheetRate: this.rate(home.cleanSheets, home.played),

            homeFailedToScoreRate: this.rate(home.failedToScore, home.played),

            homeBttsRate: this.rate(home.btts, home.played),

            homeOver15Rate: this.rate(home.over15, home.played),

            homeOver25Rate: this.rate(home.over25, home.played),

            homeOver35Rate: this.rate(home.over35, home.played),

            homeAdvancedStats,

            awayMatches: away.played,

            awayWins: away.wins,

            awayDraws: away.draws,

            awayLosses: away.losses,

            awayPoints: away.points,

            awayWinRate: this.rate(away.wins, away.played),

            awayDrawRate: this.rate(away.draws, away.played),

            awayLossRate: this.rate(away.losses, away.played),

            awayGoalsScored: away.goalsScored,

            awayGoalsConceded: away.goalsConceded,

            awayAverageGoalsScored: this.average(away.goalsScored, away.played),

            awayAverageGoalsConceded: this.average(
              away.goalsConceded,
              away.played,
            ),

            awayCleanSheetRate: this.rate(away.cleanSheets, away.played),

            awayFailedToScoreRate: this.rate(away.failedToScore, away.played),

            awayBttsRate: this.rate(away.btts, away.played),

            awayOver15Rate: this.rate(away.over15, away.played),

            awayOver25Rate: this.rate(away.over25, away.played),

            awayOver35Rate: this.rate(away.over35, away.played),

            awayAdvancedStats,

            averagePossession: this.optionalAverage(
              overall.possessionTotal,
              overall.possessionCount,
            ),

            averageShots: this.optionalAverage(
              overall.shotsTotal,
              overall.shotsCount,
            ),

            averageShotsOnTarget: this.optionalAverage(
              overall.shotsOnTargetTotal,
              overall.shotsOnTargetCount,
            ),

            averageCorners: this.optionalAverage(
              overall.cornersTotal,
              overall.cornersCount,
            ),

            averageFouls: this.optionalAverage(
              overall.foulsTotal,
              overall.foulsCount,
            ),

            averageOffsides: this.optionalAverage(
              overall.offsidesTotal,
              overall.offsidesCount,
            ),

            averageYellowCards: this.optionalAverage(
              overall.yellowCardsTotal,
              overall.yellowCardsCount,
            ),

            averageRedCards: this.optionalAverage(
              overall.redCardsTotal,
              overall.redCardsCount,
            ),

            averageSaves: this.optionalAverage(
              overall.savesTotal,
              overall.savesCount,
            ),

            averageExpectedGoals: this.optionalAverage(
              overall.expectedGoalsTotal,
              overall.expectedGoalsCount,
            ),

            lastFiveAveragePossession: lastFiveAverage.averagePossession,

            lastFiveAverageShots: lastFiveAverage.averageShots,

            lastFiveAverageShotsOnTarget: lastFiveAverage.averageShotsOnTarget,

            lastFiveAverageCorners: lastFiveAverage.averageCorners,

            lastFiveAverageFouls: lastFiveAverage.averageFouls,

            lastFiveAverageOffsides: lastFiveAverage.averageOffsides,

            lastFiveAverageYellowCards: lastFiveAverage.averageYellowCards,

            lastFiveAverageRedCards: lastFiveAverage.averageRedCards,

            lastFiveAverageSaves: lastFiveAverage.averageSaves,

            lastFiveAverageExpectedGoals: lastFiveAverage.averageExpectedGoals,

            firstHalfGoalsScored: timing.firstHalfGoalsScored,

            firstHalfGoalsConceded: timing.firstHalfGoalsConceded,

            secondHalfGoalsScored: timing.secondHalfGoalsScored,

            secondHalfGoalsConceded: timing.secondHalfGoalsConceded,

            averageFirstHalfGoalsScored: this.average(
              timing.firstHalfGoalsScored,
              overall.played,
            ),

            averageFirstHalfGoalsConceded: this.average(
              timing.firstHalfGoalsConceded,
              overall.played,
            ),

            averageSecondHalfGoalsScored: this.average(
              timing.secondHalfGoalsScored,
              overall.played,
            ),

            averageSecondHalfGoalsConceded: this.average(
              timing.secondHalfGoalsConceded,
              overall.played,
            ),

            halfTimeProbabilities,

            secondHalfProbabilities,

            scoringTimingProbabilities,

            scoredFirstCount: overall.scoredFirst,

            scoredFirstRate: this.rate(overall.scoredFirst, overall.played),

            concededFirstCount: overall.concededFirst,

            concededFirstRate: this.rate(overall.concededFirst, overall.played),

            cameFromBehindCount: overall.cameFromBehind,

            cameFromBehindRate: this.rate(
              overall.cameFromBehind,
              overall.played,
            ),

            protectedLeadCount: overall.protectedLead,

            protectedLeadRate: this.rate(overall.protectedLead, overall.played),

            recentFormScore,
            attackingFormScore,
            defensiveFormScore,
            homeFormScore,
            awayFormScore,
            momentumScore,
            overallPerformanceScore,

            dataCompletenessScore,
            statisticalSampleScore,
            profileReliabilityScore,
            dataCoverage,

            previousMatchDate: previousMatch?.date ?? null,

            daysSincePreviousMatch: previousMatch
              ? this.daysBetween(previousMatch.date, new Date())
              : 0,

            nextMatchDate: nextFixture?.fixtureDate ?? null,

            daysUntilNextMatch: nextFixture
              ? this.daysBetween(new Date(), nextFixture.fixtureDate)
              : 0,

            calculatedAt: new Date(),
          },
        },
        {
          upsert: true,
        },
      )
      .exec();

    this.logger.debug(
      `Team performance profile rebuilt: ${leagueId}/${season}/${teamId}`,
    );
  }

  // ============================================================
  // MATCH SUMMARIES
  // ============================================================

  private buildMatchSummaries(
    fixtures: EspnFixtureDocument[],
    teamNames: Map<string, EspnTeamDocument>,
    onlyTeamId?: string,
  ): MatchSummary[] {
    const summaries: MatchSummary[] = [];

    for (const fixture of fixtures) {
      const homeId = fixture.homeTeamId;
      const awayId = fixture.awayTeamId;

      if (!homeId || !awayId) {
        continue;
      }

      if (onlyTeamId && homeId !== onlyTeamId && awayId !== onlyTeamId) {
        continue;
      }

      if (fixture.homeScore === undefined || fixture.awayScore === undefined) {
        continue;
      }

      const homeStats = this.extractCompetitorStats(fixture, homeId);

      const awayStats = this.extractCompetitorStats(fixture, awayId);

      const sides = [
        {
          teamId: homeId,
          opponentId: awayId,
          home: true,
          goalsFor: fixture.homeScore,
          goalsAgainst: fixture.awayScore,
          statistics: homeStats,
        },
        {
          teamId: awayId,
          opponentId: homeId,
          home: false,
          goalsFor: fixture.awayScore,
          goalsAgainst: fixture.homeScore,
          statistics: awayStats,
        },
      ];

      for (const side of sides) {
        if (onlyTeamId && side.teamId !== onlyTeamId) {
          continue;
        }

        const timing = this.extractTeamTiming(fixture, side.teamId);

        const result =
          side.goalsFor > side.goalsAgainst
            ? 'W'
            : side.goalsFor === side.goalsAgainst
              ? 'D'
              : 'L';

        const halfTimeResult =
          timing.firstHalfGoals > timing.firstHalfGoalsAgainst
            ? 'W'
            : timing.firstHalfGoals === timing.firstHalfGoalsAgainst
              ? 'D'
              : 'L';

        const team = teamNames.get(side.teamId);

        const opponent = teamNames.get(side.opponentId);

        const teamMatch: TeamMatch = {
          fixtureId: fixture.eventId,

          date: fixture.fixtureDate,

          competitionId: fixture.leagueId,

          teamId: side.teamId,

          teamName: team?.name ?? `Team ${side.teamId}`,

          opponentId: side.opponentId,

          opponentName: opponent?.name ?? `Team ${side.opponentId}`,

          home: side.home,

          goalsFor: side.goalsFor,

          goalsAgainst: side.goalsAgainst,

          result,

          totalGoals: side.goalsFor + side.goalsAgainst,

          firstHalfGoalsFor: timing.firstHalfGoals,

          firstHalfGoalsAgainst: timing.firstHalfGoalsAgainst,

          secondHalfGoalsFor: timing.secondHalfGoals,

          secondHalfGoalsAgainst: timing.secondHalfGoalsAgainst,

          halfTimeResult,

          scoredFirst: timing.scoredFirst,

          concededFirst: false,

          cameFromBehind: timing.cameFromBehind,

          protectedLead: timing.protectedLead,

          btts: side.goalsFor > 0 && side.goalsAgainst > 0,

          cleanSheet: side.goalsAgainst === 0,

          failedToScore: side.goalsFor === 0,

          statistics: side.statistics,
        };

        summaries.push({
          fixture,
          teamMatch,
        });
      }
    }

    return summaries;
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  private extractCompetitorStats(
    fixture: EspnFixtureDocument,
    teamId: string,
  ): MatchStatValues {
    const competition = this.getCompetition(fixture);

    const competitors: Record<string, unknown>[] = Array.isArray(
      competition?.competitors,
    )
      ? competition.competitors.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        )
      : [];

    const competitor = competitors.find((item) => {
      const team = item['team'];
      const teamIdValue =
        typeof team === 'object' && team !== null
          ? (team as Record<string, unknown>)['id']
          : undefined;

      const candidateId = teamIdValue ?? item['id'];

      return (
        (typeof candidateId === 'string' || typeof candidateId === 'number') &&
        String(candidateId) === teamId
      );
    });

    const directStats = Array.isArray(competitor?.statistics)
      ? competitor.statistics
      : [];

    const summary = fixture.payload?.summary;
    const summaryRecord =
      typeof summary === 'object' && summary !== null
        ? (summary as Record<string, unknown>)
        : undefined;
    const boxscore = summaryRecord?.['boxscore'];
    const boxscoreRecord =
      typeof boxscore === 'object' && boxscore !== null
        ? (boxscore as Record<string, unknown>)
        : undefined;
    const summaryTeams = Array.isArray(boxscoreRecord?.['teams'])
      ? boxscoreRecord['teams'].filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        )
      : [];

    const summaryTeam = summaryTeams.find((item) => {
      const team = item['team'];
      const teamRecord =
        typeof team === 'object' && team !== null
          ? (team as Record<string, unknown>)
          : undefined;

      const teamRecordId = teamRecord?.['id'];
      return (
        (typeof teamRecordId === 'string' ||
          typeof teamRecordId === 'number') &&
        String(teamRecordId) === teamId
      );
    });

    const summaryStats = Array.isArray(summaryTeam?.['statistics'])
      ? summaryTeam['statistics']
      : [];

    return {
      possession: this.findNumber(directStats, summaryStats, [
        'possessionPct',
        'possessionPercentage',
        'possession',
      ]),

      shots: this.findNumber(directStats, summaryStats, [
        'totalShots',
        'shots',
        'shotsAttempted',
      ]),

      shotsOnTarget: this.findNumber(directStats, summaryStats, [
        'shotsOnTarget',
        'shotsOnGoal',
      ]),

      corners: this.findNumber(directStats, summaryStats, [
        'wonCorners',
        'corners',
        'cornerKicks',
      ]),

      fouls: this.findNumber(directStats, summaryStats, [
        'foulsCommitted',
        'fouls',
      ]),

      offsides: this.findNumber(directStats, summaryStats, [
        'offsides',
        'offside',
      ]),

      yellowCards: this.findNumber(directStats, summaryStats, [
        'yellowCards',
        'yellowCard',
      ]),

      redCards: this.findNumber(directStats, summaryStats, [
        'redCards',
        'redCard',
      ]),

      saves: this.findNumber(directStats, summaryStats, [
        'saves',
        'goalkeeperSaves',
      ]),

      expectedGoals: this.findNumber(directStats, summaryStats, [
        'expectedGoals',
        'xGoals',
        'xG',
        'expectedGoal',
      ]),
    };
  }

  // ============================================================
  // TIMING
  // ============================================================

  private extractTeamTiming(fixture: EspnFixtureDocument, teamId: string) {
    const result = {
      firstHalfGoals: 0,
      firstHalfGoalsAgainst: 0,

      secondHalfGoals: 0,
      secondHalfGoalsAgainst: 0,

      scoredFirst: false,
      cameFromBehind: false,
      protectedLead: false,
    };

    const competition = this.getCompetition(fixture);

    const details = Array.isArray(competition?.details)
      ? competition.details
      : [];

    let firstScoringTeam: string | undefined;

    let wentBehind = false;
    let heldLead = false;

    for (const detail of details) {
      if (detail?.scoringPlay !== true) {
        continue;
      }

      const scoringTeamId = this.toString(
        detail?.teamId ?? (detail?.team as { id?: unknown } | undefined)?.id,
      );

      if (!scoringTeamId) {
        continue;
      }

      if (!firstScoringTeam) {
        firstScoringTeam = scoringTeamId;
      }

      const minute = this.extractMinute(detail);

      const isTeam = scoringTeamId === teamId;

      if (minute <= 45) {
        if (isTeam) {
          result.firstHalfGoals += 1;
        } else {
          result.firstHalfGoalsAgainst += 1;
        }
      } else {
        if (isTeam) {
          result.secondHalfGoals += 1;
        } else {
          result.secondHalfGoalsAgainst += 1;
        }
      }

      const score = this.extractScore(detail);

      if (score.home === undefined || score.away === undefined) {
        continue;
      }

      const teamScore = fixture.homeTeamId === teamId ? score.home : score.away;

      const opponentScore =
        fixture.homeTeamId === teamId ? score.away : score.home;

      if (teamScore < opponentScore) {
        wentBehind = true;
      }

      if (teamScore > opponentScore) {
        heldLead = true;
      }
    }

    result.scoredFirst = firstScoringTeam === teamId;

    const finalTeamScore =
      fixture.homeTeamId === teamId ? fixture.homeScore : fixture.awayScore;

    const finalOpponentScore =
      fixture.homeTeamId === teamId ? fixture.awayScore : fixture.homeScore;

    const won =
      finalTeamScore !== undefined &&
      finalOpponentScore !== undefined &&
      finalTeamScore > finalOpponentScore;

    result.cameFromBehind = wentBehind && won;

    result.protectedLead = heldLead && won;

    return result;
  }

  private extractMinute(detail: unknown): number {
    const detailObject =
      typeof detail === 'object' && detail !== null
        ? (detail as {
            clock?: unknown;
            clockDisplay?: unknown;
          })
        : undefined;
    const clock = detailObject?.clock;
    const clockObject =
      typeof clock === 'object' && clock !== null
        ? (clock as {
            value?: unknown;
            minutes?: unknown;
            displayValue?: unknown;
          })
        : undefined;

    const direct =
      this.toNumber(clockObject?.value) ??
      this.toNumber(clockObject?.minutes) ??
      this.toNumber(clock);

    if (direct !== undefined) {
      return direct;
    }

    const display = clockObject?.displayValue ?? detailObject?.clockDisplay;

    if (typeof display === 'string') {
      const match = display.match(/^(\d+)/);

      if (match) {
        const value = Number(match[1]);

        if (Number.isFinite(value)) {
          return value;
        }
      }
    }

    return 90;
  }

  private extractScore(detail: unknown) {
    const detailObject =
      typeof detail === 'object' && detail !== null
        ? (detail as {
            homeScore?: unknown;
            awayScore?: unknown;
            score?: unknown;
          })
        : undefined;
    const scoreObject =
      typeof detailObject?.score === 'object' && detailObject.score !== null
        ? (detailObject.score as { home?: unknown; away?: unknown })
        : undefined;

    return {
      home:
        this.toNumber(detailObject?.homeScore) ??
        this.toNumber(scoreObject?.home),

      away:
        this.toNumber(detailObject?.awayScore) ??
        this.toNumber(scoreObject?.away),
    };
  }

  // ============================================================
  // AGGREGATION
  // ============================================================

  private applyMatch(aggregate: AggregateStats, match: TeamMatch): void {
    aggregate.played += 1;

    aggregate.goalsScored += match.goalsFor;

    aggregate.goalsConceded += match.goalsAgainst;

    if (match.result === 'W') {
      aggregate.wins += 1;
      aggregate.points += 3;
    } else if (match.result === 'D') {
      aggregate.draws += 1;
      aggregate.points += 1;
    } else {
      aggregate.losses += 1;
    }

    if (match.cleanSheet) {
      aggregate.cleanSheets += 1;
    }

    if (match.failedToScore) {
      aggregate.failedToScore += 1;
    }

    if (match.btts) {
      aggregate.btts += 1;
    }

    const totalGoals = match.totalGoals;

    if (totalGoals > 0) {
      aggregate.over05 += 1;
    }

    if (totalGoals > 1) {
      aggregate.over15 += 1;
    }

    if (totalGoals > 2) {
      aggregate.over25 += 1;
    }

    if (totalGoals > 3) {
      aggregate.over35 += 1;
    }

    if (totalGoals > 4) {
      aggregate.over45 += 1;
    }

    if (totalGoals > 5) {
      aggregate.over55 += 1;
    }

    if (totalGoals < 1) {
      aggregate.under05 += 1;
    }

    if (totalGoals < 2) {
      aggregate.under15 += 1;
    }

    if (totalGoals < 3) {
      aggregate.under25 += 1;
    }

    if (totalGoals < 4) {
      aggregate.under35 += 1;
    }

    if (totalGoals < 5) {
      aggregate.under45 += 1;
    }

    if (totalGoals < 6) {
      aggregate.under55 += 1;
    }

    aggregate.goalDistribution[Math.min(match.goalsFor, 5)] += 1;

    const exactScore = `${match.goalsFor}-${match.goalsAgainst}`;

    aggregate.exactScoreDistribution[exactScore] =
      (aggregate.exactScoreDistribution[exactScore] ?? 0) + 1;

    const halfTimeScore = `${match.firstHalfGoalsFor}-${match.firstHalfGoalsAgainst}`;

    aggregate.halfTimeScoreDistribution[halfTimeScore] =
      (aggregate.halfTimeScoreDistribution[halfTimeScore] ?? 0) + 1;

    const secondHalfScore = `${match.secondHalfGoalsFor}-${match.secondHalfGoalsAgainst}`;

    aggregate.secondHalfScoreDistribution[secondHalfScore] =
      (aggregate.secondHalfScoreDistribution[secondHalfScore] ?? 0) + 1;

    if (match.firstHalfGoalsFor > match.firstHalfGoalsAgainst) {
      aggregate.firstHalfWins += 1;
    } else if (match.firstHalfGoalsFor === match.firstHalfGoalsAgainst) {
      aggregate.firstHalfDraws += 1;
    } else {
      aggregate.firstHalfLosses += 1;
    }

    if (match.secondHalfGoalsFor > match.secondHalfGoalsAgainst) {
      aggregate.secondHalfWins += 1;
    } else if (match.secondHalfGoalsFor === match.secondHalfGoalsAgainst) {
      aggregate.secondHalfDraws += 1;
    } else {
      aggregate.secondHalfLosses += 1;
    }

    aggregate.firstHalfGoalsScored += match.firstHalfGoalsFor;

    aggregate.firstHalfGoalsConceded += match.firstHalfGoalsAgainst;

    aggregate.secondHalfGoalsScored += match.secondHalfGoalsFor;

    aggregate.secondHalfGoalsConceded += match.secondHalfGoalsAgainst;

    if (match.scoredFirst) {
      aggregate.scoredFirst += 1;
    }

    if (match.concededFirst) {
      aggregate.concededFirst += 1;
    }

    if (match.cameFromBehind) {
      aggregate.cameFromBehind += 1;
    }

    if (match.protectedLead) {
      aggregate.protectedLead += 1;
    }

    this.addStatistic(aggregate, 'possession', match.statistics.possession);

    this.addStatistic(aggregate, 'shots', match.statistics.shots);

    this.addStatistic(
      aggregate,
      'shotsOnTarget',
      match.statistics.shotsOnTarget,
    );

    this.addStatistic(aggregate, 'corners', match.statistics.corners);

    this.addStatistic(aggregate, 'fouls', match.statistics.fouls);

    this.addStatistic(aggregate, 'offsides', match.statistics.offsides);

    this.addStatistic(aggregate, 'yellowCards', match.statistics.yellowCards);

    this.addStatistic(aggregate, 'redCards', match.statistics.redCards);

    this.addStatistic(aggregate, 'saves', match.statistics.saves);

    this.addStatistic(
      aggregate,
      'expectedGoals',
      match.statistics.expectedGoals,
    );
  }

  private addStatistic(
    aggregate: AggregateStats,
    metric:
      | 'possession'
      | 'shots'
      | 'shotsOnTarget'
      | 'corners'
      | 'fouls'
      | 'offsides'
      | 'yellowCards'
      | 'redCards'
      | 'saves'
      | 'expectedGoals',
    value?: number,
  ): void {
    if (value === undefined || !Number.isFinite(value)) {
      return;
    }

    switch (metric) {
      case 'possession':
        aggregate.possessionTotal += value;
        aggregate.possessionCount += 1;
        break;

      case 'shots':
        aggregate.shotsTotal += value;
        aggregate.shotsCount += 1;
        break;

      case 'shotsOnTarget':
        aggregate.shotsOnTargetTotal += value;
        aggregate.shotsOnTargetCount += 1;
        break;

      case 'corners':
        aggregate.cornersTotal += value;
        aggregate.cornersCount += 1;
        break;

      case 'fouls':
        aggregate.foulsTotal += value;
        aggregate.foulsCount += 1;
        break;

      case 'offsides':
        aggregate.offsidesTotal += value;
        aggregate.offsidesCount += 1;
        break;

      case 'yellowCards':
        aggregate.yellowCardsTotal += value;
        aggregate.yellowCardsCount += 1;
        break;

      case 'redCards':
        aggregate.redCardsTotal += value;
        aggregate.redCardsCount += 1;
        break;

      case 'saves':
        aggregate.savesTotal += value;
        aggregate.savesCount += 1;
        break;

      case 'expectedGoals':
        aggregate.expectedGoalsTotal += value;
        aggregate.expectedGoalsCount += 1;
        break;
    }
  }

  // ============================================================
  // WINDOW
  // ============================================================

  private calculateWindowStats(summaries: MatchSummary[]): WindowStats {
    const result: WindowStats = {
      possessionTotal: 0,
      possessionCount: 0,

      shotsTotal: 0,
      shotsCount: 0,

      shotsOnTargetTotal: 0,
      shotsOnTargetCount: 0,

      cornersTotal: 0,
      cornersCount: 0,

      foulsTotal: 0,
      foulsCount: 0,

      offsidesTotal: 0,
      offsidesCount: 0,

      yellowCardsTotal: 0,
      yellowCardsCount: 0,

      redCardsTotal: 0,
      redCardsCount: 0,

      savesTotal: 0,
      savesCount: 0,

      expectedGoalsTotal: 0,
      expectedGoalsCount: 0,
    };

    for (const summary of summaries) {
      const statistics = summary.teamMatch.statistics;

      if (statistics.possession !== undefined) {
        result.possessionTotal += statistics.possession;
        result.possessionCount += 1;
      }

      if (statistics.shots !== undefined) {
        result.shotsTotal += statistics.shots;
        result.shotsCount += 1;
      }

      if (statistics.shotsOnTarget !== undefined) {
        result.shotsOnTargetTotal += statistics.shotsOnTarget;
        result.shotsOnTargetCount += 1;
      }

      if (statistics.corners !== undefined) {
        result.cornersTotal += statistics.corners;
        result.cornersCount += 1;
      }

      if (statistics.fouls !== undefined) {
        result.foulsTotal += statistics.fouls;
        result.foulsCount += 1;
      }

      if (statistics.offsides !== undefined) {
        result.offsidesTotal += statistics.offsides;
        result.offsidesCount += 1;
      }

      if (statistics.yellowCards !== undefined) {
        result.yellowCardsTotal += statistics.yellowCards;
        result.yellowCardsCount += 1;
      }

      if (statistics.redCards !== undefined) {
        result.redCardsTotal += statistics.redCards;
        result.redCardsCount += 1;
      }

      if (statistics.saves !== undefined) {
        result.savesTotal += statistics.saves;
        result.savesCount += 1;
      }

      if (statistics.expectedGoals !== undefined) {
        result.expectedGoalsTotal += statistics.expectedGoals;
        result.expectedGoalsCount += 1;
      }
    }

    return result;
  }

  private calculateWindowAverages(data: WindowStats) {
    return {
      averagePossession: this.optionalAverage(
        data.possessionTotal,
        data.possessionCount,
      ),

      averageShots: this.optionalAverage(data.shotsTotal, data.shotsCount),

      averageShotsOnTarget: this.optionalAverage(
        data.shotsOnTargetTotal,
        data.shotsOnTargetCount,
      ),

      averageCorners: this.optionalAverage(
        data.cornersTotal,
        data.cornersCount,
      ),

      averageFouls: this.optionalAverage(data.foulsTotal, data.foulsCount),

      averageOffsides: this.optionalAverage(
        data.offsidesTotal,
        data.offsidesCount,
      ),

      averageYellowCards: this.optionalAverage(
        data.yellowCardsTotal,
        data.yellowCardsCount,
      ),

      averageRedCards: this.optionalAverage(
        data.redCardsTotal,
        data.redCardsCount,
      ),

      averageSaves: this.optionalAverage(data.savesTotal, data.savesCount),

      averageExpectedGoals: this.optionalAverage(
        data.expectedGoalsTotal,
        data.expectedGoalsCount,
      ),
    };
  }

  // ============================================================
  // PROBABILITIES
  // ============================================================

  private calculateHistoricalProbabilities(stats: AggregateStats) {
    return {
      win: this.rate(stats.wins, stats.played),

      draw: this.rate(stats.draws, stats.played),

      loss: this.rate(stats.losses, stats.played),

      btts: this.rate(stats.btts, stats.played),

      cleanSheet: this.rate(stats.cleanSheets, stats.played),

      failedToScore: this.rate(stats.failedToScore, stats.played),

      over05: this.rate(stats.over05, stats.played),

      over15: this.rate(stats.over15, stats.played),

      over25: this.rate(stats.over25, stats.played),

      over35: this.rate(stats.over35, stats.played),

      over45: this.rate(stats.over45, stats.played),

      over55: this.rate(stats.over55, stats.played),
    };
  }

  private calculateTotalGoalsProbabilities(stats: AggregateStats) {
    return {
      over05: this.rate(stats.over05, stats.played),

      over15: this.rate(stats.over15, stats.played),

      over25: this.rate(stats.over25, stats.played),

      over35: this.rate(stats.over35, stats.played),

      over45: this.rate(stats.over45, stats.played),

      over55: this.rate(stats.over55, stats.played),

      under05: this.rate(stats.under05, stats.played),

      under15: this.rate(stats.under15, stats.played),

      under25: this.rate(stats.under25, stats.played),

      under35: this.rate(stats.under35, stats.played),

      under45: this.rate(stats.under45, stats.played),

      under55: this.rate(stats.under55, stats.played),
    };
  }

  private calculateHalfTimeProbabilities(matches: TeamMatch[]) {
    const wins = matches.filter(
      (match) => match.firstHalfGoalsFor > match.firstHalfGoalsAgainst,
    ).length;

    const draws = matches.filter(
      (match) => match.firstHalfGoalsFor === match.firstHalfGoalsAgainst,
    ).length;

    const losses = matches.length - wins - draws;

    return {
      win: this.rate(wins, matches.length),

      draw: this.rate(draws, matches.length),

      loss: this.rate(losses, matches.length),
    };
  }

  private calculateSecondHalfProbabilities(matches: TeamMatch[]) {
    const wins = matches.filter(
      (match) => match.secondHalfGoalsFor > match.secondHalfGoalsAgainst,
    ).length;

    const draws = matches.filter(
      (match) => match.secondHalfGoalsFor === match.secondHalfGoalsAgainst,
    ).length;

    const losses = matches.length - wins - draws;

    return {
      win: this.rate(wins, matches.length),

      draw: this.rate(draws, matches.length),

      loss: this.rate(losses, matches.length),
    };
  }

  private calculateScoringTimingProbabilities(stats: AggregateStats) {
    return {
      scoredFirst: this.rate(stats.scoredFirst, stats.played),

      concededFirst: this.rate(stats.concededFirst, stats.played),

      cameFromBehind: this.rate(stats.cameFromBehind, stats.played),

      protectedLead: this.rate(stats.protectedLead, stats.played),
    };
  }

  // ============================================================
  // SCORES
  // ============================================================

  private calculateFormScore(matches: TeamMatch[]): number {
    if (!matches.length) {
      return 0;
    }

    return Number(
      ((this.getFormPoints(matches) / (matches.length * 3)) * 100).toFixed(2),
    );
  }

  private calculateAttackingFormScore(matches: TeamMatch[]): number {
    if (!matches.length) {
      return 0;
    }

    const goals =
      matches.reduce((sum, match) => sum + match.goalsFor, 0) / matches.length;

    return Number(Math.min(100, (goals / 3) * 100).toFixed(2));
  }

  private calculateDefensiveFormScore(matches: TeamMatch[]): number {
    if (!matches.length) {
      return 0;
    }

    const conceded =
      matches.reduce((sum, match) => sum + match.goalsAgainst, 0) /
      matches.length;

    return Number(
      Math.max(0, Math.min(100, ((2.5 - conceded) / 2.5) * 100)).toFixed(2),
    );
  }

  private calculateMomentumScore(matches: TeamMatch[]): number {
    if (!matches.length) {
      return 0;
    }

    const weights = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

    let weighted = 0;
    let totalWeight = 0;

    matches.slice(0, 10).forEach((match, index) => {
      const weight = weights[index] ?? 0.1;

      const points = match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0;

      weighted += points * weight;

      totalWeight += 3 * weight;
    });

    return totalWeight > 0
      ? Number(((weighted / totalWeight) * 100).toFixed(2))
      : 0;
  }

  private calculateOverallPerformanceScore(
    stats: AggregateStats,
    formScore: number,
    momentumScore: number,
  ): number {
    if (!stats.played) {
      return 0;
    }

    const ppg = stats.points / stats.played;

    const attack = stats.goalsScored / stats.played;

    const defence = stats.goalsConceded / stats.played;

    const base =
      ppg * 20 +
      Math.min(30, attack * 10) +
      Math.max(0, 30 - defence * 10) +
      this.rate(stats.cleanSheets, stats.played) * 10;

    return Number(
      Math.max(
        0,
        Math.min(100, base * 0.55 + formScore * 0.25 + momentumScore * 0.2),
      ).toFixed(2),
    );
  }

  // ============================================================
  // QUALITY
  // ============================================================

  private calculateDataCoverage(matches: TeamMatch[]) {
    const total = matches.length;

    const withStats = matches.filter((match) =>
      Object.values(match.statistics).some(
        (value) => value !== undefined && Number.isFinite(value),
      ),
    ).length;

    const withTiming = matches.filter(
      (match) =>
        match.firstHalfGoalsFor +
          match.firstHalfGoalsAgainst +
          match.secondHalfGoalsFor +
          match.secondHalfGoalsAgainst >
        0,
    ).length;

    return {
      totalMatches: total,
      matchesWithStatistics: withStats,
      matchesWithTiming: withTiming,
      statisticsCoverage: this.rate(withStats, total),
      timingCoverage: this.rate(withTiming, total),
      scoreCoverage: total > 0 ? 1 : 0,
    };
  }

  private calculateDataCompletenessScore(
    matches: TeamMatch[],
    coverage: Record<string, unknown>,
  ): number {
    if (!matches.length) {
      return 0;
    }

    const statisticsCoverage = Number(coverage.statisticsCoverage ?? 0);

    const timingCoverage = Number(coverage.timingCoverage ?? 0);

    return Number(
      (
        (1 * 0.5 + statisticsCoverage * 0.3 + timingCoverage * 0.2) *
        100
      ).toFixed(2),
    );
  }

  private calculateStatisticalSampleScore(sampleSize: number): number {
    return Number(Math.min(100, (sampleSize / 20) * 100).toFixed(2));
  }

  // ============================================================
  // STREAKS
  // ============================================================

  private calculateStreaks(matches: TeamMatch[]) {
    let currentWinStreak = 0;
    let currentDrawStreak = 0;
    let currentLossStreak = 0;
    let unbeatenStreak = 0;
    let winlessStreak = 0;
    let scoringStreak = 0;
    let cleanSheetStreak = 0;

    for (const match of matches) {
      if (match.result === 'W') {
        currentWinStreak += 1;
      } else {
        break;
      }
    }

    for (const match of matches) {
      if (match.result === 'D') {
        currentDrawStreak += 1;
      } else {
        break;
      }
    }

    for (const match of matches) {
      if (match.result === 'L') {
        currentLossStreak += 1;
      } else {
        break;
      }
    }

    for (const match of matches) {
      if (match.result === 'W' || match.result === 'D') {
        unbeatenStreak += 1;
      } else {
        break;
      }
    }

    for (const match of matches) {
      if (match.result === 'D' || match.result === 'L') {
        winlessStreak += 1;
      } else {
        break;
      }
    }

    for (const match of matches) {
      if (match.goalsFor > 0) {
        scoringStreak += 1;
      } else {
        break;
      }
    }

    for (const match of matches) {
      if (match.goalsAgainst === 0) {
        cleanSheetStreak += 1;
      } else {
        break;
      }
    }

    return {
      currentWinStreak,
      currentDrawStreak,
      currentLossStreak,
      unbeatenStreak,
      winlessStreak,
      scoringStreak,
      cleanSheetStreak,
    };
  }

  // ============================================================
  // ADVANCED SERIALIZATION
  // ============================================================

  private serializeAdvancedAggregate(stats: AggregateStats) {
    return {
      played: stats.played,

      averagePossession: this.optionalAverage(
        stats.possessionTotal,
        stats.possessionCount,
      ),

      averageShots: this.optionalAverage(stats.shotsTotal, stats.shotsCount),

      averageShotsOnTarget: this.optionalAverage(
        stats.shotsOnTargetTotal,
        stats.shotsOnTargetCount,
      ),

      averageCorners: this.optionalAverage(
        stats.cornersTotal,
        stats.cornersCount,
      ),

      averageFouls: this.optionalAverage(stats.foulsTotal, stats.foulsCount),

      averageOffsides: this.optionalAverage(
        stats.offsidesTotal,
        stats.offsidesCount,
      ),

      averageYellowCards: this.optionalAverage(
        stats.yellowCardsTotal,
        stats.yellowCardsCount,
      ),

      averageRedCards: this.optionalAverage(
        stats.redCardsTotal,
        stats.redCardsCount,
      ),

      averageSaves: this.optionalAverage(stats.savesTotal, stats.savesCount),

      averageExpectedGoals: this.optionalAverage(
        stats.expectedGoalsTotal,
        stats.expectedGoalsCount,
      ),

      firstHalfGoalsScored: stats.firstHalfGoalsScored,

      firstHalfGoalsConceded: stats.firstHalfGoalsConceded,

      secondHalfGoalsScored: stats.secondHalfGoalsScored,

      secondHalfGoalsConceded: stats.secondHalfGoalsConceded,
    };
  }

  // ============================================================
  // FACTORY
  // ============================================================

  private createAggregateStats(): AggregateStats {
    return {
      played: 0,

      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,

      goalsScored: 0,
      goalsConceded: 0,

      cleanSheets: 0,
      failedToScore: 0,
      btts: 0,

      over05: 0,
      over15: 0,
      over25: 0,
      over35: 0,
      over45: 0,
      over55: 0,

      under05: 0,
      under15: 0,
      under25: 0,
      under35: 0,
      under45: 0,
      under55: 0,

      firstHalfGoalsScored: 0,
      firstHalfGoalsConceded: 0,

      secondHalfGoalsScored: 0,
      secondHalfGoalsConceded: 0,

      firstHalfWins: 0,
      firstHalfDraws: 0,
      firstHalfLosses: 0,

      secondHalfWins: 0,
      secondHalfDraws: 0,
      secondHalfLosses: 0,

      scoredFirst: 0,
      concededFirst: 0,

      cameFromBehind: 0,
      protectedLead: 0,

      possessionTotal: 0,
      possessionCount: 0,

      shotsTotal: 0,
      shotsCount: 0,

      shotsOnTargetTotal: 0,
      shotsOnTargetCount: 0,

      cornersTotal: 0,
      cornersCount: 0,

      foulsTotal: 0,
      foulsCount: 0,

      offsidesTotal: 0,
      offsidesCount: 0,

      yellowCardsTotal: 0,
      yellowCardsCount: 0,

      redCardsTotal: 0,
      redCardsCount: 0,

      savesTotal: 0,
      savesCount: 0,

      expectedGoalsTotal: 0,
      expectedGoalsCount: 0,

      goalDistribution: [0, 0, 0, 0, 0, 0],

      exactScoreDistribution: {},

      halfTimeScoreDistribution: {},

      secondHalfScoreDistribution: {},
    };
  }

  // ============================================================
  // TEAM / FIXTURE
  // ============================================================

  private async getTeamNames(
    leagueId: string,
    teamIds: string[],
  ): Promise<Map<string, EspnTeamDocument>> {
    const ids = [...new Set(teamIds.filter(Boolean))];

    const teams = await this.teamModel
      .find({
        leagueId: leagueId.trim().toLowerCase(),
        teamId: {
          $in: ids,
        },
      })
      .lean()
      .exec();

    return new Map(teams.map((team) => [team.teamId, team]));
  }

  private async getNextFixture(
    leagueId: string,
    season: number,
    teamId: string,
  ): Promise<EspnFixtureDocument | null> {
    return this.fixtureModel
      .findOne({
        leagueId: leagueId.trim().toLowerCase(),

        season,

        fixtureDate: {
          $gte: new Date(),
        },

        $or: [
          {
            homeTeamId: teamId,
          },
          {
            awayTeamId: teamId,
          },
        ],
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // PAYLOAD HELPERS
  // ============================================================

  private getCompetition(
    fixture: EspnFixtureDocument,
  ): EspnCompetition | undefined {
    const competitions = fixture.payload?.['competitions'];

    const competition: unknown = Array.isArray(competitions)
      ? (competitions[0] as unknown)
      : undefined;

    return competition && typeof competition === 'object'
      ? (competition as EspnCompetition)
      : undefined;
  }

  private findNumber(
    directStats: any[],
    summaryStats: any[],
    names: string[],
  ): number | undefined {
    return (
      this.findStatNumber(directStats, names) ??
      this.findStatNumber(summaryStats, names)
    );
  }

  private findStatNumber(stats: any[], names: string[]): number | undefined {
    for (const item of stats) {
      const record =
        item !== null && typeof item === 'object'
          ? (item as Record<string, unknown>)
          : undefined;
      const nameValue = record?.name ?? record?.type ?? record?.key;
      const name =
        typeof nameValue === 'string' || typeof nameValue === 'number'
          ? String(nameValue).toLowerCase()
          : '';

      if (names.some((candidate) => name === candidate.toLowerCase())) {
        const stat = item as { value?: unknown; displayValue?: unknown };
        return this.toNumber(stat.value) ?? this.toNumber(stat.displayValue);
      }
    }

    return undefined;
  }

  private getFormPoints(matches: TeamMatch[]): number {
    return matches.reduce(
      (total, match) =>
        total + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0),
      0,
    );
  }

  private toPercentDistribution(values: number[], total: number): number[] {
    if (total <= 0) {
      return values.map(() => 0);
    }

    return values.map((value) => Number((value / total).toFixed(4)));
  }

  private toPercentMap(
    values: Record<string, number>,
    total: number,
  ): Record<string, number> {
    const result: Record<string, number> = {};

    if (total <= 0) {
      return result;
    }

    for (const [key, value] of Object.entries(values)) {
      result[key] = Number((value / total).toFixed(4));
    }

    return result;
  }

  private rate(numerator: number, denominator: number): number {
    if (denominator <= 0) {
      return 0;
    }

    return Number((numerator / denominator).toFixed(4));
  }

  private average(total: number, count: number): number {
    if (count <= 0) {
      return 0;
    }

    return Number((total / count).toFixed(4));
  }

  private optionalAverage(total: number, count: number): number | undefined {
    if (count <= 0) {
      return undefined;
    }

    return this.average(total, count);
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const result = Number(value.replace('%', '').trim());

    return Number.isFinite(result) ? result : undefined;
  }

  private toString(value: unknown): string | undefined {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'object' ||
      typeof value === 'function'
    ) {
      return undefined;
    }

    const result =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint' ||
            typeof value === 'symbol'
          ? String(value).trim()
          : undefined;

    return result ? result : undefined;
  }

  private isCompletedFixture(fixture: EspnFixtureDocument): boolean {
    if (fixture.completed === true) {
      return true;
    }

    return this.completedStatuses.has(fixture.status.trim().toUpperCase());
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.max(
      0,
      Math.floor((to.getTime() - from.getTime()) / 86_400_000),
    );
  }
}
