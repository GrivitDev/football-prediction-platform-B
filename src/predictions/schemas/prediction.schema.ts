import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { PredictionMarkets } from '../constants/prediction-markets';
import type { PredictionMarket } from '../constants/prediction-markets';

export type PredictionDocument = HydratedDocument<Prediction>;

export type PredictionAccessType = 'free' | 'regular' | 'vip' | 'premium';

export type PredictionStatus = 'pending' | 'won' | 'lost' | 'void';

export type PredictionMarketStatus =
  'pending' | 'won' | 'lost' | 'void' | 'push';

export type PredictionProbabilitySource =
  'ESPN_PROBABILITY' | 'IMPLIED_ESPN_ODDS' | 'IMPLIED_ODDS_API' | 'COMBINATION';

export type PredictionOddsSource = 'ESPN' | 'ODDS_API';

@Schema({ _id: false })
export class PredictionSelection {
  @Prop({
    required: true,
    trim: true,
    enum: Object.values(PredictionMarkets),
  })
  market!: PredictionMarket;

  @Prop({
    required: true,
    trim: true,
  })
  selection!: string;
}

export const PredictionSelectionSchema =
  SchemaFactory.createForClass(PredictionSelection);

@Schema({ _id: false })
export class PredictionMarketEntry {
  @Prop({
    required: true,
    trim: true,
    enum: Object.values(PredictionMarkets),
  })
  market!: PredictionMarket;

  @Prop({
    required: true,
    trim: true,
  })
  selection!: string;

  /**
   * Sports-data probability supporting this exact selection.
   * Stored as a percentage from 0 to 100.
   */
  @Prop({
    required: true,
    min: 0,
    max: 100,
  })
  probability!: number;

  @Prop({
    required: true,
    enum: [
      'ESPN_PROBABILITY',
      'IMPLIED_ESPN_ODDS',
      'IMPLIED_ODDS_API',
      'COMBINATION',
    ],
  })
  probabilitySource!: PredictionProbabilitySource;

  /**
   * Direct provider price when Sports data exposes one.
   */
  @Prop({
    min: 1,
  })
  odds?: number;

  /**
   * Fair odds implied only by the stored Sports-data probability.
   */
  @Prop({
    required: true,
    min: 1,
  })
  fairOdds!: number;

  @Prop({
    enum: ['ESPN', 'ODDS_API'],
  })
  oddsSource?: PredictionOddsSource;

  @Prop({
    enum: ['pending', 'won', 'lost', 'void', 'push'],
    default: 'pending',
  })
  status!: PredictionMarketStatus;
}

export const PredictionMarketEntrySchema = SchemaFactory.createForClass(
  PredictionMarketEntry,
);

@Schema({ timestamps: true })
export class Prediction {
  @Prop({
    required: true,
    trim: true,
  })
  matchId!: string;

  @Prop({
    required: true,
    trim: true,
  })
  leagueCode!: string;

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

  @Prop({
    required: true,
    trim: true,
  })
  homeTeam!: string;

  @Prop({
    required: true,
    trim: true,
  })
  awayTeam!: string;

  @Prop({
    trim: true,
  })
  homeTeamBadge?: string;

  @Prop({
    trim: true,
  })
  awayTeamBadge?: string;

  /**
   * Exact prediction selected by the administrator.
   * The engine never chooses or replaces this selection.
   */
  @Prop({
    type: PredictionSelectionSchema,
    required: true,
    _id: false,
  })
  prediction!: PredictionSelection;

  /**
   * Probability supporting the exact administrator selection.
   */
  @Prop({
    required: true,
    min: 0,
    max: 100,
  })
  predictionProbability!: number;

  @Prop({
    required: true,
    enum: [
      'ESPN_PROBABILITY',
      'IMPLIED_ESPN_ODDS',
      'IMPLIED_ODDS_API',
      'COMBINATION',
    ],
  })
  probabilitySource!: PredictionProbabilitySource;

  /**
   * Support confidence only.
   *
   * This is not an accuracy probability and must never be interpreted as
   * "chance the prediction will win".
   */
  @Prop({
    required: true,
    min: 60,
    max: 98,
  })
  confidence!: number;

  @Prop({
    min: 1,
  })
  predictionOdds?: number;

  @Prop({
    required: true,
    min: 1,
  })
  predictionFairOdds!: number;

  @Prop({
    enum: ['ESPN', 'ODDS_API'],
  })
  predictionOddsSource?: PredictionOddsSource;

  @Prop({
    type: [PredictionMarketEntrySchema],
    required: true,
    default: [],
  })
  markets!: PredictionMarketEntry[];

  @Prop({
    type: {
      fixtureCollectedAt: { type: Date, required: true },
      summaryCollectedAt: { type: Date, required: true },
    },
    _id: false,
  })
  sportsDataSnapshot?: {
    fixtureCollectedAt: Date;
    summaryCollectedAt: Date;
  };

  @Prop({
    trim: true,
  })
  modelVersion?: string;

  @Prop({
    type: Date,
  })
  calculatedAt?: Date;

  @Prop({
    enum: ['free', 'regular', 'vip', 'premium'],
    default: 'free',
  })
  accessType!: PredictionAccessType;

  @Prop({
    default: 0,
    min: 0,
  })
  price!: number;

  @Prop({
    required: true,
  })
  matchDate!: string;

  @Prop({
    required: true,
  })
  kickoffTimestamp!: number;

  @Prop({
    enum: ['pending', 'won', 'lost', 'void'],
    default: 'pending',
  })
  status!: PredictionStatus;

  @Prop({
    default: false,
  })
  settled!: boolean;

  @Prop({
    default: false,
  })
  deleted!: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  settledAt!: Date | null;
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

PredictionSchema.index({
  deleted: 1,
  settled: 1,
  status: 1,
  kickoffTimestamp: 1,
});

PredictionSchema.index({
  deleted: 1,
  leagueCode: 1,
  kickoffTimestamp: 1,
});
