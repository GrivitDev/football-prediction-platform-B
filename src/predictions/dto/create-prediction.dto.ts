import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MarketDto {
  @IsString()
  @IsNotEmpty()
  market!: string;

  @IsString()
  @IsNotEmpty()
  selection!: string;
}

export class CreatePredictionDto {
  @IsString()
  @IsNotEmpty()
  matchId!: string;

  @IsEnum(['free', 'regular', 'vip', 'premium'])
  accessType!: 'free' | 'regular' | 'vip' | 'premium';

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ValidateNested({ each: true })
  @Type(() => MarketDto)
  markets!: MarketDto[];
}
