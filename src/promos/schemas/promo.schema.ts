import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

import { PromoRequirement } from '../constants/promo-requirements';
import { RewardType } from '../constants/reward-types';
import { PromoCampaignType } from '../constants/promo-campaign-type';

export type PromoDocument = HydratedDocument<Promo>;

@Schema({
  timestamps: true,
})
export class Promo {
  // ======================
  // BASIC INFO
  // ======================

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    default: '',
  })
  description?: string;

  // ======================
  // PROMO STATUS
  // ======================

  // ======================
  // PROMO CODE
  // ======================

  @Prop({
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
  })
  promoCode?: string;

  // ======================
  // CAMPAIGN TYPE
  // ======================

  @Prop({
    enum: PromoCampaignType,
    required: true,
  })
  campaignType!: PromoCampaignType;

  @Prop({
    default: true,
    index: true,
  })
  isActive!: boolean;

  // ======================
  // PROMO DURATION
  // ======================

  @Prop({
    required: true,
  })
  startDate!: Date;

  @Prop({
    required: true,
  })
  endDate!: Date;

  // ======================
  // REQUIREMENT
  // ======================

  @Prop({
    enum: PromoRequirement,
    required: true,
  })
  requirement!: PromoRequirement;

  // Number of qualified referrals required
  @Prop({
    required: true,
    default: 1,
  })
  targetCount!: number;

  // ======================
  // REPEAT SETTINGS
  // ======================

  /**
   * 1 = User can claim once
   * 3 = User can claim 3 times
   * 0 = Unlimited claims
   */
  @Prop({
    default: 1,
    min: 0,
  })
  maxClaims!: number;

  // ======================
  // REWARD
  // ======================

  @Prop({
    enum: RewardType,
    required: true,
  })
  rewardType!: RewardType;

  // Subscription reward

  @Prop()
  rewardPlan?: 'regular' | 'vip';

  @Prop()
  rewardDurationDays?: number;

  // Cash reward

  @Prop()
  rewardAmount?: number;
}

export const PromoSchema = SchemaFactory.createForClass(Promo);
