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
    default: true,
  })
  isVisible!: boolean;
}

export const CommunityReplySchema =
  SchemaFactory.createForClass(CommunityReply);
