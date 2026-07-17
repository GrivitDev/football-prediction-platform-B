import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';

import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';

import { User, UserDocument } from '../users/schemas/user.schema';

import {
  Referral,
  ReferralDocument,
} from '../referrals/schemas/referral.schema';

@Injectable()
export class AnalyticsLeaderboardService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,

    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
  ) {}

  async getLeaderboards() {
    const [
      topSubscribers,

      topVipSubscribers,

      topRegularSubscribers,

      topPredictionBuyers,

      topReferrers,
    ] = await Promise.all([
      this.getTopSubscribers(),

      this.getTopVipSubscribers(),

      this.getTopRegularSubscribers(),

      this.getTopPredictionBuyers(),

      this.getTopReferrers(),
    ]);

    return {
      topSubscribers,

      topVipSubscribers,

      topRegularSubscribers,

      topPredictionBuyers,

      topReferrers,
    };
  }

  // ==========================================
  // TOP ALL SUBSCRIBERS
  // ==========================================

  private async getTopSubscribers() {
    return this.subscriptionModel.aggregate([
      {
        $group: {
          _id: '$userId',

          totalSubscriptions: {
            $sum: 1,
          },

          totalSpent: {
            $sum: '$amount',
          },
        },
      },

      {
        $sort: {
          totalSubscriptions: -1,

          totalSpent: -1,
        },
      },

      {
        $limit: 5,
      },

      ...this.lookupUser(),
    ]);
  }

  // ==========================================
  // TOP VIP SUBSCRIBERS
  // ==========================================

  private async getTopVipSubscribers() {
    return this.subscriptionModel.aggregate([
      {
        $match: {
          plan: 'vip',
        },
      },

      {
        $group: {
          _id: '$userId',

          totalVipSubscriptions: {
            $sum: 1,
          },

          totalSpent: {
            $sum: '$amount',
          },
        },
      },

      {
        $sort: {
          totalVipSubscriptions: -1,

          totalSpent: -1,
        },
      },

      {
        $limit: 5,
      },

      ...this.lookupUser(),
    ]);
  }

  // ==========================================
  // TOP REGULAR SUBSCRIBERS
  // ==========================================

  private async getTopRegularSubscribers() {
    return this.subscriptionModel.aggregate([
      {
        $match: {
          plan: 'regular',
        },
      },

      {
        $group: {
          _id: '$userId',

          totalRegularSubscriptions: {
            $sum: 1,
          },

          totalSpent: {
            $sum: '$amount',
          },
        },
      },

      {
        $sort: {
          totalRegularSubscriptions: -1,

          totalSpent: -1,
        },
      },

      {
        $limit: 5,
      },

      ...this.lookupUser(),
    ]);
  }

  // ==========================================
  // TOP PREDICTION BUYERS
  // ==========================================

  private async getTopPredictionBuyers() {
    return this.paymentModel.aggregate([
      {
        $match: {
          status: 'approved',

          type: 'prediction',
        },
      },

      {
        $group: {
          _id: '$userId',

          totalPurchases: {
            $sum: 1,
          },

          totalSpent: {
            $sum: '$amount',
          },
        },
      },

      {
        $sort: {
          totalPurchases: -1,

          totalSpent: -1,
        },
      },

      {
        $limit: 3,
      },

      ...this.lookupUser(),
    ]);
  }

  // ==========================================
  // TOP REFERRERS
  // ==========================================

  private async getTopReferrers() {
    return this.referralModel.aggregate([
      {
        $group: {
          _id: '$referrerId',

          successfulReferrals: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          successfulReferrals: -1,
        },
      },

      {
        $limit: 5,
      },

      {
        $addFields: {
          userObjectId: {
            $toObjectId: '$_id',
          },
        },
      },

      {
        $lookup: {
          from: 'users',

          localField: 'userObjectId',

          foreignField: '_id',

          as: 'user',
        },
      },

      {
        $unwind: '$user',
      },

      {
        $project: {
          _id: 0,

          userId: '$user._id',

          fullName: '$user.fullName',

          username: '$user.username',

          email: '$user.email',

          successfulReferrals: 1,
        },
      },
    ]);
  }

  // ==========================================
  // USER LOOKUP PIPELINE
  // ==========================================

  private lookupUser() {
    return [
      {
        $addFields: {
          userObjectId: {
            $toObjectId: '$_id',
          },
        },
      },

      {
        $lookup: {
          from: 'users',

          localField: 'userObjectId',

          foreignField: '_id',

          as: 'user',
        },
      },

      {
        $unwind: '$user',
      },

      {
        $project: {
          _id: 0,

          userId: '$user._id',

          fullName: '$user.fullName',

          username: '$user.username',

          email: '$user.email',

          totalSubscriptions: 1,

          totalVipSubscriptions: 1,

          totalRegularSubscriptions: 1,

          totalPurchases: 1,

          totalSpent: 1,
        },
      },
    ];
  }
}
