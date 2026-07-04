export const PredictionMarkets = {
  OVER_UNDER: 'OVER_UNDER',

  HALF_TIME: 'HALF_TIME',

  HALF_TIME_FULL_TIME: 'HALF_TIME_FULL_TIME',

  BOTH_TEAMS_TO_SCORE: 'BOTH_TEAMS_TO_SCORE',

  DOUBLE_CHANCE: 'DOUBLE_CHANCE',

  ASIAN_HANDICAP: 'ASIAN_HANDICAP',

  GOALSCORERS: 'GOALSCORERS',

  CORNERS: 'CORNERS',

  CARDS: 'CARDS',
} as const;

export type PredictionMarket =
  (typeof PredictionMarkets)[keyof typeof PredictionMarkets];
