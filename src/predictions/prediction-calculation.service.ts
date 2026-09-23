import { BadRequestException, Injectable } from '@nestjs/common';

import { MatchDerivedDataService } from '../sports/services/match-derived-data.service';
import { ActiveCompetitionService } from '../sports/services/active-competition.service';
import { SportsDataReadService } from '../sports/services/sports-data-read.service';

import { PredictionMarkets } from './constants/prediction-markets';

interface RequestedMarket {
  market: string;
  selection: string;
}

interface MarketCalculation {
  market: string;
  selection: string;
  probability: number;
}

export interface CalculatedPrediction {
  matchId: string;

  leagueCode: string;

  league?: {
    code: string;
    name: string;
    country: string;
    emblem?: string;
  };

  homeTeam: string;
  awayTeam: string;

  homeTeamBadge?: string;
  awayTeamBadge?: string;

  matchDate: string;
  kickoffTimestamp: number;

  prediction: 'HOME' | 'DRAW' | 'AWAY';

  probabilities: {
    home: number;
    draw: number;
    away: number;
  };

  confidence: number;

  markets: MarketCalculation[];
}

interface MatchDerivedLike {
  eventId: string;

  competitionId: string;

  season: number;

  fixtureDate: Date;

  homeTeamId: string;

  awayTeamId: string;

  homeTeamName: string;

  awayTeamName: string;

  exactScoreProbabilities?: Record<string, number>;

  marketProbabilities?: Record<string, number>;

  scoringFirstProbabilities?: Record<string, number>;

  dataCompletenessScore?: number;

  statisticalReliabilityScore?: number;

  homeTeamStats?: Record<string, unknown>;

  awayTeamStats?: Record<string, unknown>;

  homeProfile?: Record<string, unknown>;

  awayProfile?: Record<string, unknown>;

  headToHead?: Record<string, unknown>;
}

@Injectable()
export class PredictionCalculationService {
  constructor(
    private readonly matchDerivedDataService: MatchDerivedDataService,

    private readonly activeCompetitionService: ActiveCompetitionService,

    private readonly sportsDataReadService: SportsDataReadService,
  ) {}

  async calculate(
    matchId: string,
    requestedMarkets: RequestedMarket[],
  ): Promise<CalculatedPrediction> {
    const normalizedMatchId = matchId.trim();

    if (!normalizedMatchId) {
      throw new BadRequestException('matchId is required');
    }

    const markets = this.normalizeAndValidateRequestedMarkets(requestedMarkets);

    if (!markets.length) {
      throw new BadRequestException(
        'At least one prediction market is required',
      );
    }

    /**
     * Sports module is responsible for producing the
     * current derived match data.
     *
     * No independent prediction engine is created here.
     */
    const derived = (await this.matchDerivedDataService.rebuildForFixture(
      normalizedMatchId,
    )) as MatchDerivedLike | null;

    if (!derived) {
      throw new BadRequestException(
        'Sports data is not available for the selected match',
      );
    }

    const probabilities = this.calculateOverallProbabilities(derived);

    const calculatedMarkets = markets.map((market) =>
      this.calculateMarket(derived, market),
    );

    const prediction = this.getPrediction(probabilities);

    const confidence = this.calculateConfidence(
      derived,
      probabilities,
      calculatedMarkets,
    );

    const competition = await this.activeCompetitionService.getByCompetitionId(
      derived.competitionId,
    );

    const teams = await this.sportsDataReadService.getTeams(
      derived.competitionId,
    );

    const homeTeam = teams.find(
      (team: any) => String(team.teamId) === String(derived.homeTeamId),
    ) as any;

    const awayTeam = teams.find(
      (team: any) => String(team.teamId) === String(derived.awayTeamId),
    ) as any;

    const leagueCountry = this.extractLeagueCountry(competition?.espnPayload);

    const league = competition
      ? {
          code: derived.competitionId,
          name: competition.name,
          country: leagueCountry ?? '',
        }
      : undefined;

    return {
      matchId: derived.eventId,

      leagueCode: derived.competitionId,

      league,

      homeTeam: derived.homeTeamName,

      awayTeam: derived.awayTeamName,

      homeTeamBadge: homeTeam?.logo,

      awayTeamBadge: awayTeam?.logo,

      matchDate: derived.fixtureDate.toISOString(),

      kickoffTimestamp: derived.fixtureDate.getTime(),

      prediction,

      probabilities,

      confidence,

      markets: calculatedMarkets,
    };
  }

  private calculateMarket(
    derived: MatchDerivedLike,
    requested: RequestedMarket,
  ): MarketCalculation {
    const market = this.normalizeMarket(requested.market);

    const selection = this.normalizeSelection(requested.selection);

    const key = this.resolveMarketProbabilityKey(market, selection);

    if (key.startsWith('EXACT_SCORE:')) {
      const exactScore = key.slice('EXACT_SCORE:'.length);

      const probability = derived.exactScoreProbabilities?.[exactScore];

      if (typeof probability !== 'number') {
        throw new BadRequestException(
          `Probability is not available for ${market} ${requested.selection}`,
        );
      }

      return {
        market,
        selection,
        probability: this.toPercentage(probability),
      };
    }

    if (key.startsWith('SCORING_FIRST:')) {
      const first = key.slice('SCORING_FIRST:'.length);

      const probability = derived.scoringFirstProbabilities?.[first];

      if (typeof probability !== 'number') {
        throw new BadRequestException(
          `Probability is not available for ${market} ${requested.selection}`,
        );
      }

      return {
        market,
        selection,
        probability: this.toPercentage(probability),
      };
    }

    const probability = derived.marketProbabilities?.[key];

    if (typeof probability !== 'number') {
      throw new BadRequestException(
        `Probability is not available for ${market} ${requested.selection}`,
      );
    }

    return {
      market,
      selection,
      probability: this.toPercentage(probability),
    };
  }

  private calculateOverallProbabilities(derived: MatchDerivedLike) {
    const exact = derived.exactScoreProbabilities ?? {};

    let home = 0;
    let draw = 0;
    let away = 0;

    for (const [score, rawProbability] of Object.entries(exact)) {
      const [homeGoals, awayGoals] = score.split('-').map(Number);

      if (
        !Number.isFinite(homeGoals) ||
        !Number.isFinite(awayGoals) ||
        !Number.isFinite(rawProbability)
      ) {
        continue;
      }

      if (homeGoals > awayGoals) {
        home += rawProbability;
      } else if (homeGoals < awayGoals) {
        away += rawProbability;
      } else {
        draw += rawProbability;
      }
    }

    const total = home + draw + away;

    if (total <= 0) {
      throw new BadRequestException(
        'Sports data does not contain usable 1X2 probabilities',
      );
    }

    return {
      home: this.toPercentage(home / total),
      draw: this.toPercentage(draw / total),
      away: this.toPercentage(away / total),
    };
  }

  private calculateConfidence(
    derived: MatchDerivedLike,
    probabilities: {
      home: number;
      draw: number;
      away: number;
    },
    markets: MarketCalculation[],
  ): number {
    /**
     * Do NOT use Sports overallDataQualityScore here because
     * that Sports score contains bookmaker-data quality.
     *
     * This website does not use bookmaker information.
     */
    const dataCompleteness = this.numberOrZero(derived.dataCompletenessScore);

    const derivedStatisticalReliability = this.numberOrZero(
      derived.statisticalReliabilityScore,
    );

    const dataQuality =
      dataCompleteness * 0.55 + derivedStatisticalReliability * 0.45;

    const statisticalReliability = this.calculateTeamReliability(derived);

    const h2hReliability = this.calculateH2HReliability(derived);

    const predictionClarity = this.calculatePredictionClarity(probabilities);

    const marketSupport = this.calculateMarketSupport(markets);

    const confidence =
      dataQuality * 0.32 +
      statisticalReliability * 0.25 +
      h2hReliability * 0.08 +
      predictionClarity * 0.2 +
      marketSupport * 0.15;

    return Math.max(1, Math.min(98, Math.round(confidence)));
  }

  private calculateTeamReliability(derived: MatchDerivedLike): number {
    const values: number[] = [];

    for (const source of [derived.homeTeamStats, derived.awayTeamStats]) {
      const value = this.numberFromRecord(source, [
        'statsReliabilityScore',
        'statisticalReliabilityScore',
        'dataCompletenessScore',
      ]);

      if (value !== null) {
        values.push(value);
      }
    }

    for (const source of [derived.homeProfile, derived.awayProfile]) {
      const value = this.numberFromRecord(source, [
        'profileReliabilityScore',
        'statisticalSampleScore',
        'dataCompletenessScore',
      ]);

      if (value !== null) {
        values.push(value);
      }
    }

    if (!values.length) {
      return this.numberOrZero(derived.statisticalReliabilityScore);
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private calculateH2HReliability(derived: MatchDerivedLike): number {
    const h2h = derived.headToHead;

    if (!h2h) {
      return 50;
    }

    const values = [
      this.numberFromRecord(h2h, ['sampleReliabilityScore']),
      this.numberFromRecord(h2h, ['dataCompletenessScore']),
    ].filter((value): value is number => value !== null);

    if (!values.length) {
      return 50;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private calculatePredictionClarity(probabilities: {
    home: number;
    draw: number;
    away: number;
  }): number {
    const ordered = [
      probabilities.home,
      probabilities.draw,
      probabilities.away,
    ].sort((a, b) => b - a);

    const margin = ordered[0] - ordered[1];

    return Math.max(0, Math.min(100, 50 + margin * 1.5));
  }

  private calculateMarketSupport(markets: MarketCalculation[]): number {
    if (!markets.length) {
      return 50;
    }

    const support = markets.reduce(
      (sum, market) => sum + market.probability,
      0,
    );

    return Math.max(0, Math.min(100, support / markets.length));
  }

  private resolveMarketProbabilityKey(
    market: string,
    selection: string,
  ): string {
    switch (market) {
      case PredictionMarkets.DOUBLE_CHANCE:
        return this.resolveDoubleChance(selection);

      case PredictionMarkets.DRAW_NO_BET:
        if (selection === 'HOME') {
          return 'DRAW_NO_BET_HOME';
        }

        if (selection === 'AWAY') {
          return 'DRAW_NO_BET_AWAY';
        }

        break;

      case PredictionMarkets.OVER_UNDER:
        return this.resolveOverUnder(selection);

      case PredictionMarkets.BOTH_TEAMS_TO_SCORE:
        if (selection === 'YES') {
          return 'BOTH_TEAMS_TO_SCORE_YES';
        }

        if (selection === 'NO') {
          return 'BOTH_TEAMS_TO_SCORE_NO';
        }

        break;

      case PredictionMarkets.GOAL_RANGE:
        return this.resolveGoalRange(selection);

      case PredictionMarkets.TEAM_TOTAL_GOALS:
        return this.resolveTeamTotalGoals(selection);

      case PredictionMarkets.EXACT_GOALS:
        return this.resolveExactGoals(selection);

      case PredictionMarkets.CLEAN_SHEET:
        if (selection === 'HOME') {
          return 'CLEAN_SHEET_HOME';
        }

        if (selection === 'AWAY') {
          return 'CLEAN_SHEET_AWAY';
        }

        break;

      case PredictionMarkets.HALF_TIME_RESULT:
        return this.resolveResultKey(selection, 'FIRST_HALF');

      case PredictionMarkets.SECOND_HALF_RESULT:
        return this.resolveResultKey(selection, 'SECOND_HALF');

      case PredictionMarkets.HALF_TIME_FULL_TIME:
        return `HALF_TIME_FULL_TIME_${this.resolveHalfTimeFullTimeSelection(
          selection,
        )}`;

      case PredictionMarkets.FIRST_HALF_GOALS:
        return this.resolveHalfGoals(selection, 'FIRST_HALF_GOALS');

      case PredictionMarkets.SECOND_HALF_GOALS:
        return this.resolveHalfGoals(selection, 'SECOND_HALF_GOALS');

      case PredictionMarkets.ASIAN_HANDICAP:
        return this.resolveAsianHandicap(selection);

      case PredictionMarkets.EUROPEAN_HANDICAP:
        return this.resolveEuropeanHandicap(selection);

      case PredictionMarkets.CORRECT_SCORE:
        if (/^\d+-\d+$/.test(selection)) {
          return `EXACT_SCORE:${selection}`;
        }

        break;

      case PredictionMarkets.FIRST_GOAL:
        if (selection === 'HOME') {
          return 'SCORING_FIRST:HOME';
        }

        if (selection === 'AWAY') {
          return 'SCORING_FIRST:AWAY';
        }

        if (selection === 'NONE' || selection === 'NO_GOAL') {
          return 'SCORING_FIRST:NONE';
        }

        break;

      default:
        break;
    }

    throw new BadRequestException(
      `Unsupported market selection: ${market} ${selection}`,
    );
  }

  private resolveDoubleChance(selection: string): string {
    const normalized = selection.replace(/-/g, '_');

    if (['HOME_OR_DRAW', 'HOME_DRAW', '1X'].includes(normalized)) {
      return 'DOUBLE_CHANCE_HOME_OR_DRAW';
    }

    if (['AWAY_OR_DRAW', 'AWAY_DRAW', 'X2'].includes(normalized)) {
      return 'DOUBLE_CHANCE_AWAY_OR_DRAW';
    }

    if (['HOME_OR_AWAY', 'HOME_AWAY', '12'].includes(normalized)) {
      return 'DOUBLE_CHANCE_HOME_OR_AWAY';
    }

    throw new BadRequestException(
      `Invalid DOUBLE_CHANCE selection: ${selection}`,
    );
  }

  private resolveOverUnder(selection: string): string {
    const match = selection.match(
      /^(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5|4\.5|5\.5)$/,
    );

    if (!match) {
      throw new BadRequestException(
        `Invalid OVER_UNDER selection: ${selection}`,
      );
    }

    return `OVER_UNDER_${match[1]}_${match[2]}`;
  }

  private resolveGoalRange(selection: string): string {
    const normalized = selection.replace(/_/g, '-');

    if (normalized === '0') {
      return 'GOAL_RANGE_0';
    }

    if (normalized === '1-2') {
      return 'GOAL_RANGE_1_2';
    }

    if (normalized === '3-4') {
      return 'GOAL_RANGE_3_4';
    }

    if (normalized === '5+') {
      return 'GOAL_RANGE_5_PLUS';
    }

    throw new BadRequestException(`Invalid GOAL_RANGE selection: ${selection}`);
  }

  private resolveTeamTotalGoals(selection: string): string {
    const match = selection.match(
      /^(HOME|AWAY)_(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5)$/,
    );

    if (!match) {
      throw new BadRequestException(
        `Invalid TEAM_TOTAL_GOALS selection: ${selection}`,
      );
    }

    return `TEAM_TOTAL_${match[1]}_${match[2]}_${match[3]}`;
  }

  private resolveExactGoals(selection: string): string {
    const match = selection.match(/^(HOME|AWAY)_(0|1|2|3|4|5|6)$/);

    if (!match) {
      throw new BadRequestException(
        `Invalid EXACT_GOALS selection: ${selection}`,
      );
    }

    return `EXACT_GOALS_${match[1]}_${match[2]}`;
  }

  private resolveResultKey(
    selection: string,
    prefix: 'FIRST_HALF' | 'SECOND_HALF',
  ): string {
    if (!['HOME', 'DRAW', 'AWAY'].includes(selection)) {
      throw new BadRequestException(`Invalid result selection: ${selection}`);
    }

    return `${prefix}_${selection}`;
  }

  private resolveHalfTimeFullTimeSelection(selection: string): string {
    if (!/^(HOME|DRAW|AWAY)_(HOME|DRAW|AWAY)$/.test(selection)) {
      throw new BadRequestException(
        `Invalid HALF_TIME_FULL_TIME selection: ${selection}`,
      );
    }

    return selection;
  }

  private resolveHalfGoals(
    selection: string,
    prefix: 'FIRST_HALF_GOALS' | 'SECOND_HALF_GOALS',
  ): string {
    const match = selection.match(/^(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5)$/);

    if (!match) {
      throw new BadRequestException(
        `Invalid half-goals selection: ${selection}`,
      );
    }

    return `${prefix}_${match[1]}_${match[2]}`;
  }

  private resolveAsianHandicap(selection: string): string {
    const match = selection.match(
      /^(HOME|AWAY)_(-?\d+(?:\.\d+)?)_(WIN|PUSH|LOSE)$/,
    );

    if (!match) {
      throw new BadRequestException(
        `Invalid ASIAN_HANDICAP selection: ${selection}`,
      );
    }

    return `ASIAN_HANDICAP_${match[1]}_${match[2]}_${match[3]}`;
  }

  private resolveEuropeanHandicap(selection: string): string {
    const winMatch = selection.match(/^(HOME|AWAY)_(-?\d+)_WIN$/);

    if (winMatch) {
      return `EUROPEAN_HANDICAP_${winMatch[1]}_${winMatch[2]}_WIN`;
    }

    const drawMatch = selection.match(/^DRAW_(-?\d+)$/);

    if (drawMatch) {
      return `EUROPEAN_HANDICAP_DRAW_${drawMatch[1]}`;
    }

    throw new BadRequestException(
      `Invalid EUROPEAN_HANDICAP selection: ${selection}`,
    );
  }

  private normalizeAndValidateRequestedMarkets(
    markets: RequestedMarket[],
  ): RequestedMarket[] {
    if (!Array.isArray(markets)) {
      return [];
    }

    const normalized = markets.map((item) => ({
      market: this.normalizeMarket(item?.market),
      selection: this.normalizeSelection(item?.selection),
    }));

    if (normalized.some((item) => !item.market || !item.selection)) {
      throw new BadRequestException('Every market requires a selection');
    }

    const seen = new Set<string>();

    for (const item of normalized) {
      const key = `${item.market}:${item.selection}`;

      if (seen.has(key)) {
        throw new BadRequestException(
          `Duplicate prediction market: ${item.market} ${item.selection}`,
        );
      }

      seen.add(key);
    }

    return normalized;
  }

  private extractLeagueCountry(
    payload: Record<string, unknown> | undefined,
  ): string | undefined {
    if (!payload) {
      return undefined;
    }

    const country = payload['country'];

    if (typeof country === 'string' && country.trim()) {
      return country.trim();
    }

    if (country && typeof country === 'object' && !Array.isArray(country)) {
      const record = country as Record<string, unknown>;

      for (const key of ['name', 'displayName', 'abbreviation']) {
        const value = record[key];

        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    return undefined;
  }

  private normalizeMarket(value: string): string {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private normalizeSelection(value: string): string {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private getPrediction(probabilities: {
    home: number;
    draw: number;
    away: number;
  }): 'HOME' | 'DRAW' | 'AWAY' {
    const entries: Array<['HOME' | 'DRAW' | 'AWAY', number]> = [
      ['HOME', probabilities.home],
      ['DRAW', probabilities.draw],
      ['AWAY', probabilities.away],
    ];

    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  private numberFromRecord(
    source: Record<string, unknown> | undefined,
    fields: string[],
  ): number | null {
    if (!source) {
      return null;
    }

    for (const field of fields) {
      const value = source[field];

      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  private numberOrZero(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private toPercentage(probability: number): number {
    const value = probability <= 1 ? probability * 100 : probability;

    return Number(Math.max(0, Math.min(100, value)).toFixed(2));
  }
}
