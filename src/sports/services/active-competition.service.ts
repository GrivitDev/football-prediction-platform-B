import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CompetitionPriority } from '../enums/competition-priority.enum';

import {
  ActiveCompetitionStatus,
  ActiveCompetition,
} from '../interfaces/active-competition.interface';

import {
  ActiveCompetitionDocument,
  ActiveCompetition as ActiveCompetitionSchema,
} from '../schemas/active-competition.schema';

@Injectable()
export class ActiveCompetitionService {
  private readonly logger = new Logger(ActiveCompetitionService.name);

  constructor(
    @InjectModel(ActiveCompetitionSchema.name)
    private readonly activeCompetitionModel: Model<ActiveCompetitionDocument>,
  ) {}

  // ============================================================
  // UPSERT
  // ============================================================

  async upsert(
    competition: Omit<ActiveCompetition, 'status' | 'lastUpdatedAt'>,
  ): Promise<ActiveCompetitionDocument> {
    const now = new Date();

    const normalizedCompetitionId = competition.competitionId
      .trim()
      .toLowerCase();

    const normalizedEspnLeagueSlug = competition.espnLeagueSlug
      .trim()
      .toLowerCase();

    const status = this.calculateStatus(
      competition.seasonStartDate,
      competition.seasonEndDate,
      competition.lastFixtureDate,
      competition.nextFixtureDate,
      now,
    );

    const update: Partial<ActiveCompetition> = {
      ...competition,
      competitionId: normalizedCompetitionId,
      espnLeagueSlug: normalizedEspnLeagueSlug,
      status,
      lastUpdatedAt: now,
    };

    return this.activeCompetitionModel
      .findOneAndUpdate(
        {
          competitionId: normalizedCompetitionId,
        },
        {
          $set: update,
        },
        {
          returnDocument: 'after',
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
  }

  // ============================================================
  // SYNC
  // ============================================================

  async syncLeague(params: {
    competitionId: string;
    espnLeagueSlug: string;
    name: string;
    type: ActiveCompetition['type'];
    region: ActiveCompetition['region'];
    priority: CompetitionPriority;
    footballDataCode?: string;
    oddsApiSportKey?: string;
    season?: number | null;
    seasonStartDate?: Date | null;
    seasonEndDate?: Date | null;
    lastFixtureDate?: Date | null;
    nextFixtureDate?: Date | null;
    espnPayload?: Record<string, unknown>;
  }): Promise<ActiveCompetitionDocument> {
    return this.upsert({
      competitionId: params.competitionId,
      espnLeagueSlug: params.espnLeagueSlug,
      name: params.name,
      type: params.type,
      region: params.region,
      priority: params.priority,
      footballDataCode: params.footballDataCode,
      oddsApiSportKey: params.oddsApiSportKey,
      season: params.season ?? undefined,
      seasonStartDate: params.seasonStartDate ?? undefined,
      seasonEndDate: params.seasonEndDate ?? undefined,
      lastFixtureDate: params.lastFixtureDate ?? undefined,
      nextFixtureDate: params.nextFixtureDate ?? undefined,
      espnPayload: params.espnPayload,
    });
  }

  // ============================================================
  // DELETE / REMOVE
  // ============================================================

  /**
   * Remove a competition from the active competition collection.
   *
   * The ESPN league catalogue remains untouched.
   */
  async removeByCompetitionId(competitionId: string): Promise<boolean> {
    const normalized = this.normalizeId(competitionId);

    if (!normalized) {
      return false;
    }

    const result = await this.activeCompetitionModel
      .deleteOne({
        competitionId: normalized,
      })
      .exec();

    return (result.deletedCount ?? 0) > 0;
  }

  /**
   * Remove active competitions whose IDs are not present
   * in the supplied current active competition list.
   */
  async removeMissingCompetitions(
    existingCompetitionIds: string[],
  ): Promise<number> {
    const normalizedIds = existingCompetitionIds
      .map((id) => this.normalizeId(id))
      .filter(Boolean);

    if (normalizedIds.length === 0) {
      return 0;
    }

    const result = await this.activeCompetitionModel
      .deleteMany({
        competitionId: {
          $nin: normalizedIds,
        },
      })
      .exec();

    return result.deletedCount ?? 0;
  }

  // ============================================================
  // READS
  // ============================================================

  async getAll(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({})
      .sort({
        priority: 1,
        name: 1,
      })
      .exec();
  }

  async getActive(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({
        status: ActiveCompetitionStatus.ACTIVE,
      })
      .sort({
        priority: 1,
        nextFixtureDate: 1,
        name: 1,
      })
      .exec();
  }

  async getUpcoming(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({
        status: ActiveCompetitionStatus.UPCOMING,
      })
      .sort({
        priority: 1,
        nextFixtureDate: 1,
        name: 1,
      })
      .exec();
  }

  async getActiveOrUpcoming(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({
        status: {
          $in: [
            ActiveCompetitionStatus.ACTIVE,
            ActiveCompetitionStatus.UPCOMING,
          ],
        },
      })
      .sort({
        priority: 1,
        nextFixtureDate: 1,
        name: 1,
      })
      .exec();
  }

  async getPriorityActive(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({
        priority: {
          $in: [
            CompetitionPriority.ELITE,
            CompetitionPriority.HIGH,
            CompetitionPriority.REGIONAL,
          ],
        },
        status: {
          $in: [
            ActiveCompetitionStatus.ACTIVE,
            ActiveCompetitionStatus.UPCOMING,
          ],
        },
      })
      .sort({
        priority: 1,
        nextFixtureDate: 1,
        name: 1,
      })
      .exec();
  }

  async getFinished(): Promise<ActiveCompetitionDocument[]> {
    return this.activeCompetitionModel
      .find({
        status: ActiveCompetitionStatus.FINISHED,
      })
      .sort({
        priority: 1,
        name: 1,
      })
      .exec();
  }

  async getByCompetitionId(
    competitionId: string,
  ): Promise<ActiveCompetitionDocument | null> {
    const normalized = this.normalizeId(competitionId);

    if (!normalized) {
      return null;
    }

    return this.activeCompetitionModel
      .findOne({
        competitionId: normalized,
      })
      .exec();
  }

  async getByEspnLeagueSlug(
    espnLeagueSlug: string,
  ): Promise<ActiveCompetitionDocument | null> {
    const normalized = this.normalizeId(espnLeagueSlug);

    if (!normalized) {
      return null;
    }

    return this.activeCompetitionModel
      .findOne({
        espnLeagueSlug: normalized,
      })
      .exec();
  }

  // ============================================================
  // FIXTURE ACTIVITY
  // ============================================================

  async updateFixtureActivity(params: {
    competitionId: string;
    lastFixtureDate?: Date | null;
    nextFixtureDate?: Date | null;
    season?: number | null;
    seasonStartDate?: Date | null;
    seasonEndDate?: Date | null;
    espnPayload?: Record<string, unknown>;
  }): Promise<ActiveCompetitionDocument | null> {
    const competition = await this.getByCompetitionId(params.competitionId);

    if (!competition) {
      return null;
    }

    const now = new Date();

    if (params.season !== undefined) {
      competition.season = params.season ?? undefined;
    }

    if (params.seasonStartDate !== undefined) {
      competition.seasonStartDate = params.seasonStartDate ?? undefined;
    }

    if (params.seasonEndDate !== undefined) {
      competition.seasonEndDate = params.seasonEndDate ?? undefined;
    }

    if (params.lastFixtureDate !== undefined) {
      competition.lastFixtureDate = params.lastFixtureDate ?? undefined;
    }

    if (params.nextFixtureDate !== undefined) {
      competition.nextFixtureDate = params.nextFixtureDate ?? undefined;
    }

    if (params.espnPayload !== undefined) {
      competition.espnPayload = params.espnPayload;
    }

    competition.status = this.calculateStatus(
      competition.seasonStartDate,
      competition.seasonEndDate,
      competition.lastFixtureDate,
      competition.nextFixtureDate,
      now,
    );

    /*
     * ActiveCompetition should contain only competitions
     * belonging to a currently active season.
     *
     * Therefore, once the competition becomes inactive,
     * remove it rather than leaving an obsolete document.
     */
    if (competition.status !== ActiveCompetitionStatus.ACTIVE) {
      await this.removeByCompetitionId(competition.competitionId);

      return null;
    }

    competition.lastUpdatedAt = now;

    return competition.save();
  }

  // ============================================================
  // STATUS REFRESH
  // ============================================================

  async refreshStatuses(): Promise<number> {
    const competitions = await this.activeCompetitionModel.find({}).exec();

    const now = new Date();
    let updated = 0;

    for (const competition of competitions) {
      const nextStatus = this.calculateStatus(
        competition.seasonStartDate,
        competition.seasonEndDate,
        competition.lastFixtureDate,
        competition.nextFixtureDate,
        now,
      );

      /*
       * ActiveCompetition is now strictly the active-season
       * collection. Anything that is not ACTIVE is removed.
       */
      if (nextStatus !== ActiveCompetitionStatus.ACTIVE) {
        await this.removeByCompetitionId(competition.competitionId);
        updated += 1;
        continue;
      }

      if (competition.status === nextStatus) {
        continue;
      }

      competition.status = nextStatus;
      competition.lastUpdatedAt = now;

      await competition.save();

      updated += 1;
    }

    return updated;
  }

  // ============================================================
  // STATUS CALCULATION
  // ============================================================

  calculateStatus(
    seasonStartDate?: Date,
    seasonEndDate?: Date,
    lastFixtureDate?: Date,
    nextFixtureDate?: Date,
    now = new Date(),
  ): ActiveCompetitionStatus {
    /*
     * A competition whose season has not started yet
     * is not an active competition.
     */
    if (seasonStartDate && now < new Date(seasonStartDate)) {
      return ActiveCompetitionStatus.UPCOMING;
    }

    /*
     * A season with an authoritative end date that has passed
     * is finished, unless ESPN still gives a future fixture.
     */
    if (seasonEndDate && now > new Date(seasonEndDate) && !nextFixtureDate) {
      return ActiveCompetitionStatus.FINISHED;
    }

    /*
     * A future fixture inside the current season keeps the
     * competition active.
     */
    if (nextFixtureDate && new Date(nextFixtureDate) >= now) {
      return ActiveCompetitionStatus.ACTIVE;
    }

    /*
     * A current season whose date range contains now
     * is active even when there is currently no next fixture.
     */
    if (
      seasonStartDate &&
      seasonEndDate &&
      now >= new Date(seasonStartDate) &&
      now <= new Date(seasonEndDate)
    ) {
      return ActiveCompetitionStatus.ACTIVE;
    }

    /*
     * If ESPN does not provide an end date but the season has
     * already started and the competition has recent fixtures,
     * keep it active.
     */
    if (
      seasonStartDate &&
      now >= new Date(seasonStartDate) &&
      !seasonEndDate &&
      lastFixtureDate
    ) {
      const elapsed = now.getTime() - new Date(lastFixtureDate).getTime();

      if (elapsed <= 7 * 24 * 60 * 60 * 1000) {
        return ActiveCompetitionStatus.ACTIVE;
      }
    }

    return ActiveCompetitionStatus.INACTIVE;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private normalizeId(value?: string): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }
}
