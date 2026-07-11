import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { InternalAd, InternalAdDocument } from './schemas/internal-ad.schema';

import { CreateInternalAdDto } from './dto/create-internal-ad.dto';
import { UpdateInternalAdDto } from './dto/update-internal-ad.dto';

@Injectable()
export class InternalAdsService {
  constructor(
    @InjectModel(InternalAd.name)
    private readonly internalAdModel: Model<InternalAdDocument>,
  ) {}

  // =====================================
  // CREATE
  // =====================================

  async create(createAdDto: CreateInternalAdDto) {
    return this.internalAdModel.create(createAdDto);
  }

  // =====================================
  // UPDATE
  // =====================================

  async update(id: string, updateAdDto: UpdateInternalAdDto) {
    const ad = await this.internalAdModel.findByIdAndUpdate(id, updateAdDto, {
      new: true,
    });

    if (!ad) {
      throw new NotFoundException('Ad not found');
    }

    return ad;
  }

  // =====================================
  // DELETE
  // =====================================

  async remove(id: string) {
    const ad = await this.internalAdModel.findByIdAndDelete(id);

    if (!ad) {
      throw new NotFoundException('Ad not found');
    }

    return {
      message: 'Ad deleted successfully',
    };
  }

  // =====================================
  // GET ONE
  // =====================================

  async findOne(id: string) {
    const ad = await this.internalAdModel.findById(id);

    if (!ad) {
      throw new NotFoundException('Ad not found');
    }

    return ad;
  }

  // =====================================
  // ADMIN
  // =====================================

  async findAll() {
    return this.internalAdModel.find().sort({
      sortOrder: -1,
      createdAt: -1,
    });
  }

  // =====================================
  // PUBLIC
  // =====================================

  async getActiveAds() {
    const now = new Date();

    return this.internalAdModel
      .find({
        isActive: true,

        startDate: {
          $lte: now,
        },

        endDate: {
          $gte: now,
        },
      })
      .sort({
        sortOrder: -1,
        createdAt: -1,
      });
  }
}
