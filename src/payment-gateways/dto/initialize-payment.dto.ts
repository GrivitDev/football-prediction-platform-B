import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum PaymentGateway {
  PAYSTACK = 'paystack',
  OPAY = 'opay',
}

export enum PaymentType {
  SUBSCRIPTION = 'subscription',
  PREDICTION = 'prediction',
  VIP_UPGRADE = 'vip_upgrade',
}

export class InitializePaymentDto {
  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  @IsEnum(PaymentType)
  type!: PaymentType;

  /**
   * subscription => regular | vip
   * vip_upgrade => vip
   * prediction => purchase reference
   */
  @IsString()
  @IsNotEmpty()
  target!: string;
}
