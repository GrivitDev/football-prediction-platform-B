// src/predictions/dto/create-prediction.dto.ts

import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';

import { Type } from 'class-transformer';

class ProbabilitiesDto {
  @IsNumber()
  home!: number;

  @IsNumber()
  draw!: number;

  @IsNumber()
  away!: number;
}

class MarketDto {
  @IsString()
  market!: string;

  @IsOptional()
  @IsString()
  selection?: string;
}

export class CreatePredictionDto {
  @IsString()
  matchId!: string;

  @IsString()
  leagueCode!: string;

  @IsString()
  homeTeam!: string;

  @IsString()
  awayTeam!: string;

  @ValidateNested()
  @Type(() => ProbabilitiesDto)
  probabilities!: ProbabilitiesDto;

  @IsNumber()
  @Min(1)
  @Max(100)
  confidence!: number;

  @IsEnum(['free', 'regular', 'vip'])
  accessType!: 'free' | 'regular' | 'vip';

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsString()
  matchDate!: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MarketDto)
  markets?: MarketDto[];
}
