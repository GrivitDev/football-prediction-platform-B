// src/predictions/schemas/prediction.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PredictionDocument = HydratedDocument<Prediction>;

@Schema({ timestamps: true })
export class Prediction {
  @Prop({ required: true })
  matchId!: string;

  @Prop({ required: true })
  leagueCode!: string;

  // Optional enriched league data (from API)
  @Prop({
    type: {
      code: String,
      name: String,
      country: String,
      emblem: String,
    },

    _id: false,
  })
  league?: {
    code: string;
    name: string;
    country: string;
    emblem?: string;
  };

  @Prop({ required: true })
  homeTeam!: string;

  @Prop({ required: true })
  awayTeam!: string;

  @Prop()
  homeTeamBadge?: string;

  @Prop()
  awayTeamBadge?: string;

  // SYSTEM GENERATED
  @Prop({ required: true })
  prediction!: 'HOME' | 'DRAW' | 'AWAY';

  @Prop({
    type: {
      home: Number,
      draw: Number,
      away: Number,
    },
    required: true,
    _id: false,
  })
  probabilities!: {
    home: number;
    draw: number;
    away: number;
  };

  @Prop({
    type: [
      {
        market: { type: String, required: true },
        selection: { type: String, default: '' },
      },
    ],
    default: [],
  })
  markets!: { market: string; selection?: string }[];

  @Prop({ required: true, min: 1, max: 100 })
  confidence!: number;

  @Prop({ enum: ['free', 'regular', 'vip'], default: 'free' })
  accessType!: 'free' | 'regular' | 'vip';

  @Prop({ default: 0 })
  price!: number;

  @Prop({ required: true })
  matchDate!: string;

  // IMPORTANT FOR ACCESS LOGIC
  @Prop({ required: true })
  kickoffTimestamp!: number;

  @Prop({ enum: ['pending', 'won', 'lost', 'void'], default: 'pending' })
  status!: 'pending' | 'won' | 'lost' | 'void';

  @Prop({ default: false })
  settled!: boolean;

  @Prop({ default: false })
  deleted!: boolean;

  @Prop({ type: Date, default: null })
  settledAt!: Date;
}

export const PredictionSchema = SchemaFactory.createForClass(Prediction);

PredictionSchema.index(
  {
    matchId: 1,
  },
  {
    unique: true,
  },
);
