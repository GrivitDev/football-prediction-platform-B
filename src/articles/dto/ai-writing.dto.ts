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
  @MaxLength(500000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  focusKeyword?: string;

  @IsIn(['whole-article', 'title', 'subtitle', 'description'])
  target!: 'whole-article' | 'title' | 'subtitle' | 'description';

  @IsIn(['improve', 'rewrite', 'shorten', 'expand', 'seo', 'headings'])
  action!: string;
}
