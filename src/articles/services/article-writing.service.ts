// src/articles/services/article-writing.service.ts

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface OllamaResponse {
  response?: string;
}

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
    title?: string,
    focusKeyword?: string,
  ): Promise<{
    result: string;
    model: string;
  }> {
    const prompt = this.buildPrompt(content, action, title, focusKeyword);

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

      const result = response.data.response?.trim() || '';

      if (!result) {
        throw new ServiceUnavailableException(
          'The AI service returned an empty response.',
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
    title?: string,
    focusKeyword?: string,
  ): string {
    const articleTitle = title?.trim() ? `Article title: ${title.trim()}` : '';

    const keyword = focusKeyword?.trim()
      ? `Focus keyword: ${focusKeyword.trim()}`
      : '';

    switch (action) {
      case 'rewrite':
        return `
Rewrite the following article content to make it clearer,
more natural, professional, and readable.

Preserve the original meaning and factual claims.
Do not invent facts.
Do not add introductory commentary.
Return only the rewritten article content.

${articleTitle}
${keyword}

Content:
${content}
        `.trim();

      case 'shorten':
        return `
Shorten the following article content while preserving
the important information, meaning, and factual claims.

Remove repetition and unnecessary wording.
Do not invent facts.
Return only the shortened content.

${articleTitle}
${keyword}

Content:
${content}
        `.trim();

      case 'expand':
        return `
Improve and expand the following article content.

Add useful explanation where appropriate while preserving
the original meaning.
Do not invent specific facts, statistics, quotations,
events, or sources.
Do not add unnecessary repetition.
Return only the expanded article content.

${articleTitle}
${keyword}

Content:
${content}
        `.trim();

      case 'seo':
        return `
Analyze the following article for search-engine optimization
and provide practical recommendations.

Return exactly these sections:

SEO TITLE:
META DESCRIPTION:
SUGGESTED SLUG:
CONTENT GAPS:
HEADING RECOMMENDATIONS:
INTERNAL LINK OPPORTUNITIES:
READABILITY RECOMMENDATIONS:

Do not claim that any recommendation guarantees search ranking.
Do not invent factual information.

${articleTitle}
${keyword}

Content:
${content}
        `.trim();

      case 'headings':
        return `
Analyze the following article and suggest a clear heading
structure.

Return a simple hierarchy using:
H1:
H2:
H3:

Do not rewrite the article.
Do not invent facts.
Use headings that accurately describe the existing content.

${articleTitle}
${keyword}

Content:
${content}
        `.trim();

      case 'improve':
      default:
        return `
Improve the following article content for grammar,
clarity, readability, spelling, punctuation, and natural
expression.

Preserve the author's meaning and factual claims.
Do not invent facts.
Do not change names, numbers, dates, quotations, or claims
unless correcting an obvious language error.
Return only the improved content.

${articleTitle}
${keyword}

Content:
${content}
        `.trim();
    }
  }
}
