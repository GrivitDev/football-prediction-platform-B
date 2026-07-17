import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { User, UserDocument, UserStatus } from '../users/schemas/user.schema';

import {
  Prediction,
  PredictionDocument,
} from '../predictions/schemas/prediction.schema';

import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';

import { Ad, AdDocument } from '../ads/schemas/ad.schema';

import { Promo, PromoDocument } from '../promos/schemas/promo.schema';

import {
  Referral,
  ReferralDocument,
} from '../referrals/schemas/referral.schema';

@Injectable()
export class AnalyticsOverviewService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,

    @InjectModel(Ad.name)
    private readonly adModel: Model<AdDocument>,

    @InjectModel(Promo.name)
    private readonly promoModel: Model<PromoDocument>,

    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
  ) {}

  async getOverview() {
    const [
      // ==========================
      // USERS
      // ==========================

      totalUsers,
      activeUsers,
      suspendedUsers,
      deletedUsers,
      verifiedUsers,
      unverifiedUsers,

      // ==========================
      // SUBSCRIPTIONS
      // ==========================

      totalSubscriptions,
      activeSubscriptions,

      vipSubscriptions,
      activeVipSubscriptions,

      regularSubscriptions,
      activeRegularSubscriptions,

      // ==========================
      // PREDICTIONS
      // ==========================

      totalPredictions,
      vipPredictions,
      regularPredictions,
      freePredictions,

      pendingPredictions,
      wonPredictions,
      lostPredictions,
      voidPredictions,

      // ==========================
      // ADS
      // ==========================

      totalAds,
      activeAds,
      totalImpressions,
      totalClicks,

      // ==========================
      // PROMOS
      // ==========================

      totalPromos,
      activePromos,
      expiredPromos,

      // ==========================
      // REFERRALS
      // ==========================

      totalReferrals,
      rewardedReferrals,
      pendingRewards,
    ] = await Promise.all([
      // ==========================
      // USERS
      // ==========================
      this.userModel.countDocuments(),

      this.userModel.countDocuments({
        status: UserStatus.ACTIVE,
        isDeleted: false,
      }),

      this.userModel.countDocuments({
        status: UserStatus.SUSPENDED,
      }),

      this.userModel.countDocuments({
        isDeleted: true,
      }),

      this.userModel.countDocuments({
        isVerified: true,
      }),

      this.userModel.countDocuments({
        isVerified: false,
      }),

      // ==========================
      // SUBSCRIPTIONS
      // ==========================
      this.subscriptionModel.countDocuments(),

      this.subscriptionModel.countDocuments({
        isActive: true,
      }),

      this.subscriptionModel.countDocuments({
        plan: 'vip',
      }),

      this.subscriptionModel.countDocuments({
        plan: 'vip',
        isActive: true,
      }),

      this.subscriptionModel.countDocuments({
        plan: 'regular',
      }),

      this.subscriptionModel.countDocuments({
        plan: 'regular',
        isActive: true,
      }),

      // ==========================
      // PREDICTIONS
      // ==========================
      this.predictionModel.countDocuments(),

      this.predictionModel.countDocuments({
        accessType: 'vip',
      }),

      this.predictionModel.countDocuments({
        accessType: 'regular',
      }),

      this.predictionModel.countDocuments({
        accessType: 'free',
      }),

      this.predictionModel.countDocuments({
        status: 'pending',
      }),

      this.predictionModel.countDocuments({
        status: 'won',
      }),

      this.predictionModel.countDocuments({
        status: 'lost',
      }),

      this.predictionModel.countDocuments({
        status: 'void',
      }),

      // ==========================
      // ADS
      // ==========================
      this.adModel.countDocuments(),

      this.adModel.countDocuments({
        isActive: true,
      }),

      this.adModel.aggregate<{ total: number }>([
        {
          $group: {
            _id: null,
            total: {
              $sum: '$impressions',
            },
          },
        },
      ]),

      this.adModel.aggregate<{ total: number }>([
        {
          $group: {
            _id: null,
            total: {
              $sum: '$clicks',
            },
          },
        },
      ]),
      // ==========================
      // PROMOS
      // ==========================
      this.promoModel.countDocuments(),

      this.promoModel.countDocuments({
        isActive: true,
      }),

      this.promoModel.countDocuments({
        endDate: {
          $lt: new Date(),
        },
      }),

      // ==========================
      // REFERRALS
      // ==========================
      this.referralModel.countDocuments(),

      this.referralModel.countDocuments({
        rewardClaimed: true,
      }),

      this.referralModel.countDocuments({
        rewardClaimed: false,
      }),
    ]);

    return {
      users: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        deletedUsers,
        verifiedUsers,
        unverifiedUsers,
      },

      subscriptions: {
        totalSubscriptions,
        activeSubscriptions,

        vipSubscriptions,
        activeVipSubscriptions,

        regularSubscriptions,
        activeRegularSubscriptions,
      },

      predictions: {
        totalPredictions,

        vipPredictions,
        regularPredictions,
        freePredictions,

        pendingPredictions,
        wonPredictions,
        lostPredictions,
        voidPredictions,
      },

      ads: {
        totalAds,
        activeAds,

        impressions: totalImpressions[0]?.total ?? 0,
        clicks: totalClicks[0]?.total ?? 0,

        ctr:
          (totalImpressions[0]?.total ?? 0) > 0
            ? Number(
                (
                  ((totalClicks[0]?.total ?? 0) /
                    (totalImpressions[0]?.total ?? 1)) *
                  100
                ).toFixed(2),
              )
            : 0,
      },

      promos: {
        totalPromos,
        activePromos,
        expiredPromos,
      },

      referrals: {
        totalReferrals,
        rewardedReferrals,
        pendingRewards,
      },
    };
  }
}
