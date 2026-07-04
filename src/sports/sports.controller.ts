// src/sports/sports.controller.ts

import { Controller, Get, Param, Query } from '@nestjs/common';

import { SportsService } from './sports.service';

@Controller('sports')
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  // =========================================
  // LEAGUES
  // =========================================
  @Get('leagues')
  getLeagues() {
    return this.sportsService.getLeagues();
  }

  // =========================================
  // FIXTURES
  // =========================================
  @Get('fixtures')
  getFixtures(
    @Query('leagueCode')
    leagueCode: string,
  ) {
    return this.sportsService.getFixtures(leagueCode);
  }

  // =========================================
  // MATCH DETAILS
  // =========================================
  @Get('match/:matchId')
  getMatch(
    @Param('matchId')
    matchId: string,
  ) {
    return this.sportsService.getMatchDetails(matchId);
  }

  // =========================================
  // RESULTS
  // =========================================
  @Get('results')
  getResults(
    @Query('leagueCode')
    leagueCode: string,
  ) {
    return this.sportsService.getFinishedMatches(leagueCode);
  }

  // =========================================
  // STANDINGS
  // =========================================
  @Get('standings')
  getStandings(
    @Query('leagueCode')
    leagueCode: string,
  ) {
    return this.sportsService.getStandings(leagueCode);
  }
}
