import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateSubscriptionDto {
  @IsEnum(['free', 'regular', 'vip'])
  plan!: 'free' | 'regular' | 'vip';

  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  userId!: string;
}
