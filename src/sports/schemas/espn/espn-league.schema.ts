import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { CompetitionPriority } from '../../enums/competition-priority.enum';

export type EspnLeagueDocument = HydratedDocument<EspnLeague>;

@Schema({
  timestamps: true,
  collection: 'sports_espn_leagues',
})
export class EspnLeague {
  /**
   * ESPN league identifier.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  leagueId!: string;

  /**
   * ESPN league slug used by ESPN provider endpoints.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  slug!: string;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    type: String,
    trim: true,
  })
  abbreviation?: string;

  @Prop({
    type: String,
    trim: true,
  })
  country?: string;

  /**
   * Application classification.
   *
   * Unconfigured ESPN leagues are retained and classified
   * as SELECTIVE.
   */
  @Prop({
    type: String,
    enum: Object.values(CompetitionPriority),
    default: CompetitionPriority.SELECTIVE,
    index: true,
  })
  priority!: CompetitionPriority;

  /**
   * True only for competitions configured in the application's
   * priority competition registry.
   */
  @Prop({
    type: Boolean,
    default: false,
    index: true,
  })
  isPriority!: boolean;

  /**
   * Whether the league currently has a usable current season
   * according to its ESPN league-detail response.
   */
  @Prop({
    type: Boolean,
    default: true,
    index: true,
  })
  isActive!: boolean;

  /**
   * Current ESPN season year.
   */
  @Prop({
    type: Number,
    index: true,
  })
  season?: number;

  /**
   * Current ESPN season start date.
   */
  @Prop({
    type: Date,
    index: true,
  })
  seasonStartDate?: Date;

  /**
   * Current ESPN season end date.
   */
  @Prop({
    type: Date,
    index: true,
  })
  seasonEndDate?: Date;

  /**
   * Latest stored fixture date for this league.
   */
  @Prop({
    type: Date,
    index: true,
  })
  lastFixtureDate?: Date;

  /**
   * Next stored fixture date for this league.
   */
  @Prop({
    type: Date,
    index: true,
  })
  nextFixtureDate?: Date;

  /**
   * Complete ESPN league payload.
   *
   * Catalogue response is stored here first.
   * League-detail response replaces it during detail
   * synchronization.
   */
  @Prop({
    type: Object,
  })
  payload?: Record<string, unknown>;

  /**
   * Last time the league record was synchronized from ESPN.
   */
  @Prop({
    type: Date,
    index: true,
  })
  lastSyncedAt!: Date;
}

export const EspnLeagueSchema = SchemaFactory.createForClass(EspnLeague);

EspnLeagueSchema.index({
  priority: 1,
  isPriority: 1,
  name: 1,
});

EspnLeagueSchema.index({
  isActive: 1,
  priority: 1,
  season: 1,
});

EspnLeagueSchema.index({
  lastFixtureDate: -1,
});
