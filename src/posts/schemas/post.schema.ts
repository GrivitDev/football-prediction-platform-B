import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type PostDocument = HydratedDocument<Post>;

@Schema({
  timestamps: true,
})
export class Post {
  @Prop({
    required: true,
  })
  title!: string;

  @Prop({
    required: true,
  })
  slug!: string;

  @Prop({
    required: true,
  })
  content!: string;

  @Prop({
    required: true,
  })
  excerpt!: string;

  @Prop({
    default: '',
  })
  featuredImage!: string;

  @Prop({
    default: false,
  })
  featured!: boolean;

  @Prop({
    default: true,
  })
  published!: boolean;

  @Prop({
    default: 0,
  })
  views!: number;

  @Prop({
    default: 'admin',
  })
  author!: string;
}

export const PostSchema = SchemaFactory.createForClass(Post);
