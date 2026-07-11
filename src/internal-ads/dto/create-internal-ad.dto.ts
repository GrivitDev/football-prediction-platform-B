import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsDateString,
} from 'class-validator';

import { Type } from 'class-transformer';

import { DisplayLevel } from '../enums/display-level.enum';

class AdActionDto {
  @IsString()
  label!: string;

  @IsString()
  url!: string;
}

export class CreateInternalAdDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  description?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructions?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdActionDto)
  actions?: AdActionDto[];

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsEnum(DisplayLevel)
  displayLevel?: DisplayLevel;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;
}
