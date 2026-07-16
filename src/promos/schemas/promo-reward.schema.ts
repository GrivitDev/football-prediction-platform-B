import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import mongoose, { HydratedDocument } from 'mongoose';

import { RewardType } from '../constants/reward-types';
import { PromoRewardStatus } from '../constants/promo-reward-status';

export type PromoRewardDocument = HydratedDocument<PromoReward>;

@Schema({
  timestamps: true,
})
export class PromoReward {
  @Prop({
    required: true,
    index: true,
  })
  promoId!: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: mongoose.Types.ObjectId;

  // ======================
  // CLAIM INFORMATION
  // ======================

  /**
   * Which reward claim this is.
   *
   * Example:
   * Claim 1
   * Claim 2
   * Claim 3
   */
  @Prop({
    required: true,
  })
  claimNumber!: number;

  // ======================
  // REWARD TYPE
  // ======================

  @Prop({
    enum: RewardType,
    required: true,
  })
  type!: RewardType;

  // ======================
  // SUBSCRIPTION REWARD
  // ======================

  @Prop()
  plan?: 'regular' | 'vip';

  @Prop()
  durationDays?: number;

  // ======================
  // CASH REWARD
  // ======================

  @Prop()
  amount?: number;

  // ======================
  // BANK DETAILS
  // ======================

  @Prop()
  bankName?: string;

  @Prop()
  accountName?: string;

  @Prop()
  accountNumber?: string;

  // ======================
  // PAYMENT STATUS
  // ======================

  @Prop({
    enum: PromoRewardStatus,
    default: PromoRewardStatus.PENDING,
  })
  status!: PromoRewardStatus;

  @Prop()
  paidAt?: Date;

  @Prop()
  claimedAt?: Date;
}

export const PromoRewardSchema = SchemaFactory.createForClass(PromoReward);

PromoRewardSchema.index(
  {
    promoId: 1,

    userId: 1,

    claimNumber: 1,
  },
  {
    unique: true,
  },
);
