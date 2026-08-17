import { BadRequestException, Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PaymentsService } from '../payments/payments.service';
import { TelegramService } from '../telegram/telegram.service';

import { PaymentGatewayFactory } from './providers/payment-gateway.factory';
import { UsersService } from 'src/users/users.service';
import { ExchangeRateService } from './exchange-rate.service';

@Injectable()
export class PaymentGatewaysService {
  constructor(
    private readonly paymentsService: PaymentsService,

    private readonly gatewayFactory: PaymentGatewayFactory,

    private readonly configService: ConfigService,

    private readonly telegramService: TelegramService,

    private readonly usersService: UsersService,

    private readonly exchangeRateService: ExchangeRateService,
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
    // GET ORIGINAL PRICE FROM BACKEND
    // =================================================

    const pricing = await this.paymentsService.calculateGatewayPaymentAmount({
      userId: dto.userId,
      type: dto.type,
      target: dto.target,
    });

    const originalAmount = pricing.amount;
    const originalCurrency = pricing.currency;

    // =================================================
    // CONVERT USD → NGN FOR GATEWAY
    // =================================================

    let gatewayAmount = originalAmount;
    let exchangeRate: number | undefined;

    if (originalCurrency === 'USD') {
      const conversion =
        await this.exchangeRateService.convertUsdToNgn(originalAmount);

      gatewayAmount = conversion.amount;
      exchangeRate = conversion.rate;
    }

    // =================================================
    // CREATE PAYMENT RECORD
    // =================================================

    const payment = await this.paymentsService.createGatewayPaymentRecord({
      userId: dto.userId,
      email: dto.email,
      gateway: dto.gateway,
      type: dto.type,
      target: dto.target,

      // What the customer actually purchased
      amount: originalAmount,
      currency: originalCurrency,

      // What Paystack/OPay actually receives
      gatewayAmount,
      gatewayCurrency: 'NGN',

      // Rate used for conversion
      exchangeRate,
    });

    // =================================================
    // CREATE GATEWAY
    // =================================================

    const gateway = this.gatewayFactory.create(dto.gateway);

    // =================================================
    // SEND ONLY NGN TO GATEWAY
    // =================================================

    if (payment.gatewayAmount == null) {
      throw new BadRequestException(
        'Gateway payment amount could not be calculated.',
      );
    }

    return gateway.initializePayment({
      email: dto.email,

      amount: payment.gatewayAmount,

      currency: 'NGN',

      reference: payment.reference,

      callbackUrl: `${this.configService.get<string>(
        'FRONTEND_URL',
      )}/pricing/callback?gateway=${dto.gateway}`,
    });
  }

  // ===================================================
  // VERIFY PAYMENT
  // ===================================================

  async verifyPayment(gatewayName: 'paystack' | 'opay', reference: string) {
    const gateway = this.gatewayFactory.create(gatewayName);

    const verification = await gateway.verifyPayment(reference);

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

      // Original customer amount
      amount: payment.amount,

      // Original customer currency
      currency: payment.currency,

      type: payment.type,

      target: payment.target,

      reference: event.reference,

      transactionId: event.transactionId,
    });

    return {
      received: true,
    };
  }
}
