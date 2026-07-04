import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';

import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';

import { League } from './interfaces/league.interface';
import { Match } from './interfaces/match.interface';

@Injectable()
export class FootballDataService implements OnModuleInit {
  private apiKey: string;
  private http: AxiosInstance;

  private readonly baseUrl = 'https://api.football-data.org/v4';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const key = this.configService.get<string>('FOOTBALL_DATA_API_KEY');

    if (!key) {
      throw new Error('FOOTBALL_DATA_API_KEY is missing');
    }

    this.apiKey = key;

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Auth-Token': this.apiKey,
      },
      timeout: 15000,
    });
  }

  // =========================
  // LEAGUES
  // =========================
  async getLeagues(): Promise<League[]> {
    try {
      const res = await this.http.get('/competitions');

      return (res.data.competitions || []).map((l: any) => ({
        code: l.code,
        name: l.name,
        country: l.area?.name || 'Unknown',
        type: l.type,
        emblem: l.emblem,
      }));
    } catch {
      throw new InternalServerErrorException('Failed to fetch leagues');
    }
  }

  // =========================
  // FIXTURES
  // =========================
  async getFixturesByLeague(leagueCode: string): Promise<Match[]> {
    try {
      const res = await this.http.get(`/competitions/${leagueCode}/matches`, {
        params: {
          status: 'SCHEDULED,IN_PLAY,PAUSED',
        },
      });
      if (!leagueCode) {
        throw new BadRequestException('leagueCode is required');
      }
      return (res.data.matches || []).map((m: any) => {
        const kickoff = new Date(m.utcDate);

        return {
          id: String(m.id),

          leagueCode,

          league: {
            code: leagueCode,
            name: m.competition?.name,
            country: m.area?.name || 'Unknown',
            emblem: m.competition?.emblem,
          },

          homeTeam: m.homeTeam?.name || '',
          awayTeam: m.awayTeam?.name || '',

          homeTeamBadge: m.homeTeam?.crest,
          awayTeamBadge: m.awayTeam?.crest,

          date: m.utcDate,

          time: kickoff.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),

          status: m.status,
          matchday: m.matchday,

          homeScore: m.score?.fullTime?.home ?? null,
          awayScore: m.score?.fullTime?.away ?? null,

          kickoffTimestamp: kickoff.getTime(),
        };
      });
    } catch {
      throw new InternalServerErrorException('Failed to fetch fixtures');
    }
  }

  // =========================
  // MATCH DETAILS
  // =========================
  async getMatchDetails(matchId: string): Promise<Match | null> {
    try {
      const res = await this.http.get(`/matches/${matchId}`);
      const m = res.data.match;

      if (!m) return null;

      const kickoff = new Date(m.utcDate);

      return {
        id: String(m.id),

        leagueCode: m.competition?.code,

        league: {
          code: m.competition?.code,
          name: m.competition?.name,
          country: m.area?.name,
          emblem: m.competition?.emblem,
        },

        homeTeam: m.homeTeam?.name,
        awayTeam: m.awayTeam?.name,

        homeTeamBadge: m.homeTeam?.crest,
        awayTeamBadge: m.awayTeam?.crest,

        date: m.utcDate,

        time: kickoff.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),

        status: m.status,
        matchday: m.matchday,

        homeScore: m.score?.fullTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? null,

        kickoffTimestamp: kickoff.getTime(),
      };
    } catch {
      throw new InternalServerErrorException('Failed to fetch match');
    }
  }

  // =========================
  // FINISHED MATCHES
  // =========================
  async getFinishedMatches(leagueCode: string): Promise<Match[]> {
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      const today = new Date();

      const res = await this.http.get(`/competitions/${leagueCode}/matches`, {
        params: {
          status: 'FINISHED',
          dateFrom: pastDate.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
        },
      });
      if (!leagueCode) {
        throw new BadRequestException('leagueCode is required');
      }
      return (res.data.matches || []).map((m: any) => {
        const kickoff = new Date(m.utcDate);

        return {
          id: String(m.id),

          leagueCode,

          league: {
            code: leagueCode,
            name: m.competition?.name,
            country: m.area?.name || 'Unknown',
            emblem: m.competition?.emblem,
          },

          homeTeam: m.homeTeam?.name || '',
          awayTeam: m.awayTeam?.name || '',

          homeTeamBadge: m.homeTeam?.crest,
          awayTeamBadge: m.awayTeam?.crest,

          date: m.utcDate,

          status: m.status,
          matchday: m.matchday,

          homeScore: m.score?.fullTime?.home ?? null,
          awayScore: m.score?.fullTime?.away ?? null,

          kickoffTimestamp: kickoff.getTime(),
        };
      });
    } catch {
      return [];
    }
  }

  // =========================
  // STANDINGS (CLEAN OPTIONAL FORMAT)
  // =========================
  async getStandings(leagueCode: string) {
    try {
      const res = await this.http.get(`/competitions/${leagueCode}/standings`);
      if (!leagueCode) {
        throw new BadRequestException('leagueCode is required');
      }
      return (res.data?.standings?.[0]?.table || []).map((team: any) => ({
        position: team.position,

        teamId: team.team?.id,
        team: team.team?.name,
        shortName: team.team?.shortName,
        tla: team.team?.tla,
        crest: team.team?.crest,

        points: team.points,
        playedGames: team.playedGames,
        won: team.won,
        draw: team.draw,
        lost: team.lost,
        goalsFor: team.goalsFor,
        goalsAgainst: team.goalsAgainst,
        goalDifference: team.goalDifference,

        form: team.form || null,
      }));
    } catch {
      throw new InternalServerErrorException('Failed to fetch standings');
    }
  }
}
