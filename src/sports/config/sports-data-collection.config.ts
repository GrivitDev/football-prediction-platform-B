export const SPORTS_DATA_COLLECTION_CONFIG = {
  // ==========================================================
  // ESPN
  // ==========================================================

  ESPN: {
    enabled: true,

    /**
     * ESPN does not have an application-level daily quota
     * in our collection architecture.
     *
     * We enforce one outbound ESPN request every 10 seconds
     * through the provider-wide rate-limit service.
     */
    rateLimit: {
      minIntervalSeconds: 5,
    },

    /**
     * Complete ESPN soccer league catalogue.
     *
     * The catalogue is refreshed monthly.
     */
    catalogue: {
      refreshIntervalDays: 30,
    },

    /**
     * Active competition matching.
     *
     * The stored ESPN catalogue is checked for competitions
     * that currently have active fixtures.
     */
    activeCompetitions: {
      enabled: true,
      refreshIntervalMinutes: 60,
    },

    /**
     * Fixture collection.
     *
     * Active competitions are processed according to priority.
     *
     * 0.5 minutes = 30 seconds.
     */
    fixtures: {
      enabled: true,
      slotIntervalMinutes: 0.5,
    },

    /**
     * Queue safety.
     */
    queue: {
      enabled: true,
      maxAttempts: 3,
      staleProcessingMinutes: 30,
      retryDelayMinutes: 15,
    },
  },

  // ==========================================================
  // FOOTBALL-DATA
  // ==========================================================

  FOOTBALL_DATA: {
    enabled: true,

    rateLimit: {
      minIntervalSeconds: 60,
    },

    live: {
      intervalMinutes: 5,
    },
  },

  // ==========================================================
  // THE ODDS API
  // ==========================================================

  ODDS_API: {
    enabled: true,

    /**
     * Application-level monthly request budget.
     */
    monthlyRequestLimit: 450,

    rateLimit: {
      minIntervalSeconds: 60,
    },

    /**
     * Refresh the provider sport catalogue periodically.
     */
    sportsRefreshDays: 30,

    oddsCollection: {
      daily: true,
      slotIntervalMinutes: 1,
    },
  },

  // ==========================================================
  // YOUTUBE
  // ==========================================================

  YOUTUBE: {
    enabled: true,

    /**
     * Internal daily search safety budget.
     *
     * This remains separate from ESPN.
     */
    dailyRequestLimit: 90,

    rateLimit: {
      minIntervalSeconds: 200,
    },

    queue: {
      enabled: true,
      intervalMinutes: 20,
      maxAttempts: 3,
      retryDelayMinutes: 20,
    },
  },
} as const;

export type SportsDataCollectionConfig = typeof SPORTS_DATA_COLLECTION_CONFIG;
