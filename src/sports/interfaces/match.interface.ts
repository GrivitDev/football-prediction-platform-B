export interface Match {
  id: string;

  leagueCode: string;

  league?: {
    code: string;
    name: string;
    country: string;
    emblem?: string;
  };

  homeTeam: string;
  awayTeam: string;

  homeTeamBadge?: string;
  awayTeamBadge?: string;

  date: string;
  time?: string;

  status?: string;

  matchday?: number;

  homeScore?: number | null;
  awayScore?: number | null;

  kickoffTimestamp: number;
}
