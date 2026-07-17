import { Injectable } from '@nestjs/common';

import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsRevenueService } from './analytics-revenue.service';
import { AnalyticsLeaderboardService } from './analytics-leaderboard.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly overviewService: AnalyticsOverviewService,

    private readonly revenueService: AnalyticsRevenueService,

    private readonly leaderboardService: AnalyticsLeaderboardService,
  ) {}

  async getDashboard() {
    const [overview, revenue, leaderboards] = await Promise.all([
      this.overviewService.getOverview(),

      this.revenueService.getRevenue(),

      this.leaderboardService.getLeaderboards(),
    ]);

    return {
      users: overview.users,

      revenue,

      subscriptions: overview.subscriptions,

      predictions: overview.predictions,

      ads: overview.ads,

      promos: overview.promos,

      referrals: overview.referrals,

      leaderboards,
    };
  }
}
