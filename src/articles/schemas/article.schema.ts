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
    type: String,
    trim: true,
    maxlength: 300,
    default: null,
  })
  title!: string | null;

  @Prop({
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  })
  description!: string | null;

  @Prop({
    type: String,
    trim: true,
    maxlength: 200,
    default: null,
  })
  focusKeyword!: string | null;

  @Prop({
    type: String,
    trim: true,
    maxlength: 2048,
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
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  })
  title!: string;

  @Prop({
    type: String,
    trim: true,
    maxlength: 300,
    default: null,
  })
  subtitle!: string | null;

  @Prop({
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  })
  description!: string | null;

  /**
   * Legacy field retained for existing articles.
   * New articles should use `description`.
   */
  @Prop({
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  })
  excerpt!: string | null;

  @Prop({
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 300,
    unique: true,
    index: true,
  })
  slug!: string;

  @Prop({
    type: String,
    required: true,
  })
  content!: string;

  @Prop({
    type: Types.ObjectId,
    required: true,
    index: true,
  })
  authorId!: Types.ObjectId;

  @Prop({
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  })
  featuredImageUrl!: string | null;

  @Prop({
    type: String,
    trim: true,
    maxlength: 255,
    default: null,
  })
  featuredImageAlt!: string | null;

  @Prop({
    type: String,
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
  subtitle: 'text',
  description: 'text',
  excerpt: 'text',
  content: 'text',
  tags: 'text',
});
