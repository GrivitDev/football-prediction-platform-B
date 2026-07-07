import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { League } from './schemas/league.schema';

import { LivescoreFootballService } from './livescore-football.service';
import { LivescoreSyncService } from './livescore-sync.service';
import { LivescoreLiveService } from './livescore-live.service';
import { LivescoreStandingService } from './livescore-standing.service';

@Injectable()
export class LivescoreCron {
  private readonly logger = new Logger(LivescoreCron.name);

  constructor(
    private readonly footballService: LivescoreFootballService,

    private readonly syncService: LivescoreSyncService,

    private readonly liveService: LivescoreLiveService,

    private readonly standingService: LivescoreStandingService,

    @InjectModel(League.name)
    private readonly leagueModel: Model<League>,
  ) {}

  // =========================================
  // SYNC AVAILABLE LEAGUES
  // Every Sunday midnight
  // =========================================

  @Cron('0 0 * * 0')
  async syncLeagues() {
    this.logger.log('Syncing leagues...');

    const leagues = await this.footballService.getLeagues();

    for (const league of leagues) {
      await this.leagueModel.findOneAndUpdate(
        {
          code: league.code,
        },

        {
          code: league.code,

          name: league.name,

          country: league.area?.name || 'Unknown',

          emblem: league.emblem,
        },

        {
          upsert: true,
        },
      );
    }

    this.logger.log(`Leagues synced: ${leagues.length}`);
  }

  // =========================================
  // FIXTURES
  // Every midnight
  // =========================================

  @Cron('0 0 * * *')
  async syncFixtures() {
    this.logger.log('Syncing fixtures...');

    try {
      await this.syncService.syncFixtures();

      this.logger.log('Fixtures updated successfully');
    } catch (error) {
      this.logger.error('Fixture sync failed', error);
    }
  }

  // =========================================
  // LIVE SCORES
  // Every 5 minutes
  // =========================================

  @Cron('*/5 * * * *')
  async updateLiveScores() {
    this.logger.log('Updating live scores...');

    try {
      await this.liveService.updateLiveMatches();

      this.logger.log('Live scores updated');
    } catch (error) {
      this.logger.error('Live update failed', error);
    }
  }

  // =========================================
  // STANDINGS
  // Every day 6AM
  // =========================================

  @Cron('0 6 * * *')
  async updateStandings() {
    this.logger.log('Updating standings...');

    try {
      await this.standingService.syncStandings();

      this.logger.log('Standings updated');
    } catch (error) {
      this.logger.error('Standings update failed', error);
    }
  }
}
