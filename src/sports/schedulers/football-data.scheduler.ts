import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { FOOTBALL_DATA_COVERAGE } from '../config/football-data-coverage.config';

import { FootballDataService } from '../providers/football-data.service';

import { SportsCollectionService } from '../services/sports-collection.service';

@Injectable()
export class FootballDataScheduler {
  private readonly logger = new Logger(FootballDataScheduler.name);

  private dailyRunning = false;

  constructor(
    private readonly footballDataService: FootballDataService,

    private readonly sportsCollectionService: SportsCollectionService,
  ) {}

  /**
   * Football-Data remains scheduler-driven.
   *
   * ESPN does not use this scheduler.
   */
  @Cron('0 0 1 * * *', {
    name: 'football-data-daily-sync',
    timeZone: 'Africa/Lagos',
  })
  async syncDaily(): Promise<void> {
    if (this.dailyRunning) {
      return;
    }

    this.dailyRunning = true;

    try {
      const available = await this.footballDataService.getCompetitions();

      const providerCompetitions = available.competitions ?? [];

      const coverageByCode = new Map(
        FOOTBALL_DATA_COVERAGE.map((coverage) => [
          coverage.code.trim().toUpperCase(),
          coverage,
        ]),
      );

      const supported = providerCompetitions.filter((competition) => {
        const code = competition.code?.trim().toUpperCase();

        return Boolean(code && coverageByCode.has(code));
      });

      for (const competition of supported) {
        await this.sportsCollectionService.collectFootballDataCompetition(
          competition,
        );
      }

      const codes = supported
        .map((competition) => competition.code?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code));

      if (codes.length > 0) {
        await this.syncCurrentMatches(codes);
      }

      for (const competition of supported) {
        const code = competition.code?.trim().toUpperCase();

        if (!code || typeof competition.id !== 'number') {
          continue;
        }

        const standingsResponse = await this.footballDataService.getStandings(
          String(competition.id),
        );

        /*
         * getStandings() returns a response wrapper.
         *
         * The collection layer consumes the actual
         * standing tables, not the wrapper itself.
         */
        await this.sportsCollectionService.collectFootballDataStandings(
          standingsResponse.standings ?? [],
          competition,
          competition.id,
        );

        const teamsResponse = await this.footballDataService.getTeams(code);

        await this.sportsCollectionService.collectFootballDataTeams(
          teamsResponse.teams ?? [],
          competition.id,
          code,
        );
      }

      this.logger.log(
        `Football-Data daily synchronization completed: ` +
          `${providerCompetitions.length} provider competitions, ` +
          `${supported.length} supported competitions`,
      );
    } catch (error) {
      this.logger.error(
        'Football-Data daily synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.dailyRunning = false;
    }
  }

  private async syncCurrentMatches(competitionCodes: string[]): Promise<void> {
    const today = this.formatDate(new Date());

    const tomorrow = this.formatDate(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    const response = await this.footballDataService.getMatches({
      competitions: competitionCodes.join(','),
      dateFrom: today,
      dateTo: tomorrow,
    });

    await this.sportsCollectionService.collectFootballDataMatches(
      response.matches ?? [],
    );
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
