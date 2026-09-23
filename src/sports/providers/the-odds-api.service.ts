import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import axios, { AxiosError, AxiosInstance } from 'axios';

import { OddsApiEventOdds, OddsApiSport } from './the-odds-api.interfaces';

import { SportsProviderRateLimitService } from '../services/sports-provider-rate-limit.service';

@Injectable()
export class TheOddsApiService implements OnModuleInit {
  private readonly logger = new Logger(TheOddsApiService.name);

  private readonly baseUrl = 'https://api.the-odds-api.com/v4';

  private apiKey!: string;

  private http!: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,

    private readonly providerRateLimitService: SportsProviderRateLimitService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('THE_ODDS_API_KEY')?.trim();

    if (!apiKey) {
      throw new Error('THE_ODDS_API_KEY is missing');
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
  // SPORTS
  // ============================================================

  async getSports(): Promise<OddsApiSport[]> {
    return this.request<OddsApiSport[]>('/sports', 'sports');
  }

  // ============================================================
  // ODDS
  // ============================================================

  async getOdds(
    sport: string,
    regions = 'eu',
    markets: string[] = [],
  ): Promise<OddsApiEventOdds[]> {
    const normalizedSport = sport?.trim();

    if (!normalizedSport) {
      throw new BadRequestException('sport is required');
    }

    const normalizedRegions = regions?.trim().toLowerCase();

    if (!normalizedRegions) {
      throw new BadRequestException('regions is required');
    }

    const normalizedMarkets = markets
      .map((market) => market.trim().toLowerCase())
      .filter(Boolean);

    if (!normalizedMarkets.length) {
      throw new BadRequestException('At least one Odds API market is required');
    }

    return this.request<OddsApiEventOdds[]>(
      `/sports/${encodeURIComponent(normalizedSport)}/odds`,
      'odds',
      {
        regions: normalizedRegions,

        markets: normalizedMarkets.join(','),

        oddsFormat: 'decimal',
      },
    );
  }

  // ============================================================
  // REQUEST
  // ============================================================

  private async request<T>(
    endpoint: string,
    rateLimitEndpoint: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    return this.providerRateLimitService.execute(
      'odds-api',
      rateLimitEndpoint,
      async () => {
        try {
          const response = await this.http.get<T>(endpoint, {
            params: {
              ...params,
              apiKey: this.apiKey,
            },
          });

          return response.data;
        } catch (error) {
          this.logApiError(error, endpoint);

          throw new InternalServerErrorException(
            `The Odds API request failed: ${endpoint}`,
          );
        }
      },
    );
  }

  // ============================================================
  // ERROR LOGGING
  // ============================================================

  private logApiError(error: unknown, endpoint: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      const headers = axiosError.response?.headers as
        | Record<string, string | string[] | undefined>
        | undefined;

      this.logger.error(`The Odds API request failed: ${endpoint}`, {
        status: axiosError.response?.status,

        data: axiosError.response?.data,

        remainingRequests: headers?.['x-requests-remaining'],

        usedRequests: headers?.['x-requests-used'],

        lastRequestCost: headers?.['x-requests-last'],
      });

      return;
    }

    this.logger.error(`The Odds API request failed: ${endpoint}`, error);
  }
}
