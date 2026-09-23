import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export type PlanType = 'free' | 'regular' | 'vip' | 'premium';

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({
    enum: ['regular', 'vip', 'premium'],
    required: true,
  })
  plan!: 'regular' | 'vip' | 'premium';

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  startDate!: Date;

  /**
   * null = lifetime subscription.
   */
  @Prop({
    default: null,
  })
  expiryDate!: Date | null;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({
    default: false,
  })
  expiringReminderSent!: boolean;

  @Prop({
    default: false,
  })
  expiredNotificationSent!: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
