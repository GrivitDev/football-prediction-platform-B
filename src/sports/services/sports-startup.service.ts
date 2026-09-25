import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { EspnActiveCompetitionService } from './espn-active-competition.service';
import { EspnQueueService } from './espn-queue.service';
import { SportsDerivedDataBootstrapService } from './sports-derived-data-bootstrap.service';
import { SportsSyncStateService } from './sports-sync-state.service';

import {
  EspnFixture,
  EspnFixtureDocument,
} from '../schemas/espn/espn-fixture.schema';

import { CompetitionPriority } from '../enums/competition-priority.enum';
import { EspnQueueJobType } from '../interfaces/espn-queue.interface';

import { EspnService } from '../providers/espn.service';

import { SportsCollectionService } from './sports-collection.service';
import { EspnQueueBuilderService } from './espn-queue-builder.service';
import { EspnQueueWorkerService } from './espn-queue-worker.service';

import { YoutubeHighlightService } from './youtube-highlight.service';
import { HeadToHeadService } from './head-to-head.service';
import { MatchDerivedDataService } from './match-derived-data.service';
import { TeamCompetitionStatsService } from './team-competition-stats.service';
import { TeamPerformanceProfileService } from './team-performance-profile.service';

// ============================================================
// TYPES
// ============================================================

type ActiveLeague = Awaited<
  ReturnType<EspnActiveCompetitionService['getActiveLeagues']>
>[number];

interface StartupLeagueContext {
  league: ActiveLeague;

  leagueId: string;

  season: number;

  priority: number;

  stateKey: string;
}

interface FinishedMatchWorkItem {
  stateKey: string;

  leagueId: string;

  season: number;

  priority: number;

  eventId: string;

  homeTeamId: string;

  awayTeamId: string;
}

@Injectable()
export class SportsStartupService implements OnModuleInit {
  private readonly logger = new Logger(SportsStartupService.name);

  private readonly threeHourWindowMs = 3 * 60 * 60 * 1000;

  private readonly startupFixtureForwardDays = 8;

  constructor(
    private readonly espnService: EspnService,

    private readonly espnActiveCompetitionService: EspnActiveCompetitionService,

    private readonly espnQueueService: EspnQueueService,

    private readonly espnQueueBuilderService: EspnQueueBuilderService,

    private readonly espnQueueWorkerService: EspnQueueWorkerService,

    private readonly sportsCollectionService: SportsCollectionService,

    private readonly sportsDerivedDataBootstrapService: SportsDerivedDataBootstrapService,

    private readonly sportsSyncStateService: SportsSyncStateService,

    private readonly youtubeHighlightService: YoutubeHighlightService,

    private readonly headToHeadService: HeadToHeadService,

    private readonly matchDerivedDataService: MatchDerivedDataService,

    private readonly teamCompetitionStatsService: TeamCompetitionStatsService,

    private readonly teamPerformanceProfileService: TeamPerformanceProfileService,

    @InjectModel(EspnFixture.name)
    private readonly espnFixtureModel: Model<EspnFixtureDocument>,
  ) {}

  // ============================================================
  // MODULE INIT
  // ============================================================

  onModuleInit(): void {
    this.logger.log('Starting ESPN background initialization');

    setTimeout(() => {
      void this.initializeEspn();
    }, 0);
  }

  // ============================================================
  // STARTUP PIPELINE
  // ============================================================

  private async initializeEspn(): Promise<void> {
    try {
      // --------------------------------------------------------
      // PHASE 1
      // LEAGUE CATALOGUE
      // --------------------------------------------------------

      const leagues =
        await this.espnActiveCompetitionService.synchronizeLeagueCatalogue();

      this.logger.log(
        `ESPN league catalogue synchronized: ${leagues.length} leagues`,
      );

      // --------------------------------------------------------
      // PHASE 2
      // LEAGUE DETAILS
      // --------------------------------------------------------

      const detailResult =
        await this.espnActiveCompetitionService.synchronizeMissingLeagueDetails();

      this.logger.log(
        `ESPN missing league-detail synchronization completed: ` +
          `processed=${detailResult.processed}, ` +
          `synchronized=${detailResult.synchronized}, ` +
          `active=${detailResult.active}, ` +
          `inactive=${detailResult.inactive}, ` +
          `skipped=${detailResult.skipped}, ` +
          `failed=${detailResult.failed}`,
      );

      const activeLeagues =
        await this.espnActiveCompetitionService.getActiveLeagues();

      this.logger.log(
        `Preparing ESPN startup pipeline for ${activeLeagues.length} active leagues`,
      );

      // --------------------------------------------------------
      // PREPARE PERSISTENT LEAGUE STATES
      // --------------------------------------------------------

      const leagueContexts = await this.prepareLeagueContexts(activeLeagues);

      // --------------------------------------------------------
      // PHASE 3
      // SCOREBOARD / FIXTURE COLLECTION
      //
      // IMPORTANT:
      // No summary, standings, derived-data, or YouTube work
      // starts until EVERY scoreboard request has finished.
      // --------------------------------------------------------

      await this.runScoreboardPhase(leagueContexts);

      this.logger.log(
        'ESPN SCOREBOARD PHASE completed. Moving to SUMMARY PHASE.',
      );

      // --------------------------------------------------------
      // BUILD FINISHED-MATCH WORK SET
      // --------------------------------------------------------

      const finishedMatches =
        await this.collectFinishedMatchWorkItems(leagueContexts);

      this.logger.log(
        `Finished-match work set prepared: matches=${finishedMatches.length}`,
      );

      // --------------------------------------------------------
      // PHASE 4
      // MATCH SUMMARY
      //
      // Only summary requests happen in this phase.
      // --------------------------------------------------------

      await this.runSummaryPhase(finishedMatches);

      this.logger.log(
        'ESPN SUMMARY PHASE completed. Moving to STANDINGS PHASE.',
      );

      // --------------------------------------------------------
      // PHASE 5
      // STANDINGS
      //
      // IMPORTANT:
      // Standings are requested ONCE PER LEAGUE,
      // not once per finished match.
      // --------------------------------------------------------

      await this.runStandingsPhase(leagueContexts, finishedMatches);

      this.logger.log(
        'ESPN STANDINGS PHASE completed. Moving to DERIVED-DATA PHASE.',
      );

      // --------------------------------------------------------
      // PHASE 6
      // DERIVED DATA
      // --------------------------------------------------------

      await this.runDerivedDataPhase(finishedMatches);

      this.logger.log(
        'ESPN DERIVED-DATA PHASE completed. Moving to YOUTUBE PHASE.',
      );

      // --------------------------------------------------------
      // PHASE 7
      // YOUTUBE
      // --------------------------------------------------------

      await this.runYoutubePhase(finishedMatches);

      this.logger.log(
        'ESPN YOUTUBE PHASE completed. Finalizing startup states.',
      );

      // --------------------------------------------------------
      // FINALIZE MATCH STATES
      // --------------------------------------------------------

      await this.finalizeFinishedMatchRecoveryStates(finishedMatches);

      // --------------------------------------------------------
      // FINALIZE LEAGUE RECOVERY STATES
      // --------------------------------------------------------

      for (const context of leagueContexts) {
        await this.sportsSyncStateService.refreshOverallStatus(
          context.stateKey,
        );
      }

      // --------------------------------------------------------
      // GLOBAL DERIVED-DATA RECOVERY
      //
      // Runs only after scoreboard -> summary -> standings.
      // --------------------------------------------------------

      await this.sportsDerivedDataBootstrapService.initialize();

      this.logger.log(
        'ESPN derived-data bootstrap/recovery verification completed',
      );

      // --------------------------------------------------------
      // VALIDATE FIXTURE RECOVERY
      // --------------------------------------------------------

      const incompleteRecoveryStates =
        await this.sportsSyncStateService.getIncompleteQueueStates([
          EspnQueueJobType.FIXTURE_RECOVERY,
        ]);

      if (incompleteRecoveryStates.length > 0) {
        throw new Error(
          `ESPN startup bootstrap is still incomplete. ` +
            `Incomplete fixture-recovery states=${incompleteRecoveryStates.length}`,
        );
      }

      // --------------------------------------------------------
      // VALIDATE FINISHED MATCH STATES
      // --------------------------------------------------------

      const incompleteFinishedStates =
        await this.sportsSyncStateService.getIncompleteQueueStates([
          EspnQueueJobType.FINISHED_MATCH,
        ]);

      if (incompleteFinishedStates.length > 0) {
        throw new Error(
          `ESPN startup bootstrap is still incomplete. ` +
            `Incomplete finished-match states=${incompleteFinishedStates.length}`,
        );
      }

      // --------------------------------------------------------
      // ONLY NOW RESTORE NORMAL OPERATIONS
      // --------------------------------------------------------

      const restored = await this.restoreNormalOperationsQueueStates();

      this.logger.log(
        `ESPN normal queue-state restoration completed: ` +
          `states=${restored.states}, ` +
          `queued=${restored.queued}, ` +
          `skipped=${restored.skipped}`,
      );

      // --------------------------------------------------------
      // INITIAL NORMAL REFRESH QUEUE
      // --------------------------------------------------------

      const initialQueue =
        await this.espnQueueBuilderService.buildDailyLeagueRefreshQueue();

      this.logger.log(
        `Initial normal ESPN league-refresh queue created: ` +
          `active=${initialQueue.active}, ` +
          `queued=${initialQueue.queued}, ` +
          `skipped=${initialQueue.skipped}`,
      );

      // --------------------------------------------------------
      // FINAL RELEASE
      // --------------------------------------------------------

      this.espnQueueService.markStartupReady();

      this.espnQueueService.markNormalOperationsReady();

      this.logger.log(
        'ESPN startup bootstrap is completely finished. ' +
          'Normal operations are now released.',
      );

      this.espnQueueWorkerService.start();
    } catch (error) {
      this.logger.error(
        'ESPN startup bootstrap failed. Sports synchronization remains locked.',
        error instanceof Error ? error.stack : String(error),
      );

      /*
       * Deliberately do NOT release:
       *
       * markStartupReady()
       * markNormalOperationsReady()
       * espnQueueWorkerService.start()
       *
       * Startup remains locked until the complete pipeline succeeds.
       */
    }
  }

  // ============================================================
  // PREPARE LEAGUE CONTEXTS
  // ============================================================

  private async prepareLeagueContexts(
    activeLeagues: ActiveLeague[],
  ): Promise<StartupLeagueContext[]> {
    const contexts: StartupLeagueContext[] = [];

    for (const league of activeLeagues) {
      if (!league.isActive) {
        continue;
      }

      if (typeof league.season !== 'number') {
        throw new Error(`Active league ${league.leagueId} has no valid season`);
      }

      if (!league.seasonStartDate) {
        throw new Error(
          `Active league ${league.leagueId} has no seasonStartDate`,
        );
      }

      const leagueId = (league.slug || league.leagueId).trim().toLowerCase();

      if (!leagueId) {
        throw new Error('Active league has no valid ESPN league ID');
      }

      const priority = this.getQueuePriority(league.priority);

      const stateKey = this.sportsSyncStateService.getQueueStateKey({
        jobType: EspnQueueJobType.FIXTURE_RECOVERY,

        leagueId,

        season: league.season,
      });

      await this.sportsSyncStateService.ensureQueueState({
        jobType: EspnQueueJobType.FIXTURE_RECOVERY,

        leagueId,

        season: league.season,

        priority,

        trackingMode: 'HISTORY',
      });

      await this.sportsSyncStateService.ensureDateWindow({
        stateKey,

        dateFrom: this.toDateOnly(new Date(league.seasonStartDate)),

        dateTo: this.toDateOnly(
          this.addUtcDays(
            this.startOfUtcDay(new Date()),
            this.startupFixtureForwardDays,
          ),
        ),

        trackingMode: 'HISTORY',
      });

      await this.sportsSyncStateService.ensureStepUnits(stateKey, [
        'standings',
        'finishedMatches',
      ]);

      await this.sportsSyncStateService.resetInterruptedUnits(stateKey);

      contexts.push({
        league,

        leagueId,

        season: league.season,

        priority,

        stateKey,
      });
    }

    return contexts;
  }

  // ============================================================
  // PHASE 3
  // SCOREBOARD / FIXTURES
  // ============================================================

  private async runScoreboardPhase(
    contexts: StartupLeagueContext[],
  ): Promise<void> {
    const failures: string[] = [];

    this.logger.log(
      `ESPN SCOREBOARD PHASE started: leagues=${contexts.length}`,
    );

    for (const context of contexts) {
      const incompleteDates =
        await this.sportsSyncStateService.getIncompleteDates(context.stateKey);

      this.logger.log(
        `Scoreboard bootstrap for ${context.leagueId}: ` +
          `remainingDates=${incompleteDates.length}`,
      );

      for (const dateKey of incompleteDates) {
        try {
          await this.processFixtureDate(
            context.stateKey,
            context.leagueId,
            dateKey,
          );
        } catch (error) {
          failures.push(
            `${context.leagueId} ${dateKey}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(`Scoreboard phase failed: ${failures.join('; ')}`);
    }

    this.logger.log('ESPN SCOREBOARD PHASE completed successfully');
  }

  private async processFixtureDate(
    stateKey: string,
    leagueId: string,
    dateKey: string,
  ): Promise<void> {
    await this.sportsSyncStateService.markDateProcessing(stateKey, dateKey);

    try {
      /*
       * This is the only ESPN endpoint category being used
       * during the scoreboard phase.
       */
      const response = await this.espnService.getFixturesForDate(
        leagueId,
        dateKey,
      );

      await this.sportsCollectionService.collectEspnFixtures(
        leagueId,
        response,
      );

      await this.sportsSyncStateService.markDateSuccess(stateKey, dateKey);

      this.logger.debug(`ESPN scoreboard completed: ${leagueId} ${dateKey}`);
    } catch (error) {
      await this.sportsSyncStateService.markDateFailed(
        stateKey,
        dateKey,
        error,
      );

      throw error;
    }
  }

  // ============================================================
  // BUILD FINISHED-MATCH WORK SET
  // ============================================================

  private async collectFinishedMatchWorkItems(
    contexts: StartupLeagueContext[],
  ): Promise<FinishedMatchWorkItem[]> {
    const cutoff = new Date(Date.now() - this.threeHourWindowMs);

    const incompleteStates =
      await this.sportsSyncStateService.getIncompleteQueueStates([
        EspnQueueJobType.FINISHED_MATCH,
      ]);

    const incompleteStateMap = new Map<
      string,
      Awaited<
        ReturnType<SportsSyncStateService['getIncompleteQueueStates']>
      >[number]
    >();

    for (const state of incompleteStates) {
      if (!state.eventId) {
        continue;
      }

      const key = this.getFinishedMatchKey(
        state.leagueId,
        state.season,
        state.eventId,
      );

      incompleteStateMap.set(key, state);
    }

    const workMap = new Map<string, FinishedMatchWorkItem>();

    for (const context of contexts) {
      const fixtures = await this.espnFixtureModel
        .find({
          leagueId: context.leagueId,

          season: context.season,

          completed: true,

          fixtureDate: {
            $lte: cutoff,
          },
        })
        .select({
          eventId: 1,
          leagueId: 1,
          season: 1,
          fixtureDate: 1,
          homeTeamId: 1,
          awayTeamId: 1,
          'payload.summary': 1,
        })
        .sort({
          fixtureDate: 1,
        })
        .lean()
        .exec();

      for (const fixture of fixtures) {
        if (!fixture.eventId) {
          continue;
        }

        const eventId = String(fixture.eventId);

        const homeTeamId = fixture.homeTeamId?.trim();

        const awayTeamId = fixture.awayTeamId?.trim();

        if (!homeTeamId || !awayTeamId) {
          this.logger.warn(
            `Skipping finished match ${eventId}: ` +
              'missing homeTeamId or awayTeamId',
          );

          continue;
        }

        const key = this.getFinishedMatchKey(
          context.leagueId,
          context.season,
          eventId,
        );

        const incompleteState = incompleteStateMap.get(key);

        /*
         * We only need to bootstrap a match when:
         *
         * 1. Its summary is missing, OR
         * 2. It already has an incomplete FINISHED_MATCH state.
         */
        if (!fixture.payload?.summary && !incompleteState) {
          const stateKey = this.sportsSyncStateService.getQueueStateKey({
            jobType: EspnQueueJobType.FINISHED_MATCH,

            leagueId: context.leagueId,

            season: context.season,

            eventId,
          });

          workMap.set(key, {
            stateKey,

            leagueId: context.leagueId,

            season: context.season,

            priority: context.priority,

            eventId,

            homeTeamId,

            awayTeamId,
          });

          continue;
        }

        if (incompleteState) {
          workMap.set(key, {
            stateKey: incompleteState.stateKey,

            leagueId: context.leagueId,

            season: context.season,

            priority: context.priority,

            eventId,

            homeTeamId,

            awayTeamId,
          });
        }
      }
    }

    /*
     * Ensure every finished-match work item has its persistent
     * synchronization state before the summary phase starts.
     */
    for (const workItem of workMap.values()) {
      await this.sportsSyncStateService.ensureQueueState({
        jobType: EspnQueueJobType.FINISHED_MATCH,

        leagueId: workItem.leagueId,

        season: workItem.season,

        eventId: workItem.eventId,

        priority: workItem.priority,

        trackingMode: 'WINDOW',
      });

      await this.sportsSyncStateService.ensureStepUnits(workItem.stateKey, [
        'summary',
        'standings',
        'teamCompetitionStats',
        'teamPerformanceProfile',
        'headToHead',
        'derivedData',
        'youtube',
      ]);

      await this.sportsSyncStateService.resetInterruptedUnits(
        workItem.stateKey,
      );
    }

    return Array.from(workMap.values());
  }

  // ============================================================
  // PHASE 4
  // SUMMARY
  // ============================================================

  private async runSummaryPhase(
    workItems: FinishedMatchWorkItem[],
  ): Promise<void> {
    const failures: string[] = [];

    this.logger.log(`ESPN SUMMARY PHASE started: matches=${workItems.length}`);

    /*
     * IMPORTANT:
     *
     * This phase performs summary work only.
     * No standings.
     * No team statistics.
     * No derived data.
     * No YouTube.
     */
    for (const workItem of workItems) {
      try {
        await this.runTrackedStep(workItem.stateKey, 'summary', async () => {
          const fixture = await this.espnFixtureModel
            .findOne({
              eventId: workItem.eventId,

              leagueId: workItem.leagueId,

              season: workItem.season,
            })
            .select({
              eventId: 1,
              'payload.summary': 1,
            })
            .lean()
            .exec();

          if (!fixture) {
            throw new Error(
              `Finished match fixture ${workItem.eventId} not found`,
            );
          }

          if (fixture.payload?.summary) {
            return;
          }

          /*
           * This is the only ESPN match-summary request
           * performed during this phase.
           */
          const summary = await this.espnService.getMatchSummary(
            workItem.leagueId,
            workItem.eventId,
          );

          await this.sportsCollectionService.collectEspnMatchSummary({
            leagueId: workItem.leagueId,

            eventId: workItem.eventId,

            summary,
          });
        });
      } catch (error) {
        failures.push(
          `${workItem.leagueId}/${workItem.eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Summary phase failed: ${failures.join('; ')}`);
    }

    this.logger.log('ESPN SUMMARY PHASE completed successfully');
  }

  // ============================================================
  // PHASE 5
  // STANDINGS
  // ============================================================

  private async runStandingsPhase(
    contexts: StartupLeagueContext[],
    workItems: FinishedMatchWorkItem[],
  ): Promise<void> {
    const failures: string[] = [];

    this.logger.log(`ESPN STANDINGS PHASE started: leagues=${contexts.length}`);

    /*
     * Standings are fetched ONCE per league.
     *
     * This removes the old behavior where every finished match
     * independently called getStandings().
     */
    for (const context of contexts) {
      try {
        await this.runTrackedStep(context.stateKey, 'standings', async () => {
          /*
           * This is the only ESPN standings request for this
           * league during startup.
           */
          const standingsResponse = await this.espnService.getStandings(
            context.leagueId,
          );

          await this.sportsCollectionService.collectEspnStandings(
            context.leagueId,
            standingsResponse,
            context.season,
          );
        });
      } catch (error) {
        failures.push(
          `${context.leagueId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Standings phase failed: ${failures.join('; ')}`);
    }

    /*
     * Finished-match states also contain a standings unit.
     *
     * That unit now means:
     * "league standings required by this match have been collected."
     *
     * We mark that dependency complete here WITHOUT making
     * another standings request.
     */
    for (const workItem of workItems) {
      try {
        await this.runTrackedStep(
          workItem.stateKey,
          'standings',
          async () => undefined,
        );
      } catch (error) {
        failures.push(
          `${workItem.leagueId}/${workItem.eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Standings phase finalization failed: ${failures.join('; ')}`,
      );
    }

    this.logger.log('ESPN STANDINGS PHASE completed successfully');
  }

  // ============================================================
  // PHASE 6
  // DERIVED DATA
  // ============================================================

  private async runDerivedDataPhase(
    workItems: FinishedMatchWorkItem[],
  ): Promise<void> {
    const failures: string[] = [];

    this.logger.log(
      `ESPN DERIVED-DATA PHASE started: matches=${workItems.length}`,
    );

    /*
     * This recovery/bootstrap pass is intentionally delayed until
     * AFTER scoreboard, summary, and standings are finished.
     */
    await this.sportsDerivedDataBootstrapService.initialize();

    for (const workItem of workItems) {
      try {
        /*
         * ------------------------------------------------------
         * TEAM COMPETITION STATS
         * ------------------------------------------------------
         */

        await this.runTrackedStep(
          workItem.stateKey,
          'teamCompetitionStats',
          async () => {
            await this.teamCompetitionStatsService.refreshForFixture(
              workItem.leagueId,
              workItem.season,
              workItem.eventId,
            );
          },
        );

        /*
         * ------------------------------------------------------
         * TEAM PERFORMANCE PROFILE
         * ------------------------------------------------------
         */

        await this.runTrackedStep(
          workItem.stateKey,
          'teamPerformanceProfile',
          async () => {
            await this.teamPerformanceProfileService.refreshForFixture(
              workItem.eventId,
            );
          },
        );

        /*
         * ------------------------------------------------------
         * HEAD TO HEAD
         * ------------------------------------------------------
         */

        await this.runTrackedStep(workItem.stateKey, 'headToHead', async () => {
          await this.headToHeadService.refreshForFixture(workItem.eventId);
        });

        /*
         * ------------------------------------------------------
         * MATCH DERIVED DATA
         * ------------------------------------------------------
         */

        await this.runTrackedStep(
          workItem.stateKey,
          'derivedData',
          async () => {
            await this.matchDerivedDataService.rebuildUpcomingForTeams(
              workItem.leagueId,
              workItem.season,
              [workItem.homeTeamId, workItem.awayTeamId],
            );
          },
        );
      } catch (error) {
        failures.push(
          `${workItem.leagueId}/${workItem.eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Derived-data phase failed: ${failures.join('; ')}`);
    }

    this.logger.log('ESPN DERIVED-DATA PHASE completed successfully');
  }

  // ============================================================
  // PHASE 7
  // YOUTUBE
  // ============================================================

  private async runYoutubePhase(
    workItems: FinishedMatchWorkItem[],
  ): Promise<void> {
    const failures: string[] = [];

    this.logger.log(`ESPN YOUTUBE PHASE started: matches=${workItems.length}`);

    /*
     * YouTube is deliberately separated from the ESPN phases.
     */
    for (const workItem of workItems) {
      try {
        await this.runTrackedStep(workItem.stateKey, 'youtube', async () => {
          await this.youtubeHighlightService.processFixture(workItem.eventId);
        });
      } catch (error) {
        failures.push(
          `${workItem.leagueId}/${workItem.eventId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`YouTube phase failed: ${failures.join('; ')}`);
    }

    this.logger.log('ESPN YOUTUBE PHASE completed successfully');
  }

  // ============================================================
  // FINALIZE FINISHED-MATCH STATES
  // ============================================================

  private async finalizeFinishedMatchRecoveryStates(
    workItems: FinishedMatchWorkItem[],
  ): Promise<void> {
    const leagueStateMap = new Map<string, number>();

    for (const workItem of workItems) {
      const key = `${workItem.leagueId}:${workItem.season}`;

      leagueStateMap.set(key, (leagueStateMap.get(key) ?? 0) + 1);
    }

    /*
     * Every FINISHED_MATCH state should now be completely done.
     */
    for (const workItem of workItems) {
      await this.sportsSyncStateService.refreshOverallStatus(workItem.stateKey);

      const complete = await this.sportsSyncStateService.isComplete(
        workItem.stateKey,
      );

      if (!complete) {
        throw new Error(
          `Finished-match synchronization state ${workItem.stateKey} is not complete`,
        );
      }
    }

    this.logger.log(
      `Finished-match recovery finalized: matches=${workItems.length}, ` +
        `leagues=${leagueStateMap.size}`,
    );
  }

  // ============================================================
  // TRACKED STEP
  // ============================================================

  private async runTrackedStep(
    stateKey: string,
    stepKey: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const successful = await this.sportsSyncStateService.isUnitSuccessful(
      stateKey,
      `STEP:${stepKey}`,
    );

    if (successful) {
      return;
    }

    await this.sportsSyncStateService.markStepProcessing(stateKey, stepKey);

    try {
      await action();

      await this.sportsSyncStateService.markStepSuccess(stateKey, stepKey);
    } catch (error) {
      await this.sportsSyncStateService.markStepFailed(
        stateKey,
        stepKey,
        error,
      );

      throw error;
    }
  }

  // ============================================================
  // PERSISTENT QUEUE RESTORATION
  // ============================================================

  private async restoreNormalOperationsQueueStates(): Promise<{
    states: number;
    queued: number;
    skipped: number;
  }> {
    const states = await this.sportsSyncStateService.getIncompleteQueueStates([
      EspnQueueJobType.LEAGUE_REFRESH,
      EspnQueueJobType.UPCOMING_MATCH,
    ]);

    let queued = 0;

    let skipped = 0;

    for (const state of states) {
      if (!state.leagueId) {
        skipped += 1;

        continue;
      }

      try {
        let job: Awaited<ReturnType<EspnQueueService['addJob']>> | undefined;

        switch (state.jobType) {
          case EspnQueueJobType.LEAGUE_REFRESH:
            job = await this.espnQueueService.addLeagueRefreshJob({
              leagueId: state.leagueId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),

              triggerEventId: state.eventId,
            });
            break;

          case EspnQueueJobType.UPCOMING_MATCH:
            if (typeof state.season !== 'number' || !state.eventId) {
              skipped += 1;

              continue;
            }

            job = await this.espnQueueService.addUpcomingMatchJob({
              leagueId: state.leagueId,

              eventId: state.eventId,

              season: state.season,

              priority: state.priority ?? 4,

              scheduledFor: new Date(),
            });
            break;

          default:
            skipped += 1;

            continue;
        }

        if (
          String(job.status) === 'PENDING' &&
          Number(job.attempts ?? 0) === 0
        ) {
          queued += 1;
        }
      } catch (error) {
        skipped += 1;

        this.logger.error(
          `Failed to restore normal synchronization state ${state.stateKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      states: states.length,

      queued,

      skipped,
    };
  }

  // ============================================================
  // PRIORITY
  // ============================================================

  private getQueuePriority(priority: CompetitionPriority | undefined): number {
    switch (priority) {
      case CompetitionPriority.ELITE:
        return 1;

      case CompetitionPriority.HIGH:
        return 2;

      case CompetitionPriority.REGIONAL:
        return 3;

      case CompetitionPriority.SELECTIVE:
      default:
        return 4;
    }
  }

  // ============================================================
  // DATE HELPERS
  // ============================================================

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private addUtcDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // ============================================================
  // FINISHED MATCH KEY
  // ============================================================

  private getFinishedMatchKey(
    leagueId: string | undefined,
    season: number | undefined,
    eventId: string,
  ): string {
    return `${leagueId ?? ''}:${season ?? ''}:${eventId}`;
  }

  // ============================================================
  // QUEUE STATE
  // ============================================================

  private async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    return {
      pending: await this.espnQueueService.countPending(),

      processing: await this.espnQueueService.countProcessing(),

      completed: await this.espnQueueService.countCompleted(),

      failed: await this.espnQueueService.countFailed(),
    };
  }
}
