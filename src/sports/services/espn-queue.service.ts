import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnQueue, EspnQueueDocument } from '../schemas/espn-queue.schema';

import {
  EspnQueueJobType,
  EspnQueueStatus,
} from '../interfaces/espn-queue.interface';

import { SportsSyncUnitStatus } from '../schemas/sports-sync-state.schema';

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
  // ADD FIXTURE REFRESH
  // ============================================================

  /**
   * Creates a fixture-refresh job for an active ESPN league.
   *
   * A triggerEventId can identify why the refresh was requested:
   *
   *   DAILY:2026-09-26
   *   STALE:2026-09-26
   *   EVENT:401884783
   *
   * The trigger is used for operational deduplication and
   * persistent synchronization-state identity.
   */
  async addFixtureRefreshJob(params: {
    leagueId: string;
    season?: number;
    priority: number;
    scheduledFor?: Date;
    triggerEventId?: string;
  }): Promise<EspnQueueDocument> {
    return this.addJob({
      jobType: EspnQueueJobType.FIXTURE_REFRESH,

      leagueId: params.leagueId,

      season: params.season,

      priority: params.priority,

      scheduledFor: params.scheduledFor ?? new Date(),

      triggerEventId: params.triggerEventId,
    });
  }

  // ============================================================
  // ADD SUMMARY REFRESH
  // ============================================================

  /**
   * Creates a Summary-refresh job for one ESPN fixture.
   *
   * Summary is persisted inside:
   *
   *   sports_espn_fixtures.payload.summary
   *
   * Queue creation must therefore be preceded by a check that
   * the fixture does not already contain a Summary.
   */
  async addSummaryRefreshJob(params: {
    leagueId: string;
    eventId: string;
    season: number;
    priority: number;
    scheduledFor?: Date;
  }): Promise<EspnQueueDocument> {
    return this.addJob({
      jobType: EspnQueueJobType.SUMMARY_REFRESH,

      leagueId: params.leagueId,

      eventId: params.eventId,

      season: params.season,

      priority: params.priority,

      scheduledFor: params.scheduledFor ?? new Date(),
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
    triggerEventId?: string;
  }): Promise<EspnQueueDocument> {
    const leagueId = params.leagueId.trim().toLowerCase();

    if (!leagueId) {
      throw new Error('ESPN queue leagueId cannot be empty');
    }

    if (params.jobType === EspnQueueJobType.SUMMARY_REFRESH) {
      if (!params.eventId?.trim()) {
        throw new Error('SUMMARY_REFRESH jobs require an eventId');
      }

      if (typeof params.season !== 'number') {
        throw new Error('SUMMARY_REFRESH jobs require a numeric season');
      }
    }

    const jobKey = this.buildJobKey(
      params.jobType,
      leagueId,
      params.eventId,
      params.season,
      params.triggerEventId,
    );

    const trackingMode: 'WINDOW' | 'HISTORY' = 'WINDOW';

    /*
     * The synchronization state is authoritative.
     *
     * The worker remains responsible for marking individual
     * synchronization units successful after actual provider
     * collection completes.
     */
    const state = await this.sportsSyncStateService.ensureQueueState({
      jobType: params.jobType,

      leagueId,

      season: params.season,

      eventId: params.eventId,

      priority: params.priority,

      trackingMode,

      queueJobKey: jobKey,

      triggerEventId: params.triggerEventId,
    });

    const stateComplete = this.isTrackedStateComplete(state);

    let existing = await this.queueModel
      .findOne({
        jobKey,
      })
      .exec();

    // ==========================================================
    // EXISTING QUEUE DOCUMENT
    // ==========================================================

    if (existing) {
      /*
       * Persistent synchronization state already completed.
       *
       * The queue record should never execute the same completed
       * synchronization again.
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
       * A completed queue document with incomplete state means
       * the operational record is stale and must be reopened.
       */
      if (existing.status === EspnQueueStatus.COMPLETED) {
        return this.reopenJob(existing, params);
      }

      /*
       * Another worker is already processing this job.
       */
      if (
        existing.status === EspnQueueStatus.PENDING ||
        existing.status === EspnQueueStatus.PROCESSING
      ) {
        return existing;
      }

      /*
       * FAILED remains retryable while synchronization state is
       * still incomplete.
       */
      return this.reopenJob(existing, params);
    }

    // ==========================================================
    // CREATE NEW QUEUE DOCUMENT
    // ==========================================================

    try {
      return await this.queueModel.create({
        jobKey,

        type: params.jobType,

        leagueId,

        eventId: params.eventId,

        season: params.season,

        triggerEventId: params.triggerEventId,

        priority: params.priority,

        status: EspnQueueStatus.PENDING,

        attempts: 0,

        maxAttempts: 3,

        scheduledFor: params.scheduledFor,
      });
    } catch (error) {
      /*
       * Two builders/schedulers can legitimately race to create
       * the same job. The unique jobKey makes the queue itself
       * the final deduplication authority.
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

        triggerEventId: job.triggerEventId,

        queueJobKey: job.jobKey,
      });

      try {
        await this.sportsSyncStateService.resetInterruptedUnits(stateKey);
      } catch {
        /*
         * Queue recovery remains valid even when an older
         * synchronization-state record is unavailable.
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
    triggerEventId?: string,
  ): string {
    const league = leagueId.trim().toLowerCase();

    /*
     * Summary is always event-specific.
     *
     * This guarantees one logical Summary job per fixture.
     */
    if (jobType === EspnQueueJobType.SUMMARY_REFRESH) {
      if (!eventId?.trim()) {
        throw new Error('SUMMARY_REFRESH jobs require an eventId');
      }

      return [jobType, league, eventId.trim()].join(':');
    }

    /*
     * Fixture refreshes may legitimately be triggered
     * multiple times for the same league and season.
     *
     * The trigger differentiates:
     *
     *   DAILY:date
     *   STALE:date
     *   EVENT:eventId
     *
     * When no trigger is supplied, fall back to the
     * league + season identity.
     */
    if (triggerEventId?.trim()) {
      return [jobType, league, season ?? 'current', triggerEventId.trim()].join(
        ':',
      );
    }

    return [jobType, league, season ?? 'current'].join(':');
  }
}
