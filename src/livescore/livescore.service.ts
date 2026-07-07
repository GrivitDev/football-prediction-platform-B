import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { League } from './schemas/league.schema';

import { Fixture } from './schemas/fixture.schema';

import { Standing } from './schemas/standing.schema';

@Injectable()
export class LivescoreService {
  constructor(
    @InjectModel(League.name)
    private leagueModel: Model<League>,

    @InjectModel(Fixture.name)
    private fixtureModel: Model<Fixture>,

    @InjectModel(Standing.name)
    private standingModel: Model<Standing>,
  ) {}

  // LEAGUES

  async getLeagues() {
    return this.leagueModel.find().sort({
      name: 1,
    });
  }

  // COMPLETE PAGE

  async getLeaguePage(leagueCode: string) {
    const league = await this.leagueModel.findOne({
      code: leagueCode,
    });

    const [todayMatches, table, fixtures, results] = await Promise.all([
      this.getTodayMatches(leagueCode),

      this.getTable(leagueCode),

      this.getFixtures(leagueCode),

      this.getResults(leagueCode),
    ]);

    return {
      league,

      todayMatches,

      table,

      fixtures,

      results,
    };
  }

  // LIVE

  async getLiveMatches(leagueCode: string) {
    return this.fixtureModel.find({
      leagueCode,

      status: {
        $in: ['LIVE', 'IN_PLAY', 'PAUSED'],
      },
    });
  }

  // TABLE

  async getTable(leagueCode: string) {
    return this.standingModel
      .find({
        leagueCode,
      })
      .sort({
        position: 1,
      });
  }

  // UPCOMING

  async getFixtures(leagueCode: string) {
    return this.fixtureModel
      .find({
        leagueCode,

        status: 'SCHEDULED',
      })
      .sort({
        kickoffTimestamp: 1,
      });
  }

  // RESULTS

  async getResults(leagueCode: string) {
    return this.fixtureModel
      .find({
        leagueCode,

        status: 'FINISHED',
      })
      .sort({
        kickoffTimestamp: -1,
      });
  }

  // TODAY MATCHES

  async getTodayMatches(leagueCode: string) {
    const todayStart = new Date();

    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();

    todayEnd.setHours(23, 59, 59, 999);

    return this.fixtureModel
      .find({
        leagueCode,

        kickoffTimestamp: {
          $gte: todayStart.getTime(),

          $lte: todayEnd.getTime(),
        },
      })
      .sort({
        kickoffTimestamp: 1,
      });
  }
}
