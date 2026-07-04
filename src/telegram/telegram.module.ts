import { Module } from '@nestjs/common';

import { TelegramService } from './telegram.service';

import { UserHandler } from './handlers/user.handler';
import { PaymentHandler } from './handlers/payment.handler';

@Module({
  providers: [TelegramService, UserHandler, PaymentHandler],

  exports: [TelegramService],
})
export class TelegramModule {}
