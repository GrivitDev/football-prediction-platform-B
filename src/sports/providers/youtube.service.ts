import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import axios, { AxiosError, AxiosInstance } from 'axios';

import {
  YouTubeSearchOptions,
  YouTubeSearchResponse,
  YouTubeVideoResult,
} from './youtube.interfaces';

import { YOUTUBE_CONFIG } from '../config/youtube.config';

import { SportsProviderRateLimitService } from '../services/sports-provider-rate-limit.service';

@Injectable()
export class YoutubeService implements OnModuleInit {
  private readonly logger = new Logger(YoutubeService.name);

  private readonly baseUrl = YOUTUBE_CONFIG.apiBaseUrl;

  private http!: AxiosInstance;

  private apiKey!: string;

  constructor(
    private readonly configService: ConfigService,

    private readonly providerRateLimitService: SportsProviderRateLimitService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.configService
      .get<string>('YOUTUBE_DATA_API_KEY')
      ?.trim();

    if (!apiKey) {
      throw new Error('YOUTUBE_DATA_API_KEY is missing');
    }

    this.apiKey = apiKey;

    this.http = axios.create({
      baseURL: this.baseUrl,

      timeout: 15_000,

      headers: {
        Accept: 'application/json',
      },
    });
  }

  // ============================================================
  // SEARCH
  // ============================================================

  async searchVideos(
    options: YouTubeSearchOptions,
  ): Promise<YouTubeSearchResponse> {
    if (!options.query?.trim()) {
      throw new BadRequestException('YouTube search query is required');
    }

    const maxResults = options.maxResults ?? 5;

    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
      throw new BadRequestException(
        'maxResults must be an integer between 1 and 50',
      );
    }

    const params: Record<string, string | number | boolean> = {
      key: this.apiKey,

      part: 'snippet',

      q: options.query.trim(),

      type: YOUTUBE_CONFIG.searchType,

      maxResults,
    };

    if (options.order) {
      params.order = options.order;
    }

    if (options.channelId?.trim()) {
      params.channelId = options.channelId.trim();
    }

    if (options.publishedAfter) {
      params.publishedAfter = options.publishedAfter;
    }

    if (options.publishedBefore) {
      params.publishedBefore = options.publishedBefore;
    }

    if (YOUTUBE_CONFIG.requireEmbeddable) {
      params.videoEmbeddable = 'true';

      params.videoSyndicated = 'true';
    }

    return this.request<YouTubeSearchResponse>('/search', 'search', params);
  }

  // ============================================================
  // HIGHLIGHTS
  // ============================================================

  /**
   * Performs one YouTube search and selects the
   * best candidate.
   *
   * No videos.list request is made.
   */
  async findHighlight(
    homeTeam: string,
    awayTeam: string,
    publishedAfter?: Date,
  ): Promise<YouTubeVideoResult | null> {
    const normalizedHome = homeTeam?.trim();

    const normalizedAway = awayTeam?.trim();

    if (!normalizedHome || !normalizedAway) {
      throw new BadRequestException('Both homeTeam and awayTeam are required');
    }

    const query = `${normalizedHome} ${normalizedAway} highlights`;

    const searchResponse = await this.searchVideos({
      query,

      maxResults: 5,

      order: 'relevance',

      publishedAfter: publishedAfter?.toISOString(),

      publishedBefore: new Date().toISOString(),
    });

    const candidates: YouTubeVideoResult[] = (searchResponse.items ?? [])
      .filter(
        (item) => item.id?.kind === 'youtube#video' && Boolean(item.id.videoId),
      )
      .map((item) => {
        const videoId = item.id!.videoId!;

        return {
          videoId,

          channelId: item.snippet?.channelId,

          channelTitle: item.snippet?.channelTitle,

          title: item.snippet?.title ?? '',

          description: item.snippet?.description,

          publishedAt: item.snippet?.publishedAt,

          thumbnailUrl:
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url,

          embeddable: true,

          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        };
      });

    if (!candidates.length) {
      return null;
    }

    return this.selectBestHighlight(candidates, normalizedHome, normalizedAway);
  }

  // ============================================================
  // HIGHLIGHT SELECTION
  // ============================================================

  private selectBestHighlight(
    videos: YouTubeVideoResult[],
    homeTeam: string,
    awayTeam: string,
  ): YouTubeVideoResult | null {
    if (!videos.length) {
      return null;
    }

    const home = this.normalize(homeTeam);

    const away = this.normalize(awayTeam);

    const scored = videos.map((video) => {
      const title = this.normalize(video.title);

      let score = 0;

      if (title.includes(home)) {
        score += 3;
      }

      if (title.includes(away)) {
        score += 3;
      }

      if (title.includes('highlights')) {
        score += 2;
      } else if (title.includes('highlight')) {
        score += 2;
      }

      return {
        video,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.video ?? null;
  }

  // ============================================================
  // REQUEST
  // ============================================================

  private async request<T>(
    endpoint: string,
    rateLimitEndpoint: string,
    params: Record<string, string | number | boolean>,
  ): Promise<T> {
    return this.providerRateLimitService.execute(
      'youtube',
      rateLimitEndpoint,
      async () => {
        try {
          const response = await this.http.get<T>(endpoint, {
            params,
          });

          return response.data;
        } catch (error) {
          this.logApiError(error, endpoint);

          throw new InternalServerErrorException(
            `YouTube API request failed: ${endpoint}`,
          );
        }
      },
    );
  }

  // ============================================================
  // NORMALIZATION
  // ============================================================

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ============================================================
  // ERROR LOGGING
  // ============================================================

  private logApiError(error: unknown, endpoint: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      this.logger.error(`YouTube API request failed: ${endpoint}`, {
        status: axiosError.response?.status,

        data: axiosError.response?.data,
      });

      return;
    }

    this.logger.error(`YouTube API request failed: ${endpoint}`, error);
  }
}
