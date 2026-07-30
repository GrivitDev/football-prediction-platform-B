import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FeedbackDocument = HydratedDocument<Feedback>;

export enum FeedbackReaction {
  FIRE = '🔥',

  LOVE = '❤️',

  FOOTBALL = '⚽',

  WIN = '🏆',

  ROCKET = '🚀',

  THUMBS = '👍',
}

@Schema({
  timestamps: true,
})
export class Feedback {
  @Prop({
    required: true,
    index: true,
  })
  userId!: string;

  @Prop({
    required: true,
  })
  username!: string;

  @Prop({
    required: true,
  })
  fullName!: string;

  @Prop({
    required: true,
    maxlength: 100,
  })
  title!: string;

  @Prop({
    required: true,
    maxlength: 500,
  })
  message!: string;

  @Prop({
    type: Object,
    default: {
      '🔥': 0,
      '❤️': 0,
      '⚽': 0,
      '🏆': 0,
      '🚀': 0,
      '👍': 0,
    },
  })
  reactions!: Record<string, number>;

  @Prop({
    type: [String],
    default: [],
  })
  reactedBy!: string[];

  @Prop({
    default: true,
  })
  isVisible!: boolean;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);
