import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  SportsSyncState,
  SportsSyncStateDocument,
  SportsSyncStateKind,
  SportsSyncStateStatus,
  SportsSyncUnitStatus,
  SportsSyncUnitType,
} from '../schemas/sports-sync-state.schema';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

@Injectable()
export class SportsSyncStateService {
  constructor(
    @InjectModel(SportsSyncState.name)
    private readonly syncStateModel: Model<SportsSyncStateDocument>,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  // ============================================================
  // STATE KEY
  // ============================================================

  getQueueStateKey(params: {
    jobType: string;
    leagueId: string;
    season?: number;
    eventId?: string;
    triggerEventId?: string;
    queueJobKey?: string;
  }): string {
    const leagueId = this.normalize(params.leagueId);

    /*
     * FIXTURE_REFRESH is intentionally one persistent state per
     * league + season + job type.
     *
     * Operational queue jobs may still use triggerEventId values
     * such as:
     *
     *   DAILY:2026-09-26
     *   STALE:2026-09-26
     *   FINISHED:401884783
     *
     * but those values must NEVER create another synchronization
     * state document.
     */
    if (String(params.jobType) === String(EspnQueueJobType.FIXTURE_REFRESH)) {
      return [
        'QUEUE',
        params.jobType,
        leagueId,
        params.season ?? 'current',
      ].join(':');
    }

    /*
     * Summary remains event-specific.
     */
    if (params.eventId) {
      return ['QUEUE', params.jobType, leagueId, params.eventId.trim()].join(
        ':',
      );
    }

    /*
     * When a queue job key is supplied and there is no event,
     * it provides a stable operational identity for that state.
     */
    if (params.queueJobKey?.trim()) {
      return ['QUEUE', params.jobType, params.queueJobKey.trim()].join(':');
    }

    return ['QUEUE', params.jobType, leagueId, params.season ?? 'current'].join(
      ':',
    );
  }

  getCronStateKey(taskKey: string): string {
    return `CRON:${taskKey}`;
  }

  // ============================================================
  // QUEUE STATE
  // ============================================================

  async ensureQueueState(params: {
    jobType: string;
    leagueId: string;
    season?: number;
    eventId?: string;
    priority: number;
    trackingMode: 'WINDOW' | 'HISTORY';
    queueJobKey?: string;
    triggerEventId?: string;
  }): Promise<SportsSyncStateDocument> {
    const stateKey = this.getQueueStateKey(params);

    const isFixtureRefresh =
      String(params.jobType) === String(EspnQueueJobType.FIXTURE_REFRESH);

    return this.syncStateModel
      .findOneAndUpdate(
        {
          stateKey,
        },
        {
          $set: {
            kind: SportsSyncStateKind.QUEUE,

            jobType: params.jobType,

            leagueId: this.normalize(params.leagueId),

            season: params.season,

            /*
             * FIXTURE_REFRESH state is league/season scoped.
             * It must never retain an event identity.
             */
            eventId: isFixtureRefresh ? undefined : params.eventId,

            priority: params.priority,

            trackingMode: params.trackingMode,

            ...(params.queueJobKey
              ? {
                  lastQueueJobKey: params.queueJobKey,
                }
              : {}),
          },

          $setOnInsert: {
            stateKey,

            status: SportsSyncStateStatus.PENDING,

            units: [],

            consecutiveFailures: 0,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        },
      )
      .exec();
  }

  /**
   * Ensures the persistent FIXTURE_REFRESH state for one active
   * league/season.
   *
   * Responsibilities:
   *
   * 1. Keep one state document for the league + season.
   * 2. Extend the existing date window instead of creating another
   *    synchronization state.
   * 3. Check MongoDB fixtures for the requested date window.
   * 4. Mark dates that already contain fixtures as SUCCESS.
   * 5. Leave dates without fixtures as PENDING so the caller can
   *    verify those dates through ESPN.
   *
   * This service deliberately does NOT call ESPN.
   */
  async ensureFixtureRefreshState(params: {
    leagueId: string;
    season: number;
    priority: number;
    dateFrom: string;
    dateTo: string;
    trackingMode?: 'WINDOW' | 'HISTORY';
  }): Promise<SportsSyncStateDocument> {
    const leagueId = this.normalize(params.leagueId);

    if (!leagueId) {
      throw new Error('Fixture refresh state requires a valid league ID');
    }

    if (typeof params.season !== 'number') {
      throw new Error(
        `Fixture refresh state for ${leagueId} requires a valid season`,
      );
    }

    const requestedDateFrom = this.normalizeDateOnly(params.dateFrom);

    const requestedDateTo = this.normalizeDateOnly(params.dateTo);

    const trackingMode = params.trackingMode ?? 'HISTORY';

    const stateKey = this.getQueueStateKey({
      jobType: EspnQueueJobType.FIXTURE_REFRESH,

      leagueId,

      season: params.season,
    });

    await this.ensureQueueState({
      jobType: EspnQueueJobType.FIXTURE_REFRESH,

      leagueId,

      season: params.season,

      priority: params.priority,

      trackingMode,
    });

    let state = await this.requireState(stateKey);

    /*
     * Never shrink an existing persistent fixture window.
     *
     * Existing example:
     *
     *   2026-07-01 -> 2026-09-26
     *
     * Requested extension:
     *
     *   2026-07-01 -> 2026-10-04
     *
     * Result:
     *
     *   2026-07-01 -> 2026-10-04
     *
     * Only new date units are added.
     */
    const effectiveDateFrom = state.dateFrom
      ? this.minDateOnly(state.dateFrom, requestedDateFrom)
      : requestedDateFrom;

    const effectiveDateTo = state.dateTo
      ? this.maxDateOnly(state.dateTo, requestedDateTo)
      : requestedDateTo;

    await this.ensureDateWindow({
      stateKey,

      dateFrom: effectiveDateFrom,

      dateTo: effectiveDateTo,

      trackingMode,
    });

    state = await this.requireState(stateKey);

    /*
     * MongoDB is the first source of truth for already collected
     * fixtures.
     *
     * Any date inside this persistent state window that already
     * contains at least one fixture becomes SUCCESS and therefore
     * will not be sent to ESPN by the startup/worker phase.
     */
    const fixtureDateKeys = await this.getFixtureDateKeys({
      leagueId,

      season: params.season,

      dateFrom: effectiveDateFrom,

      dateTo: effectiveDateTo,
    });

    let changed = false;

    for (const unit of state.units) {
      if (
        unit.type !== SportsSyncUnitType.DATE ||
        !unit.dateKey ||
        !fixtureDateKeys.has(unit.dateKey)
      ) {
        continue;
      }

      if (unit.status === SportsSyncUnitStatus.SUCCESS) {
        continue;
      }

      unit.status = SportsSyncUnitStatus.SUCCESS;

      unit.completedAt = new Date();

      unit.startedAt = undefined;

      unit.nextAttemptAt = undefined;

      unit.lastError = undefined;

      changed = true;
    }

    state.status = this.calculateOverallStatus(state);

    if (state.status === SportsSyncStateStatus.SUCCESS) {
      state.lastSuccessfulAt = new Date();

      state.lastCompletedAt = new Date();

      state.lastError = undefined;

      state.consecutiveFailures = 0;
    }

    if (changed) {
      state.markModified('units');

      await state.save();
    }

    return state;
  }

  async getState(stateKey: string): Promise<SportsSyncStateDocument | null> {
    return this.syncStateModel
      .findOne({
        stateKey,
      })
      .exec();
  }

  async requireState(stateKey: string): Promise<SportsSyncStateDocument> {
    const state = await this.getState(stateKey);

    if (!state) {
      throw new Error(`Sports synchronization state ${stateKey} was not found`);
    }

    return state;
  }

  /**
   * Returns every persistent queue state that still contains
   * incomplete work.
   *
   * This is intentionally independent of the operational queue
   * collection. The queue document may have FAILED or may have
   * already been cleaned after its retention period.
   */
  async getIncompleteQueueStates(
    jobTypes?: string[],
  ): Promise<SportsSyncStateDocument[]> {
    const query: Record<string, unknown> = {
      kind: SportsSyncStateKind.QUEUE,

      status: {
        $ne: SportsSyncStateStatus.SUCCESS,
      },
    };

    if (jobTypes && jobTypes.length > 0) {
      query.jobType = {
        $in: jobTypes,
      };
    }

    return this.syncStateModel
      .find(query)
      .sort({
        priority: 1,
        updatedAt: 1,
      })
      .exec();
  }

  // ============================================================
  // DATE WINDOW
  // ============================================================

  async ensureDateWindow(params: {
    stateKey: string;
    dateFrom: string;
    dateTo: string;
    trackingMode: 'WINDOW' | 'HISTORY';
  }): Promise<SportsSyncStateDocument> {
    const state = await this.requireState(params.stateKey);

    const desiredDateFrom = this.normalizeDateOnly(params.dateFrom);

    const desiredDateTo = this.normalizeDateOnly(params.dateTo);

    const existingDateUnits = new Map(
      state.units
        .filter((unit) => unit.type === SportsSyncUnitType.DATE)
        .map((unit) => [unit.dateKey ?? unit.key, unit]),
    );

    const existingStepUnits = state.units.filter(
      (unit) => unit.type === SportsSyncUnitType.STEP,
    );

    /*
     * HISTORY mode never shrinks an already accumulated range.
     *
     * This makes the same synchronization state reusable when
     * new future dates are appended.
     */
    let effectiveDateFrom = desiredDateFrom;
    let effectiveDateTo = desiredDateTo;

    if (state.dateFrom) {
      effectiveDateFrom = this.minDateOnly(state.dateFrom, desiredDateFrom);
    }

    if (state.dateTo) {
      effectiveDateTo = this.maxDateOnly(state.dateTo, desiredDateTo);
    }

    const effectiveDates = this.buildDateRange(
      effectiveDateFrom,
      effectiveDateTo,
    );

    const effectiveDateUnits = effectiveDates.map((dateKey) => {
      const existing = existingDateUnits.get(dateKey);

      if (existing) {
        return existing;
      }

      return {
        key: `DATE:${dateKey}`,

        type: SportsSyncUnitType.DATE,

        dateKey,

        status: SportsSyncUnitStatus.PENDING,

        attempts: 0,
      };
    });

    state.dateFrom = effectiveDateFrom;

    state.dateTo = effectiveDateTo;

    state.trackingMode = params.trackingMode;

    if (params.trackingMode === 'HISTORY') {
      const desiredDateSet = new Set(effectiveDates);

      const historicalUnits = state.units.filter(
        (unit) =>
          unit.type === SportsSyncUnitType.DATE &&
          unit.dateKey &&
          !desiredDateSet.has(unit.dateKey),
      );

      state.units = [
        ...historicalUnits,
        ...effectiveDateUnits,
        ...existingStepUnits,
      ];
    } else {
      state.units = [...effectiveDateUnits, ...existingStepUnits];
    }

    state.status = this.calculateOverallStatus(state);

    state.markModified('units');

    await state.save();

    return state;
  }

  // ============================================================
  // STEP UNITS
  // ============================================================

  async ensureStepUnits(
    stateKey: string,
    stepKeys: string[],
  ): Promise<SportsSyncStateDocument> {
    const state = await this.requireState(stateKey);

    const existingSteps = new Map(
      state.units
        .filter((unit) => unit.type === SportsSyncUnitType.STEP)
        .map((unit) => [unit.stepKey ?? unit.key, unit]),
    );

    /*
     * Never discard an already tracked step.
     *
     * New architecture callers only create:
     *
     *   summary
     *   youtube
     *   odds
     *
     * or the fixture-refresh date units.
     */
    for (const stepKey of stepKeys) {
      if (existingSteps.has(stepKey)) {
        continue;
      }

      existingSteps.set(stepKey, {
        key: `STEP:${stepKey}`,

        type: SportsSyncUnitType.STEP,

        stepKey,

        status: SportsSyncUnitStatus.PENDING,

        attempts: 0,
      });
    }

    const dateUnits = state.units.filter(
      (unit) => unit.type === SportsSyncUnitType.DATE,
    );

    state.units = [...dateUnits, ...existingSteps.values()];

    state.status = this.calculateOverallStatus(state);

    state.markModified('units');

    await state.save();

    return state;
  }

  // ============================================================
  // INTERRUPTED UNIT RECOVERY
  // ============================================================

  async resetInterruptedUnits(stateKey: string): Promise<void> {
    const state = await this.requireState(stateKey);

    let changed = false;

    for (const unit of state.units) {
      if (unit.status !== SportsSyncUnitStatus.PROCESSING) {
        continue;
      }

      unit.status = SportsSyncUnitStatus.PENDING;

      unit.nextAttemptAt = undefined;

      unit.startedAt = undefined;

      changed = true;
    }

    if (!changed) {
      return;
    }

    state.status = SportsSyncStateStatus.PARTIAL;

    state.markModified('units');

    await state.save();
  }

  // ============================================================
  // DATE STATE
  // ============================================================

  async getIncompleteDates(stateKey: string): Promise<string[]> {
    const state = await this.requireState(stateKey);

    return state.units
      .filter(
        (unit) =>
          unit.type === SportsSyncUnitType.DATE &&
          (unit.status === SportsSyncUnitStatus.PENDING ||
            unit.status === SportsSyncUnitStatus.FAILED),
      )
      .map((unit) => unit.dateKey)
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => a.localeCompare(b));
  }

  async markDateProcessing(stateKey: string, dateKey: string): Promise<void> {
    await this.markUnitProcessing(stateKey, `DATE:${dateKey}`);
  }

  async markDateSuccess(stateKey: string, dateKey: string): Promise<void> {
    await this.markUnitSuccess(stateKey, `DATE:${dateKey}`);
  }

  async markDateFailed(
    stateKey: string,
    dateKey: string,
    error: unknown,
  ): Promise<void> {
    await this.markUnitFailed(stateKey, `DATE:${dateKey}`, error);
  }

  // ============================================================
  // STEP STATE
  // ============================================================

  async getIncompleteSteps(stateKey: string): Promise<string[]> {
    const state = await this.requireState(stateKey);

    return state.units
      .filter(
        (unit) =>
          unit.type === SportsSyncUnitType.STEP &&
          (unit.status === SportsSyncUnitStatus.PENDING ||
            unit.status === SportsSyncUnitStatus.FAILED),
      )
      .map((unit) => unit.stepKey)
      .filter((step): step is string => Boolean(step));
  }

  async isUnitSuccessful(stateKey: string, unitKey: string): Promise<boolean> {
    const state = await this.requireState(stateKey);

    const unit = state.units.find((candidate) => candidate.key === unitKey);

    return unit?.status === SportsSyncUnitStatus.SUCCESS;
  }

  async markStepProcessing(stateKey: string, stepKey: string): Promise<void> {
    await this.markUnitProcessing(stateKey, `STEP:${stepKey}`);
  }

  async markStepSuccess(stateKey: string, stepKey: string): Promise<void> {
    await this.markUnitSuccess(stateKey, `STEP:${stepKey}`);
  }

  async markStepFailed(
    stateKey: string,
    stepKey: string,
    error: unknown,
  ): Promise<void> {
    await this.markUnitFailed(stateKey, `STEP:${stepKey}`, error);
  }

  // ============================================================
  // GENERIC UNIT STATE
  // ============================================================

  private async markUnitProcessing(
    stateKey: string,
    unitKey: string,
  ): Promise<void> {
    const state = await this.requireState(stateKey);

    const unit = state.units.find((candidate) => candidate.key === unitKey);

    if (!unit) {
      throw new Error(
        `Synchronization unit ${unitKey} does not exist in ${stateKey}`,
      );
    }

    unit.status = SportsSyncUnitStatus.PROCESSING;

    unit.attempts += 1;

    unit.startedAt = new Date();

    unit.completedAt = undefined;

    unit.nextAttemptAt = undefined;

    unit.lastError = undefined;

    state.status = SportsSyncStateStatus.PROCESSING;

    state.markModified('units');

    await state.save();
  }

  private async markUnitSuccess(
    stateKey: string,
    unitKey: string,
  ): Promise<void> {
    const state = await this.requireState(stateKey);

    const unit = state.units.find((candidate) => candidate.key === unitKey);

    if (!unit) {
      throw new Error(
        `Synchronization unit ${unitKey} does not exist in ${stateKey}`,
      );
    }

    unit.status = SportsSyncUnitStatus.SUCCESS;

    unit.completedAt = new Date();

    unit.nextAttemptAt = undefined;

    unit.lastError = undefined;

    state.lastCompletedAt = new Date();

    state.status = this.calculateOverallStatus(state);

    if (state.status === SportsSyncStateStatus.SUCCESS) {
      state.lastSuccessfulAt = new Date();

      state.lastError = undefined;

      state.consecutiveFailures = 0;
    }

    state.markModified('units');

    await state.save();
  }

  private async markUnitFailed(
    stateKey: string,
    unitKey: string,
    error: unknown,
  ): Promise<void> {
    const state = await this.requireState(stateKey);

    const unit = state.units.find((candidate) => candidate.key === unitKey);

    if (!unit) {
      throw new Error(
        `Synchronization unit ${unitKey} does not exist in ${stateKey}`,
      );
    }

    const message = error instanceof Error ? error.message : String(error);

    unit.status = SportsSyncUnitStatus.FAILED;

    unit.startedAt = undefined;

    unit.completedAt = undefined;

    unit.nextAttemptAt = new Date(
      Date.now() + this.getRetryDelay(unit.attempts),
    );

    unit.lastError = message;

    state.status = SportsSyncStateStatus.PARTIAL;

    state.lastError = message;

    state.consecutiveFailures += 1;

    state.markModified('units');

    await state.save();
  }

  // ============================================================
  // OVERALL STATE
  // ============================================================

  async refreshOverallStatus(stateKey: string): Promise<SportsSyncStateStatus> {
    const state = await this.requireState(stateKey);

    state.status = this.calculateOverallStatus(state);

    if (state.status === SportsSyncStateStatus.SUCCESS) {
      state.lastSuccessfulAt = new Date();

      state.lastCompletedAt = new Date();

      state.lastError = undefined;

      state.consecutiveFailures = 0;
    }

    state.markModified('units');

    await state.save();

    return state.status;
  }

  async isComplete(stateKey: string): Promise<boolean> {
    const state = await this.requireState(stateKey);

    return this.isStateComplete(state);
  }

  // ============================================================
  // CRON STATE
  // ============================================================

  async ensureCronState(params: {
    taskKey: string;
    cronExpression: string;
    timeZone: string;
    nextRunAt?: Date;
  }): Promise<SportsSyncStateDocument> {
    const stateKey = this.getCronStateKey(params.taskKey);

    return this.syncStateModel
      .findOneAndUpdate(
        {
          stateKey,
        },
        {
          $set: {
            kind: SportsSyncStateKind.CRON,

            taskKey: params.taskKey,

            cronExpression: params.cronExpression,

            timeZone: params.timeZone,

            ...(params.nextRunAt
              ? {
                  nextRunAt: params.nextRunAt,
                }
              : {}),
          },

          $setOnInsert: {
            stateKey,

            status: SportsSyncStateStatus.PENDING,

            trackingMode: 'WINDOW',

            units: [],

            consecutiveFailures: 0,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        },
      )
      .exec();
  }

  async markCronStarted(taskKey: string): Promise<void> {
    const state = await this.requireState(this.getCronStateKey(taskKey));

    state.status = SportsSyncStateStatus.PROCESSING;

    state.lastStartedAt = new Date();

    state.lastError = undefined;

    await state.save();
  }

  async markCronSuccess(params: {
    taskKey: string;
    nextRunAt?: Date;
  }): Promise<void> {
    const state = await this.requireState(this.getCronStateKey(params.taskKey));

    const now = new Date();

    state.status = SportsSyncStateStatus.SUCCESS;

    state.lastStartedAt ??= now;

    state.lastSuccessfulAt = now;

    state.lastCompletedAt = now;

    state.lastError = undefined;

    state.consecutiveFailures = 0;

    if (params.nextRunAt) {
      state.nextRunAt = params.nextRunAt;
    }

    await state.save();
  }

  async markCronFailure(params: {
    taskKey: string;
    error: unknown;
    nextRunAt?: Date;
  }): Promise<void> {
    const state = await this.requireState(this.getCronStateKey(params.taskKey));

    state.status = SportsSyncStateStatus.FAILED;

    state.lastError =
      params.error instanceof Error
        ? params.error.message
        : String(params.error);

    state.consecutiveFailures += 1;

    if (params.nextRunAt) {
      state.nextRunAt = params.nextRunAt;
    }

    await state.save();
  }

  async getCronState(taskKey: string): Promise<SportsSyncStateDocument | null> {
    return this.syncStateModel
      .findOne({
        stateKey: this.getCronStateKey(taskKey),
      })
      .exec();
  }

  // ============================================================
  // FIXTURE LOOKUP
  // ============================================================

  private async getFixtureDateKeys(params: {
    leagueId: string;
    season: number;
    dateFrom: string;
    dateTo: string;
  }): Promise<Set<string>> {
    const from = this.parseDateOnly(params.dateFrom);

    const toExclusive = this.addUtcDays(this.parseDateOnly(params.dateTo), 1);

    const fixtures = await this.espnFixtureModel
      .find({
        leagueId: this.normalize(params.leagueId),

        season: params.season,

        fixtureDate: {
          $gte: from,

          $lt: toExclusive,
        },
      })
      .select({
        fixtureDate: 1,
      })
      .lean()
      .exec();

    const dates = new Set<string>();

    for (const fixture of fixtures) {
      if (!fixture.fixtureDate) {
        continue;
      }

      const fixtureDate = new Date(fixture.fixtureDate);

      if (Number.isNaN(fixtureDate.getTime())) {
        continue;
      }

      dates.add(this.formatDateOnly(fixtureDate));
    }

    return dates;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private isStateComplete(state: SportsSyncStateDocument): boolean {
    return (
      state.units.length > 0 &&
      state.units.every((unit) => unit.status === SportsSyncUnitStatus.SUCCESS)
    );
  }

  private buildDateRange(dateFrom: string, dateTo: string): string[] {
    if (dateFrom > dateTo) {
      throw new Error(
        `Invalid synchronization date range: ${dateFrom} -> ${dateTo}`,
      );
    }

    const dates: string[] = [];

    let current = this.parseDateOnly(dateFrom);

    const end = this.parseDateOnly(dateTo);

    while (current.getTime() <= end.getTime()) {
      dates.push(this.formatDateOnly(current));

      current = new Date(current);

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private parseDateOnly(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid synchronization date: ${value}`);
    }

    return date;
  }

  private formatDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private normalizeDateOnly(value: string): string {
    const normalized = String(value ?? '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new Error(`Invalid synchronization date: ${value}`);
    }

    this.parseDateOnly(normalized);

    return normalized;
  }

  private minDateOnly(first: string, second: string): string {
    return first <= second ? first : second;
  }

  private maxDateOnly(first: string, second: string): string {
    return first >= second ? first : second;
  }

  private calculateOverallStatus(
    state: SportsSyncStateDocument,
  ): SportsSyncStateStatus {
    if (state.units.length === 0) {
      return SportsSyncStateStatus.PENDING;
    }

    if (
      state.units.some(
        (unit) => unit.status === SportsSyncUnitStatus.PROCESSING,
      )
    ) {
      return SportsSyncStateStatus.PROCESSING;
    }

    if (
      state.units.every((unit) => unit.status === SportsSyncUnitStatus.SUCCESS)
    ) {
      return SportsSyncStateStatus.SUCCESS;
    }

    if (
      state.units.some((unit) => unit.status === SportsSyncUnitStatus.FAILED)
    ) {
      return SportsSyncStateStatus.PARTIAL;
    }

    return SportsSyncStateStatus.PENDING;
  }

  private getRetryDelay(attempts: number): number {
    return Math.min(15, Math.pow(2, Math.max(attempts - 1, 0))) * 60_000;
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
