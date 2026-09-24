export interface SportsSystemMonitorQuery {
  leagueId?: string;
}

export interface MonitorFixtureSummary {
  total: number;
  upcoming: number;
  live: number;
  finished: number;
  finishedWithSummary: number;
  finishedMissingSummary: number;
  summaryCoveragePercent: number;
  latestCollectedAt?: Date;
  storedSeasons: number;
}

export interface MonitorTeamSummary {
  documents: number;
  distinctTeams: number;
  expectedCurrentSeasonTeams: number;
  missingCurrentSeasonTeams: number;
  coveragePercent: number;
  latestCollectedAt?: Date;
}

export interface MonitorStandingSummary {
  rows: number;
  teams: number;
  expectedTeams: number;
  missingTeams: number;
  coveragePercent: number;
  latestCollectedAt?: Date;
}

export interface MonitorNewsSummary {
  total: number;
  last24Hours: number;
  latestPublishedAt?: Date;
  latestCollectedAt?: Date;
}

export interface MonitorQueueItem {
  type: string;
  status: string;
  count: number;
}

export interface MonitorQueueSummary {
  total: number;
  pending: number;
  processing: number;
  completedRetained: number;
  failed: number;
  staleProcessing: number;
  completedRetentionDays: number;
  byType: Record<string, number>;
  byTypeAndStatus: MonitorQueueItem[];
  latestFailureAt?: Date;
  latestFailure?: string;
  latestCompletedAt?: Date;
}

export interface MonitorSyncStageSummary {
  jobType?: string;
  stage: string;
  unitType: string;
  status: string;
  count: number;
}

export interface MonitorSyncFailure {
  stateKey: string;
  jobType?: string;
  leagueId?: string;
  season?: number;
  eventId?: string;
  error?: string;
  at?: Date;
  consecutiveFailures: number;
}

export interface MonitorCronState {
  stateKey: string;
  taskKey?: string;
  status: string;
  cronExpression?: string;
  timeZone?: string;
  lastStartedAt?: Date;
  lastSuccessfulAt?: Date;
  lastCompletedAt?: Date;
  nextRunAt?: Date;
  consecutiveFailures: number;
  lastError?: string;
}

export interface MonitorSyncSummary {
  totalStates: number;
  queueStates: number;
  cronStates: number;
  byStatus: Record<string, number>;
  unitProgress: {
    total: number;
    success: number;
    processing: number;
    pending: number;
    failed: number;
    completionPercent: number;
  };
  stateCompletionPercent: number;
  currentStages: MonitorSyncStageSummary[];
  failures: MonitorSyncFailure[];
  cron: MonitorCronState[];
  latestSuccessfulAt?: Date;
  latestCompletedAt?: Date;
  nextRunAt?: Date;
}

export interface MonitorCoverageMetric {
  documents: number;
  expected: number;
  missing: number;
  coveragePercent: number;
  latestCalculatedAt?: Date;
}

export interface MonitorDerivedSummary {
  teamCompetitionStats: MonitorCoverageMetric;
  teamPerformanceProfiles: MonitorCoverageMetric;
  headToHead: {
    pairs: number;
    expectedPairs: number;
    missingPairs: number;
    coveragePercent: number;
    latestMeetingAt?: Date;
    latestCalculatedAt?: Date;
  };
  matchDerivedData: {
    documents: number;
    expectedUpcomingFixtures: number;
    missingUpcomingFixtures: number;
    coveragePercent: number;
    latestCalculatedAt?: Date;
  };
}

export interface MonitorExpectedWork {
  finishedFixturesMissingSummary: number;
  standingsMissingTeams: number;
  teamCompetitionStatsMissing: number;
  teamPerformanceProfilesMissing: number;
  upcomingFixturesMissingOdds: number;
  upcomingFixturesMissingDerivedData: number;
}

export type MonitorReadinessStatus = 'READY' | 'PARTIAL' | 'MISSING';

export interface MonitorUpcomingFixture {
  eventId: string;
  fixtureDate: Date;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  sources: {
    espnFixture: boolean;
    odds: boolean;
    oddsMatchable: boolean;
    homeTeamStats: boolean;
    awayTeamStats: boolean;
    homeProfile: boolean;
    awayProfile: boolean;
    headToHead: boolean;
    matchDerivedData: boolean;
  };
  status: MonitorReadinessStatus;
  missingSources: string[];
}

export interface MonitorUpcomingSummary {
  total: number;
  ready: number;
  partial: number;
  missing: number;
  withOdds: number;
  withDerivedData: number;
  missingDerivedData: number;
  nextFixtureDate?: Date;
  fixtures: MonitorUpcomingFixture[];
}

export interface MonitorPipelineDefinition {
  stages: string[];
  operations: Record<
    string,
    {
      source: 'ESPN' | 'ODDS_API' | 'YOUTUBE' | 'QUEUE' | 'APPLICATION';
      operation: string;
      conditional?: boolean;
      note?: string;
    }
  >;
  stateCounts: Record<string, number>;
}

export interface MonitorProviderSummary {
  provider: string;
  limits: {
    minIntervalSeconds: number;
    dailyRequestLimit: number | null;
    monthlyRequestLimit: number | null;
  };
  usage: {
    dailyRequests: number;
    monthlyRequests: number;
    remainingDailyRequests: number | null;
    remainingMonthlyRequests: number | null;
    dailyPeriod?: string;
    monthlyPeriod?: string;
    lastRequestAt?: Date;
    activeLocks: number;
  };
  endpoints: Array<{
    endpoint: string;
    dailyRequests: number;
    monthlyRequests: number;
    lastRequestAt?: Date;
    lockedUntil?: Date;
  }>;
  telemetry: {
    historicalRequestEventsAvailable: boolean;
    historicalRateByHourAvailable: boolean;
    historicalRateByLeagueAvailable: boolean;
    note: string;
  };
}

export interface MonitorInventory {
  activeCompetitions: number;
  espnCatalogue: number;
  espnFixtures: number;
  espnTeams: number;
  espnStandings: number;
  espnNews: number;
  espnQueue: number;
  sportsSyncStates: number;
  footballDataCompetitions: number;
  footballDataMatches: number;
  footballDataStandings: number;
  footballDataTeams: number;
  oddsApiSports: number;
  sportsOddsSnapshots: number;
  teamCompetitionStats: number;
  teamPerformanceProfiles: number;
  headToHeadPairs: number;
  matchDerivedData: number;
  youtubeHighlights: number;
}

export interface MonitorLeagueSummary {
  competitionId: string;
  espnLeagueSlug: string;
  name: string;
  type: string;
  region: string;
  priority: string;
  status: string;
  season?: number;
  seasonStartDate?: Date;
  seasonEndDate?: Date;
  nextFixtureDate?: Date;
  lastFixtureDate?: Date;
  catalogue: {
    exists: boolean;
    name?: string;
    country?: string;
    isActive?: boolean;
    isPriority?: boolean;
    lastSyncedAt?: Date;
    detailLastSyncedAt?: Date;
  };
  fixtures: MonitorFixtureSummary;
  teams: MonitorTeamSummary;
  standings: MonitorStandingSummary;
  news: MonitorNewsSummary;
  derivedData: MonitorDerivedSummary;
  upcoming: MonitorUpcomingSummary;
  queue: MonitorQueueSummary;
  sync: MonitorSyncSummary;
  expectedWork: MonitorExpectedWork;
}

export interface SportsSystemMonitorResponse {
  generatedAt: Date;
  scope: {
    activeLeagueFilter?: string;
    activeCompetitions: number;
    catalogueCompetitions: number;
    operationalSeasonScope: boolean;
  };
  inventory: MonitorInventory;
  queue: MonitorQueueSummary;
  sync: MonitorSyncSummary;
  pipeline: Record<string, MonitorPipelineDefinition>;
  providers: MonitorProviderSummary[];
  expectedWork: MonitorExpectedWork;
  leagues: MonitorLeagueSummary[];
  architectureNotes: {
    activeCompetitionSourceOfTruth: string;
    catalogueRole: string;
    fixtureSummaryLocation: string;
    queueHistoryWindow: string;
    syncProgressSource: string;
    providerTelemetryLimit: string;
    oddsMatchingLimit: string;
    h2hStorageModel: string;
  };
}
