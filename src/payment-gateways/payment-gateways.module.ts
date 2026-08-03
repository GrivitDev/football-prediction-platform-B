import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { PaymentGatewaysController } from './payment-gateways.controller';
import { PaymentGatewaysService } from './payment-gateways.service';

import { PaymentsModule } from '../payments/payments.module';

import { PaystackProvider } from './providers/paystack.provider';
import { OPayProvider } from './providers/opay.provider';
import { PaymentGatewayFactory } from './providers/payment-gateway.factory';

@Module({
  imports: [HttpModule, PaymentsModule],

  controllers: [PaymentGatewaysController],

  providers: [
    PaymentGatewaysService,

    PaystackProvider,
    OPayProvider,

    PaymentGatewayFactory,
  ],

  exports: [PaymentGatewaysService],
})
export class PaymentGatewaysModule {}
