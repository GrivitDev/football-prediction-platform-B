import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { LivescoreController } from './livescore.controller';
import { LivescoreService } from './livescore.service';
import { LivescoreCron } from './livescore.cron';

import { League, LeagueSchema } from './schemas/league.schema';

import { Fixture, FixtureSchema } from './schemas/fixture.schema';

import { Standing, StandingSchema } from './schemas/standing.schema';
import { LivescoreFootballService } from './livescore-football.service';
import { LeagueSeedService } from './seeds/league.seed';
import { LivescoreSyncService } from './livescore-sync.service';
import { LivescoreLiveService } from './livescore-live.service';
import { LivescoreStandingService } from './livescore-standing.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: League.name,
        schema: LeagueSchema,
      },

      {
        name: Fixture.name,
        schema: FixtureSchema,
      },

      {
        name: Standing.name,
        schema: StandingSchema,
      },
    ]),
  ],

  controllers: [LivescoreController],

  providers: [
    LivescoreService,
    LivescoreCron,
    LivescoreFootballService,
    LeagueSeedService,
    LivescoreSyncService,
    LivescoreLiveService,
    LivescoreStandingService,
  ],

  exports: [LivescoreService],
})
export class LivescoreModule {}
