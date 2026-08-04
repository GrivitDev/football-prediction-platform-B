import { BadRequestException, Injectable } from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentGateway,
  VerifyPaymentResult,
  WebhookEvent,
} from '../interfaces/payment-gateway.interface';

@Injectable()
export class PaystackProvider implements PaymentGateway {
  private readonly secretKey: string;

  private readonly baseUrl = 'https://api.paystack.co';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY')!;
  }

  // =====================================================
  // INITIALIZE PAYMENT
  // =====================================================
  async initializePayment(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/transaction/initialize`,
        {
          email: input.email,

          amount: Math.round(input.amount * 100),

          reference: input.reference,

          callback_url: input.callbackUrl,

          currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      ),
    );

    if (!data.status) {
      throw new BadRequestException(
        data.message ?? 'Unable to initialize payment.',
      );
    }

    return {
      authorizationUrl: data.data.authorization_url,

      accessCode: data.data.access_code,

      reference: data.data.reference,
    };
  }

  // =====================================================
  // VERIFY PAYMENT
  // =====================================================
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      }),
    );
    // 👇 ADD THIS
    console.log('================ PAYSTACK VERIFY ================');
    console.log(JSON.stringify(data, null, 2));
    console.log('=================================================');
    const payment = data.data;

    // ===================================================
    // PROVIDER RESPONSE IS NOT VALID
    // ===================================================

    if (!data.status || !payment) {
      return {
        success: false,

        status: 'failed',

        message: data.message ?? 'Unable to verify payment.',

        transactionId: payment?.id ? String(payment.id) : undefined,

        raw: data,
      };
    }

    // ===================================================
    // NORMALIZE PAYSTACK STATUS
    // ===================================================

    const paymentStatus = String(payment.status ?? '').toLowerCase();

    // ===================================================
    // SUCCESS
    // ===================================================

    if (paymentStatus === 'success') {
      return {
        success: true,

        status: 'success',

        message: data.message ?? 'Payment verified successfully.',

        transactionId: payment.id ? String(payment.id) : undefined,

        raw: payment,
      };
    }

    // ===================================================
    // PENDING / PROCESSING
    // ===================================================

    if (paymentStatus === 'pending' || paymentStatus === 'ongoing') {
      return {
        success: false,

        status: 'pending',

        message: data.message ?? 'Your payment is still being processed.',

        transactionId: payment.id ? String(payment.id) : undefined,

        raw: payment,
      };
    }

    // ===================================================
    // FAILED / ABANDONED / OTHER
    // ===================================================

    return {
      success: false,

      status: 'failed',

      message:
        data.message ?? `Payment status: ${payment.status ?? 'unknown'}.`,

      transactionId: payment.id ? String(payment.id) : undefined,

      raw: payment,
    };
  }

  // =====================================================
  // VALIDATE WEBHOOK
  // =====================================================
  async validateWebhook(payload: any, signature?: string): Promise<boolean> {
    if (!signature) {
      return false;
    }

    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash === signature;
  }

  // =====================================================
  // PARSE WEBHOOK
  // =====================================================
  async parseWebhook(payload: any): Promise<WebhookEvent> {
    return {
      reference: payload.data.reference,

      transactionId: String(payload.data.id),

      status: payload.data.status === 'success' ? 'success' : 'failed',

      raw: payload,
    };
  }
}
