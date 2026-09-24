// src/sports/schemas/espn/espn-league.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { CompetitionPriority } from '../../enums/competition-priority.enum';

export type EspnLeagueDocument = HydratedDocument<EspnLeague>;

@Schema({
  timestamps: true,
  collection: 'sports_espn_leagues',
})
export class EspnLeague {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  leagueId!: string;

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

  @Prop({
    type: String,
    enum: Object.values(CompetitionPriority),
    default: CompetitionPriority.SELECTIVE,
    index: true,
  })
  priority!: CompetitionPriority;

  @Prop({
    type: Boolean,
    default: false,
    index: true,
  })
  isPriority!: boolean;

  @Prop({
    type: Boolean,
    default: true,
    index: true,
  })
  isActive!: boolean;

  @Prop({
    type: Number,
    index: true,
  })
  season?: number;

  @Prop({
    type: Date,
    index: true,
  })
  seasonStartDate?: Date;

  @Prop({
    type: Date,
    index: true,
  })
  seasonEndDate?: Date;

  @Prop({
    type: Date,
    index: true,
  })
  lastFixtureDate?: Date;

  @Prop({
    type: Date,
    index: true,
  })
  nextFixtureDate?: Date;

  /**
   * Complete ESPN league payload.
   *
   * Catalogue synchronization stores the catalogue payload only
   * when the document is first created.
   *
   * League-detail synchronization replaces this with the
   * authoritative league-detail payload.
   */
  @Prop({
    type: Object,
  })
  payload?: Record<string, unknown>;

  /**
   * Last time the ESPN catalogue record was synchronized.
   *
   * This is deliberately separate from detailLastSyncedAt.
   */
  @Prop({
    type: Date,
    index: true,
  })
  lastSyncedAt!: Date;

  /**
   * Last time the full ESPN league-detail endpoint was
   * successfully synchronized.
   *
   * This allows startup to distinguish:
   *
   * catalogue exists
   * from
   * league details exist.
   */
  @Prop({
    type: Date,
    index: true,
  })
  detailLastSyncedAt?: Date;
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
