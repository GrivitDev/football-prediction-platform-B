import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

import { AdPlacement } from '../enums/ad-placement.enum';

export class CreateAdDto {
  @IsString()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsUrl()
  imageUrl!: string;

  @IsOptional()
  @IsUrl()
  targetUrl?: string;

  @IsOptional()
  @IsMongoId()
  promo?: string;

  @IsEnum(AdPlacement)
  placement: AdPlacement = AdPlacement.HOME_TOP;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
