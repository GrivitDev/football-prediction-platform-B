import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';

import { Payment, PaymentDocument } from './schemas/payment.schema';

import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import { PredictionPurchasesService } from '../prediction-purchases/prediction-purchases.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { AdminGateway } from 'src/realtime/admin.gateway';
import { ReferralsService } from 'src/referrals/referrals.service';
import { PlanConfigService } from 'src/plan-config/plan-config.service';
import { EmailService } from 'src/notifications/email.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private paymentModel: Model<PaymentDocument>,

    private subscriptionsService: SubscriptionsService,

    private predictionPurchaseService: PredictionPurchasesService,
    private telegramService: TelegramService,
    private adminGateway: AdminGateway,
    private referralsService: ReferralsService,
    private readonly planConfigService: PlanConfigService,
    private emailService: EmailService,
  ) {}

  // =====================================
  // CREATE PAYMENT
  // =====================================
  async createPayment(dto: {
    userId: string;
    email: string;
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
      target: dto.target,
      status: 'pending',
    });

    if (existingPending) {
      throw new BadRequestException(
        'You already have a pending payment request',
      );
    }

    const existingPayment = await this.paymentModel.findOne({
      type: 'prediction',
      target: dto.target,
      status: 'pending',
    });
    if (existingPayment) {
      throw new BadRequestException('Payment already pending');
    }

    const config = await this.planConfigService.get();

    let amount = 0;

    if (dto.type === 'subscription' || dto.type === 'vip_upgrade') {
      if (dto.target === 'regular') {
        amount = config.regularPrice;
      } else if (dto.target === 'vip') {
        amount = config.vipPrice;
      } else {
        throw new BadRequestException('Invalid subscription plan.');
      }
    }

    if (dto.type === 'prediction') {
      const purchase = await this.predictionPurchaseService.getByReference(
        dto.target,
      );

      if (!purchase) {
        throw new BadRequestException('Purchase not found.');
      }

      // Additional validation
      if (purchase.userId.toString() !== dto.userId) {
        throw new BadRequestException('Purchase does not belong to this user.');
      }

      if (purchase.status === 'success') {
        throw new BadRequestException('Prediction already purchased.');
      }

      amount = purchase.amount;
    }

    const reference = randomUUID();

    const payment = await this.paymentModel.create({
      userId: dto.userId,
      email: dto.email,
      amount,

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

    await this.emailService.sendPaymentReceivedEmail({
      email: payment.email,

      amount: payment.amount,

      paymentType:
        payment.type === 'subscription'
          ? `${payment.target.toUpperCase()} Subscription`
          : payment.type === 'vip_upgrade'
            ? 'VIP Upgrade'
            : 'Prediction Purchase',

      reference: payment.reference,
    });

    await this.telegramService.notifyNewPayment({
      fullName: dto.email,
      email: dto.email,

      amount,

      type: dto.type,

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

    const config = await this.planConfigService.get();

    // =====================================
    // SUBSCRIPTION FLOW
    // =====================================
    if (payment.type === 'subscription') {
      const plan = payment.target?.trim() as 'regular' | 'vip';

      if (!['regular', 'vip'].includes(plan)) {
        throw new BadRequestException('Invalid subscription plan');
      }

      const subscription = await this.subscriptionsService.activatePlan({
        userId: payment.userId,
        email: payment.email,
        plan,
        amount: payment.amount,
        durationDays: config.subscriptionDurationDays,
      });

      await this.emailService.sendSubscriptionActivatedEmail({
        email: payment.email,

        plan: subscription.plan,

        amount: payment.amount,

        activatedDate: subscription.startDate,

        expiryDate: subscription.expiryDate,
      });

      if (plan === 'regular') {
        await this.referralsService.markRegularSubscription(payment.userId);
      }

      if (plan === 'vip') {
        await this.referralsService.markVipSubscription(payment.userId);
      }
    }

    // =====================================
    // VIP UPGRADE FLOW
    // =====================================
    if (payment.type === 'vip_upgrade') {
      const subscription = await this.subscriptionsService.activatePlan({
        userId: payment.userId,
        email: payment.email,
        plan: 'vip',
        amount: payment.amount,
        durationDays: config.subscriptionDurationDays,
      });

      await this.emailService.sendSubscriptionActivatedEmail({
        email: payment.email,

        plan: subscription.plan,

        amount: payment.amount,

        activatedDate: subscription.startDate,

        expiryDate: subscription.expiryDate,
      });
      await this.referralsService.markVipSubscription(payment.userId);
    }

    // =====================================
    // PREDICTION FLOW (FIXED)
    // =====================================
    if (payment.type === 'prediction') {
      const purchase = await this.predictionPurchaseService.getByReference(
        payment.target,
      );

      if (!purchase) {
        throw new BadRequestException('Prediction purchase not found');
      }
      await this.predictionPurchaseService.markAsSuccessByReference(
        payment.target,
        payment._id.toString(),
        {
          source: 'manual_admin',
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
    await this.emailService.sendPaymentRejectedEmail({
      email: payment.email,

      paymentType:
        payment.type === 'subscription'
          ? `${payment.target.toUpperCase()} Subscription`
          : payment.type === 'vip_upgrade'
            ? 'VIP Upgrade'
            : 'Prediction Purchase',

      amount: payment.amount,

      reason: payment.adminNote,
    });

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
