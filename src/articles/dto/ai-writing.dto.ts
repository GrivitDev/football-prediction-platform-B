// src/articles/dto/ai-writing.dto.ts

import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export type AiWritingTarget =
  | 'whole-article'
  | 'title'
  | 'subtitle'
  | 'description';

export type AiWritingAction =
  | 'generate'
  | 'improve'
  | 'rewrite'
  | 'humanize'
  | 'shorten'
  | 'expand'
  | 'seo'
  | 'headings';

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
  target!: AiWritingTarget;

  @IsIn([
    'generate',
    'improve',
    'rewrite',
    'humanize',
    'shorten',
    'expand',
    'seo',
    'headings',
  ])
  action!: AiWritingAction;
}
