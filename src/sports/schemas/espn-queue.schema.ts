import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import {
  EspnQueueJobType,
  EspnQueueStatus,
} from '../interfaces/espn-queue.interface';

export type EspnQueueDocument = HydratedDocument<EspnQueue>;

@Schema({
  timestamps: true,
  collection: 'sports_espn_queue',
})
export class EspnQueue {
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  jobKey!: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(EspnQueueJobType),
    index: true,
  })
  type!: EspnQueueJobType;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  leagueId!: string;

  @Prop({
    type: Number,
    index: true,
  })
  season?: number;

  @Prop({
    trim: true,
    index: true,
  })
  eventId?: string;

  @Prop({
    trim: true,
    index: true,
  })
  competitionId?: string;

  @Prop({
    required: true,
    type: Number,
    index: true,
    min: 1,
  })
  priority!: number;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(EspnQueueStatus),
    default: EspnQueueStatus.PENDING,
    index: true,
  })
  status!: EspnQueueStatus;

  @Prop({
    required: true,
    default: 0,
    min: 0,
  })
  attempts!: number;

  @Prop({
    required: true,
    default: 3,
    min: 1,
  })
  maxAttempts!: number;

  @Prop({
    required: true,
    type: Date,
    index: true,
  })
  scheduledFor!: Date;

  @Prop({
    type: Date,
    index: true,
  })
  nextAttemptAt?: Date;

  @Prop({
    type: Date,
    index: true,
  })
  startedAt?: Date;

  @Prop({
    type: Date,
    index: true,
  })
  completedAt?: Date;

  @Prop({
    type: Date,
    index: true,
  })
  failedAt?: Date;

  @Prop({
    type: String,
  })
  lastError?: string;
}

export const EspnQueueSchema = SchemaFactory.createForClass(EspnQueue);

// ============================================================
// QUEUE PROCESSING INDEX
// ============================================================

EspnQueueSchema.index({
  status: 1,
  priority: 1,
  scheduledFor: 1,
  createdAt: 1,
});

// ============================================================
// JOB TYPE INDEX
// ============================================================

EspnQueueSchema.index({
  type: 1,
  status: 1,
  scheduledFor: 1,
});

// ============================================================
// LEAGUE / SEASON INDEX
// ============================================================

EspnQueueSchema.index({
  leagueId: 1,
  season: 1,
  type: 1,
});
