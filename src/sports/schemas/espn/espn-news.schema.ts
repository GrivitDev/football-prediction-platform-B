import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type EspnNewsDocument = HydratedDocument<EspnNews>;

@Schema({
  timestamps: true,
  collection: 'sports_espn_news',
})
export class EspnNews {
  /**
   * ESPN article ID.
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    trim: true,
  })
  articleId!: string;

  /**
   * ESPN league identifier associated with the article.
   *
   * This may be the ESPN league ID, abbreviation,
   * or canonical league slug depending on the
   * ESPN news payload and collection mapping.
   */
  @Prop({
    required: true,
    index: true,
    trim: true,
    lowercase: true,
  })
  leagueId!: string;

  @Prop({
    required: false,
  })
  headline?: string;

  @Prop({
    required: false,
  })
  description?: string;

  @Prop({
    required: false,
  })
  published?: Date;

  @Prop({
    required: false,
  })
  lastModified?: Date;

  @Prop({
    required: false,
  })
  link?: string;

  @Prop({
    required: false,
  })
  imageUrl?: string;

  @Prop({
    required: false,
  })
  type?: string;

  @Prop({
    required: false,
  })
  author?: string;

  /**
   * Complete ESPN article payload.
   */
  @Prop({
    type: Object,
    required: true,
  })
  payload!: Record<string, unknown>;

  @Prop({
    required: true,
    type: Date,
    index: true,
  })
  collectedAt!: Date;
}

export const EspnNewsSchema = SchemaFactory.createForClass(EspnNews);

EspnNewsSchema.index({
  leagueId: 1,
  published: -1,
});

EspnNewsSchema.index({
  published: -1,
});
