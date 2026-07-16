import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Prediction } from '../../predictions/schemas/prediction.schema';

export type PredictionPurchaseDocument = HydratedDocument<PredictionPurchase>;

@Schema({ timestamps: true })
export class PredictionPurchase {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId!: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Prediction.name,
    required: true,
  })
  predictionId!: string;

  @Prop({ required: true, default: 0 })
  amount!: number;

  @Prop({
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
  })
  status!: 'pending' | 'success' | 'failed';

  // THIS IS IMPORTANT: internal purchase reference (NOT payment reference)
  @Prop({ required: true })
  reference!: string;

  @Prop({ default: 'paystack' })
  provider!: string;

  @Prop({ default: 'NGN' })
  currency!: string;

  @Prop({ type: Date, default: null })
  paidAt!: Date | null;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null,
  })
  paymentId!: string | null;

  @Prop({ type: Object, default: null })
  gatewayResponse!: Record<string, any> | null;

  @Prop({ default: true })
  active!: boolean;
}

export const PredictionPurchaseSchema =
  SchemaFactory.createForClass(PredictionPurchase);

PredictionPurchaseSchema.index(
  {
    userId: 1,
    predictionId: 1,
  },
  {
    unique: true,
  },
);
PredictionPurchaseSchema.index({ reference: 1 }, { unique: true });
