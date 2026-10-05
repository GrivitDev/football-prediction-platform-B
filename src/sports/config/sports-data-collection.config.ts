export const SPORTS_DATA_COLLECTION_CONFIG = {
  // ==========================================================
  // ESPN
  // ==========================================================

  ESPN: {
    enabled: true,

    /**
     * ESPN exposes no published application quota. We therefore use
     * a small process-local start interval and a bounded concurrency
     * pool. The rate-limit service applies adaptive backoff when ESPN
     * returns throttling or transient server errors.
     */
    rateLimit: {
      minIntervalSeconds: 0.1,
      normalConcurrency: 20,
      liveConcurrency: 1,
    },

    /**
     * Complete ESPN soccer league catalogue.
     *
     * The catalogue is refreshed weekly.
     */
    catalogue: {
      refreshIntervalDays: 7,
    },

    /**
     * Active competition matching.
     */
    activeCompetitions: {
      enabled: true,
      refreshIntervalMinutes: 10,
    },

    /**
     * Fixture collection.
     *
     * Startup uses one scoreboard request per calendar month covering
     * the active season. Normal operations continue to use a daily
     * scoreboard refresh for today's/current window and just-finished
     * matches.
     */
    fixtures: {
      enabled: true,

      /** Number of days ahead included in normal fixture synchronization. */
      forwardDays: 8,

      /** Minimum freshness guarantee for active competitions. */
      staleAfterHours: 48,

      /** Queue spacing between normal fixture work slots. */
      slotIntervalMinutes: 0.02,

      /** Maximum scoreboard events requested from ESPN for one month. */
      startupMonthLimit: 1000,

      /** Maximum simultaneous startup scoreboard requests. */
      startupConcurrency: 5,
    },

    /**
     * ESPN Summary collection.
     */
    summary: {
      enabled: true,

      /** Upcoming Summary collection window. */
      upcomingWindowDays: 4,

      /** Finished fixtures receive Summary immediately after completion is detected. */
      immediatelyAfterFinished: true,

      /** Startup hydrates Summary for all persisted fixtures. */
      startupAllFixtures: true,

      /** Maximum simultaneous ESPN Summary requests. */
      startupConcurrency: 5,

      /** Number of event IDs processed from one league before round-robin continues. */
      startupBatchSize: 50,

      /** Maximum summaries persisted by one Mongo bulkWrite call. */
      persistenceBatchSize: 25,

      /** Maximum transient retry attempts inside the ESPN client. */
      maxRetries: 3,
    },

    /** Queue safety. */
    queue: {
      enabled: true,
      maxAttempts: 3,
      staleProcessingMinutes: 5,
      retryDelayMinutes: 5,
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

