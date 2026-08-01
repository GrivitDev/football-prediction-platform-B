import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

import { CommunityPostType } from '../enums/community-post-type.enum';

import { CommunityMediaType } from '../enums/community-media-type.enum';

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
    enum: CommunityPostType,
  })
  type!: CommunityPostType;

  @Prop({
    maxlength: 100,
  })
  title?: string;

  @Prop({
    maxlength: 1000,
  })
  message?: string;

  @Prop({
    type: {
      type: String,
      enum: CommunityMediaType,
    },

    url: String,

    publicId: String,
  })
  media?: {
    type: CommunityMediaType;

    url: string;

    publicId: string;
  };

  @Prop()
  category?: string;

  @Prop({
    type: {
      strongly_agree: {
        type: Number,
        default: 0,
      },

      agree: {
        type: Number,
        default: 0,
      },

      slightly_agree: {
        type: Number,
        default: 0,
      },

      slightly_disagree: {
        type: Number,
        default: 0,
      },

      disagree: {
        type: Number,
        default: 0,
      },

      strongly_disagree: {
        type: Number,
        default: 0,
      },
    },

    default: () => ({
      strongly_agree: 0,
      agree: 0,
      slightly_agree: 0,
      slightly_disagree: 0,
      disagree: 0,
      strongly_disagree: 0,
    }),
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
    default: false,
  })
  isPinned!: boolean;

  @Prop({
    default: false,
  })
  isLocked!: boolean;

  @Prop({
    default: 0,
  })
  replyCount!: number;
}

export const CommunityPostSchema = SchemaFactory.createForClass(CommunityPost);

CommunityPostSchema.index({
  title: 'text',
});
