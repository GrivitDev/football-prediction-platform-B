import { BadRequestException, Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Referral, ReferralDocument } from './schemas/referral.schema';

import { PromoRequirement } from '../promos/constants/promo-requirements';

import { PromoEngineService } from '../promos/promo-engine.service';

import { UsersService } from '../users/users.service';

@Injectable()
export class ReferralsService {
  constructor(
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,

    private readonly usersService: UsersService,

    private readonly promoEngineService: PromoEngineService,
  ) {}

  // ============================================================
  // CREATE REFERRAL
  // ============================================================

  async createReferral(referrerId: string, referredUserId: string) {
    // ----------------------------------------------------------
    // PREVENT SELF REFERRAL
    // ----------------------------------------------------------

    if (referrerId === referredUserId) {
      return null;
    }

    // ----------------------------------------------------------
    // VERIFY REFERRER EXISTS
    // ----------------------------------------------------------

    const referrer = await this.usersService.findById(referrerId);

    if (!referrer) {
      throw new BadRequestException('Referrer not found');
    }

    // ----------------------------------------------------------
    // VERIFY REFERRED USER EXISTS
    // ----------------------------------------------------------

    const referredUser = await this.usersService.findById(referredUserId);

    if (!referredUser) {
      throw new BadRequestException('Referred user not found');
    }

    // ----------------------------------------------------------
    // PREVENT DUPLICATE REFERRAL
    // ----------------------------------------------------------
    //
    // referredUserId is also unique in the Referral schema.
    //
    // This protects the system if this method is accidentally
    // called more than once.
    //

    const existing = await this.referralModel.findOne({
      referredUserId,
    });

    if (existing) {
      // If the referral already exists, do NOT increment
      // successfulReferrals again.

      return existing;
    }

    // ----------------------------------------------------------
    // CREATE REFERRAL RECORD
    // ----------------------------------------------------------

    const referral = await this.referralModel.create({
      referrerId,

      referredUserId,

      registered: true,

      regularSubscription: false,

      vipSubscription: false,

      predictionPurchased: false,

      rewardClaimed: false,
    });

    // ----------------------------------------------------------
    // INCREMENT SUCCESSFUL REFERRALS
    // ----------------------------------------------------------
    //
    // This is the missing piece from the previous implementation.
    //
    // At this point:
    //
    // 1. The referred user exists
    // 2. OTP verification has completed
    // 3. The referral record has been created
    //
    // Therefore this referral is now successful.
    //

    await this.usersService.incrementSuccessfulReferrals(referrerId);

    // ----------------------------------------------------------
    // NOTIFY PROMO ENGINE
    // ----------------------------------------------------------
    //
    // The promo engine will:
    //
    // 1. Find campaigns the referrer joined
    // 2. Count qualified referrals
    // 3. Calculate progress
    // 4. Grant rewards when thresholds are reached
    //

    await this.promoEngineService.checkUserPromos(referrerId);

    // ----------------------------------------------------------
    // RETURN REFERRAL
    // ----------------------------------------------------------

    return referral;
  }

  // ============================================================
  // MARK REGULAR SUBSCRIPTION
  // ============================================================

  async markRegularSubscription(userId: string) {
    const referral = await this.referralModel.findOne({
      referredUserId: userId,
    });

    if (!referral) {
      return null;
    }

    // ----------------------------------------------------------
    // ALREADY PROCESSED
    // ----------------------------------------------------------

    if (referral.regularSubscription) {
      return referral;
    }

    // ----------------------------------------------------------
    // MARK ACTION
    // ----------------------------------------------------------

    referral.regularSubscription = true;

    await referral.save();

    // ----------------------------------------------------------
    // NOTIFY PROMO ENGINE
    // ----------------------------------------------------------

    await this.promoEngineService.checkUserPromos(
      referral.referrerId.toString(),
    );

    return referral;
  }

  // ============================================================
  // MARK VIP SUBSCRIPTION
  // ============================================================

  async markVipSubscription(userId: string) {
    const referral = await this.referralModel.findOne({
      referredUserId: userId,
    });

    if (!referral) {
      return null;
    }

    // ----------------------------------------------------------
    // ALREADY PROCESSED
    // ----------------------------------------------------------

    if (referral.vipSubscription) {
      return referral;
    }

    // ----------------------------------------------------------
    // MARK ACTION
    // ----------------------------------------------------------

    referral.vipSubscription = true;

    await referral.save();

    // ----------------------------------------------------------
    // NOTIFY PROMO ENGINE
    // ----------------------------------------------------------

    await this.promoEngineService.checkUserPromos(
      referral.referrerId.toString(),
    );

    return referral;
  }

  // ============================================================
  // MARK PREDICTION PURCHASE
  // ============================================================

  async markPredictionPurchased(userId: string) {
    const referral = await this.referralModel.findOne({
      referredUserId: userId,
    });

    if (!referral) {
      return null;
    }

    // ----------------------------------------------------------
    // ALREADY PROCESSED
    // ----------------------------------------------------------

    if (referral.predictionPurchased) {
      return referral;
    }

    // ----------------------------------------------------------
    // MARK ACTION
    // ----------------------------------------------------------

    referral.predictionPurchased = true;

    await referral.save();

    // ----------------------------------------------------------
    // NOTIFY PROMO ENGINE
    // ----------------------------------------------------------

    await this.promoEngineService.checkUserPromos(
      referral.referrerId.toString(),
    );

    return referral;
  }

  // ============================================================
  // FIND REFERRAL BY REFERRED USER
  // ============================================================

  async findByReferredUser(userId: string) {
    return this.referralModel.findOne({
      referredUserId: userId,
    });
  }

  // ============================================================
  // GET USER REFERRALS
  // ============================================================

  async getUserReferrals(userId: string) {
    return this.referralModel
      .find({
        referrerId: userId,
      })
      .sort({
        createdAt: -1,
      });
  }

  // ============================================================
  // COUNT ALL REFERRALS
  // ============================================================

  async countReferrals(userId: string) {
    return this.referralModel.countDocuments({
      referrerId: userId,
    });
  }

  // ============================================================
  // COUNT QUALIFIED REFERRALS
  // ============================================================

  async countQualifiedReferrals(
    referrerId: string,
    requirement: PromoRequirement,
  ) {
    switch (requirement) {
      // --------------------------------------------------------
      // REGISTERED USERS
      // --------------------------------------------------------

      case PromoRequirement.REGISTER:
        return this.referralModel.countDocuments({
          referrerId,
          registered: true,
        });

      // --------------------------------------------------------
      // REGULAR SUBSCRIBERS
      // --------------------------------------------------------

      case PromoRequirement.REGULAR_SUBSCRIPTION:
        return this.referralModel.countDocuments({
          referrerId,
          regularSubscription: true,
        });

      // --------------------------------------------------------
      // VIP SUBSCRIBERS
      // --------------------------------------------------------

      case PromoRequirement.VIP_SUBSCRIPTION:
        return this.referralModel.countDocuments({
          referrerId,
          vipSubscription: true,
        });

      // --------------------------------------------------------
      // ANY SUBSCRIPTION
      // --------------------------------------------------------

      case PromoRequirement.ANY_SUBSCRIPTION:
        return this.referralModel.countDocuments({
          referrerId,

          $or: [
            {
              regularSubscription: true,
            },

            {
              vipSubscription: true,
            },
          ],
        });

      // --------------------------------------------------------
      // PREDICTION PURCHASE
      // --------------------------------------------------------

      case PromoRequirement.PREDICTION_PURCHASE:
        return this.referralModel.countDocuments({
          referrerId,
          predictionPurchased: true,
        });

      // --------------------------------------------------------
      // UNKNOWN REQUIREMENT
      // --------------------------------------------------------

      default:
        return 0;
    }
  }

  // ============================================================
  // ADMIN - ALL REFERRALS
  // ============================================================

  async getAdminReferrals() {
    return this.referralModel

      .find()

      .populate('referrerId', 'fullName username email')

      .populate('referredUserId', 'fullName username email')

      .sort({
        createdAt: -1,
      });
  }

  // ============================================================
  // ADMIN - REFERRAL STATS
  // ============================================================

  async getAdminReferralStats() {
    const total = await this.referralModel.countDocuments();

    const registered = await this.referralModel.countDocuments({
      registered: true,
    });

    const regularSubscribers = await this.referralModel.countDocuments({
      regularSubscription: true,
    });

    const vipSubscribers = await this.referralModel.countDocuments({
      vipSubscription: true,
    });

    const predictionPurchases = await this.referralModel.countDocuments({
      predictionPurchased: true,
    });

    const totalReferrers = await this.referralModel.distinct('referrerId');

    return {
      total,

      totalReferrers: totalReferrers.length,

      registered,

      regularSubscribers,

      vipSubscribers,

      predictionPurchases,

      conversionRate:
        total === 0 ? 0 : Math.round((vipSubscribers / total) * 100),
    };
  }
}
