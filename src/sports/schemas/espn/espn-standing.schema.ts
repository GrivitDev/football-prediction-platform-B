import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type EspnStandingDocument = HydratedDocument<EspnStanding>;

@Schema({
  timestamps: true,
  collection: 'sports_espn_standings',
})
export class EspnStanding {
  @Prop({
    required: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  leagueId!: string;

  @Prop({
    required: true,
    index: true,
  })
  season!: number;

  @Prop({
    required: true,
    index: true,
    trim: true,
  })
  teamId!: string;

  @Prop({
    required: true,
  })
  rank!: number;

  @Prop({
    required: false,
  })
  points?: number;

  @Prop({
    required: false,
  })
  played?: number;

  @Prop({
    required: false,
  })
  wins?: number;

  @Prop({
    required: false,
  })
  draws?: number;

  @Prop({
    required: false,
  })
  losses?: number;

  @Prop({
    required: false,
  })
  goalsFor?: number;

  @Prop({
    required: false,
  })
  goalsAgainst?: number;

  @Prop({
    required: false,
  })
  goalDifference?: number;

  @Prop({
    required: false,
  })
  form?: string;

  @Prop({
    required: false,
  })
  description?: string;

  @Prop({
    type: Object,
    required: true,
  })
  payload!: Record<string, unknown>;

  @Prop({
    required: true,
    type: Date,
    index: true,
  })
  collectedAt!: Date;
}

export const EspnStandingSchema = SchemaFactory.createForClass(EspnStanding);

EspnStandingSchema.index(
  {
    leagueId: 1,
    season: 1,
    teamId: 1,
  },
  {
    unique: true,
  },
);

EspnStandingSchema.index({
  leagueId: 1,
  season: 1,
  rank: 1,
});

EspnStandingSchema.index({
  teamId: 1,
  collectedAt: -1,
});
