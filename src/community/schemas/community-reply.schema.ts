import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type CommunityReplyDocument = HydratedDocument<CommunityReply>;

@Schema({
  timestamps: true,
})
export class CommunityReply {
  @Prop({
    required: true,
    index: true,
  })
  postId!: string;

  @Prop({
    required: true,
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
    maxlength: 500,
  })
  message!: string;

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
}

export const CommunityReplySchema =
  SchemaFactory.createForClass(CommunityReply);
