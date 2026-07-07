import { Injectable, InternalServerErrorException } from '@nestjs/common';

import axios, { AxiosInstance } from 'axios';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class LivescoreFootballService {
  private http: AxiosInstance;

  private readonly baseUrl = 'https://api.football-data.org/v4';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('FOOTBALL_DATA_API_KEY');

    if (!apiKey) {
      throw new Error('FOOTBALL_DATA_API_KEY missing');
    }

    this.http = axios.create({
      baseURL: this.baseUrl,

      headers: {
        'X-Auth-Token': apiKey,
      },

      timeout: 15000,
    });
  }

  async getLeagues() {
    try {
      const res = await this.http.get('/competitions');

      return res.data.competitions || [];
    } catch (error) {
      throw new InternalServerErrorException('Failed loading leagues');
    }
  }

  async getFixtures(leagueCode: string) {
    try {
      const res = await this.http.get(`/competitions/${leagueCode}/matches`);

      return res.data.matches || [];
    } catch (error) {
      throw new InternalServerErrorException('Failed loading fixtures');
    }
  }

  async getStandings(leagueCode: string) {
    try {
      const res = await this.http.get(`/competitions/${leagueCode}/standings`);

      return res.data?.standings?.[0]?.table || [];
    } catch (error) {
      throw new InternalServerErrorException('Failed loading standings');
    }
  }

  async getLiveFixtures() {
    try {
      const res = await this.http.get('/matches', {
        params: {
          status: 'IN_PLAY,PAUSED',
        },
      });

      return res.data.matches || [];
    } catch (error) {
      throw new InternalServerErrorException('Failed loading live fixtures');
    }
  }
}
