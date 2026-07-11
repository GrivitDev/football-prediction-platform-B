import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Promo, PromoDocument } from './schemas/promo.schema';

import { CreatePromoDto } from './dto/create-promo.dto';

import { UpdatePromoDto } from './dto/update-promo.dto';

@Injectable()
export class PromosService {
  constructor(
    @InjectModel(Promo.name)
    private promoModel: Model<PromoDocument>,
  ) {}

  // ==========================
  // CREATE PROMO
  // ==========================

  async createPromo(dto: CreatePromoDto) {
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.promoModel.create({
      ...dto,

      startDate: new Date(dto.startDate),

      endDate: new Date(dto.endDate),
    });
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

  // ==========================
  // GET ALL PROMOS
  // ==========================

  async findAll() {
    return this.promoModel.find().sort({
      createdAt: -1,
    });
  }

  // ==========================
  // FIND ONE
  // ==========================

  async findById(id: string) {
    return this.promoModel.findById(id);
  }

  // ==========================
  // UPDATE
  // ==========================

  async updatePromo(id: string, dto: UpdatePromoDto) {
    return this.promoModel.findByIdAndUpdate(
      id,

      dto,

      {
        returnDocument: 'after',
      },
    );
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
