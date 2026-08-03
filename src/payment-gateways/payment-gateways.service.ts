import { BadRequestException, Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PaymentsService } from '../payments/payments.service';

import { PaymentGatewayFactory } from './providers/payment-gateway.factory';

@Injectable()
export class PaymentGatewaysService {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly configService: ConfigService,
  ) {}

  // ===================================================
  // INITIALIZE PAYMENT
  // ===================================================
  async initializePayment(dto: {
    userId: string;
    email: string;

    gateway: 'paystack' | 'opay';

    type: 'subscription' | 'prediction' | 'vip_upgrade';

    target: string;
  }) {
    // Create pending payment in our database
    const payment = await this.paymentsService.createGatewayPaymentRecord({
      userId: dto.userId,
      email: dto.email,

      gateway: dto.gateway,

      type: dto.type,

      target: dto.target,
    });

    const gateway = this.gatewayFactory.create(dto.gateway);

    return gateway.initializePayment({
      email: dto.email,

      amount: payment.amount,

      reference: payment.reference,

      callbackUrl: `${this.configService.get<string>('FRONTEND_URL')}/payment/callback`,
    });
  }

  // ===================================================
  // VERIFY PAYMENT
  // ===================================================
  async verifyPayment(gatewayName: 'paystack' | 'opay', reference: string) {
    const gateway = this.gatewayFactory.create(gatewayName);

    const verification = await gateway.verifyPayment(reference);

    if (!verification.success) {
      await this.paymentsService.rejectGatewayPayment(
        reference,
        verification.raw,
      );

      throw new BadRequestException(
        verification.message ?? 'Payment verification failed.',
      );
    }

    return this.paymentsService.approveGatewayPayment(
      reference,
      verification.transactionId,
      verification.raw,
    );
  }

  // ===================================================
  // WEBHOOK
  // ===================================================
  async handleWebhook(
    gatewayName: 'paystack' | 'opay',
    payload: any,
    signature?: string,
  ) {
    const gateway = this.gatewayFactory.create(gatewayName);

    const valid = await gateway.validateWebhook(payload, signature);

    if (!valid) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    const event = await gateway.parseWebhook(payload);

    if (event.status !== 'success') {
      return {
        received: true,
      };
    }

    await this.paymentsService.approveGatewayPayment(
      event.reference,
      event.transactionId,
      payload,
    );

    return {
      received: true,
    };
  }
}
