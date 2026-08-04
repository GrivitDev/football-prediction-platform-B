import { BadRequestException, Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PaymentsService } from '../payments/payments.service';

import { TelegramService } from '../telegram/telegram.service';

import { PaymentGatewayFactory } from './providers/payment-gateway.factory';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class PaymentGatewaysService {
  constructor(
    private readonly paymentsService: PaymentsService,

    private readonly gatewayFactory: PaymentGatewayFactory,

    private readonly configService: ConfigService,

    private readonly telegramService: TelegramService,

    private readonly usersService: UsersService,
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
    // =================================================
    // CREATE PENDING PAYMENT RECORD
    // =================================================
    const payment = await this.paymentsService.createGatewayPaymentRecord({
      userId: dto.userId,

      email: dto.email,

      gateway: dto.gateway,

      type: dto.type,

      target: dto.target,
    });

    // =================================================
    // CREATE GATEWAY INSTANCE
    // =================================================
    const gateway = this.gatewayFactory.create(dto.gateway);

    // =================================================
    // INITIALIZE PAYMENT WITH GATEWAY
    // =================================================
    return gateway.initializePayment({
      email: dto.email,

      amount: payment.amount,

      reference: payment.reference,

      callbackUrl: `${this.configService.get<string>(
        'FRONTEND_URL',
      )}/pricing/callback`,
    });
  }

  // ===================================================
  // VERIFY PAYMENT
  //
  // THIS IS THE ONLY PAYMENT APPROVAL FLOW.
  //
  // Callback Page
  //      ↓
  // Verify with Gateway
  //      ↓
  // Approve Payment
  //      ↓
  // Activate Subscription / Prediction
  // ===================================================
  async verifyPayment(gatewayName: 'paystack' | 'opay', reference: string) {
    const gateway = this.gatewayFactory.create(gatewayName);

    const verification = await gateway.verifyPayment(reference);

    // =================================================
    // SUCCESS
    // =================================================

    if (verification.status === 'success') {
      if (!verification.transactionId) {
        throw new BadRequestException(
          'Payment was successful but no transaction ID was returned.',
        );
      }

      const payment = await this.paymentsService.approveGatewayPayment(
        reference,

        verification.transactionId,

        verification.raw,
      );

      return {
        success: true,

        status: 'approved',

        message:
          verification.message ??
          'Your payment has been successfully confirmed.',

        reference,

        transactionId: verification.transactionId,

        payment,
      };
    }

    // =================================================
    // PENDING
    // =================================================

    if (verification.status === 'pending') {
      return {
        success: false,

        status: 'pending',

        message:
          verification.message ??
          'Your payment is still being processed. Please check again shortly.',

        reference,

        transactionId: verification.transactionId ?? null,
      };
    }

    // =================================================
    // FAILED
    // =================================================

    await this.paymentsService.rejectGatewayPayment(
      reference,

      verification.raw,
    );

    return {
      success: false,

      status: 'failed',

      message: verification.message ?? 'We could not confirm your payment.',

      reference,

      transactionId: verification.transactionId ?? null,
    };
  }

  // ===================================================
  // WEBHOOK
  //
  // IMPORTANT:
  //
  // Webhooks DO NOT approve payments.
  //
  // Webhooks DO NOT activate subscriptions.
  //
  // Webhooks ONLY notify the admin that the gateway
  // has reported a successful payment.
  //
  // Final verification and activation happen through
  // the payment callback page.
  // ===================================================
  async handleWebhook(
    gatewayName: 'paystack' | 'opay',

    payload: any,

    signature?: string,
  ) {
    // =================================================
    // CREATE GATEWAY INSTANCE
    // =================================================
    const gateway = this.gatewayFactory.create(gatewayName);

    // =================================================
    // VALIDATE WEBHOOK SIGNATURE
    // =================================================
    const valid = await gateway.validateWebhook(
      payload,

      signature,
    );

    if (!valid) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    // =================================================
    // PARSE WEBHOOK EVENT
    // =================================================
    const event = await gateway.parseWebhook(payload);

    // =================================================
    // IGNORE NON-SUCCESS EVENTS
    //
    // We only notify the admin when the gateway reports
    // a successful payment event.
    //
    // We do NOT approve the payment here.
    // =================================================
    if (event.status !== 'success') {
      return {
        received: true,
      };
    }

    const payment = await this.paymentsService.findPaymentByReference(
      event.reference,
    );

    if (!payment) {
      throw new BadRequestException('Payment record not found.');
    }

    const user = await this.usersService.findById(payment.userId);

    if (!user) {
      throw new BadRequestException('User not found.');
    }

    await this.telegramService.notifyGatewayPaymentReceived({
      gateway: gatewayName,

      fullName: user.fullName,

      email: user.email,

      amount: payment.amount,

      type: payment.type,

      target: payment.target,

      reference: event.reference,

      transactionId: event.transactionId,
    });
    // =================================================
    // ACKNOWLEDGE WEBHOOK
    // =================================================
    return {
      received: true,
    };
  }
}
