import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { PredictionsService } from '../predictions/predictions.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private usersService: UsersService,
    private paymentsService: PaymentsService,
    private predictionsService: PredictionsService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async getDashboardStats() {
    try {
      const [
        totalUsers,
        vipUsers,
        totalPredictions,
        totalRevenue,
        totalPayments,
      ] = await Promise.all([
        this.usersService.countUsers(),

        // ✅ FIXED: VIP comes from subscriptions
        this.subscriptionsService.getVipUsers().then((v) => v.length),

        this.predictionsService.countPredictions(),
        this.paymentsService.getTotalRevenue(),
        this.paymentsService.countPayments(),
      ]);

      return {
        totalUsers,
        vipUsers,
        totalPredictions,
        totalRevenue,
        totalPayments,
      };
    } catch (error) {
      this.logger.error('Dashboard stats failed', error);
      throw error;
    }
  }

  async getRecentPayments(limit = 10) {
    return this.paymentsService.getRecentPayments(limit);
  }

  async getRecentUsers(limit = 10) {
    return this.usersService.getRecentUsers(limit);
  }
}
