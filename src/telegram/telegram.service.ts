import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Telegraf } from 'telegraf';

import { UserHandler } from './handlers/user.handler';
import { PaymentHandler } from './handlers/payment.handler';
import { RewardHandler } from './handlers/reward.handler';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private bot: Telegraf;

  private adminGroupId: string;

  constructor(
    private config: ConfigService,

    private userHandler: UserHandler,
    private paymentHandler: PaymentHandler,
    private rewardHandler: RewardHandler,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    this.adminGroupId =
      this.config.get<string>('TELEGRAM_ADMIN_GROUP_ID') || '';

    this.bot = new Telegraf(token || '');
  }

  async sendMessage(message: string) {
    try {
      await this.bot.telegram.sendMessage(this.adminGroupId, message);
    } catch (error) {
      this.logger.error(error);
    }
  }

  async sendPhoto(photoUrl: string, caption: string) {
    try {
      await this.bot.telegram.sendPhoto(this.adminGroupId, photoUrl, {
        caption,
      });
    } catch (error) {
      this.logger.error(error);
    }
  }

  async notifyNewUser(data: {
    fullName: string;
    username: string;
    email: string;
    phoneNumber: string;

    referred: boolean;

    referredBy?: {
      id: string;
      fullName: string;
      username: string;
      email: string;
    };
  }) {
    const message = this.userHandler.buildNewUserMessage(data);

    await this.sendMessage(message);
  }

  async notifyNewPayment(data: {
    fullName: string;
    email: string;

    type: string;
    amount: number;

    target: string;

    proofImageUrl?: string;
  }) {
    const message = this.paymentHandler.buildPaymentMessage(data);

    if (data.proofImageUrl) {
      return this.sendPhoto(data.proofImageUrl, message);
    }

    return this.sendMessage(message);
  }

  async notifyCashRewardRequest(data: {
    fullName: string;
    email: string;

    campaign: string;

    amount: number;

    bankName: string;
    accountName: string;
    accountNumber: string;
  }) {
    const message = this.rewardHandler.buildCashRewardMessage(data);

    await this.sendMessage(message);
  }
}
