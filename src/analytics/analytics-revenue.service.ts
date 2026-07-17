import { Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';

@Injectable()
export class AnalyticsRevenueService {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
  ) {}

  async getRevenue() {
    const approvedPayments = {
      status: 'approved',
    };

    const [
      totalRevenue,

      vipRevenue,

      regularRevenue,

      predictionRevenue,

      totalPayments,

      approvedPaymentCount,

      pendingPayments,

      rejectedPayments,
    ] = await Promise.all([
      // ==========================================
      // TOTAL REVENUE
      // ==========================================

      this.sumRevenue(approvedPayments),

      // ==========================================
      // VIP REVENUE
      // ==========================================

      this.sumRevenue({
        ...approvedPayments,

        $or: [
          {
            type: 'vip_upgrade',
          },

          {
            type: 'subscription',
            target: 'vip',
          },
        ],
      }),

      // ==========================================
      // REGULAR REVENUE
      // ==========================================

      this.sumRevenue({
        ...approvedPayments,

        type: 'subscription',

        target: 'regular',
      }),

      // ==========================================
      // PREDICTION PURCHASE REVENUE
      // ==========================================

      this.sumRevenue({
        ...approvedPayments,

        type: 'prediction',
      }),

      // ==========================================
      // PAYMENT COUNTS
      // ==========================================

      this.paymentModel.countDocuments(),

      this.paymentModel.countDocuments({
        status: 'approved',
      }),

      this.paymentModel.countDocuments({
        status: 'pending',
      }),

      this.paymentModel.countDocuments({
        status: 'rejected',
      }),
    ]);

    return {
      totalRevenue,

      vipRevenue,

      regularRevenue,

      predictionRevenue,

      totalPayments,

      approvedPayments: approvedPaymentCount,

      pendingPayments,

      rejectedPayments,
    };
  }

  // ==========================================
  // SUM PAYMENT AMOUNT
  // ==========================================

  private async sumRevenue(match: Record<string, unknown>): Promise<number> {
    const result = await this.paymentModel.aggregate<{
      total: number;
    }>([
      {
        $match: match,
      },

      {
        $group: {
          _id: null,

          total: {
            $sum: '$amount',
          },
        },
      },
    ]);

    return result[0]?.total ?? 0;
  }
}
