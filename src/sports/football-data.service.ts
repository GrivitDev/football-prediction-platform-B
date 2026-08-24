import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';

import axios, { AxiosInstance } from 'axios';

import { ConfigService } from '@nestjs/config';

import { League } from './interfaces/league.interface';

import { Match, GoalEvent, MatchDuration } from './interfaces/match.interface';

// ============================================================
// TYPES
// ============================================================

type CompetitionType = 'LEAGUE' | 'CUP' | 'PLAYOFFS' | 'LEAGUE_CUP' | string;

type CompetitionStage =
  | 'REGULAR_SEASON'
  | 'GROUP_STAGE'
  | 'ROUND_OF_32'
  | 'LAST_16'
  | 'ROUND_OF_16'
  | 'QUARTER_FINALS'
  | 'SEMI_FINALS'
  | 'THIRD_PLACE'
  | 'FINAL'
  | string;

interface CompetitionInfo {
  id?: number;

  code: string;

  name: string;

  type: CompetitionType;

  country: string;

  emblem?: string;

  season?: {
    id?: number;

    startDate?: string;

    endDate?: string;

    currentMatchday?: number;

    stages?: CompetitionStage[];

    winner?: unknown;
  };
}

interface TournamentStanding {
  position: number;

  teamId?: number;

  team: string;

  shortName?: string;

  tla?: string;

  crest?: string;

  points: number;

  playedGames: number;

  won: number;

  draw: number;

  lost: number;

  goalsFor: number;

  goalsAgainst: number;

  goalDifference: number;

  form?: string | null;
}

interface StandingGroup {
  stage: CompetitionStage;

  group: string;

  table: TournamentStanding[];
}

interface KnockoutMatch {
  id: string;

  homeTeam: string;

  awayTeam: string;

  homeTeamBadge?: string;

  awayTeamBadge?: string;

  date: string;

  time?: string;

  venue?: string;

  status?: string;

  minute?: number | null;

  injuryTime?: number | null;

  homeScore?: number | null;

  awayScore?: number | null;

  stage: CompetitionStage;

  goals: GoalEvent[];

  kickoffTimestamp: number;
}

interface KnockoutStage {
  stage: CompetitionStage;

  label: string;

  matches: KnockoutMatch[];
}

export interface CompetitionStandingsResponse {
  type: CompetitionType;

  competition: {
    code: string;

    name: string;

    country: string;

    emblem?: string;
  };

  season?: CompetitionInfo['season'];

  table?: TournamentStanding[];

  groups?: StandingGroup[];

  knockout?: KnockoutStage[];
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class FootballDataService implements OnModuleInit {
  private apiKey: string;

  private http: AxiosInstance;

  private readonly baseUrl = 'https://api.football-data.org/v4';

  constructor(private readonly configService: ConfigService) {}

  // ==========================================================
  // INIT
  // ==========================================================

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

        'X-Unfold-Goals': 'true',
      },

      timeout: 15000,
    });
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  private requireLeagueCode(leagueCode: string) {
    if (!leagueCode) {
      throw new BadRequestException('leagueCode is required');
    }
  }

  // ==========================================================
  // UTC TIME
  // ==========================================================

  private formatUtcTime(date: Date): string {
    return date.toLocaleTimeString('en-GB', {
      timeZone: 'UTC',

      hour: '2-digit',

      minute: '2-digit',

      second: '2-digit',

      hour12: false,
    });
  }

  // ==========================================================
  // STAGE LABEL
  // ==========================================================

  private getStageLabel(stage?: string): string {
    switch (stage) {
      case 'REGULAR_SEASON':
        return 'League';

      case 'GROUP_STAGE':
        return 'Group Stage';

      case 'ROUND_OF_32':
        return 'Round of 32';

      case 'LAST_16':
      case 'ROUND_OF_16':
        return 'Round of 16';

      case 'QUARTER_FINALS':
        return 'Quarter-finals';

      case 'SEMI_FINALS':
        return 'Semi-finals';

      case 'THIRD_PLACE':
        return 'Third-place Playoff';

      case 'FINAL':
        return 'Final';

      default:
        return (
          stage
            ?.replaceAll('_', ' ')
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Stage'
        );
    }
  }

  // ==========================================================
  // STAGE ORDER
  // ==========================================================

  private getStageOrder(stage?: string): number {
    switch (stage) {
      case 'GROUP_STAGE':
        return 1;

      case 'ROUND_OF_32':
        return 2;

      case 'LAST_16':
      case 'ROUND_OF_16':
        return 3;

      case 'QUARTER_FINALS':
        return 4;

      case 'SEMI_FINALS':
        return 5;

      case 'THIRD_PLACE':
        return 6;

      case 'FINAL':
        return 7;

      default:
        return 99;
    }
  }

  // ==========================================================
  // MAP GOALS
  // ==========================================================

  private mapGoals(goals: any[] | undefined): GoalEvent[] {
    if (!Array.isArray(goals)) {
      return [];
    }

    return goals.map((goal) => ({
      minute: Number(goal?.minute ?? 0),

      injuryTime: goal?.injuryTime ?? null,

      type: goal?.type ?? 'REGULAR',

      team: goal?.team
        ? {
            id: goal.team.id,

            name: goal.team.name,
          }
        : undefined,

      scorer: goal?.scorer
        ? {
            id: goal.scorer.id,

            name: goal.scorer.name,
          }
        : undefined,

      assist: goal?.assist
        ? {
            id: goal.assist.id,

            name: goal.assist.name,
          }
        : undefined,

      score: goal?.score
        ? {
            home: goal.score.home,

            away: goal.score.away,
          }
        : undefined,
    }));
  }

  // ==========================================================
  // MAP MATCH
  // ==========================================================

  private mapMatch(match: any, leagueCode?: string): Match {
    const kickoff = new Date(match.utcDate);

    return {
      id: String(match.id),

      leagueCode: leagueCode || match.competition?.code || '',

      league: {
        code: leagueCode || match.competition?.code || '',

        name: match.competition?.name || '',

        country: match.area?.name || 'Unknown',

        emblem: match.competition?.emblem,

        type: match.competition?.type,
      },

      // ========================================================
      // TEAMS
      // ========================================================

      homeTeam: match.homeTeam?.name || '',

      awayTeam: match.awayTeam?.name || '',

      homeTeamId: match.homeTeam?.id,

      awayTeamId: match.awayTeam?.id,

      homeTeamBadge: match.homeTeam?.crest,

      awayTeamBadge: match.awayTeam?.crest,

      // ========================================================
      // DATE / UTC TIME
      // ========================================================

      date: match.utcDate,

      time: this.formatUtcTime(kickoff),

      venue: match.venue || 'Unknown Stadium',

      kickoffTimestamp: kickoff.getTime(),

      // ========================================================
      // STATUS
      // ========================================================

      status: match.status,

      matchday: match.matchday,

      // ========================================================
      // TOURNAMENT
      // ========================================================

      stage: match.stage,

      group: match.group || null,

      // ========================================================
      // LIVE
      // ========================================================

      minute: match.minute ?? null,

      injuryTime: match.injuryTime ?? null,

      // ========================================================
      // SCORE
      // ========================================================

      homeScore: match.score?.fullTime?.home ?? null,

      awayScore: match.score?.fullTime?.away ?? null,

      scoreDuration: match.score?.duration as MatchDuration | undefined,

      // ========================================================
      // HALF-TIME SCORE
      // ========================================================

      halfTimeHomeScore: match.score?.halfTime?.home ?? null,

      halfTimeAwayScore: match.score?.halfTime?.away ?? null,

      // ========================================================
      // EXTRA-TIME SCORE
      // ========================================================

      extraTimeHomeScore: match.score?.extraTime?.home ?? null,

      extraTimeAwayScore: match.score?.extraTime?.away ?? null,

      // ========================================================
      // GOALS
      // ========================================================

      goals: this.mapGoals(match.goals),
    };
  }

  // ==========================================================
  // COMPETITION INFO
  // ==========================================================

  private async getCompetitionInfo(
    leagueCode: string,
  ): Promise<CompetitionInfo> {
    this.requireLeagueCode(leagueCode);

    try {
      const res = await this.http.get(`/competitions/${leagueCode}`);

      const competition = res.data;

      return {
        id: competition.id,

        code: competition.code || leagueCode,

        name: competition.name || '',

        type: competition.type || 'LEAGUE',

        country: competition.area?.name || 'Unknown',

        emblem: competition.emblem,

        season: competition.currentSeason
          ? {
              id: competition.currentSeason.id,

              startDate: competition.currentSeason.startDate,

              endDate: competition.currentSeason.endDate,

              currentMatchday: competition.currentSeason.currentMatchday,

              stages: competition.currentSeason.stages || [],

              winner: competition.currentSeason.winner,
            }
          : undefined,
      };
    } catch (error) {
      this.logApiError(error, 'Competition');

      throw new InternalServerErrorException('Failed to fetch competition');
    }
  }

  // ==========================================================
  // API ERROR
  // ==========================================================

  private logApiError(error: unknown, context: string) {
    if (axios.isAxiosError(error)) {
      console.error(
        `Football Data ${context} Error:`,
        error.response?.status,
        error.response?.data,
      );
    } else {
      console.error(`Football Data ${context} Error:`, error);
    }
  }

  // ==========================================================
  // LEAGUES
  // ==========================================================

  async getLeagues(): Promise<League[]> {
    try {
      const res = await this.http.get('/competitions');

      return (res.data.competitions || []).map((league: any) => ({
        code: league.code,

        name: league.name,

        country: league.area?.name || 'Unknown',

        type: league.type,

        emblem: league.emblem,
      }));
    } catch (error) {
      this.logApiError(error, 'Leagues');

      throw new InternalServerErrorException('Failed to fetch leagues');
    }
  }

  // ==========================================================
  // LIVE MATCHES
  // ==========================================================

  async getLiveMatches(): Promise<Match[]> {
    try {
      const res = await this.http.get('/matches', {
        params: {
          status: 'LIVE',
        },

        headers: {
          'X-Unfold-Goals': 'true',
        },
      });

      return (res.data?.matches || [])

        .map((match: any) => this.mapMatch(match))

        .filter(
          (match: Match) =>
            match.status === 'IN_PLAY' || match.status === 'PAUSED',
        )

        .sort((a, b) => a.kickoffTimestamp - b.kickoffTimestamp);
    } catch (error) {
      this.logApiError(error, 'Live Matches');

      return [];
    }
  }

  // ==========================================================
  // FIXTURES
  // ==========================================================

  async getFixturesByLeague(leagueCode: string): Promise<Match[]> {
    this.requireLeagueCode(leagueCode);

    try {
      const res = await this.http.get(`/competitions/${leagueCode}/matches`, {
        params: {
          status: 'SCHEDULED,LIVE',
        },

        headers: {
          'X-Unfold-Goals': 'true',
        },
      });

      return (res.data.matches || []).map((match: any) =>
        this.mapMatch(match, leagueCode),
      );
    } catch (error) {
      this.logApiError(error, 'Fixtures');

      throw new InternalServerErrorException('Failed to fetch fixtures');
    }
  }

  // ==========================================================
  // MATCH DETAILS
  // ==========================================================

  async getMatchDetails(matchId: string): Promise<Match | null> {
    if (!matchId) {
      throw new BadRequestException('matchId is required');
    }

    try {
      const res = await this.http.get(`/matches/${matchId}`, {
        headers: {
          'X-Unfold-Goals': 'true',
        },
      });

      const match = res.data?.match ?? res.data;

      if (!match) {
        return null;
      }

      return this.mapMatch(match);
    } catch (error) {
      this.logApiError(error, 'Match Details');

      throw new InternalServerErrorException('Failed to fetch match');
    }
  }

  // ==========================================================
  // FINISHED MATCHES
  // ==========================================================

  async getFinishedMatches(leagueCode: string): Promise<Match[]> {
    this.requireLeagueCode(leagueCode);

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

        headers: {
          'X-Unfold-Goals': 'true',
        },
      });

      return (res.data.matches || []).map((match: any) =>
        this.mapMatch(match, leagueCode),
      );
    } catch (error) {
      this.logApiError(error, 'Finished Matches');

      return [];
    }
  }

  // ==========================================================
  // LEAGUE STANDINGS
  // ==========================================================

  private async getLeagueStandings(
    leagueCode: string,
  ): Promise<TournamentStanding[]> {
    try {
      const res = await this.http.get(`/competitions/${leagueCode}/standings`);

      const standings = res.data?.standings || [];

      const total =
        standings.find((standing: any) => standing.type === 'TOTAL') ||
        standings[0];

      return (total?.table || []).map((team: any) => this.mapStanding(team));
    } catch (error) {
      this.logApiError(error, 'League Standings');

      throw new InternalServerErrorException(
        'Failed to fetch league standings',
      );
    }
  }

  // ==========================================================
  // LEAGUE CUP GROUP STANDINGS
  // ==========================================================

  private async getLeagueCupStandings(
    leagueCode: string,
  ): Promise<StandingGroup[]> {
    try {
      const res = await this.http.get(`/competitions/${leagueCode}/standings`);

      return (res.data?.standings || []).map((standing: any) => ({
        stage: standing.stage || 'GROUP_STAGE',

        group: standing.group || 'Group',

        table: (standing.table || []).map((team: any) =>
          this.mapStanding(team),
        ),
      }));
    } catch (error) {
      this.logApiError(error, 'League Cup Standings');

      throw new InternalServerErrorException('Failed to fetch group standings');
    }
  }

  // ==========================================================
  // STANDING MAPPER
  // ==========================================================

  private mapStanding(team: any): TournamentStanding {
    return {
      position: team.position,

      teamId: team.team?.id,

      team: team.team?.name || '',

      shortName: team.team?.shortName,

      tla: team.team?.tla,

      crest: team.team?.crest,

      points: team.points ?? 0,

      playedGames: team.playedGames ?? 0,

      won: team.won ?? 0,

      draw: team.draw ?? 0,

      lost: team.lost ?? 0,

      goalsFor: team.goalsFor ?? 0,

      goalsAgainst: team.goalsAgainst ?? 0,

      goalDifference: team.goalDifference ?? 0,

      form: team.form ?? null,
    };
  }

  // ==========================================================
  // CUP MATCHES
  // ==========================================================

  private async getCompetitionMatches(
    leagueCode: string,
    competition?: CompetitionInfo,
  ): Promise<Match[]> {
    try {
      const params: Record<string, string> = {};

      const startDate = competition?.season?.startDate;

      const endDate = competition?.season?.endDate;

      if (startDate) {
        params.dateFrom = startDate;
      }

      if (endDate) {
        params.dateTo = endDate;
      }

      const res = await this.http.get(`/competitions/${leagueCode}/matches`, {
        params,

        headers: {
          'X-Unfold-Goals': 'true',
        },
      });

      return (res.data.matches || []).map((match: any) =>
        this.mapMatch(match, leagueCode),
      );
    } catch (error) {
      this.logApiError(error, 'Competition Matches');

      throw new InternalServerErrorException(
        'Failed to fetch competition matches',
      );
    }
  }

  // ==========================================================
  // BUILD CUP GROUPS
  // ==========================================================

  private buildCupGroups(matches: Match[]): StandingGroup[] {
    const groupMatches = matches.filter(
      (match) => match.stage === 'GROUP_STAGE' && !!match.group,
    );

    const groups = new Map<string, Match[]>();

    for (const match of groupMatches) {
      const group = match.group!;

      if (!groups.has(group)) {
        groups.set(group, []);
      }

      groups.get(group)!.push(match);
    }

    return Array.from(groups.entries())

      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, {
          numeric: true,
        }),
      )

      .map(([group, groupMatches]) => ({
        stage: 'GROUP_STAGE',

        group: this.formatGroupName(group),

        table: this.calculateGroupTable(groupMatches),
      }));
  }

  // ==========================================================
  // CALCULATE CUP GROUP TABLE
  // ==========================================================

  private calculateGroupTable(matches: Match[]): TournamentStanding[] {
    const teams = new Map<number, TournamentStanding>();

    const ensureTeam = (teamId: number, teamName: string, crest?: string) => {
      if (!teams.has(teamId)) {
        teams.set(teamId, {
          position: 0,

          teamId,

          team: teamName,

          crest,

          points: 0,

          playedGames: 0,

          won: 0,

          draw: 0,

          lost: 0,

          goalsFor: 0,

          goalsAgainst: 0,

          goalDifference: 0,

          form: null,
        });
      }
    };

    for (const match of matches) {
      if (match.status !== 'FINISHED') {
        continue;
      }

      const homeId = match.homeTeamId;

      const awayId = match.awayTeamId;

      if (homeId == null || awayId == null) {
        continue;
      }

      ensureTeam(homeId, match.homeTeam, match.homeTeamBadge);

      ensureTeam(awayId, match.awayTeam, match.awayTeamBadge);

      const home = teams.get(homeId)!;

      const away = teams.get(awayId)!;

      const homeGoals = match.homeScore ?? 0;

      const awayGoals = match.awayScore ?? 0;

      home.playedGames++;

      away.playedGames++;

      home.goalsFor += homeGoals;

      home.goalsAgainst += awayGoals;

      away.goalsFor += awayGoals;

      away.goalsAgainst += homeGoals;

      if (homeGoals > awayGoals) {
        home.won++;

        home.points += 3;

        away.lost++;
      } else if (homeGoals < awayGoals) {
        away.won++;

        away.points += 3;

        home.lost++;
      } else {
        home.draw++;

        away.draw++;

        home.points++;

        away.points++;
      }
    }

    const table = Array.from(teams.values());

    for (const team of table) {
      team.goalDifference = team.goalsFor - team.goalsAgainst;
    }

    table.sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }

      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }

      if (b.goalsFor !== a.goalsFor) {
        return b.goalsFor - a.goalsFor;
      }

      if (b.won !== a.won) {
        return b.won - a.won;
      }

      return a.team.localeCompare(b.team);
    });

    return table.map((team, index) => ({
      ...team,

      position: index + 1,
    }));
  }

  // ==========================================================
  // CUP KNOCKOUT
  // ==========================================================

  private buildKnockoutStages(matches: Match[]): KnockoutStage[] {
    const knockout = matches.filter(
      (match) =>
        match.stage &&
        match.stage !== 'GROUP_STAGE' &&
        match.stage !== 'REGULAR_SEASON',
    );

    const stages = new Map<string, Match[]>();

    for (const match of knockout) {
      const stage = match.stage!;

      if (!stages.has(stage)) {
        stages.set(stage, []);
      }

      stages.get(stage)!.push(match);
    }

    return Array.from(stages.entries())

      .sort(([a], [b]) => this.getStageOrder(a) - this.getStageOrder(b))

      .map(([stage, stageMatches]) => ({
        stage,

        label: this.getStageLabel(stage),

        matches: stageMatches
          .sort((a, b) => a.kickoffTimestamp - b.kickoffTimestamp)

          .map((match) => ({
            id: match.id,

            homeTeam: match.homeTeam,

            awayTeam: match.awayTeam,

            homeTeamBadge: match.homeTeamBadge,

            awayTeamBadge: match.awayTeamBadge,

            date: match.date,

            time: match.time,

            venue: match.venue,

            status: match.status,

            minute: match.minute,

            injuryTime: match.injuryTime,

            homeScore: match.homeScore,

            awayScore: match.awayScore,

            stage: match.stage!,

            goals: match.goals,

            kickoffTimestamp: match.kickoffTimestamp,
          })),
      }));
  }

  // ==========================================================
  // GROUP NAME
  // ==========================================================

  private formatGroupName(group: string): string {
    return group.replace(/^GROUP_/, 'Group ').replace(/^Group_?/i, 'Group ');
  }

  // ==========================================================
  // STANDINGS
  //
  // LEAGUE
  //   -> table
  //
  // LEAGUE_CUP
  //   -> groups
  //
  // CUP / PLAYOFFS
  //   -> groups + knockout
  // ==========================================================

  async getStandings(
    leagueCode: string,
  ): Promise<CompetitionStandingsResponse> {
    this.requireLeagueCode(leagueCode);

    const competition = await this.getCompetitionInfo(leagueCode);

    const base = {
      type: competition.type,

      competition: {
        code: competition.code,

        name: competition.name,

        country: competition.country,

        emblem: competition.emblem,
      },

      season: competition.season,
    };

    // ========================================================
    // LEAGUE
    // ========================================================

    if (competition.type === 'LEAGUE') {
      const table = await this.getLeagueStandings(leagueCode);

      return {
        ...base,

        table,
      };
    }

    // ========================================================
    // LEAGUE CUP
    // ========================================================

    if (competition.type === 'LEAGUE_CUP') {
      const groups = await this.getLeagueCupStandings(leagueCode);

      return {
        ...base,

        groups,
      };
    }

    // ========================================================
    // CUP / PLAYOFF
    // ========================================================

    const matches = await this.getCompetitionMatches(leagueCode, competition);

    const groups = this.buildCupGroups(matches);

    const knockout = this.buildKnockoutStages(matches);

    return {
      ...base,

      groups: groups.length ? groups : undefined,

      knockout: knockout.length ? knockout : undefined,
    };
  }
}
