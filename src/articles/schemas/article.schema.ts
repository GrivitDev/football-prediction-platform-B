// src/articles/schemas/article.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { ArticleStatus } from '../enums/article-status.enum';

export type ArticleDocument = HydratedDocument<Article>;

@Schema({
  _id: false,
})
export class ArticleSeo {
  @Prop({
    trim: true,
    maxlength: 70,
    default: null,
  })
  title!: string | null;

  @Prop({
    trim: true,
    maxlength: 170,
    default: null,
  })
  description!: string | null;

  @Prop({
    trim: true,
    default: null,
  })
  focusKeyword!: string | null;

  @Prop({
    trim: true,
    default: null,
  })
  canonicalUrl!: string | null;
}

export const ArticleSeoSchema = SchemaFactory.createForClass(ArticleSeo);

@Schema({
  timestamps: true,
})
export class Article {
  @Prop({
    required: true,
    trim: true,
    maxlength: 200,
  })
  title!: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  })
  slug!: string;

  @Prop({
    trim: true,
    maxlength: 500,
    default: null,
  })
  excerpt!: string | null;

  @Prop({
    required: true,
  })
  content!: string;

  @Prop({
    required: true,
    type: Types.ObjectId,
    index: true,
  })
  authorId!: Types.ObjectId;

  @Prop({
    trim: true,
    maxlength: 1000,
    default: null,
  })
  featuredImageUrl!: string | null;

  @Prop({
    trim: true,
    maxlength: 255,
    default: null,
  })
  featuredImageAlt!: string | null;

  @Prop({
    trim: true,
    maxlength: 500,
    default: null,
  })
  featuredImagePublicId!: string | null;

  @Prop({
    type: ArticleSeoSchema,
    default: () => ({}),
  })
  seo!: ArticleSeo;

  @Prop({
    type: [String],
    default: [],
  })
  tags!: string[];

  @Prop({
    type: String,
    enum: ArticleStatus,
    default: ArticleStatus.DRAFT,
    index: true,
  })
  status!: ArticleStatus;

  @Prop({
    type: Date,
    default: null,
    index: true,
  })
  publishedAt!: Date | null;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  likesCount!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  viewsCount!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  wordCount!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  readingTimeMinutes!: number;
}

export const ArticleSchema = SchemaFactory.createForClass(Article);

ArticleSchema.index({
  status: 1,
  publishedAt: -1,
});

ArticleSchema.index({
  title: 'text',
  excerpt: 'text',
  content: 'text',
  tags: 'text',
});
