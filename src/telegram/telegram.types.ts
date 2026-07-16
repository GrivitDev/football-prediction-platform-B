export interface TelegramUserNotification {
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;

  referred: boolean;

  referredBy?: {
    id: string;
    fullName: string;
    username: string;
    email: string;
  };
}

export interface TelegramPaymentNotification {
  fullName: string;
  email: string;

  type: string;
  amount: number;

  target: string;

  proofImageUrl?: string;
}

export interface TelegramExpiryNotification {
  fullName: string;
  email: string;

  plan: string;

  expiryDate: Date;
}
