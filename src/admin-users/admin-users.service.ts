import { Injectable } from '@nestjs/common';

import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PredictionPurchasesService } from '../prediction-purchases/prediction-purchases.service';
import { UserSessionService } from '../user-session/user-session.service';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly paymentsService: PaymentsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly purchasesService: PredictionPurchasesService,
    private readonly sessionsService: UserSessionService,
  ) {}

  // =====================================
  // USERS LIST
  // =====================================
  async getUsers(query: any) {
    return this.usersService.findAll(query);
  }

  // =====================================
  // USER DETAILS
  // =====================================
  async getUserDetails(userId: string) {
    const [
      user,
      paymentSummary,
      subscriptionSummary,
      purchaseSummary,
      sessionSummary,
    ] = await Promise.all([
      this.usersService.findById(userId),

      this.paymentsService.getPaymentSummary(userId),

      this.subscriptionsService.getSubscriptionSummary(userId),

      this.purchasesService.getPurchaseSummary(userId),

      this.sessionsService.getSessionSummary(userId),
    ]);

    return {
      user,

      payments: paymentSummary,

      subscription: subscriptionSummary,

      purchases: purchaseSummary,

      sessions: sessionSummary,
    };
  }

  // =====================================
  // USER ACTIONS
  // =====================================
  async suspendUser(userId: string, data: any) {
    return this.usersService.suspendUser(userId, data);
  }

  async activateUser(userId: string) {
    return this.usersService.activateUser(userId);
  }

  async deleteUser(userId: string) {
    return this.usersService.softDeleteUser(userId);
  }

  async logoutAll(userId: string) {
    return this.sessionsService.revokeAllUserSessions(userId);
  }
}
