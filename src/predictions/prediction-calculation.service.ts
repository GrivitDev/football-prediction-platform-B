import { BadRequestException, Injectable } from '@nestjs/common';

import { ActiveCompetitionService } from '../sports/services/active-competition.service';
import { SportsDataReadService } from '../sports/services/sports-data-read.service';
import { EspnFixtureDocument } from '../sports/schemas/espn/espn-fixture.schema';

import {
  PredictionMarket,
  PredictionMarkets,
} from './constants/prediction-markets';

interface RequestedMarket {
  market: string;
  selection: string;
}

interface MarketCalculation {
  market: PredictionMarket;
  selection: string;
  probability: number;
}

interface TeamLookup {
  teamId: string | number;
  name?: string;
  logo?: string;
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

interface TeamModel {
  id: string;

  name: string;

  gamesPlayed: number;

  goalsForPerGame?: number;

  goalsAgainstPerGame?: number;

  cornersPerGame?: number;

  cardsPerGame?: number;

  shotsPerGame?: number;

  shotsOnTargetPerGame?: number;

  possession?: number;

  offsidesPerGame?: number;

  foulsPerGame?: number;

  formScore?: number;

  metrics: Record<string, number>;
}

interface MatchModel {
  home: TeamModel;

  away: TeamModel;

  expectedHomeGoals: number;

  expectedAwayGoals: number;

  expectedHomeCorners?: number;

  expectedAwayCorners?: number;

  expectedHomeCards?: number;

  expectedAwayCards?: number;

  expectedHomeShots?: number;

  expectedAwayShots?: number;

  expectedHomeShotsOnTarget?: number;

  expectedAwayShotsOnTarget?: number;

  expectedHomeOffsides?: number;

  expectedAwayOffsides?: number;

  expectedHomeFouls?: number;

  expectedAwayFouls?: number;

  predictorProbabilities?: {
    home: number;
    draw: number;
    away: number;
  };

  qualityScore: number;
}

interface TeamExtractionCandidate {
  id?: string;
  name?: string;
  statistics?: unknown;
  stats?: unknown;
  record?: unknown;
  form?: unknown;
  team?: unknown;
}

interface SummaryPayload {
  [key: string]: unknown;
}

interface FixtureSummaryResponse {
  eventId?: string;
  leagueId?: string;
  season?: number;
  fixtureDate?: string | Date;
  summary?: unknown;
  summaryCollectedAt?: string | Date;
  payload?: {
    summary?: unknown;
  };
}

type ScoreProbability = {
  home: number;
  away: number;
  probability: number;
};

@Injectable()
export class PredictionCalculationService {
  constructor(
    private readonly activeCompetitionService: ActiveCompetitionService,

    private readonly sportsDataReadService: SportsDataReadService,
  ) {}

  // ============================================================
  // PUBLIC CALCULATION
  // ============================================================

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

    const fixture =
      await this.sportsDataReadService.getFixtureByEventId(normalizedMatchId);

    if (!fixture) {
      throw new BadRequestException(
        'ESPN fixture is not available for the selected match',
      );
    }

    const summaryResponse =
      await this.sportsDataReadService.getFixtureSummary(normalizedMatchId);

    const summary = this.extractSummary(summaryResponse);

    if (!summary) {
      throw new BadRequestException(
        'ESPN Summary is not available for the selected match',
      );
    }

    const model = this.buildMatchModel(fixture, summary);

    const probabilities = this.calculateOverallProbabilities(model);

    const calculatedMarkets = markets.map((market) =>
      this.calculateMarket(model, market),
    );

    const prediction = this.getPrediction(probabilities);

    const confidence = this.calculateConfidence(
      model,
      probabilities,
      calculatedMarkets,
    );

    const competition = await this.activeCompetitionService.getByCompetitionId(
      fixture.leagueId,
    );

    const teams = await this.sportsDataReadService.getTeams(fixture.leagueId);

    const isTeamLookup = (team: unknown): team is TeamLookup => {
      if (typeof team !== 'object' || team === null) {
        return false;
      }

      const candidate = team as Record<string, unknown>;

      return (
        (typeof candidate.teamId === 'string' ||
          typeof candidate.teamId === 'number') &&
        (candidate.name === undefined || typeof candidate.name === 'string') &&
        (candidate.logo === undefined || typeof candidate.logo === 'string')
      );
    };

    const teamList = teams as unknown as readonly unknown[];

    const homeTeam = teamList.find(
      (team): team is TeamLookup =>
        isTeamLookup(team) &&
        String(team.teamId) === String(fixture.homeTeamId),
    );

    const awayTeam = teamList.find(
      (team): team is TeamLookup =>
        isTeamLookup(team) &&
        String(team.teamId) === String(fixture.awayTeamId),
    );

    const homeTeamName =
      fixture.homeTeamId && homeTeam?.name
        ? String(homeTeam.name)
        : model.home.name;

    const awayTeamName =
      fixture.awayTeamId && awayTeam?.name
        ? String(awayTeam.name)
        : model.away.name;

    const leagueCountry = this.extractLeagueCountry(competition?.espnPayload);

    const league = competition
      ? {
          code: fixture.leagueId,
          name: competition.name,
          country: leagueCountry ?? '',
        }
      : undefined;

    return {
      matchId: fixture.eventId,

      leagueCode: fixture.leagueId,

      league,

      homeTeam: homeTeamName,

      awayTeam: awayTeamName,

      homeTeamBadge:
        homeTeam?.logo ?? this.extractFixtureTeamLogo(fixture, 'home'),

      awayTeamBadge:
        awayTeam?.logo ?? this.extractFixtureTeamLogo(fixture, 'away'),

      matchDate: fixture.fixtureDate.toISOString(),

      kickoffTimestamp: fixture.fixtureDate.getTime(),

      prediction,

      probabilities,

      confidence,

      markets: calculatedMarkets,
    };
  }

  // ============================================================
  // SUMMARY -> MODEL
  // ============================================================

  private buildMatchModel(
    fixture: EspnFixtureDocument,
    summary: SummaryPayload,
  ): MatchModel {
    const extractedTeams = this.extractTeams(summary, fixture);

    const home = extractedTeams.home;

    const away = extractedTeams.away;

    const expectedHomeGoals = this.calculateExpectedGoals(home, away, true);

    const expectedAwayGoals = this.calculateExpectedGoals(away, home, false);

    const predictorProbabilities = this.extractPredictorProbabilities(
      summary,
      home.id,
      away.id,
    );

    const expectedHomeCorners = this.calculateMetricExpectation(
      home.cornersPerGame,
    );

    const expectedAwayCorners = this.calculateMetricExpectation(
      away.cornersPerGame,
    );

    const expectedHomeCards = this.calculateMetricExpectation(
      home.cardsPerGame,
    );

    const expectedAwayCards = this.calculateMetricExpectation(
      away.cardsPerGame,
    );

    const expectedHomeShots = this.calculateMetricExpectation(
      home.shotsPerGame,
    );

    const expectedAwayShots = this.calculateMetricExpectation(
      away.shotsPerGame,
    );

    const expectedHomeShotsOnTarget = this.calculateMetricExpectation(
      home.shotsOnTargetPerGame,
    );

    const expectedAwayShotsOnTarget = this.calculateMetricExpectation(
      away.shotsOnTargetPerGame,
    );

    const expectedHomeOffsides = this.calculateMetricExpectation(
      home.offsidesPerGame,
    );

    const expectedAwayOffsides = this.calculateMetricExpectation(
      away.offsidesPerGame,
    );

    const expectedHomeFouls = this.calculateMetricExpectation(
      home.foulsPerGame,
    );

    const expectedAwayFouls = this.calculateMetricExpectation(
      away.foulsPerGame,
    );

    const qualityScore = this.calculateSummaryQuality(
      home,
      away,
      predictorProbabilities,
    );

    return {
      home,

      away,

      expectedHomeGoals,

      expectedAwayGoals,

      expectedHomeCorners,

      expectedAwayCorners,

      expectedHomeCards,

      expectedAwayCards,

      expectedHomeShots,

      expectedAwayShots,

      expectedHomeShotsOnTarget,

      expectedAwayShotsOnTarget,

      expectedHomeOffsides,

      expectedAwayOffsides,

      expectedHomeFouls,

      expectedAwayFouls,

      predictorProbabilities,

      qualityScore,
    };
  }

  private extractSummary(response: unknown): SummaryPayload | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const value = response as FixtureSummaryResponse;

    if (value.summary && typeof value.summary === 'object') {
      return value.summary as SummaryPayload;
    }

    if (value.payload?.summary && typeof value.payload.summary === 'object') {
      return value.payload.summary as SummaryPayload;
    }

    return response as SummaryPayload;
  }

  // ============================================================
  // TEAM EXTRACTION
  // ============================================================

  private extractTeams(
    summary: SummaryPayload,
    fixture: EspnFixtureDocument,
  ): {
    home: TeamModel;
    away: TeamModel;
  } {
    const candidates = this.findTeamCandidates(summary);

    const homeId = String(fixture.homeTeamId ?? '');

    const awayId = String(fixture.awayTeamId ?? '');

    const homeCandidate = candidates.find(
      (candidate) => candidate.id === homeId,
    );

    const awayCandidate = candidates.find(
      (candidate) => candidate.id === awayId,
    );

    const fallbackHome = candidates.find(
      (candidate) =>
        this.normalize(candidate.name) ===
        this.normalize(this.extractFixtureTeamName(fixture, 'home')),
    );

    const fallbackAway = candidates.find(
      (candidate) =>
        this.normalize(candidate.name) ===
        this.normalize(this.extractFixtureTeamName(fixture, 'away')),
    );

    const home = this.buildTeamModel(
      homeCandidate ?? fallbackHome ?? candidates[0],
      homeId,
      this.extractFixtureTeamName(fixture, 'home') ?? 'Home',
    );

    const away = this.buildTeamModel(
      awayCandidate ?? fallbackAway ?? candidates[1],
      awayId,
      this.extractFixtureTeamName(fixture, 'away') ?? 'Away',
    );

    return {
      home,
      away,
    };
  }

  private findTeamCandidates(
    summary: SummaryPayload,
  ): TeamExtractionCandidate[] {
    const candidates: TeamExtractionCandidate[] = [];

    const addCandidates = (value: unknown) => {
      if (!Array.isArray(value)) {
        return;
      }

      for (const item of value) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const record = item as Record<string, unknown>;

        const team = this.asRecord(record.team);

        const id = this.toString(team?.id ?? record.teamId ?? record.id);

        const name = this.toString(
          team?.displayName ?? team?.name ?? record.displayName ?? record.name,
        );

        const statistics = record.statistics ?? record.stats;

        const form = record.form ?? record.recentForm ?? record.records;

        if (id || name || statistics) {
          candidates.push({
            id,
            name,
            statistics,
            stats: record.stats,
            record,
            form,
            team: record.team,
          });
        }
      }
    };

    const boxscore = this.asRecord(summary.boxscore);

    addCandidates(boxscore?.teams);

    const header = this.asRecord(summary.header);

    const headerCompetition = Array.isArray(header?.competitions)
      ? this.asRecord(header.competitions[0])
      : undefined;

    addCandidates(headerCompetition?.competitors);

    addCandidates(summary.competitors);

    addCandidates(summary.teams);

    addCandidates(summary.teamStats);

    return this.deduplicateTeamCandidates(candidates);
  }

  private deduplicateTeamCandidates(
    candidates: TeamExtractionCandidate[],
  ): TeamExtractionCandidate[] {
    const result: TeamExtractionCandidate[] = [];

    const seen = new Set<string>();

    for (const candidate of candidates) {
      const key = candidate.id ?? this.normalize(candidate.name);

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(candidate);
    }

    return result;
  }

  private buildTeamModel(
    candidate: TeamExtractionCandidate | undefined,
    fallbackId: string,
    fallbackName: string,
  ): TeamModel {
    const statistics = this.flattenStatistics(
      candidate?.statistics ?? candidate?.stats,
    );

    const metrics = this.flattenNumericMetrics(candidate, statistics);

    const gamesPlayed =
      this.firstMetric(metrics, [
        'gamesplayed',
        'matchesplayed',
        'played',
        'games',
      ]) ?? 1;

    const goalsFor = this.firstMetric(metrics, [
      'goalsfor',
      'goals',
      'goalsscored',
      'goalscored',
      'pointsfor',
      'score',
    ]);

    const goalsAgainst = this.firstMetric(metrics, [
      'goalsagainst',
      'goalsconceded',
      'goalsallowed',
      'goalsreceived',
      'pointsagainst',
    ]);

    const corners = this.firstMetric(metrics, [
      'corners',
      'cornerkicks',
      'cornerkickswon',
    ]);

    const cards = this.firstMetric(metrics, [
      'cards',
      'yellowcards',
      'totalcards',
      'cardscards',
    ]);

    const shots = this.firstMetric(metrics, [
      'shots',
      'totalshots',
      'shotsattempted',
    ]);

    const shotsOnTarget = this.firstMetric(metrics, [
      'shotsontarget',
      'sot',
      'shotsongoal',
    ]);

    const possession = this.firstMetric(metrics, [
      'possession',
      'possessionpercentage',
    ]);

    const offsides = this.firstMetric(metrics, [
      'offsides',
      'offside',
      'offsidescommitted',
    ]);

    const fouls = this.firstMetric(metrics, [
      'fouls',
      'foulscommitted',
      'foulsdrawn',
    ]);

    const formScore = this.extractFormScore(candidate);

    return {
      id: candidate?.id ?? fallbackId,

      name: candidate?.name ?? fallbackName,

      gamesPlayed: Math.max(1, gamesPlayed),

      goalsForPerGame: this.toPerGame(goalsFor, gamesPlayed),

      goalsAgainstPerGame: this.toPerGame(goalsAgainst, gamesPlayed),

      cornersPerGame: this.toPerGame(corners, gamesPlayed),

      cardsPerGame: this.toPerGame(cards, gamesPlayed),

      shotsPerGame: this.toPerGame(shots, gamesPlayed),

      shotsOnTargetPerGame: this.toPerGame(shotsOnTarget, gamesPlayed),

      possession,

      offsidesPerGame: this.toPerGame(offsides, gamesPlayed),

      foulsPerGame: this.toPerGame(fouls, gamesPlayed),

      formScore,

      metrics,
    };
  }

  private flattenStatistics(value: unknown): Record<string, number> {
    const result: Record<string, number> = {};

    if (!Array.isArray(value)) {
      return result;
    }

    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const record = item as Record<string, unknown>;

      const key = this.normalizeMetricKey(
        this.toString(
          record.name ?? record.key ?? record.displayName ?? record.label,
        ),
      );

      const number =
        this.toNumber(record.value) ?? this.toNumber(record.numericValue);

      if (key && number !== null) {
        result[key] = number;
        continue;
      }

      const fallbackKey = this.normalizeMetricKey(
        this.toString(record.displayValue),
      );

      if (key && fallbackKey && /^\d+(?:\.\d+)?$/.test(fallbackKey)) {
        result[key] = Number(fallbackKey);
      }
    }

    return result;
  }

  private flattenNumericMetrics(
    candidate: TeamExtractionCandidate | undefined,
    statistics: Record<string, number>,
  ): Record<string, number> {
    const result = {
      ...statistics,
    };

    const visit = (value: unknown, depth: number) => {
      if (depth > 5 || !value || typeof value !== 'object') {
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item, depth + 1);
        }

        return;
      }

      const record = value as Record<string, unknown>;

      for (const [key, child] of Object.entries(record)) {
        const normalized = this.normalizeMetricKey(key);

        const number = this.toNumber(child);

        if (normalized && number !== null) {
          result[normalized] = number;
        }

        if (child && typeof child === 'object') {
          visit(child, depth + 1);
        }
      }
    };

    visit(candidate, 0);

    return result;
  }

  // ============================================================
  // EXPECTED GOALS
  // ============================================================

  private calculateExpectedGoals(
    attackingTeam: TeamModel,
    defendingTeam: TeamModel,
    isHome: boolean,
  ): number {
    const attack = attackingTeam.goalsForPerGame;

    const defence = defendingTeam.goalsAgainstPerGame;

    let expected: number;

    if (attack !== undefined && defence !== undefined) {
      expected = (attack + defence) / 2;
    } else if (attack !== undefined) {
      expected = attack;
    } else if (defence !== undefined) {
      expected = defence;
    } else {
      expected = isHome ? 1.45 : 1.15;
    }

    const formModifier = this.getFormModifier(attackingTeam.formScore);

    const homeModifier = isHome ? 1.08 : 1;

    return this.clamp(expected * formModifier * homeModifier, 0.25, 4.5);
  }

  private calculateMetricExpectation(
    value: number | undefined,
  ): number | undefined {
    return value !== undefined ? this.clamp(value, 0.1, 25) : undefined;
  }

  private getFormModifier(formScore: number | undefined): number {
    if (formScore === undefined) {
      return 1;
    }

    return this.clamp(0.88 + (formScore / 100) * 0.24, 0.88, 1.12);
  }

  // ============================================================
  // ESPN PREDICTOR
  // ============================================================

  private extractPredictorProbabilities(
    summary: SummaryPayload,
    homeTeamId: string,
    awayTeamId: string,
  ):
    | {
        home: number;
        draw: number;
        away: number;
      }
    | undefined {
    const candidates: unknown[] = [];

    if (summary.predictor) {
      candidates.push(summary.predictor);
    }

    if (summary.winprobability) {
      candidates.push(summary.winprobability);
    }

    if (summary.winProbability) {
      candidates.push(summary.winProbability);
    }

    if (summary.pickcenter) {
      candidates.push(summary.pickcenter);
    }

    let home: number | undefined;

    let away: number | undefined;

    let draw: number | undefined;

    for (const candidate of candidates) {
      const extracted = this.searchProbabilityObject(
        candidate,
        homeTeamId,
        awayTeamId,
      );

      home = home ?? extracted.home;

      away = away ?? extracted.away;

      draw = draw ?? extracted.draw;

      if (home !== undefined && away !== undefined && draw !== undefined) {
        break;
      }
    }

    if (home === undefined || away === undefined || draw === undefined) {
      return undefined;
    }

    return this.normalizeThreeWayProbabilities(home, draw, away);
  }

  private searchProbabilityObject(
    value: unknown,
    homeTeamId: string,
    awayTeamId: string,
  ): {
    home?: number;
    draw?: number;
    away?: number;
  } {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const visit = (
      current: unknown,
    ): {
      home?: number;
      draw?: number;
      away?: number;
    } => {
      if (!current || typeof current !== 'object') {
        return {};
      }

      if (Array.isArray(current)) {
        let result:
          | {
              home?: number;
              draw?: number;
              away?: number;
            }
          | undefined;

        for (const item of current) {
          const nested = visit(item);

          result = {
            home: result?.home ?? nested.home,
            draw: result?.draw ?? nested.draw,
            away: result?.away ?? nested.away,
          };

          if (
            result.home !== undefined &&
            result.draw !== undefined &&
            result.away !== undefined
          ) {
            return result;
          }
        }

        return result ?? {};
      }

      const record = current as Record<string, unknown>;

      const homeId = this.toString(
        record.homeTeamId ?? this.asRecord(record.homeTeam)?.id,
      );

      const awayId = this.toString(
        record.awayTeamId ?? this.asRecord(record.awayTeam)?.id,
      );

      const localHome =
        homeId === homeTeamId
          ? this.findNumericProperty(record, [
              'homeWinPercentage',
              'homeWinProbability',
              'homeChance',
              'homeTeamChance',
              'home',
              'homeWin',
              'teamChanceWin',
              'gameProjection',
            ])
          : undefined;

      const localAway =
        awayId === awayTeamId
          ? this.findNumericProperty(record, [
              'awayWinPercentage',
              'awayWinProbability',
              'awayChance',
              'awayTeamChance',
              'away',
              'awayWin',
              'teamChanceWin',
            ])
          : undefined;

      const localDraw = this.findNumericProperty(record, [
        'drawPercentage',
        'drawProbability',
        'drawChance',
        'tiePercentage',
        'tieProbability',
        'teamChanceTie',
        'draw',
      ]);

      const normalizedHome = this.getProbabilityValue(localHome);

      const normalizedAway = this.getProbabilityValue(localAway);

      const normalizedDraw = this.getProbabilityValue(localDraw);

      if (
        normalizedHome !== undefined ||
        normalizedAway !== undefined ||
        normalizedDraw !== undefined
      ) {
        return {
          home: normalizedHome,
          away: normalizedAway,
          draw: normalizedDraw,
        };
      }

      let result: {
        home?: number;
        draw?: number;
        away?: number;
      } = {};

      for (const nested of Object.values(record)) {
        if (!nested || typeof nested !== 'object') {
          continue;
        }

        const found = visit(nested);

        result = {
          home: result.home ?? found.home,
          draw: result.draw ?? found.draw,
          away: result.away ?? found.away,
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
    };

    return visit(value);
  }

  // ============================================================
  // OVERALL PROBABILITIES
  // ============================================================

  private calculateOverallProbabilities(model: MatchModel): {
    home: number;
    draw: number;
    away: number;
  } {
    const matrix = this.buildScoreMatrix(
      model.expectedHomeGoals,
      model.expectedAwayGoals,
      8,
    );

    const poisson = this.calculate1X2FromScoreMatrix(matrix);

    if (!model.predictorProbabilities) {
      return {
        home: this.toPercentage(poisson.home),
        draw: this.toPercentage(poisson.draw),
        away: this.toPercentage(poisson.away),
      };
    }

    /*
     * ESPN Summary predictor data is treated only as an additional
     * non-bookmaker signal.
     *
     * No Odds API or bookmaker probability/price is used here.
     */
    const blendedHome =
      poisson.home * 0.7 + model.predictorProbabilities.home * 0.3;

    const blendedDraw =
      poisson.draw * 0.7 + model.predictorProbabilities.draw * 0.3;

    const blendedAway =
      poisson.away * 0.7 + model.predictorProbabilities.away * 0.3;

    const total = blendedHome + blendedDraw + blendedAway;

    return {
      home: this.toPercentage(blendedHome / total),
      draw: this.toPercentage(blendedDraw / total),
      away: this.toPercentage(blendedAway / total),
    };
  }

  // ============================================================
  // MARKET CALCULATION
  // ============================================================

  private calculateMarket(
    model: MatchModel,
    requested: RequestedMarket,
  ): MarketCalculation {
    const market = this.normalizeMarket(requested.market);

    const selection = this.normalizeSelection(requested.selection);

    const probability = this.calculateMarketProbability(
      model,
      market,
      selection,
    );

    if (probability === undefined || !Number.isFinite(probability)) {
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

  private calculateMarketProbability(
    model: MatchModel,
    market: PredictionMarket,
    selection: string,
  ): number | undefined {
    switch (market) {
      case PredictionMarkets.DOUBLE_CHANCE:
        return this.calculateDoubleChanceProbability(model, selection);

      case PredictionMarkets.DRAW_NO_BET:
        return this.calculateDrawNoBetProbability(model, selection);

      case PredictionMarkets.OVER_UNDER:
        return this.calculateOverUnderProbability(model, selection);

      case PredictionMarkets.BOTH_TEAMS_TO_SCORE:
        return this.calculateBttsProbability(model, selection);

      case PredictionMarkets.BTTS_GOALS:
        return this.calculateBttsProbability(model, selection);

      case PredictionMarkets.GOAL_RANGE:
        return this.calculateGoalRangeProbability(model, selection);

      case PredictionMarkets.TEAM_TOTAL_GOALS:
        return this.calculateTeamTotalGoalsProbability(model, selection);

      case PredictionMarkets.EXACT_GOALS:
        return this.calculateExactGoalsProbability(model, selection);

      case PredictionMarkets.CLEAN_SHEET:
        return this.calculateCleanSheetProbability(model, selection);

      case PredictionMarkets.HALF_TIME_RESULT:
        return this.calculateHalfTimeResultProbability(model, selection);

      case PredictionMarkets.SECOND_HALF_RESULT:
        return this.calculateSecondHalfResultProbability(model, selection);

      case PredictionMarkets.HALF_TIME_FULL_TIME:
        return this.calculateHalfTimeFullTimeProbability(model, selection);

      case PredictionMarkets.ASIAN_HANDICAP:
        return this.calculateAsianHandicapProbability(model, selection);

      case PredictionMarkets.EUROPEAN_HANDICAP:
        return this.calculateEuropeanHandicapProbability(model, selection);

      case PredictionMarkets.CORNERS_TOTAL:
        return this.calculateMetricTotalProbability(
          this.totalMetricMean(
            model.expectedHomeCorners,
            model.expectedAwayCorners,
          ),
          selection,
        );

      case PredictionMarkets.TEAM_CORNERS:
        return this.calculateTeamMetricProbability(
          model.expectedHomeCorners,
          model.expectedAwayCorners,
          selection,
        );

      case PredictionMarkets.CORNER_HANDICAP:
        return this.calculateMetricHandicapProbability(
          model.expectedHomeCorners,
          model.expectedAwayCorners,
          selection,
        );

      case PredictionMarkets.CARDS_TOTAL:
        return this.calculateMetricTotalProbability(
          this.totalMetricMean(
            model.expectedHomeCards,
            model.expectedAwayCards,
          ),
          selection,
        );

      case PredictionMarkets.TEAM_CARDS:
        return this.calculateTeamMetricProbability(
          model.expectedHomeCards,
          model.expectedAwayCards,
          selection,
        );

      case PredictionMarkets.CARD_HANDICAP:
        return this.calculateMetricHandicapProbability(
          model.expectedHomeCards,
          model.expectedAwayCards,
          selection,
        );

      case PredictionMarkets.FIRST_GOAL:
        return this.calculateFirstGoalProbability(model, selection);

      case PredictionMarkets.LAST_GOAL:
        return this.calculateLastGoalProbability(model, selection);

      case PredictionMarkets.WIN_TO_NIL:
        return this.calculateWinToNilProbability(model, selection);

      case PredictionMarkets.CORRECT_SCORE:
        return this.calculateCorrectScoreProbability(model, selection);

      case PredictionMarkets.POSSESSION_WINNER:
        return this.calculateMetricWinnerProbability(
          model.home.possession,
          model.away.possession,
          selection,
        );

      case PredictionMarkets.MOST_SHOTS:
        return this.calculateMetricWinnerProbability(
          model.home.shotsPerGame,
          model.away.shotsPerGame,
          selection,
        );

      case PredictionMarkets.MOST_SHOTS_ON_TARGET:
        return this.calculateMetricWinnerProbability(
          model.home.shotsOnTargetPerGame,
          model.away.shotsOnTargetPerGame,
          selection,
        );

      case PredictionMarkets.GOAL_TIMING:
        return this.calculateGoalTimingProbability(model, selection);

      case PredictionMarkets.OFFSIDES_TOTAL:
        return this.calculateMetricTotalProbability(
          this.totalMetricMean(
            model.expectedHomeOffsides,
            model.expectedAwayOffsides,
          ),
          selection,
        );

      case PredictionMarkets.TEAM_OFFSIDES:
        return this.calculateTeamMetricProbability(
          model.expectedHomeOffsides,
          model.expectedAwayOffsides,
          selection,
        );

      case PredictionMarkets.FOULS_TOTAL:
        return this.calculateMetricTotalProbability(
          this.totalMetricMean(
            model.expectedHomeFouls,
            model.expectedAwayFouls,
          ),
          selection,
        );

      case PredictionMarkets.TEAM_FOULS:
        return this.calculateTeamMetricProbability(
          model.expectedHomeFouls,
          model.expectedAwayFouls,
          selection,
        );

      case PredictionMarkets.FIRST_HALF_GOALS:
        return this.calculateHalfGoalsProbability(model, selection, 0.45);

      case PredictionMarkets.SECOND_HALF_GOALS:
        return this.calculateHalfGoalsProbability(model, selection, 0.55);

      case PredictionMarkets.FIRST_HALF_CORNERS:
        return this.calculateHalfMetricTotalProbability(
          model.expectedHomeCorners,
          model.expectedAwayCorners,
          selection,
          0.45,
        );

      case PredictionMarkets.FIRST_HALF_CARDS:
        return this.calculateHalfMetricTotalProbability(
          model.expectedHomeCards,
          model.expectedAwayCards,
          selection,
          0.45,
        );

      default:
        throw new BadRequestException(
          `Unsupported prediction market: ${String(market)}`,
        );
    }
  }

  // ============================================================
  // RESULT MARKETS
  // ============================================================

  private calculateDoubleChanceProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const probabilities = this.calculateOverallProbabilities(model);

    switch (selection) {
      case 'HOME_OR_DRAW':
      case 'HOME_DRAW':
      case '1X':
        return probabilities.home + probabilities.draw;

      case 'AWAY_OR_DRAW':
      case 'AWAY_DRAW':
      case 'X2':
        return probabilities.away + probabilities.draw;

      case 'HOME_OR_AWAY':
      case 'HOME_AWAY':
      case '12':
        return probabilities.home + probabilities.away;

      default:
        throw new BadRequestException(
          `Invalid DOUBLE_CHANCE selection: ${selection}`,
        );
    }
  }

  private calculateDrawNoBetProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const probabilities = this.calculateOverallProbabilities(model);

    if (selection !== 'HOME' && selection !== 'AWAY') {
      throw new BadRequestException(
        `Invalid DRAW_NO_BET selection: ${selection}`,
      );
    }

    const sideProbability =
      selection === 'HOME' ? probabilities.home : probabilities.away;

    return sideProbability / Math.max(0.000001, 100 - probabilities.draw);
  }

  private calculateOverUnderProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.match(
      /^(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5|4\.5|5\.5)$/,
    );

    if (!parsed) {
      throw new BadRequestException(
        `Invalid OVER_UNDER selection: ${selection}`,
      );
    }

    const totalLambda = model.expectedHomeGoals + model.expectedAwayGoals;

    const line = Number(parsed[2]);

    const under = this.poissonCdf(Math.floor(line), totalLambda);

    return parsed[1] === 'OVER' ? 1 - under : under;
  }

  private calculateBttsProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const homeZero = this.poissonProbability(0, model.expectedHomeGoals);

    const awayZero = this.poissonProbability(0, model.expectedAwayGoals);

    const yes = 1 - homeZero - awayZero + homeZero * awayZero;

    if (selection === 'YES') {
      return yes;
    }

    if (selection === 'NO') {
      return 1 - yes;
    }

    throw new BadRequestException(`Invalid BTTS selection: ${selection}`);
  }

  private calculateGoalRangeProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.replace(/_/g, '-').trim();

    const totalLambda = model.expectedHomeGoals + model.expectedAwayGoals;

    switch (parsed) {
      case '0':
        return this.poissonProbability(0, totalLambda);

      case '1-2':
        return (
          this.poissonProbability(1, totalLambda) +
          this.poissonProbability(2, totalLambda)
        );

      case '3-4':
        return (
          this.poissonProbability(3, totalLambda) +
          this.poissonProbability(4, totalLambda)
        );

      case '5+':
        return 1 - this.poissonCdf(4, totalLambda);

      default:
        throw new BadRequestException(
          `Invalid GOAL_RANGE selection: ${selection}`,
        );
    }
  }

  private calculateTeamTotalGoalsProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.match(
      /^(HOME|AWAY)_(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5)$/,
    );

    if (!parsed) {
      throw new BadRequestException(
        `Invalid TEAM_TOTAL_GOALS selection: ${selection}`,
      );
    }

    const lambda =
      parsed[1] === 'HOME' ? model.expectedHomeGoals : model.expectedAwayGoals;

    const line = Number(parsed[3]);

    const under = this.poissonCdf(Math.floor(line), lambda);

    return parsed[2] === 'OVER' ? 1 - under : under;
  }

  private calculateExactGoalsProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.match(/^(HOME|AWAY)_(0|1|2|3|4|5|6)$/);

    if (!parsed) {
      throw new BadRequestException(
        `Invalid EXACT_GOALS selection: ${selection}`,
      );
    }

    const lambda =
      parsed[1] === 'HOME' ? model.expectedHomeGoals : model.expectedAwayGoals;

    return this.poissonProbability(Number(parsed[2]), lambda);
  }

  private calculateCleanSheetProbability(
    model: MatchModel,
    selection: string,
  ): number {
    if (selection === 'HOME') {
      return this.poissonProbability(0, model.expectedAwayGoals);
    }

    if (selection === 'AWAY') {
      return this.poissonProbability(0, model.expectedHomeGoals);
    }

    throw new BadRequestException(
      `Invalid CLEAN_SHEET selection: ${selection}`,
    );
  }

  // ============================================================
  // HALF MARKETS
  // ============================================================

  private calculateHalfTimeResultProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const matrix = this.buildScoreMatrix(
      model.expectedHomeGoals * 0.45,
      model.expectedAwayGoals * 0.45,
      8,
    );

    return this.extractResultProbabilityFromMatrix(matrix, selection);
  }

  private calculateSecondHalfResultProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const matrix = this.buildScoreMatrix(
      model.expectedHomeGoals * 0.55,
      model.expectedAwayGoals * 0.55,
      8,
    );

    return this.extractResultProbabilityFromMatrix(matrix, selection);
  }

  private calculateHalfTimeFullTimeProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parts = selection.split('_');

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new BadRequestException(
        `Invalid HALF_TIME_FULL_TIME selection: ${selection}`,
      );
    }

    const halfMatrix = this.buildScoreMatrix(
      model.expectedHomeGoals * 0.45,
      model.expectedAwayGoals * 0.45,
      8,
    );

    const secondMatrix = this.buildScoreMatrix(
      model.expectedHomeGoals * 0.55,
      model.expectedAwayGoals * 0.55,
      8,
    );

    const firstResult = parts[0];

    const finalResult = parts[1];

    let probability = 0;

    for (const first of halfMatrix) {
      for (const second of secondMatrix) {
        const halfCode = this.getResultCode(first.home, first.away);

        const finalHome = first.home + second.home;

        const finalAway = first.away + second.away;

        const finalCode = this.getResultCode(finalHome, finalAway);

        if (halfCode === firstResult && finalCode === finalResult) {
          probability += first.probability * second.probability;
        }
      }
    }

    return probability;
  }

  private calculateHalfGoalsProbability(
    model: MatchModel,
    selection: string,
    share: number,
  ): number {
    const parsed = selection.match(/^(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5)$/);

    if (!parsed) {
      throw new BadRequestException(
        `Invalid half-goals selection: ${selection}`,
      );
    }

    const lambda = (model.expectedHomeGoals + model.expectedAwayGoals) * share;

    const line = Number(parsed[2]);

    const under = this.poissonCdf(Math.floor(line), lambda);

    return parsed[1] === 'OVER' ? 1 - under : under;
  }

  // ============================================================
  // HANDICAP
  // ============================================================

  private calculateAsianHandicapProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.match(
      /^(HOME|AWAY)_(-?\d+(?:\.\d+)?)_(WIN|PUSH|LOSE)$/,
    );

    if (!parsed) {
      throw new BadRequestException(
        `Invalid ASIAN_HANDICAP selection: ${selection}`,
      );
    }

    const side = parsed[1];

    const handicap = Number(parsed[2]);

    const requestedOutcome = parsed[3];

    const matrix = this.buildScoreMatrix(
      model.expectedHomeGoals,
      model.expectedAwayGoals,
      10,
    );

    let total = 0;

    for (const score of matrix) {
      const margin =
        side === 'HOME'
          ? score.home - score.away + handicap
          : score.away - score.home + handicap;

      let outcome: 'WIN' | 'PUSH' | 'LOSE';

      if (Math.abs(margin) < 0.000001) {
        outcome = 'PUSH';
      } else if (margin > 0) {
        outcome = 'WIN';
      } else {
        outcome = 'LOSE';
      }

      if (outcome === requestedOutcome) {
        total += score.probability;
      }
    }

    return total;
  }

  private calculateEuropeanHandicapProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const winMatch = selection.match(/^(HOME|AWAY)_(-?\d+)_WIN$/);

    if (winMatch) {
      const side = winMatch[1];

      const handicap = Number(winMatch[2]);

      return this.calculateEuropeanHandicapOutcome(
        model,
        side,
        handicap,
        'WIN',
      );
    }

    const drawMatch = selection.match(/^DRAW_(-?\d+)$/);

    if (drawMatch) {
      return this.calculateEuropeanHandicapOutcome(
        model,
        'HOME',
        Number(drawMatch[1]),
        'DRAW',
      );
    }

    throw new BadRequestException(
      `Invalid EUROPEAN_HANDICAP selection: ${selection}`,
    );
  }

  private calculateEuropeanHandicapOutcome(
    model: MatchModel,
    side: string,
    handicap: number,
    desired: 'WIN' | 'DRAW',
  ): number {
    const matrix = this.buildScoreMatrix(
      model.expectedHomeGoals,
      model.expectedAwayGoals,
      10,
    );

    let probability = 0;

    for (const score of matrix) {
      const adjusted =
        side === 'HOME'
          ? score.home + handicap - score.away
          : score.away + handicap - score.home;

      const result =
        adjusted > 0 ? 'WIN' : Math.abs(adjusted) < 0.000001 ? 'DRAW' : 'LOSE';

      if (result === desired) {
        probability += score.probability;
      }
    }

    return probability;
  }

  // ============================================================
  // STATISTICAL MARKETS
  // ============================================================

  private calculateMetricTotalProbability(
    mean: number | undefined,
    selection: string,
  ): number | undefined {
    if (mean === undefined) {
      return undefined;
    }

    const parsed = selection.match(/^(OVER|UNDER)_(\d+(?:\.\d+)?)$/);

    if (!parsed) {
      return undefined;
    }

    const line = Number(parsed[2]);

    const under = this.poissonCdf(Math.floor(line), mean);

    return parsed[1] === 'OVER' ? 1 - under : under;
  }

  private calculateTeamMetricProbability(
    homeMean: number | undefined,
    awayMean: number | undefined,
    selection: string,
  ): number | undefined {
    if (homeMean === undefined || awayMean === undefined) {
      return undefined;
    }

    const parsed = selection.match(
      /^(HOME|AWAY)_(OVER|UNDER)_(\d+(?:\.\d+)?)$/,
    );

    if (!parsed) {
      return undefined;
    }

    const mean = parsed[1] === 'HOME' ? homeMean : awayMean;

    const line = Number(parsed[3]);

    const under = this.poissonCdf(Math.floor(line), mean);

    return parsed[2] === 'OVER' ? 1 - under : under;
  }

  private calculateMetricHandicapProbability(
    homeMean: number | undefined,
    awayMean: number | undefined,
    selection: string,
  ): number | undefined {
    if (homeMean === undefined || awayMean === undefined) {
      return undefined;
    }

    const parsed = selection.match(
      /^(HOME|AWAY)_(-?\d+(?:\.\d+)?)_(WIN|PUSH|LOSE)$/,
    );

    if (!parsed) {
      return undefined;
    }

    const side = parsed[1];

    const handicap = Number(parsed[2]);

    const desired = parsed[3];

    const matrix = this.buildScoreMatrix(homeMean, awayMean, 14);

    let probability = 0;

    for (const score of matrix) {
      const margin =
        side === 'HOME'
          ? score.home - score.away + handicap
          : score.away - score.home + handicap;

      const outcome =
        Math.abs(margin) < 0.000001 ? 'PUSH' : margin > 0 ? 'WIN' : 'LOSE';

      if (outcome === desired) {
        probability += score.probability;
      }
    }

    return probability;
  }

  private calculateMetricWinnerProbability(
    homeValue: number | undefined,
    awayValue: number | undefined,
    selection: string,
  ): number | undefined {
    if (homeValue === undefined || awayValue === undefined) {
      return undefined;
    }

    if (selection !== 'HOME' && selection !== 'DRAW' && selection !== 'AWAY') {
      return undefined;
    }

    const difference = homeValue - awayValue;

    if (Math.abs(difference) < 0.000001) {
      if (selection === 'DRAW') {
        return 0.5;
      }

      return 0.25;
    }

    const scale = Math.max(0.35, Math.abs(homeValue) + Math.abs(awayValue));

    const home = this.sigmoid(difference / (scale * 0.35));

    const away = 1 - home;

    return selection === 'HOME' ? home : selection === 'AWAY' ? away : 0.1;
  }

  private calculateFirstGoalProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const home = model.expectedHomeGoals;

    const away = model.expectedAwayGoals;

    const total = home + away;

    if (total <= 0) {
      return 0;
    }

    const noGoal = Math.exp(-total);

    if (selection === 'NONE' || selection === 'NO_GOAL') {
      return noGoal;
    }

    const goalOccurs = 1 - noGoal;

    if (selection === 'HOME') {
      return (home / total) * goalOccurs;
    }

    if (selection === 'AWAY') {
      return (away / total) * goalOccurs;
    }

    throw new BadRequestException(`Invalid FIRST_GOAL selection: ${selection}`);
  }

  private calculateLastGoalProbability(
    model: MatchModel,
    selection: string,
  ): number {
    return this.calculateFirstGoalProbability(model, selection);
  }

  private calculateWinToNilProbability(
    model: MatchModel,
    selection: string,
  ): number {
    if (selection !== 'HOME' && selection !== 'AWAY') {
      throw new BadRequestException(
        `Invalid WIN_TO_NIL selection: ${selection}`,
      );
    }

    const opponentGoals =
      selection === 'HOME' ? model.expectedAwayGoals : model.expectedHomeGoals;

    const opponentZero = this.poissonProbability(0, opponentGoals);

    const winningSide =
      selection === 'HOME'
        ? this.calculateSideWinProbability(
            model.expectedHomeGoals,
            model.expectedAwayGoals,
          )
        : this.calculateSideWinProbability(
            model.expectedAwayGoals,
            model.expectedHomeGoals,
          );

    const overall = this.calculateOverallProbabilities(model);

    const sideProbability = selection === 'HOME' ? overall.home : overall.away;

    const sideProbabilityDecimal = sideProbability / 100;

    const ratio =
      sideProbabilityDecimal <= 0
        ? 0
        : winningSide <= 0
          ? 0
          : Math.min(1, sideProbabilityDecimal / winningSide);

    return opponentZero * winningSide * ratio;
  }

  private calculateCorrectScoreProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.match(/^(\d+)-(\d+)$/);

    if (!parsed) {
      throw new BadRequestException(
        `Invalid CORRECT_SCORE selection: ${selection}`,
      );
    }

    return (
      this.poissonProbability(Number(parsed[1]), model.expectedHomeGoals) *
      this.poissonProbability(Number(parsed[2]), model.expectedAwayGoals)
    );
  }

  private calculateGoalTimingProbability(
    model: MatchModel,
    selection: string,
  ): number {
    const parsed = selection.match(/^(\d{1,2})_(\d{1,2})$/);

    if (!parsed) {
      throw new BadRequestException(
        `Invalid GOAL_TIMING selection: ${selection}`,
      );
    }

    const from = Number(parsed[1]);

    const to = Number(parsed[2]);

    if (from < 0 || to <= from || from >= 90 || to > 90) {
      throw new BadRequestException(`Invalid GOAL_TIMING range: ${selection}`);
    }

    const totalLambda = model.expectedHomeGoals + model.expectedAwayGoals;

    const intervalShare = (to - from) / 90;

    const intervalLambda = totalLambda * intervalShare;

    const beforeLambda = totalLambda * (from / 90);

    const beforeNoGoal = Math.exp(-beforeLambda);

    const intervalNoGoal = Math.exp(-intervalLambda);

    return beforeNoGoal * (1 - intervalNoGoal);
  }

  private calculateHalfMetricTotalProbability(
    homeMean: number | undefined,
    awayMean: number | undefined,
    selection: string,
    share: number,
  ): number | undefined {
    if (homeMean === undefined || awayMean === undefined) {
      return undefined;
    }

    const mean = (homeMean + awayMean) * share;

    return this.calculateMetricTotalProbability(mean, selection);
  }

  // ============================================================
  // CONFIDENCE
  // ============================================================

  private calculateConfidence(
    model: MatchModel,
    probabilities: {
      home: number;
      draw: number;
      away: number;
    },
    markets: MarketCalculation[],
  ): number {
    const ordered = [
      probabilities.home,
      probabilities.draw,
      probabilities.away,
    ].sort((a, b) => b - a);

    const predictionMargin = Math.max(0, ordered[0] - ordered[1]);

    const predictionClarity = this.clamp(45 + predictionMargin * 1.35, 0, 100);

    const marketSupport = markets.length
      ? this.average(
          markets.map((market) =>
            Math.max(market.probability, 100 - market.probability),
          ),
        )
      : 50;

    const confidence =
      model.qualityScore * 0.45 +
      predictionClarity * 0.3 +
      marketSupport * 0.25;

    return Math.max(1, Math.min(98, Math.round(confidence)));
  }

  private calculateSummaryQuality(
    home: TeamModel,
    away: TeamModel,
    predictor:
      | {
          home: number;
          draw: number;
          away: number;
        }
      | undefined,
  ): number {
    let score = 25;

    if (home.goalsForPerGame !== undefined) {
      score += 10;
    }

    if (home.goalsAgainstPerGame !== undefined) {
      score += 10;
    }

    if (away.goalsForPerGame !== undefined) {
      score += 10;
    }

    if (away.goalsAgainstPerGame !== undefined) {
      score += 10;
    }

    if (home.formScore !== undefined && away.formScore !== undefined) {
      score += 10;
    }

    if (predictor) {
      score += 15;
    }

    if (
      home.cornersPerGame !== undefined ||
      away.cornersPerGame !== undefined
    ) {
      score += 3;
    }

    if (home.cardsPerGame !== undefined || away.cardsPerGame !== undefined) {
      score += 3;
    }

    if (home.shotsPerGame !== undefined || away.shotsPerGame !== undefined) {
      score += 2;
    }

    return this.clamp(score, 1, 98);
  }

  // ============================================================
  // SCORE DISTRIBUTION
  // ============================================================

  private buildScoreMatrix(
    homeLambda: number,
    awayLambda: number,
    maxGoals: number,
  ): ScoreProbability[] {
    const matrix: ScoreProbability[] = [];

    let total = 0;

    for (let home = 0; home <= maxGoals; home += 1) {
      const homeProbability = this.poissonProbability(home, homeLambda);

      for (let away = 0; away <= maxGoals; away += 1) {
        const probability =
          homeProbability * this.poissonProbability(away, awayLambda);

        matrix.push({
          home,
          away,
          probability,
        });

        total += probability;
      }
    }

    if (total <= 0) {
      return matrix;
    }

    for (const item of matrix) {
      item.probability /= total;
    }

    return matrix;
  }

  private calculate1X2FromScoreMatrix(matrix: ScoreProbability[]): {
    home: number;
    draw: number;
    away: number;
  } {
    let home = 0;
    let draw = 0;
    let away = 0;

    for (const score of matrix) {
      if (score.home > score.away) {
        home += score.probability;
      } else if (score.home < score.away) {
        away += score.probability;
      } else {
        draw += score.probability;
      }
    }

    return {
      home,
      draw,
      away,
    };
  }

  private calculateSideWinProbability(
    sideLambda: number,
    opponentLambda: number,
  ): number {
    const matrix = this.buildScoreMatrix(sideLambda, opponentLambda, 10);

    let probability = 0;

    for (const score of matrix) {
      if (score.home > score.away) {
        probability += score.probability;
      }
    }

    return probability;
  }

  private extractResultProbabilityFromMatrix(
    matrix: ScoreProbability[],
    selection: string,
  ): number {
    if (selection !== 'HOME' && selection !== 'DRAW' && selection !== 'AWAY') {
      throw new BadRequestException(`Invalid result selection: ${selection}`);
    }

    const probabilities = this.calculate1X2FromScoreMatrix(matrix);

    return selection === 'HOME'
      ? probabilities.home
      : selection === 'DRAW'
        ? probabilities.draw
        : probabilities.away;
  }

  // ============================================================
  // POISSON
  // ============================================================

  private poissonProbability(k: number, lambda: number): number {
    if (k < 0 || !Number.isFinite(lambda) || lambda < 0) {
      return 0;
    }

    if (lambda === 0) {
      return k === 0 ? 1 : 0;
    }

    return (Math.exp(-lambda) * Math.pow(lambda, k)) / this.factorial(k);
  }

  private poissonCdf(k: number, lambda: number): number {
    if (k < 0) {
      return 0;
    }

    let total = 0;

    for (let i = 0; i <= k; i += 1) {
      total += this.poissonProbability(i, lambda);
    }

    return this.clamp(total, 0, 1);
  }

  private factorial(n: number): number {
    if (n <= 1) {
      return 1;
    }

    let result = 1;

    for (let i = 2; i <= n; i += 1) {
      result *= i;
    }

    return result;
  }

  // ============================================================
  // FORM
  // ============================================================

  private extractFormScore(
    candidate: TeamExtractionCandidate | undefined,
  ): number | undefined {
    const form = candidate?.form;

    if (typeof form === 'string') {
      const normalized = form.trim().toUpperCase();

      if (!normalized) {
        return undefined;
      }

      let points = 0;
      let count = 0;

      for (const char of normalized) {
        if (char === 'W') {
          points += 3;
          count += 1;
        } else if (char === 'D') {
          points += 1;
          count += 1;
        } else if (char === 'L') {
          count += 1;
        }
      }

      return count > 0 ? (points / (count * 3)) * 100 : undefined;
    }

    if (Array.isArray(form)) {
      let points = 0;
      let count = 0;

      for (const item of form) {
        const value = this.toString(item)?.toUpperCase();

        if (value === 'W') {
          points += 3;
          count += 1;
        } else if (value === 'D') {
          points += 1;
          count += 1;
        } else if (value === 'L') {
          count += 1;
        }
      }

      return count > 0 ? (points / (count * 3)) * 100 : undefined;
    }

    const record = this.asRecord(candidate?.record);

    const wins = this.toNumber(record?.wins);

    const draws = this.toNumber(record?.draws ?? record?.ties);

    const losses = this.toNumber(record?.losses);

    const total = (wins ?? 0) + (draws ?? 0) + (losses ?? 0);

    if (total <= 0) {
      return undefined;
    }

    return (((wins ?? 0) * 3 + (draws ?? 0)) / (total * 3)) * 100;
  }

  // ============================================================
  // HELPERS
  // ============================================================

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

    const country = payload.country;

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

  private extractFixtureTeamName(
    fixture: EspnFixtureDocument,
    side: 'home' | 'away',
  ): string | undefined {
    const payload: Record<string, unknown> =
      fixture.payload &&
      typeof fixture.payload === 'object' &&
      !Array.isArray(fixture.payload)
        ? fixture.payload
        : {};

    const competitions = Array.isArray(payload.competitions)
      ? payload.competitions
      : [];

    const competition =
      competitions[0] && typeof competitions[0] === 'object'
        ? (competitions[0] as Record<string, unknown>)
        : undefined;

    const competitors: Array<Record<string, unknown>> = Array.isArray(
      competition?.competitors,
    )
      ? (competition.competitors as Array<Record<string, unknown>>)
      : [];

    const competitor =
      competitors.find((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        return (item as Record<string, unknown>).homeAway === side;
      }) ?? competitors[side === 'home' ? 0 : 1];

    if (!competitor || typeof competitor !== 'object') {
      return undefined;
    }

    const record = competitor;

    const team =
      record.team && typeof record.team === 'object'
        ? (record.team as Record<string, unknown>)
        : record;

    return (
      this.toString(team.displayName) ??
      this.toString(team.name) ??
      this.toString(team.shortDisplayName)
    );
  }

  private extractFixtureTeamLogo(
    fixture: EspnFixtureDocument,
    side: 'home' | 'away',
  ): string | undefined {
    const payload: Record<string, unknown> =
      fixture.payload && typeof fixture.payload === 'object'
        ? fixture.payload
        : {};

    const competitions = Array.isArray(payload.competitions)
      ? payload.competitions
      : [];

    const competition =
      competitions[0] && typeof competitions[0] === 'object'
        ? (competitions[0] as Record<string, unknown>)
        : undefined;

    const competitors: unknown[] = Array.isArray(competition?.competitors)
      ? (competition.competitors as unknown[])
      : [];

    const competitor =
      competitors.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).homeAway === side,
      ) ?? competitors[side === 'home' ? 0 : 1];

    if (!competitor || typeof competitor !== 'object') {
      return undefined;
    }

    const record = competitor as Record<string, unknown>;

    const team =
      record.team && typeof record.team === 'object'
        ? (record.team as Record<string, unknown>)
        : record;

    return this.toString(team.logo) ?? this.toString(team.logos);
  }

  private normalizeMarket(value: string): PredictionMarket {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();

    if (
      !Object.values(PredictionMarkets).includes(normalized as PredictionMarket)
    ) {
      throw new BadRequestException(
        `Unsupported prediction market: ${normalized || value}`,
      );
    }

    return normalized as PredictionMarket;
  }

  private normalizeSelection(value: string): string {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private normalizeMetricKey(value: string | undefined | null): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
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

  private getResultCode(home: number, away: number): 'HOME' | 'DRAW' | 'AWAY' {
    if (home > away) {
      return 'HOME';
    }

    if (away > home) {
      return 'AWAY';
    }

    return 'DRAW';
  }

  private firstMetric(
    metrics: Record<string, number>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const normalized = this.normalizeMetricKey(key);

      if (metrics[normalized] !== undefined) {
        return metrics[normalized];
      }
    }

    return undefined;
  }

  private toPerGame(
    total: number | undefined,
    games: number | undefined,
  ): number | undefined {
    if (total === undefined || games === undefined || games <= 0) {
      return undefined;
    }

    return total / games;
  }

  private totalMetricMean(
    home: number | undefined,
    away: number | undefined,
  ): number | undefined {
    if (home === undefined || away === undefined) {
      return undefined;
    }

    return home + away;
  }

  private findNumericProperty(
    record: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const exact = record[key];

      const number = this.toNumber(exact);

      if (number !== null) {
        return number;
      }

      const normalizedTarget = this.normalizeMetricKey(key);

      const matchingKey = Object.keys(record).find(
        (candidate) => this.normalizeMetricKey(candidate) === normalizedTarget,
      );

      if (matchingKey) {
        const value = this.toNumber(record[matchingKey]);

        if (value !== null) {
          return value;
        }
      }
    }

    return undefined;
  }

  private getProbabilityValue(value: number | undefined): number | undefined {
    if (value === undefined || !Number.isFinite(value)) {
      return undefined;
    }

    return value > 1 ? value / 100 : value;
  }

  private normalizeThreeWayProbabilities(
    home: number,
    draw: number,
    away: number,
  ): {
    home: number;
    draw: number;
    away: number;
  } {
    const total = home + draw + away;

    if (total <= 0) {
      throw new BadRequestException(
        'ESPN Summary predictor returned unusable probabilities',
      );
    }

    return {
      home: home / total,
      draw: draw / total,
      away: away / total,
    };
  }

  private normalize(value: string | undefined | null): string {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private toString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value.trim() || undefined;
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    return undefined;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const normalized = value.replace('%', '').trim();

      const number = Number(normalized);

      return Number.isFinite(number) ? number : null;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;

      return (
        this.toNumber(record.value) ??
        this.toNumber(record.numericValue) ??
        this.toNumber(record.displayValue)
      );
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private sigmoid(value: number): number {
    return 1 / (1 + Math.exp(-value));
  }

  private average(values: number[]): number {
    if (!values.length) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private toPercentage(probability: number): number {
    const value = probability <= 1 ? probability * 100 : probability;

    return Number(this.clamp(value, 0, 100).toFixed(2));
  }
}
