import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Promo, PromoDocument } from './schemas/promo.schema';

import { CreatePromoDto } from './dto/create-promo.dto';

import { UpdatePromoDto } from './dto/update-promo.dto';
import { PromoCampaignType } from './constants/promo-campaign-type';
import { RewardType } from './constants/reward-types';

@Injectable()
export class PromosService {
  constructor(
    @InjectModel(Promo.name)
    private promoModel: Model<PromoDocument>,
  ) {}

  private async generatePromoCode(): Promise<string> {
    while (true) {
      const code =
        'WELCOME-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      const exists = await this.promoModel.exists({
        promoCode: code,
      });

      if (!exists) {
        return code;
      }
    }
  }

  // ==========================
  // FIND ACTIVE PROMO BY CODE
  // ==========================

  async findActivePromoByCode(promoCode: string) {
    const now = new Date();

    return this.promoModel.findOne({
      promoCode: promoCode.toUpperCase(),
      campaignType: PromoCampaignType.DIRECT,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
  }

  // ==========================
  // BUILD REGISTRATION URL
  // ==========================

  buildRegistrationUrl(promoCode: string) {
    return `${process.env.FRONTEND_URL}/register?promoCode=${promoCode}`;
  }

  // ==========================
  // CREATE PROMO
  // ==========================

  async createPromo(dto: CreatePromoDto) {
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('End date must be after start date');
    }

    if (dto.rewardType === RewardType.SUBSCRIPTION) {
      if (!dto.rewardPlan) {
        throw new BadRequestException(
          'Reward plan is required for subscription rewards',
        );
      }

      if (!dto.rewardDurationDays || dto.rewardDurationDays <= 0) {
        throw new BadRequestException(
          'Reward duration is required for subscription rewards',
        );
      }
    }

    if (dto.rewardType === RewardType.CASH) {
      if (!dto.rewardAmount || dto.rewardAmount <= 0) {
        throw new BadRequestException(
          'Reward amount is required for cash rewards',
        );
      }
    }

    const promoCode =
      dto.campaignType === PromoCampaignType.DIRECT
        ? await this.generatePromoCode()
        : undefined;

    const promo = await this.promoModel.create({
      ...dto,
      promoCode,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
    });

    const response = promo.toObject();

    if (promoCode) {
      response.registrationUrl = this.buildRegistrationUrl(promoCode);
    }

    return response;
  }
  // ==========================
  // GET ACTIVE PROMOS
  // ==========================

  async getActivePromos() {
    const now = new Date();

    return this.promoModel.find({
      isActive: true,

      startDate: {
        $lte: now,
      },

      endDate: {
        $gte: now,
      },
    });
  }

  async getActiveDirectPromos() {
    const now = new Date();

    const promos = await this.promoModel.find({
      campaignType: PromoCampaignType.DIRECT,
      isActive: true,
      startDate: {
        $lte: now,
      },
      endDate: {
        $gte: now,
      },
    });

    return promos.map((promo) => ({
      ...promo.toObject(),

      registrationUrl: this.buildRegistrationUrl(promo.promoCode!),
    }));
  }

  async getActiveReferralPromos() {
    const now = new Date();

    return this.promoModel.find({
      campaignType: PromoCampaignType.REFERRAL,

      isActive: true,

      startDate: {
        $lte: now,
      },

      endDate: {
        $gte: now,
      },
    });
  }

  // ==========================
  // GET ALL PROMOS
  // ==========================

  async findAll() {
    const promos = await this.promoModel.find().sort({
      createdAt: -1,
    });

    return promos.map((promo) => ({
      ...promo.toObject(),

      registrationUrl: promo.promoCode
        ? this.buildRegistrationUrl(promo.promoCode)
        : undefined,
    }));
  }

  // ==========================
  // FIND ONE
  // ==========================

  async findById(id: string) {
    const promo = await this.promoModel.findById(id);

    if (!promo) {
      return null;
    }

    return {
      ...promo.toObject(),

      registrationUrl: promo.promoCode
        ? this.buildRegistrationUrl(promo.promoCode)
        : undefined,
    };
  }

  // ==========================
  // FIND ACTIVE REFERRAL PROMO
  // ==========================

  async findActiveReferralPromo(id: string) {
    const now = new Date();

    return this.promoModel.findOne({
      _id: id,
      campaignType: PromoCampaignType.REFERRAL,
      isActive: true,
      startDate: {
        $lte: now,
      },
      endDate: {
        $gte: now,
      },
    });
  }

  // ==========================
  // UPDATE
  // ==========================

  async updatePromo(id: string, dto: UpdatePromoDto) {
    const existing = await this.promoModel.findById(id);

    if (!existing) {
      throw new BadRequestException('Promo not found');
    }

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : existing.startDate;

    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const rewardType = dto.rewardType ?? existing.rewardType;

    const rewardPlan = dto.rewardPlan ?? existing.rewardPlan;

    const rewardDurationDays =
      dto.rewardDurationDays ?? existing.rewardDurationDays;

    const rewardAmount = dto.rewardAmount ?? existing.rewardAmount;

    if (rewardType === RewardType.SUBSCRIPTION) {
      if (!rewardPlan) {
        throw new BadRequestException(
          'Reward plan is required for subscription rewards',
        );
      }

      if (!rewardDurationDays || rewardDurationDays <= 0) {
        throw new BadRequestException(
          'Reward duration is required for subscription rewards',
        );
      }
    }

    if (rewardType === RewardType.CASH) {
      if (!rewardAmount || rewardAmount <= 0) {
        throw new BadRequestException(
          'Reward amount is required for cash rewards',
        );
      }
    }

    return this.promoModel.findByIdAndUpdate(id, dto, {
      returnDocument: 'after',
      runValidators: true,
    });
  }
  // ==========================
  // DELETE / DISABLE
  // ==========================

  async deactivatePromo(id: string) {
    return this.promoModel.findByIdAndUpdate(
      id,

      {
        isActive: false,
      },

      {
        returnDocument: 'after',
      },
    );
  }
}
