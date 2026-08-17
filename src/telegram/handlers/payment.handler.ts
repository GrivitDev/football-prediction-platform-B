import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentHandler {
  buildPaymentMessage(data: {
    fullName: string;
    email: string;

    type: string;

    amount: number;
    currency: string;

    target: string;
  }) {
    const symbol = data.currency === 'USD' ? '$' : '₦';
    return `
💰 NEW PAYMENT

User: ${data.fullName}
Email: ${data.email}

Type: ${data.type}
Amount: ${symbol}${data.amount.toLocaleString()}

Target: ${data.target}
`;
  }
}
