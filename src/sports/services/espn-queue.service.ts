import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnQueue, EspnQueueDocument } from '../schemas/espn-queue.schema';

import {
  EspnQueueJobType,
  EspnQueueStatus,
} from '../interfaces/espn-queue.interface';

@Injectable()
export class EspnQueueService {
  constructor(
    @InjectModel(EspnQueue.name)
    private readonly queueModel: Model<EspnQueueDocument>,
  ) {}

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
    const jobKey = this.buildJobKey(
      params.jobType,
      params.leagueId,
      params.eventId,
      params.season,
    );

    const existing = await this.queueModel
      .findOne({
        jobKey,
      })
      .exec();

    if (existing) {
      /*
       * A completed job stays completed.
       *
       * This is important because:
       *
       * LEAGUE_REFRESH + triggerEventId
       *
       * represents one specific three-hour fixture trigger.
       *
       * It must not be recreated every five seconds.
       */
      if (existing.status === EspnQueueStatus.COMPLETED) {
        return existing;
      }

      if (
        existing.status === EspnQueueStatus.PENDING ||
        existing.status === EspnQueueStatus.PROCESSING
      ) {
        return existing;
      }

      /*
       * FAILED jobs can be re-queued by a future trigger.
       */
      existing.status = EspnQueueStatus.PENDING;
      existing.priority = params.priority;
      existing.scheduledFor = params.scheduledFor;
      existing.attempts = 0;
      existing.startedAt = undefined;
      existing.completedAt = undefined;
      existing.failedAt = undefined;
      existing.lastError = undefined;
      existing.nextAttemptAt = undefined;

      return existing.save();
    }

    return this.queueModel.create({
      jobKey,
      type: params.jobType,
      leagueId: params.leagueId,
      eventId: params.eventId,
      season: params.season,
      priority: params.priority,
      status: EspnQueueStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
      scheduledFor: params.scheduledFor,
    });
  }

  // ============================================================
  // GET NEXT JOB
  // ============================================================

  async getNextJob(): Promise<EspnQueueDocument | null> {
    const now = new Date();

    return this.queueModel
      .findOneAndUpdate(
        {
          status: EspnQueueStatus.PENDING,

          $or: [
            {
              nextAttemptAt: {
                $exists: false,
              },

              scheduledFor: {
                $lte: now,
              },
            },

            {
              nextAttemptAt: {
                $lte: now,
              },
            },
          ],
        },
        {
          $set: {
            status: EspnQueueStatus.PROCESSING,
            startedAt: now,
          },

          $inc: {
            attempts: 1,
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
            status: EspnQueueStatus.PENDING,
            nextAttemptAt: new Date(Date.now() + retryDelayMs),
            lastError: message,
          },

          $unset: {
            startedAt: 1,
            completedAt: 1,
            failedAt: 1,
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

    const result = await this.queueModel.updateMany(
      {
        status: EspnQueueStatus.PROCESSING,

        startedAt: {
          $lte: cutoff,
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

    return result.modifiedCount;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  async cleanupCompletedJobs(olderThanDays = 30): Promise<number> {
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
  // JOB KEY
  // ============================================================

  private buildJobKey(
    jobType: EspnQueueJobType,
    leagueId: string,
    eventId?: string,
    season?: number,
  ): string {
    const league = leagueId.trim().toLowerCase();

    /*
     * League refreshes are tied to the fixture that reached
     * the three-hour threshold.
     *
     * Example:
     *
     * LEAGUE_REFRESH:eng.1:401882868
     */
    if (jobType === EspnQueueJobType.LEAGUE_REFRESH && eventId) {
      return [jobType, league, eventId.trim()].join(':');
    }

    if (eventId) {
      return [jobType, league, eventId.trim()].join(':');
    }

    return [jobType, league, season ?? 'current'].join(':');
  }
}
