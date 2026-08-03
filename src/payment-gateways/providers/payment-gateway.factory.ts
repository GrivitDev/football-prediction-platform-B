import { BadRequestException, Injectable } from '@nestjs/common';

import { PaymentGateway } from '../interfaces/payment-gateway.interface';

import { PaystackProvider } from './paystack.provider';
import { OPayProvider } from './opay.provider';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly paystackProvider: PaystackProvider,
    private readonly opayProvider: OPayProvider,
  ) {}

  create(gateway: 'paystack' | 'opay'): PaymentGateway {
    switch (gateway) {
      case 'paystack':
        return this.paystackProvider;

      case 'opay':
        return this.opayProvider;

      default:
        throw new BadRequestException(
          `Unsupported payment gateway: ${gateway}`,
        );
    }
  }
}
