import { Controller, Get, Param, Query } from '@nestjs/common';

import { SportsService } from './sports.service';

@Controller('sports')
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  // ============================================================
  // LEAGUES
  // ============================================================

  @Get('leagues')
  getLeagues() {
    return this.sportsService.getLeagues();
  }

  // ============================================================
  // LIVE MATCHES
  // ============================================================

  @Get('live')
  getLiveMatches() {
    return this.sportsService.getLiveMatches();
  }

  // ============================================================
  // FIXTURES
  // ============================================================

  @Get('fixtures')
  getFixtures(
    @Query('leagueCode')
    leagueCode: string,
  ) {
    return this.sportsService.getFixtures(leagueCode);
  }

  // ============================================================
  // MATCH DETAILS
  // ============================================================

  @Get('match/:matchId')
  getMatch(
    @Param('matchId')
    matchId: string,
  ) {
    return this.sportsService.getMatchDetails(matchId);
  }

  // ============================================================
  // RESULTS BY LEAGUE
  // ============================================================

  @Get('results')
  getResults(
    @Query('leagueCode')
    leagueCode: string,
  ) {
    return this.sportsService.getFinishedMatches(leagueCode);
  }

  // ============================================================
  // RESULTS BY MATCH IDS
  // ============================================================

  @Get('results/by-ids')
  getResultsByIds(
    @Query('matchIds')
    matchIds: string,
  ) {
    const ids = matchIds
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return this.sportsService.getFinishedMatchesByIds(ids);
  }

  // ============================================================
  // STANDINGS
  // ============================================================

  @Get('standings')
  getStandings(
    @Query('leagueCode')
    leagueCode: string,
  ) {
    return this.sportsService.getStandings(leagueCode);
  }
}
