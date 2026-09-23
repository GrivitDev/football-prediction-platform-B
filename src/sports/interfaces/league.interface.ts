import { CollectionFrequency } from '../enums/collection-frequency.enum';
import { CompetitionPriority } from '../enums/competition-priority.enum';
import { CompetitionRegion } from '../enums/competition-region.enum';
import { CompetitionType } from '../enums/competition-type.enum';
import { CompetitionProviderMapping } from './supported-competition-config.interface';

export interface SportsLeague {
  /**
   * ESPN league slug.
   */
  id: string;

  /**
   * ESPN competition name.
   */
  name: string;

  type: CompetitionType;

  region: CompetitionRegion;

  priority: CompetitionPriority;

  enabled: boolean;

  predictionEnabled: boolean;

  oddsEnabled: boolean;

  collectionFrequency: CollectionFrequency;

  providers: CompetitionProviderMapping;
}

export interface SportsMatchTeam {
  id: number | string;

  name: string;

  shortName?: string | null;

  logo?: string | null;
}

export interface SportsMatchScore {
  home: number | null;

  away: number | null;
}

export interface SportsMatch {
  /**
   * ESPN event ID.
   */
  id: number | string;

  /**
   * ESPN league slug.
   */
  competitionId: string;

  competitionName: string;

  season?: number | string | null;

  utcDate: string | Date;

  status: string;

  homeTeam: SportsMatchTeam;

  awayTeam: SportsMatchTeam;

  score?: SportsMatchScore | null;

  venue?: string | null;
}
