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

  /**
   * A YouTube highlight is only relevant from the match kickoff
   * until 24 hours after the match.
   */
  private readonly highlightWindowHours = 24;

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
   * Searches YouTube specifically for the finished fixture.
   *
   * Rules:
   *
   * 1. Search using both team names + "highlights".
   * 2. Search only from match kickoff.
   * 3. Search no later than 24 hours after kickoff.
   * 4. Use YouTube date ordering.
   * 5. Independently validate every returned video's publication date.
   * 6. Reject videos outside the match window.
   * 7. Reject candidates that do not reasonably identify both teams
   *    and a highlight.
   * 8. Select the newest valid candidate.
   *
   * No videos.list request is made.
   */
  async findHighlight(
    homeTeam: string,
    awayTeam: string,
    matchDate: Date,
  ): Promise<YouTubeVideoResult | null> {
    const normalizedHome = homeTeam?.trim();

    const normalizedAway = awayTeam?.trim();

    if (!normalizedHome || !normalizedAway) {
      throw new BadRequestException('Both homeTeam and awayTeam are required');
    }

    if (!(matchDate instanceof Date) || Number.isNaN(matchDate.getTime())) {
      throw new BadRequestException('A valid match date is required');
    }

    const now = new Date();

    /*
     * A FINISHED_MATCH worker should execute immediately after
     * the match finishes.
     *
     * If the match itself is somehow in the future, do not search.
     */
    if (matchDate.getTime() > now.getTime()) {
      this.logger.warn(
        `Skipping YouTube highlight search because match date is in the future: ${matchDate.toISOString()}`,
      );

      return null;
    }

    /*
     * Hard 24-hour window:
     *
     * matchDate
     *      ↓
     *      +24 hours
     *
     * No video older than this window can ever be accepted.
     */
    const windowEnd = new Date(
      matchDate.getTime() + this.highlightWindowHours * 60 * 60 * 1000,
    );

    /*
     * If the worker somehow reaches this fixture more than 24 hours
     * after kickoff, there is no reason to consume YouTube quota.
     */
    if (now.getTime() > windowEnd.getTime()) {
      this.logger.debug(
        `Skipping YouTube highlight search because the 24-hour window has expired for ${normalizedHome} vs ${normalizedAway}`,
      );

      return null;
    }

    /*
     * Search up to the current moment, but never beyond the
     * 24-hour match window.
     */
    const searchEnd = windowEnd.getTime() < now.getTime() ? windowEnd : now;

    const query = `${normalizedHome} ${normalizedAway} highlights`;

    const searchResponse = await this.searchVideos({
      query,

      maxResults: 5,

      /*
       * Freshest videos first.
       */
      order: 'date',

      /*
       * Lower boundary = match kickoff.
       */
      publishedAfter: matchDate.toISOString(),

      /*
       * Upper boundary = min(now, match + 24h).
       */
      publishedBefore: searchEnd.toISOString(),
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
      })
      .filter((video) =>
        this.isValidHighlightCandidate(
          video,
          normalizedHome,
          normalizedAway,
          matchDate,
          windowEnd,
        ),
      );

    if (!candidates.length) {
      return null;
    }

    return this.selectBestHighlight(candidates, normalizedHome, normalizedAway);
  }

  // ============================================================
  // HIGHLIGHT VALIDATION
  // ============================================================

  private isValidHighlightCandidate(
    video: YouTubeVideoResult,
    homeTeam: string,
    awayTeam: string,
    matchDate: Date,
    windowEnd: Date,
  ): boolean {
    if (!video.publishedAt) {
      return false;
    }

    const publishedAt = new Date(video.publishedAt);

    if (Number.isNaN(publishedAt.getTime())) {
      return false;
    }

    /*
     * Absolute publication window.
     *
     * The result must have been published:
     *
     *     >= match kickoff
     *     <= match kickoff + 24h
     */
    if (
      publishedAt.getTime() < matchDate.getTime() ||
      publishedAt.getTime() > windowEnd.getTime() ||
      publishedAt.getTime() > Date.now()
    ) {
      return false;
    }

    const searchText = this.normalize(
      `${video.title} ${video.description ?? ''}`,
    );

    if (!searchText) {
      return false;
    }

    /*
     * A legitimate highlight should identify the two teams.
     *
     * The check supports:
     * - full team names
     * - common shortened forms
     * - abbreviated wording such as Utd
     */
    if (!this.teamAppearsInText(searchText, homeTeam)) {
      return false;
    }

    if (!this.teamAppearsInText(searchText, awayTeam)) {
      return false;
    }

    /*
     * Do not accept generic match/news videos unless they are
     * actually described as a highlight.
     */
    if (!/\bhighlights?\b/.test(searchText)) {
      return false;
    }

    return true;
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

    const scored = videos.map((video) => {
      const title = this.normalize(video.title);

      const searchText = this.normalize(
        `${video.title} ${video.description ?? ''}`,
      );

      let score = 0;

      /*
       * Full team-name presence gets stronger weighting than
       * partial token matches.
       */
      if (title.includes(this.normalize(homeTeam))) {
        score += 5;
      } else if (this.teamAppearsInText(searchText, homeTeam)) {
        score += 3;
      }

      if (title.includes(this.normalize(awayTeam))) {
        score += 5;
      } else if (this.teamAppearsInText(searchText, awayTeam)) {
        score += 3;
      }

      if (title.includes('highlights')) {
        score += 3;
      } else if (title.includes('highlight')) {
        score += 2;
      }

      const publishedTime = video.publishedAt
        ? new Date(video.publishedAt).getTime()
        : 0;

      return {
        video,
        score,
        publishedTime,
      };
    });

    /*
     * Freshness is the most important tie-breaker.
     *
     * Because all candidates have already passed the strict
     * 24-hour window, the newest valid highlight wins.
     */
    scored.sort((a, b) => {
      if (b.publishedTime !== a.publishedTime) {
        return b.publishedTime - a.publishedTime;
      }

      return b.score - a.score;
    });

    return scored[0]?.video ?? null;
  }

  // ============================================================
  // TEAM MATCHING
  // ============================================================

  private teamAppearsInText(text: string, teamName: string): boolean {
    const normalizedTeam = this.normalize(teamName);

    if (!normalizedTeam) {
      return false;
    }

    /*
     * Strongest match: full normalized team name.
     */
    if (text.includes(normalizedTeam)) {
      return true;
    }

    /*
     * Support common abbreviations such as:
     *
     * Utd → United
     * Utd. → United
     */
    const normalizedText = text.replace(/\butd\b/g, 'united');

    if (normalizedText.includes(normalizedTeam)) {
      return true;
    }

    /*
     * For multi-word teams, accept meaningful matching tokens.
     *
     * This gives some tolerance to titles such as:
     *
     * "Man United vs ..."
     *
     * while still requiring a real team token.
     */
    const teamTokens = normalizedTeam
      .split(' ')
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 3 &&
          !['fc', 'afc', 'cf', 'sc', 'ac', 'fk'].includes(token),
      );

    if (!teamTokens.length) {
      return false;
    }

    const textTokens = new Set(
      normalizedText
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean),
    );

    const matchedTokens = teamTokens.filter((token) => textTokens.has(token));

    /*
     * One-word teams need exact token presence.
     *
     * Multi-word teams need at least half of their meaningful
     * tokens, rounded up.
     */
    const requiredMatches =
      teamTokens.length === 1
        ? 1
        : Math.max(1, Math.ceil(teamTokens.length / 2));

    return matchedTokens.length >= requiredMatches;
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
      .replace(/\butd\.?\b/g, 'united')
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
