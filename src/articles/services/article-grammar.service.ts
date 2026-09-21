// src/articles/services/article-grammar.service.ts

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import axios from 'axios';

export interface GrammarReplacement {
  value: string;
}

export interface GrammarMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: GrammarReplacement[];
  context: {
    text: string;
    offset: number;
    length: number;
  };
  sentence: string;
  rule: {
    id: string;
    description: string;
    category?: {
      id: string;
      name: string;
    };
  };
}

interface LanguageToolResponse {
  software?: {
    name?: string;
    version?: string;
  };

  language?: {
    name?: string;
    code?: string;
    detectedLanguage?: {
      name?: string;
      code?: string;
    };
  };

  matches?: GrammarMatch[];
}

@Injectable()
export class ArticleGrammarService {
  private readonly logger = new Logger(ArticleGrammarService.name);

  private readonly languageToolUrl: string;

  private readonly requestTimeoutMs = 20_000;

  /*
   * LanguageTool's public API currently allows up to 20 KB
   * per request. Stay below that limit to leave some margin.
   */
  private readonly maxRequestBytes = 18 * 1024;

  constructor(private readonly configService: ConfigService) {
    this.languageToolUrl = (
      this.configService.get<string>('LANGUAGETOOL_URL')?.trim() ||
      'https://api.languagetool.org/v2'
    ).replace(/\/+$/, '');

    this.logger.log(`LanguageTool URL configured: ${this.languageToolUrl}`);
  }

  async check(
    content: string,
    language: string,
  ): Promise<{
    matches: GrammarMatch[];
    language: string;
    totalIssues: number;
  }> {
    const text = this.stripHtml(content);

    if (!text) {
      return {
        matches: [],
        language,
        totalIssues: 0,
      };
    }

    const textBytes = Buffer.byteLength(text, 'utf8');

    this.logger.log(
      `LanguageTool check started: language=${language}, characters=${text.length}, bytes=${textBytes}`,
    );

    /*
     * The free public LanguageTool endpoint has a 20 KB
     * request limit. Do not send a request that exceeds it.
     *
     * For now, fail clearly rather than silently producing
     * an unavailable response caused by an oversized request.
     */
    if (textBytes > this.maxRequestBytes) {
      this.logger.warn(
        `LanguageTool request too large: bytes=${textBytes}, limit=${this.maxRequestBytes}`,
      );

      throw new ServiceUnavailableException(
        'The article is too long for the current LanguageTool grammar checker. Please check a shorter section of the article.',
      );
    }

    try {
      const response = await axios.post<LanguageToolResponse>(
        `${this.languageToolUrl}/check`,
        new URLSearchParams({
          text,
          language: language || 'auto',
          enabledOnly: 'true',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },

          timeout: this.requestTimeoutMs,

          maxContentLength: 2 * 1024 * 1024,
          maxBodyLength: 2 * 1024 * 1024,

          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        const responseData =
          typeof response.data === 'string'
            ? response.data
            : JSON.stringify(response.data);

        this.logger.error(
          [
            'LanguageTool request failed.',
            `status=${response.status}`,
            `language=${language}`,
            `characters=${text.length}`,
            `bytes=${textBytes}`,
            `url=${this.languageToolUrl}/check`,
            `response=${responseData}`,
          ].join(' | '),
        );

        throw new ServiceUnavailableException(
          `LanguageTool returned HTTP ${response.status}.`,
        );
      }

      const matches = response.data.matches || [];

      const detectedLanguage =
        response.data.language?.code ||
        response.data.language?.detectedLanguage?.code ||
        language;

      this.logger.log(
        `LanguageTool check completed: language=${detectedLanguage}, issues=${matches.length}`,
      );

      return {
        matches,
        language: detectedLanguage,
        totalIssues: matches.length,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const responseData = error.response?.data;

        this.logger.error(
          [
            'LanguageTool Axios request failed.',
            `status=${status ?? 'none'}`,
            `code=${error.code ?? 'none'}`,
            `message=${error.message}`,
            `language=${language}`,
            `characters=${text.length}`,
            `bytes=${textBytes}`,
            `url=${this.languageToolUrl}/check`,
            `response=${responseData ? JSON.stringify(responseData) : 'none'}`,
          ].join(' | '),
        );
      } else {
        this.logger.error(
          [
            'LanguageTool request failed unexpectedly.',
            `language=${language}`,
            `characters=${text.length}`,
            `bytes=${textBytes}`,
            `message=${error instanceof Error ? error.message : String(error)}`,
          ].join(' | '),
        );
      }

      throw new ServiceUnavailableException(
        'LanguageTool is currently unavailable.',
      );
    }
  }

  private stripHtml(content: string): string {
    return content
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
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
}
