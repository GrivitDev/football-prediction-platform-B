import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import { CreateAdActionDto } from './create-ad-action.dto';
import { CreateAdDisplayDto } from './create-ad-display.dto';
import { CreateAdImageDto } from './create-ad-image.dto';

export class CreateAdDto {
  @IsString()
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  subTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  instructions?: string[];

  @ValidateNested()
  @Type(() => CreateAdImageDto)
  image!: CreateAdImageDto;

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(() => CreateAdActionDto)
  actions: CreateAdActionDto[] = [];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => CreateAdDisplayDto)
  displays!: CreateAdDisplayDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority: number = 5;

  @IsOptional()
  @IsBoolean()
  isActive: boolean = true;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
