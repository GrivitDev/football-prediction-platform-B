import { Injectable } from '@nestjs/common';

import { SportsDataReadService } from './services/sports-data-read.service';

@Injectable()
export class SportsService {
  constructor(private readonly sportsDataReadService: SportsDataReadService) {}

  async getLive() {
    return this.sportsDataReadService.getLiveFixtures();
  }

  async getFixtures(competitionId?: string) {
    return this.sportsDataReadService.getUpcomingFixtures(
      undefined,
      undefined,
      competitionId,
    );
  }

  async getResults(competitionId?: string) {
    return this.sportsDataReadService.getFinishedFixtures(
      undefined,
      undefined,
      competitionId,
    );
  }

  async getStandings(competitionId: string, season?: number) {
    return this.sportsDataReadService.getLeagueTable(competitionId, season);
  }

  async getCompetitions(options?: {
    activeOnly?: boolean;
    predictionEnabled?: boolean;
  }) {
    return this.sportsDataReadService.getCompetitions(options);
  }

  async getTeams(competitionId: string) {
    return this.sportsDataReadService.getTeams(competitionId);
  }

  async getActiveCompetitions() {
    return this.sportsDataReadService.getActiveCompetitions();
  }
}
