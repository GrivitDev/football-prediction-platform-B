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
    const now = new Date();

    return this.subscriptionModel
      .findOne({
        userId,
        startDate: { $lte: now },
        expiryDate: { $gt: now },
      })
      .sort({
        startDate: -1,
      });
  }

  // =====================================
  // CREATE OR QUEUE SUBSCRIPTION
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
    // NO ACTIVE SUBSCRIPTION
    // =====================================
    if (!existing) {
      const startDate = now;

      const expiryDate = this.addDays(startDate, data.durationDays);

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,
        plan: data.plan,
        amount: data.amount,
        startDate,
        expiryDate,
        isActive: true,
        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // SAME PLAN
    //
    // Extend from current expiry date.
    //
    // Regular -> Regular
    // VIP -> VIP
    // =====================================
    if (existing.plan === data.plan) {
      const startDate = existing.expiryDate;

      const expiryDate = this.addDays(startDate, data.durationDays);

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,
        plan: data.plan,
        amount: data.amount,
        startDate,
        expiryDate,
        isActive: false,
        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // DIFFERENT PLAN
    //
    // Current plan remains active.
    // New plan starts after current plan expires.
    //
    // Regular -> VIP
    // VIP -> Regular
    // =====================================
    const startDate = existing.expiryDate;

    const expiryDate = this.addDays(startDate, data.durationDays);

    return this.subscriptionModel.create({
      userId: data.userId,
      email: data.email,
      plan: data.plan,
      amount: data.amount,
      startDate,
      expiryDate,
      isActive: false,
      expiringReminderSent: false,
      expiredNotificationSent: false,
    });
  }

  // =====================================
  // CALCULATE VIP UPGRADE PRICE
  // =====================================
  async calculateUpgradePrice(
    userId: string,
    regularPrice: number,
    vipPrice: number,
    subscriptionDurationDays: number,
  ) {
    const subscription = await this.getActiveSubscription(userId);

    // No subscription
    if (!subscription) {
      return {
        currentPlan: 'free',

        regularPrice,

        vipPrice,

        subscriptionDurationDays,

        daysRemaining: 0,

        credit: 0,

        amount: vipPrice,

        canUpgrade: false,
      };
    }

    // Already VIP
    if (subscription.plan === 'vip') {
      return {
        currentPlan: 'vip',

        regularPrice,

        vipPrice,

        subscriptionDurationDays,

        daysRemaining: 0,

        credit: 0,

        amount: 0,

        canUpgrade: false,
      };
    }

    const now = new Date();

    const millisecondsRemaining =
      subscription.expiryDate.getTime() - now.getTime();

    const daysRemaining = Math.max(
      0,
      Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24)),
    );

    const regularDailyPrice = regularPrice / subscriptionDurationDays;

    const vipDailyPrice = vipPrice / subscriptionDurationDays;

    // =====================================
    // UPGRADE CALCULATION
    // =====================================

    // Difference between VIP and Regular
    // daily subscription value.
    const upgradeDailyPrice = vipDailyPrice - regularDailyPrice;

    // Existing Regular subscription value
    // that the user has not yet consumed.
    const credit = Math.round(regularDailyPrice * daysRemaining);

    // Cost of a fresh full VIP subscription
    // after applying the unused Regular value.
    const amount = Math.max(
      0,
      Math.min(vipPrice, Math.round(vipPrice - credit)),
    );

    // Keep upgradeCost in the response.
    // It represents the actual amount required
    // for the VIP upgrade in this calculation.
    const upgradeCost = amount;

    return {
      currentPlan: subscription.plan,

      regularPrice,

      vipPrice,

      subscriptionDurationDays,

      daysRemaining,

      regularDailyPrice,

      vipDailyPrice,

      upgradeDailyPrice,

      upgradeCost,

      amount,

      canUpgrade: subscription.plan === 'regular',
    };
  }

  // =====================================
  // ACTIVATE PLAN
  //
  // Handles:
  //
  // Free -> Regular      = activate now
  // Free -> VIP          = activate now
  //
  // Regular -> Regular   = extend
  // VIP -> VIP           = extend
  //
  // VIP -> Regular       = queue after expiry
  //
  // Regular -> VIP       = activate immediately
  //                        (current regular ends now)
  // =====================================
  async activatePlan(data: {
    userId: string;
    email: string;
    plan: 'regular' | 'vip';
    amount: number;
    durationDays: number;
  }) {
    const now = new Date();

    const existing = await this.getActiveSubscription(data.userId);

    // =====================================
    // NO ACTIVE SUBSCRIPTION
    // =====================================
    if (!existing) {
      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: data.plan,
        amount: data.amount,

        startDate: now,
        expiryDate: this.addDays(now, data.durationDays),

        isActive: true,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // SAME PLAN
    //
    // Extend subscription
    // =====================================
    if (existing.plan === data.plan) {
      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: data.plan,
        amount: data.amount,

        startDate: existing.expiryDate,
        expiryDate: this.addDays(existing.expiryDate, data.durationDays),

        isActive: false,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // REGULAR -> VIP
    //
    // Upgrade immediately.
    //
    // End current subscription now.
    // VIP starts immediately.
    // =====================================
    if (existing.plan === 'regular' && data.plan === 'vip') {
      existing.expiryDate = now;
      existing.isActive = false;

      await existing.save();

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: 'vip',
        amount: data.amount,

        startDate: now,
        expiryDate: this.addDays(now, data.durationDays),

        isActive: true,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // VIP -> REGULAR
    //
    // Never downgrade immediately.
    //
    // Queue Regular subscription
    // after VIP expires.
    // =====================================
    return this.subscriptionModel.create({
      userId: data.userId,
      email: data.email,

      plan: 'regular',
      amount: data.amount,

      startDate: existing.expiryDate,
      expiryDate: this.addDays(existing.expiryDate, data.durationDays),

      isActive: false,

      expiringReminderSent: false,
      expiredNotificationSent: false,
    });
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
  // GET EXPIRED SUBSCRIPTIONS
  // =====================================
  async getExpiredSubscriptions() {
    const now = new Date();

    return this.subscriptionModel.find({
      startDate: {
        $lte: now,
      },

      expiryDate: {
        $lt: now,
      },
    });
  }
  // =====================================
  // ADMIN SUMMARY
  // =====================================
  async getSubscriptionSummary(userId: string) {
    const now = new Date();

    const subscription = await this.getActiveSubscription(userId);

    const pendingSubscription = await this.subscriptionModel
      .findOne({
        userId,

        startDate: {
          $gt: now,
        },
      })
      .sort({
        startDate: 1,
      });

    if (!subscription) {
      return {
        hasSubscription: false,

        currentPlan: 'free',

        status: 'inactive',

        subscription: null,

        daysRemaining: 0,

        expired: true,

        pendingSubscription,
      };
    }

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

      status: 'active',

      daysRemaining,

      expired: false,

      subscription,

      pendingSubscription,
    };
  }

  // =====================================
  // GET VIP USERS
  // =====================================
  async getVipUsers() {
    const now = new Date();

    return this.subscriptionModel.find({
      plan: 'vip',

      startDate: {
        $lte: now,
      },

      expiryDate: {
        $gt: now,
      },
    });
  }

  // =====================================
  // FIND SUBSCRIPTIONS EXPIRING IN 3 DAYS
  // =====================================
  async getExpiringSubscriptions() {
    const now = new Date();

    const targetDate = new Date(now);

    targetDate.setDate(targetDate.getDate() + 3);

    const start = new Date(targetDate);

    start.setHours(0, 0, 0, 0);

    const end = new Date(targetDate);

    end.setHours(23, 59, 59, 999);

    return this.subscriptionModel.find({
      startDate: {
        $lte: now,
      },

      expiryDate: {
        $gte: start,
        $lte: end,
      },

      expiringReminderSent: false,
    });
  }

  // =====================================
  // FIND EXPIRED SUBSCRIPTIONS
  // =====================================
  async getSubscriptionsExpired() {
    const now = new Date();

    return this.subscriptionModel.find({
      startDate: {
        $lte: now,
      },

      expiryDate: {
        $lt: now,
      },

      expiredNotificationSent: false,
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
