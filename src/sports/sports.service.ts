import { Injectable } from '@nestjs/common';

import { FootballDataService } from './football-data.service';

@Injectable()
export class SportsService {
  constructor(private readonly footballDataService: FootballDataService) {}

  // ============================================================
  // LEAGUES
  // ============================================================

  getLeagues() {
    return this.footballDataService.getLeagues();
  }

  // ============================================================
  // LIVE MATCHES
  // ============================================================

  getLiveMatches() {
    return this.footballDataService.getLiveMatches();
  }

  // ============================================================
  // FIXTURES
  // ============================================================

  getFixtures(leagueCode: string) {
    return this.footballDataService.getFixturesByLeague(leagueCode);
  }

  // ============================================================
  // MATCH DETAILS
  // ============================================================

  getMatchDetails(matchId: string) {
    return this.footballDataService.getMatchDetails(matchId);
  }

  // ============================================================
  // RESULTS
  // ============================================================

  getFinishedMatches(leagueCode: string) {
    return this.footballDataService.getFinishedMatches(leagueCode);
  }

  // ============================================================
  // STANDINGS
  // ============================================================

  getStandings(leagueCode: string) {
    return this.footballDataService.getStandings(leagueCode);
  }
}
