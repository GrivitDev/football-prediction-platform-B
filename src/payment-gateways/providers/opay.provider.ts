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
export class OPayProvider implements PaymentGateway {
  private readonly merchantId: string;

  private readonly privateKey: string;

  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.merchantId = this.config.get<string>('OPAY_MERCHANT_ID')!;

    this.privateKey = this.config.get<string>('OPAY_PRIVATE_KEY')!;

    this.baseUrl =
      this.config.get<string>('OPAY_BASE_URL') ??
      'https://liveapi.opaycheckout.com';
  }

  // =====================================================
  // INITIALIZE PAYMENT
  // =====================================================
  async initializePayment(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const payload = {
      reference: input.reference,

      country: 'NG',

      currency: 'NGN',

      amount: input.amount,

      returnUrl: input.callbackUrl,

      cancelUrl: input.callbackUrl,

      userInfo: {
        email: input.email,
      },
    };

    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/v1/international/cashier/create`,
        payload,
        {
          headers: {
            MerchantId: this.merchantId,

            Authorization: `Bearer ${this.privateKey}`,

            'Content-Type': 'application/json',
          },
        },
      ),
    );

    if (data.code !== '00000') {
      throw new BadRequestException(
        data.message ?? 'Unable to initialize payment.',
      );
    }

    return {
      authorizationUrl: data.data.cashierUrl,

      accessCode: data.data.reference,

      reference: data.data.reference,
    };
  }

  // =====================================================
  // VERIFY PAYMENT
  // =====================================================
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const { data } = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/v1/international/cashier/status`,
        {
          reference,
        },
        {
          headers: {
            MerchantId: this.merchantId,

            Authorization: `Bearer ${this.privateKey}`,

            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return {
      success: data.code === '00000' && data.data.status === 'SUCCESS',

      message: data.message,

      transactionId: data.data.transactionId,

      raw: data.data,
    };
  }

  // =====================================================
  // VALIDATE WEBHOOK
  // =====================================================
  async validateWebhook(payload: any, signature?: string): Promise<boolean> {
    if (!signature) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', this.privateKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    return expected === signature;
  }

  // =====================================================
  // PARSE WEBHOOK
  // =====================================================
  async parseWebhook(payload: any): Promise<WebhookEvent> {
    return {
      reference: payload.reference,

      transactionId: payload.transactionId,

      status: payload.status === 'SUCCESS' ? 'success' : 'failed',

      raw: payload,
    };
  }
}
