import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type CommunityPostDocument = HydratedDocument<CommunityPost>;

export enum CommunityReaction {
  STRONGLY_AGREE = 'strongly_agree',

  AGREE = 'agree',

  SLIGHTLY_AGREE = 'slightly_agree',

  SLIGHTLY_DISAGREE = 'slightly_disagree',

  DISAGREE = 'disagree',

  STRONGLY_DISAGREE = 'strongly_disagree',
}

@Schema({
  timestamps: true,
})
export class CommunityPost {
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
    maxlength: 1000,
  })
  message!: string;

  @Prop()
  category?: string;
  @Prop({
    type: Object,
    default: {
      strongly_agree: 0,

      agree: 0,

      slightly_agree: 0,

      slightly_disagree: 0,

      disagree: 0,

      strongly_disagree: 0,
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

  @Prop({
    default: false,
  })
  isFeatured!: boolean;

  @Prop({
    default: 0,
  })
  replyCount!: number;
}

export const CommunityPostSchema = SchemaFactory.createForClass(CommunityPost);
