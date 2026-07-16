import { Injectable } from '@nestjs/common';

@Injectable()
export class RewardHandler {
  buildCashRewardMessage(data: {
    fullName: string;
    email: string;

    campaign: string;

    amount: number;

    bankName: string;
    accountName: string;
    accountNumber: string;
  }) {
    return `
🎁 CASH REWARD REQUEST


User:
${data.fullName}

Email:
${data.email}


Campaign:
${data.campaign}


Reward Amount:
₦${data.amount}


BANK DETAILS

Bank:
${data.bankName}

Account Name:
${data.accountName}

Account Number:
${data.accountNumber}


Status:
Waiting for admin payment
`;
  }
}
