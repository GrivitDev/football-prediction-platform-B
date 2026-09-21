// src/articles/services/article-writing.service.ts

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import {
  sanitizeArticleHtml,
  sanitizeArticlePlainText,
} from '../utils/article-html.util';

interface OllamaResponse {
  response?: string;
}

type AiTarget = 'whole-article' | 'title' | 'subtitle' | 'description';

@Injectable()
export class ArticleWritingService {
  private readonly ollamaUrl: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.ollamaUrl = (
      this.configService.get<string>('OLLAMA_URL') || 'http://127.0.0.1:11434'
    ).replace(/\/+$/, '');

    this.model =
      this.configService.get<string>('OLLAMA_MODEL') || 'llama3.2:3b';
  }

  async process(
    content: string,
    action: string,
    target: AiTarget = 'whole-article',
    title?: string,
    subtitle?: string,
    description?: string,
    focusKeyword?: string,
  ): Promise<{
    result: string;
    model: string;
  }> {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new ServiceUnavailableException('There is no content to process.');
    }

    if (
      (action === 'seo' || action === 'headings') &&
      target !== 'whole-article'
    ) {
      throw new ServiceUnavailableException(
        'SEO analysis and heading suggestions require the whole article.',
      );
    }

    const prompt = this.buildPrompt(
      normalizedContent,
      action,
      target,
      title,
      subtitle,
      description,
      focusKeyword,
    );

    try {
      const response = await axios.post<OllamaResponse>(
        `${this.ollamaUrl}/api/generate`,
        {
          model: this.model,
          prompt,
          stream: false,
        },
        {
          timeout: 120000,
          maxContentLength: 5 * 1024 * 1024,
          maxBodyLength: 5 * 1024 * 1024,
        },
      );

      const rawResult = response.data.response?.trim() || '';

      if (!rawResult) {
        throw new ServiceUnavailableException(
          'The AI service returned an empty response.',
        );
      }

      const result =
        target === 'whole-article' && !['seo', 'headings'].includes(action)
          ? sanitizeArticleHtml(this.cleanModelOutput(rawResult))
          : sanitizeArticlePlainText(this.cleanModelOutput(rawResult));

      if (!result) {
        throw new ServiceUnavailableException(
          'The AI service returned an unusable response.',
        );
      }

      return {
        result,
        model: this.model,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'The AI writing service is currently unavailable.',
      );
    }
  }

  private buildPrompt(
    content: string,
    action: string,
    target: AiTarget,
    title?: string,
    subtitle?: string,
    description?: string,
    focusKeyword?: string,
  ): string {
    const articleTitle = title?.trim() ? `Article title: ${title.trim()}` : '';

    const articleSubtitle = subtitle?.trim()
      ? `Article subtitle: ${subtitle.trim()}`
      : '';

    const articleDescription = description?.trim()
      ? `Article description: ${description.trim()}`
      : '';

    const keyword = focusKeyword?.trim()
      ? `Focus keyword: ${focusKeyword.trim()}`
      : '';

    if (action === 'seo') {
      return `
Analyze the following article for practical search-engine optimization improvements.

Return exactly these sections:

SEO TITLE:
META DESCRIPTION:
SUGGESTED SLUG:
CONTENT GAPS:
HEADING RECOMMENDATIONS:
INTERNAL LINK OPPORTUNITIES:
READABILITY RECOMMENDATIONS:

Do not claim that any recommendation guarantees search ranking.
Do not invent facts, sources, statistics, links, events, or quotations.
Base every recommendation on the supplied article.

${articleTitle}

${articleSubtitle}

${articleDescription}

${keyword}

Article:

${content}
      `.trim();
    }

    if (action === 'headings') {
      return `
Analyze the following article and suggest a clear heading structure.

Return a simple hierarchy using:

H1:
H2:
H3:

Do not rewrite the article.
Do not invent facts.
Use headings that accurately describe the existing content.

${articleTitle}

${articleSubtitle}

${articleDescription}

${keyword}

Article:

${content}
      `.trim();
    }

    const targetInstructions = this.getTargetInstructions(target);

    const actionInstructions = this.getActionInstructions(action);

    return `
${actionInstructions}

${targetInstructions}

Preserve the author's meaning and factual claims.
Do not invent facts, statistics, quotations, sources, events, names,
numbers, or dates.

${articleTitle}

${articleSubtitle}

${articleDescription}

${keyword}

Content to process:

${content}
    `.trim();
  }

  private getTargetInstructions(target: AiTarget): string {
    switch (target) {
      case 'title':
        return `
The target is the article title.

Return only the improved title as plain text.
Keep it concise and suitable as an article title.
Do not return quotation marks, labels, explanations, or Markdown.
        `.trim();

      case 'subtitle':
        return `
The target is the article subtitle.

Return only the improved subtitle as plain text.
Keep it concise and suitable for a subtitle under the article title.
Do not return quotation marks, labels, explanations, or Markdown.
        `.trim();

      case 'description':
        return `
The target is the article description.

Return only the improved description as plain text.
Keep it clear, natural, informative, and suitable as an article introduction.
Do not return quotation marks, labels, explanations, or Markdown.
        `.trim();

      case 'whole-article':
      default:
        return `
The target is the complete article body.

The input may contain HTML generated by a rich-text editor.
Preserve meaningful HTML structure such as paragraphs, headings,
lists, blockquotes, links, images, and inline formatting.

Return only the article HTML.
Do not wrap the response in Markdown code fences.
Do not add commentary before or after the article.
Do not introduce unsupported CSS or JavaScript.
        `.trim();
    }
  }

  private getActionInstructions(action: string): string {
    switch (action) {
      case 'rewrite':
        return `
Rewrite the target to make it clearer, more natural,
professional, and readable.

Preserve the original meaning and factual claims.
        `.trim();

      case 'shorten':
        return `
Shorten the target while preserving its important information,
meaning, and factual claims.

Remove repetition and unnecessary wording.
        `.trim();

      case 'expand':
        return `
Improve and expand the target where appropriate.

Add useful explanation only when it can be supported by the
information already supplied. Do not pad the content.
        `.trim();

      case 'improve':
      default:
        return `
Improve the target for grammar, clarity, readability, spelling,
punctuation, and natural expression.

Do not change factual claims unless correcting an obvious
language error.
        `.trim();
    }
  }

  private cleanModelOutput(value: string): string {
    return value
      .replace(/^```(?:html|HTML|text|markdown)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }
}
