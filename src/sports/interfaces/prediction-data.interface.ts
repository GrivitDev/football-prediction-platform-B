import type { ActiveCompetitionDocument } from '../schemas/active-competition.schema';
import type { EspnFixtureDocument } from '../schemas/espn/espn-fixture.schema';
import type { EspnTeamDocument } from '../schemas/espn/espn-team.schema';

export interface SportsPredictionData {
  ready: boolean;

  reason: string | null;

  reasons: string[];

  fixture: EspnFixtureDocument;

  summary: Record<string, unknown> | null;

  competition: ActiveCompetitionDocument | null;

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
  fixture: EspnFixtureDocument;

  summary: Record<string, unknown> | null;

  summaryCollectedAt: unknown;
}
