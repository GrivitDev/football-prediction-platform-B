import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type TeamCompetitionStatsDocument =
  HydratedDocument<TeamCompetitionStats>;

@Schema({
  timestamps: true,
  collection: 'sports_team_competition_stats',
})
export class TeamCompetitionStats {
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
  // TABLE
  // ==========================================================

  @Prop({ type: Number })
  position?: number;

  @Prop({ type: Number, default: 0 })
  points!: number;

  @Prop({ type: Number, default: 0 })
  played!: number;

  @Prop({ type: Number, default: 0 })
  wins!: number;

  @Prop({ type: Number, default: 0 })
  draws!: number;

  @Prop({ type: Number, default: 0 })
  losses!: number;

  @Prop({ type: Number, default: 0 })
  goalsFor!: number;

  @Prop({ type: Number, default: 0 })
  goalsAgainst!: number;

  @Prop({ type: Number, default: 0 })
  goalDifference!: number;

  // ==========================================================
  // OVERALL
  // ==========================================================

  @Prop({ type: Number, default: 0 })
  averageGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  averageGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  winRate!: number;

  @Prop({ type: Number, default: 0 })
  drawRate!: number;

  @Prop({ type: Number, default: 0 })
  lossRate!: number;

  @Prop({ type: Number, default: 0 })
  bttsRate!: number;

  @Prop({ type: Number, default: 0 })
  over05Rate!: number;

  @Prop({ type: Number, default: 0 })
  over15Rate!: number;

  @Prop({ type: Number, default: 0 })
  over25Rate!: number;

  @Prop({ type: Number, default: 0 })
  over35Rate!: number;

  @Prop({ type: Number, default: 0 })
  over45Rate!: number;

  @Prop({ type: Number, default: 0 })
  over55Rate!: number;

  @Prop({ type: Number, default: 0 })
  under15Rate!: number;

  @Prop({ type: Number, default: 0 })
  under25Rate!: number;

  @Prop({ type: Number, default: 0 })
  under35Rate!: number;

  @Prop({ type: Number, default: 0 })
  under45Rate!: number;

  @Prop({ type: Number, default: 0 })
  under55Rate!: number;

  @Prop({ type: Number, default: 0 })
  cleanSheetRate!: number;

  @Prop({ type: Number, default: 0 })
  failedToScoreRate!: number;

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

  // ==========================================================
  // HOME
  // ==========================================================

  @Prop({ type: Number, default: 0 })
  homePlayed!: number;

  @Prop({ type: Number, default: 0 })
  homeWins!: number;

  @Prop({ type: Number, default: 0 })
  homeDraws!: number;

  @Prop({ type: Number, default: 0 })
  homeLosses!: number;

  @Prop({ type: Number, default: 0 })
  homePoints!: number;

  @Prop({ type: Number, default: 0 })
  homeWinRate!: number;

  @Prop({ type: Number, default: 0 })
  homeDrawRate!: number;

  @Prop({ type: Number, default: 0 })
  homeLossRate!: number;

  @Prop({ type: Number, default: 0 })
  homeGoalsFor!: number;

  @Prop({ type: Number, default: 0 })
  homeGoalsAgainst!: number;

  @Prop({ type: Number, default: 0 })
  homeAverageGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  homeAverageGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  homeBttsRate!: number;

  @Prop({ type: Number, default: 0 })
  homeOver15Rate!: number;

  @Prop({ type: Number, default: 0 })
  homeOver25Rate!: number;

  @Prop({ type: Number, default: 0 })
  homeOver35Rate!: number;

  @Prop({ type: Number, default: 0 })
  homeCleanSheetRate!: number;

  @Prop({ type: Number, default: 0 })
  homeFailedToScoreRate!: number;

  // ==========================================================
  // AWAY
  // ==========================================================

  @Prop({ type: Number, default: 0 })
  awayPlayed!: number;

  @Prop({ type: Number, default: 0 })
  awayWins!: number;

  @Prop({ type: Number, default: 0 })
  awayDraws!: number;

  @Prop({ type: Number, default: 0 })
  awayLosses!: number;

  @Prop({ type: Number, default: 0 })
  awayPoints!: number;

  @Prop({ type: Number, default: 0 })
  awayWinRate!: number;

  @Prop({ type: Number, default: 0 })
  awayDrawRate!: number;

  @Prop({ type: Number, default: 0 })
  awayLossRate!: number;

  @Prop({ type: Number, default: 0 })
  awayGoalsFor!: number;

  @Prop({ type: Number, default: 0 })
  awayGoalsAgainst!: number;

  @Prop({ type: Number, default: 0 })
  awayAverageGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  awayAverageGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  awayBttsRate!: number;

  @Prop({ type: Number, default: 0 })
  awayOver15Rate!: number;

  @Prop({ type: Number, default: 0 })
  awayOver25Rate!: number;

  @Prop({ type: Number, default: 0 })
  awayOver35Rate!: number;

  @Prop({ type: Number, default: 0 })
  awayCleanSheetRate!: number;

  @Prop({ type: Number, default: 0 })
  awayFailedToScoreRate!: number;

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
  // TIMING
  // ==========================================================

  @Prop({ type: Number, default: 0 })
  firstHalfGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  firstHalfGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  secondHalfGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  secondHalfGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  averageFirstHalfGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  averageFirstHalfGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  averageSecondHalfGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  averageSecondHalfGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  scoredFirstRate!: number;

  @Prop({ type: Number, default: 0 })
  concededFirstRate!: number;

  @Prop({ type: Number, default: 0 })
  cameFromBehindRate!: number;

  @Prop({ type: Number, default: 0 })
  protectedLeadRate!: number;

  // ==========================================================
  // RECENT FORM
  // ==========================================================

  @Prop({ type: [String], default: [] })
  lastFive!: string[];

  @Prop({ type: [String], default: [] })
  lastFiveHome!: string[];

  @Prop({ type: [String], default: [] })
  lastFiveAway!: string[];

  @Prop({ type: Number, default: 0 })
  lastFivePoints!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveAverageGoalsScored!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveAverageGoalsConceded!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveBttsRate!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveOver15Rate!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveOver25Rate!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveOver35Rate!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveCleanSheetRate!: number;

  @Prop({ type: Number, default: 0 })
  lastFiveFailedToScoreRate!: number;

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
  lastFiveAverageYellowCards?: number;

  @Prop({ type: Number })
  lastFiveAverageRedCards?: number;

  // ==========================================================
  // DERIVED STRENGTH
  // ==========================================================

  @Prop({ type: Number, default: 0 })
  recentFormScore!: number;

  @Prop({ type: Number, default: 0 })
  homeStrengthScore!: number;

  @Prop({ type: Number, default: 0 })
  awayStrengthScore!: number;

  @Prop({ type: Number, default: 0 })
  overallStrengthScore!: number;

  // ==========================================================
  // RELIABILITY
  // ==========================================================

  @Prop({ type: Number, default: 0 })
  dataCompletenessScore!: number;

  @Prop({ type: Number, default: 0 })
  statisticalSampleScore!: number;

  @Prop({ type: Number, default: 0 })
  statsReliabilityScore!: number;

  // ==========================================================
  // FIXTURE CONTEXT
  // ==========================================================

  @Prop({ type: Date })
  previousMatchDate?: Date;

  @Prop({ type: Number, default: 0 })
  daysSincePreviousMatch!: number;

  @Prop({ type: Date })
  nextMatchDate?: Date;

  @Prop({ type: Number, default: 0 })
  daysUntilNextMatch!: number;

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

export const TeamCompetitionStatsSchema =
  SchemaFactory.createForClass(TeamCompetitionStats);

TeamCompetitionStatsSchema.index(
  {
    competitionId: 1,
    season: 1,
    teamId: 1,
  },
  {
    unique: true,
  },
);

TeamCompetitionStatsSchema.index({
  competitionId: 1,
  season: 1,
  position: 1,
});

TeamCompetitionStatsSchema.index({
  competitionId: 1,
  season: 1,
  overallStrengthScore: -1,
});

TeamCompetitionStatsSchema.index({
  teamId: 1,
  calculatedAt: -1,
});
