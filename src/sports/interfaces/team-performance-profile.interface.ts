export interface TeamPerformanceResult {
  fixtureId: string;
  competitionId: string;
  opponentTeamId: string;
  opponentTeamName: string;

  date: Date;

  venue: 'HOME' | 'AWAY';

  result: 'WIN' | 'DRAW' | 'LOSS';

  goalsFor: number;
  goalsAgainst: number;

  cleanSheet: boolean;
  failedToScore: boolean;

  btts: boolean;

  totalGoals: number;

  over15: boolean;
  over25: boolean;
  over35: boolean;

  shots?: number;
  shotsOnTarget?: number;
  possession?: number;
  corners?: number;
  fouls?: number;
  offsides?: number;
  yellowCards?: number;
  redCards?: number;
  saves?: number;

  firstHalfGoalsFor?: number;
  firstHalfGoalsAgainst?: number;

  secondHalfGoalsFor?: number;
  secondHalfGoalsAgainst?: number;

  scoredFirst?: boolean;

  concededFirst?: boolean;

  cameFromBehind?: boolean;

  protectedLead?: boolean;
}

export interface TeamPerformanceProfile {
  competitionId: string;

  season: number;

  teamId: string;

  teamName: string;

  teamLogo?: string;

  // ==========================================================
  // SAMPLE
  // ==========================================================

  matchesAnalyzed: number;

  matchesLastFive: number;

  matchesLastTen: number;

  // ==========================================================
  // CURRENT FORM
  // ==========================================================

  formLastFive: string[];

  formLastTen: string[];

  lastFivePoints: number;

  lastTenPoints: number;

  currentWinStreak: number;

  currentDrawStreak: number;

  currentLossStreak: number;

  unbeatenStreak: number;

  winlessStreak: number;

  scoringStreak: number;

  cleanSheetStreak: number;

  // ==========================================================
  // RECENT RESULTS
  // ==========================================================

  recentWins: number;

  recentDraws: number;

  recentLosses: number;

  recentWinRate: number;

  recentDrawRate: number;

  recentLossRate: number;

  recentPointsPerMatch: number;

  // ==========================================================
  // GOALS
  // ==========================================================

  goalsScored: number;

  goalsConceded: number;

  averageGoalsScored: number;

  averageGoalsConceded: number;

  goalDifference: number;

  averageGoalDifference: number;

  cleanSheets: number;

  cleanSheetRate: number;

  failedToScore: number;

  failedToScoreRate: number;

  bttsCount: number;

  bttsRate: number;

  over15Count: number;

  over15Rate: number;

  over25Count: number;

  over25Rate: number;

  over35Count: number;

  over35Rate: number;

  // ==========================================================
  // HOME
  // ==========================================================

  homeMatches: number;

  homeWins: number;

  homeDraws: number;

  homeLosses: number;

  homePoints: number;

  homeWinRate: number;

  homeGoalsScored: number;

  homeGoalsConceded: number;

  homeAverageGoalsScored: number;

  homeAverageGoalsConceded: number;

  homeCleanSheetRate: number;

  homeFailedToScoreRate: number;

  homeBttsRate: number;

  homeOver25Rate: number;

  // ==========================================================
  // AWAY
  // ==========================================================

  awayMatches: number;

  awayWins: number;

  awayDraws: number;

  awayLosses: number;

  awayPoints: number;

  awayWinRate: number;

  awayGoalsScored: number;

  awayGoalsConceded: number;

  awayAverageGoalsScored: number;

  awayAverageGoalsConceded: number;

  awayCleanSheetRate: number;

  awayFailedToScoreRate: number;

  awayBttsRate: number;

  awayOver25Rate: number;

  // ==========================================================
  // MATCH STATISTICS
  // ==========================================================

  averagePossession?: number;

  averageShots?: number;

  averageShotsOnTarget?: number;

  averageCorners?: number;

  averageFouls?: number;

  averageOffsides?: number;

  averageYellowCards?: number;

  averageRedCards?: number;

  averageSaves?: number;

  // ==========================================================
  // RECENT MATCH STATISTICS
  // ==========================================================

  lastFiveAveragePossession?: number;

  lastFiveAverageShots?: number;

  lastFiveAverageShotsOnTarget?: number;

  lastFiveAverageCorners?: number;

  lastFiveAverageFouls?: number;

  lastFiveAverageYellowCards?: number;

  lastFiveAverageRedCards?: number;

  // ==========================================================
  // SCORING TIMING
  // ==========================================================

  firstHalfGoalsScored: number;

  firstHalfGoalsConceded: number;

  secondHalfGoalsScored: number;

  secondHalfGoalsConceded: number;

  averageFirstHalfGoalsScored: number;

  averageFirstHalfGoalsConceded: number;

  averageSecondHalfGoalsScored: number;

  averageSecondHalfGoalsConceded: number;

  scoredFirstCount: number;

  scoredFirstRate: number;

  concededFirstCount: number;

  concededFirstRate: number;

  // ==========================================================
  // GAME MANAGEMENT
  // ==========================================================

  cameFromBehindCount: number;

  cameFromBehindRate: number;

  protectedLeadCount: number;

  protectedLeadRate: number;

  // ==========================================================
  // MOMENTUM
  // ==========================================================

  recentFormScore: number;

  attackingFormScore: number;

  defensiveFormScore: number;

  homeFormScore: number;

  awayFormScore: number;

  momentumScore: number;

  overallPerformanceScore: number;

  // ==========================================================
  // FIXTURE CONTEXT
  // ==========================================================

  previousMatchDate?: Date;

  daysSincePreviousMatch?: number;

  nextMatchDate?: Date;

  daysUntilNextMatch?: number;

  // ==========================================================
  // CALCULATION
  // ==========================================================

  calculatedAt: Date;
}
