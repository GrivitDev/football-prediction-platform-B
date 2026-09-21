// src/articles/dto/ai-writing.dto.ts

import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AiWritingDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  focusKeyword?: string;

  @IsIn(['improve', 'rewrite', 'shorten', 'expand', 'seo', 'headings'])
  action!: string;
}
