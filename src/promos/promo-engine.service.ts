import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Promo, PromoDocument } from './schemas/promo.schema';

import {
  PromoReward,
  PromoRewardDocument,
} from './schemas/promo-reward.schema';

import { PromoRewardStatus } from './constants/promo-reward-status';

import { RewardType } from './constants/reward-types';

import { ReferralsService } from '../referrals/referrals.service';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { UsersService } from '../users/users.service';
import {
  PromoParticipant,
  PromoParticipantDocument,
} from './schemas/promo-participant.schema';
import { PromoCampaignType } from './constants/promo-campaign-type';
import { PromoRequirement } from './constants/promo-requirements';
import { PromosService } from './promos.service';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class PromoEngineService {
  constructor(
    @InjectModel(Promo.name)
    private readonly promoModel: Model<PromoDocument>,

    @InjectModel(PromoReward.name)
    private readonly rewardModel: Model<PromoRewardDocument>,

    @Inject(forwardRef(() => ReferralsService))
    private readonly referralsService: ReferralsService,

    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    private readonly promosService: PromosService,
    private readonly telegramService: TelegramService,

    @InjectModel(PromoParticipant.name)
    private readonly participantModel: Model<PromoParticipantDocument>,
  ) {}

  // ==============================
  // CHECK USER PROMOS
  // ==============================

  async checkUserPromos(userId: string) {
    const now = new Date();

    // Referral campaigns only if user joined them
    const joined = await this.participantModel.find({
      userId,
    });

    const promoIds = joined.map((x) => x.promoId);

    const referralPromos =
      promoIds.length === 0
        ? []
        : await this.promoModel.find({
            _id: { $in: promoIds },
            campaignType: PromoCampaignType.REFERRAL,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
          });

    const promos = referralPromos;

    for (const promo of promos) {
      await this.processPromo(promo, userId);
    }
  }

  // ==============================
  // JOIN DIRECT CAMPAIGN
  // ==============================

  async joinDirectCampaign(promoCode: string, userId: string) {
    const promo = await this.promosService.findActivePromoByCode(promoCode);

    if (!promo) {
      return null;
    }

    const claims = await this.rewardModel.countDocuments({
      promoId: promo._id.toString(),
      userId,
    });

    if (claims > 0) {
      return promo;
    }

    await this.processPromo(promo, userId);

    return promo;
  }

  // ==============================
  // JOIN REFERRAL CAMPAIGN
  // ==============================

  async joinReferralCampaign(promoId: string, userId: string) {
    const now = new Date();

    const promo = await this.promosService.findActiveReferralPromo(promoId);

    if (!promo) {
      return null;
    }

    const exists = await this.participantModel.findOne({
      promoId,
      userId,
    });

    if (exists) {
      return exists;
    }

    await this.participantModel.create({
      promoId,
      userId,
      joinedAt: new Date(),
    });

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      message: 'Campaign joined successfully.',
      promoId,
      referralCode: user.username,
    };
  }

  async getJoinStatus(promoId: string, userId: string) {
    const joined = await this.participantModel.exists({
      promoId,
      userId,
    });

    return {
      joined: !!joined,
    };
  }

  // ==============================
  // PROCESS PROMO
  // ==============================

  private async processPromo(promo: PromoDocument, userId: string) {
    // ==============================
    // DIRECT REGISTER CAMPAIGN
    // ==============================

    if (
      promo.campaignType === PromoCampaignType.DIRECT &&
      promo.requirement === PromoRequirement.REGISTER
    ) {
      const claims = await this.rewardModel.countDocuments({
        promoId: promo._id.toString(),
        userId,
      });

      if (promo.maxClaims > 0 && claims >= promo.maxClaims) {
        return;
      }

      if (claims === 0) {
        await this.grantReward(promo, userId, 1);
      }

      return;
    }
    const qualified = await this.referralsService.countQualifiedReferrals(
      userId,
      promo.requirement,
    );

    const claims = await this.rewardModel.countDocuments({
      promoId: promo._id.toString(),
      userId,
    });

    if (promo.maxClaims > 0 && claims >= promo.maxClaims) {
      return;
    }

    const possibleClaims = Math.floor(qualified / promo.targetCount);

    if (possibleClaims <= claims) {
      return;
    }

    for (let i = claims + 1; i <= possibleClaims; i++) {
      if (promo.maxClaims > 0 && i > promo.maxClaims) {
        break;
      }

      await this.grantReward(promo, userId, i);
    }
  }

  // ==============================
  // GRANT REWARD
  // ==============================

  private async grantReward(
    promo: PromoDocument,
    userId: string,
    claimNumber: number,
  ) {
    const exists = await this.rewardModel.findOne({
      promoId: promo._id.toString(),
      userId,
      claimNumber,
    });

    if (exists) {
      return exists;
    }

    if (promo.rewardType === RewardType.SUBSCRIPTION) {
      return this.grantSubscriptionReward(promo, userId, claimNumber);
    }

    return this.grantCashReward(promo, userId, claimNumber);
  }

  // ==============================
  // SUBSCRIPTION REWARD
  // ==============================

  private async grantSubscriptionReward(
    promo: PromoDocument,
    userId: string,
    claimNumber: number,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const reward = await this.rewardModel.create({
      promoId: promo._id.toString(),

      userId,

      claimNumber,

      type: RewardType.SUBSCRIPTION,

      plan: promo.rewardPlan,

      durationDays: promo.rewardDurationDays,

      status: PromoRewardStatus.APPROVED,
    });

    await this.subscriptionsService.activatePlan({
      userId,

      email: user.email,

      plan: promo.rewardPlan!,

      amount: 0,

      durationDays: promo.rewardDurationDays!,
    });

    reward.status = PromoRewardStatus.PAID;

    reward.paidAt = new Date();

    await reward.save();

    return reward;
  }

  // ==============================
  // CASH REWARD
  // ==============================

  private async grantCashReward(
    promo: PromoDocument,
    userId: string,
    claimNumber: number,
  ) {
    return this.rewardModel.create({
      promoId: promo._id.toString(),

      userId,

      claimNumber,

      type: RewardType.CASH,

      amount: promo.rewardAmount,

      status: PromoRewardStatus.PENDING,
    });
  }

  async submitCashRewardDetails(rewardId: string, userId: string, data: any) {
    const reward = await this.rewardModel.findOne({
      _id: rewardId,
      userId,
      type: RewardType.CASH,
      status: PromoRewardStatus.PENDING,
    });

    if (!reward) {
      throw new BadRequestException('Cash reward not available');
    }

    reward.bankName = data.bankName;

    reward.accountName = data.accountName;

    reward.accountNumber = data.accountNumber;

    reward.claimedAt = new Date();

    await reward.save();

    const user = await this.usersService.findById(userId);

    const promo = await this.promoModel.findById(reward.promoId);

    await this.telegramService.notifyCashRewardRequest({
      fullName: user?.fullName || user?.username || '',

      email: user?.email || '',

      campaign: promo?.name || '',

      amount: reward.amount || 0,

      bankName: reward.bankName || '',
      accountName: reward.accountName || '',
      accountNumber: reward.accountNumber || '',
    });

    return reward;
  }

  async markCashRewardPaid(rewardId: string) {
    const reward = await this.rewardModel.findOne({
      _id: rewardId,
      type: RewardType.CASH,
      status: PromoRewardStatus.PENDING,
    });

    if (!reward) {
      throw new BadRequestException('Reward not found');
    }

    reward.status = PromoRewardStatus.PAID;

    reward.paidAt = new Date();

    return reward.save();
  }

  // ==============================
  // USER PROMO PROGRESS
  // ==============================

  async getUserPromoProgress(userId: string) {
    const now = new Date();

    const joined = await this.participantModel.find({
      userId,
    });

    const promoIds = joined.map((x) => x.promoId);

    const promos =
      promoIds.length === 0
        ? []
        : await this.promoModel.find({
            _id: { $in: promoIds },
            campaignType: PromoCampaignType.REFERRAL,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
          });

    const result: any[] = [];

    for (const promo of promos) {
      const qualified = await this.referralsService.countQualifiedReferrals(
        userId,
        promo.requirement,
      );

      const claims = await this.rewardModel.countDocuments({
        promoId: promo._id.toString(),

        userId,
      });

      const progress = qualified % promo.targetCount;

      const completed = promo.maxClaims > 0 && claims >= promo.maxClaims;

      result.push({
        promoId: promo._id,

        name: promo.name,

        description: promo.description,

        requirement: promo.requirement,

        rewardType: promo.rewardType,

        rewardPlan: promo.rewardPlan,

        rewardAmount: promo.rewardAmount,

        rewardDurationDays: promo.rewardDurationDays,

        targetCount: promo.targetCount,

        maxClaims: promo.maxClaims,

        qualifiedReferrals: qualified,

        currentProgress: progress,

        remainingToNextReward:
          progress === 0 ? promo.targetCount : promo.targetCount - progress,

        completedClaims: claims,

        remainingClaims:
          promo.maxClaims === 0 ? null : Math.max(0, promo.maxClaims - claims),

        completed,

        unlimited: promo.maxClaims === 0,
      });
    }

    return result;
  }

  // ==============================
  // ADMIN - PROMO REWARDS
  // ==============================

  async getPromoRewards(promoId: string) {
    return this.rewardModel
      .find({
        promoId,
      })
      .populate('userId', 'username email')
      .sort({
        createdAt: -1,
      });
  }

  // ==============================
  // USER REWARD HISTORY
  // ==============================

  async getUserRewards(userId: string) {
    return this.rewardModel
      .find({
        userId,
      })
      .populate('promoId', 'name description')
      .sort({
        createdAt: -1,
      });
  }

  // ==============================
  // ADMIN - ALL PAID REWARDS
  // ==============================

  async getAllAwardedRewards() {
    const rewards = await this.rewardModel
      .find({
        status: {
          $in: [PromoRewardStatus.PENDING, PromoRewardStatus.PAID],
        },
      })
      .populate('userId', 'fullName username email')
      .populate(
        'promoId',
        `
      name
      campaignType
      requirement
      rewardType
      rewardPlan
      rewardAmount
      rewardDurationDays
      targetCount
      `,
      )
      .sort({
        paidAt: -1,
      });

    const formattedRewards = rewards.map((reward: any) => {
      const promo = reward.promoId;

      let activity = '';

      switch (promo?.requirement) {
        case PromoRequirement.REGISTER:
          activity = 'Registered a new account';
          break;

        case PromoRequirement.REGULAR_SUBSCRIPTION:
          activity = `Referred ${promo.targetCount} Regular Subscribers`;
          break;

        case PromoRequirement.VIP_SUBSCRIPTION:
          activity = `Referred ${promo.targetCount} VIP Subscribers`;
          break;

        case PromoRequirement.ANY_SUBSCRIPTION:
          activity = `Referred ${promo.targetCount} Paying Subscribers`;
          break;

        case PromoRequirement.PREDICTION_PURCHASE:
          activity = `Referred ${promo.targetCount} Prediction Purchases`;
          break;

        default:
          activity = 'Completed campaign requirement';
      }

      return {
        id: reward._id,

        rewardTitle:
          promo?.rewardType === RewardType.SUBSCRIPTION
            ? `${promo.rewardPlan} Subscription (${promo.rewardDurationDays} Days)`
            : `Cash Reward ₦${promo.rewardAmount}`,

        rewardType: reward.type,

        dateReceived: reward.paidAt || reward.createdAt,

        campaignType: promo?.campaignType,

        userName: reward.userId?.fullName || reward.userId?.username,

        email: reward.userId?.email,

        activity,

        claimNumber: reward.claimNumber,
      };
    });

    return {
      summary: {
        totalRewardsAwarded: formattedRewards.length,

        subscriptionRewards: formattedRewards.filter(
          (r) => r.rewardType === RewardType.SUBSCRIPTION,
        ).length,

        cashRewards: formattedRewards.filter(
          (r) => r.rewardType === RewardType.CASH,
        ).length,

        totalCashAwarded: formattedRewards
          .filter((r) => r.rewardType === RewardType.CASH)
          .reduce((sum, r: any) => sum + (r.amount || 0), 0),
      },

      rewards: formattedRewards,
    };
  }
  async getAllClaimedRewards() {
    return this.rewardModel
      .find()
      .populate('userId', 'fullName username email')
      .populate(
        'promoId',
        'name campaignType rewardType rewardPlan rewardAmount rewardDurationDays',
      )
      .sort({
        createdAt: -1,
      });
  }

  async getPendingCashRewards() {
    return this.rewardModel
      .find({
        type: RewardType.CASH,
        status: PromoRewardStatus.PENDING,
        accountNumber: {
          $exists: true,
        },
      })
      .populate('userId', 'fullName username email')
      .populate('promoId', 'name')
      .sort({
        createdAt: -1,
      });
  }
}
