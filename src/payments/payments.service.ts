import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';

import { Payment, PaymentDocument } from './schemas/payment.schema';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { PredictionPurchasesService } from '../prediction-purchases/prediction-purchases.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { AdminGateway } from 'src/realtime/admin.gateway';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private paymentModel: Model<PaymentDocument>,

    private subscriptionsService: SubscriptionsService,

    private predictionPurchaseService: PredictionPurchasesService,
    private telegramService: TelegramService,
    private adminGateway: AdminGateway,
  ) {}

  // =====================================
  // CREATE PAYMENT
  // =====================================
  async createPayment(dto: {
    userId: string;
    email: string;
    amount: number;
    type: 'subscription' | 'prediction' | 'vip_upgrade';
    target: string;

    transferReference?: string;
    proofImageUrl?: string;
    proofPublicId?: string;
    proofMessage?: string;
  }) {
    const existingPending = await this.paymentModel.findOne({
      userId: dto.userId,
      type: dto.type,
      status: 'pending',
    });

    if (existingPending) {
      throw new BadRequestException(
        'You already have a pending payment request',
      );
    }

    const reference = randomUUID();

    const payment = await this.paymentModel.create({
      userId: dto.userId,
      email: dto.email,
      amount: dto.amount,

      type: dto.type,
      target: dto.target,

      reference,

      status: 'pending',

      transferReference: dto.transferReference || '',
      proofImageUrl: dto.proofImageUrl || '',
      proofPublicId: dto.proofPublicId || '',
      proofMessage: dto.proofMessage || '',

      processedAt: undefined,
      processedBy: undefined,
      adminNote: '',
    });
    await this.telegramService.notifyNewPayment({
      fullName: dto.email,
      email: dto.email,

      type: dto.type,
      amount: dto.amount,

      target: dto.target,

      proofImageUrl: dto.proofImageUrl,
    });
    this.adminGateway.emitNewPayment(payment);
    return {
      message: 'Payment submitted',
      reference,
      payment,
    };
  }

  // =====================================
  // APPROVE PAYMENT (FIXED)
  // =====================================
  async approvePayment(paymentId: string, adminId: string) {
    const payment = await this.paymentModel.findById(paymentId);

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException('Already processed');
    }

    // mark FIRST (prevents race conditions)
    payment.status = 'approved';
    payment.processedAt = new Date();
    payment.processedBy = adminId;

    await payment.save();

    // =====================================
    // SUBSCRIPTION FLOW
    // =====================================
    if (payment.type === 'subscription') {
      const plan = payment.target?.trim() as 'regular' | 'vip';

      if (!['regular', 'vip'].includes(plan)) {
        throw new BadRequestException('Invalid subscription plan');
      }

      await this.subscriptionsService.activatePlan({
        userId: payment.userId,
        email: payment.email,
        plan,
        amount: payment.amount,
        durationDays: 30,
      });
    }

    // =====================================
    // VIP UPGRADE FLOW
    // =====================================
    if (payment.type === 'vip_upgrade') {
      await this.subscriptionsService.activatePlan({
        userId: payment.userId,
        email: payment.email,
        plan: 'vip',
        amount: payment.amount,
        durationDays: 30,
      });
    }

    // =====================================
    // PREDICTION FLOW (FIXED)
    // =====================================
    if (payment.type === 'prediction') {
      await this.predictionPurchaseService.markAsSuccessByPredictionId(
        payment.userId,
        payment.target,
        {
          source: 'manual_admin',
          paymentId: payment._id,
        },
      );
    }
    this.adminGateway.emitPaymentUpdate(payment);
    return {
      message: 'Payment approved',
      payment,
    };
  }
  async getUserPayments(userId: string) {
    return this.paymentModel
      .find({
        userId,
      })
      .sort({
        createdAt: -1,
      });
  }
  // =====================================
  // REJECT PAYMENT
  // =====================================
  async rejectPayment(paymentId: string, adminId: string, adminNote?: string) {
    const payment = await this.paymentModel.findById(paymentId);

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException('Already processed');
    }

    payment.status = 'rejected';
    payment.processedAt = new Date();
    payment.processedBy = adminId;
    payment.adminNote = adminNote || '';

    await payment.save();

    return payment;
  }

  // =====================================
  // ADMIN QUERIES
  // =====================================
  async getPendingPayments() {
    return this.paymentModel
      .find({ status: 'pending' })
      .sort({ createdAt: -1 });
  }

  async getAllPayments() {
    return this.paymentModel.find().sort({ createdAt: -1 });
  }

  async getTotalRevenue() {
    const res = await this.paymentModel.aggregate([
      { $match: { status: 'approved' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    return res[0]?.total || 0;
  }
  async getPaymentSummary(userId: string) {
    const payments = await this.paymentModel
      .find({ userId })
      .sort({ createdAt: -1 });

    const approved = payments.filter((p) => p.status === 'approved');

    const pending = payments.filter((p) => p.status === 'pending');

    const rejected = payments.filter((p) => p.status === 'rejected');

    const subscriptionPayments = approved.filter(
      (p) => p.type === 'subscription' || p.type === 'vip_upgrade',
    );

    const predictionPayments = approved.filter((p) => p.type === 'prediction');

    return {
      payments,

      latestPayments: payments.slice(0, 10),

      totalRevenue: approved.reduce((sum, p) => sum + p.amount, 0),

      subscriptionRevenue: subscriptionPayments.reduce(
        (sum, p) => sum + p.amount,
        0,
      ),

      predictionRevenue: predictionPayments.reduce(
        (sum, p) => sum + p.amount,
        0,
      ),

      totalPayments: payments.length,

      approvedPayments: approved.length,

      pendingPayments: pending.length,

      rejectedPayments: rejected.length,
    };
  }

  async getLatestUserPayments(userId: string, limit = 10) {
    return this.paymentModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async getLifetimeRevenue(userId: string) {
    const result = await this.paymentModel.aggregate([
      {
        $match: {
          userId,
          status: 'approved',
        },
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

    return result[0]?.total || 0;
  }

  async countPayments() {
    return this.paymentModel.countDocuments();
  }

  async getRecentPayments(limit = 10) {
    return this.paymentModel.find().sort({ createdAt: -1 }).limit(limit);
  }
}
