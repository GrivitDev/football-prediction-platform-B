import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AnalyzeArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  /*
   * These are request-size limits only.
   *
   * The SEO service itself determines whether the values
   * are too short or too long.
   */
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

  /*
   * An empty canonical URL means "not provided" and should
   * therefore be checked by the SEO service rather than
   * rejected by class-validator.
   */
  @ValidateIf(
    (object: AnalyzeArticleDto) =>
      typeof object.canonicalUrl === 'string' &&
      object.canonicalUrl.trim().length > 0,
  )
  @IsUrl()
  @MaxLength(2048)
  canonicalUrl?: string;
}
