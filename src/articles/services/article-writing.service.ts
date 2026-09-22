// src/articles/services/article-writing.service.ts

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  sanitizeArticleHtml,
  sanitizeArticlePlainText,
} from '../utils/article-html.util';

type AiTarget = 'whole-article' | 'title' | 'subtitle' | 'description';

type AiAction =
  | 'generate'
  | 'improve'
  | 'rewrite'
  | 'humanize'
  | 'shorten'
  | 'expand'
  | 'seo'
  | 'headings';

interface GroqChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | null;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

@Injectable()
export class ArticleWritingService {
  private readonly logger = new Logger(ArticleWritingService.name);

  private readonly apiKey: string;
  private readonly model: string;

  private readonly baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  private readonly maxRetries = 3;
  private readonly requestTimeoutMs = 90_000;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GROQ_API_KEY')?.trim() || '';

    this.model =
      this.configService.get<string>('GROQ_MODEL')?.trim() ||
      'openai/gpt-oss-120b';

    this.logger.log(`Groq model configured: ${this.model}`);
    this.logger.log(`Groq API key configured: ${this.apiKey ? 'yes' : 'no'}`);
  }

  async process(
    content: string,
    action: AiAction,
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
      throw new ServiceUnavailableException(
        action === 'generate'
          ? 'Please provide a topic or writing instruction.'
          : 'There is no content to process.',
      );
    }

    if (!this.apiKey) {
      this.logger.error('Groq API key is not configured.');

      throw new ServiceUnavailableException(
        'The AI service is not configured yet.',
      );
    }

    if (
      (action === 'seo' || action === 'headings') &&
      target !== 'whole-article'
    ) {
      throw new ServiceUnavailableException(
        'SEO analysis and heading suggestions require the whole article.',
      );
    }

    if (action === 'generate' && target !== 'whole-article') {
      throw new ServiceUnavailableException(
        'Article generation currently requires the whole-article target.',
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

    this.logger.log(
      `Groq request started: action=${action}, target=${target}, model=${this.model}`,
    );

    const rawResult = await this.generateWithRetry(prompt, action, target);

    const cleanedResult = this.cleanModelOutput(rawResult);

    const result =
      target === 'whole-article' && action !== 'seo' && action !== 'headings'
        ? sanitizeArticleHtml(cleanedResult)
        : sanitizeArticlePlainText(cleanedResult);

    if (!result) {
      this.logger.error('Groq response became empty after sanitization.');

      throw new ServiceUnavailableException(
        'The AI service returned an unusable response.',
      );
    }

    this.logger.log(
      `Groq request completed: action=${action}, target=${target}`,
    );

    return {
      result,
      model: this.model,
    };
  }

  private async generateWithRetry(
    prompt: string,
    action: AiAction,
    target: AiTarget,
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        const response = await this.requestGroq(prompt);

        const result = response.choices?.[0]?.message?.content?.trim() || '';

        if (!result) {
          throw new ServiceUnavailableException(
            'The AI service returned an empty response.',
          );
        }

        return result;
      } catch (error) {
        lastError = error;

        const status = this.getErrorStatus(error);
        const message = this.getErrorMessage(error);

        this.logger.error(
          [
            `Groq attempt ${attempt} failed.`,
            `status=${status ?? 'unknown'}`,
            `action=${action}`,
            `target=${target}`,
            `model=${this.model}`,
            `message=${message}`,
          ].join(' | '),
        );

        if (status === 401) {
          throw new ServiceUnavailableException(
            'The Groq API key is invalid or unavailable. Check GROQ_API_KEY in the server environment.',
          );
        }

        if (status === 403) {
          throw new ServiceUnavailableException(
            'Groq access is denied for this API key or project. Check the Groq Console and API key permissions.',
          );
        }

        if (status === 404) {
          throw new ServiceUnavailableException(
            `The configured Groq model "${this.model}" was not found or is unavailable.`,
          );
        }

        if (
          status !== 429 &&
          status !== undefined &&
          status >= 400 &&
          status < 500
        ) {
          throw new ServiceUnavailableException(
            `Groq rejected the request: ${message}`,
          );
        }

        if (!this.isRetryableStatus(status) || attempt > this.maxRetries) {
          break;
        }

        const delay = this.getRetryDelay(attempt);

        this.logger.warn(`Retrying Groq request in ${delay}ms.`);

        await this.sleep(delay);
      }
    }

    if (lastError instanceof ServiceUnavailableException) {
      throw lastError;
    }

    throw new ServiceUnavailableException(
      'The Groq AI service is temporarily unavailable. Please try again.',
    );
  }

  private async requestGroq(prompt: string): Promise<GroqChatResponse> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },

        body: JSON.stringify({
          model: this.model,

          messages: [
            {
              role: 'system',
              content:
                'You are a professional football article writing assistant. Follow the user instructions exactly. Produce natural, original editorial writing. Return only the requested output.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],

          max_tokens: 12_000,

          temperature: 0.45,
        }),

        signal: controller.signal,
      });

      const bodyText = await response.text();

      let body: GroqChatResponse = {};

      try {
        body = bodyText ? (JSON.parse(bodyText) as GroqChatResponse) : {};
      } catch {
        body = {};
      }

      if (!response.ok) {
        const error = new Error(
          body.error?.message ||
            bodyText ||
            `Groq request failed with HTTP ${response.status}.`,
        );

        Object.assign(error, {
          status: response.status,
          response: {
            status: response.status,
          },
        });

        throw error;
      }

      return body;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(
          `Groq request timed out after ${this.requestTimeoutMs}ms.`,
        );

        Object.assign(timeoutError, {
          status: 503,
        });

        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryableStatus(status?: number): boolean {
    return (
      status === 408 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  private getRetryDelay(attempt: number): number {
    const base = 1000 * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 500);

    return base + jitter;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    if (
      'status' in error &&
      typeof (
        error as {
          status?: unknown;
        }
      ).status === 'number'
    ) {
      return (
        error as {
          status: number;
        }
      ).status;
    }

    if (
      'response' in error &&
      typeof (
        error as {
          response?: unknown;
        }
      ).response === 'object' &&
      (
        error as {
          response?: {
            status?: unknown;
          };
        }
      ).response?.status &&
      typeof (
        error as {
          response: {
            status: unknown;
          };
        }
      ).response.status === 'number'
    ) {
      return (
        error as {
          response: {
            status: number;
          };
        }
      ).response.status;
    }

    return undefined;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message);
    }

    return String(error);
  }

  private buildPrompt(
    content: string,
    action: AiAction,
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

    if (action === 'generate') {
      return this.buildGenerationPrompt(
        content,
        target,
        title,
        subtitle,
        description,
        focusKeyword,
      );
    }

    if (action === 'seo') {
      return `
You are assisting an article writer with SEO.

Analyze the supplied article and provide practical recommendations.

Return exactly these sections:

SEO TITLE:
META DESCRIPTION:
SUGGESTED SLUG:
CONTENT GAPS:
HEADING RECOMMENDATIONS:
INTERNAL LINK OPPORTUNITIES:
READABILITY RECOMMENDATIONS:

Do not claim that any recommendation guarantees search ranking.
Do not invent facts, statistics, sources, links, events, or quotations.
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
Analyze the supplied article and suggest a clear heading structure.

Return exactly this simple hierarchy:

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

    return `
You are an article writing assistant.

${this.getActionInstructions(action)}

${this.getTargetInstructions(target)}

Preserve the author's meaning and factual claims.

Do not invent facts, statistics, quotations, sources, events,
names, numbers, or dates.

${articleTitle}

${articleSubtitle}

${articleDescription}

${keyword}

Content to process:

${content}
    `.trim();
  }

  private buildGenerationPrompt(
    topic: string,
    target: AiTarget,
    title?: string,
    subtitle?: string,
    description?: string,
    focusKeyword?: string,
  ): string {
    const articleTitle = title?.trim()
      ? `Suggested article title: ${title.trim()}`
      : '';

    const articleSubtitle = subtitle?.trim()
      ? `Suggested article subtitle: ${subtitle.trim()}`
      : '';

    const articleDescription = description?.trim()
      ? `Article direction/description: ${description.trim()}`
      : '';

    const keyword = focusKeyword?.trim()
      ? `Focus keyword: ${focusKeyword.trim()}`
      : '';

    if (target !== 'whole-article') {
      throw new ServiceUnavailableException(
        'Generation must target the whole article.',
      );
    }

    return `
You are an experienced football journalist and editorial writer.

Write a complete original football article based on the topic or
instruction supplied by the editor.

TOPIC / EDITOR INSTRUCTION:
${topic}

${articleTitle}
${articleSubtitle}
${articleDescription}
${keyword}

Writing requirements:

- Write like an experienced human football journalist.
- Make the article informative, engaging, and natural.
- Explain the subject rather than simply repeating the topic.
- Use football terminology naturally.
- Develop a clear argument or line of explanation.
- Vary sentence length and paragraph structure.
- Avoid repetitive sentence patterns.
- Avoid generic AI-style introductions and conclusions.
- Avoid filler and unnecessary repetition.
- Do not overuse phrases such as "in today's football", "it is
  important to note", "ultimately", or similar generic wording.
- Use clear paragraphs and appropriate H2 headings where useful.
- Keep the article focused on the supplied topic.
- Do not fabricate statistics, match results, player quotes,
  manager quotes, sources, injuries, transfers, events, dates,
  or claims about a specific team or person.
- If the topic is general football analysis, keep the discussion
  general rather than pretending that specific facts are known.
- Do not cite fictional sources.
- Do not claim that an invented observation came from a journalist,
  coach, player, analyst, or source.
- Do not include a references section unless the editor explicitly
  supplied sources.
- Do not mention that you are an AI.
- Do not mention these instructions.

HTML requirements:

Return the complete article body as HTML.

Use only meaningful article HTML such as:

<p>
<h2>
<h3>
<ul>
<ol>
<li>
<blockquote>
<strong>
<em>

Do not use Markdown.

Do not return Markdown code fences.

Do not add commentary before or after the article.

Only return the article HTML.
    `.trim();
  }

  private getTargetInstructions(target: AiTarget): string {
    switch (target) {
      case 'title':
        return `
The target is the article title.

Return only the improved title as plain text.

Do not return quotation marks.
Do not return labels.
Do not return explanations.
Do not return Markdown.
        `.trim();

      case 'subtitle':
        return `
The target is the article subtitle.

Return only the improved subtitle as plain text.

Keep it concise and suitable directly beneath the title.

Do not return quotation marks.
Do not return labels.
Do not return explanations.
Do not return Markdown.
        `.trim();

      case 'description':
        return `
The target is the article description.

Return only the improved description as plain text.

Keep it clear, informative, natural, and concise.

Do not return quotation marks.
Do not return labels.
Do not return explanations.
Do not return Markdown.
        `.trim();

      case 'whole-article':
      default:
        return `
The target is the complete article body.

The supplied content may contain HTML produced by a rich-text editor.

Return the complete improved article as HTML.

Preserve the existing meaningful structure, including:

- paragraphs
- headings
- lists
- blockquotes
- links
- images
- bold
- italic
- underline
- strikethrough
- text alignment
- font family
- font size

Do not convert the article into Markdown.

Do not return Markdown code fences.

Do not add commentary before or after the HTML.

Only return the article HTML.
        `.trim();
    }
  }

  private getActionInstructions(action: AiAction): string {
    switch (action) {
      case 'rewrite':
        return `
Rewrite the target to make it clearer, more natural,
professional, and readable.

Keep the original meaning and factual claims.
        `.trim();

      case 'humanize':
        return `
Humanize the target while preserving its meaning and factual claims.

The goal is natural editorial writing that reads as though it was
written and edited by an experienced human football writer.

Improve:

- sentence rhythm
- sentence-length variation
- paragraph flow
- transitions
- word choice
- natural expression
- clarity
- editorial voice

Remove:

- repetitive sentence structures
- unnecessary filler
- robotic phrasing
- generic AI-style introductions
- generic AI-style conclusions
- excessive transition words
- repeated explanations of the same point
- unnatural formality
- unnecessary phrases such as "it is important to note",
  "in today's football", "ultimately", and similar filler

Do not deliberately introduce spelling mistakes, grammatical errors,
fake personal experiences, fake opinions, fake quotations, or false
facts simply to make the writing appear human.

Do not change factual claims.

Do not remove useful football terminology.

Preserve the author's intended meaning and editorial point of view.
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

Add useful explanation only where it can be supported by
the information already supplied.

Do not pad the content.
        `.trim();

      case 'improve':
      default:
        return `
Improve the target for grammar, clarity, spelling,
punctuation, readability, and natural expression.

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
