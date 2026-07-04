import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AnalyticsService } from './analytics.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // =========================
  // DASHBOARD
  // =========================
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('dashboard')
  getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  // =========================
  // RECENT PAYMENTS
  // =========================
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('recent-payments')
  getRecentPayments(@Query('limit') limit?: string) {
    return this.analyticsService.getRecentPayments(parseInt(limit || '10', 10));
  }

  // =========================
  // RECENT USERS
  // =========================
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('recent-users')
  getRecentUsers(@Query('limit') limit?: string) {
    return this.analyticsService.getRecentUsers(parseInt(limit || '10', 10));
  }
}
