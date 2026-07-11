import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';

import {
  PredictionPurchase,
  PredictionPurchaseDocument,
} from './schemas/prediction-purchase.schema';

import {
  Prediction,
  PredictionDocument,
} from '../predictions/schemas/prediction.schema';
import { ReferralsService } from 'src/referrals/referrals.service';

@Injectable()
export class PredictionPurchasesService {
  constructor(
    @InjectModel(PredictionPurchase.name)
    private purchaseModel: Model<PredictionPurchaseDocument>,
    private referralsService: ReferralsService,

    @InjectModel(Prediction.name)
    private predictionModel: Model<PredictionDocument>,
  ) {}

  // =====================================
  // CREATE PURCHASE INTENT
  // =====================================
  async initializePurchase(userId: string, predictionId: string) {
    const prediction = await this.predictionModel.findById(predictionId);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    if (prediction.accessType === 'free' && prediction.price === 0) {
      throw new BadRequestException('Prediction is free');
    }

    // already purchased
    const existing = await this.purchaseModel.findOne({
      userId,
      predictionId,
      status: 'success',
    });

    if (existing) {
      return {
        message: 'Already purchased',
        alreadyOwned: true,
      };
    }

    // reuse pending
    const pending = await this.purchaseModel.findOne({
      userId,
      predictionId,
      status: 'pending',
    });

    if (pending) {
      return {
        message: 'Purchase already initiated',
        reference: pending.reference,
        amount: pending.amount,
      };
    }

    // IMPORTANT: reference is the LINK to Payment system
    const reference = randomUUID();

    const purchase = await this.purchaseModel.create({
      userId,
      predictionId,

      amount: prediction.price ?? 0,

      reference,

      status: 'pending',
    });

    return {
      message: 'Purchase initialized',
      reference: purchase.reference,
      amount: purchase.amount,
    };
  }
  async getMyPurchases(userId: string) {
    return this.purchaseModel
      .find({
        userId,
        status: 'success',
      })
      .populate('predictionId')
      .sort({
        createdAt: -1,
      });
  }
  // =====================================
  // MARK AS SUCCESS (ADMIN ONLY)
  // =====================================
  async markAsSuccess(reference: string, gatewayResponse?: any) {
    const purchase = await this.purchaseModel.findOne({
      reference,
    });

    if (!purchase) {
      throw new BadRequestException('Invalid reference');
    }

    if (purchase.status === 'success') {
      return purchase;
    }

    purchase.status = 'success';
    purchase.paidAt = new Date();
    purchase.gatewayResponse = gatewayResponse || {
      manual: true,
    };

    await purchase.save();

    await this.referralsService.markPredictionPurchased(purchase.userId);

    return purchase;
  }

  async markAsSuccessByPredictionId(
    userId: string,
    predictionId: string,
    gatewayResponse?: any,
  ) {
    const purchase = await this.purchaseModel.findOne({
      userId,
      predictionId,
    });

    if (!purchase) {
      throw new BadRequestException('Purchase not found');
    }

    if (purchase.status === 'success') {
      return purchase;
    }

    purchase.status = 'success';
    purchase.paidAt = new Date();
    purchase.gatewayResponse = gatewayResponse || { manual: true };

    return purchase.save();
  }
  // =====================================
  // ACCESS CHECK
  // =====================================
  async hasPurchased(userId: string, predictionId: string) {
    return this.purchaseModel.exists({
      userId,
      predictionId,
      status: 'success',
    });
  }
  // =====================================
  // ADMIN SUMMARY
  // =====================================
  async getPurchaseSummary(userId: string) {
    const purchases = await this.purchaseModel
      .find({
        userId,
        status: 'success',
      })
      .populate('predictionId')
      .sort({
        createdAt: -1,
      });

    return {
      purchases,

      latestPurchases: purchases.slice(0, 10),

      totalPurchases: purchases.length,

      totalSpent: purchases.reduce((sum, purchase) => sum + purchase.amount, 0),
    };
  }
  // =====================================
  // GET BY REFERENCE (NEW - IMPORTANT)
  // =====================================
  async getByReference(reference: string) {
    return this.purchaseModel.findOne({
      reference,
    });
  }
}
