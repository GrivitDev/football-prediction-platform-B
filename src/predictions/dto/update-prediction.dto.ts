// src/predictions/dto/update-prediction.dto.ts

import {
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  ValidateNested,
  IsString,
} from 'class-validator';

import { Type } from 'class-transformer';

class MarketDto {
  @IsString()
  market!: string;

  @IsOptional()
  @IsString()
  selection?: string;
}

class ProbabilitiesDto {
  @IsNumber()
  home!: number;

  @IsNumber()
  draw!: number;

  @IsNumber()
  away!: number;
}

export class UpdatePredictionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ProbabilitiesDto)
  probabilities?: ProbabilitiesDto;

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
  @IsString()
  matchDate?: string;

  @IsOptional()
  @ValidateNested({
    each: true,
  })
  @Type(() => MarketDto)
  markets?: MarketDto[];
}
