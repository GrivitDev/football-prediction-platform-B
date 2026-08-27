import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Prediction, PredictionDocument } from '../schemas/prediction.schema';

import { FootballDataService } from '../../sports/football-data.service';

type SettlementResult = 'HOME' | 'AWAY' | 'DRAW' | 'VOID';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectModel(Prediction.name)
    private readonly predictionModel: Model<PredictionDocument>,

    private readonly footballDataService: FootballDataService,
  ) {}

  // ============================================================
  // MANUAL SETTLEMENT
  // ============================================================
  //
  // Keeps the existing admin settlement functionality.
  //
  // POST /settlement/:id
  //
  // {
  //   "result": "HOME"
  // }
  //
  // ============================================================

  async settlePrediction(id: string, actualResult: SettlementResult) {
    const prediction = await this.predictionModel.findById(id);

    if (!prediction || prediction.deleted) {
      throw new NotFoundException('Prediction not found');
    }

    if (prediction.settled) {
      throw new BadRequestException('Prediction already settled');
    }

    // ==========================================================
    // VOID
    // ==========================================================

    if (actualResult === 'VOID') {
      prediction.status = 'void';
    }

    // ==========================================================
    // NORMAL RESULT
    // ==========================================================
    else {
      prediction.status =
        prediction.prediction === actualResult ? 'won' : 'lost';
    }

    prediction.settled = true;
    prediction.settledAt = new Date();

    return prediction.save();
  }

  // ============================================================
  // AUTOMATIC SETTLEMENT
  // ============================================================
  //
  // Finds predictions that:
  //
  // - are not deleted
  // - are still pending
  // - are not settled
  // - kicked off at least 3 hours ago
  //
  // Then fetches all their match results in one API request.
  //
  // ============================================================

  async settlePendingPredictions() {
    const threeHoursAgoTimestamp = Date.now() - 3 * 60 * 60 * 1000;

    // ==========================================================
    // FIND ELIGIBLE PREDICTIONS
    // ==========================================================

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

    // ==========================================================
    // NOTHING TO SETTLE
    // ==========================================================

    if (!predictions.length) {
      this.logger.log('Automatic settlement: no eligible predictions found.');

      return {
        processed: 0,
        settled: 0,
        skipped: 0,
      };
    }

    this.logger.log(
      `Automatic settlement: ${predictions.length} prediction(s) eligible.`,
    );

    // ==========================================================
    // GET UNIQUE MATCH IDS
    // ==========================================================

    const matchIds = [
      ...new Set(predictions.map((prediction) => String(prediction.matchId))),
    ];

    if (!matchIds.length) {
      return {
        processed: predictions.length,
        settled: 0,
        skipped: predictions.length,
      };
    }

    // ==========================================================
    // FETCH MATCH RESULTS
    // ==========================================================
    //
    // ONE football-data.org request for all match IDs.
    //
    // ==========================================================

    const matches =
      await this.footballDataService.getFinishedMatchesByIds(matchIds);

    // ==========================================================
    // INDEX RESULTS BY MATCH ID
    // ==========================================================

    const matchesById = new Map(
      matches.map((match) => [String(match.id), match]),
    );

    let settledCount = 0;
    let skippedCount = 0;

    // ==========================================================
    // PROCESS PREDICTIONS
    // ==========================================================

    for (const prediction of predictions) {
      const matchId = String(prediction.matchId);

      const match = matchesById.get(matchId);

      // ========================================================
      // MATCH RESULT NOT AVAILABLE
      // ========================================================
      //
      // Leave the prediction pending.
      //
      // The next cron run can try again.
      //
      // ========================================================

      if (!match) {
        skippedCount++;

        this.logger.warn(
          `Match ${matchId} is not available as FINISHED. Prediction ${prediction._id} remains pending.`,
        );

        continue;
      }

      // ========================================================
      // SAFETY CHECK
      // ========================================================

      if (match.status !== 'FINISHED') {
        skippedCount++;

        this.logger.warn(
          `Match ${matchId} has status ${match.status}. Prediction remains pending.`,
        );

        continue;
      }

      // ========================================================
      // SCORE CHECK
      // ========================================================

      if (
        match.homeScore === null ||
        match.homeScore === undefined ||
        match.awayScore === null ||
        match.awayScore === undefined
      ) {
        skippedCount++;

        this.logger.warn(
          `Match ${matchId} has no final score. Prediction remains pending.`,
        );

        continue;
      }

      // ========================================================
      // DETERMINE RESULT
      // ========================================================

      const actualResult = this.determineResult(
        match.homeScore,
        match.awayScore,
      );

      // ========================================================
      // SETTLE
      // ========================================================

      try {
        await this.settlePrediction(String(prediction._id), actualResult);

        settledCount++;

        this.logger.log(
          `Prediction ${prediction._id} settled: ${prediction.prediction} → ${actualResult} for ${match.homeTeam} vs ${match.awayTeam}.`,
        );
      } catch (error) {
        skippedCount++;

        this.logger.error(
          `Failed to settle prediction ${prediction._id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // ==========================================================
    // SUMMARY
    // ==========================================================

    this.logger.log(
      `Automatic settlement complete: ${settledCount} settled, ${skippedCount} skipped.`,
    );

    return {
      processed: predictions.length,
      settled: settledCount,
      skipped: skippedCount,
    };
  }

  // ============================================================
  // DETERMINE MATCH RESULT
  // ============================================================

  private determineResult(
    homeScore: number,
    awayScore: number,
  ): Exclude<SettlementResult, 'VOID'> {
    if (homeScore > awayScore) {
      return 'HOME';
    }

    if (awayScore > homeScore) {
      return 'AWAY';
    }

    return 'DRAW';
  }
}
