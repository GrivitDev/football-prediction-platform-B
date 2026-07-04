// src/predictions/dto/update-prediction.dto.ts

import { IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';

class MarketDto {
  market!: string;
  selection?: string;
}

export class UpdatePredictionDto {
  @IsOptional()
  probabilities?: {
    home: number;
    draw: number;
    away: number;
  };

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsEnum(['free', 'regular', 'vip'])
  accessType?: 'free' | 'regular' | 'vip';

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  matchDate?: string;

  @IsOptional()
  markets?: MarketDto[];
}
