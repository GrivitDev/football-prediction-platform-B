import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { Ad, AdDocument } from './schemas/ad.schema';

import { CreateAdDto } from './dto/create-ad.dto';

import { UpdateAdDto } from './dto/update-ad.dto';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { UploadsService } from '../uploads/uploads.service';

import { AdPage } from './enums/ad-page.enum';

import { AdDevice } from './enums/ad-device.enum';

import { ExternalAdFrequency } from './enums/external-ad-frequency.enum';

@Injectable()
export class AdsService {
  constructor(
    @InjectModel(Ad.name)
    private readonly adModel: Model<AdDocument>,

    private readonly subscriptionsService: SubscriptionsService,

    private readonly uploadsService: UploadsService,
  ) {}

  // =====================================================
  // CREATE AD
  // =====================================================

  async create(
    dto: CreateAdDto,

    adminId: string,
  ) {
    const ad = await this.adModel.create({
      ...dto,

      createdBy: new Types.ObjectId(adminId),

      startDate: dto.startDate ? new Date(dto.startDate) : undefined,

      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });

    return ad;
  }

  // =====================================================
  // GET ALL ADS
  // =====================================================

  async findAll() {
    return this.adModel

      .find()

      .populate('createdBy', 'fullName email')

      .sort({
        priority: -1,

        createdAt: -1,
      });
  }

  // =====================================================
  // GET SINGLE AD
  // =====================================================

  async findOne(id: string) {
    const ad = await this.adModel

      .findById(id)

      .populate('createdBy', 'fullName email');

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    return ad;
  }
  // =====================================================
  // UPDATE AD
  // =====================================================

  async update(
    id: string,

    dto: UpdateAdDto,
  ) {
    const existingAd = await this.adModel.findById(id);

    if (!existingAd) {
      throw new NotFoundException('Advertisement not found');
    }

    // ==========================================
    // IMAGE REPLACEMENT
    // ==========================================

    if (
      dto.image &&
      existingAd.image &&
      dto.image.publicId !== existingAd.image.publicId
    ) {
      await this.uploadsService.deleteImage(existingAd.image.publicId);
    }

    const updateData: any = {
      ...dto,
    };

    if (dto.startDate) {
      updateData.startDate = new Date(dto.startDate);
    }

    if (dto.endDate) {
      updateData.endDate = new Date(dto.endDate);
    }

    const updatedAd = await this.adModel.findByIdAndUpdate(
      id,

      updateData,

      {
        new: true,
      },
    );

    return updatedAd;
  }

  // =====================================================
  // DELETE AD
  // =====================================================

  async remove(id: string) {
    const ad = await this.adModel.findById(id);

    if (!ad) {
      throw new NotFoundException('Advertisement not found');
    }

    // Remove Cloudinary image

    if (ad.image?.publicId) {
      await this.uploadsService.deleteImage(ad.image.publicId);
    }

    await this.adModel.findByIdAndDelete(id);

    return {
      message: 'Advertisement deleted successfully',
    };
  }

  // =====================================================
  // TOGGLE ACTIVE STATUS
  // =====================================================

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
  // =====================================================
  // GET ADS FOR PAGE
  // =====================================================

  async getPageAds(
    page: AdPage,

    device: AdDevice,
  ) {
    const now = new Date();

    return this.adModel
      .find({
        isActive: true,

        $and: [
          // ==========================================
          // DATE RANGE CHECK
          // ==========================================

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

          // ==========================================
          // DISPLAY RULE CHECK
          // ==========================================

          {
            displays: {
              $elemMatch: {
                page,

                $or: [
                  {
                    device,
                  },

                  {
                    device: AdDevice.ALL,
                  },
                ],
              },
            },
          },
        ],
      })

      .populate('createdBy', 'fullName email')

      .sort({
        priority: -1,

        createdAt: -1,
      });
  }
  // =====================================================
  // RECORD IMPRESSION
  // =====================================================

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

  // =====================================================
  // RECORD CLICK
  // =====================================================

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

  // =====================================================
  // ADS ANALYTICS
  // =====================================================

  async getAnalytics() {
    const ads = await this.adModel.find();

    const totalAds = ads.length;

    const activeAds = ads.filter((ad) => ad.isActive).length;

    const impressions = ads.reduce(
      (sum, ad) => sum + ad.impressions,

      0,
    );

    const clicks = ads.reduce(
      (sum, ad) => sum + ad.clicks,

      0,
    );

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

  // =====================================================
  // EXTERNAL ADS POLICY
  // =====================================================

  async getPolicy(userId?: string) {
    // ==========================================
    // GUEST USERS
    // ==========================================

    if (!userId) {
      return {
        enabled: true,

        showInternalAds: true,

        frequency: ExternalAdFrequency.NORMAL,

        aggressive: true,

        refreshInterval: 60,

        allowPopup: true,

        allowInterstitial: true,

        allowRewarded: true,
      };
    }

    const plan = await this.subscriptionsService.getUserPlan(userId);

    // ==========================================
    // VIP USERS
    // ==========================================

    if (plan === 'vip') {
      return {
        enabled: false,

        showInternalAds: false,

        frequency: ExternalAdFrequency.NONE,

        aggressive: false,

        refreshInterval: 0,

        allowPopup: false,

        allowInterstitial: false,

        allowRewarded: false,
      };
    }

    // ==========================================
    // REGULAR USERS
    // ==========================================

    if (plan === 'regular') {
      return {
        enabled: true,

        showInternalAds: true,

        frequency: ExternalAdFrequency.LOW,

        aggressive: false,

        refreshInterval: 180,

        allowPopup: false,

        allowInterstitial: false,

        allowRewarded: true,
      };
    }

    // ==========================================
    // FREE USERS
    // ==========================================

    return {
      enabled: true,

      showInternalAds: true,

      frequency: ExternalAdFrequency.NORMAL,

      aggressive: true,

      refreshInterval: 60,

      allowPopup: true,

      allowInterstitial: true,

      allowRewarded: true,
    };
  }
}
