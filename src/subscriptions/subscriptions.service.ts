import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    private emailService: EmailService,
  ) {}

  // =====================================
  // CALCULATE EXPIRY
  // =====================================
  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // =====================================
  // GET ACTIVE SUBSCRIPTION
  // =====================================
  async getActiveSubscription(userId: string) {
    return this.subscriptionModel.findOne({
      userId,
      isActive: true,
      expiryDate: { $gt: new Date() },
    });
  }

  // =====================================
  // CREATE OR EXTEND SUBSCRIPTION
  // =====================================
  async createSubscription(data: {
    userId: string;
    email: string;
    plan: 'regular' | 'vip';
    amount: number;
    durationDays: number;
  }) {
    const now = new Date();

    const existing = await this.getActiveSubscription(data.userId);

    // =====================================
    // CASE 1: NO ACTIVE SUBSCRIPTION
    // =====================================
    if (!existing) {
      const expiry = this.addDays(now, data.durationDays);

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,
        plan: data.plan,
        amount: data.amount,
        startDate: now,
        expiryDate: expiry,
        isActive: true,
      });
    }

    // =====================================
    // CASE 2: UPGRADE OR EXTEND EXISTING
    // =====================================

    let newPlan = existing.plan;

    // Upgrade logic: regular -> vip
    if (existing.plan === 'regular' && data.plan === 'vip') {
      newPlan = 'vip';
    }

    // Preserve remaining time
    const baseDate = existing.expiryDate > now ? existing.expiryDate : now;

    const newExpiry = this.addDays(baseDate, data.durationDays);

    // deactivate old record
    await this.subscriptionModel.updateMany(
      { userId: data.userId, isActive: true },
      { isActive: false },
    );

    return this.subscriptionModel.create({
      userId: data.userId,
      email: data.email,
      plan: newPlan,
      amount: data.amount,
      startDate: now,
      expiryDate: newExpiry,
      isActive: true,
      expiringReminderSent: false,
      expiredNotificationSent: false,
    });
  }

  // =====================================
  // WRAPPER
  // =====================================
  async activatePlan(data: {
    userId: string;
    email: string;
    plan: 'regular' | 'vip';
    amount: number;
    durationDays: number;
  }) {
    return this.createSubscription(data);
  }

  // =====================================
  // USER PLAN CHECK
  // =====================================
  async getUserPlan(userId: string): Promise<'free' | 'regular' | 'vip'> {
    const sub = await this.getActiveSubscription(userId);

    if (!sub) return 'free';
    if (sub.plan === 'vip') return 'vip';

    return 'regular';
  }

  // =====================================
  // VIP CHECK
  // =====================================
  async isVip(userId: string) {
    const sub = await this.getActiveSubscription(userId);

    return !!sub && sub.plan === 'vip';
  }

  // =====================================
  // ADMIN HELPERS
  // =====================================
  async getExpiredSubscriptions() {
    return this.subscriptionModel.find({
      isActive: true,
      expiryDate: { $lt: new Date() },
    });
  }

  async deactivateSubscription(id: string) {
    return this.subscriptionModel.findByIdAndUpdate(id, { isActive: false });
  }
  // =====================================
  // ADMIN SUMMARY
  // =====================================
  async getSubscriptionSummary(userId: string) {
    const subscription = await this.subscriptionModel
      .findOne({
        userId,
      })
      .sort({ createdAt: -1 });

    if (!subscription) {
      return {
        hasSubscription: false,
        currentPlan: 'free',
        status: 'inactive',
        subscription: null,
        daysRemaining: 0,
        expired: true,
      };
    }

    const now = new Date();

    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (subscription.expiryDate.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    return {
      hasSubscription: true,

      currentPlan: subscription.plan,

      status:
        subscription.isActive && subscription.expiryDate > now
          ? 'active'
          : 'expired',

      daysRemaining,

      expired: subscription.expiryDate <= now,

      subscription,
    };
  }
  async getVipUsers() {
    return this.subscriptionModel.find({
      plan: 'vip',
      isActive: true,
      expiryDate: { $gt: new Date() },
    });
  }

  // =====================================
  // FIND SUBSCRIPTIONS EXPIRING IN 3 DAYS
  // =====================================
  async getExpiringSubscriptions() {
    const today = new Date();

    const targetDate = new Date();

    targetDate.setDate(today.getDate() + 3);

    const start = new Date(targetDate);

    start.setHours(0, 0, 0, 0);

    const end = new Date(targetDate);

    end.setHours(23, 59, 59, 999);

    return this.subscriptionModel.find({
      isActive: true,

      expiringReminderSent: false,

      expiryDate: {
        $gte: start,
        $lte: end,
      },
    });
  }

  // =====================================
  // FIND EXPIRED SUBSCRIPTIONS
  // =====================================
  async getSubscriptionsExpired() {
    return this.subscriptionModel.find({
      isActive: true,

      expiredNotificationSent: false,

      expiryDate: {
        $lt: new Date(),
      },
    });
  }

  // =====================================
  // SEND EXPIRING EMAIL
  // =====================================
  async sendExpiringEmail(subscription: any) {
    await this.emailService.sendSubscriptionExpiringEmail({
      email: subscription.email,

      plan: subscription.plan,

      expiryDate: subscription.expiryDate,

      daysRemaining: 3,
    });

    subscription.expiringReminderSent = true;

    await subscription.save();
  }

  // =====================================
  // SEND EXPIRED EMAIL
  // =====================================
  async sendExpiredEmail(subscription: any) {
    await this.emailService.sendSubscriptionExpiredEmail({
      email: subscription.email,

      plan: subscription.plan,

      expiryDate: subscription.expiryDate,
    });

    subscription.expiredNotificationSent = true;

    subscription.isActive = false;

    await subscription.save();
  }
}
