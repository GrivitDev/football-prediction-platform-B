// src/sports/sports.service.ts

import { Injectable } from '@nestjs/common';

import { FootballDataService } from './football-data.service';

@Injectable()
export class SportsService {
  constructor(private readonly footballDataService: FootballDataService) {}

  getLeagues() {
    return this.footballDataService.getLeagues();
  }

  getFixtures(leagueCode: string) {
    return this.footballDataService.getFixturesByLeague(leagueCode);
  }

  getMatchDetails(matchId: string) {
    return this.footballDataService.getMatchDetails(matchId);
  }

  getFinishedMatches(leagueCode: string) {
    return this.footballDataService.getFinishedMatches(leagueCode);
  }

  getStandings(leagueCode: string) {
    return this.footballDataService.getStandings(leagueCode);
  }
}
