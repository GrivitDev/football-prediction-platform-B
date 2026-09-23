import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type MatchDerivedDataDocument = HydratedDocument<MatchDerivedData>;

@Schema({
  timestamps: true,
  collection: 'sports_match_derived_data',
})
export class MatchDerivedData {
  // ==========================================================
  // MATCH IDENTITY
  // ==========================================================

  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  eventId!: string;

  @Prop({
    required: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  competitionId!: string;

  @Prop({
    required: true,
    index: true,
  })
  season!: number;

  @Prop({
    required: true,
    index: true,
    type: Date,
  })
  fixtureDate!: Date;

  @Prop({
    required: true,
    trim: true,
  })
  homeTeamId!: string;

  @Prop({
    required: true,
  })
  homeTeamName!: string;

  @Prop({
    required: true,
    trim: true,
  })
  awayTeamId!: string;

  @Prop({
    required: true,
  })
  awayTeamName!: string;

  // ==========================================================
  // TEAM PROFILE COMPARISON
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  homeProfile!: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {},
  })
  awayProfile!: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {},
  })
  homeTeamStats!: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {},
  })
  awayTeamStats!: Record<string, unknown>;

  // ==========================================================
  // HEAD TO HEAD
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  headToHead!: Record<string, unknown>;

  // ==========================================================
  // LEAGUE CONTEXT
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  leagueContext!: Record<string, unknown>;

  // ==========================================================
  // MODEL GOAL EXPECTATIONS
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  expectedHomeGoals!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  expectedAwayGoals!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  expectedTotalGoals!: number;

  @Prop({
    type: Object,
    default: {},
  })
  expectedGoalModel!: Record<string, unknown>;

  // ==========================================================
  // SCORE PROBABILITIES
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  exactScoreProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  homeGoalsProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  awayGoalsProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  totalGoalsProbabilities!: Record<string, number>;

  // ==========================================================
  // MARKET PROBABILITIES
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  marketProbabilities!: Record<string, number>;

  /**
   * Probabilities can include:
   *
   * DOUBLE_CHANCE
   * DRAW_NO_BET
   * OVER_UNDER
   * BOTH_TEAMS_TO_SCORE
   * BTTS_GOALS
   * GOAL_RANGE
   * TEAM_TOTAL_GOALS
   * EXACT_GOALS
   * CLEAN_SHEET
   * HALF_TIME_RESULT
   * SECOND_HALF_RESULT
   * HALF_TIME_FULL_TIME
   * FIRST_HALF_GOALS
   * SECOND_HALF_GOALS
   * ASIAN_HANDICAP
   * EUROPEAN_HANDICAP
   */

  // ==========================================================
  // TIMING PROBABILITIES
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  firstHalfProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  secondHalfProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  halfTimeFullTimeProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  scoringFirstProbabilities!: Record<string, number>;

  // ==========================================================
  // ODDS
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  bookmakerImpliedProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  bookmakerConsensus!: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {},
  })
  bookmakerMovement!: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {},
  })
  valueAnalysis!: Record<string, unknown>;

  // ==========================================================
  // MODEL VS MARKET
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  probabilityEdge!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  marketAgreement!: Record<string, number>;

  // ==========================================================
  // DATA QUALITY
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  dataCompletenessScore!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  statisticalReliabilityScore!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  marketDataQualityScore!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  overallDataQualityScore!: number;

  @Prop({
    type: Object,
    default: {},
  })
  dataSources!: Record<string, unknown>;

  // ==========================================================
  // CALCULATION
  // ==========================================================

  @Prop({
    required: true,
    type: Date,
    index: true,
  })
  calculatedAt!: Date;
}

export const MatchDerivedDataSchema =
  SchemaFactory.createForClass(MatchDerivedData);

MatchDerivedDataSchema.index({
  competitionId: 1,
  fixtureDate: 1,
});

MatchDerivedDataSchema.index({
  homeTeamId: 1,
  awayTeamId: 1,
  fixtureDate: 1,
});

MatchDerivedDataSchema.index({
  competitionId: 1,
  calculatedAt: -1,
});

MatchDerivedDataSchema.index({
  fixtureDate: 1,
  calculatedAt: -1,
});
