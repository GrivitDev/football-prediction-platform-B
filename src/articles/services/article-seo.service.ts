// src/articles/services/article-seo.service.ts

import { Injectable } from '@nestjs/common';

import { AnalyzeArticleDto } from '../dto/analyze-article.dto';

export interface SeoCheckResult {
  key: string;
  passed: boolean;
  label: string;
  message: string;
  recommendation?: string;
}

export interface ArticleSeoAnalysis {
  score: number;
  checks: SeoCheckResult[];
  metrics: {
    wordCount: number;
    headingCount: number;
    h1Count: number;
    paragraphCount: number;
    linkCount: number;
    internalLinkCount: number;
    externalLinkCount: number;
    imageCount: number;
    imagesWithoutAlt: number;
    focusKeywordCount: number;
  };
}

@Injectable()
export class ArticleSeoService {
  analyze(dto: AnalyzeArticleDto): ArticleSeoAnalysis {
    const plainText = this.stripHtml(dto.content);
    const normalizedText = plainText.toLowerCase();

    const wordCount = this.calculateWordCount(plainText);
    const headingCount = this.countMatches(dto.content, /<h[1-6]\b[^>]*>/gi);
    const h1Count = this.countMatches(dto.content, /<h1\b[^>]*>/gi);
    const paragraphCount = this.countMatches(dto.content, /<p\b[^>]*>/gi);

    const links = this.extractLinks(dto.content);
    const imageData = this.analyzeImages(dto.content);

    const focusKeyword = dto.focusKeyword?.trim().toLowerCase() || '';

    const focusKeywordCount = focusKeyword
      ? this.countOccurrences(normalizedText, focusKeyword)
      : 0;

    const checks: SeoCheckResult[] = [];

    checks.push(
      this.checkSeoTitle(dto.seoTitle),
      this.checkMetaDescription(dto.seoDescription),
      this.checkSlug(dto.slug),
      this.checkFocusKeyword(
        focusKeyword,
        dto.seoTitle,
        dto.title,
        normalizedText,
      ),
      this.checkWordCount(wordCount),
      this.checkHeadingStructure(headingCount, h1Count),
      this.checkInternalLinks(links.internal),
      this.checkImages(imageData.count, imageData.withoutAlt),
      this.checkCanonicalUrl(dto.canonicalUrl),
    );

    const score = this.calculateScore(checks);

    return {
      score,
      checks,
      metrics: {
        wordCount,
        headingCount,
        h1Count,
        paragraphCount,
        linkCount: links.total,
        internalLinkCount: links.internal,
        externalLinkCount: links.external,
        imageCount: imageData.count,
        imagesWithoutAlt: imageData.withoutAlt,
        focusKeywordCount,
      },
    };
  }

  private checkSeoTitle(seoTitle?: string): SeoCheckResult {
    const value = seoTitle?.trim() || '';

    if (!value) {
      return {
        key: 'seo-title',
        passed: false,
        label: 'SEO title',
        message: 'No SEO title has been provided.',
        recommendation: 'Add a clear SEO title relevant to the article topic.',
      };
    }

    if (value.length < 30) {
      return {
        key: 'seo-title',
        passed: false,
        label: 'SEO title',
        message: 'The SEO title is very short.',
        recommendation: 'Consider making the title more descriptive.',
      };
    }

    if (value.length > 60) {
      return {
        key: 'seo-title',
        passed: false,
        label: 'SEO title',
        message: 'The SEO title is long.',
        recommendation:
          'Consider shortening it while keeping the main topic clear.',
      };
    }

    return {
      key: 'seo-title',
      passed: true,
      label: 'SEO title',
      message: 'SEO title length is within the recommended editorial range.',
    };
  }

  private checkMetaDescription(description?: string): SeoCheckResult {
    const value = description?.trim() || '';

    if (!value) {
      return {
        key: 'meta-description',
        passed: false,
        label: 'Meta description',
        message: 'No meta description has been provided.',
        recommendation:
          'Add a concise description that explains what the article covers.',
      };
    }

    if (value.length < 120) {
      return {
        key: 'meta-description',
        passed: false,
        label: 'Meta description',
        message: 'The meta description is short.',
        recommendation:
          'Consider adding enough detail to clearly summarize the article.',
      };
    }

    if (value.length > 170) {
      return {
        key: 'meta-description',
        passed: false,
        label: 'Meta description',
        message: 'The meta description is long.',
        recommendation:
          'Consider shortening the description while preserving its meaning.',
      };
    }

    return {
      key: 'meta-description',
      passed: true,
      label: 'Meta description',
      message:
        'Meta description length is within the recommended editorial range.',
    };
  }

  private checkSlug(slug?: string): SeoCheckResult {
    const value = slug?.trim() || '';

    if (!value) {
      return {
        key: 'slug',
        passed: false,
        label: 'URL slug',
        message: 'No article slug has been provided.',
        recommendation: 'Use a short, descriptive, readable URL slug.',
      };
    }

    const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);

    if (!validSlug) {
      return {
        key: 'slug',
        passed: false,
        label: 'URL slug',
        message: 'The slug contains unnecessary characters or formatting.',
        recommendation: 'Use lowercase words separated by hyphens.',
      };
    }

    return {
      key: 'slug',
      passed: true,
      label: 'URL slug',
      message: 'The URL slug is clean and readable.',
    };
  }

  private checkFocusKeyword(
    focusKeyword: string,
    seoTitle: string | undefined,
    articleTitle: string,
    normalizedText: string,
  ): SeoCheckResult {
    if (!focusKeyword) {
      return {
        key: 'focus-keyword',
        passed: false,
        label: 'Focus keyword',
        message: 'No focus keyword has been provided.',
        recommendation:
          'Define the main search phrase the article is intended to target.',
      };
    }

    const title =
      seoTitle?.trim().toLowerCase() || articleTitle.trim().toLowerCase();

    if (!title.includes(focusKeyword)) {
      return {
        key: 'focus-keyword',
        passed: false,
        label: 'Focus keyword',
        message: 'The focus keyword does not appear in the article title.',
        recommendation:
          'Consider naturally incorporating the primary phrase into the title.',
      };
    }

    if (!normalizedText.includes(focusKeyword)) {
      return {
        key: 'focus-keyword',
        passed: false,
        label: 'Focus keyword',
        message: 'The focus keyword does not appear in the article content.',
        recommendation:
          'Use the phrase naturally where it is genuinely relevant.',
      };
    }

    return {
      key: 'focus-keyword',
      passed: true,
      label: 'Focus keyword',
      message:
        'The focus keyword appears in both the title and article content.',
    };
  }

  private checkWordCount(wordCount: number): SeoCheckResult {
    if (wordCount < 300) {
      return {
        key: 'word-count',
        passed: false,
        label: 'Content length',
        message: `The article currently contains ${wordCount} words.`,
        recommendation:
          'Consider expanding the article where additional useful information is appropriate.',
      };
    }

    return {
      key: 'word-count',
      passed: true,
      label: 'Content length',
      message: `The article contains ${wordCount} words.`,
    };
  }

  private checkHeadingStructure(
    headingCount: number,
    h1Count: number,
  ): SeoCheckResult {
    if (h1Count !== 1) {
      return {
        key: 'heading-structure',
        passed: false,
        label: 'Heading structure',
        message: `The article contains ${h1Count} H1 headings.`,
        recommendation:
          'Use a single primary H1 and organize the remaining content with H2 and H3 headings.',
      };
    }

    if (headingCount < 2) {
      return {
        key: 'heading-structure',
        passed: false,
        label: 'Heading structure',
        message: 'The article has very few headings.',
        recommendation:
          'Add useful subheadings where they improve readability and organization.',
      };
    }

    return {
      key: 'heading-structure',
      passed: true,
      label: 'Heading structure',
      message: 'The article has a primary H1 and supporting headings.',
    };
  }

  private checkInternalLinks(internalLinkCount: number): SeoCheckResult {
    if (internalLinkCount === 0) {
      return {
        key: 'internal-links',
        passed: false,
        label: 'Internal links',
        message: 'No internal links were detected.',
        recommendation:
          'Add relevant internal links to useful pages or related articles.',
      };
    }

    return {
      key: 'internal-links',
      passed: true,
      label: 'Internal links',
      message: `${internalLinkCount} internal link(s) were detected.`,
    };
  }

  private checkImages(
    imageCount: number,
    imagesWithoutAlt: number,
  ): SeoCheckResult {
    if (imageCount === 0) {
      return {
        key: 'images',
        passed: false,
        label: 'Images',
        message: 'No images were detected in the article.',
        recommendation:
          'Consider adding relevant imagery when it improves the article.',
      };
    }

    if (imagesWithoutAlt > 0) {
      return {
        key: 'images',
        passed: false,
        label: 'Image accessibility',
        message: `${imagesWithoutAlt} image(s) are missing ALT text.`,
        recommendation: 'Add descriptive ALT text to relevant images.',
      };
    }

    return {
      key: 'images',
      passed: true,
      label: 'Image accessibility',
      message: 'All detected images contain ALT text.',
    };
  }

  private checkCanonicalUrl(canonicalUrl?: string): SeoCheckResult {
    if (!canonicalUrl?.trim()) {
      return {
        key: 'canonical-url',
        passed: false,
        label: 'Canonical URL',
        message: 'No canonical URL has been provided.',
        recommendation:
          'Provide a canonical URL when the article requires an explicit canonical reference.',
      };
    }

    return {
      key: 'canonical-url',
      passed: true,
      label: 'Canonical URL',
      message: 'A canonical URL has been provided.',
    };
  }

  private calculateScore(checks: SeoCheckResult[]): number {
    if (!checks.length) {
      return 0;
    }

    const passed = checks.filter((check) => check.passed).length;

    return Math.round((passed / checks.length) * 100);
  }

  private analyzeImages(content: string): {
    count: number;
    withoutAlt: number;
  } {
    const imagePattern = /<img\b[^>]*>/gi;
    const images = content.match(imagePattern) || [];

    let withoutAlt = 0;

    for (const image of images) {
      const altMatch = image.match(/\balt\s*=\s*["']([^"']*)["']/i);

      if (!altMatch?.[1]?.trim()) {
        withoutAlt += 1;
      }
    }

    return {
      count: images.length,
      withoutAlt,
    };
  }

  private extractLinks(content: string): {
    total: number;
    internal: number;
    external: number;
  } {
    const linkPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

    let total = 0;
    let internal = 0;
    let external = 0;

    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(content)) !== null) {
      const href = match[1].trim();

      if (!href) {
        continue;
      }

      total += 1;

      if (href.startsWith('/') || href.startsWith('#')) {
        internal += 1;
        continue;
      }

      if (/^https?:\/\//i.test(href)) {
        external += 1;
      }
    }

    return {
      total,
      internal,
      external,
    };
  }

  private stripHtml(content: string): string {
    return content
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateWordCount(content: string): number {
    if (!content) {
      return 0;
    }

    return content.split(/\s+/).filter(Boolean).length;
  }

  private countMatches(value: string, pattern: RegExp): number {
    return (value.match(pattern) || []).length;
  }

  private countOccurrences(value: string, search: string): number {
    if (!search) {
      return 0;
    }

    let count = 0;
    let position = 0;

    while (true) {
      const index = value.indexOf(search, position);

      if (index === -1) {
        break;
      }

      count += 1;
      position = index + search.length;
    }

    return count;
  }
}
