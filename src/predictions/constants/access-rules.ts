import { PredictionMarkets } from './prediction-markets';

export const PredictionAccessRules = {
  free: {
    releaseHoursBeforeKickoff: 6,

    showProbabilities: false,

    allowedMarkets: [],
  },

  regular: {
    releaseHoursBeforeKickoff: 72,

    showProbabilities: true,

    allowedMarkets: [
      PredictionMarkets.OVER_UNDER,

      PredictionMarkets.BOTH_TEAMS_TO_SCORE,

      PredictionMarkets.DOUBLE_CHANCE,
    ],
  },

  vip: {
    releaseHoursBeforeKickoff: 336,

    showProbabilities: true,

    allowedMarkets: Object.values(PredictionMarkets),
  },
} as const;
