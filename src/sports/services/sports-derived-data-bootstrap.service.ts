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
  MatchDerivedData,
  MatchDerivedDataDocument,
} from '../schemas/match-derived-data.schema';

import { TeamCompetitionStatsService } from './team-competition-stats.service';
import { TeamPerformanceProfileService } from './team-performance-profile.service';
import { HeadToHeadService } from './head-to-head.service';
import { MatchDerivedDataService } from './match-derived-data.service';

interface CompetitionSeason {
  leagueId: string;
  season: number;
}

@Injectable()
export class SportsDerivedDataBootstrapService {
  private readonly logger = new Logger(SportsDerivedDataBootstrapService.name);

  private running = false;

  constructor(
    @InjectModel(EspnFixture.name)
    private readonly fixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(TeamCompetitionStats.name)
    private readonly teamCompetitionStatsModel: Model<TeamCompetitionStatsDocument>,

    @InjectModel(TeamPerformanceProfile.name)
    private readonly teamPerformanceProfileModel: Model<TeamPerformanceProfileDocument>,

    @InjectModel(HeadToHead.name)
    private readonly headToHeadModel: Model<HeadToHeadDocument>,

    @InjectModel(MatchDerivedData.name)
    private readonly matchDerivedDataModel: Model<MatchDerivedDataDocument>,

    private readonly teamCompetitionStatsService: TeamCompetitionStatsService,

    private readonly teamPerformanceProfileService: TeamPerformanceProfileService,

    private readonly headToHeadService: HeadToHeadService,

    private readonly matchDerivedDataService: MatchDerivedDataService,
  ) {}

  // ============================================================
  // INITIALIZE
  // ============================================================

  async initialize(): Promise<void> {
    if (this.running) {
      this.logger.warn(
        'Skipping derived-data bootstrap because another bootstrap is already running',
      );

      return;
    }

    this.running = true;

    try {
      const [
        teamStatsCount,
        profileCount,
        headToHeadCount,
        matchDerivedDataCount,
      ] = await Promise.all([
        this.teamCompetitionStatsModel.countDocuments().exec(),

        this.teamPerformanceProfileModel.countDocuments().exec(),

        this.headToHeadModel.countDocuments().exec(),

        this.matchDerivedDataModel.countDocuments().exec(),
      ]);

      /*
       * Nothing to do when every derived collection already contains
       * data.
       */
      if (
        teamStatsCount > 0 &&
        profileCount > 0 &&
        headToHeadCount > 0 &&
        matchDerivedDataCount > 0
      ) {
        this.logger.log(
          'Derived-data collections already contain data; bootstrap skipped',
        );

        return;
      }

      this.logger.log(
        'Starting initial derived-data bootstrap from stored ESPN fixtures',
      );

      const competitions = await this.getCompetitionSeasons();

      if (!competitions.length) {
        this.logger.warn(
          'No ESPN fixtures found; derived-data bootstrap skipped',
        );

        return;
      }

      // ========================================================
      // TEAM COMPETITION STATS
      // ========================================================

      const rebuildTeamStats = teamStatsCount === 0 || profileCount === 0;

      if (rebuildTeamStats) {
        let total = 0;

        for (const competition of competitions) {
          try {
            const rebuilt =
              await this.teamCompetitionStatsService.rebuildCompetition(
                competition.leagueId,
                competition.season,
              );

            total += rebuilt;

            this.logger.log(
              `Team competition stats rebuilt for ` +
                `${competition.leagueId}/${competition.season}: ${rebuilt} teams`,
            );
          } catch (error) {
            this.logger.error(
              `Failed team competition stats rebuild for ` +
                `${competition.leagueId}/${competition.season}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }

        this.logger.log(
          `Initial team competition stats bootstrap completed: ${total} teams`,
        );
      }

      // ========================================================
      // TEAM PERFORMANCE PROFILES
      // ========================================================

      if (rebuildTeamStats) {
        let total = 0;

        for (const competition of competitions) {
          try {
            const rebuilt =
              await this.teamPerformanceProfileService.rebuildCompetition(
                competition.leagueId,
                competition.season,
              );

            total += rebuilt;

            this.logger.log(
              `Team performance profiles rebuilt for ` +
                `${competition.leagueId}/${competition.season}: ${rebuilt} teams`,
            );
          } catch (error) {
            this.logger.error(
              `Failed team performance profile rebuild for ` +
                `${competition.leagueId}/${competition.season}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }

        this.logger.log(
          `Initial team performance profile bootstrap completed: ${total} teams`,
        );
      }

      // ========================================================
      // HEAD TO HEAD
      // ========================================================

      if (headToHeadCount === 0) {
        const pairKeys = await this.getHistoricalPairs();

        let rebuilt = 0;

        for (const pairKey of pairKeys) {
          const [teamAId, teamBId] = pairKey.split(':');

          if (!teamAId || !teamBId) {
            continue;
          }

          try {
            const result = await this.headToHeadService.rebuildPair(
              teamAId,
              teamBId,
            );

            if (result) {
              rebuilt += 1;
            }
          } catch (error) {
            this.logger.error(
              `Failed H2H rebuild for ${pairKey}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }

        this.logger.log(`Initial H2H bootstrap completed: ${rebuilt} pairs`);
      }

      // ========================================================
      // MATCH DERIVED DATA
      // ========================================================

      if (matchDerivedDataCount === 0) {
        const rebuilt = await this.matchDerivedDataService.rebuildUpcoming();

        this.logger.log(
          `Initial match-derived-data bootstrap completed: ${rebuilt} upcoming fixtures`,
        );
      }

      this.logger.log('Initial derived-data bootstrap completed successfully');
    } catch (error) {
      this.logger.error(
        'Initial derived-data bootstrap failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  // ============================================================
  // COMPETITION / SEASONS
  // ============================================================

  private async getCompetitionSeasons(): Promise<CompetitionSeason[]> {
    const rows = await this.fixtureModel
      .aggregate<{
        _id: {
          leagueId: string;
          season: number;
        };
      }>([
        {
          $match: {
            leagueId: {
              $exists: true,
              $ne: '',
            },
            season: {
              $exists: true,
            },
          },
        },
        {
          $group: {
            _id: {
              leagueId: '$leagueId',
              season: '$season',
            },
          },
        },
        {
          $sort: {
            '_id.leagueId': 1,
            '_id.season': 1,
          },
        },
      ])
      .exec();

    return rows
      .map((row) => ({
        leagueId: String(row._id.leagueId).trim().toLowerCase(),
        season: Number(row._id.season),
      }))
      .filter(
        (item) => item.leagueId.length > 0 && Number.isFinite(item.season),
      );
  }

  // ============================================================
  // HISTORICAL H2H PAIRS
  // ============================================================

  private async getHistoricalPairs(): Promise<string[]> {
    const fixtures = await this.fixtureModel
      .find({
        completed: true,
        homeTeamId: {
          $exists: true,
          $ne: '',
        },
        awayTeamId: {
          $exists: true,
          $ne: '',
        },
      })
      .select({
        homeTeamId: 1,
        awayTeamId: 1,
      })
      .lean()
      .exec();

    const pairs = new Set<string>();

    for (const fixture of fixtures) {
      const homeId = fixture.homeTeamId?.trim();
      const awayId = fixture.awayTeamId?.trim();

      if (!homeId || !awayId || homeId === awayId) {
        continue;
      }

      const [teamAId, teamBId] = [homeId, awayId].sort((a, b) =>
        a.localeCompare(b, undefined, {
          numeric: true,
        }),
      );

      pairs.add(`${teamAId}:${teamBId}`);
    }

    return [...pairs];
  }
}
