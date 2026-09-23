import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { HeadToHead, HeadToHeadDocument } from '../schemas/head-to-head.schema';

interface MeetingRecord {
  fixtureId: string;

  competitionId: string;

  season: number;

  date: Date;

  homeTeamId: string;

  homeTeamName: string;

  awayTeamId: string;

  awayTeamName: string;

  homeGoals: number;

  awayGoals: number;

  firstHalfHomeGoals?: number;

  firstHalfAwayGoals?: number;

  secondHalfHomeGoals?: number;

  secondHalfAwayGoals?: number;

  btts?: boolean;

  homeCleanSheet?: boolean;

  awayCleanSheet?: boolean;

  homeScoredFirst?: boolean;

  awayScoredFirst?: boolean;

  statistics?: Record<string, unknown>;
}

interface EspnCompetition {
  details?: Array<Record<string, unknown>>;
  competitors?: Array<Record<string, unknown>>;
}

@Injectable()
export class HeadToHeadService {
  private readonly logger = new Logger(HeadToHeadService.name);

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

    @InjectModel(HeadToHead.name)
    private readonly headToHeadModel: Model<HeadToHeadDocument>,
  ) {}

  // ============================================================
  // REBUILD PAIR
  // ============================================================

  async rebuildPair(
    teamOneId: string,
    teamTwoId: string,
  ): Promise<HeadToHeadDocument | null> {
    const normalizedOne = teamOneId.trim();

    const normalizedTwo = teamTwoId.trim();

    if (!normalizedOne || !normalizedTwo || normalizedOne === normalizedTwo) {
      return null;
    }

    const { teamAId, teamBId, pairKey } = this.normalizePair(
      normalizedOne,
      normalizedTwo,
    );

    const fixtures = await this.fixtureModel
      .find({
        completed: true,
        $or: [
          {
            homeTeamId: teamAId,
            awayTeamId: teamBId,
          },
          {
            homeTeamId: teamBId,
            awayTeamId: teamAId,
          },
        ],
      })
      .sort({
        fixtureDate: -1,
      })
      .lean()
      .exec();

    const meetings: MeetingRecord[] = [];

    let teamAName = `Team ${teamAId}`;

    let teamBName = `Team ${teamBId}`;

    for (const fixture of fixtures) {
      if (!this.isCompletedFixture(fixture)) {
        continue;
      }

      if (fixture.homeScore === undefined || fixture.awayScore === undefined) {
        continue;
      }

      const homeTeamId = fixture.homeTeamId;

      const awayTeamId = fixture.awayTeamId;

      if (
        !homeTeamId ||
        !awayTeamId ||
        !this.isPair(homeTeamId, awayTeamId, teamAId, teamBId)
      ) {
        continue;
      }

      const homeTeamName = this.extractTeamName(fixture, 'home');

      const awayTeamName = this.extractTeamName(fixture, 'away');

      teamAName = homeTeamId === teamAId ? homeTeamName : awayTeamName;

      teamBName = homeTeamId === teamBId ? homeTeamName : awayTeamName;

      const timingHome = this.extractTiming(fixture, homeTeamId);

      const timingAway = this.extractTiming(fixture, awayTeamId);

      meetings.push({
        fixtureId: fixture.eventId,

        competitionId: fixture.leagueId,

        season: fixture.season,

        date: fixture.fixtureDate,

        homeTeamId,

        homeTeamName,

        awayTeamId,

        awayTeamName,

        homeGoals: fixture.homeScore,

        awayGoals: fixture.awayScore,

        firstHalfHomeGoals: timingHome.firstHalfGoals,

        firstHalfAwayGoals: timingAway.firstHalfGoals,

        secondHalfHomeGoals: timingHome.secondHalfGoals,

        secondHalfAwayGoals: timingAway.secondHalfGoals,

        btts: fixture.homeScore > 0 && fixture.awayScore > 0,

        homeCleanSheet: fixture.awayScore === 0,

        awayCleanSheet: fixture.homeScore === 0,

        homeScoredFirst: timingHome.scoredFirst,

        awayScoredFirst: timingAway.scoredFirst,

        statistics: this.extractMeetingStatistics(fixture),
      });
    }

    if (!meetings.length) {
      await this.headToHeadModel
        .deleteOne({
          pairKey,
        })
        .exec();

      return null;
    }

    const stats = this.calculateStats(teamAId, teamBId, meetings);

    const lastFive = meetings.slice(0, 5);

    const lastTen = meetings.slice(0, 10);

    const lastFiveStats = this.calculateWindowStats(teamAId, teamBId, lastFive);

    const lastTenStats = this.calculateWindowStats(teamAId, teamBId, lastTen);

    const homeStats = this.calculateHomeStats(teamAId, teamBId, meetings);

    const distribution = this.calculateDistributions(
      teamAId,
      teamBId,
      meetings,
    );

    const timing = this.calculateTimingStats(teamAId, teamBId, meetings);

    const sampleReliabilityScore = this.calculateSampleReliability(
      meetings.length,
    );

    const dataCompletenessScore = this.calculateDataCompleteness(meetings);

    return this.headToHeadModel
      .findOneAndUpdate(
        {
          pairKey,
        },
        {
          $set: {
            pairKey,

            teamAId,
            teamAName,

            teamBId,
            teamBName,

            totalMeetings: meetings.length,

            teamAWins: stats.teamAWins,

            draws: stats.draws,

            teamBWins: stats.teamBWins,

            teamAGoals: stats.teamAGoals,

            teamBGoals: stats.teamBGoals,

            averageTeamAGoals: this.average(stats.teamAGoals, meetings.length),

            averageTeamBGoals: this.average(stats.teamBGoals, meetings.length),

            averageTotalGoals: this.average(
              stats.teamAGoals + stats.teamBGoals,
              meetings.length,
            ),

            teamAWinRate: this.rate(stats.teamAWins, meetings.length),

            drawRate: this.rate(stats.draws, meetings.length),

            teamBWinRate: this.rate(stats.teamBWins, meetings.length),

            bttsRate: this.rate(stats.btts, meetings.length),

            over05Rate: this.rate(stats.over05, meetings.length),

            over15Rate: this.rate(stats.over15, meetings.length),

            over25Rate: this.rate(stats.over25, meetings.length),

            over35Rate: this.rate(stats.over35, meetings.length),

            over45Rate: this.rate(stats.over45, meetings.length),

            over55Rate: this.rate(stats.over55, meetings.length),

            cleanSheetTeamARate: this.rate(
              stats.teamACleanSheets,
              meetings.length,
            ),

            cleanSheetTeamBRate: this.rate(
              stats.teamBCleanSheets,
              meetings.length,
            ),

            failedToScoreTeamARate: this.rate(
              stats.teamAFailedToScore,
              meetings.length,
            ),

            failedToScoreTeamBRate: this.rate(
              stats.teamBFailedToScore,
              meetings.length,
            ),

            teamAHomeMeetings: homeStats.teamAHomeMeetings,

            teamAHomeWins: homeStats.teamAHomeWins,

            teamAHomeDraws: homeStats.teamAHomeDraws,

            teamAHomeLosses: homeStats.teamAHomeLosses,

            teamAHomeWinRate: this.rate(
              homeStats.teamAHomeWins,
              homeStats.teamAHomeMeetings,
            ),

            teamBHomeMeetings: homeStats.teamBHomeMeetings,

            teamBHomeWins: homeStats.teamBHomeWins,

            teamBHomeDraws: homeStats.teamBHomeDraws,

            teamBHomeLosses: homeStats.teamBHomeLosses,

            teamBHomeWinRate: this.rate(
              homeStats.teamBHomeWins,
              homeStats.teamBHomeMeetings,
            ),

            lastFive: lastFiveStats,

            lastTen: lastTenStats,

            exactScoreDistribution: distribution.exactScores,

            totalGoalsDistribution: distribution.totalGoals,

            firstHalfGoalsTeamA: timing.firstHalfGoalsTeamA,

            firstHalfGoalsTeamB: timing.firstHalfGoalsTeamB,

            secondHalfGoalsTeamA: timing.secondHalfGoalsTeamA,

            secondHalfGoalsTeamB: timing.secondHalfGoalsTeamB,

            teamAScoredFirstRate: this.rate(
              timing.teamAScoredFirst,
              meetings.length,
            ),

            teamBScoredFirstRate: this.rate(
              timing.teamBScoredFirst,
              meetings.length,
            ),

            meetings,

            lastMeetingAt: meetings[0]?.date ?? null,

            sampleReliabilityScore,

            dataCompletenessScore,

            calculatedAt: new Date(),
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
        },
      )
      .exec();
  }

  // ============================================================
  // REFRESH FOR FIXTURE
  // ============================================================

  async refreshForFixture(
    fixtureId: string,
  ): Promise<HeadToHeadDocument | null> {
    const fixture = await this.fixtureModel
      .findOne({
        eventId: fixtureId.trim(),
      })
      .lean()
      .exec();

    if (!fixture || !this.isCompletedFixture(fixture)) {
      return null;
    }

    if (
      !fixture.homeTeamId ||
      !fixture.awayTeamId ||
      fixture.homeTeamId === fixture.awayTeamId
    ) {
      return null;
    }

    return this.rebuildPair(fixture.homeTeamId, fixture.awayTeamId);
  }

  // ============================================================
  // GET PAIR
  // ============================================================

  async getPair(
    teamOneId: string,
    teamTwoId: string,
  ): Promise<HeadToHeadDocument | null> {
    if (!teamOneId || !teamTwoId || teamOneId === teamTwoId) {
      return null;
    }

    const { pairKey } = this.normalizePair(teamOneId, teamTwoId);

    return this.headToHeadModel
      .findOne({
        pairKey,
      })
      .lean()
      .exec();
  }

  // ============================================================
  // REBUILD PAIRS
  // ============================================================

  async rebuildPairsForTeams(teamIds: string[]): Promise<number> {
    const uniqueTeamIds = [
      ...new Set(teamIds.map((id) => id.trim()).filter(Boolean)),
    ];

    if (uniqueTeamIds.length < 2) {
      return 0;
    }

    const fixtures = await this.fixtureModel
      .find({
        completed: true,
        $or: [
          {
            homeTeamId: {
              $in: uniqueTeamIds,
            },
          },
          {
            awayTeamId: {
              $in: uniqueTeamIds,
            },
          },
        ],
      })
      .lean()
      .exec();

    const pairs = new Set<string>();

    for (const fixture of fixtures) {
      if (!this.isCompletedFixture(fixture)) {
        continue;
      }

      const homeId = fixture.homeTeamId;

      const awayId = fixture.awayTeamId;

      if (
        !homeId ||
        !awayId ||
        homeId === awayId ||
        !uniqueTeamIds.includes(homeId) ||
        !uniqueTeamIds.includes(awayId)
      ) {
        continue;
      }

      pairs.add(this.normalizePair(homeId, awayId).pairKey);
    }

    let rebuilt = 0;

    for (const pairKey of pairs) {
      const [teamAId, teamBId] = pairKey.split(':');

      if (!teamAId || !teamBId) {
        continue;
      }

      const result = await this.rebuildPair(teamAId, teamBId);

      if (result) {
        rebuilt += 1;
      }
    }

    return rebuilt;
  }

  // ============================================================
  // BASIC STATS
  // ============================================================

  private calculateStats(
    teamAId: string,
    teamBId: string,
    meetings: MeetingRecord[],
  ) {
    let teamAWins = 0;
    let draws = 0;
    let teamBWins = 0;

    let teamAGoals = 0;
    let teamBGoals = 0;

    let teamACleanSheets = 0;

    let teamBCleanSheets = 0;

    let teamAFailedToScore = 0;

    let teamBFailedToScore = 0;

    let btts = 0;

    let over05 = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;
    let over45 = 0;
    let over55 = 0;

    for (const meeting of meetings) {
      const aGoals =
        meeting.homeTeamId === teamAId ? meeting.homeGoals : meeting.awayGoals;

      const bGoals =
        meeting.homeTeamId === teamBId ? meeting.homeGoals : meeting.awayGoals;

      teamAGoals += aGoals;
      teamBGoals += bGoals;

      if (aGoals > bGoals) {
        teamAWins += 1;
      } else if (aGoals < bGoals) {
        teamBWins += 1;
      } else {
        draws += 1;
      }

      if (bGoals === 0) {
        teamACleanSheets += 1;
      }

      if (aGoals === 0) {
        teamBCleanSheets += 1;
      }

      if (aGoals === 0) {
        teamAFailedToScore += 1;
      }

      if (bGoals === 0) {
        teamBFailedToScore += 1;
      }

      if (aGoals > 0 && bGoals > 0) {
        btts += 1;
      }

      const total = aGoals + bGoals;

      if (total > 0) {
        over05 += 1;
      }

      if (total > 1) {
        over15 += 1;
      }

      if (total > 2) {
        over25 += 1;
      }

      if (total > 3) {
        over35 += 1;
      }

      if (total > 4) {
        over45 += 1;
      }

      if (total > 5) {
        over55 += 1;
      }
    }

    return {
      teamAWins,
      draws,
      teamBWins,

      teamAGoals,
      teamBGoals,

      teamACleanSheets,
      teamBCleanSheets,

      teamAFailedToScore,
      teamBFailedToScore,

      btts,

      over05,
      over15,
      over25,
      over35,
      over45,
      over55,
    };
  }

  // ============================================================
  // HOME / AWAY
  // ============================================================

  private calculateHomeStats(
    teamAId: string,
    teamBId: string,
    meetings: MeetingRecord[],
  ) {
    let teamAHomeMeetings = 0;

    let teamAHomeWins = 0;
    let teamAHomeDraws = 0;
    let teamAHomeLosses = 0;

    let teamBHomeMeetings = 0;

    let teamBHomeWins = 0;
    let teamBHomeDraws = 0;
    let teamBHomeLosses = 0;

    for (const meeting of meetings) {
      if (meeting.homeTeamId === teamAId) {
        teamAHomeMeetings += 1;

        if (meeting.homeGoals > meeting.awayGoals) {
          teamAHomeWins += 1;
        } else if (meeting.homeGoals === meeting.awayGoals) {
          teamAHomeDraws += 1;
        } else {
          teamAHomeLosses += 1;
        }
      }

      if (meeting.homeTeamId === teamBId) {
        teamBHomeMeetings += 1;

        if (meeting.homeGoals > meeting.awayGoals) {
          teamBHomeWins += 1;
        } else if (meeting.homeGoals === meeting.awayGoals) {
          teamBHomeDraws += 1;
        } else {
          teamBHomeLosses += 1;
        }
      }
    }

    return {
      teamAHomeMeetings,
      teamAHomeWins,
      teamAHomeDraws,
      teamAHomeLosses,

      teamBHomeMeetings,
      teamBHomeWins,
      teamBHomeDraws,
      teamBHomeLosses,
    };
  }

  // ============================================================
  // WINDOW STATS
  // ============================================================

  private calculateWindowStats(
    teamAId: string,
    teamBId: string,
    meetings: MeetingRecord[],
  ) {
    if (!meetings.length) {
      return {
        meetings: [],
        totalMeetings: 0,
      };
    }

    let teamAWins = 0;
    let draws = 0;
    let teamBWins = 0;

    let teamAGoals = 0;
    let teamBGoals = 0;

    let btts = 0;
    let over25 = 0;

    for (const meeting of meetings) {
      const aGoals =
        meeting.homeTeamId === teamAId ? meeting.homeGoals : meeting.awayGoals;

      const bGoals =
        meeting.homeTeamId === teamBId ? meeting.homeGoals : meeting.awayGoals;

      teamAGoals += aGoals;
      teamBGoals += bGoals;

      if (aGoals > bGoals) {
        teamAWins += 1;
      } else if (aGoals < bGoals) {
        teamBWins += 1;
      } else {
        draws += 1;
      }

      if (aGoals > 0 && bGoals > 0) {
        btts += 1;
      }

      if (aGoals + bGoals > 2) {
        over25 += 1;
      }
    }

    return {
      totalMeetings: meetings.length,

      teamAWins,

      draws,

      teamBWins,

      teamAGoals,

      teamBGoals,

      averageTeamAGoals: this.average(teamAGoals, meetings.length),

      averageTeamBGoals: this.average(teamBGoals, meetings.length),

      bttsRate: this.rate(btts, meetings.length),

      over25Rate: this.rate(over25, meetings.length),
    };
  }

  // ============================================================
  // DISTRIBUTIONS
  // ============================================================

  private calculateDistributions(
    teamAId: string,
    teamBId: string,
    meetings: MeetingRecord[],
  ) {
    const exactScores: Record<string, number> = {};

    const totalGoals: Record<string, number> = {};

    for (const meeting of meetings) {
      const aGoals =
        meeting.homeTeamId === teamAId ? meeting.homeGoals : meeting.awayGoals;

      const bGoals =
        meeting.homeTeamId === teamBId ? meeting.homeGoals : meeting.awayGoals;

      const exact = `${aGoals}-${bGoals}`;

      const total = String(aGoals + bGoals);

      exactScores[exact] = (exactScores[exact] ?? 0) + 1;

      totalGoals[total] = (totalGoals[total] ?? 0) + 1;
    }

    return {
      exactScores: this.toDistributionMap(exactScores, meetings.length),

      totalGoals: this.toDistributionMap(totalGoals, meetings.length),
    };
  }

  // ============================================================
  // TIMING
  // ============================================================

  private calculateTimingStats(
    teamAId: string,
    teamBId: string,
    meetings: MeetingRecord[],
  ) {
    let firstHalfGoalsTeamA = 0;

    let firstHalfGoalsTeamB = 0;

    let secondHalfGoalsTeamA = 0;

    let secondHalfGoalsTeamB = 0;

    let teamAScoredFirst = 0;
    let teamBScoredFirst = 0;

    for (const meeting of meetings) {
      const aFirst =
        meeting.homeTeamId === teamAId
          ? (meeting.firstHalfHomeGoals ?? 0)
          : (meeting.firstHalfAwayGoals ?? 0);

      const bFirst =
        meeting.homeTeamId === teamBId
          ? (meeting.firstHalfHomeGoals ?? 0)
          : (meeting.firstHalfAwayGoals ?? 0);

      const aSecond =
        meeting.homeTeamId === teamAId
          ? (meeting.secondHalfHomeGoals ?? 0)
          : (meeting.secondHalfAwayGoals ?? 0);

      const bSecond =
        meeting.homeTeamId === teamBId
          ? (meeting.secondHalfHomeGoals ?? 0)
          : (meeting.secondHalfAwayGoals ?? 0);

      firstHalfGoalsTeamA += aFirst;

      firstHalfGoalsTeamB += bFirst;

      secondHalfGoalsTeamA += aSecond;

      secondHalfGoalsTeamB += bSecond;

      if (meeting.homeScoredFirst && meeting.homeTeamId === teamAId) {
        teamAScoredFirst += 1;
      } else if (meeting.awayScoredFirst && meeting.awayTeamId === teamAId) {
        teamAScoredFirst += 1;
      }

      if (meeting.homeScoredFirst && meeting.homeTeamId === teamBId) {
        teamBScoredFirst += 1;
      } else if (meeting.awayScoredFirst && meeting.awayTeamId === teamBId) {
        teamBScoredFirst += 1;
      }
    }

    return {
      firstHalfGoalsTeamA,
      firstHalfGoalsTeamB,

      secondHalfGoalsTeamA,
      secondHalfGoalsTeamB,

      teamAScoredFirst,
      teamBScoredFirst,
    };
  }

  // ============================================================
  // MEETING STATISTICS
  // ============================================================

  private extractMeetingStatistics(
    fixture: EspnFixtureDocument,
  ): Record<string, unknown> {
    const competition = this.getCompetition(fixture);

    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

    const result: Record<string, unknown> = {};

    for (const competitor of competitors) {
      const competitorData = competitor as {
        team?: { id?: unknown };
        id?: unknown;
      };
      const teamId = this.toStringValue(
        competitorData.team?.id ?? competitorData.id,
      );

      if (!teamId) {
        continue;
      }

      const statistics = Array.isArray(competitor?.statistics)
        ? competitor.statistics
        : [];

      result[teamId] = statistics;
    }

    return result;
  }

  // ============================================================
  // PAIR HELPERS
  // ============================================================

  private normalizePair(teamOneId: string, teamTwoId: string) {
    const ids = [teamOneId.trim(), teamTwoId.trim()].sort((a, b) =>
      a.localeCompare(b, undefined, {
        numeric: true,
      }),
    );

    return {
      teamAId: ids[0],
      teamBId: ids[1],
      pairKey: `${ids[0]}:${ids[1]}`,
    };
  }

  private isPair(
    homeId: string,
    awayId: string,
    teamAId: string,
    teamBId: string,
  ): boolean {
    return (
      (homeId === teamAId && awayId === teamBId) ||
      (homeId === teamBId && awayId === teamAId)
    );
  }

  private extractTiming(fixture: EspnFixtureDocument, teamId: string) {
    let firstHalfGoals = 0;
    let secondHalfGoals = 0;

    let scoredFirst = false;

    const competition = this.getCompetition(fixture);

    const details = Array.isArray(competition?.details)
      ? competition.details
      : [];

    let firstScoringTeam: string | undefined;

    for (const detail of details) {
      if (detail?.scoringPlay !== true) {
        continue;
      }

      const scoringTeamId = this.toStringValue(
        (detail?.team as { id?: unknown } | undefined)?.id ?? detail?.teamId,
      );

      if (!scoringTeamId) {
        continue;
      }

      if (!firstScoringTeam) {
        firstScoringTeam = scoringTeamId;
      }

      const minute = this.extractMinute(detail);

      if (scoringTeamId === teamId) {
        if (minute <= 45) {
          firstHalfGoals += 1;
        } else {
          secondHalfGoals += 1;
        }
      }
    }

    scoredFirst = firstScoringTeam === teamId;

    return {
      firstHalfGoals,
      secondHalfGoals,
      scoredFirst,
    };
  }

  private extractMinute(detail: unknown): number {
    const detailRecord: Record<string, unknown> =
      typeof detail === 'object' && detail !== null
        ? (detail as Record<string, unknown>)
        : {};
    const clock = detailRecord['clock'];
    const clockRecord: Record<string, unknown> =
      typeof clock === 'object' && clock !== null
        ? (clock as Record<string, unknown>)
        : {};

    const direct =
      this.toNumber(clockRecord['value']) ??
      this.toNumber(clockRecord['minutes']) ??
      this.toNumber(clock);

    if (direct !== undefined) {
      return direct;
    }

    const display = clockRecord['displayValue'] ?? detailRecord['clockDisplay'];

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

  private getCompetition(
    fixture: EspnFixtureDocument,
  ): EspnCompetition | undefined {
    const competitions: unknown = fixture.payload?.['competitions'];

    if (!Array.isArray(competitions)) {
      return undefined;
    }

    const competition: unknown = competitions[0];

    return competition && typeof competition === 'object'
      ? competition
      : undefined;
  }

  private extractTeamName(
    fixture: EspnFixtureDocument,
    side: 'home' | 'away',
  ): string {
    const competition = this.getCompetition(fixture);

    const competitor = Array.isArray(competition?.competitors)
      ? competition.competitors.find(
          (item: unknown) =>
            typeof item === 'object' &&
            item !== null &&
            'homeAway' in item &&
            item.homeAway === side,
        )
      : undefined;

    const team = competitor?.team as
      | {
          displayName?: unknown;
          name?: unknown;
          shortDisplayName?: unknown;
        }
      | undefined;
    const teamName = [
      team?.displayName,
      team?.name,
      team?.shortDisplayName,
    ].find((value): value is string => typeof value === 'string');

    return (
      teamName ??
      `Team ${side === 'home' ? fixture.homeTeamId : fixture.awayTeamId}`
    );
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

  private rate(numerator: number, denominator: number): number {
    if (!denominator) {
      return 0;
    }

    return Number((numerator / denominator).toFixed(4));
  }

  private average(total: number, count: number): number {
    if (!count) {
      return 0;
    }

    return Number((total / count).toFixed(4));
  }

  private calculateSampleReliability(sampleSize: number): number {
    return Number(Math.min(100, (sampleSize / 10) * 100).toFixed(2));
  }

  private calculateDataCompleteness(meetings: MeetingRecord[]): number {
    if (!meetings.length) {
      return 0;
    }

    const withTiming = meetings.filter(
      (meeting) =>
        meeting.firstHalfHomeGoals !== undefined ||
        meeting.firstHalfAwayGoals !== undefined,
    ).length;

    const withStats = meetings.filter(
      (meeting) =>
        meeting.statistics && Object.keys(meeting.statistics).length > 0,
    ).length;

    return Number(
      (
        100 * 0.5 +
        this.rate(withTiming, meetings.length) * 100 * 0.25 +
        this.rate(withStats, meetings.length) * 100 * 0.25
      ).toFixed(2),
    );
  }

  private isCompletedFixture(fixture: EspnFixtureDocument): boolean {
    if (fixture.completed === true) {
      return true;
    }

    return this.completedStatuses.has(fixture.status.trim().toUpperCase());
  }

  private toStringValue(value: unknown): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    return '';
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }
}
