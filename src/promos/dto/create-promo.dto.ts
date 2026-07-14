import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { PromoRequirement } from '../constants/promo-requirements';
import { RewardType } from '../constants/reward-types';
import { PromoCampaignType } from '../constants/promo-campaign-type';

export class CreatePromoDto {
  @IsString()
  name!: string;

  @IsEnum(PromoCampaignType)
  campaignType!: PromoCampaignType;

  @IsString()
  promoCode!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsEnum(PromoRequirement)
  requirement!: PromoRequirement;

  @IsNumber()
  @Min(1)
  targetCount!: number;

  @IsEnum(RewardType)
  rewardType!: RewardType;

  // subscription reward

  @IsOptional()
  @IsString()
  rewardPlan?: 'regular' | 'vip';

  @IsOptional()
  @IsNumber()
  rewardDurationDays?: number;

  // cash reward

  @IsOptional()
  @IsNumber()
  rewardAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxClaims?: number;
}
