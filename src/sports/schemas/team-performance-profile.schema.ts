import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type TeamPerformanceProfileDocument =
  HydratedDocument<TeamPerformanceProfile>;

@Schema({
  timestamps: true,
  collection: 'sports_team_performance_profiles',
})
export class TeamPerformanceProfile {
  // ==========================================================
  // IDENTITY
  // ==========================================================

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
    trim: true,
  })
  teamId!: string;

  @Prop({
    required: true,
    trim: true,
  })
  teamName!: string;

  @Prop({
    type: String,
  })
  teamLogo?: string;

  // ==========================================================
  // SAMPLE SIZE
  // ==========================================================

  @Prop({ required: true, default: 0 })
  matchesAnalyzed!: number;

  @Prop({ required: true, default: 0 })
  matchesLastFive!: number;

  @Prop({ required: true, default: 0 })
  matchesLastTen!: number;

  // ==========================================================
  // CURRENT FORM
  // ==========================================================

  @Prop({ type: [String], default: [] })
  formLastFive!: string[];

  @Prop({ type: [String], default: [] })
  formLastTen!: string[];

  @Prop({ required: true, default: 0 })
  lastFivePoints!: number;

  @Prop({ required: true, default: 0 })
  lastTenPoints!: number;

  @Prop({ required: true, default: 0 })
  currentWinStreak!: number;

  @Prop({ required: true, default: 0 })
  currentDrawStreak!: number;

  @Prop({ required: true, default: 0 })
  currentLossStreak!: number;

  @Prop({ required: true, default: 0 })
  unbeatenStreak!: number;

  @Prop({ required: true, default: 0 })
  winlessStreak!: number;

  @Prop({ required: true, default: 0 })
  scoringStreak!: number;

  @Prop({ required: true, default: 0 })
  cleanSheetStreak!: number;

  // ==========================================================
  // RECENT FORM
  // ==========================================================

  @Prop({ required: true, default: 0 })
  recentWins!: number;

  @Prop({ required: true, default: 0 })
  recentDraws!: number;

  @Prop({ required: true, default: 0 })
  recentLosses!: number;

  @Prop({ required: true, default: 0 })
  recentWinRate!: number;

  @Prop({ required: true, default: 0 })
  recentDrawRate!: number;

  @Prop({ required: true, default: 0 })
  recentLossRate!: number;

  @Prop({ required: true, default: 0 })
  recentPointsPerMatch!: number;

  // ==========================================================
  // OVERALL RESULTS
  // ==========================================================

  @Prop({ required: true, default: 0 })
  wins!: number;

  @Prop({ required: true, default: 0 })
  draws!: number;

  @Prop({ required: true, default: 0 })
  losses!: number;

  @Prop({ required: true, default: 0 })
  points!: number;

  @Prop({ required: true, default: 0 })
  goalsScored!: number;

  @Prop({ required: true, default: 0 })
  goalsConceded!: number;

  @Prop({ required: true, default: 0 })
  averageGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  averageGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  goalDifference!: number;

  @Prop({ required: true, default: 0 })
  averageGoalDifference!: number;

  // ==========================================================
  // GOAL MARKETS
  // ==========================================================

  @Prop({ required: true, default: 0 })
  cleanSheets!: number;

  @Prop({ required: true, default: 0 })
  cleanSheetRate!: number;

  @Prop({ required: true, default: 0 })
  failedToScore!: number;

  @Prop({ required: true, default: 0 })
  failedToScoreRate!: number;

  @Prop({ required: true, default: 0 })
  bttsCount!: number;

  @Prop({ required: true, default: 0 })
  bttsRate!: number;

  @Prop({ required: true, default: 0 })
  over05Count!: number;

  @Prop({ required: true, default: 0 })
  over05Rate!: number;

  @Prop({ required: true, default: 0 })
  over15Count!: number;

  @Prop({ required: true, default: 0 })
  over15Rate!: number;

  @Prop({ required: true, default: 0 })
  over25Count!: number;

  @Prop({ required: true, default: 0 })
  over25Rate!: number;

  @Prop({ required: true, default: 0 })
  over35Count!: number;

  @Prop({ required: true, default: 0 })
  over35Rate!: number;

  @Prop({ required: true, default: 0 })
  over45Count!: number;

  @Prop({ required: true, default: 0 })
  over45Rate!: number;

  @Prop({ required: true, default: 0 })
  over55Count!: number;

  @Prop({ required: true, default: 0 })
  over55Rate!: number;

  @Prop({ required: true, default: 0 })
  under15Rate!: number;

  @Prop({ required: true, default: 0 })
  under25Rate!: number;

  @Prop({ required: true, default: 0 })
  under35Rate!: number;

  @Prop({ required: true, default: 0 })
  under45Rate!: number;

  @Prop({ required: true, default: 0 })
  under55Rate!: number;

  // ==========================================================
  // GOAL DISTRIBUTIONS
  // ==========================================================

  @Prop({
    type: [Number],
    default: [],
  })
  goalDistribution!: number[];

  @Prop({
    type: Object,
    default: {},
  })
  exactScoreDistribution!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  historicalProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  totalGoalsProbabilities!: Record<string, number>;

  // ==========================================================
  // HOME
  // ==========================================================

  @Prop({ required: true, default: 0 })
  homeMatches!: number;

  @Prop({ required: true, default: 0 })
  homeWins!: number;

  @Prop({ required: true, default: 0 })
  homeDraws!: number;

  @Prop({ required: true, default: 0 })
  homeLosses!: number;

  @Prop({ required: true, default: 0 })
  homePoints!: number;

  @Prop({ required: true, default: 0 })
  homeWinRate!: number;

  @Prop({ required: true, default: 0 })
  homeDrawRate!: number;

  @Prop({ required: true, default: 0 })
  homeLossRate!: number;

  @Prop({ required: true, default: 0 })
  homeGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  homeGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  homeAverageGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  homeAverageGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  homeCleanSheetRate!: number;

  @Prop({ required: true, default: 0 })
  homeFailedToScoreRate!: number;

  @Prop({ required: true, default: 0 })
  homeBttsRate!: number;

  @Prop({ required: true, default: 0 })
  homeOver15Rate!: number;

  @Prop({ required: true, default: 0 })
  homeOver25Rate!: number;

  @Prop({ required: true, default: 0 })
  homeOver35Rate!: number;

  @Prop({
    type: Object,
    default: {},
  })
  homeAdvancedStats!: Record<string, unknown>;

  // ==========================================================
  // AWAY
  // ==========================================================

  @Prop({ required: true, default: 0 })
  awayMatches!: number;

  @Prop({ required: true, default: 0 })
  awayWins!: number;

  @Prop({ required: true, default: 0 })
  awayDraws!: number;

  @Prop({ required: true, default: 0 })
  awayLosses!: number;

  @Prop({ required: true, default: 0 })
  awayPoints!: number;

  @Prop({ required: true, default: 0 })
  awayWinRate!: number;

  @Prop({ required: true, default: 0 })
  awayDrawRate!: number;

  @Prop({ required: true, default: 0 })
  awayLossRate!: number;

  @Prop({ required: true, default: 0 })
  awayGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  awayGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  awayAverageGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  awayAverageGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  awayCleanSheetRate!: number;

  @Prop({ required: true, default: 0 })
  awayFailedToScoreRate!: number;

  @Prop({ required: true, default: 0 })
  awayBttsRate!: number;

  @Prop({ required: true, default: 0 })
  awayOver15Rate!: number;

  @Prop({ required: true, default: 0 })
  awayOver25Rate!: number;

  @Prop({ required: true, default: 0 })
  awayOver35Rate!: number;

  @Prop({
    type: Object,
    default: {},
  })
  awayAdvancedStats!: Record<string, unknown>;

  // ==========================================================
  // MATCH STATISTICS
  // ==========================================================

  @Prop({ type: Number })
  averagePossession?: number;

  @Prop({ type: Number })
  averageShots?: number;

  @Prop({ type: Number })
  averageShotsOnTarget?: number;

  @Prop({ type: Number })
  averageCorners?: number;

  @Prop({ type: Number })
  averageFouls?: number;

  @Prop({ type: Number })
  averageOffsides?: number;

  @Prop({ type: Number })
  averageYellowCards?: number;

  @Prop({ type: Number })
  averageRedCards?: number;

  @Prop({ type: Number })
  averageSaves?: number;

  @Prop({ type: Number })
  averageExpectedGoals?: number;

  // ==========================================================
  // LAST FIVE MATCH STATISTICS
  // ==========================================================

  @Prop({ type: Number })
  lastFiveAveragePossession?: number;

  @Prop({ type: Number })
  lastFiveAverageShots?: number;

  @Prop({ type: Number })
  lastFiveAverageShotsOnTarget?: number;

  @Prop({ type: Number })
  lastFiveAverageCorners?: number;

  @Prop({ type: Number })
  lastFiveAverageFouls?: number;

  @Prop({ type: Number })
  lastFiveAverageOffsides?: number;

  @Prop({ type: Number })
  lastFiveAverageYellowCards?: number;

  @Prop({ type: Number })
  lastFiveAverageRedCards?: number;

  @Prop({ type: Number })
  lastFiveAverageSaves?: number;

  @Prop({ type: Number })
  lastFiveAverageExpectedGoals?: number;

  // ==========================================================
  // SCORING TIMING
  // ==========================================================

  @Prop({ required: true, default: 0 })
  firstHalfGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  firstHalfGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  secondHalfGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  secondHalfGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  averageFirstHalfGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  averageFirstHalfGoalsConceded!: number;

  @Prop({ required: true, default: 0 })
  averageSecondHalfGoalsScored!: number;

  @Prop({ required: true, default: 0 })
  averageSecondHalfGoalsConceded!: number;

  @Prop({
    type: Object,
    default: {},
  })
  halfTimeProbabilities!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  scoringTimingProbabilities!: Record<string, number>;

  // ==========================================================
  // GAME MANAGEMENT
  // ==========================================================

  @Prop({ required: true, default: 0 })
  scoredFirstCount!: number;

  @Prop({ required: true, default: 0 })
  scoredFirstRate!: number;

  @Prop({ required: true, default: 0 })
  concededFirstCount!: number;

  @Prop({ required: true, default: 0 })
  concededFirstRate!: number;

  @Prop({ required: true, default: 0 })
  cameFromBehindCount!: number;

  @Prop({ required: true, default: 0 })
  cameFromBehindRate!: number;

  @Prop({ required: true, default: 0 })
  protectedLeadCount!: number;

  @Prop({ required: true, default: 0 })
  protectedLeadRate!: number;

  // ==========================================================
  // MOMENTUM / MODEL FEATURES
  // ==========================================================

  @Prop({ required: true, default: 0 })
  recentFormScore!: number;

  @Prop({ required: true, default: 0 })
  attackingFormScore!: number;

  @Prop({ required: true, default: 0 })
  defensiveFormScore!: number;

  @Prop({ required: true, default: 0 })
  homeFormScore!: number;

  @Prop({ required: true, default: 0 })
  awayFormScore!: number;

  @Prop({ required: true, default: 0 })
  momentumScore!: number;

  @Prop({ required: true, default: 0 })
  overallPerformanceScore!: number;

  // ==========================================================
  // FIXTURE CONTEXT
  // ==========================================================

  @Prop({ type: Date })
  previousMatchDate?: Date;

  @Prop({ type: Number, min: 0 })
  daysSincePreviousMatch?: number;

  @Prop({ type: Date })
  nextMatchDate?: Date;

  @Prop({ type: Number, min: 0 })
  daysUntilNextMatch?: number;

  // ==========================================================
  // CALCULATION QUALITY
  // ==========================================================

  @Prop({ required: true, default: 0 })
  dataCompletenessScore!: number;

  @Prop({ required: true, default: 0 })
  statisticalSampleScore!: number;

  @Prop({ required: true, default: 0 })
  profileReliabilityScore!: number;

  @Prop({ type: Object, default: {} })
  dataCoverage!: Record<string, unknown>;

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

export const TeamPerformanceProfileSchema = SchemaFactory.createForClass(
  TeamPerformanceProfile,
);

TeamPerformanceProfileSchema.index(
  {
    competitionId: 1,
    season: 1,
    teamId: 1,
  },
  {
    unique: true,
  },
);

TeamPerformanceProfileSchema.index({
  competitionId: 1,
  season: 1,
  overallPerformanceScore: -1,
});

TeamPerformanceProfileSchema.index({
  competitionId: 1,
  season: 1,
  momentumScore: -1,
});

TeamPerformanceProfileSchema.index({
  competitionId: 1,
  calculatedAt: -1,
});

TeamPerformanceProfileSchema.index({
  teamId: 1,
  calculatedAt: -1,
});
