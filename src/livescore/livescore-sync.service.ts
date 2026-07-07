import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Fixture } from './schemas/fixture.schema';

import { League } from './schemas/league.schema';

import { LivescoreFootballService } from './livescore-football.service';

@Injectable()
export class LivescoreSyncService {
  private logger = new Logger(LivescoreSyncService.name);

  constructor(
    @InjectModel(Fixture.name)
    private fixtureModel: Model<Fixture>,

    @InjectModel(League.name)
    private leagueModel: Model<League>,

    private footballService: LivescoreFootballService,
  ) {}

  async syncFixtures() {
    const leagues = await this.leagueModel.find({
      isTracked: true,
    });

    for (const league of leagues) {
      const matches = await this.footballService.getFixtures(league.code);

      for (const match of matches) {
        await this.fixtureModel.findOneAndUpdate(
          {
            fixtureId: String(match.id),
          },

          {
            fixtureId: String(match.id),

            leagueCode: league.code,

            leagueName: league.name,

            homeTeam: match.homeTeam.name,

            awayTeam: match.awayTeam.name,

            homeTeamBadge: match.homeTeam.crest,

            awayTeamBadge: match.awayTeam.crest,

            date: match.utcDate,

            kickoffTimestamp: new Date(match.utcDate).getTime(),

            status: match.status,

            homeScore: match.score?.fullTime?.home,

            awayScore: match.score?.fullTime?.away,

            matchday: match.matchday,
          },

          {
            upsert: true,
          },
        );
      }
    }

    this.logger.log('Fixture sync completed');
  }
}
