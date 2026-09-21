// src/articles/services/article-grammar.service.ts

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
  private readonly languageToolUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.languageToolUrl = (
      this.configService.get<string>('LANGUAGETOOL_URL') ||
      'http://127.0.0.1:8081/v2'
    ).replace(/\/+$/, '');
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

    try {
      const response = await axios.post<LanguageToolResponse>(
        `${this.languageToolUrl}/check`,
        new URLSearchParams({
          text,
          language,
          enabledOnly: 'true',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
          maxContentLength: 2 * 1024 * 1024,
          maxBodyLength: 2 * 1024 * 1024,
        },
      );

      const matches = response.data.matches || [];

      return {
        matches,
        language: response.data.language?.code || language,
        totalIssues: matches.length,
      };
    } catch {
      throw new ServiceUnavailableException(
        'LanguageTool is currently unavailable.',
      );
    }
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
}
