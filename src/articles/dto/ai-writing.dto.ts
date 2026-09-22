import {
  IsArray,
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
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  focusKeyword?: string;

  /*
   * Current SEO state supplied to the AI.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  canonicalUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

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
