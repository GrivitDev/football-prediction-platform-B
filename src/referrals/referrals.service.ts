import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Referral, ReferralDocument } from './schemas/referral.schema';

import { PromoRequirement } from '../promos/constants/promo-requirements';
import { PromoEngineService } from '../promos/promo-engine.service';

@Injectable()
export class ReferralsService {
  constructor(
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,

    @Inject(forwardRef(() => PromoEngineService))
    private readonly promoEngineService: PromoEngineService,
  ) {}

  // ======================
  // CREATE REFERRAL
  // ======================

  async createReferral(referrerId: string, referredUserId: string) {
    // Prevent self referral
    if (referrerId === referredUserId) {
      return null;
    }

    const referral = await this.referralModel.create({
      referrerId,
      referredUserId,
      registered: true,
    });

    await this.promoEngineService.checkUserPromos(referrerId);

    return referral;
  }

  // ======================
  // MARK REGULAR SUB
  // ======================

  async markRegularSubscription(userId: string) {
    const referral = await this.referralModel.findOne({
      referredUserId: userId,
    });

    if (!referral) {
      return null;
    }

    // Already processed
    if (referral.regularSubscription) {
      return referral;
    }

    referral.regularSubscription = true;

    await referral.save();

    await this.promoEngineService.checkUserPromos(referral.referrerId);

    return referral;
  }
  // ======================
  // MARK VIP SUB
  // ======================

  async markVipSubscription(userId: string) {
    const referral = await this.referralModel.findOne({
      referredUserId: userId,
    });

    if (!referral) {
      return null;
    }

    // Already processed
    if (referral.vipSubscription) {
      return referral;
    }

    referral.vipSubscription = true;

    await referral.save();

    await this.promoEngineService.checkUserPromos(referral.referrerId);

    return referral;
  }
  // ======================
  // MARK PREDICTION PURCHASE
  // ======================

  async markPredictionPurchased(userId: string) {
    const referral = await this.referralModel.findOne({
      referredUserId: userId,
    });

    if (!referral) {
      return null;
    }

    // Already processed
    if (referral.predictionPurchased) {
      return referral;
    }

    referral.predictionPurchased = true;

    await referral.save();

    await this.promoEngineService.checkUserPromos(referral.referrerId);

    return referral;
  }
  // ======================
  // FIND REFERRAL BY USER
  // ======================

  async findByReferredUser(userId: string) {
    return this.referralModel.findOne({
      referredUserId: userId,
    });
  }

  // ======================
  // GET USER REFERRALS
  // ======================

  async getUserReferrals(userId: string) {
    return this.referralModel.find({
      referrerId: userId,
    });
  }

  // ======================
  // COUNT ALL REFERRALS
  // ======================

  async countReferrals(userId: string) {
    return this.referralModel.countDocuments({
      referrerId: userId,
    });
  }

  // ======================
  // COUNT QUALIFIED REFERRALS
  // ======================

  async countQualifiedReferrals(
    referrerId: string,
    requirement: PromoRequirement,
  ) {
    switch (requirement) {
      case PromoRequirement.REGISTER:
        return this.referralModel.countDocuments({
          referrerId,
          registered: true,
        });

      case PromoRequirement.REGULAR_SUBSCRIPTION:
        return this.referralModel.countDocuments({
          referrerId,
          regularSubscription: true,
        });

      case PromoRequirement.VIP_SUBSCRIPTION:
        return this.referralModel.countDocuments({
          referrerId,
          vipSubscription: true,
        });

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

      case PromoRequirement.PREDICTION_PURCHASE:
        return this.referralModel.countDocuments({
          referrerId,
          predictionPurchased: true,
        });

      default:
        return 0;
    }
  }
}
