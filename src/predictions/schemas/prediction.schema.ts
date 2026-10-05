import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { PredictionMarkets } from '../constants/prediction-markets';
import type { PredictionMarket } from '../constants/prediction-markets';

export type PredictionDocument = HydratedDocument<Prediction>;

export type PredictionAccessType = 'free' | 'regular' | 'vip' | 'premium';

export type PredictionResult = 'HOME' | 'DRAW' | 'AWAY';

export type PredictionStatus = 'pending' | 'won' | 'lost' | 'void';

export type PredictionMarketStatus =
  'pending' | 'won' | 'lost' | 'void' | 'push';

export type PredictionOddsSource = 'ESPN' | 'FAIR';

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
   * Probability calculated from Sports data.
   * Stored as a percentage from 0 to 100.
   */
  @Prop({
    required: true,
    min: 0,
    max: 100,
  })
  probability!: number;

  /**
   * Decimal odds used by the prediction.
   *
   * ESPN odds are preferred when the Summary exposes a directly
   * identifiable price for this exact selection. Otherwise this
   * contains the model fair price derived from the calculated probability.
   */
  @Prop({
    min: 1,
  })
  odds?: number;

  /**
   * Decimal fair odds implied by the prediction model probability.
   */
  @Prop({
    min: 1,
  })
  fairOdds?: number;

  @Prop({
    enum: ['ESPN', 'FAIR'],
  })
  oddsSource?: PredictionOddsSource;

  /**
   * Settlement status for this individual market.
   */
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
   * System-generated overall match result.
   */
  @Prop({
    required: true,
    enum: ['HOME', 'DRAW', 'AWAY'],
  })
  prediction!: PredictionResult;

  /**
   * System-generated overall 1X2 probabilities.
   * Stored as percentages.
   */
  @Prop({
    type: {
      home: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      draw: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      away: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
    },
    required: true,
    _id: false,
  })
  probabilities!: {
    home: number;
    draw: number;
    away: number;
  };

  /**
   * Markets selected by the admin.
   *
   * Each market contains its own probability and
   * individual settlement status.
   */
  @Prop({
    type: [PredictionMarketEntrySchema],
    required: true,
    default: [],
  })
  markets!: PredictionMarketEntry[];

  /**
   * One confidence value for the complete prediction.
   */
  @Prop({
    required: true,
    min: 1,
    max: 98,
  })
  confidence!: number;

  /**
   * Decimal odds for the system-selected HOME/DRAW/AWAY prediction.
   */
  @Prop({
    min: 1,
  })
  predictionOdds?: number;

  /**
   * Decimal fair odds implied by the system probability for the selected result.
   */
  @Prop({
    min: 1,
  })
  predictionFairOdds?: number;

  @Prop({
    enum: ['ESPN', 'FAIR'],
  })
  predictionOddsSource?: PredictionOddsSource;

  /**
   * Snapshot timestamps from the Sports module used to calculate this prediction.
   */
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
