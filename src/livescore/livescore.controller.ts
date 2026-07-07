import { Controller, Get, Param, Query } from '@nestjs/common';

import { LivescoreService } from './livescore.service';

@Controller('livescore')
export class LivescoreController {
  constructor(private readonly livescoreService: LivescoreService) {}

  // ALL LEAGUES

  @Get('leagues')
  getLeagues() {
    return this.livescoreService.getLeagues();
  }

  // COMPLETE LEAGUE PAGE

  @Get(':leagueCode')
  getLeaguePage(
    @Param('leagueCode')
    leagueCode: string,
  ) {
    return this.livescoreService.getLeaguePage(leagueCode);
  }

  // LIVE MATCHES

  @Get(':leagueCode/live')
  getLiveMatches(
    @Param('leagueCode')
    leagueCode: string,
  ) {
    return this.livescoreService.getLiveMatches(leagueCode);
  }

  // TABLE

  @Get(':leagueCode/table')
  getTable(
    @Param('leagueCode')
    leagueCode: string,
  ) {
    return this.livescoreService.getTable(leagueCode);
  }

  // RESULTS

  @Get(':leagueCode/results')
  getResults(
    @Param('leagueCode')
    leagueCode: string,
  ) {
    return this.livescoreService.getResults(leagueCode);
  }

  // FIXTURES

  @Get(':leagueCode/fixtures')
  getFixtures(
    @Param('leagueCode')
    leagueCode: string,
  ) {
    return this.livescoreService.getFixtures(leagueCode);
  }
}
