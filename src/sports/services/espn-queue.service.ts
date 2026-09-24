import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnQueue, EspnQueueDocument } from '../schemas/espn-queue.schema';

import {
  EspnQueueJobType,
  EspnQueueStatus,
} from '../interfaces/espn-queue.interface';

import {
  SportsSyncStateStatus,
  SportsSyncUnitStatus,
} from '../schemas/sports-sync-state.schema';

import { SportsSyncStateService } from './sports-sync-state.service';

@Injectable()
export class EspnQueueService {
  private startupReady = false;
  private normalOperationsReady = false;

  constructor(
    @InjectModel(EspnQueue.name)
    private readonly queueModel: Model<EspnQueueDocument>,

    private readonly sportsSyncStateService: SportsSyncStateService,
  ) {}

  // ============================================================
  // STARTUP READINESS
  // ============================================================

  isStartupReady(): boolean {
    return this.startupReady;
  }

  markStartupReady(): void {
    this.startupReady = true;
  }

  isNormalOperationsReady(): boolean {
    return this.normalOperationsReady;
  }

  markNormalOperationsReady(): void {
    this.normalOperationsReady = true;
  }
  // ============================================================
  // ADD LEAGUE REFRESH
  // ============================================================

  async addLeagueRefreshJob(params: {
    leagueId: string;
    season?: number;
    priority: number;
    scheduledFor?: Date;
    triggerEventId?: string;
  }): Promise<EspnQueueDocument> {
    return this.addJob({
      jobType: EspnQueueJobType.LEAGUE_REFRESH,
      leagueId: params.leagueId,
      eventId: params.triggerEventId,
      season: params.season,
      priority: params.priority,
      scheduledFor: params.scheduledFor ?? new Date(),
    });
  }

  // ============================================================
  // ADD FIXTURE RECOVERY
  // ============================================================

  async addFixtureRecoveryJob(params: {
    leagueId: string;
    season: number;
    priority: number;
    scheduledFor?: Date;
  }): Promise<EspnQueueDocument> {
    return this.addJob({
      jobType: EspnQueueJobType.FIXTURE_RECOVERY,
      leagueId: params.leagueId,
      season: params.season,
      priority: params.priority,
      scheduledFor: params.scheduledFor ?? new Date(),
    });
  }

  // ============================================================
  // ADD UPCOMING MATCH
  // ============================================================

  async addUpcomingMatchJob(params: {
    leagueId: string;
    eventId: string;
    season: number;
    priority: number;
    scheduledFor: Date;
  }): Promise<EspnQueueDocument> {
    return this.addJob({
      jobType: EspnQueueJobType.UPCOMING_MATCH,
      leagueId: params.leagueId,
      eventId: params.eventId,
      season: params.season,
      priority: params.priority,
      scheduledFor: params.scheduledFor,
    });
  }

  // ============================================================
  // ADD FINISHED MATCH
  // ============================================================

  async addFinishedMatchJob(params: {
    leagueId: string;
    eventId: string;
    season: number;
    priority: number;
    scheduledFor: Date;
  }): Promise<EspnQueueDocument> {
    return this.addJob({
      jobType: EspnQueueJobType.FINISHED_MATCH,
      leagueId: params.leagueId,
      eventId: params.eventId,
      season: params.season,
      priority: params.priority,
      scheduledFor: params.scheduledFor,
    });
  }

  // ============================================================
  // GENERIC ADD
  // ============================================================

  async addJob(params: {
    jobType: EspnQueueJobType;
    leagueId: string;
    eventId?: string;
    season?: number;
    priority: number;
    scheduledFor: Date;
  }): Promise<EspnQueueDocument> {
    const leagueId = params.leagueId.trim().toLowerCase();

    const jobKey = this.buildJobKey(
      params.jobType,
      leagueId,
      params.eventId,
      params.season,
    );

    const trackingMode =
      params.jobType === EspnQueueJobType.FIXTURE_RECOVERY
        ? 'HISTORY'
        : 'WINDOW';

    /*
     * The synchronization state is authoritative.
     *
     * It must be ensured before deciding what to do with the
     * operational queue document.
     */
    const state = await this.sportsSyncStateService.ensureQueueState({
      jobType: params.jobType,
      leagueId,
      season: params.season,
      eventId: params.eventId,
      priority: params.priority,
      trackingMode,
      queueJobKey: jobKey,
    });

    const stateComplete = this.isTrackedStateComplete(state);

    let existing = await this.queueModel
      .findOne({
        jobKey,
      })
      .exec();

    /*
     * ----------------------------------------------------------
     * EXISTING QUEUE DOCUMENT
     * ----------------------------------------------------------
     */
    if (existing) {
      /*
       * If the persistent state is already completely successful,
       * the operational queue document should not run again.
       */
      if (stateComplete) {
        if (existing.status !== EspnQueueStatus.COMPLETED) {
          existing.status = EspnQueueStatus.COMPLETED;
          existing.completedAt = existing.completedAt ?? new Date();

          existing.startedAt = undefined;
          existing.failedAt = undefined;
          existing.nextAttemptAt = undefined;
          existing.lastError = undefined;

          existing = await existing.save();
        }

        return existing;
      }

      /*
       * COMPLETED queue document + incomplete persistent state
       * means the operational record is stale.
       *
       * Re-open it.
       */
      if (existing.status === EspnQueueStatus.COMPLETED) {
        return this.reopenJob(existing, params);
      }

      /*
       * Already being handled.
       */
      if (
        existing.status === EspnQueueStatus.PENDING ||
        existing.status === EspnQueueStatus.PROCESSING
      ) {
        return existing;
      }

      /*
       * FAILED jobs are operationally retryable while the
       * synchronization state still contains incomplete units.
       */
      return this.reopenJob(existing, params);
    }

    /*
     * ----------------------------------------------------------
     * CREATE NEW QUEUE DOCUMENT
     * ----------------------------------------------------------
     */
    try {
      return await this.queueModel.create({
        jobKey,

        type: params.jobType,

        leagueId,

        eventId: params.eventId,

        season: params.season,

        priority: params.priority,

        status: EspnQueueStatus.PENDING,

        attempts: 0,

        maxAttempts: 3,

        scheduledFor: params.scheduledFor,
      });
    } catch (error) {
      /*
       * A unique-index race can happen if two callers try to
       * create the same operational job simultaneously.
       */
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      existing = await this.queueModel
        .findOne({
          jobKey,
        })
        .exec();

      if (!existing) {
        throw error;
      }

      if (stateComplete) {
        if (existing.status !== EspnQueueStatus.COMPLETED) {
          existing.status = EspnQueueStatus.COMPLETED;
          existing.completedAt = existing.completedAt ?? new Date();

          existing.startedAt = undefined;
          existing.failedAt = undefined;
          existing.nextAttemptAt = undefined;
          existing.lastError = undefined;

          return existing.save();
        }

        return existing;
      }

      if (
        existing.status === EspnQueueStatus.PENDING ||
        existing.status === EspnQueueStatus.PROCESSING
      ) {
        return existing;
      }

      return this.reopenJob(existing, params);
    }
  }

  // ============================================================
  // GET NEXT JOB
  // ============================================================

  async getNextJob(params?: {
    jobTypes?: EspnQueueJobType[];
    includeFailed?: boolean;
  }): Promise<EspnQueueDocument | null> {
    const now = new Date();

    const includeFailed = params?.includeFailed === true;

    const statuses = includeFailed
      ? [EspnQueueStatus.PENDING, EspnQueueStatus.FAILED]
      : [EspnQueueStatus.PENDING];

    const query: Record<string, unknown> = {
      status:
        statuses.length === 1
          ? statuses[0]
          : {
              $in: statuses,
            },

      $or: [
        {
          status: EspnQueueStatus.PENDING,

          nextAttemptAt: {
            $exists: false,
          },

          scheduledFor: {
            $lte: now,
          },
        },

        {
          status: EspnQueueStatus.PENDING,

          nextAttemptAt: {
            $lte: now,
          },
        },

        ...(includeFailed
          ? [
              {
                status: EspnQueueStatus.FAILED,

                nextAttemptAt: {
                  $lte: now,
                },
              },
            ]
          : []),
      ],
    };

    if (params?.jobTypes && params.jobTypes.length > 0) {
      query.type = {
        $in: params.jobTypes,
      };
    }

    return this.queueModel
      .findOneAndUpdate(
        query,
        {
          $set: {
            status: EspnQueueStatus.PROCESSING,

            startedAt: now,
          },

          $inc: {
            attempts: 1,
          },

          $unset: {
            nextAttemptAt: 1,

            failedAt: 1,

            completedAt: 1,
          },
        },
        {
          sort: {
            priority: 1,
            scheduledFor: 1,
            createdAt: 1,
          },

          returnDocument: 'after',
        },
      )
      .exec();
  }

  // ============================================================
  // COMPLETE
  // ============================================================

  async markCompleted(jobId: string): Promise<void> {
    await this.queueModel.updateOne(
      {
        _id: jobId,
      },
      {
        $set: {
          status: EspnQueueStatus.COMPLETED,

          completedAt: new Date(),
        },

        $unset: {
          nextAttemptAt: 1,

          startedAt: 1,

          lastError: 1,
        },
      },
    );
  }

  // ============================================================
  // FAIL
  // ============================================================

  async markFailed(job: EspnQueueDocument, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    if (job.attempts < job.maxAttempts) {
      const retryDelayMs =
        Math.min(15, Math.pow(2, Math.max(job.attempts - 1, 0))) * 60_000;

      await this.queueModel.updateOne(
        {
          _id: job._id,
        },
        {
          $set: {
            status: EspnQueueStatus.FAILED,

            lastError: message,

            failedAt: new Date(),

            nextAttemptAt: new Date(Date.now() + retryDelayMs),
          },

          $unset: {
            startedAt: 1,

            completedAt: 1,
          },
        },
      );

      return;
    }

    await this.queueModel.updateOne(
      {
        _id: job._id,
      },
      {
        $set: {
          status: EspnQueueStatus.FAILED,

          lastError: message,

          failedAt: new Date(),

          completedAt: new Date(),
        },

        $unset: {
          nextAttemptAt: 1,

          startedAt: 1,
        },
      },
    );
  }

  // ============================================================
  // RECOVER STALE JOBS
  // ============================================================

  async recoverStaleJobs(staleMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000);

    const staleJobs = await this.queueModel
      .find({
        status: EspnQueueStatus.PROCESSING,

        startedAt: {
          $lte: cutoff,
        },
      })
      .exec();

    if (staleJobs.length === 0) {
      return 0;
    }

    const result = await this.queueModel.updateMany(
      {
        _id: {
          $in: staleJobs.map((job) => job._id),
        },
      },
      {
        $set: {
          status: EspnQueueStatus.PENDING,

          nextAttemptAt: new Date(),

          lastError: 'Recovered stale processing job',
        },

        $unset: {
          startedAt: 1,
        },
      },
    );

    for (const job of staleJobs) {
      const stateKey = this.sportsSyncStateService.getQueueStateKey({
        jobType: job.type,

        leagueId: job.leagueId,

        season: job.season,

        eventId: job.eventId,
      });

      try {
        await this.sportsSyncStateService.resetInterruptedUnits(stateKey);
      } catch {
        /*
         * The operational queue remains recoverable even if an
         * old synchronization-state record does not exist.
         */
      }
    }

    return result.modifiedCount;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  async cleanupCompletedJobs(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await this.queueModel.deleteMany({
      status: EspnQueueStatus.COMPLETED,

      completedAt: {
        $lte: cutoff,
      },
    });

    return result.deletedCount ?? 0;
  }

  // ============================================================
  // COUNTS
  // ============================================================

  async countPending(): Promise<number> {
    return this.queueModel.countDocuments({
      status: EspnQueueStatus.PENDING,
    });
  }

  async countProcessing(): Promise<number> {
    return this.queueModel.countDocuments({
      status: EspnQueueStatus.PROCESSING,
    });
  }

  async countFailed(): Promise<number> {
    return this.queueModel.countDocuments({
      status: EspnQueueStatus.FAILED,
    });
  }

  async countCompleted(): Promise<number> {
    return this.queueModel.countDocuments({
      status: EspnQueueStatus.COMPLETED,
    });
  }

  // ============================================================
  // INTERNAL JOB REOPEN
  // ============================================================

  private async reopenJob(
    job: EspnQueueDocument,
    params: {
      priority: number;
      scheduledFor: Date;
    },
  ): Promise<EspnQueueDocument> {
    job.status = EspnQueueStatus.PENDING;

    job.priority = params.priority;

    job.scheduledFor = params.scheduledFor;

    job.attempts = 0;

    job.startedAt = undefined;

    job.completedAt = undefined;

    job.failedAt = undefined;

    job.lastError = undefined;

    job.nextAttemptAt = undefined;

    return job.save();
  }

  private isTrackedStateComplete(state: {
    units: Array<{
      status: SportsSyncUnitStatus;
    }>;
  }): boolean {
    return (
      state.units.length > 0 &&
      state.units.every((unit) => unit.status === SportsSyncUnitStatus.SUCCESS)
    );
  }

  private isDuplicateKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const record = error as Record<string, unknown>;

    return record.code === 11000;
  }

  // ============================================================
  // JOB KEY
  // ============================================================

  private buildJobKey(
    jobType: EspnQueueJobType,
    leagueId: string,
    eventId?: string,
    season?: number,
  ): string {
    const league = leagueId.trim().toLowerCase();

    if (jobType === EspnQueueJobType.LEAGUE_REFRESH && eventId) {
      return [jobType, league, eventId.trim()].join(':');
    }

    if (eventId) {
      return [jobType, league, eventId.trim()].join(':');
    }

    return [jobType, league, season ?? 'current'].join(':');
  }
}
