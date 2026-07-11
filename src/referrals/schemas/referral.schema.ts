import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReferralDocument = HydratedDocument<Referral>;

@Schema({
  timestamps: true,
})
export class Referral {
  // The user who shared the referral code
  @Prop({
    required: true,
    index: true,
  })
  referrerId!: string;

  // The new user who used the referral code
  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  referredUserId!: string;

  // ======================
  // TRACKED ACTIONS
  // ======================

  @Prop({
    default: true,
  })
  registered!: boolean;

  @Prop({
    default: false,
  })
  regularSubscription!: boolean;

  @Prop({
    default: false,
  })
  vipSubscription!: boolean;

  @Prop({
    default: false,
  })
  predictionPurchased!: boolean;

  // ======================
  // REWARD STATUS
  // ======================

  @Prop({
    default: false,
  })
  rewardClaimed!: boolean;

  @Prop()
  rewardClaimedAt?: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
