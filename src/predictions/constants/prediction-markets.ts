// ==================================================
// PREDICTION MARKETS ENUM
// ==================================================

export const PredictionMarkets = {
  // ==================================================
  // MATCH RESULT
  // ==================================================

  DOUBLE_CHANCE: 'DOUBLE_CHANCE',

  DRAW_NO_BET: 'DRAW_NO_BET',

  // ==================================================
  // GOALS
  // ==================================================

  OVER_UNDER: 'OVER_UNDER',

  BOTH_TEAMS_TO_SCORE: 'BOTH_TEAMS_TO_SCORE',

  BTTS_GOALS: 'BTTS_GOALS',

  GOAL_RANGE: 'GOAL_RANGE',

  TEAM_TOTAL_GOALS: 'TEAM_TOTAL_GOALS',

  EXACT_GOALS: 'EXACT_GOALS',

  CLEAN_SHEET: 'CLEAN_SHEET',

  // ==================================================
  // HALF MARKETS
  // ==================================================

  HALF_TIME_RESULT: 'HALF_TIME_RESULT',

  SECOND_HALF_RESULT: 'SECOND_HALF_RESULT',

  HALF_TIME_FULL_TIME: 'HALF_TIME_FULL_TIME',

  // ==================================================
  // HANDICAP
  // ==================================================

  ASIAN_HANDICAP: 'ASIAN_HANDICAP',

  EUROPEAN_HANDICAP: 'EUROPEAN_HANDICAP',

  // ==================================================
  // CORNERS
  // ==================================================

  CORNERS_TOTAL: 'CORNERS_TOTAL',

  TEAM_CORNERS: 'TEAM_CORNERS',

  CORNER_HANDICAP: 'CORNER_HANDICAP',

  // ==================================================
  // CARDS
  // ==================================================

  CARDS_TOTAL: 'CARDS_TOTAL',

  TEAM_CARDS: 'TEAM_CARDS',

  CARD_HANDICAP: 'CARD_HANDICAP',

  // ==================================================
  // PLAYER MARKETS
  // ==================================================

  ANYTIME_GOALSCORER: 'ANYTIME_GOALSCORER',

  FIRST_GOALSCORER: 'FIRST_GOALSCORER',

  PLAYER_SHOTS: 'PLAYER_SHOTS',

  PLAYER_SHOTS_ON_TARGET: 'PLAYER_SHOTS_ON_TARGET',

  PLAYER_ASSISTS: 'PLAYER_ASSISTS',

  // ==================================================
  // MATCH EVENTS
  // ==================================================

  FIRST_GOAL: 'FIRST_GOAL',

  LAST_GOAL: 'LAST_GOAL',

  WIN_TO_NIL: 'WIN_TO_NIL',

  CORRECT_SCORE: 'CORRECT_SCORE',

  // ==================================================
  // STATISTICS
  // ==================================================

  POSSESSION_WINNER: 'POSSESSION_WINNER',

  MOST_SHOTS: 'MOST_SHOTS',

  MOST_SHOTS_ON_TARGET: 'MOST_SHOTS_ON_TARGET',

  GOAL_TIMING: 'GOAL_TIMING',

  OFFSIDES_TOTAL: 'OFFSIDES_TOTAL',

  TEAM_OFFSIDES: 'TEAM_OFFSIDES',

  FOULS_TOTAL: 'FOULS_TOTAL',

  TEAM_FOULS: 'TEAM_FOULS',

  FIRST_HALF_GOALS: 'FIRST_HALF_GOALS',

  SECOND_HALF_GOALS: 'SECOND_HALF_GOALS',

  FIRST_HALF_CORNERS: 'FIRST_HALF_CORNERS',

  FIRST_HALF_CARDS: 'FIRST_HALF_CARDS',
} as const;

export type PredictionMarket =
  (typeof PredictionMarkets)[keyof typeof PredictionMarkets];
