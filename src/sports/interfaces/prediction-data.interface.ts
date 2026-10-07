import type { ActiveCompetitionStatus } from './active-competition.interface';
import type { EspnTeamDocument } from '../schemas/espn/espn-team.schema';

export interface SportsPredictionFixture {
  eventId: string;

  leagueId: string;

  season: number;

  fixtureDate: Date;

  live: boolean;

  completed?: boolean;

  homeTeamId: string;

  awayTeamId: string;

  collectedAt: Date;
}

export interface SportsPredictionSummary {
  predictor?: unknown;

  winprobability?: unknown;

  winProbability?: unknown;

  pickcenter?: unknown;

  odds?: unknown;
}

export interface SportsPredictionCompetition {
  competitionId: string;

  name: string;

  status: ActiveCompetitionStatus;

  season?: number;

  espnPayload?: Record<string, unknown>;
}

export interface SportsPredictionData {
  ready: boolean;

  reason: string | null;

  reasons: string[];

  /**
   * Only the fixture fields required by prediction calculation.
   *
   * The complete ESPN fixture document is intentionally not loaded here.
   */
  fixture: SportsPredictionFixture;

  /**
   * Only probability/odds Summary sections required by the prediction
   * calculation are returned. The full ESPN Summary is never loaded into
   * the prediction read contract.
   */
  summary: SportsPredictionSummary | null;

  competition: SportsPredictionCompetition | null;

  homeTeam: Pick<
    EspnTeamDocument,
    | 'teamId'
    | 'leagueId'
    | 'name'
    | 'displayName'
    | 'shortDisplayName'
    | 'logo'
    | 'collectedAt'
  > | null;

  awayTeam: Pick<
    EspnTeamDocument,
    | 'teamId'
    | 'leagueId'
    | 'name'
    | 'displayName'
    | 'shortDisplayName'
    | 'logo'
    | 'collectedAt'
  > | null;

  fixtureCollectedAt: Date;

  summaryCollectedAt: unknown;
}

export interface SportsSettlementData {
  fixture: import('../schemas/espn/espn-fixture.schema').EspnFixtureDocument;

  summary: Record<string, unknown> | null;

  summaryCollectedAt: unknown;
}
