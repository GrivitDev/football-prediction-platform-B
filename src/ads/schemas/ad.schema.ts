import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { AdPlacement } from '../enums/ad-placement.enum';

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
  description?: string;

  @Prop({
    required: true,
    trim: true,
  })
  imageUrl!: string;

  @Prop({
    trim: true,
    default: '',
  })
  targetUrl?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Promo',
    default: null,
  })
  promo?: Types.ObjectId;

  @Prop({
    required: true,
    enum: AdPlacement,
  })
  placement!: AdPlacement;

  @Prop({
    default: 0,
    min: 0,
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
    default: null,
  })
  createdBy?: Types.ObjectId;
}

export const AdSchema = SchemaFactory.createForClass(Ad);

AdSchema.index({ placement: 1, isActive: 1 });

AdSchema.index({ startDate: 1 });

AdSchema.index({ endDate: 1 });

AdSchema.index({ priority: -1 });

AdSchema.index({ promo: 1 });
