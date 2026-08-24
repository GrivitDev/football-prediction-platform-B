// ============================================================
// GOAL EVENT
// ============================================================

export interface GoalEvent {
  minute: number;

  injuryTime?: number | null;

  type?: string;

  team?: {
    id?: number;

    name?: string;
  };

  scorer?: {
    id?: number;

    name?: string;
  };

  assist?: {
    id?: number;

    name?: string;
  };

  score?: {
    home?: number;

    away?: number;
  };
}

// ============================================================
// MATCH DURATION
// ============================================================

export type MatchDuration = 'REGULAR' | 'EXTRA_TIME' | 'PENALTIES' | string;

// ============================================================
// MATCH
// ============================================================

export interface Match {
  id: string;

  leagueCode: string;

  league?: {
    code: string;

    name: string;

    country: string;

    emblem?: string;

    type?: string;
  };

  // ==========================================================
  // TEAMS
  // ==========================================================

  homeTeam: string;

  awayTeam: string;

  homeTeamId?: number;

  awayTeamId?: number;

  homeTeamBadge?: string;

  awayTeamBadge?: string;

  // ==========================================================
  // DATE / TIME / LOCATION
  // ==========================================================

  /**
   * Original UTC datetime returned by Football-Data.org.
   *
   * Example:
   * 2026-08-22T18:35:10Z
   */
  date: string;

  /**
   * UTC time only.
   *
   * Example:
   * 18:35:10
   */
  time?: string;

  venue?: string;

  /**
   * Unix timestamp.
   * This is timezone-independent.
   */
  kickoffTimestamp: number;

  // ==========================================================
  // STATUS
  // ==========================================================

  status?: string;

  matchday?: number;

  // ==========================================================
  // COMPETITION STAGE
  // ==========================================================

  stage?: string;

  group?: string | null;

  // ==========================================================
  // LIVE MATCH INFORMATION
  // ==========================================================

  minute?: number | null;

  injuryTime?: number | null;

  // ==========================================================
  // SCORE
  // ==========================================================

  homeScore?: number | null;

  awayScore?: number | null;

  /**
   * REGULAR
   * EXTRA_TIME
   * PENALTIES
   */
  scoreDuration?: MatchDuration;

  // ==========================================================
  // HALF-TIME SCORE
  // ==========================================================

  halfTimeHomeScore?: number | null;

  halfTimeAwayScore?: number | null;

  // ==========================================================
  // EXTRA-TIME SCORE
  // ==========================================================

  extraTimeHomeScore?: number | null;

  extraTimeAwayScore?: number | null;

  // ==========================================================
  // GOALS
  // ==========================================================

  goals: GoalEvent[];
}
