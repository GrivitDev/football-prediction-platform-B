import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentHandler {
  buildPaymentMessage(data: {
    fullName: string;
    email: string;

    type: string;
    amount: number;

    target: string;
  }) {
    return `
💰 NEW PAYMENT

User: ${data.fullName}
Email: ${data.email}

Type: ${data.type}
Amount: ₦${data.amount}

Target: ${data.target}
`;
  }
}
