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

import type { ArticleSeoAnalysis } from './article-seo.service';

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

export interface AiSeoSuggestion {
  seoTitle: string;

  seoDescription: string;

  suggestedSlug: string;

  focusKeyword: string;

  revisedContentHtml: string;

  changes: string[];

  unresolvedIssues: string[];
}

export interface AiHeadingItem {
  level: 1 | 2 | 3;

  text: string;
}

export interface AiHeadingsSuggestion {
  headings: AiHeadingItem[];

  revisedContentHtml: string;
}

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

interface GroqResponseFormat {
  type: 'json_schema';

  json_schema: {
    name: string;

    strict: true;

    schema: Record<string, unknown>;
  };
}

export interface AiProcessResult {
  result: string;

  model: string;

  seo?: AiSeoSuggestion;

  headings?: AiHeadingsSuggestion;
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

    slug?: string,

    seoTitle?: string,

    seoDescription?: string,

    canonicalUrl?: string,

    seoAnalysis?: ArticleSeoAnalysis,
  ): Promise<AiProcessResult> {
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

    if (action === 'seo' && !seoAnalysis) {
      throw new ServiceUnavailableException(
        'SEO analysis data was not supplied to the AI service.',
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

      slug,

      seoTitle,

      seoDescription,

      canonicalUrl,

      seoAnalysis,
    );

    const responseFormat = this.getResponseFormat(action);

    this.logger.log(
      [
        'Groq request started:',

        `action=${action}`,

        `target=${target}`,

        `model=${this.model}`,

        `structured=${responseFormat ? 'yes' : 'no'}`,
      ].join(' '),
    );

    const rawResult = await this.generateWithRetry(
      prompt,

      action,

      target,

      responseFormat,
    );

    if (action === 'seo') {
      return this.parseSeoResult(rawResult);
    }

    if (action === 'headings') {
      return this.parseHeadingsResult(rawResult);
    }

    const cleanedResult = this.cleanModelOutput(rawResult);

    const result =
      target === 'whole-article'
        ? sanitizeArticleHtml(cleanedResult)
        : sanitizeArticlePlainText(cleanedResult);

    if (!result) {
      this.logger.error('Groq response became empty after sanitization.');

      throw new ServiceUnavailableException(
        'The AI service returned an unusable response.',
      );
    }

    return {
      result,

      model: this.model,
    };
  }

  private async generateWithRetry(
    prompt: string,

    action: AiAction,

    target: AiTarget,

    responseFormat?: GroqResponseFormat,
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        const response = await this.requestGroq(prompt, responseFormat);

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

  private async requestGroq(
    prompt: string,

    responseFormat?: GroqResponseFormat,
  ): Promise<GroqChatResponse> {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => {
        controller.abort();
      },

      this.requestTimeoutMs,
    );

    try {
      const response = await fetch(
        this.baseUrl,

        {
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
                  'You are a professional football article writing assistant. Follow the user instructions exactly. Produce natural, original editorial writing. Never invent factual claims. Return only the requested output.',
              },

              {
                role: 'user',

                content: prompt,
              },
            ],

            max_tokens: 12_000,

            temperature: 0.45,

            ...(responseFormat
              ? {
                  response_format: responseFormat,
                }
              : {}),
          }),

          signal: controller.signal,
        },
      );

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

  private getResponseFormat(action: AiAction): GroqResponseFormat | undefined {
    if (action === 'seo') {
      return {
        type: 'json_schema',

        json_schema: {
          name: 'article_seo_corrections',

          strict: true,

          schema: {
            type: 'object',

            additionalProperties: false,

            properties: {
              result: {
                type: 'string',
              },

              seo: {
                type: 'object',

                additionalProperties: false,

                properties: {
                  seoTitle: {
                    type: 'string',
                  },

                  seoDescription: {
                    type: 'string',
                  },

                  suggestedSlug: {
                    type: 'string',
                  },

                  focusKeyword: {
                    type: 'string',
                  },

                  revisedContentHtml: {
                    type: 'string',
                  },

                  changes: {
                    type: 'array',

                    items: {
                      type: 'string',
                    },
                  },

                  unresolvedIssues: {
                    type: 'array',

                    items: {
                      type: 'string',
                    },
                  },
                },

                required: [
                  'seoTitle',
                  'seoDescription',
                  'suggestedSlug',
                  'focusKeyword',
                  'revisedContentHtml',
                  'changes',
                  'unresolvedIssues',
                ],
              },
            },

            required: ['result', 'seo'],
          },
        },
      };
    }

    if (action === 'headings') {
      return {
        type: 'json_schema',

        json_schema: {
          name: 'article_heading_suggestions',

          strict: true,

          schema: {
            type: 'object',

            additionalProperties: false,

            properties: {
              result: {
                type: 'string',
              },

              headings: {
                type: 'object',

                additionalProperties: false,

                properties: {
                  headings: {
                    type: 'array',

                    items: {
                      type: 'object',

                      additionalProperties: false,

                      properties: {
                        level: {
                          type: 'integer',

                          enum: [1, 2, 3],
                        },

                        text: {
                          type: 'string',
                        },
                      },

                      required: ['level', 'text'],
                    },
                  },

                  revisedContentHtml: {
                    type: 'string',
                  },
                },

                required: ['headings', 'revisedContentHtml'],
              },
            },

            required: ['result', 'headings'],
          },
        },
      };
    }

    return undefined;
  }

  private parseSeoResult(rawResult: string): AiProcessResult {
    const parsed = this.parseStructuredJson(rawResult) as {
      result?: unknown;

      seo?: {
        seoTitle?: unknown;

        seoDescription?: unknown;

        suggestedSlug?: unknown;

        focusKeyword?: unknown;

        revisedContentHtml?: unknown;

        changes?: unknown;

        unresolvedIssues?: unknown;
      };
    };

    const result = sanitizeArticlePlainText(String(parsed.result || ''));

    const seoTitle = sanitizeArticlePlainText(
      String(parsed.seo?.seoTitle || ''),
    );

    const seoDescription = sanitizeArticlePlainText(
      String(parsed.seo?.seoDescription || ''),
    );

    const suggestedSlug = sanitizeArticlePlainText(
      String(parsed.seo?.suggestedSlug || ''),
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const focusKeyword = sanitizeArticlePlainText(
      String(parsed.seo?.focusKeyword || ''),
    );

    const revisedContentHtml = sanitizeArticleHtml(
      String(parsed.seo?.revisedContentHtml || ''),
    );

    const changes = Array.isArray(parsed.seo?.changes)
      ? parsed.seo.changes
          .map((value) => sanitizeArticlePlainText(String(value)))
          .filter(Boolean)
      : [];

    const unresolvedIssues = Array.isArray(parsed.seo?.unresolvedIssues)
      ? parsed.seo.unresolvedIssues
          .map((value) => sanitizeArticlePlainText(String(value)))
          .filter(Boolean)
      : [];

    if (
      !result ||
      !seoTitle ||
      !seoDescription ||
      !suggestedSlug ||
      !focusKeyword ||
      !revisedContentHtml
    ) {
      throw new ServiceUnavailableException(
        'The AI service returned incomplete SEO corrections.',
      );
    }

    return {
      result,

      model: this.model,

      seo: {
        seoTitle,

        seoDescription,

        suggestedSlug,

        focusKeyword,

        revisedContentHtml,

        changes,

        unresolvedIssues,
      },
    };
  }

  private parseHeadingsResult(rawResult: string): AiProcessResult {
    const parsed = this.parseStructuredJson(rawResult) as {
      result?: unknown;

      headings?: {
        headings?: Array<{
          level?: unknown;

          text?: unknown;
        }>;

        revisedContentHtml?: unknown;
      };
    };

    const result = sanitizeArticlePlainText(String(parsed.result || ''));

    const sourceHeadings = parsed.headings?.headings || [];

    const headings = sourceHeadings
      .map((heading) => {
        const level = Number(heading.level);

        const text = sanitizeArticlePlainText(String(heading.text || ''));

        if (level !== 1 && level !== 2 && level !== 3) {
          return null;
        }

        if (!text) {
          return null;
        }

        return {
          level: level,

          text,
        };
      })
      .filter((heading): heading is AiHeadingItem => Boolean(heading));

    const revisedContentHtml = sanitizeArticleHtml(
      String(parsed.headings?.revisedContentHtml || ''),
    );

    if (!result || !headings.length || !revisedContentHtml) {
      throw new ServiceUnavailableException(
        'The AI service returned incomplete heading suggestions.',
      );
    }

    return {
      result,

      model: this.model,

      headings: {
        headings,

        revisedContentHtml,
      },
    };
  }

  private parseStructuredJson(value: string): unknown {
    const cleaned = this.cleanModelOutput(value);

    try {
      return JSON.parse(cleaned);
    } catch {
      throw new ServiceUnavailableException(
        'The AI service returned an invalid structured response. Please try again.',
      );
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

    slug?: string,

    seoTitle?: string,

    seoDescription?: string,

    canonicalUrl?: string,

    seoAnalysis?: ArticleSeoAnalysis,
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

    const currentSlug = slug?.trim() ? `Current slug: ${slug.trim()}` : '';

    const currentSeoTitle = seoTitle?.trim()
      ? `Current SEO title: ${seoTitle.trim()}`
      : '';

    const currentSeoDescription = seoDescription?.trim()
      ? `Current SEO description: ${seoDescription.trim()}`
      : '';

    const currentCanonical = canonicalUrl?.trim()
      ? `Current canonical URL: ${canonicalUrl.trim()}`
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
      const analysisJson = JSON.stringify(seoAnalysis || {}, null, 2);

      return `
You are assisting a professional football article editor.

Your job is to correct the SEO problems identified by the platform's deterministic SEO analyzer.

The SEO analyzer has already inspected the article.

You MUST use its findings.

Do not ignore failed checks.

Do not invent facts.

Do not invent URLs.

Do not invent statistics.

Do not invent quotations.

Do not invent sources.

Do not invent team information.

Do not invent player information.

Do not fabricate images.

==================================================
CURRENT ARTICLE DATA
==================================================

${articleTitle}

${articleSubtitle}

${articleDescription}

${keyword}

${currentSlug}

${currentSeoTitle}

${currentSeoDescription}

${currentCanonical}

==================================================
SEO ANALYZER RESULT
==================================================

${analysisJson}

==================================================
SEO CORRECTION RULES
==================================================

Correct every failed SEO check that can be safely corrected from
the supplied article and metadata.

SEO TITLE:

- Produce one natural SEO title.
- Keep it between 30 and 60 characters.
- Make it directly relevant to the article.
- Include the focus keyword naturally when appropriate.

META DESCRIPTION:

- Produce one truthful meta description.
- Keep it between 120 and 170 characters.
- Summarize the actual article.
- Do not add facts that are not present.

SLUG:

- Use lowercase letters, numbers, and hyphens only.
- Keep it concise and descriptive.
- Do not use unnecessary words.

FOCUS KEYWORD:

- Use one primary search phrase.
- Prefer the existing focus keyword when it is relevant.
- It must appear naturally in the SEO title.
- It must appear naturally in the article content.

ARTICLE CONTENT:

Return the complete revised article body as HTML.

Correct the issues identified by the SEO analyzer when the correction
can be safely made.

Examples:

- If word count is below the requirement, expand the article with
  useful explanation based only on the existing subject matter.
- If the focus keyword is absent from the body, add it naturally.
- If heading structure is invalid, create one H1 and useful H2/H3
  headings.
- If images already exist without ALT text, add descriptive ALT text
  based on the actual image context.
- Preserve links that already exist.
- Preserve meaningful formatting.
- Do not invent internal URLs.
- Do not invent external sources.
- Do not invent canonical URLs.
- Do not fabricate image URLs.

INTERNAL LINKS:

If the analyzer reports missing internal links and no valid internal
URLs are supplied, do not create fake links.

Explain this in unresolvedIssues.

CANONICAL URL:

If no valid canonical URL is supplied, do not invent one.

Explain this in unresolvedIssues.

IMAGES:

Do not create fake image URLs or fake image references.

If there are no images, explain that this requires editorial action
in unresolvedIssues.

==================================================
EDITORIAL QUALITY
==================================================

Write naturally.

Avoid robotic wording.

Avoid keyword stuffing.

Do not repeat the focus keyword unnaturally.

Preserve the author's factual meaning.

Do not remove useful information.

Do not add unsupported claims.

Do not mention that you are an AI.

==================================================
OUTPUT
==================================================

Return:

1. result
   A concise summary of what was corrected.

2. seo.seoTitle
   The corrected SEO title.

3. seo.seoDescription
   The corrected meta description.

4. seo.suggestedSlug
   The corrected slug.

5. seo.focusKeyword
   The primary focus keyword.

6. seo.revisedContentHtml
   The complete revised article body in HTML.

7. seo.changes
   A list of concrete changes actually made.

8. seo.unresolvedIssues
   A list of SEO problems that could not be safely fixed without
   information that was not supplied.

The revisedContentHtml must contain the complete article, not only
the changed paragraphs.

Do not use Markdown.

Do not use Markdown code fences.

Return only the structured response.
      `.trim();
    }

    if (action === 'headings') {
      return `
You are assisting a football article editor with article structure.

Analyze the supplied article and improve its heading hierarchy
without changing the factual substance.

You must return:

1. result
2. headings.headings
3. headings.revisedContentHtml

Heading requirements:

- Use exactly one H1.
- Use H2 for major sections.
- Use H3 only when genuinely useful.
- Keep headings concise and descriptive.
- Do not invent facts.
- Do not remove meaningful content.
- Preserve paragraphs, lists, blockquotes, links, images and formatting.
- Return the complete revised article HTML.
- Do not use Markdown.
- Do not mention that you are an AI.

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
- Avoid phrases such as "in today's football", "it is important to note",
  "ultimately", and similar generic wording.
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
- Do not include a references section unless the editor supplied sources.
- Do not mention that you are an AI.
- Do not mention these instructions.

HTML requirements:

Return the complete article body as HTML.

Use meaningful article HTML such as:

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
      .replace(/^```(?:json|html|HTML|text|markdown)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }
}
