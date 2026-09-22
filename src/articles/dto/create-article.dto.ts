import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /**
   * Legacy field kept for compatibility with existing articles.
   * New articles should use `description`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(1000)
  featuredImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  featuredImageAlt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  featuredImagePublicId?: string;

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
  @MaxLength(200)
  focusKeyword?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  canonicalUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}
