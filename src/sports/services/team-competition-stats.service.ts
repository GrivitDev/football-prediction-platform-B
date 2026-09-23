import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import {
  EspnStanding,
  EspnStandingDocument,
} from '../schemas/espn/espn-standing.schema';

import {
  ActiveCompetition,
  ActiveCompetitionDocument,
} from '../schemas/active-competition.schema';

import {
  TeamCompetitionStats,
  TeamCompetitionStatsDocument,
} from '../schemas/team-competition-stats.schema';

interface TeamMatchRecord {
  fixtureId: string;

  date: Date;

  competitionId: string;

  teamId: string;

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

  scoredFirst: boolean;

  concededFirst: boolean;

  cameFromBehind: boolean;

  protectedLead: boolean;

  btts: boolean;

  cleanSheet: boolean;

  failedToScore: boolean;

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

interface Aggregate {
  played: number;

  wins: number;

  draws: number;

  losses: number;

  points: number;

  goalsFor: number;

  goalsAgainst: number;

  cleanSheets: number;

  failedToScore: number;

  btts: number;

  over05: number;

  over15: number;

  over25: number;

  over35: number;

  over45: number;

  over55: number;

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

  firstHalfGoalsFor: number;

  firstHalfGoalsAgainst: number;

  secondHalfGoalsFor: number;

  secondHalfGoalsAgainst: number;

  scoredFirst: number;

  concededFirst: number;

  cameFromBehind: number;

  protectedLead: number;

  goalDistribution: number[];

  exactScores: Record<string, number>;
}

@Injectable()
export class TeamCompetitionStatsService {
  private readonly logger = new Logger(TeamCompetitionStatsService.name);

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
    @InjectModel(EspnFixture.name)
    private readonly fixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(EspnStanding.name)
    private readonly standingModel: Model<EspnStandingDocument>,

    @InjectModel(ActiveCompetition.name)
    private readonly activeCompetitionModel: Model<ActiveCompetitionDocument>,

    @InjectModel(TeamCompetitionStats.name)
    private readonly statsModel: Model<TeamCompetitionStatsDocument>,
  ) {}

  // ============================================================
  // REBUILD COMPETITION
  // ============================================================

  async rebuildCompetition(leagueId: string, season: number): Promise<number> {
    const normalizedLeagueId = leagueId.trim().toLowerCase();

    const fixtures = await this.fixtureModel
      .find({
        leagueId: normalizedLeagueId,
        season,
      })
      .sort({
        fixtureDate: -1,
      })
      .lean()
      .exec();

    const completed = fixtures.filter((fixture) =>
      this.isCompletedFixture(fixture),
    );

    if (!completed.length) {
      return 0;
    }

    const standings = await this.standingModel
      .find({
        leagueId: normalizedLeagueId,
        season,
      })
      .lean()
      .exec();

    const teamIds = this.collectTeamIds(completed, standings);

    const teamNames = new Map<string, string>();

    for (const standing of standings) {
      if (!standing.teamId) {
        continue;
      }

      teamNames.set(standing.teamId, this.extractStandingTeamName(standing));
    }

    for (const fixture of completed) {
      if (fixture.homeTeamId) {
        teamNames.set(
          fixture.homeTeamId,
          this.extractFixtureTeamName(fixture, 'home'),
        );
      }

      if (fixture.awayTeamId) {
        teamNames.set(
          fixture.awayTeamId,
          this.extractFixtureTeamName(fixture, 'away'),
        );
      }
    }

    let rebuilt = 0;

    for (const teamId of teamIds) {
      await this.rebuildTeam(
        normalizedLeagueId,
        season,
        teamId,
        teamNames.get(teamId) ?? `Team ${teamId}`,
        completed,
        standings,
      );

      rebuilt += 1;
    }

    return rebuilt;
  }

  // ============================================================
  // REFRESH FIXTURE
  // ============================================================

  async refreshForFixture(
    leagueId: string,
    season: number,
    fixtureId: string,
  ): Promise<number> {
    const normalizedLeagueId = leagueId.trim().toLowerCase();

    const fixture = await this.fixtureModel
      .findOne({
        eventId: fixtureId.trim(),
        leagueId: normalizedLeagueId,
        season,
      })
      .lean()
      .exec();

    if (!fixture || !this.isCompletedFixture(fixture)) {
      return 0;
    }

    const fixtures = await this.fixtureModel
      .find({
        leagueId: normalizedLeagueId,
        season,
      })
      .sort({
        fixtureDate: -1,
      })
      .lean()
      .exec();

    const completed = fixtures.filter((item) => this.isCompletedFixture(item));

    const standings = await this.standingModel
      .find({
        leagueId: normalizedLeagueId,
        season,
      })
      .lean()
      .exec();

    const teamIds = [fixture.homeTeamId, fixture.awayTeamId].filter(
      (id): id is string => Boolean(id),
    );

    const uniqueTeamIds = [...new Set(teamIds)];

    const teamNames = new Map<string, string>();

    for (const standing of standings) {
      if (!standing.teamId) {
        continue;
      }

      teamNames.set(standing.teamId, this.extractStandingTeamName(standing));
    }

    for (const item of completed) {
      if (item.homeTeamId) {
        teamNames.set(
          item.homeTeamId,
          this.extractFixtureTeamName(item, 'home'),
        );
      }

      if (item.awayTeamId) {
        teamNames.set(
          item.awayTeamId,
          this.extractFixtureTeamName(item, 'away'),
        );
      }
    }

    for (const teamId of uniqueTeamIds) {
      await this.rebuildTeam(
        normalizedLeagueId,
        season,
        teamId,
        teamNames.get(teamId) ?? `Team ${teamId}`,
        completed,
        standings,
      );
    }

    return uniqueTeamIds.length;
  }

  // ============================================================
  // REBUILD TEAM
  // ============================================================

  private async rebuildTeam(
    leagueId: string,
    season: number,
    teamId: string,
    teamName: string,
    fixtures: EspnFixtureDocument[],
    standings: EspnStandingDocument[],
  ): Promise<void> {
    const matches = this.buildTeamMatches(fixtures, teamId);

    if (!matches.length) {
      return;
    }

    const overall = this.createAggregate();

    const home = this.createAggregate();

    const away = this.createAggregate();

    for (const match of matches) {
      this.applyMatch(overall, match);

      this.applyMatch(match.home ? home : away, match);
    }

    const lastFive = matches.slice(0, 5);

    const lastTen = matches.slice(0, 10);

    const standing = standings.find((item) => item.teamId === teamId);

    const nextFixture = await this.getNextFixture(leagueId, season, teamId);

    const previousMatch = matches[0];

    const lastFiveBtts = this.rate(
      lastFive.filter((match) => match.btts).length,
      lastFive.length,
    );

    const lastFiveOver15 = this.rate(
      lastFive.filter((match) => match.totalGoals > 1).length,
      lastFive.length,
    );

    const lastFiveOver25 = this.rate(
      lastFive.filter((match) => match.totalGoals > 2).length,
      lastFive.length,
    );

    const lastFiveOver35 = this.rate(
      lastFive.filter((match) => match.totalGoals > 3).length,
      lastFive.length,
    );

    const lastFiveCleanSheet = this.rate(
      lastFive.filter((match) => match.cleanSheet).length,
      lastFive.length,
    );

    const lastFiveFailedToScore = this.rate(
      lastFive.filter((match) => match.failedToScore).length,
      lastFive.length,
    );

    const homeMatches = matches.filter((match) => match.home);

    const awayMatches = matches.filter((match) => !match.home);

    const recentFormScore = this.calculateFormScore(lastFive);

    const homeStrengthScore = this.calculateStrengthScore(home);

    const awayStrengthScore = this.calculateStrengthScore(away);

    const overallStrengthScore = this.calculateOverallStrength(
      overall,
      recentFormScore,
    );

    const dataCoverage = this.calculateDataCoverage(matches);

    const dataCompletenessScore =
      this.calculateDataCompletenessScore(dataCoverage);

    const statisticalSampleScore = this.calculateSampleScore(matches.length);

    const statsReliabilityScore = Number(
      (dataCompletenessScore * 0.5 + statisticalSampleScore * 0.5).toFixed(2),
    );

    await this.statsModel
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

            position: standing?.rank ?? 0,

            points: standing?.points ?? overall.points,

            played: standing?.played ?? overall.played,

            wins: standing?.wins ?? overall.wins,

            draws: standing?.draws ?? overall.draws,

            losses: standing?.losses ?? overall.losses,

            goalsFor: standing?.goalsFor ?? overall.goalsFor,

            goalsAgainst: standing?.goalsAgainst ?? overall.goalsAgainst,

            goalDifference:
              standing?.goalDifference ??
              overall.goalsFor - overall.goalsAgainst,

            averageGoalsScored: this.average(overall.goalsFor, overall.played),

            averageGoalsConceded: this.average(
              overall.goalsAgainst,
              overall.played,
            ),

            winRate: this.rate(overall.wins, overall.played),

            drawRate: this.rate(overall.draws, overall.played),

            lossRate: this.rate(overall.losses, overall.played),

            bttsRate: this.rate(overall.btts, overall.played),

            over05Rate: this.rate(overall.over05, overall.played),

            over15Rate: this.rate(overall.over15, overall.played),

            over25Rate: this.rate(overall.over25, overall.played),

            over35Rate: this.rate(overall.over35, overall.played),

            over45Rate: this.rate(overall.over45, overall.played),

            over55Rate: this.rate(overall.over55, overall.played),

            cleanSheetRate: this.rate(overall.cleanSheets, overall.played),

            failedToScoreRate: this.rate(overall.failedToScore, overall.played),

            goalDistribution: this.toDistribution(
              overall.goalDistribution,
              overall.played,
            ),

            exactScoreDistribution: this.toDistributionMap(
              overall.exactScores,
              overall.played,
            ),

            homePlayed: home.played,

            homeWins: home.wins,

            homeDraws: home.draws,

            homeLosses: home.losses,

            homeGoalsFor: home.goalsFor,

            homeGoalsAgainst: home.goalsAgainst,

            homeAverageGoalsScored: this.average(home.goalsFor, home.played),

            homeAverageGoalsConceded: this.average(
              home.goalsAgainst,
              home.played,
            ),

            homeBttsRate: this.rate(home.btts, home.played),

            homeOver15Rate: this.rate(home.over15, home.played),

            homeOver25Rate: this.rate(home.over25, home.played),

            homeOver35Rate: this.rate(home.over35, home.played),

            homeCleanSheetRate: this.rate(home.cleanSheets, home.played),

            homeFailedToScoreRate: this.rate(home.failedToScore, home.played),

            awayPlayed: away.played,

            awayWins: away.wins,

            awayDraws: away.draws,

            awayLosses: away.losses,

            awayGoalsFor: away.goalsFor,

            awayGoalsAgainst: away.goalsAgainst,

            awayAverageGoalsScored: this.average(away.goalsFor, away.played),

            awayAverageGoalsConceded: this.average(
              away.goalsAgainst,
              away.played,
            ),

            awayBttsRate: this.rate(away.btts, away.played),

            awayOver15Rate: this.rate(away.over15, away.played),

            awayOver25Rate: this.rate(away.over25, away.played),

            awayOver35Rate: this.rate(away.over35, away.played),

            awayCleanSheetRate: this.rate(away.cleanSheets, away.played),

            awayFailedToScoreRate: this.rate(away.failedToScore, away.played),

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

            firstHalfGoalsScored: overall.firstHalfGoalsFor,

            firstHalfGoalsConceded: overall.firstHalfGoalsAgainst,

            secondHalfGoalsScored: overall.secondHalfGoalsFor,

            secondHalfGoalsConceded: overall.secondHalfGoalsAgainst,

            averageFirstHalfGoalsScored: this.average(
              overall.firstHalfGoalsFor,
              overall.played,
            ),

            averageFirstHalfGoalsConceded: this.average(
              overall.firstHalfGoalsAgainst,
              overall.played,
            ),

            averageSecondHalfGoalsScored: this.average(
              overall.secondHalfGoalsFor,
              overall.played,
            ),

            averageSecondHalfGoalsConceded: this.average(
              overall.secondHalfGoalsAgainst,
              overall.played,
            ),

            scoredFirstRate: this.rate(overall.scoredFirst, overall.played),

            concededFirstRate: this.rate(overall.concededFirst, overall.played),

            cameFromBehindRate: this.rate(
              overall.cameFromBehind,
              overall.played,
            ),

            protectedLeadRate: this.rate(overall.protectedLead, overall.played),

            lastFive: lastFive.map(
              (match) => `${match.fixtureId}:${match.result}`,
            ),

            lastFiveHome: lastFive
              .filter((match) => match.home)
              .map((match) => `${match.fixtureId}:${match.result}`),

            lastFiveAway: lastFive
              .filter((match) => !match.home)
              .map((match) => `${match.fixtureId}:${match.result}`),

            lastFivePoints: this.getFormPoints(lastFive),

            lastFiveGoalsScored: this.sumGoals(lastFive, 'for'),

            lastFiveGoalsConceded: this.sumGoals(lastFive, 'against'),

            lastFiveAverageGoalsScored: this.average(
              this.sumGoals(lastFive, 'for'),
              lastFive.length,
            ),

            lastFiveAverageGoalsConceded: this.average(
              this.sumGoals(lastFive, 'against'),
              lastFive.length,
            ),

            lastFiveBttsRate: lastFiveBtts,

            lastFiveOver15Rate: lastFiveOver15,

            lastFiveOver25Rate: lastFiveOver25,

            lastFiveOver35Rate: lastFiveOver35,

            lastFiveCleanSheetRate: lastFiveCleanSheet,

            lastFiveFailedToScoreRate: lastFiveFailedToScore,

            lastFiveAveragePossession: this.averageOptionalFromMatches(
              lastFive,
              'possession',
            ),

            lastFiveAverageShots: this.averageOptionalFromMatches(
              lastFive,
              'shots',
            ),

            lastFiveAverageShotsOnTarget: this.averageOptionalFromMatches(
              lastFive,
              'shotsOnTarget',
            ),

            lastFiveAverageCorners: this.averageOptionalFromMatches(
              lastFive,
              'corners',
            ),

            lastFiveAverageFouls: this.averageOptionalFromMatches(
              lastFive,
              'fouls',
            ),

            lastFiveAverageYellowCards: this.averageOptionalFromMatches(
              lastFive,
              'yellowCards',
            ),

            lastFiveAverageRedCards: this.averageOptionalFromMatches(
              lastFive,
              'redCards',
            ),

            recentFormScore,

            homeStrengthScore,

            awayStrengthScore,

            overallStrengthScore,

            dataCompletenessScore,

            statisticalSampleScore,

            statsReliabilityScore,

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
      `Team competition stats rebuilt: ${leagueId}/${season}/${teamId}`,
    );

    void homeMatches;
    void awayMatches;
    void lastTen;
  }

  // ============================================================
  // MATCH EXTRACTION
  // ============================================================

  private buildTeamMatches(
    fixtures: EspnFixtureDocument[],
    teamId: string,
  ): TeamMatchRecord[] {
    const matches: TeamMatchRecord[] = [];

    for (const fixture of fixtures) {
      const isHome = fixture.homeTeamId === teamId;

      const isAway = fixture.awayTeamId === teamId;

      if (!isHome && !isAway) {
        continue;
      }

      if (fixture.homeScore === undefined || fixture.awayScore === undefined) {
        continue;
      }

      const goalsFor = isHome ? fixture.homeScore : fixture.awayScore;

      const goalsAgainst = isHome ? fixture.awayScore : fixture.homeScore;

      const result =
        goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L';

      const statistics = this.extractStatistics(fixture, teamId);

      const timing = this.extractTiming(fixture, teamId);

      matches.push({
        fixtureId: fixture.eventId,

        date: fixture.fixtureDate,

        competitionId: fixture.leagueId,

        teamId,

        opponentId: isHome ? fixture.awayTeamId : fixture.homeTeamId,

        opponentName: isHome
          ? this.extractFixtureTeamName(fixture, 'away')
          : this.extractFixtureTeamName(fixture, 'home'),

        home: isHome,

        goalsFor,

        goalsAgainst,

        result,

        totalGoals: goalsFor + goalsAgainst,

        firstHalfGoalsFor: timing.firstHalfGoalsFor,

        firstHalfGoalsAgainst: timing.firstHalfGoalsAgainst,

        secondHalfGoalsFor: timing.secondHalfGoalsFor,

        secondHalfGoalsAgainst: timing.secondHalfGoalsAgainst,

        scoredFirst: timing.scoredFirst,

        concededFirst: timing.concededFirst,

        cameFromBehind: timing.cameFromBehind,

        protectedLead: timing.protectedLead,

        btts: goalsFor > 0 && goalsAgainst > 0,

        cleanSheet: goalsAgainst === 0,

        failedToScore: goalsFor === 0,

        possession: statistics.possession,

        shots: statistics.shots,

        shotsOnTarget: statistics.shotsOnTarget,

        corners: statistics.corners,

        fouls: statistics.fouls,

        offsides: statistics.offsides,

        yellowCards: statistics.yellowCards,

        redCards: statistics.redCards,

        saves: statistics.saves,

        expectedGoals: statistics.expectedGoals,
      });
    }

    return matches.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  // ============================================================
  // AGGREGATION
  // ============================================================

  private applyMatch(aggregate: Aggregate, match: TeamMatchRecord): void {
    aggregate.played += 1;

    aggregate.goalsFor += match.goalsFor;

    aggregate.goalsAgainst += match.goalsAgainst;

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

    if (match.totalGoals > 0) {
      aggregate.over05 += 1;
    }

    if (match.totalGoals > 1) {
      aggregate.over15 += 1;
    }

    if (match.totalGoals > 2) {
      aggregate.over25 += 1;
    }

    if (match.totalGoals > 3) {
      aggregate.over35 += 1;
    }

    if (match.totalGoals > 4) {
      aggregate.over45 += 1;
    }

    if (match.totalGoals > 5) {
      aggregate.over55 += 1;
    }

    aggregate.goalDistribution[Math.min(match.goalsFor, 5)] += 1;

    const exactScore = `${match.goalsFor}-${match.goalsAgainst}`;

    aggregate.exactScores[exactScore] =
      (aggregate.exactScores[exactScore] ?? 0) + 1;

    aggregate.firstHalfGoalsFor += match.firstHalfGoalsFor;

    aggregate.firstHalfGoalsAgainst += match.firstHalfGoalsAgainst;

    aggregate.secondHalfGoalsFor += match.secondHalfGoalsFor;

    aggregate.secondHalfGoalsAgainst += match.secondHalfGoalsAgainst;

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

    this.addOptional(match.possession, (value) => {
      aggregate.possessionTotal += value;
      aggregate.possessionCount += 1;
    });

    this.addOptional(match.shots, (value) => {
      aggregate.shotsTotal += value;
      aggregate.shotsCount += 1;
    });

    this.addOptional(match.shotsOnTarget, (value) => {
      aggregate.shotsOnTargetTotal += value;
      aggregate.shotsOnTargetCount += 1;
    });

    this.addOptional(match.corners, (value) => {
      aggregate.cornersTotal += value;
      aggregate.cornersCount += 1;
    });

    this.addOptional(match.fouls, (value) => {
      aggregate.foulsTotal += value;
      aggregate.foulsCount += 1;
    });

    this.addOptional(match.offsides, (value) => {
      aggregate.offsidesTotal += value;
      aggregate.offsidesCount += 1;
    });

    this.addOptional(match.yellowCards, (value) => {
      aggregate.yellowCardsTotal += value;
      aggregate.yellowCardsCount += 1;
    });

    this.addOptional(match.redCards, (value) => {
      aggregate.redCardsTotal += value;
      aggregate.redCardsCount += 1;
    });

    this.addOptional(match.saves, (value) => {
      aggregate.savesTotal += value;
      aggregate.savesCount += 1;
    });

    this.addOptional(match.expectedGoals, (value) => {
      aggregate.expectedGoalsTotal += value;
      aggregate.expectedGoalsCount += 1;
    });
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  private extractStatistics(fixture: EspnFixtureDocument, teamId: string) {
    const competition = this.getCompetition(fixture);

    type CompetitorRecord = {
      team?: unknown;
      id?: unknown;
      statistics?: unknown;
    };

    const competitor: CompetitorRecord | undefined = Array.isArray(
      competition?.competitors,
    )
      ? ((competition.competitors as unknown[]).find((item: unknown) => {
          if (!item || typeof item !== 'object') {
            return false;
          }

          const record = item as CompetitorRecord;
          const team = record.team;
          const id =
            team && typeof team === 'object'
              ? (team as { id?: unknown }).id
              : record.id;

          const competitorId =
            typeof id === 'string' || typeof id === 'number' ? String(id) : '';

          return competitorId === teamId;
        }) as CompetitorRecord | undefined)
      : undefined;

    const direct: unknown[] = Array.isArray(competitor?.statistics)
      ? (competitor.statistics as unknown[])
      : [];

    const summary = fixture.payload?.summary;
    const summaryRecord =
      summary && typeof summary === 'object'
        ? (summary as { boxscore?: unknown })
        : undefined;
    const boxscore = summaryRecord?.boxscore;
    const boxscoreRecord =
      boxscore && typeof boxscore === 'object'
        ? (boxscore as { teams?: unknown })
        : undefined;

    const summaryTeams: unknown[] = Array.isArray(boxscoreRecord?.teams)
      ? boxscoreRecord.teams
      : [];
    const summaryTeam = summaryTeams.find((item: unknown) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const team = (item as { team?: unknown }).team;
      if (!team || typeof team !== 'object') {
        return false;
      }

      const id = (team as { id?: unknown }).id;
      return (
        (typeof id === 'string' || typeof id === 'number') &&
        String(id) === teamId
      );
    }) as { statistics?: unknown } | undefined;

    const secondary: unknown[] = Array.isArray(summaryTeam?.statistics)
      ? (summaryTeam.statistics as unknown[])
      : [];

    return {
      possession: this.findStat(direct, secondary, [
        'possessionPct',
        'possessionPercentage',
        'possession',
      ]),

      shots: this.findStat(direct, secondary, [
        'totalShots',
        'shots',
        'shotsAttempted',
      ]),

      shotsOnTarget: this.findStat(direct, secondary, [
        'shotsOnTarget',
        'shotsOnGoal',
      ]),

      corners: this.findStat(direct, secondary, [
        'wonCorners',
        'corners',
        'cornerKicks',
      ]),

      fouls: this.findStat(direct, secondary, ['foulsCommitted', 'fouls']),

      offsides: this.findStat(direct, secondary, ['offsides', 'offside']),

      yellowCards: this.findStat(direct, secondary, [
        'yellowCards',
        'yellowCard',
      ]),

      redCards: this.findStat(direct, secondary, ['redCards', 'redCard']),

      saves: this.findStat(direct, secondary, ['saves', 'goalkeeperSaves']),

      expectedGoals: this.findStat(direct, secondary, [
        'expectedGoals',
        'xGoals',
        'xG',
        'expectedGoal',
      ]),
    };
  }

  private findStat(
    first: any[],
    second: any[],
    names: string[],
  ): number | undefined {
    return (
      this.findStatFromArray(first, names) ??
      this.findStatFromArray(second, names)
    );
  }

  private findStatFromArray(
    stats: unknown[],
    names: string[],
  ): number | undefined {
    for (const stat of stats) {
      if (typeof stat !== 'object' || stat === null) {
        continue;
      }

      const statRecord = stat as Record<string, unknown>;
      const rawName = statRecord.name ?? statRecord.type ?? statRecord.key;
      const name =
        typeof rawName === 'string' || typeof rawName === 'number'
          ? String(rawName).toLowerCase()
          : '';

      if (names.some((candidate) => name === candidate.toLowerCase())) {
        return (
          this.toNumber(statRecord.value) ??
          this.toNumber(statRecord.displayValue)
        );
      }
    }

    return undefined;
  }

  // ============================================================
  // TIMING
  // ============================================================

  private extractTiming(fixture: EspnFixtureDocument, teamId: string) {
    let firstHalfGoalsFor = 0;
    let firstHalfGoalsAgainst = 0;

    let secondHalfGoalsFor = 0;
    let secondHalfGoalsAgainst = 0;

    let scoredFirst = false;
    let concededFirst = false;

    let cameFromBehind = false;
    let protectedLead = false;

    const competition = this.getCompetition(fixture);

    const details = Array.isArray(competition?.details)
      ? competition.details
      : [];

    let firstScoringTeam: string | undefined;

    let wentBehind = false;
    let heldLead = false;

    for (const detail of details) {
      if (typeof detail !== 'object' || detail === null) {
        continue;
      }

      const detailRecord = detail as Record<string, unknown>;
      const team = detailRecord.team;
      const teamRecord =
        typeof team === 'object' && team !== null
          ? (team as Record<string, unknown>)
          : undefined;

      if (detailRecord.scoringPlay !== true) {
        continue;
      }

      const scoringTeamId = this.toString(
        teamRecord?.id ?? detailRecord.teamId,
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
          firstHalfGoalsFor += 1;
        } else {
          firstHalfGoalsAgainst += 1;
        }
      } else {
        if (isTeam) {
          secondHalfGoalsFor += 1;
        } else {
          secondHalfGoalsAgainst += 1;
        }
      }

      const score = this.extractScore(detail);

      if (score.home !== undefined && score.away !== undefined) {
        const teamScore =
          fixture.homeTeamId === teamId ? score.home : score.away;

        const opponentScore =
          fixture.homeTeamId === teamId ? score.away : score.home;

        if (teamScore < opponentScore) {
          wentBehind = true;
        }

        if (teamScore > opponentScore) {
          heldLead = true;
        }
      }
    }

    scoredFirst = firstScoringTeam === teamId;

    concededFirst = Boolean(firstScoringTeam && firstScoringTeam !== teamId);

    const teamFinal =
      fixture.homeTeamId === teamId ? fixture.homeScore : fixture.awayScore;

    const opponentFinal =
      fixture.homeTeamId === teamId ? fixture.awayScore : fixture.homeScore;

    const won =
      teamFinal !== undefined &&
      opponentFinal !== undefined &&
      teamFinal > opponentFinal;

    cameFromBehind = wentBehind && won;

    protectedLead = heldLead && won;

    return {
      firstHalfGoalsFor,
      firstHalfGoalsAgainst,

      secondHalfGoalsFor,
      secondHalfGoalsAgainst,

      scoredFirst,
      concededFirst,

      cameFromBehind,
      protectedLead,
    };
  }

  private extractMinute(detail: unknown): number {
    const detailRecord =
      detail !== null && typeof detail === 'object'
        ? (detail as Record<string, unknown>)
        : undefined;
    const clock = detailRecord?.['clock'];
    const clockRecord =
      clock !== null && typeof clock === 'object'
        ? (clock as Record<string, unknown>)
        : undefined;

    const direct =
      this.toNumber(clockRecord?.['value']) ??
      this.toNumber(clockRecord?.['minutes']) ??
      this.toNumber(clock);

    if (direct !== undefined) {
      return direct;
    }

    const display =
      clockRecord?.['displayValue'] ?? detailRecord?.['clockDisplay'];

    if (typeof display === 'string') {
      const match = display.match(/^(\d+)/);

      if (match) {
        const minute = Number(match[1]);

        if (Number.isFinite(minute)) {
          return minute;
        }
      }
    }

    return 90;
  }

  private extractScore(detail: unknown) {
    const detailRecord =
      detail !== null && typeof detail === 'object'
        ? (detail as Record<string, unknown>)
        : undefined;
    const score = detailRecord?.['score'];
    const scoreRecord =
      score !== null && typeof score === 'object'
        ? (score as Record<string, unknown>)
        : undefined;

    return {
      home:
        this.toNumber(detailRecord?.['homeScore']) ??
        this.toNumber(scoreRecord?.['home']),

      away:
        this.toNumber(detailRecord?.['awayScore']) ??
        this.toNumber(scoreRecord?.['away']),
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private collectTeamIds(
    fixtures: EspnFixtureDocument[],
    standings: EspnStandingDocument[],
  ): Set<string> {
    const ids = new Set<string>();

    for (const standing of standings) {
      if (standing.teamId) {
        ids.add(standing.teamId);
      }
    }

    for (const fixture of fixtures) {
      if (fixture.homeTeamId) {
        ids.add(fixture.homeTeamId);
      }

      if (fixture.awayTeamId) {
        ids.add(fixture.awayTeamId);
      }
    }

    return ids;
  }

  private extractFixtureTeamName(
    fixture: EspnFixtureDocument,
    side: 'home' | 'away',
  ): string {
    const competition = this.getCompetition(fixture);

    type Competitor = {
      homeAway?: unknown;
      team?: {
        displayName?: string;
        name?: string;
        shortDisplayName?: string;
      };
    };

    const competitors: unknown[] = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];
    const competitor = competitors.find((item: unknown): item is Competitor => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }

      return (
        'homeAway' in item && (item as { homeAway?: unknown }).homeAway === side
      );
    });

    const team = competitor?.team;

    return (
      team?.displayName ??
      team?.name ??
      team?.shortDisplayName ??
      `Team ${side === 'home' ? fixture.homeTeamId : fixture.awayTeamId}`
    );
  }

  private extractStandingTeamName(standing: EspnStandingDocument): string {
    const team = standing.payload?.['team'] as
      | Record<string, unknown>
      | undefined;

    return (
      this.toString(team?.displayName) ??
      this.toString(team?.name) ??
      this.toString(team?.shortDisplayName) ??
      `Team ${standing.teamId}`
    );
  }

  private getNextFixture(
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

  private createAggregate(): Aggregate {
    return {
      played: 0,

      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,

      goalsFor: 0,
      goalsAgainst: 0,

      cleanSheets: 0,
      failedToScore: 0,

      btts: 0,

      over05: 0,
      over15: 0,
      over25: 0,
      over35: 0,
      over45: 0,
      over55: 0,

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

      firstHalfGoalsFor: 0,
      firstHalfGoalsAgainst: 0,

      secondHalfGoalsFor: 0,
      secondHalfGoalsAgainst: 0,

      scoredFirst: 0,
      concededFirst: 0,

      cameFromBehind: 0,
      protectedLead: 0,

      goalDistribution: [0, 0, 0, 0, 0, 0],

      exactScores: {},
    };
  }

  private calculateStrengthScore(stats: Aggregate): number {
    if (!stats.played) {
      return 0;
    }

    const pointsPerGame = stats.points / stats.played;

    const attack = stats.goalsFor / stats.played;

    const defence = stats.goalsAgainst / stats.played;

    const score =
      pointsPerGame * 30 +
      attack * 20 +
      Math.max(0, 2.5 - defence) * 20 +
      this.rate(stats.cleanSheets, stats.played) * 15 -
      this.rate(stats.failedToScore, stats.played) * 10;

    return Number(Math.max(0, Math.min(100, score)).toFixed(2));
  }

  private calculateOverallStrength(
    stats: Aggregate,
    formScore: number,
  ): number {
    const base = this.calculateStrengthScore(stats);

    return Number(
      Math.max(0, Math.min(100, base * 0.75 + formScore * 100 * 0.25)).toFixed(
        2,
      ),
    );
  }

  private calculateFormScore(matches: TeamMatchRecord[]): number {
    if (!matches.length) {
      return 0;
    }

    return Number(
      (this.getFormPoints(matches) / (matches.length * 3)).toFixed(4),
    );
  }

  private getFormPoints(matches: TeamMatchRecord[]): number {
    return matches.reduce(
      (total, match) =>
        total + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0),
      0,
    );
  }

  private calculateDataCoverage(matches: TeamMatchRecord[]) {
    const total = matches.length;

    const statistics = matches.filter(
      (match) =>
        match.possession !== undefined ||
        match.shots !== undefined ||
        match.shotsOnTarget !== undefined ||
        match.corners !== undefined ||
        match.expectedGoals !== undefined,
    ).length;

    const timing = matches.filter(
      (match) =>
        match.firstHalfGoalsFor +
          match.firstHalfGoalsAgainst +
          match.secondHalfGoalsFor +
          match.secondHalfGoalsAgainst >
        0,
    ).length;

    return {
      total,
      statistics,
      timing,
      statisticsCoverage: this.rate(statistics, total),
      timingCoverage: this.rate(timing, total),
    };
  }

  private calculateDataCompletenessScore(
    coverage: Record<string, unknown>,
  ): number {
    const statisticsCoverage = Number(coverage.statisticsCoverage ?? 0);

    const timingCoverage = Number(coverage.timingCoverage ?? 0);

    return Number(
      (
        100 * 0.5 +
        statisticsCoverage * 100 * 0.3 +
        timingCoverage * 100 * 0.2
      ).toFixed(2),
    );
  }

  private calculateSampleScore(count: number): number {
    return Number(Math.min(100, (count / 20) * 100).toFixed(2));
  }

  private sumGoals(
    matches: TeamMatchRecord[],
    side: 'for' | 'against',
  ): number {
    return matches.reduce(
      (total, match) =>
        total + (side === 'for' ? match.goalsFor : match.goalsAgainst),
      0,
    );
  }

  private average(total: number, count: number): number {
    if (!count) {
      return 0;
    }

    return Number((total / count).toFixed(4));
  }

  private rate(numerator: number, denominator: number): number {
    if (!denominator) {
      return 0;
    }

    return Number((numerator / denominator).toFixed(4));
  }

  private optionalAverage(total: number, count: number): number | undefined {
    return count ? this.average(total, count) : undefined;
  }

  private averageOptionalFromMatches(
    matches: TeamMatchRecord[],
    metric:
      | 'possession'
      | 'shots'
      | 'shotsOnTarget'
      | 'corners'
      | 'fouls'
      | 'yellowCards'
      | 'redCards',
  ): number | undefined {
    const values = matches
      .map((match) => match[metric])
      .filter(
        (value): value is number =>
          value !== undefined && Number.isFinite(value),
      );

    return values.length
      ? this.average(
          values.reduce((sum, value) => sum + value, 0),
          values.length,
        )
      : undefined;
  }

  private toDistribution(values: number[], total: number): number[] {
    if (!total) {
      return values.map(() => 0);
    }

    return values.map((value) => Number((value / total).toFixed(4)));
  }

  private toDistributionMap(
    values: Record<string, number>,
    total: number,
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const [key, value] of Object.entries(values)) {
      result[key] = total ? Number((value / total).toFixed(4)) : 0;
    }

    return result;
  }

  private addOptional(
    value: number | undefined,
    callback: (value: number) => void,
  ): void {
    if (value !== undefined && Number.isFinite(value)) {
      callback(value);
    }
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
    if (value === null || value === undefined) {
      return undefined;
    }

    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean' &&
      typeof value !== 'bigint'
    ) {
      return undefined;
    }

    const result = String(value).trim();

    return result ? result : undefined;
  }

  private getCompetition(
    fixture: EspnFixtureDocument,
  ): { competitors?: unknown; details?: unknown } | undefined {
    const competitions = fixture.payload?.['competitions'];

    const competition: unknown = Array.isArray(competitions)
      ? (competitions as unknown[])[0]
      : undefined;

    return competition !== null && typeof competition === 'object'
      ? competition
      : undefined;
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
