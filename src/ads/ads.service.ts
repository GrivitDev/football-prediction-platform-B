import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { Ad, AdDocument } from './schemas/ad.schema';

import { CreateAdDto } from './dto/create-ad.dto';

import { UpdateAdDto } from './dto/update-ad.dto';

import { AdPlacement } from './enums/ad-placement.enum';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class AdsService {
  constructor(
    @InjectModel(Ad.name)
    private readonly adModel: Model<AdDocument>,

    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async create(dto: CreateAdDto, adminId: string) {
    const ad = await this.adModel.create({
      ...dto,

      promo: dto.promo ? new Types.ObjectId(dto.promo) : undefined,

      createdBy: new Types.ObjectId(adminId),

      startDate: dto.startDate ? new Date(dto.startDate) : undefined,

      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    return ad;
  }

  async findAll() {
    return this.adModel
      .find()
      .populate('promo')
      .populate('createdBy', 'fullName email')
      .sort({
        priority: -1,
        createdAt: -1,
      });
  }

  async findOne(id: string) {
    const ad = await this.adModel
      .findById(id)
      .populate('promo')
      .populate('createdBy', 'fullName email');

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    return ad;
  }

  async update(id: string, dto: UpdateAdDto) {
    const updateData: any = {
      ...dto,
    };

    if (dto.promo) {
      updateData.promo = new Types.ObjectId(dto.promo);
    }

    if (dto.startDate) {
      updateData.startDate = new Date(dto.startDate);
    }

    if (dto.endDate) {
      updateData.endDate = new Date(dto.endDate);
    }

    const ad = await this.adModel.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    return ad;
  }

  async remove(id: string) {
    const ad = await this.adModel.findByIdAndDelete(id);

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    return {
      message: 'Advertisement deleted successfully',
    };
  }

  async toggleStatus(id: string) {
    const ad = await this.adModel.findById(id);

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    ad.isActive = !ad.isActive;

    await ad.save();

    return {
      message: `Advertisement ${
        ad.isActive ? 'activated' : 'deactivated'
      } successfully`,

      isActive: ad.isActive,
    };
  }

  async getAdsForPlacement(placement: AdPlacement) {
    const now = new Date();

    return this.adModel
      .find({
        placement,

        isActive: true,

        $and: [
          {
            $or: [
              {
                startDate: {
                  $exists: false,
                },
              },
              {
                startDate: {
                  $lte: now,
                },
              },
            ],
          },

          {
            $or: [
              {
                endDate: {
                  $exists: false,
                },
              },
              {
                endDate: {
                  $gte: now,
                },
              },
            ],
          },
        ],
      })
      .populate('promo')
      .sort({
        priority: -1,
      });
  }

  async recordImpression(id: string) {
    const ad = await this.adModel.findByIdAndUpdate(
      id,
      {
        $inc: {
          impressions: 1,
        },
      },
      {
        new: true,
      },
    );

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    return {
      success: true,
    };
  }

  async recordClick(id: string) {
    const ad = await this.adModel.findByIdAndUpdate(
      id,
      {
        $inc: {
          clicks: 1,
        },
      },
      {
        new: true,
      },
    );

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    return {
      success: true,
    };
  }

  async getAnalytics() {
    const ads = await this.adModel.find();

    const totalAds = ads.length;

    const activeAds = ads.filter((ad) => ad.isActive).length;

    const impressions = ads.reduce((sum, ad) => sum + ad.impressions, 0);

    const clicks = ads.reduce((sum, ad) => sum + ad.clicks, 0);

    const ctr =
      impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;

    return {
      totalAds,

      activeAds,

      impressions,

      clicks,

      ctr,
    };
  }

  async getPolicy(userId?: string) {
    if (!userId) {
      return {
        plan: 'free',

        showAds: true,

        showPopupAds: true,

        adInterval: 0,
      };
    }

    const plan = await this.subscriptionsService.getUserPlan(userId);

    switch (plan) {
      case 'vip':
        return {
          plan,

          showAds: false,

          showPopupAds: false,

          adInterval: 0,
        };

      case 'regular':
        return {
          plan,

          showAds: true,

          showPopupAds: false,

          adInterval: 15,
        };

      default:
        return {
          plan: 'free',

          showAds: true,

          showPopupAds: true,

          adInterval: 0,
        };
    }
  }
}
