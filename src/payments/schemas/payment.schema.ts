import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export type PaymentType = 'subscription' | 'prediction' | 'vip_upgrade';

@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  amount!: number;

  @Prop({
    required: true,
    unique: true,
  })
  reference!: string;

  @Prop({
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status!: PaymentStatus;

  @Prop({
    enum: ['subscription', 'prediction', 'vip_upgrade'],
    required: true,
  })
  type!: PaymentType;

  /**
   * subscription => regular | vip
   * vip_upgrade => vip
   * prediction => purchase reference (IMPORTANT)
   */
  @Prop({ required: true })
  target!: string;

  @Prop({ default: '' })
  transferReference?: string;

  @Prop({ default: '' })
  proofImageUrl?: string;

  @Prop({ default: '' })
  proofPublicId?: string;

  @Prop({ default: '' })
  proofMessage?: string;

  @Prop({ default: '' })
  adminNote?: string;

  @Prop({ default: null })
  processedAt?: Date;

  @Prop({ default: null })
  processedBy?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
