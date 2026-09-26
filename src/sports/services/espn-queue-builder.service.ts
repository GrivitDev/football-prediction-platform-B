// backend/src/sports/services/espn-queue-builder.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { CompetitionPriority } from '../enums/competition-priority.enum';

import { EspnQueueService } from './espn-queue.service';
import { EspnActiveCompetitionService } from './espn-active-competition.service';

@Injectable()
export class EspnQueueBuilderService {
  private readonly logger = new Logger(EspnQueueBuilderService.name);

  private readonly upcomingWindowDays = 4;
  private readonly fixtureRefreshForwardDays = 8;
  private readonly staleFixtureRefreshHours = 48;
  private readonly recentFinishedWindowHours = 48;

  constructor(
    private readonly espnQueueService: EspnQueueService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  // ============================================================
  // DAILY FIXTURE REFRESH
  // ============================================================

  /**
   * Creates one FIXTURE_REFRESH job per active league for the
   * current Lagos calendar day.
   *
   * The trigger is date-specific so today's rolling fixture
   * window can be refreshed again on the next calendar day.
   */
  async buildDailyLeagueRefreshQueue(): Promise<{
    active: number;
    queued: number;
    skipped: number;
  }> {
    const activeLeagues =
      await this.espnActiveCompetitionService.getActiveLeagues();

    const triggerEventId = `DAILY:${this.getLagosDateKey()}`;

    let active = 0;
    let queued = 0;
    let skipped = 0;

    for (const league of activeLeagues) {
      if (!league.isActive) {
        skipped += 1;
        continue;
      }

      if (typeof league.season !== 'number') {
        skipped += 1;

        this.logger.warn(
          `Skipping daily fixture refresh for ${league.leagueId}: missing season`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        skipped += 1;
        continue;
      }

      active += 1;

      const priority = this.getQueuePriority(league.priority);

      const job = await this.espnQueueService.addFixtureRefreshJob({
        leagueId,
        season: league.season,
        priority,
        scheduledFor: new Date(),
        triggerEventId,
      });

      if (this.isFreshPendingJob(job)) {
        queued += 1;
      }
    }

    return {
      active,
      queued,
      skipped,
    };
  }

  // ============================================================
  // STALE ACTIVE LEAGUES
  // ============================================================

  /**
   * Ensures an active league receives a fixture refresh when its
   * most recent persisted fixture collection is older than the
   * configured 48-hour threshold.
   *
   * This is a recovery/safety mechanism in addition to the
   * normal daily rolling refresh.
   */
  async buildStaleFixtureRefreshQueue(): Promise<{
    checked: number;
    stale: number;
    queued: number;
    skipped: number;
  }> {
    const activeLeagues =
      await this.espnActiveCompetitionService.getActiveLeagues();

    const cutoff = new Date(
      Date.now() - this.staleFixtureRefreshHours * 60 * 60 * 1000,
    );

    let checked = 0;
    let stale = 0;
    let queued = 0;
    let skipped = 0;

    for (const league of activeLeagues) {
      if (!league.isActive) {
        skipped += 1;
        continue;
      }

      if (typeof league.season !== 'number') {
        skipped += 1;
        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        skipped += 1;
        continue;
      }

      checked += 1;

      const latestFixture = await this.espnFixtureModel
        .findOne({
          leagueId,
        })
        .select({
          collectedAt: 1,
        })
        .sort({
          collectedAt: -1,
        })
        .lean()
        .exec();

      const latestCollectedAt = latestFixture?.collectedAt
        ? new Date(latestFixture.collectedAt)
        : undefined;

      if (
        latestCollectedAt &&
        !Number.isNaN(latestCollectedAt.getTime()) &&
        latestCollectedAt.getTime() > cutoff.getTime()
      ) {
        continue;
      }

      stale += 1;

      const priority = this.getQueuePriority(league.priority);

      const job = await this.espnQueueService.addFixtureRefreshJob({
        leagueId,
        season: league.season,
        priority,
        scheduledFor: new Date(),
        triggerEventId: `STALE:${this.getLagosDateKey()}`,
      });

      if (this.isFreshPendingJob(job)) {
        queued += 1;
      }
    }

    return {
      checked,
      stale,
      queued,
      skipped,
    };
  }

  // ============================================================
  // STARTUP SUMMARY QUEUE
  // ============================================================

  /**
   * Startup-only Summary bootstrap.
   *
   * Every persisted ESPN fixture without payload.summary is queued.
   * This is intentionally not restricted to the upcoming window.
   */
  async buildStartupSummaryRefreshQueue(): Promise<{
    checked: number;
    missingSummary: number;
    queued: number;
    skipped: number;
  }> {
    const fixtures = await this.espnFixtureModel
      .find({
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
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
        payload: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let missingSummary = 0;
    let queued = 0;
    let skipped = 0;

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        skipped += 1;
        continue;
      }

      if (!fixture.leagueId) {
        skipped += 1;
        continue;
      }

      if (typeof fixture.season !== 'number') {
        skipped += 1;
        continue;
      }

      if (this.hasSummary(fixture)) {
        continue;
      }

      missingSummary += 1;

      const priority = await this.getSummaryQueuePriority(fixture.leagueId);

      const job = await this.espnQueueService.addSummaryRefreshJob({
        leagueId: fixture.leagueId,
        eventId: fixture.eventId,
        season: fixture.season,
        priority,
        scheduledFor: new Date(),
      });

      if (this.isFreshPendingJob(job)) {
        queued += 1;
      }
    }

    return {
      checked: fixtures.length,
      missingSummary,
      queued,
      skipped,
    };
  }

  // ============================================================
  // CONTINUOUS SUMMARY QUEUE
  // ============================================================

  /**
   * Queues Summary collection for:
   *
   * 1. upcoming fixtures inside the next four days;
   * 2. recently finished fixtures that still have no Summary.
   *
   * A fixture is never queued when payload.summary already exists.
   */
  async buildSummaryRefreshQueue(): Promise<{
    upcomingChecked: number;
    finishedChecked: number;
    queued: number;
    skipped: number;
  }> {
    const now = new Date();

    const upcomingUntil = new Date(
      now.getTime() + this.upcomingWindowDays * 24 * 60 * 60 * 1000,
    );

    const recentlyFinishedSince = new Date(
      now.getTime() - this.recentFinishedWindowHours * 60 * 60 * 1000,
    );

    const fixtures = await this.espnFixtureModel
      .find({
        $or: [
          {
            fixtureDate: {
              $gte: now,
              $lte: upcomingUntil,
            },
          },
          {
            fixtureDate: {
              $gte: recentlyFinishedSince,
              $lt: now,
            },
          },
        ],
      })
      .select({
        eventId: 1,
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
        payload: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let upcomingChecked = 0;
    let finishedChecked = 0;
    let queued = 0;
    let skipped = 0;

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        skipped += 1;
        continue;
      }

      if (!fixture.leagueId) {
        skipped += 1;
        continue;
      }

      if (typeof fixture.season !== 'number') {
        skipped += 1;
        continue;
      }

      if (this.hasSummary(fixture)) {
        continue;
      }

      const fixtureDate = fixture.fixtureDate
        ? new Date(fixture.fixtureDate)
        : undefined;

      if (!fixtureDate || Number.isNaN(fixtureDate.getTime())) {
        skipped += 1;
        continue;
      }

      const isUpcoming =
        fixtureDate.getTime() >= now.getTime() &&
        fixtureDate.getTime() <= upcomingUntil.getTime();

      const isRecentlyFinished =
        fixtureDate.getTime() >= recentlyFinishedSince.getTime() &&
        fixtureDate.getTime() < now.getTime() &&
        this.isCompletedEvent(fixture.payload);

      if (!isUpcoming && !isRecentlyFinished) {
        continue;
      }

      if (isUpcoming) {
        upcomingChecked += 1;
      }

      if (isRecentlyFinished) {
        finishedChecked += 1;
      }

      if (!(await this.isActiveLeague(fixture.leagueId))) {
        skipped += 1;
        continue;
      }

      const priority = await this.getSummaryQueuePriority(fixture.leagueId);

      const job = await this.espnQueueService.addSummaryRefreshJob({
        leagueId: fixture.leagueId,
        eventId: fixture.eventId,
        season: fixture.season,
        priority,
        scheduledFor: new Date(),
      });

      if (this.isFreshPendingJob(job)) {
        queued += 1;
      }
    }

    return {
      upcomingChecked,
      finishedChecked,
      queued,
      skipped,
    };
  }

  // ============================================================
  // FINISHED FIXTURE FOLLOW-UP
  // ============================================================

  /**
   * Called immediately after the live ESPN flow detects that a
   * fixture has finished.
   *
   * It creates:
   * - a fixture refresh for the affected league;
   * - a Summary refresh for the finished event when Summary is
   *   still missing.
   */
  async queueFinishedFixtureFollowUp(params: {
    eventId: string;
    leagueId: string;
    season: number;
  }): Promise<{
    fixtureRefreshQueued: boolean;
    summaryRefreshQueued: boolean;
  }> {
    const { eventId, leagueId, season } = params;

    if (!eventId || !leagueId || typeof season !== 'number') {
      return {
        fixtureRefreshQueued: false,
        summaryRefreshQueued: false,
      };
    }

    const activeLeague =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    if (!activeLeague?.isActive) {
      return {
        fixtureRefreshQueued: false,
        summaryRefreshQueued: false,
      };
    }

    const priority = this.getQueuePriority(activeLeague.priority);

    const fixtureRefreshJob = await this.espnQueueService.addFixtureRefreshJob({
      leagueId,
      season,
      priority,
      scheduledFor: new Date(),
      triggerEventId: `FINISHED:${eventId}`,
    });

    let summaryRefreshQueued = false;

    const fixture = await this.espnFixtureModel
      .findOne({
        eventId,
      })
      .select({
        eventId: 1,
        leagueId: 1,
        season: 1,
        payload: 1,
      })
      .lean()
      .exec();

    if (fixture && !this.hasSummary(fixture)) {
      const summaryJob = await this.espnQueueService.addSummaryRefreshJob({
        leagueId: fixture.leagueId || leagueId,
        eventId,
        season: typeof fixture.season === 'number' ? fixture.season : season,
        priority,
        scheduledFor: new Date(),
      });

      summaryRefreshQueued = this.isFreshPendingJob(summaryJob);
    }

    return {
      fixtureRefreshQueued: this.isFreshPendingJob(fixtureRefreshJob),
      summaryRefreshQueued,
    };
  }

  // ============================================================
  // SUMMARY ELIGIBILITY
  // ============================================================

  private hasSummary(fixture: Pick<EspnFixtureDocument, 'payload'>): boolean {
    const payload = fixture.payload;

    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return Boolean(
      payload.summary &&
      typeof payload.summary === 'object' &&
      Object.keys(payload.summary).length > 0,
    );
  }

  // ============================================================
  // ACTIVITY
  // ============================================================

  private async isActiveLeague(leagueId: string): Promise<boolean> {
    const league =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    return Boolean(league?.isActive);
  }

  private async getSummaryQueuePriority(leagueId: string): Promise<number> {
    const league =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    if (!league) {
      return 4;
    }

    return this.getQueuePriority(league.priority);
  }

  // ============================================================
  // PRIORITY
  // ============================================================

  private getQueuePriority(
    priority?: CompetitionPriority | string | null,
  ): number {
    if (!priority) {
      return 4;
    }

    switch (priority) {
      case String(CompetitionPriority.ELITE):
        return 1;

      case String(CompetitionPriority.HIGH):
        return 2;

      case String(CompetitionPriority.REGIONAL):
        return 3;

      case String(CompetitionPriority.SELECTIVE):
      default:
        return 4;
    }
  }

  // ============================================================
  // QUEUE RESULT
  // ============================================================

  private isFreshPendingJob(job: {
    status?: unknown;
    attempts?: unknown;
  }): boolean {
    return String(job.status) === 'PENDING' && Number(job.attempts ?? 0) === 0;
  }

  // ============================================================
  // COMPLETION DETECTION
  // ============================================================

  private toStringValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    return typeof value === 'number' ? String(value) : undefined;
  }

  private isCompletedEvent(event: unknown): boolean {
    if (!event || typeof event !== 'object') {
      return false;
    }

    const eventRecord = event as Record<string, unknown>;

    const rootStatus =
      eventRecord.status && typeof eventRecord.status === 'object'
        ? (eventRecord.status as Record<string, unknown>)
        : undefined;

    const rootStatusType =
      rootStatus?.type && typeof rootStatus.type === 'object'
        ? (rootStatus.type as Record<string, unknown>)
        : undefined;

    if (rootStatus?.completed === true || rootStatusType?.completed === true) {
      return true;
    }

    const rootState = this.toStringValue(
      rootStatusType?.state ?? rootStatus?.state,
    );

    if (
      rootState &&
      ['post', 'final', 'completed', 'complete', 'finished'].includes(
        String(rootState).toLowerCase(),
      )
    ) {
      return true;
    }

    const competitions = Array.isArray(eventRecord.competitions)
      ? (eventRecord.competitions as unknown[])
      : [];

    const competition = competitions[0];

    if (!competition || typeof competition !== 'object') {
      return false;
    }

    const competitionRecord = competition as Record<string, unknown>;

    const competitionStatus =
      competitionRecord.status && typeof competitionRecord.status === 'object'
        ? (competitionRecord.status as Record<string, unknown>)
        : undefined;

    const competitionStatusType =
      competitionStatus?.type && typeof competitionStatus.type === 'object'
        ? (competitionStatus.type as Record<string, unknown>)
        : undefined;

    if (
      competitionStatus?.completed === true ||
      competitionStatusType?.completed === true
    ) {
      return true;
    }

    const state = this.toStringValue(
      competitionStatusType?.state ?? competitionStatus?.state,
    );

    if (
      state &&
      ['post', 'final', 'completed', 'complete', 'finished'].includes(
        state.toLowerCase(),
      )
    ) {
      return true;
    }

    const detail = this.toStringValue(
      competitionStatusType?.detail ??
        competitionStatus?.detail ??
        competitionStatusType?.shortDetail,
    );

    return detail
      ? ['ft', 'full time', 'post'].includes(detail.toLowerCase())
      : false;
  }

  // ============================================================
  // DATE KEY
  // ============================================================

  private getLagosDateKey(date = new Date()): string {
    /*
     * Africa/Lagos is UTC+1.
     */
    return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  // ============================================================
  // NOTE
  // ============================================================

  /**
   * Kept as a small explicit constant for the fixture refresh
   * architecture. The actual ESPN fixture collection service
   * decides how its forward window is applied.
   */
  getFixtureRefreshForwardDays(): number {
    return this.fixtureRefreshForwardDays;
  }
}
