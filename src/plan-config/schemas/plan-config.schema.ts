import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlanConfigDocument = HydratedDocument<PlanConfig>;

@Schema({ timestamps: true })
export class PlanConfig {
  @Prop({ default: 1000 })
  regularPrice!: number;

  @Prop({ default: 5000 })
  vipPrice!: number;

  @Prop({ default: 0 })
  predictionPrice!: number;

  @Prop({ default: 30 })
  subscriptionDurationDays!: number;

  @Prop({
    type: Object,
    default: {
      bankName: '',
      accountName: '',
      accountNumber: '',
      instructions: '',
    },
  })
  bankDetails!: Record<string, string>;

  @Prop({
    type: Object,
    default: {
      free: 'Free Plan',
      regular: 'Regular Plan',
      vip: 'VIP Plan',
    },
  })
  planLabels!: Record<string, string>;
}

export const PlanConfigSchema = SchemaFactory.createForClass(PlanConfig);
