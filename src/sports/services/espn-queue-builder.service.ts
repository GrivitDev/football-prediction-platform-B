import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import {
  EspnLeague,
  EspnLeagueDocument,
} from '../schemas/espn/espn-league.schema';

import { CompetitionPriority } from '../enums/competition-priority.enum';

import { EspnQueueService } from './espn-queue.service';
import { EspnActiveCompetitionService } from './espn-active-competition.service';

@Injectable()
export class EspnQueueBuilderService {
  private readonly logger = new Logger(EspnQueueBuilderService.name);

  private readonly upcomingWindowDays = 4;

  private readonly threeHourWindowMs = 3 * 60 * 60 * 1000;

  constructor(
    private readonly espnQueueService: EspnQueueService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,

    @InjectModel(EspnLeague.name)
    private readonly espnLeagueModel: Model<EspnLeagueDocument>,
  ) {}

  // ============================================================
  // THREE-HOUR FIXTURE WATCHER
  // ============================================================

  /**
   * Runs from the existing five-second queue worker poll.
   *
   * Its only responsibility is to create a fresh, event-specific
   * LEAGUE_REFRESH trigger after a fixture reaches the
   * three-hour threshold.
   *
   * It does not call ESPN.
   */
  async watchThreeHourFixtures(): Promise<{
    checked: number;
    queued: number;
  }> {
    const now = new Date();

    const cutoff = new Date(now.getTime() - this.threeHourWindowMs);

    const startOfToday = new Date(now);

    startOfToday.setUTCHours(0, 0, 0, 0);

    const fixtures = await this.espnFixtureModel
      .find({
        fixtureDate: {
          $gte: startOfToday,
          $lte: cutoff,
        },
      })
      .select({
        eventId: 1,
        leagueId: 1,
        season: 1,
        fixtureDate: 1,
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    const leagueTriggers = new Map<
      string,
      {
        eventId: string;
        leagueId: string;
        season: number;
        fixtureDate: Date;
      }
    >();

    for (const fixture of fixtures) {
      if (!fixture.eventId) {
        continue;
      }

      if (!fixture.leagueId) {
        continue;
      }

      if (typeof fixture.season !== 'number') {
        continue;
      }

      if (!fixture.fixtureDate) {
        continue;
      }

      const fixtureDate = new Date(fixture.fixtureDate);

      if (Number.isNaN(fixtureDate.getTime())) {
        continue;
      }

      if (fixtureDate.getTime() + this.threeHourWindowMs > now.getTime()) {
        continue;
      }

      const key =
        `${fixture.leagueId.trim().toLowerCase()}:` + `${fixture.season}`;

      const existing = leagueTriggers.get(key);

      if (!existing || fixtureDate.getTime() > existing.fixtureDate.getTime()) {
        leagueTriggers.set(key, {
          eventId: fixture.eventId,
          leagueId: fixture.leagueId,
          season: fixture.season,
          fixtureDate,
        });
      }
    }

    let queued = 0;

    for (const trigger of leagueTriggers.values()) {
      const league = await this.espnActiveCompetitionService.getByLeagueId(
        trigger.leagueId,
      );

      if (!league?.isActive) {
        continue;
      }

      const priority = this.getQueuePriority(this.getLeaguePriority(league));

      const job = await this.espnQueueService.addLeagueRefreshJob({
        leagueId: trigger.leagueId,
        season: trigger.season,
        priority,
        scheduledFor: new Date(),
        triggerEventId: trigger.eventId,
      });

      if (String(job.status) === 'PENDING' && Number(job.attempts ?? 0) === 0) {
        queued += 1;
      }
    }

    return {
      checked: fixtures.length,
      queued,
    };
  }

  // ============================================================
  // DAILY LEAGUE REFRESH
  // ============================================================

  /**
   * Creates one event-specific LEAGUE_REFRESH job per active
   * league for the current Lagos calendar day.
   *
   * The date-based trigger is important because a normal
   * league+season job would eventually become COMPLETED and
   * would not represent the next rolling today -> today+8 window.
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
          `Skipping daily league refresh for ${league.leagueId}: missing season`,
        );

        continue;
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        skipped += 1;
        continue;
      }

      active += 1;

      const priority = this.getQueuePriority(this.getLeaguePriority(league));

      const job = await this.espnQueueService.addLeagueRefreshJob({
        leagueId,
        season: league.season,
        priority,
        scheduledFor: new Date(),
        triggerEventId,
      });

      if (String(job.status) === 'PENDING' && Number(job.attempts ?? 0) === 0) {
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
  // UPCOMING MATCH QUEUE
  // ============================================================

  /**
   * Creates UPCOMING_MATCH jobs for fixtures within the
   * next four days.
   */
  async buildUpcomingMatchQueue(): Promise<{
    upcoming: number;
  }> {
    const now = new Date();

    const upcomingUntil = new Date(
      now.getTime() + this.upcomingWindowDays * 24 * 60 * 60 * 1000,
    );

    const fixtures = await this.espnFixtureModel
      .find({
        fixtureDate: {
          $gte: now,
          $lte: upcomingUntil,
        },
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let upcoming = 0;

    for (const fixture of fixtures) {
      if (!fixture.leagueId) {
        continue;
      }

      if (!(await this.isActiveLeague(fixture.leagueId))) {
        continue;
      }

      if (await this.addUpcomingFixtureJob(fixture)) {
        upcoming += 1;
      }
    }

    return {
      upcoming,
    };
  }

  // ============================================================
  // MATCH JOBS AFTER LEAGUE REFRESH
  // ============================================================

  /**
   * Builds UPCOMING_MATCH jobs from the fixtures persisted by the
   * league refresh.
   *
   * The worker now handles FINISHED_MATCH discovery from stored
   * completed fixtures and synchronization state, so the
   * scoreboard argument remains optional only for compatibility
   * with older callers.
   */
  async buildLeagueMatchJobs(
    leagueId: string,
    season?: number,
    scoreboardResponse?: unknown,
  ): Promise<{
    upcoming: number;
    finished: number;
  }> {
    const league =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    if (!league || !league.isActive) {
      return {
        upcoming: 0,
        finished: 0,
      };
    }

    const effectiveSeason = typeof season === 'number' ? season : league.season;

    const now = new Date();

    const upcomingUntil = new Date(
      now.getTime() + this.upcomingWindowDays * 24 * 60 * 60 * 1000,
    );

    const seasonFilter: Record<string, unknown> = {};

    if (typeof effectiveSeason === 'number') {
      seasonFilter.season = effectiveSeason;
    }

    const upcomingFixtures = await this.espnFixtureModel
      .find({
        leagueId: league.leagueId,

        ...seasonFilter,

        fixtureDate: {
          $gte: now,
          $lte: upcomingUntil,
        },
      })
      .sort({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    let upcoming = 0;
    let finished = 0;

    for (const fixture of upcomingFixtures) {
      if (await this.addUpcomingFixtureJob(fixture)) {
        upcoming += 1;
      }
    }

    /*
     * Backward-compatible scoreboard handling.
     *
     * The current queue worker does not pass a scoreboard
     * response here. Finished-match repair/creation is handled
     * by stored fixture state instead.
     */
    if (scoreboardResponse) {
      const completedEventIds =
        this.extractCompletedEventIds(scoreboardResponse);

      for (const eventId of completedEventIds) {
        const fixture = await this.espnFixtureModel
          .findOne({
            eventId,

            leagueId: league.leagueId,

            ...(typeof effectiveSeason === 'number'
              ? {
                  season: effectiveSeason,
                }
              : {}),
          })
          .lean()
          .exec();

        if (!fixture) {
          continue;
        }

        if (
          !fixture.fixtureDate ||
          new Date(fixture.fixtureDate).getTime() + this.threeHourWindowMs >
            now.getTime()
        ) {
          continue;
        }

        if (await this.addFinishedFixtureJob(fixture)) {
          finished += 1;
        }
      }
    }

    return {
      upcoming,
      finished,
    };
  }

  // ============================================================
  // PRIORITY
  // ============================================================

  private getLeaguePriority(league: EspnLeagueDocument): CompetitionPriority {
    if (Object.values(CompetitionPriority).includes(league.priority)) {
      return league.priority;
    }

    return CompetitionPriority.SELECTIVE;
  }

  private getQueuePriority(priority: CompetitionPriority): number {
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
  // UPCOMING
  // ============================================================

  private async addUpcomingFixtureJob(
    fixture: EspnFixtureDocument,
  ): Promise<boolean> {
    if (!fixture.eventId) {
      return false;
    }

    if (typeof fixture.season !== 'number') {
      return false;
    }

    const priority = await this.getFixtureQueuePriority(fixture.leagueId);

    if (priority === null) {
      return false;
    }

    const job = await this.espnQueueService.addUpcomingMatchJob({
      leagueId: fixture.leagueId,
      eventId: fixture.eventId,
      season: fixture.season,
      priority,
      scheduledFor: new Date(),
    });

    return Boolean(job);
  }

  // ============================================================
  // FINISHED
  // ============================================================

  private async addFinishedFixtureJob(
    fixture: EspnFixtureDocument,
  ): Promise<boolean> {
    if (!fixture.eventId) {
      return false;
    }

    if (typeof fixture.season !== 'number') {
      return false;
    }

    const priority = await this.getFixtureQueuePriority(fixture.leagueId);

    if (priority === null) {
      return false;
    }

    const job = await this.espnQueueService.addFinishedMatchJob({
      leagueId: fixture.leagueId,
      eventId: fixture.eventId,
      season: fixture.season,
      priority,
      scheduledFor: new Date(),
    });

    return Boolean(job);
  }

  // ============================================================
  // COMPLETED SCOREBOARD EVENTS
  // ============================================================

  private extractCompletedEventIds(response: unknown): string[] {
    const events = this.extractArray(response, ['events', 'items']);

    const completedIds = new Set<string>();

    for (const event of events) {
      if (!event || typeof event !== 'object') {
        continue;
      }

      const record = event as Record<string, unknown>;

      const eventId = this.toStringValue(record.id);

      if (!eventId) {
        continue;
      }

      if (!this.isCompletedEvent(event)) {
        continue;
      }

      completedIds.add(eventId);
    }

    return [...completedIds];
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
        rootState.toLowerCase(),
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
  // ACTIVITY
  // ============================================================

  private async isActiveLeague(leagueId: string): Promise<boolean> {
    const league =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    return Boolean(league?.isActive);
  }

  private async getFixtureQueuePriority(
    leagueId: string,
  ): Promise<number | null> {
    const league =
      await this.espnActiveCompetitionService.getByLeagueId(leagueId);

    if (!league || !league.isActive) {
      return null;
    }

    return this.getQueuePriority(this.getLeaguePriority(league));
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
  // HELPERS
  // ============================================================

  private extractArray(value: unknown, keys: string[] = []): any[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    const object = value as Record<string, unknown>;

    for (const key of keys) {
      if (Array.isArray(object[key])) {
        return object[key];
      }
    }

    return [];
  }

  private toStringValue(value: unknown): string | undefined {
    if (value === null || value === undefined || typeof value === 'object') {
      return undefined;
    }

    const result =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
          ? String(value).trim()
          : undefined;

    return result ? result : undefined;
  }
}
