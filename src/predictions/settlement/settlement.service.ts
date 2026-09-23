import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Prediction,
  PredictionDocument,
  PredictionMarketEntry,
  PredictionMarketStatus,
} from '../schemas/prediction.schema';

import { SportsDataReadService } from '../../sports/services/sports-data-read.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../../sports/schemas/espn/espn-fixture.schema';

type SettlementResult = 'VOID' | 'ESPN';

interface MarketSettlement {
  market: PredictionMarketEntry['market'];
  selection: PredictionMarketEntry['selection'];
  status: PredictionMarketStatus;
}

interface MatchScore {
  home: number;
  away: number;
}

interface HalfTimeScore extends MatchScore {}

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  private readonly completedStatuses = new Set([
    'FT',
    'AET',
    'PEN',
    'FINAL',
    'FINISHED',
    'COMPLETED',
    'POST',
    'STATUS_FINAL',
  ]);

  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly sportsDataReadService: SportsDataReadService,
  ) {}

  // ============================================================
  // MANUAL / DIRECT SETTLEMENT
  // ============================================================

  async settlePrediction(id: string, result: SettlementResult = 'ESPN') {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    if (prediction.settled) {
      throw new BadRequestException('Prediction already settled');
    }

    // ==========================================================
    // MANUAL VOID
    // ==========================================================

    if (result === 'VOID') {
      for (const market of prediction.markets) {
        market.status = 'void';
      }

      prediction.status = 'void';

      prediction.settled = true;

      prediction.settledAt = new Date();

      return prediction.save();
    }

    // ==========================================================
    // ESPN SETTLEMENT
    // ==========================================================

    const fixture = await this.sportsDataReadService.getFixtureByEventId(
      prediction.matchId,
    );

    if (!fixture) {
      throw new BadRequestException(
        `ESPN fixture ${prediction.matchId} was not found`,
      );
    }

    if (!this.isCompletedFixture(fixture)) {
      throw new BadRequestException(
        `ESPN fixture ${prediction.matchId} is not finished`,
      );
    }

    const score = this.getFinalScore(fixture);

    if (!score) {
      throw new BadRequestException(
        `ESPN fixture ${prediction.matchId} has no final score`,
      );
    }

    const settlements = this.settleMarkets(prediction, fixture, score);

    this.applyMarketSettlements(prediction, settlements);

    prediction.status = this.getOverallPredictionStatus(prediction.markets);

    const allMarketsSettled = prediction.markets.every(
      (market) => market.status !== 'pending',
    );

    if (allMarketsSettled) {
      prediction.settled = true;
      prediction.settledAt = new Date();
    }

    await prediction.save();

    this.logger.log(
      `Prediction ${prediction._id} settled from ESPN: ${prediction.status}`,
    );

    return prediction;
  }

  // ============================================================
  // AUTOMATIC SETTLEMENT
  // ============================================================

  async settlePendingPredictions() {
    const threeHoursAgoTimestamp = Date.now() - 3 * 60 * 60 * 1000;

    const predictions = await this.predictionModel.find({
      deleted: false,

      settled: false,

      status: 'pending',

      kickoffTimestamp: {
        $lte: threeHoursAgoTimestamp,
      },

      matchId: {
        $exists: true,
        $nin: [null, ''],
      },
    });

    if (!predictions.length) {
      this.logger.log('Automatic settlement: no eligible predictions found.');

      return {
        processed: 0,
        settled: 0,
        skipped: 0,
      };
    }

    const matchIds = [
      ...new Set(predictions.map((prediction) => String(prediction.matchId))),
    ];

    const fixtures =
      await this.sportsDataReadService.getFixturesByEventIds(matchIds);

    const fixturesById = new Map<string, EspnFixtureDocument>(
      fixtures.map((fixture) => [String(fixture.eventId), fixture]),
    );

    let settledCount = 0;
    let skippedCount = 0;

    for (const prediction of predictions) {
      const matchId = String(prediction.matchId);

      const fixture = fixturesById.get(matchId);

      if (!fixture) {
        skippedCount++;

        this.logger.warn(
          `ESPN fixture ${matchId} is not available. Prediction ${prediction._id} remains pending.`,
        );

        continue;
      }

      if (!this.isCompletedFixture(fixture)) {
        skippedCount++;

        this.logger.warn(
          `ESPN fixture ${matchId} is not finished. Prediction ${prediction._id} remains pending.`,
        );

        continue;
      }

      const score = this.getFinalScore(fixture);

      if (!score) {
        skippedCount++;

        this.logger.warn(
          `ESPN fixture ${matchId} has no final score. Prediction ${prediction._id} remains pending.`,
        );

        continue;
      }

      try {
        const settlements = this.settleMarkets(prediction, fixture, score);

        this.applyMarketSettlements(prediction, settlements);

        prediction.status = this.getOverallPredictionStatus(prediction.markets);

        const allMarketsSettled = prediction.markets.every(
          (market) => market.status !== 'pending',
        );

        if (!allMarketsSettled) {
          skippedCount++;

          await prediction.save();

          this.logger.warn(
            `Prediction ${prediction._id} contains market(s) that could not be settled and remains pending.`,
          );

          continue;
        }

        prediction.settled = true;
        prediction.settledAt = new Date();

        await prediction.save();

        settledCount++;

        this.logger.log(
          `Prediction ${prediction._id} settled from ESPN: ${prediction.status} for ${fixture.homeTeamId} vs ${fixture.awayTeamId}.`,
        );
      } catch (error) {
        skippedCount++;

        this.logger.error(
          `Failed to settle prediction ${prediction._id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Automatic ESPN settlement complete: ${settledCount} settled, ${skippedCount} skipped.`,
    );

    return {
      processed: predictions.length,
      settled: settledCount,
      skipped: skippedCount,
    };
  }

  // ============================================================
  // MARKET SETTLEMENT
  // ============================================================

  private settleMarkets(
    prediction: PredictionDocument,
    fixture: EspnFixtureDocument,
    score: MatchScore,
  ): MarketSettlement[] {
    return prediction.markets.map((market) => ({
      market: market.market,
      selection: market.selection,
      status: this.evaluateMarket(
        market.market,
        market.selection,
        fixture,
        score,
      ),
    }));
  }

  private evaluateMarket(
    market: string,
    selection: string,
    fixture: EspnFixtureDocument,
    score: MatchScore,
  ): PredictionMarketStatus {
    const normalizedMarket = this.normalize(market);

    const normalizedSelection = this.normalize(selection);

    const totalGoals = score.home + score.away;

    // ==========================================================
    // MATCH RESULT
    // ==========================================================

    if (normalizedMarket === 'DOUBLE_CHANCE') {
      switch (normalizedSelection) {
        case 'HOME_OR_DRAW':
        case 'HOME_DRAW':
        case '1X':
          return score.home >= score.away ? 'won' : 'lost';

        case 'AWAY_OR_DRAW':
        case 'AWAY_DRAW':
        case 'X2':
          return score.away >= score.home ? 'won' : 'lost';

        case 'HOME_OR_AWAY':
        case 'HOME_AWAY':
        case '12':
          return score.home !== score.away ? 'won' : 'lost';

        default:
          return 'pending';
      }
    }

    if (normalizedMarket === 'DRAW_NO_BET') {
      const side = normalizedSelection;

      if (side !== 'HOME' && side !== 'AWAY') {
        return 'pending';
      }

      if (score.home === score.away) {
        return 'push';
      }

      if (side === 'HOME' && score.home > score.away) {
        return 'won';
      }

      if (side === 'AWAY' && score.away > score.home) {
        return 'won';
      }

      return 'lost';
    }

    // ==========================================================
    // OVER / UNDER
    // ==========================================================

    if (normalizedMarket === 'OVER_UNDER') {
      const parsed = normalizedSelection.match(
        /^(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5|4\.5|5\.5)$/,
      );

      if (!parsed) {
        return 'pending';
      }

      const direction = parsed[1];

      const line = Number(parsed[2]);

      if (direction === 'OVER') {
        return totalGoals > line ? 'won' : 'lost';
      }

      return totalGoals < line ? 'won' : 'lost';
    }

    // ==========================================================
    // BTTS
    // ==========================================================

    if (normalizedMarket === 'BOTH_TEAMS_TO_SCORE') {
      const btts = score.home > 0 && score.away > 0;

      if (normalizedSelection === 'YES') {
        return btts ? 'won' : 'lost';
      }

      if (normalizedSelection === 'NO') {
        return !btts ? 'won' : 'lost';
      }

      return 'pending';
    }

    // ==========================================================
    // GOAL RANGE
    // ==========================================================

    if (normalizedMarket === 'GOAL_RANGE') {
      switch (normalizedSelection) {
        case '0':
          return totalGoals === 0 ? 'won' : 'lost';

        case '1_2':
        case '1-2':
          return totalGoals >= 1 && totalGoals <= 2 ? 'won' : 'lost';

        case '3_4':
        case '3-4':
          return totalGoals >= 3 && totalGoals <= 4 ? 'won' : 'lost';

        case '5_PLUS':
        case '5+':
          return totalGoals >= 5 ? 'won' : 'lost';

        default:
          return 'pending';
      }
    }

    // ==========================================================
    // TEAM TOTAL GOALS
    // ==========================================================

    if (normalizedMarket === 'TEAM_TOTAL_GOALS') {
      const parsed = normalizedSelection.match(
        /^(HOME|AWAY)_(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5)$/,
      );

      if (!parsed) {
        return 'pending';
      }

      const side = parsed[1];

      const direction = parsed[2];

      const line = Number(parsed[3]);

      const goals = side === 'HOME' ? score.home : score.away;

      return direction === 'OVER'
        ? goals > line
          ? 'won'
          : 'lost'
        : goals < line
          ? 'won'
          : 'lost';
    }

    // ==========================================================
    // EXACT GOALS
    // ==========================================================

    if (normalizedMarket === 'EXACT_GOALS') {
      const parsed = normalizedSelection.match(/^(HOME|AWAY)_(0|1|2|3|4|5|6)$/);

      if (!parsed) {
        return 'pending';
      }

      const side = parsed[1];

      const expected = Number(parsed[2]);

      const actual = side === 'HOME' ? score.home : score.away;

      return actual === expected ? 'won' : 'lost';
    }

    // ==========================================================
    // CLEAN SHEET
    // ==========================================================

    if (normalizedMarket === 'CLEAN_SHEET') {
      if (normalizedSelection === 'HOME') {
        return score.away === 0 ? 'won' : 'lost';
      }

      if (normalizedSelection === 'AWAY') {
        return score.home === 0 ? 'won' : 'lost';
      }

      return 'pending';
    }

    // ==========================================================
    // HALF-TIME / SECOND-HALF
    // ==========================================================

    if (
      normalizedMarket === 'HALF_TIME_RESULT' ||
      normalizedMarket === 'SECOND_HALF_RESULT' ||
      normalizedMarket === 'HALF_TIME_FULL_TIME' ||
      normalizedMarket === 'FIRST_HALF_GOALS' ||
      normalizedMarket === 'SECOND_HALF_GOALS'
    ) {
      const halfTime = this.getHalfTimeScore(fixture);

      if (!halfTime) {
        return 'pending';
      }

      const secondHalf = {
        home: score.home - halfTime.home,

        away: score.away - halfTime.away,
      };

      if (normalizedMarket === 'HALF_TIME_RESULT') {
        return this.evaluateResultSelection(
          normalizedSelection,
          halfTime.home,
          halfTime.away,
        );
      }

      if (normalizedMarket === 'SECOND_HALF_RESULT') {
        return this.evaluateResultSelection(
          normalizedSelection,
          secondHalf.home,
          secondHalf.away,
        );
      }

      if (normalizedMarket === 'HALF_TIME_FULL_TIME') {
        const [ht, ft] = normalizedSelection.split('_');

        if (!ht || !ft) {
          return 'pending';
        }

        const actualHt = this.getResultCode(halfTime.home, halfTime.away);

        const actualFt = this.getResultCode(score.home, score.away);

        return ht === actualHt && ft === actualFt ? 'won' : 'lost';
      }

      if (
        normalizedMarket === 'FIRST_HALF_GOALS' ||
        normalizedMarket === 'SECOND_HALF_GOALS'
      ) {
        const parsed = normalizedSelection.match(
          /^(OVER|UNDER)_(0\.5|1\.5|2\.5|3\.5)$/,
        );

        if (!parsed) {
          return 'pending';
        }

        const goals =
          normalizedMarket === 'FIRST_HALF_GOALS'
            ? halfTime.home + halfTime.away
            : secondHalf.home + secondHalf.away;

        const line = Number(parsed[2]);

        return parsed[1] === 'OVER'
          ? goals > line
            ? 'won'
            : 'lost'
          : goals < line
            ? 'won'
            : 'lost';
      }
    }

    // ==========================================================
    // ASIAN HANDICAP
    // ==========================================================

    if (normalizedMarket === 'ASIAN_HANDICAP') {
      const parsed = normalizedSelection.match(
        /^(HOME|AWAY)_(-?\d+(?:\.\d+)?)_(WIN|PUSH|LOSE)$/,
      );

      if (!parsed) {
        return 'pending';
      }

      const side = parsed[1];

      const handicap = Number(parsed[2]);

      const requestedOutcome = parsed[3];

      const margin =
        side === 'HOME'
          ? score.home - score.away + handicap
          : score.away - score.home + handicap;

      let actualOutcome: 'WIN' | 'PUSH' | 'LOSE';

      if (margin > 0) {
        actualOutcome = 'WIN';
      } else if (Math.abs(margin) < 0.000001) {
        actualOutcome = 'PUSH';
      } else {
        actualOutcome = 'LOSE';
      }

      return requestedOutcome === actualOutcome
        ? requestedOutcome === 'PUSH'
          ? 'push'
          : 'won'
        : 'lost';
    }

    // ==========================================================
    // EUROPEAN HANDICAP
    // ==========================================================

    if (normalizedMarket === 'EUROPEAN_HANDICAP') {
      const winMatch = normalizedSelection.match(/^(HOME|AWAY)_(-?\d+)_WIN$/);

      if (winMatch) {
        const side = winMatch[1];

        const handicap = Number(winMatch[2]);

        const adjusted =
          side === 'HOME'
            ? score.home + handicap - score.away
            : score.away + handicap - score.home;

        return this.getResultFromMargin(adjusted, 'HOME_WIN') === 'HOME_WIN'
          ? 'won'
          : 'lost';
      }

      const drawMatch = normalizedSelection.match(/^DRAW_(-?\d+)$/);

      if (drawMatch) {
        const handicap = Number(drawMatch[1]);

        const adjusted = score.home + handicap - score.away;

        return Math.abs(adjusted) < 0.000001 ? 'won' : 'lost';
      }

      return 'pending';
    }

    // ==========================================================
    // FIRST GOAL
    // ==========================================================

    if (normalizedMarket === 'FIRST_GOAL') {
      const first = this.getFirstScoringTeam(fixture);

      if (normalizedSelection === 'HOME') {
        if (!first) {
          return 'lost';
        }

        return first === 'home' ? 'won' : 'lost';
      }

      if (normalizedSelection === 'AWAY') {
        if (!first) {
          return 'lost';
        }

        return first === 'away' ? 'won' : 'lost';
      }

      if (normalizedSelection === 'NONE' || normalizedSelection === 'NO_GOAL') {
        return first === null ? 'won' : 'lost';
      }

      return 'pending';
    }

    // ==========================================================
    // CORRECT SCORE
    // ==========================================================

    if (normalizedMarket === 'CORRECT_SCORE') {
      const scoreSelection = normalizedSelection.match(/^(\d+)-(\d+)$/);

      if (!scoreSelection) {
        return 'pending';
      }

      const home = Number(scoreSelection[1]);

      const away = Number(scoreSelection[2]);

      return home === score.home && away === score.away ? 'won' : 'lost';
    }

    /*
     * Markets that do not yet have a defined
     * settlement contract remain pending.
     *
     * This prevents us from guessing how a
     * market should be settled.
     */
    return 'pending';
  }

  // ============================================================
  // APPLY RESULTS
  // ============================================================

  private applyMarketSettlements(
    prediction: PredictionDocument,
    settlements: MarketSettlement[],
  ) {
    for (const settlement of settlements) {
      const market = prediction.markets.find(
        (item) =>
          item.market === settlement.market &&
          item.selection === settlement.selection,
      );

      if (!market) {
        continue;
      }

      market.status = settlement.status;
    }
  }

  // ============================================================
  // OVERALL STATUS
  // ============================================================

  private getOverallPredictionStatus(
    markets: PredictionMarketEntry[],
  ): 'pending' | 'won' | 'lost' | 'void' {
    if (!markets.length) {
      return 'pending';
    }

    if (markets.some((market) => market.status === 'lost')) {
      return 'lost';
    }

    if (markets.some((market) => market.status === 'pending')) {
      return 'pending';
    }

    const hasWon = markets.some((market) => market.status === 'won');

    if (hasWon) {
      return 'won';
    }

    return 'void';
  }

  // ============================================================
  // ESPN SCORE
  // ============================================================

  private getFinalScore(fixture: EspnFixtureDocument): MatchScore | null {
    if (
      fixture.homeScore === undefined ||
      fixture.awayScore === undefined ||
      !Number.isFinite(fixture.homeScore) ||
      !Number.isFinite(fixture.awayScore)
    ) {
      return null;
    }

    return {
      home: fixture.homeScore,
      away: fixture.awayScore,
    };
  }

  private isCompletedFixture(fixture: EspnFixtureDocument): boolean {
    if (fixture.completed === true) {
      return true;
    }

    return this.completedStatuses.has(
      String(fixture.status ?? '')
        .trim()
        .toUpperCase(),
    );
  }

  // ============================================================
  // HALF-TIME
  // ============================================================

  private getHalfTimeScore(fixture: EspnFixtureDocument): HalfTimeScore | null {
    const competition = this.getCompetition(fixture);

    const details = Array.isArray(competition?.details)
      ? competition.details
      : [];

    let home = 0;
    let away = 0;
    let foundScoringEvent = false;

    for (const detail of details) {
      if (!detail || typeof detail !== 'object') {
        continue;
      }

      const record = detail as Record<string, unknown>;

      if (record.scoringPlay !== true) {
        continue;
      }

      const teamId = this.toString(
        this.getNestedValue(record, ['team', 'id']) ?? record.teamId,
      );

      if (!teamId) {
        continue;
      }

      const minute = this.extractMinute(record);

      if (minute > 45) {
        continue;
      }

      foundScoringEvent = true;

      if (teamId === fixture.homeTeamId) {
        home++;
      } else if (teamId === fixture.awayTeamId) {
        away++;
      }
    }

    /*
     * 0-0 at half-time is also valid when
     * there simply were no first-half scoring
     * events. In that case we can safely return 0-0
     * because no scoring event means no goals.
     */
    if (!foundScoringEvent) {
      return {
        home: 0,
        away: 0,
      };
    }

    return {
      home,
      away,
    };
  }

  // ============================================================
  // FIRST SCORER
  // ============================================================

  private getFirstScoringTeam(
    fixture: EspnFixtureDocument,
  ): 'home' | 'away' | null {
    const competition = this.getCompetition(fixture);

    const details = Array.isArray(competition?.details)
      ? competition.details
      : [];

    const scoringEvents = details
      .filter(
        (detail) =>
          detail &&
          typeof detail === 'object' &&
          (detail as Record<string, unknown>).scoringPlay === true,
      )
      .map((detail) => ({
        detail: detail as Record<string, unknown>,

        minute: this.extractMinute(detail as Record<string, unknown>),
      }))
      .sort((a, b) => a.minute - b.minute);

    for (const item of scoringEvents) {
      const teamId = this.toString(
        this.getNestedValue(item.detail, ['team', 'id']) ?? item.detail.teamId,
      );

      if (teamId === fixture.homeTeamId) {
        return 'home';
      }

      if (teamId === fixture.awayTeamId) {
        return 'away';
      }
    }

    return null;
  }

  // ============================================================
  // RESULT HELPERS
  // ============================================================

  private evaluateResultSelection(
    selection: string,
    home: number,
    away: number,
  ): PredictionMarketStatus {
    const actual = this.getResultCode(home, away);

    return selection === actual ? 'won' : 'lost';
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

  private getResultFromMargin(margin: number, result: string): string {
    if (result === 'HOME_WIN') {
      return margin > 0 ? 'HOME_WIN' : 'OTHER';
    }

    return 'OTHER';
  }

  // ============================================================
  // PAYLOAD HELPERS
  // ============================================================

  private getCompetition(
    fixture: EspnFixtureDocument,
  ): Record<string, any> | null {
    const competitions = fixture.payload?.['competitions'];

    if (!Array.isArray(competitions)) {
      return null;
    }

    const competition = competitions[0];

    return competition && typeof competition === 'object'
      ? (competition as Record<string, any>)
      : null;
  }

  private extractMinute(detail: Record<string, unknown>): number {
    const clock = detail.clock;

    if (clock && typeof clock === 'object') {
      const clockRecord = clock as Record<string, unknown>;

      const direct =
        this.toNumber(clockRecord.value) ?? this.toNumber(clockRecord.minutes);

      if (direct !== null) {
        return direct;
      }

      const display = clockRecord.displayValue;

      if (typeof display === 'string') {
        const match = display.match(/^(\d+)/);

        if (match) {
          return Number(match[1]);
        }
      }
    }

    return this.toNumber(clock) ?? 90;
  }

  private getNestedValue(value: unknown, path: string[]): unknown {
    let current = value;

    for (const key of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private normalize(value: string): string {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const number = Number(value.replace('%', '').trim());

      return Number.isFinite(number) ? number : null;
    }

    return null;
  }

  private toString(value: unknown): string | null {
    if (typeof value === 'string') {
      return value.trim() || null;
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    return null;
  }
}
