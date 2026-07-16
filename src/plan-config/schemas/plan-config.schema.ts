import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlanConfigDocument = HydratedDocument<PlanConfig>;

@Schema({
  timestamps: true,
})
export class PlanConfig {
  @Prop({
    default: 1000,
    min: 0,
  })
  regularPrice!: number;

  @Prop({
    default: 5000,
    min: 0,
  })
  vipPrice!: number;

  @Prop({
    default: 30,
    min: 1,
  })
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
  bankDetails!: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    instructions: string;
  };

  @Prop({
    type: Object,
    default: {
      free: 'Free Plan',
      regular: 'Regular Plan',
      vip: 'VIP Plan',
    },
  })
  planLabels!: {
    free: string;
    regular: string;
    vip: string;
  };
}

export const PlanConfigSchema = SchemaFactory.createForClass(PlanConfig);
