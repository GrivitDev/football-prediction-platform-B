import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueService } from './espn-queue.service';
import { SportsDerivedDataBootstrapService } from './sports-derived-data-bootstrap.service';
import { SportsSyncStateService } from './sports-sync-state.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { CompetitionPriority } from '../enums/competition-priority.enum';
import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

import { EspnService } from '../providers/espn.service';

import { SportsCollectionService } from './sports-collection.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
import { EspnQueueWorkerService } from './espn-queue-worker.service';

import { YoutubeHighlightService } from './youtube-highlight.service';
import { HeadToHeadService } from './head-to-head.service';
import { MatchDerivedDataService } from './match-derived-data.service';
import { TeamCompetitionStatsService } from './team-competition-stats.service';
import { TeamPerformanceProfileService } from './team-performance-profile.service';

@Injectable()
export class SportsStartupService implements OnModuleInit {
  private readonly logger = new Logger(SportsStartupService.name);

  private readonly threeHourWindowMs = 3 * 60 * 60 * 1000;

  private readonly startupFixtureForwardDays = 8;

  constructor(
    private readonly espnService: EspnService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly espnQueueWorkerService: EspnQueueWorkerService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly sportsDerivedDataBootstrapService: SportsDerivedDataBootstrapService,

    private readonly sportsSyncStateService: SportsSyncStateService,

    private readonly youtubeHighlightService: YoutubeHighlightService,

    private readonly headToHeadService: HeadToHeadService,

    private readonly matchDerivedDataService: MatchDerivedDataService,

    private readonly teamCompetitionStatsService: TeamCompetitionStatsService,

    private readonly teamPerformanceProfileService: TeamPerformanceProfileService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  onModuleInit(): void {
    this.logger.log('Starting ESPN background initialization');

    setTimeout(() => {
      void this.initializeEspn();
    }, 0);
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  private async initializeEspn(): Promise<void> {
    try {
      const leagues =
        await this.espnActiveCompetitionService.synchronizeLeagueCatalogue();

      this.logger.log(
        `ESPN league catalogue synchronized: ${leagues.length} leagues`,
      );

      const detailResult =
        await this.espnActiveCompetitionService.synchronizeMissingLeagueDetails();

      this.logger.log(
        `ESPN missing league-detail synchronization completed: ` +
          `processed=${detailResult.processed}, ` +
          `synchronized=${detailResult.synchronized}, ` +
          `active=${detailResult.active}, ` +
          `inactive=${detailResult.inactive}, ` +
          `skipped=${detailResult.skipped}, ` +
          `failed=${detailResult.failed}`,
      );

      const activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Starting direct ESPN bootstrap for ${activeLeagues.length} active leagues`,
      );

      let failedLeagues = 0;

      for (const league of activeLeagues) {
        if (!league.isActive) {
          continue;
        }

        try {
          await this.bootstrapLeague(league);
        } catch (error) {
          failedLeagues += 1;

          this.logger.error(
            `ESPN bootstrap failed for ${league.slug || league.leagueId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      if (failedLeagues > 0) {
        throw new Error(
          `ESPN startup bootstrap is incomplete. Failed leagues=${failedLeagues}`,
        );
      }

      await this.sportsDerivedDataBootstrapService.initialize();

      this.logger.log('ESPN derived-data bootstrap/recovery completed');

      const incompleteRecoveryStates =
        await this.sportsSyncStateService.getIncompleteQueueStates([
          EspnQueueJobType.FIXTURE_RECOVERY,
        ]);

      if (incompleteRecoveryStates.length > 0) {
        throw new Error(
          `ESPN startup bootstrap is still incomplete. ` +
            `Incomplete fixture-recovery states=${incompleteRecoveryStates.length}`,
        );
      }

      const incompleteFinishedStates =
        await this.sportsSyncStateService.getIncompleteQueueStates([
          EspnQueueJobType.FINISHED_MATCH,
        ]);

      if (incompleteFinishedStates.length > 0) {
        throw new Error(
          `ESPN startup bootstrap is still incomplete. ` +
            `Incomplete finished-match states=${incompleteFinishedStates.length}`,
        );
      }

      /*
       * ----------------------------------------------------------
       * ONLY NOW may normal operational queue documents exist.
       * ----------------------------------------------------------
       */

      const restored = await this.restoreNormalOperationsQueueStates();

      this.logger.log(
        `ESPN normal queue-state restoration completed: ` +
          `states=${restored.states}, ` +
          `queued=${restored.queued}, ` +
          `skipped=${restored.skipped}`,
      );

      const initialQueue =
        await this.espnQueueBuilderService.buildDailyLeagueRefreshQueue();

      this.logger.log(
        `Initial normal ESPN league-refresh queue created: ` +
          `active=${initialQueue.active}, ` +
          `queued=${initialQueue.queued}, ` +
          `skipped=${initialQueue.skipped}`,
      );

      /*
       * ----------------------------------------------------------
       * FINAL RELEASE
       * ----------------------------------------------------------
       */

      this.espnQueueService.markStartupReady();

      this.espnQueueService.markNormalOperationsReady();

      this.logger.log(
        'ESPN startup bootstrap is completely finished. ' +
          'Normal operations are now released.',
      );

      this.espnQueueWorkerService.start();
    } catch (error) {
      this.logger.error(
        'ESPN startup bootstrap failed. Sports synchronization remains locked.',
        error instanceof Error ? error.stack : String(error),
      );

      /*
       * Do not call:
       *
       * markStartupReady()
       * markNormalOperationsReady()
       * espnQueueWorkerService.start()
       *
       * The sports subsystem remains locked until startup succeeds.
       */
    }
  }

  private async bootstrapLeague(
    league: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >[number],
  ): Promise<void> {
    if (typeof league.season !== 'number') {
      throw new Error(`Active league ${league.leagueId} has no valid season`);
    }

    if (!league.seasonStartDate) {
      throw new Error(
        `Active league ${league.leagueId} has no seasonStartDate`,
      );
    }

    const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

    if (!leagueId) {
      throw new Error('Active league has no valid ESPN league ID');
    }

    const priority = this.getQueuePriority(league.priority);

    const stateKey = this.sportsSyncStateService.getQueueStateKey({
      jobType: EspnQueueJobType.FIXTURE_RECOVERY,

      leagueId,

      season: league.season,
    });

    await this.sportsSyncStateService.ensureQueueState({
      jobType: EspnQueueJobType.FIXTURE_RECOVERY,

      leagueId,

      season: league.season,

      priority,

      trackingMode: 'HISTORY',
    });

    await this.sportsSyncStateService.ensureDateWindow({
      stateKey,

      dateFrom: this.toDateOnly(new Date(league.seasonStartDate)),

      dateTo: this.toDateOnly(
        this.addUtcDays(
          this.startOfUtcDay(new Date()),
          this.startupFixtureForwardDays,
        ),
      ),

      trackingMode: 'HISTORY',
    });

    await this.sportsSyncStateService.ensureStepUnits(stateKey, [
      'standings',
      'finishedMatches',
    ]);

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    const incompleteDates =
      await this.sportsSyncStateService.getIncompleteDates(stateKey);

    const failures: string[] = [];

    this.logger.log(
      `Starting fixture recovery for ${leagueId}: ` +
        `remainingDates=${incompleteDates.length}`,
    );

    for (const dateKey of incompleteDates) {
      try {
        await this.processFixtureDate(stateKey, leagueId, dateKey);
      } catch (error) {
        failures.push(
          `${dateKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Fixture recovery failed for ${leagueId}: ${failures.join('; ')}`,
      );
    }

    await this.runTrackedStep(stateKey, 'standings', async () => {
      const response = await this.espnService.getStandings(leagueId);

      await this.sportsCollectionService.collectEspnStandings(
        leagueId,
        response,
        league.season,
      );
    });

    await this.runTrackedStep(stateKey, 'finishedMatches', async () => {
      await this.processFinishedMatchesForLeague(
        leagueId,
        league.season!,
        priority,
      );
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);

    const complete = await this.sportsSyncStateService.isComplete(stateKey);

    if (!complete) {
      throw new Error(`Fixture recovery state ${stateKey} is not complete`);
    }

    this.logger.log(`ESPN bootstrap completed for ${leagueId}`);
  }

  private async processFixtureDate(
    stateKey: string,
    leagueId: string,
    dateKey: string,
  ): Promise<void> {
    await this.sportsSyncStateService.markDateProcessing(stateKey, dateKey);

    try {
      const response = await this.espnService.getFixturesForDate(
        leagueId,
        dateKey,
      );

      await this.sportsCollectionService.collectEspnFixtures(
        leagueId,
        response,
      );

      await this.sportsSyncStateService.markDateSuccess(stateKey, dateKey);

      this.logger.debug(
        `ESPN fixture recovery completed: ${leagueId} ${dateKey}`,
      );
    } catch (error) {
      await this.sportsSyncStateService.markDateFailed(
        stateKey,
        dateKey,
        error,
      );

      throw error;
    }
  }

  private async processFinishedMatchesForLeague(
    leagueId: string,
    season: number,
    priority: number,
  ): Promise<void> {
    const cutoff = new Date(Date.now() - this.threeHourWindowMs);

    const fixtures = await this.espnFixtureModel
      .find({
        leagueId,

        season,

        completed: true,

        fixtureDate: {
          $lte: cutoff,
        },

        $or: [
          {
            'payload.summary': {
              $exists: false,
            },
          },
          {
            'payload.summary': null,
          },
        ],
      })
      .select({
        eventId: 1,
        fixtureDate: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    const eventIds = new Set<string>();

    for (const fixture of fixtures) {
      if (fixture.eventId) {
        eventIds.add(String(fixture.eventId));
      }
    }

    /*
     * Resume any FINISHED_MATCH states that were already started
     * during a previous application run.
     */
    const incompleteFinishedStates =
      await this.sportsSyncStateService.getIncompleteQueueStates([
        EspnQueueJobType.FINISHED_MATCH,
      ]);

    for (const state of incompleteFinishedStates) {
      if (
        state.leagueId === leagueId &&
        state.season === season &&
        state.eventId
      ) {
        eventIds.add(String(state.eventId));
      }
    }

    const failures: string[] = [];

    for (const eventId of eventIds) {
      try {
        await this.processFinishedMatchBootstrap(
          leagueId,
          season,
          eventId,
          priority,
        );
      } catch (error) {
        failures.push(
          `${eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Finished-match bootstrap failed for ${leagueId}: ${failures.join(
          '; ',
        )}`,
      );
    }

    this.logger.log(
      `Finished-match bootstrap completed for ${leagueId}: ` +
        `matches=${eventIds.size}`,
    );
  }

  private async processFinishedMatchBootstrap(
    leagueId: string,
    season: number,
    eventId: string,
    priority: number,
  ): Promise<void> {
    const stateKey = this.sportsSyncStateService.getQueueStateKey({
      jobType: EspnQueueJobType.FINISHED_MATCH,

      leagueId,

      season,

      eventId,
    });

    await this.sportsSyncStateService.ensureQueueState({
      jobType: EspnQueueJobType.FINISHED_MATCH,

      leagueId,

      season,

      eventId,

      priority,

      trackingMode: 'WINDOW',
    });

    await this.sportsSyncStateService.ensureStepUnits(stateKey, [
      'summary',
      'standings',
      'teamCompetitionStats',
      'teamPerformanceProfile',
      'headToHead',
      'derivedData',
      'youtube',
    ]);

    await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

    const fixture = await this.espnFixtureModel
      .findOne({
        eventId,
      })
      .lean()
      .exec();

    if (!fixture) {
      throw new Error(`Finished match fixture ${eventId} not found`);
    }

    const homeTeamId = fixture.homeTeamId?.trim();

    const awayTeamId = fixture.awayTeamId?.trim();

    if (!homeTeamId || !awayTeamId) {
      throw new Error(
        `Finished match fixture ${eventId} is missing homeTeamId or awayTeamId`,
      );
    }

    await this.runTrackedStep(stateKey, 'summary', async () => {
      if (fixture.payload?.summary) {
        return;
      }

      const summary = await this.espnService.getMatchSummary(leagueId, eventId);

      await this.sportsCollectionService.collectEspnMatchSummary({
        leagueId,

        eventId,

        summary,
      });
    });

    await this.runTrackedStep(stateKey, 'standings', async () => {
      const standingsResponse = await this.espnService.getStandings(leagueId);

      await this.sportsCollectionService.collectEspnStandings(
        leagueId,
        standingsResponse,
        season,
      );
    });

    await this.runTrackedStep(stateKey, 'teamCompetitionStats', async () => {
      await this.teamCompetitionStatsService.refreshForFixture(
        leagueId,
        season,
        eventId,
      );
    });

    await this.runTrackedStep(stateKey, 'teamPerformanceProfile', async () => {
      await this.teamPerformanceProfileService.refreshForFixture(eventId);
    });

    await this.runTrackedStep(stateKey, 'headToHead', async () => {
      await this.headToHeadService.refreshForFixture(eventId);
    });

    await this.runTrackedStep(stateKey, 'derivedData', async () => {
      await this.matchDerivedDataService.rebuildUpcomingForTeams(
        leagueId,
        season,
        [homeTeamId, awayTeamId],
      );
    });

    await this.runTrackedStep(stateKey, 'youtube', async () => {
      await this.youtubeHighlightService.processFixture(eventId);
    });

    await this.sportsSyncStateService.refreshOverallStatus(stateKey);

    const complete = await this.sportsSyncStateService.isComplete(stateKey);

    if (!complete) {
      throw new Error(
        `Finished-match synchronization state ${stateKey} is not complete`,
      );
    }
  }

  private async runTrackedStep(
    stateKey: string,
    stepKey: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const successful = await this.sportsSyncStateService.isUnitSuccessful(
      stateKey,
      `STEP:${stepKey}`,
    );

    if (successful) {
      return;
    }

    await this.sportsSyncStateService.markStepProcessing(stateKey, stepKey);

    try {
      await action();

      await this.sportsSyncStateService.markStepSuccess(stateKey, stepKey);
    } catch (error) {
      await this.sportsSyncStateService.markStepFailed(
        stateKey,
        stepKey,
        error,
      );

      throw error;
    }
  }

  // ============================================================
  // PERSISTENT QUEUE RESTORATION
  // ============================================================

  private async restoreNormalOperationsQueueStates(): Promise<{
    states: number;
    queued: number;
    skipped: number;
  }> {
    const states = await this.sportsSyncStateService.getIncompleteQueueStates([
      EspnQueueJobType.LEAGUE_REFRESH,
      EspnQueueJobType.UPCOMING_MATCH,
    ]);

    let queued = 0;

    let skipped = 0;

    for (const state of states) {
      if (!state.leagueId) {
        skipped += 1;

        continue;
      }

      try {
        let job: Awaited<ReturnType<EspnQueueService['addJob']>> | undefined;

        switch (state.jobType) {
          case EspnQueueJobType.LEAGUE_REFRESH:
            job = await this.espnQueueService.addLeagueRefreshJob({
              leagueId: state.leagueId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),

              triggerEventId: state.eventId,
            });
            break;

          case EspnQueueJobType.UPCOMING_MATCH:
            if (typeof state.season !== 'number' || !state.eventId) {
              skipped += 1;

              continue;
            }

            job = await this.espnQueueService.addUpcomingMatchJob({
              leagueId: state.leagueId,

              eventId: state.eventId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),
            });
            break;

          default:
            skipped += 1;

            continue;
        }

        if (
          String(job.status) === 'PENDING' &&
          Number(job.attempts ?? 0) === 0
        ) {
          queued += 1;
        }
      } catch (error) {
        skipped += 1;

        this.logger.error(
          `Failed to restore normal synchronization state ${state.stateKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      states: states.length,

      queued,

      skipped,
    };
  }

  // ============================================================
  // PRIORITY
  // ============================================================

  private getQueuePriority(priority: CompetitionPriority | undefined): number {
    switch (priority) {
      case CompetitionPriority.ELITE:
        return 1;

      case CompetitionPriority.HIGH:
        return 2;

      case CompetitionPriority.REGIONAL:
        return 3;

      case CompetitionPriority.SELECTIVE:
      default:
        return 4;
    }
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // ============================================================
  // QUEUE STATE
  // ============================================================

  private async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return {
      pending: await this.espnQueueService.countPending(),

      processing: await this.espnQueueService.countProcessing(),

      completed: await this.espnQueueService.countCompleted(),

      failed: await this.espnQueueService.countFailed(),
    };
  }
}
