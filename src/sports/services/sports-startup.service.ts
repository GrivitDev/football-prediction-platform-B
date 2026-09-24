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

@Injectable()
export class SportsStartupService implements OnModuleInit {
  private readonly logger = new Logger(SportsStartupService.name);

  private readonly threeHourWindowMs = 3 * 60 * 60 * 1000;

  private readonly startupFixtureForwardDays = 8;

  constructor(
    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly sportsDerivedDataBootstrapService: SportsDerivedDataBootstrapService,

    private readonly sportsSyncStateService: SportsSyncStateService,

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
    } catch (error) {
      this.logger.error(
        'ESPN league catalogue synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    try {
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
    } catch (error) {
      this.logger.error(
        'ESPN missing league-detail synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    let activeLeagues: Awaited<
      ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
    >;

    try {
      activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Inspecting persistent ESPN synchronization state for ` +
          `${activeLeagues.length} active leagues`,
      );
    } catch (error) {
      this.logger.error(
        'Unable to load active ESPN leagues for synchronization-state inspection',
        error instanceof Error ? error.stack : String(error),
      );

      return;
    }

    let recoveryQueued = 0;
    let recoveryComplete = 0;
    let recoveryIncomplete = 0;
    let summaryJobsQueued = 0;

    /*
     * ----------------------------------------------------------
     * FIXTURE RECOVERY SOURCE OF TRUTH
     * ----------------------------------------------------------
     */
    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      if (typeof league.season !== 'number') {
        this.logger.warn(
          `Skipping fixture recovery for ${league.leagueId}: missing season`,
        );

        continue;
      }

      if (!league.seasonStartDate) {
        this.logger.warn(
          `Skipping fixture recovery for ${league.leagueId}: missing seasonStartDate`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        continue;
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

      const complete = await this.sportsSyncStateService.isComplete(stateKey);

      if (complete) {
        recoveryComplete += 1;
      } else {
        recoveryIncomplete += 1;

        const job = await this.espnQueueService.addFixtureRecoveryJob({
          leagueId,

          season: league.season,

          priority,

          scheduledFor: new Date(),
        });

        if (
          String(job.status) === 'PENDING' &&
          Number(job.attempts ?? 0) === 0
        ) {
          recoveryQueued += 1;
        }
      }

      summaryJobsQueued += await this.queueMissingFinishedMatchSummaries({
        leagueId,

        season: league.season,

        priority,
      });
    }

    /*
     * ----------------------------------------------------------
     * RESTORE ALL OTHER INCOMPLETE PERSISTENT QUEUE STATES
     * ----------------------------------------------------------
     *
     * This is what protects FINISHED_MATCH and UPCOMING_MATCH
     * states after:
     *
     * - queue retries are exhausted
     * - the queue document becomes FAILED
     * - the queue document is deleted by seven-day cleanup
     * - the application restarts
     */
    try {
      const restored = await this.restoreIncompleteQueueStates();

      this.logger.log(
        `ESPN incomplete persistent queue-state restoration completed: ` +
          `states=${restored.states}, ` +
          `queued=${restored.queued}, ` +
          `skipped=${restored.skipped}`,
      );
    } catch (error) {
      this.logger.error(
        'ESPN incomplete persistent queue-state restoration failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    this.logger.log(
      `ESPN startup synchronization-state inspection completed: ` +
        `active=${activeLeagues.length}, ` +
        `recoveryIncomplete=${recoveryIncomplete}, ` +
        `recoveryComplete=${recoveryComplete}, ` +
        `recoveryQueued=${recoveryQueued}, ` +
        `summaryJobsQueued=${summaryJobsQueued}`,
    );

    try {
      await this.sportsDerivedDataBootstrapService.initialize();

      this.logger.log('Derived-data bootstrap/recovery completed');
    } catch (error) {
      this.logger.error(
        'Derived-data bootstrap/recovery failed',
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      const stats = await this.getQueueStats();

      this.logger.log(
        `ESPN queue state before worker release: ` +
          `pending=${stats.pending}, ` +
          `processing=${stats.processing}, ` +
          `completed=${stats.completed}, ` +
          `failed=${stats.failed}`,
      );
    } catch (error) {
      this.logger.warn(
        `Unable to read ESPN queue state at startup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.espnQueueService.markStartupReady();

    this.logger.log(
      'ESPN startup initialization finished. ' +
        'Persistent synchronization state is now the source of truth and queued work is released to the worker.',
    );
  }

  // ============================================================
  // PERSISTENT QUEUE RESTORATION
  // ============================================================

  private async restoreIncompleteQueueStates(): Promise<{
    states: number;
    queued: number;
    skipped: number;
  }> {
    const states = await this.sportsSyncStateService.getIncompleteQueueStates();

    let queued = 0;
    let skipped = 0;

    for (const state of states) {
      if (!state.leagueId) {
        skipped += 1;

        this.logger.warn(
          `Skipping incomplete synchronization state ${state.stateKey}: missing leagueId`,
        );

        continue;
      }

      try {
        let job: Awaited<ReturnType<EspnQueueService['addJob']>> | undefined;

        switch (state.jobType) {
          case EspnQueueJobType.FIXTURE_RECOVERY:
            if (typeof state.season !== 'number') {
              skipped += 1;
              continue;
            }

            job = await this.espnQueueService.addFixtureRecoveryJob({
              leagueId: state.leagueId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),
            });
            break;

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

          case EspnQueueJobType.FINISHED_MATCH:
            if (typeof state.season !== 'number' || !state.eventId) {
              skipped += 1;
              continue;
            }

            job = await this.espnQueueService.addFinishedMatchJob({
              leagueId: state.leagueId,

              eventId: state.eventId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),
            });
            break;

          default:
            skipped += 1;

            this.logger.warn(
              `Skipping unsupported persistent queue state ${state.stateKey}`,
            );

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
          `Failed to restore persistent queue state ${state.stateKey}: ${
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
  // FINISHED MATCH SUMMARY QUEUE
  // ============================================================

  private async queueMissingFinishedMatchSummaries(params: {
    leagueId: string;
    season: number;
    priority: number;
  }): Promise<number> {
    const cutoff = new Date(Date.now() - this.threeHourWindowMs);

    const fixtures = await this.espnFixtureModel
      .find({
        leagueId: params.leagueId,

        season: params.season,

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

    let queued = 0;

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        continue;
      }

      const job = await this.espnQueueService.addFinishedMatchJob({
        leagueId: params.leagueId,

        eventId: fixture.eventId,

        season: params.season,

        priority: params.priority,

        scheduledFor: new Date(),
      });

      if (String(job.status) === 'PENDING' && Number(job.attempts ?? 0) === 0) {
        queued += 1;
      }
    }

    return queued;
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
