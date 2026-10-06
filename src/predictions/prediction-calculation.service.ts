import { BadRequestException, Injectable } from '@nestjs/common';

import { SportsDataReadService } from '../sports/services/sports-data-read.service';
import type { SportsPredictionData } from '../sports/interfaces/prediction-data.interface';

import type {
  PredictionProbabilitySource,
  PredictionOddsSource,
} from './schemas/prediction.schema';

import {
  PredictionMarkets,
  type PredictionMarket,
} from './constants/prediction-markets';

interface RequestedMarket {
  market: string;
  selection: string;
}

interface MarketCalculation {
  market: PredictionMarket;
  selection: string;
  probability: number;
  probabilitySource: PredictionProbabilitySource;
  odds?: number;
  fairOdds: number;
  oddsSource?: PredictionOddsSource;
  status: 'pending';
}

interface SummaryPayload {
  [key: string]: unknown;
}

interface ThreeWayProbability {
  home: number;
  draw: number;
  away: number;
}

interface OddsMatch {
  odds: number;
  source: PredictionOddsSource;
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

  /** The exact market and selection chosen by the administrator. */
  prediction: {
    market: PredictionMarket;
    selection: string;
  };

  /** Probability supporting the administrator's exact primary selection. */
  predictionProbability: number;

  probabilitySource: PredictionProbabilitySource;

  /** Support confidence, not outcome accuracy. */
  confidence: number;

  predictionOdds?: number;
  predictionFairOdds: number;
  predictionOddsSource?: PredictionOddsSource;

  sportsDataSnapshot: {
    fixtureCollectedAt: Date;
    summaryCollectedAt: Date;
  };

  modelVersion: string;

  calculatedAt: Date;

  markets: MarketCalculation[];
}

const PREDICTION_SUPPORT_ENGINE_VERSION = 'prediction-support-engine-1.0';

@Injectable()
export class PredictionCalculationService {
  constructor(private readonly sportsDataReadService: SportsDataReadService) {}

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

    /*
     * SportsDataReadService owns fixture/Summary readiness.
     *
     * The Summary check is deliberately performed before any prediction
     * interpretation or probability work.
     */
    const predictionData =
      await this.sportsDataReadService.getPredictionData(normalizedMatchId);

    if (!predictionData) {
      throw new BadRequestException(
        'Sports data is not available for the selected match',
      );
    }

    if (!predictionData.summary) {
      throw new BadRequestException(
        'ESPN Summary is not available for the selected match. Wait for Summary collection before calculating this prediction.',
      );
    }

    if (!predictionData.ready) {
      throw new BadRequestException(
        `Match is not prediction-ready: ${
          predictionData.reason ?? 'SPORTS_DATA_NOT_READY'
        }`,
      );
    }

    const fixture = predictionData.fixture;
    const summary = predictionData.summary as SummaryPayload;

    /*
     * The first selected market is the primary prediction only because the
     * Prediction document needs one canonical selection to display.
     *
     * The engine does not decide which market or selection is better.
     */
    const primary = markets[0];

    const calculatedMarkets = await Promise.all(
      markets.map((market) =>
        this.calculateMarketSupport(
          market,
          summary,
          fixture.homeTeamId,
          fixture.awayTeamId,
          fixture.eventId,
        ),
      ),
    );

    const primaryResult = calculatedMarkets[0];

    const confidence = this.calculateSupportConfidence(calculatedMarkets);

    const predictionOdds = primaryResult.odds;
    const predictionFairOdds = primaryResult.fairOdds;
    const predictionOddsSource = primaryResult.oddsSource;

    const homeTeamName =
      this.toString(predictionData.homeTeam?.displayName) ??
      this.toString(predictionData.homeTeam?.name) ??
      this.extractFixtureTeamName(fixture, 'home') ??
      'Home';

    const awayTeamName =
      this.toString(predictionData.awayTeam?.displayName) ??
      this.toString(predictionData.awayTeam?.name) ??
      this.extractFixtureTeamName(fixture, 'away') ??
      'Away';

    const homeTeamBadge =
      this.toString(predictionData.homeTeam?.logo) ??
      this.extractFixtureTeamLogo(fixture, 'home');

    const awayTeamBadge =
      this.toString(predictionData.awayTeam?.logo) ??
      this.extractFixtureTeamLogo(fixture, 'away');

    const league = predictionData.competition
      ? {
          code: fixture.leagueId,
          name: predictionData.competition.name,
          country:
            this.extractLeagueCountry(predictionData.competition.espnPayload) ??
            '',
          emblem: this.extractLeagueEmblem(
            predictionData.competition.espnPayload,
          ),
        }
      : undefined;

    const fixtureCollectedAt = new Date(predictionData.fixtureCollectedAt);
    const summaryCollectedAt = new Date(
      String(predictionData.summaryCollectedAt),
    );

    if (
      !Number.isFinite(fixtureCollectedAt.getTime()) ||
      !Number.isFinite(summaryCollectedAt.getTime())
    ) {
      throw new BadRequestException(
        'Sports data snapshot timestamps are invalid',
      );
    }

    return {
      matchId: fixture.eventId,
      leagueCode: fixture.leagueId,
      league,
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeTeamBadge,
      awayTeamBadge,
      matchDate: fixture.fixtureDate.toISOString(),
      kickoffTimestamp: fixture.fixtureDate.getTime(),

      prediction: {
        market: this.normalizeMarket(primary.market),
        selection: primary.selection,
      },

      predictionProbability: primaryResult.probability,
      probabilitySource: primaryResult.probabilitySource,

      confidence,

      predictionOdds,
      predictionFairOdds,
      predictionOddsSource,

      sportsDataSnapshot: {
        fixtureCollectedAt,
        summaryCollectedAt,
      },

      modelVersion: PREDICTION_SUPPORT_ENGINE_VERSION,
      calculatedAt: new Date(),
      markets: calculatedMarkets,
    };
  }

  private async calculateMarketSupport(
    requested: RequestedMarket,
    summary: SummaryPayload,
    homeTeamId: string,
    awayTeamId: string,
    eventId: string,
  ): Promise<MarketCalculation> {
    const market = this.normalizeMarket(requested.market);
    const selection = this.normalizeSelection(requested.selection);

    const directProbability = this.resolveDirectMarketProbability(
      summary,
      market,
      selection,
      homeTeamId,
      awayTeamId,
    );

    if (directProbability !== undefined) {
      const oddsMatch =
        this.resolveSummaryMarketOdds(summary, market, selection) ??
        (await this.resolveStoredOdds(eventId, market, selection));

      return {
        market,
        selection,
        probability: this.roundProbability(directProbability),
        probabilitySource: 'ESPN_PROBABILITY',
        odds: oddsMatch?.odds,
        fairOdds: this.calculateFairOdds(directProbability),
        oddsSource: oddsMatch?.source,
        status: 'pending',
      };
    }

    const oddsMatch =
      this.resolveSummaryMarketOdds(summary, market, selection) ??
      (await this.resolveStoredOdds(eventId, market, selection));

    if (!oddsMatch) {
      throw new BadRequestException(
        `Sports data does not currently provide direct probability or odds support for ${market} ${requested.selection}`,
      );
    }

    const impliedProbability = 100 / oddsMatch.odds;

    if (!Number.isFinite(impliedProbability) || impliedProbability <= 0) {
      throw new BadRequestException(
        `Sports data returned an unusable price for ${market} ${requested.selection}`,
      );
    }

    return {
      market,
      selection,
      probability: this.roundProbability(impliedProbability),
      probabilitySource:
        oddsMatch.source === 'ESPN' ? 'IMPLIED_ESPN_ODDS' : 'IMPLIED_ODDS_API',
      odds: oddsMatch.odds,
      fairOdds: this.calculateFairOdds(impliedProbability),
      oddsSource: oddsMatch.source,
      status: 'pending',
    };
  }

  /**
   * Uses probability information already present in ESPN Summary.
   *
   * No expected goals, form modifiers, Poisson model, synthetic team
   * strength score, or other generated football data is introduced here.
   */
  private resolveDirectMarketProbability(
    summary: SummaryPayload,
    market: PredictionMarket,
    selection: string,
    homeTeamId: string,
    awayTeamId: string,
  ): number | undefined {
    const resultProbabilities = this.extractResultProbabilities(
      summary,
      homeTeamId,
      awayTeamId,
    );

    if (resultProbabilities) {
      switch (market) {
        case PredictionMarkets.DOUBLE_CHANCE:
          return this.resolveDoubleChance(resultProbabilities, selection);

        case PredictionMarkets.DRAW_NO_BET:
          return this.resolveDrawNoBet(resultProbabilities, selection);

        case PredictionMarkets.CORRECT_SCORE:
        case PredictionMarkets.OVER_UNDER:
        case PredictionMarkets.BOTH_TEAMS_TO_SCORE:
        case PredictionMarkets.BTTS_GOALS:
        case PredictionMarkets.GOAL_RANGE:
        case PredictionMarkets.TEAM_TOTAL_GOALS:
        case PredictionMarkets.EXACT_GOALS:
        case PredictionMarkets.CLEAN_SHEET:
        case PredictionMarkets.HALF_TIME_RESULT:
        case PredictionMarkets.SECOND_HALF_RESULT:
        case PredictionMarkets.HALF_TIME_FULL_TIME:
        case PredictionMarkets.ASIAN_HANDICAP:
        case PredictionMarkets.EUROPEAN_HANDICAP:
        case PredictionMarkets.CORNERS_TOTAL:
        case PredictionMarkets.TEAM_CORNERS:
        case PredictionMarkets.CORNER_HANDICAP:
        case PredictionMarkets.CARDS_TOTAL:
        case PredictionMarkets.TEAM_CARDS:
        case PredictionMarkets.CARD_HANDICAP:
        case PredictionMarkets.FIRST_GOAL:
        case PredictionMarkets.LAST_GOAL:
        case PredictionMarkets.WIN_TO_NIL:
        case PredictionMarkets.POSSESSION_WINNER:
        case PredictionMarkets.MOST_SHOTS:
        case PredictionMarkets.MOST_SHOTS_ON_TARGET:
        case PredictionMarkets.GOAL_TIMING:
        case PredictionMarkets.OFFSIDES_TOTAL:
        case PredictionMarkets.TEAM_OFFSIDES:
        case PredictionMarkets.FOULS_TOTAL:
        case PredictionMarkets.TEAM_FOULS:
        case PredictionMarkets.FIRST_HALF_GOALS:
        case PredictionMarkets.SECOND_HALF_GOALS:
        case PredictionMarkets.FIRST_HALF_CORNERS:
        case PredictionMarkets.FIRST_HALF_CARDS:
          break;

        default:
          break;
      }
    }

    /*
     * ESPN can expose market-specific probability objects in additional
     * Summary fields. Search those fields generically for an exact
     * selection probability before falling back to odds.
     */
    return this.findSelectionProbability(summary, market, selection, new Set());
  }

  private resolveMatchResult(
    probabilities: ThreeWayProbability,
    selection: string,
  ): number | undefined {
    switch (selection) {
      case 'HOME':
        return probabilities.home;

      case 'DRAW':
        return probabilities.draw;

      case 'AWAY':
        return probabilities.away;

      default:
        return undefined;
    }
  }

  private resolveDoubleChance(
    probabilities: ThreeWayProbability,
    selection: string,
  ): number | undefined {
    switch (selection) {
      case '1X':
      case 'HOME_OR_DRAW':
      case 'HOME_DRAW':
        return probabilities.home + probabilities.draw;

      case 'X2':
      case 'AWAY_OR_DRAW':
      case 'AWAY_DRAW':
        return probabilities.draw + probabilities.away;

      case '12':
      case 'HOME_OR_AWAY':
      case 'HOME_AWAY':
        return probabilities.home + probabilities.away;

      default:
        return undefined;
    }
  }

  private resolveDrawNoBet(
    probabilities: ThreeWayProbability,
    selection: string,
  ): number | undefined {
    if (selection !== 'HOME' && selection !== 'AWAY') {
      return undefined;
    }

    const side = selection === 'HOME' ? probabilities.home : probabilities.away;
    const nonDraw = probabilities.home + probabilities.away;

    return nonDraw > 0 ? (side / nonDraw) * 100 : undefined;
  }

  private extractResultProbabilities(
    summary: SummaryPayload,
    homeTeamId: string,
    awayTeamId: string,
  ): ThreeWayProbability | undefined {
    const sources = [
      summary.predictor,
      summary.winprobability,
      summary.winProbability,
      summary.pickcenter,
    ].filter(Boolean);

    let home: number | undefined;
    let draw: number | undefined;
    let away: number | undefined;

    for (const source of sources) {
      const found = this.searchThreeWayProbability(
        source,
        homeTeamId,
        awayTeamId,
      );

      home = home ?? found?.home;
      draw = draw ?? found?.draw;
      away = away ?? found?.away;

      if (home !== undefined && draw !== undefined && away !== undefined) {
        break;
      }
    }

    if (home === undefined || draw === undefined || away === undefined) {
      return undefined;
    }

    const total = home + draw + away;

    if (total <= 0) {
      return undefined;
    }

    /*
     * These are the provider probabilities. We only normalize them so the
     * three-way percentages remain internally consistent when ESPN supplies
     * rounded values.
     */
    return {
      home: (home / total) * 100,
      draw: (draw / total) * 100,
      away: (away / total) * 100,
    };
  }

  private searchThreeWayProbability(
    value: unknown,
    homeTeamId: string,
    awayTeamId: string,
  ): Partial<ThreeWayProbability> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    if (Array.isArray(value)) {
      let result: Partial<ThreeWayProbability> = {};

      for (const item of value) {
        const nested = this.searchThreeWayProbability(
          item,
          homeTeamId,
          awayTeamId,
        );

        result = {
          home: result.home ?? nested.home,
          draw: result.draw ?? nested.draw,
          away: result.away ?? nested.away,
        };

        if (
          result.home !== undefined &&
          result.draw !== undefined &&
          result.away !== undefined
        ) {
          return result;
        }
      }

      return result;
    }

    const record = value as Record<string, unknown>;

    const recordHomeId = this.toString(
      record.homeTeamId ?? this.asRecord(record.homeTeam)?.id,
    );

    const recordAwayId = this.toString(
      record.awayTeamId ?? this.asRecord(record.awayTeam)?.id,
    );

    const homeValue =
      recordHomeId === homeTeamId
        ? this.getProbabilityValue(
            this.findNumericProperty(record, [
              'homeWinPercentage',
              'homeWinProbability',
              'homeChance',
              'homeTeamChance',
              'home',
              'homeWin',
              'teamChanceWin',
              'gameProjection',
            ]),
          )
        : undefined;

    const awayValue =
      recordAwayId === awayTeamId
        ? this.getProbabilityValue(
            this.findNumericProperty(record, [
              'awayWinPercentage',
              'awayWinProbability',
              'awayChance',
              'awayTeamChance',
              'away',
              'awayWin',
              'teamChanceWin',
            ]),
          )
        : undefined;

    const drawValue = this.getProbabilityValue(
      this.findNumericProperty(record, [
        'drawPercentage',
        'drawProbability',
        'drawChance',
        'tiePercentage',
        'tieProbability',
        'teamChanceTie',
        'draw',
      ]),
    );

    if (
      homeValue !== undefined ||
      awayValue !== undefined ||
      drawValue !== undefined
    ) {
      return {
        home: homeValue,
        draw: drawValue,
        away: awayValue,
      };
    }

    let result: Partial<ThreeWayProbability> = {};

    for (const child of Object.values(record)) {
      if (!child || typeof child !== 'object') {
        continue;
      }

      const nested = this.searchThreeWayProbability(
        child,
        homeTeamId,
        awayTeamId,
      );

      result = {
        home: result.home ?? nested.home,
        draw: result.draw ?? nested.draw,
        away: result.away ?? nested.away,
      };

      if (
        result.home !== undefined &&
        result.draw !== undefined &&
        result.away !== undefined
      ) {
        return result;
      }
    }

    return result;
  }

  private findSelectionProbability(
    value: unknown,
    market: PredictionMarket,
    selection: string,
    visited: Set<object>,
    depth = 0,
  ): number | undefined {
    if (depth > 8 || value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'object') {
      if (visited.has(value)) {
        return undefined;
      }

      visited.add(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findSelectionProbability(
          item,
          market,
          selection,
          visited,
          depth + 1,
        );

        if (found !== undefined) {
          return found;
        }
      }

      return undefined;
    }

    if (typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const context = this.normalizeContext(
      [
        market,
        selection,
        record.market,
        record.marketName,
        record.name,
        record.label,
        record.description,
        record.details,
        record.selection,
        record.outcome,
      ]
        .map((item) => this.toString(item) ?? '')
        .join(' '),
    );

    const probabilityKeys = [
      'probability',
      'percentage',
      'probabilityPercentage',
      'winProbability',
      'chance',
      'chancePercentage',
      'likelihood',
    ];

    const hasSelectionContext =
      context.includes(this.normalizeContext(selection)) ||
      context.includes(this.normalizeContext(this.prettySelection(selection)));

    if (hasSelectionContext) {
      for (const key of probabilityKeys) {
        const candidate = this.getProbabilityValue(record[key]);

        if (candidate !== undefined) {
          return candidate;
        }
      }
    }

    for (const child of Object.values(record)) {
      if (!child || typeof child !== 'object') {
        continue;
      }

      const found = this.findSelectionProbability(
        child,
        market,
        selection,
        visited,
        depth + 1,
      );

      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  private resolveSummaryMarketOdds(
    summary: SummaryPayload,
    market: PredictionMarket,
    selection: string,
  ): OddsMatch | undefined {
    const records = this.getSummaryOddsRecords(summary);

    /*
     * Pick Center is part of Summary and commonly contains the same core
     * moneyline/total pricing as `odds`.
     */
    const pickcenterRecords = Array.isArray(summary.pickcenter)
      ? summary.pickcenter.filter(this.isRecord)
      : [];

    for (const record of [...records, ...pickcenterRecords]) {
      const exact = this.resolveOddsFromRecord(record, market, selection);

      if (exact !== undefined) {
        return {
          odds: exact,
          source: 'ESPN',
        };
      }
    }

    return undefined;
  }

  private resolveOddsFromRecord(
    record: Record<string, unknown>,
    market: PredictionMarket,
    selection: string,
  ): number | undefined {
    const tokens = this.selectionTokens(selection);
    const line = this.extractSelectionLine(selection);

    const moneyline = this.asRecord(record.moneyline);
    const homeTeamOdds = this.asRecord(record.homeTeamOdds);
    const awayTeamOdds = this.asRecord(record.awayTeamOdds);

    const isHome = selection === 'HOME';
    const isAway = selection === 'AWAY';
    const isDraw = selection === 'DRAW' || selection === 'X';

    const resultMarkets = new Set<PredictionMarket>([
      PredictionMarkets.DRAW_NO_BET,
      PredictionMarkets.HALF_TIME_RESULT,
      PredictionMarkets.SECOND_HALF_RESULT,
    ]);

    if (resultMarkets.has(market)) {
      const moneylineValue = isHome
        ? (moneyline?.home ?? homeTeamOdds?.moneyLine)
        : isAway
          ? (moneyline?.away ?? awayTeamOdds?.moneyLine)
          : isDraw
            ? moneyline?.draw
            : undefined;

      const convertedMoneyline = this.toDecimalOdds(moneylineValue);

      if (convertedMoneyline !== undefined) {
        return convertedMoneyline;
      }
    }

    const recordLine = this.toNumber(
      record.overUnder ?? record.total ?? record.line,
    );

    if (
      line !== undefined &&
      recordLine !== null &&
      Number(recordLine) !== Number(line)
    ) {
      return undefined;
    }

    const sideKeys = [
      this.normalizeContext(selection),
      ...tokens.map((token) => this.normalizeContext(token)),
    ].filter(Boolean);

    const directKeys = [
      'odds',
      'price',
      'decimalOdds',
      'americanOdds',
      'moneyLine',
      'spreadOdds',
      'totalOdds',
      'overOdds',
      'underOdds',
      'yesOdds',
      'noOdds',
    ];

    for (const [key, child] of Object.entries(record)) {
      const normalizedKey = this.normalizeContext(key);

      const direct = this.toDecimalOdds(child);

      if (
        direct !== undefined &&
        sideKeys.some(
          (side) =>
            normalizedKey.includes(side) || side.includes(normalizedKey),
        )
      ) {
        return direct;
      }
    }

    for (const key of directKeys) {
      const candidate = this.toDecimalOdds(record[key]);

      if (candidate === undefined) {
        continue;
      }

      if (key === 'overOdds' && !selection.startsWith('OVER_')) {
        continue;
      }

      if (key === 'underOdds' && !selection.startsWith('UNDER_')) {
        continue;
      }

      return candidate;
    }

    return this.findOddsByContext(record, tokens, line, '', 0);
  }

  private async resolveStoredOdds(
    eventId: string,
    market: PredictionMarket,
    selection: string,
  ): Promise<OddsMatch | undefined> {
    const snapshots = await this.sportsDataReadService.getOddsForEvent(eventId);

    if (!Array.isArray(snapshots)) {
      return undefined;
    }

    for (const snapshot of snapshots) {
      const payload =
        snapshot && typeof snapshot === 'object' && 'payload' in snapshot
          ? (snapshot as Record<string, unknown>).payload
          : snapshot;

      const found = this.findOddsByContext(
        payload,
        this.selectionTokens(selection),
        this.extractSelectionLine(selection),
      );

      if (found !== undefined) {
        return {
          odds: found,
          source: 'ODDS_API',
        };
      }
    }

    return undefined;
  }

  private findOddsByContext(
    value: unknown,
    tokens: string[],
    line?: number,
    context = '',
    depth = 0,
  ): number | undefined {
    if (depth > 8 || value === null || value === undefined) {
      return undefined;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findOddsByContext(
          item,
          tokens,
          line,
          context,
          depth + 1,
        );

        if (found !== undefined) {
          return found;
        }
      }

      return undefined;
    }

    if (typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;

    const nextContext = this.normalizeContext(
      `${context} ${Object.keys(record).join(' ')} ${tokens.join(
        ' ',
      )} ${Object.values(record)
        .filter((item) => typeof item === 'string')
        .join(' ')}`,
    );

    const recordLine = this.toNumber(
      record.point ?? record.overUnder ?? record.total ?? record.line,
    );

    const lineMatches =
      line === undefined ||
      recordLine === null ||
      Number(recordLine) === Number(line);

    if (lineMatches) {
      const namedOutcome = this.toString(
        record.name ?? record.description ?? record.outcome ?? record.label,
      );

      const normalizedOutcome = this.normalizeContext(namedOutcome ?? '');

      const tokenMatches = tokens.some((token) => {
        const normalizedToken = this.normalizeContext(token);

        return (
          normalizedOutcome.includes(normalizedToken) ||
          nextContext.includes(normalizedToken)
        );
      });

      if (tokenMatches) {
        const candidate =
          record.price ?? record.odds ?? record.decimalOdds ?? record.value;

        const odds = this.toDecimalOdds(candidate);

        if (odds !== undefined) {
          return odds;
        }
      }
    }

    for (const [key, child] of Object.entries(record)) {
      if (!child || typeof child !== 'object') {
        continue;
      }

      const found = this.findOddsByContext(
        child,
        tokens,
        line,
        `${context} ${key}`,
        depth + 1,
      );

      if (found !== undefined) {
        return found;
      }
    }

    return undefined;
  }

  private getSummaryOddsRecords(
    summary: SummaryPayload,
  ): Record<string, unknown>[] {
    if (!Array.isArray(summary.odds)) {
      return [];
    }

    return summary.odds.filter(this.isRecord).sort((left, right) => {
      const leftPriority =
        this.toNumber(this.asRecord(left.provider)?.priority) ?? 9999;
      const rightPriority =
        this.toNumber(this.asRecord(right.provider)?.priority) ?? 9999;

      return leftPriority - rightPriority;
    });
  }

  private calculateSupportConfidence(markets: MarketCalculation[]): number {
    /*
     * This score measures how strongly already-collected Sports data backs
     * the administrator's selection. It is not a forecast of settlement.
     */
    let score = 60;

    for (const [index, market] of markets.entries()) {
      const directProbability =
        market.probabilitySource === 'ESPN_PROBABILITY' ||
        market.probabilitySource === 'COMBINATION';

      const oddsBacked = Boolean(market.oddsSource);

      if (index === 0) {
        score += directProbability ? 20 : 12;

        if (oddsBacked) {
          score += 6;
        }
      } else {
        score += directProbability ? 5 : 3;

        if (oddsBacked) {
          score += 2;
        }
      }
    }

    return Math.max(60, Math.min(98, Math.round(score)));
  }

  private calculateFairOdds(probability: number): number {
    if (!Number.isFinite(probability) || probability <= 0) {
      return 1000;
    }

    return Number(Math.max(1, 100 / probability).toFixed(2));
  }

  private roundProbability(value: number): number {
    return Number(this.clamp(value, 0, 100).toFixed(2));
  }

  private getProbabilityValue(value: unknown): number | undefined {
    const number = this.toNumber(value);

    if (number === null || !Number.isFinite(number)) {
      return undefined;
    }

    const normalized = number <= 1 ? number * 100 : number;

    if (normalized < 0 || normalized > 100) {
      return undefined;
    }

    return normalized;
  }

  private toDecimalOdds(value: unknown): number | undefined {
    const number = this.toNumber(value);

    if (number === null || !Number.isFinite(number)) {
      return undefined;
    }

    if (number >= 1.01 && number < 100) {
      return Number(number.toFixed(2));
    }

    if (number >= 100) {
      return Number((1 + number / 100).toFixed(2));
    }

    if (number <= -100) {
      return Number((1 + 100 / Math.abs(number)).toFixed(2));
    }

    return undefined;
  }

  private normalizeAndValidateRequestedMarkets(
    markets: RequestedMarket[],
  ): RequestedMarket[] {
    if (!Array.isArray(markets)) {
      return [];
    }

    return markets
      .filter(
        (market) =>
          market &&
          typeof market.market === 'string' &&
          typeof market.selection === 'string' &&
          market.market.trim() &&
          market.selection.trim(),
      )
      .map((market) => ({
        market: this.normalizeMarket(market.market),
        selection: this.normalizeSelection(market.selection),
      }));
  }

  private normalizeMarket(value: string): PredictionMarket {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();

    if (
      !Object.values(PredictionMarkets).includes(normalized as PredictionMarket)
    ) {
      throw new BadRequestException(
        `Unsupported prediction market: ${String(value)}`,
      );
    }

    return normalized as PredictionMarket;
  }

  private normalizeSelection(value: string): string {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_');
  }

  private selectionTokens(selection: string): string[] {
    return selection
      .split('_')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  private extractSelectionLine(selection: string): number | undefined {
    const match = selection.match(/(?:^|_)(\d+(?:\.\d+)?)$/);

    return match ? Number(match[1]) : undefined;
  }

  private selectionIs(selection: string, ...values: string[]): boolean {
    return values.includes(selection);
  }

  private prettySelection(selection: string): string {
    return selection.toLowerCase().replace(/_/g, ' ');
  }

  private normalizeContext(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private findNumericProperty(
    record: Record<string, unknown>,
    keys: string[],
  ): unknown {
    for (const key of keys) {
      if (record[key] !== undefined) {
        return record[key];
      }
    }

    return undefined;
  }

  private extractLeagueCountry(
    payload?: Record<string, unknown>,
  ): string | undefined {
    if (!payload) {
      return undefined;
    }

    const country = payload.country;

    if (typeof country === 'string') {
      return country;
    }

    const record = this.asRecord(country);

    return (
      this.toString(record?.name) ??
      this.toString(record?.displayName) ??
      this.toString(record?.abbreviation)
    );
  }

  private extractLeagueEmblem(
    payload?: Record<string, unknown>,
  ): string | undefined {
    if (!payload) {
      return undefined;
    }

    const directKeys = ['logo', 'emblem', 'icon', 'image'];

    for (const key of directKeys) {
      const value = payload[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      const record = this.asRecord(value);

      const nested =
        this.toString(record?.href) ??
        this.toString(record?.url) ??
        this.toString(record?.src) ??
        this.toString(record?.default);

      if (nested) {
        return nested;
      }
    }

    const logos = payload.logos;

    if (Array.isArray(logos)) {
      for (const logo of logos) {
        const record = this.asRecord(logo);

        const href = this.toString(record?.href);
        if (href) {
          return href;
        }
      }
    }

    return undefined;
  }

  private extractFixtureTeamName(
    fixture: SportsPredictionData['fixture'],
    side: 'home' | 'away',
  ): string | undefined {
    const payload =
      fixture.payload && typeof fixture.payload === 'object'
        ? (fixture.payload as Record<string, unknown>)
        : {};

    const competitions = Array.isArray(payload.competitions)
      ? payload.competitions
      : [];

    const competition = this.asRecord(competitions[0]);

    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

    for (const competitor of competitors) {
      const record = this.asRecord(competitor);

      if (this.toString(record?.homeAway) !== side) {
        continue;
      }

      const team = this.asRecord(record?.team);

      return this.toString(team?.displayName) ?? this.toString(team?.name);
    }

    return undefined;
  }

  private extractFixtureTeamLogo(
    fixture: SportsPredictionData['fixture'],
    side: 'home' | 'away',
  ): string | undefined {
    const payload =
      fixture.payload && typeof fixture.payload === 'object'
        ? (fixture.payload as Record<string, unknown>)
        : {};

    const competitions = Array.isArray(payload.competitions)
      ? payload.competitions
      : [];

    const competition = this.asRecord(competitions[0]);

    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

    for (const competitor of competitors) {
      const record = this.asRecord(competitor);

      if (this.toString(record?.homeAway) !== side) {
        continue;
      }

      const team = this.asRecord(record?.team);

      const direct = this.toString(team?.logo) ?? this.toString(record?.logo);

      if (direct) {
        return direct;
      }

      const logos = team?.logos;
      if (Array.isArray(logos)) {
        for (const logo of logos) {
          const href = this.toString(this.asRecord(logo)?.href);

          if (href) {
            return href;
          }
        }
      }
    }

    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private isRecord(
    this: void,
    value: unknown,
  ): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private toString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
