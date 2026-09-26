import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PredictionMarkets } from '../constants/prediction-markets';

class MarketDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(Object.values(PredictionMarkets))
  market!: string;

  @IsString()
  @IsNotEmpty()
  selection!: string;
}

export class UpdatePredictionDto {
  @IsOptional()
  @IsIn(['free', 'regular', 'vip', 'premium'])
  accessType?: 'free' | 'regular' | 'vip' | 'premium';

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MarketDto)
  markets?: MarketDto[];
}
