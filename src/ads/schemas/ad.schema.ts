import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { AdAction, AdActionSchema } from './ad-action.schema';
import { AdDisplay, AdDisplaySchema } from './ad-display.schema';
import { AdImage, AdImageSchema } from './ad-image.schema';

export type AdDocument = HydratedDocument<Ad>;

@Schema({
  timestamps: true,
})
export class Ad {
  @Prop({
    required: true,
    trim: true,
  })
  title!: string;

  @Prop({
    trim: true,
    default: '',
  })
  subTitle?: string;

  @Prop({
    trim: true,
    default: '',
  })
  description?: string;

  @Prop({
    type: [String],
    default: [],
  })
  instructions!: string[];

  @Prop({
    type: AdImageSchema,
  })
  image!: AdImage;

  @Prop({
    type: [AdActionSchema],
    default: [],
  })
  actions!: AdAction[];

  @Prop({
    type: [AdDisplaySchema],
    required: true,
  })
  displays!: AdDisplay[];

  @Prop({
    min: 1,
    max: 10,
    default: 5,
  })
  priority!: number;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({
    default: 0,
    min: 0,
  })
  impressions!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  clicks!: number;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
  })
  createdBy!: Types.ObjectId;
}

export const AdSchema = SchemaFactory.createForClass(Ad);

AdSchema.index({
  isActive: 1,
  priority: -1,
});

AdSchema.index({
  startDate: 1,
  endDate: 1,
});
