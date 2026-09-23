import { BadRequestException, Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';

import { EmailService } from '../notifications/email.service';

export type SubscriptionPlan = 'regular' | 'vip' | 'premium';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,

    private readonly emailService: EmailService,
  ) {}

  // =====================================
  // CALCULATE EXPIRY
  // =====================================

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /**
   * 0 days = lifetime.
   */
  private getExpiryDate(startDate: Date, durationDays: number): Date | null {
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return null;
    }

    return this.addDays(startDate, durationDays);
  }

  // =====================================
  // GET ACTIVE SUBSCRIPTION
  // =====================================

  async getActiveSubscription(userId: string) {
    const now = new Date();

    return this.subscriptionModel
      .findOne({
        userId,

        startDate: {
          $lte: now,
        },

        $or: [
          {
            expiryDate: {
              $gt: now,
            },
          },
          {
            expiryDate: null,
          },
        ],
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
    plan: SubscriptionPlan;
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

      const expiryDate = this.getExpiryDate(startDate, data.durationDays);

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
    // =====================================

    if (existing.plan === data.plan) {
      if (!existing.expiryDate) {
        throw new BadRequestException(
          'This lifetime subscription is already active',
        );
      }

      const startDate = existing.expiryDate;

      const expiryDate = this.getExpiryDate(startDate, data.durationDays);

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
    // LIFETIME PREMIUM
    //
    // Nothing can be queued after it.
    // =====================================

    if (!existing.expiryDate) {
      throw new BadRequestException(
        'Another subscription cannot be queued while a lifetime premium subscription is active',
      );
    }

    // =====================================
    // DIFFERENT PLAN
    //
    // Current plan remains active.
    // New plan starts after current plan expires.
    // =====================================

    const startDate = existing.expiryDate;

    const expiryDate = this.getExpiryDate(startDate, data.durationDays);

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
    currency: 'NGN' | 'USD',
  ) {
    const subscription = await this.getActiveSubscription(userId);

    // =====================================
    // NO SUBSCRIPTION
    // =====================================

    if (!subscription) {
      return {
        currentPlan: 'free',

        currency,

        regularPrice,

        vipPrice,

        subscriptionDurationDays,

        daysRemaining: 0,

        regularDailyPrice: 0,

        vipDailyPrice: 0,

        upgradeDailyPrice: 0,

        credit: 0,

        upgradeCost: vipPrice,

        amount: vipPrice,

        canUpgrade: false,
      };
    }

    // =====================================
    // ALREADY VIP
    // =====================================

    if (subscription.plan === 'vip') {
      return {
        currentPlan: 'vip',

        currency,

        regularPrice,

        vipPrice,

        subscriptionDurationDays,

        daysRemaining: 0,

        regularDailyPrice: 0,

        vipDailyPrice: 0,

        upgradeDailyPrice: 0,

        credit: 0,

        upgradeCost: 0,

        amount: 0,

        canUpgrade: false,
      };
    }

    // =====================================
    // ALREADY PREMIUM
    // =====================================

    if (subscription.plan === 'premium') {
      return {
        currentPlan: 'premium',

        currency,

        regularPrice,

        vipPrice,

        subscriptionDurationDays,

        daysRemaining: subscription.expiryDate
          ? Math.max(
              0,
              Math.ceil(
                (subscription.expiryDate.getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : 0,

        regularDailyPrice: 0,

        vipDailyPrice: 0,

        upgradeDailyPrice: 0,

        credit: 0,

        upgradeCost: 0,

        amount: 0,

        canUpgrade: false,
      };
    }

    const now = new Date();

    if (!subscription.expiryDate) {
      return {
        currentPlan: subscription.plan,

        currency,

        regularPrice,

        vipPrice,

        subscriptionDurationDays,

        daysRemaining: 0,

        regularDailyPrice: 0,

        vipDailyPrice: 0,

        upgradeDailyPrice: 0,

        credit: 0,

        upgradeCost: 0,

        amount: 0,

        canUpgrade: false,
      };
    }

    const millisecondsRemaining =
      subscription.expiryDate.getTime() - now.getTime();

    const daysRemaining = Math.max(
      0,
      Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24)),
    );

    const regularDailyPrice = regularPrice / subscriptionDurationDays;

    const vipDailyPrice = vipPrice / subscriptionDurationDays;

    const upgradeDailyPrice = vipDailyPrice - regularDailyPrice;

    const credit = regularDailyPrice * daysRemaining;

    const amount = Math.max(0, vipPrice - credit);

    return {
      currentPlan: subscription.plan,

      currency,

      regularPrice,

      vipPrice,

      subscriptionDurationDays,

      daysRemaining,

      regularDailyPrice,

      vipDailyPrice,

      upgradeDailyPrice,

      credit,

      upgradeCost: amount,

      amount,

      canUpgrade: subscription.plan === 'regular',
    };
  }

  // =====================================
  // ACTIVATE PLAN
  //
  // Free -> Regular = activate now
  // Free -> VIP = activate now
  // Free -> Premium = activate now
  //
  // Regular -> Regular = extend
  // VIP -> VIP = extend
  // Premium -> Premium = extend if finite
  //
  // Regular -> VIP = immediate upgrade
  // Regular -> Premium = immediate upgrade
  // VIP -> Premium = immediate upgrade
  //
  // VIP -> Regular = queue
  // Premium -> VIP = queue if premium has expiry
  // Premium -> Regular = queue if premium has expiry
  // =====================================

  async activatePlan(data: {
    userId: string;
    email: string;
    plan: SubscriptionPlan;
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
        expiryDate: this.getExpiryDate(now, data.durationDays),

        isActive: true,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // SAME PLAN
    // =====================================

    if (existing.plan === data.plan) {
      if (!existing.expiryDate) {
        throw new BadRequestException(
          'This lifetime subscription is already active',
        );
      }

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: data.plan,
        amount: data.amount,

        startDate: existing.expiryDate,

        expiryDate: this.getExpiryDate(existing.expiryDate, data.durationDays),

        isActive: false,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // UPGRADE TO PREMIUM
    //
    // Premium is the highest plan.
    // Activate immediately.
    // =====================================

    if (data.plan === 'premium') {
      if (existing.plan === 'premium') {
        throw new BadRequestException('Premium subscription is already active');
      }

      existing.expiryDate = now;
      existing.isActive = false;

      await existing.save();

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: 'premium',
        amount: data.amount,

        startDate: now,

        expiryDate: this.getExpiryDate(now, data.durationDays),

        isActive: true,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // PREMIUM -> LOWER PLAN
    //
    // If premium is lifetime, nothing can
    // start after it.
    // =====================================

    if (existing.plan === 'premium') {
      if (!existing.expiryDate) {
        throw new BadRequestException(
          'A lower plan cannot be scheduled while lifetime premium is active',
        );
      }

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: data.plan,
        amount: data.amount,

        startDate: existing.expiryDate,

        expiryDate: this.getExpiryDate(existing.expiryDate, data.durationDays),

        isActive: false,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // REGULAR -> VIP
    //
    // Upgrade immediately.
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

        expiryDate: this.getExpiryDate(now, data.durationDays),

        isActive: true,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // VIP -> REGULAR
    //
    // Queue after VIP expires.
    // =====================================

    if (existing.plan === 'vip' && data.plan === 'regular') {
      if (!existing.expiryDate) {
        throw new BadRequestException(
          'A regular subscription cannot be scheduled without a VIP expiry date',
        );
      }

      return this.subscriptionModel.create({
        userId: data.userId,
        email: data.email,

        plan: 'regular',
        amount: data.amount,

        startDate: existing.expiryDate,

        expiryDate: this.getExpiryDate(existing.expiryDate, data.durationDays),

        isActive: false,

        expiringReminderSent: false,
        expiredNotificationSent: false,
      });
    }

    // =====================================
    // FALLBACK
    // =====================================

    throw new BadRequestException('Unsupported subscription transition');
  }

  // =====================================
  // USER PLAN CHECK
  // =====================================

  async getUserPlan(
    userId: string,
  ): Promise<'free' | 'regular' | 'vip' | 'premium'> {
    const sub = await this.getActiveSubscription(userId);

    if (!sub) {
      return 'free';
    }

    if (sub.plan === 'premium') {
      return 'premium';
    }

    if (sub.plan === 'vip') {
      return 'vip';
    }

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
  // PREMIUM CHECK
  // =====================================

  async isPremium(userId: string) {
    const sub = await this.getActiveSubscription(userId);

    return !!sub && sub.plan === 'premium';
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
        $ne: null,
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

    const daysRemaining = subscription.expiryDate
      ? Math.max(
          0,
          Math.ceil(
            (subscription.expiryDate.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

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

      $or: [
        {
          expiryDate: {
            $gt: now,
          },
        },
        {
          expiryDate: null,
        },
      ],
    });
  }

  // =====================================
  // GET PREMIUM USERS
  // =====================================

  async getPremiumUsers() {
    const now = new Date();

    return this.subscriptionModel.find({
      plan: 'premium',

      startDate: {
        $lte: now,
      },

      $or: [
        {
          expiryDate: {
            $gt: now,
          },
        },
        {
          expiryDate: null,
        },
      ],
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
        $ne: null,
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
        $ne: null,
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
