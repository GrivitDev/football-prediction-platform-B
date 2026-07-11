import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

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
    required: true,
    index: true,
  })
  userId!: string;

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
}

export const PromoRewardSchema = SchemaFactory.createForClass(PromoReward);
