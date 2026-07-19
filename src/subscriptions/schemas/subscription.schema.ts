import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export type PlanType = 'free' | 'regular' | 'vip';

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({
    enum: ['regular', 'vip'],
    required: true,
  })
  plan!: 'regular' | 'vip';

  @Prop({ required: true })
  amount!: number;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  expiryDate!: Date;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({
    default: false,
  })
  expiringReminderSent: boolean;

  @Prop({
    default: false,
  })
  expiredNotificationSent: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
