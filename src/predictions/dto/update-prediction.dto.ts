import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MarketDto {
  @IsString()
  market!: string;

  @IsString()
  selection!: string;
}

export class UpdatePredictionDto {
  @IsOptional()
  @IsEnum(['free', 'regular', 'vip', 'premium'])
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
