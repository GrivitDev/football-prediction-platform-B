import { Module } from '@nestjs/common';

import { TelegramService } from './telegram.service';

import { UserHandler } from './handlers/user.handler';
import { PaymentHandler } from './handlers/payment.handler';
import { RewardHandler } from './handlers/reward.handler';

@Module({
  providers: [TelegramService, UserHandler, PaymentHandler, RewardHandler],

  exports: [TelegramService],
})
export class TelegramModule {}
