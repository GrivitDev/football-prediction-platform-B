import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type HeadToHeadDocument = HydratedDocument<HeadToHead>;

@Schema({
  _id: false,
})
export class HeadToHeadMeeting {
  @Prop({
    required: true,
    trim: true,
  })
  fixtureId!: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
  })
  competitionId!: string;

  @Prop({
    required: true,
  })
  season!: number;

  @Prop({
    required: true,
  })
  date!: Date;

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

  @Prop({
    required: true,
  })
  homeGoals!: number;

  @Prop({
    required: true,
  })
  awayGoals!: number;

  // ==========================================================
  // DERIVED MATCH DATA
  // ==========================================================

  @Prop({
    type: Number,
  })
  firstHalfHomeGoals?: number;

  @Prop({
    type: Number,
  })
  firstHalfAwayGoals?: number;

  @Prop({
    type: Number,
  })
  secondHalfHomeGoals?: number;

  @Prop({
    type: Number,
  })
  secondHalfAwayGoals?: number;

  @Prop({
    type: Boolean,
  })
  btts?: boolean;

  @Prop({
    type: Boolean,
  })
  homeCleanSheet?: boolean;

  @Prop({
    type: Boolean,
  })
  awayCleanSheet?: boolean;

  @Prop({
    type: Boolean,
  })
  homeScoredFirst?: boolean;

  @Prop({
    type: Boolean,
  })
  awayScoredFirst?: boolean;

  @Prop({
    type: Object,
    default: {},
  })
  statistics?: Record<string, unknown>;
}

export const HeadToHeadMeetingSchema =
  SchemaFactory.createForClass(HeadToHeadMeeting);

@Schema({
  timestamps: true,
  collection: 'sports_head_to_head',
})
export class HeadToHead {
  // ==========================================================
  // IDENTITY
  // ==========================================================

  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  pairKey!: string;

  @Prop({
    required: true,
    index: true,
    trim: true,
  })
  teamAId!: string;

  @Prop({
    required: true,
  })
  teamAName!: string;

  @Prop({
    required: true,
    index: true,
    trim: true,
  })
  teamBId!: string;

  @Prop({
    required: true,
  })
  teamBName!: string;

  // ==========================================================
  // BASIC RESULTS
  // ==========================================================

  @Prop({
    required: true,
    default: 0,
  })
  totalMeetings!: number;

  @Prop({
    required: true,
    default: 0,
  })
  teamAWins!: number;

  @Prop({
    required: true,
    default: 0,
  })
  draws!: number;

  @Prop({
    required: true,
    default: 0,
  })
  teamBWins!: number;

  @Prop({
    required: true,
    default: 0,
  })
  teamAGoals!: number;

  @Prop({
    required: true,
    default: 0,
  })
  teamBGoals!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  averageTeamAGoals!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  averageTeamBGoals!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  averageTotalGoals!: number;

  // ==========================================================
  // RESULT PROBABILITIES
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  teamAWinRate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  drawRate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBWinRate!: number;

  // ==========================================================
  // GOAL MARKETS
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  bttsRate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  over05Rate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  over15Rate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  over25Rate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  over35Rate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  over45Rate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  over55Rate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  cleanSheetTeamARate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  cleanSheetTeamBRate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  failedToScoreTeamARate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  failedToScoreTeamBRate!: number;

  // ==========================================================
  // HOME / AWAY H2H
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  teamAHomeMeetings!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamAHomeWins!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamAHomeDraws!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamAHomeLosses!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamAHomeWinRate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBHomeMeetings!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBHomeWins!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBHomeDraws!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBHomeLosses!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBHomeWinRate!: number;

  // ==========================================================
  // RECENT H2H WINDOWS
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  lastFive!: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {},
  })
  lastTen!: Record<string, unknown>;

  // ==========================================================
  // EXACT SCORES
  // ==========================================================

  @Prop({
    type: Object,
    default: {},
  })
  exactScoreDistribution!: Record<string, number>;

  @Prop({
    type: Object,
    default: {},
  })
  totalGoalsDistribution!: Record<string, number>;

  // ==========================================================
  // TIMING
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  firstHalfGoalsTeamA!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  firstHalfGoalsTeamB!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  secondHalfGoalsTeamA!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  secondHalfGoalsTeamB!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamAScoredFirstRate!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  teamBScoredFirstRate!: number;

  // ==========================================================
  // MEETINGS
  // ==========================================================

  @Prop({
    type: [HeadToHeadMeetingSchema],
    default: [],
  })
  meetings!: HeadToHeadMeeting[];

  @Prop({
    type: Date,
    default: null,
  })
  lastMeetingAt?: Date | null;

  // ==========================================================
  // QUALITY
  // ==========================================================

  @Prop({
    type: Number,
    default: 0,
  })
  sampleReliabilityScore!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  dataCompletenessScore!: number;

  @Prop({
    type: Date,
    default: null,
  })
  calculatedAt?: Date;
}

export const HeadToHeadSchema = SchemaFactory.createForClass(HeadToHead);

HeadToHeadSchema.index({
  teamAId: 1,
  teamBId: 1,
});

HeadToHeadSchema.index({
  lastMeetingAt: -1,
});

HeadToHeadSchema.index({
  teamAId: 1,
  teamBId: 1,
  calculatedAt: -1,
});
