import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Fixture } from './schemas/fixture.schema';

import { LivescoreFootballService } from './livescore-football.service';
import { League } from './schemas/league.schema';

import { Standing } from './schemas/standing.schema';

@Injectable()
export class LivescoreLiveService {
  private logger = new Logger(LivescoreLiveService.name);

  constructor(
    @InjectModel(Fixture.name)
    private fixtureModel: Model<Fixture>,

    private footballService: LivescoreFootballService,

    @InjectModel(League.name)
    private leagueModel: Model<League>,

    @InjectModel(Standing.name)
    private standingModel: Model<Standing>,
  ) {}

  async updateLiveMatches() {
    const matches = await this.footballService.getLiveFixtures();

    for (const match of matches) {
      await this.fixtureModel.findOneAndUpdate(
        {
          fixtureId: String(match.id),
        },

        {
          status: match.status,

          homeScore: match.score?.fullTime?.home ?? null,

          awayScore: match.score?.fullTime?.away ?? null,
        },

        {
          upsert: true,
        },
      );
    }

    this.logger.log(`Updated ${matches.length} live matches`);
  }
}
