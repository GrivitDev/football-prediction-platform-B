import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Standing } from './schemas/standing.schema';

import { League } from './schemas/league.schema';

import { LivescoreFootballService } from './livescore-football.service';

@Injectable()
export class LivescoreStandingService {
  private logger = new Logger(LivescoreStandingService.name);

  constructor(
    @InjectModel(Standing.name)
    private standingModel: Model<Standing>,

    @InjectModel(League.name)
    private leagueModel: Model<League>,

    private footballService: LivescoreFootballService,
  ) {}

  async syncStandings() {
    const leagues = await this.leagueModel.find({
      isTracked: true,
    });

    for (const league of leagues) {
      const table = await this.footballService.getStandings(league.code);

      /*
 Remove old table
*/
      await this.standingModel.deleteMany({
        leagueCode: league.code,
      });

      const standings = table.map((team: any) => ({
        leagueCode: league.code,

        position: team.position,

        teamId: team.team?.id,

        team: team.team?.name,

        shortName: team.team?.shortName,

        crest: team.team?.crest,

        played: team.playedGames,

        won: team.won,

        draw: team.draw,

        lost: team.lost,

        goalsFor: team.goalsFor,

        goalsAgainst: team.goalsAgainst,

        goalDifference: team.goalDifference,

        points: team.points,

        form: team.form,
      }));

      await this.standingModel.insertMany(standings);
    }

    this.logger.log('Standings updated');
  }
}
