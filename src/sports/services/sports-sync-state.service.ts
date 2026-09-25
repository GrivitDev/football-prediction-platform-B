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

@Injectable()
export class SportsSyncStateService {
  constructor(
    @InjectModel(SportsSyncState.name)
    private readonly syncStateModel: Model<SportsSyncStateDocument>,
  ) {}

  // ============================================================
  // STATE KEY
  // ============================================================

  getQueueStateKey(params: {
    jobType: string;
    leagueId: string;
    season?: number;
    eventId?: string;
  }): string {
    const leagueId = this.normalize(params.leagueId);

    if (params.eventId) {
      return ['QUEUE', params.jobType, leagueId, params.eventId.trim()].join(
        ':',
      );
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
  }): Promise<SportsSyncStateDocument> {
    const stateKey = this.getQueueStateKey(params);

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

            eventId: params.eventId,

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
   * already been cleaned after seven days.
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

    const desiredDates = this.buildDateRange(params.dateFrom, params.dateTo);

    const existingDateUnits = new Map(
      state.units
        .filter((unit) => unit.type === SportsSyncUnitType.DATE)
        .map((unit) => [unit.dateKey ?? unit.key, unit]),
    );

    const dateUnits = desiredDates.map((dateKey) => {
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

    const existingStepUnits = state.units.filter(
      (unit) => unit.type === SportsSyncUnitType.STEP,
    );

    state.dateFrom = params.dateFrom;

    state.dateTo = params.dateTo;

    state.trackingMode = params.trackingMode;

    if (params.trackingMode === 'HISTORY') {
      const desiredDateSet = new Set(desiredDates);

      const historicalUnits = state.units.filter(
        (unit) =>
          unit.type === SportsSyncUnitType.DATE &&
          unit.dateKey &&
          !desiredDateSet.has(unit.dateKey),
      );

      state.units = [...historicalUnits, ...dateUnits, ...existingStepUnits];
    } else {
      state.units = [...dateUnits, ...existingStepUnits];
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
     * Never discard an already tracked step merely because the
     * caller supplied a smaller list.
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
}
