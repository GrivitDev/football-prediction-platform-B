import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { UserSessionService } from './user-session.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class UserSessionController {
  constructor(private readonly sessionService: UserSessionService) {}

  // =========================
  // USER SESSIONS
  // =========================

  @Get('me')
  getMySessions(@GetUser() user: any) {
    return this.sessionService.getUserSessions(user._id);
  }

  // =========================
  // LOGOUT CURRENT DEVICE
  // =========================

  @Patch('current/logout')
  async logoutCurrent(@GetUser() user: any) {
    if (!user.sessionId) {
      return {
        message: 'No active session found',
      };
    }

    await this.sessionService.revokeSession(user.sessionId);

    return {
      message: 'Logged out successfully',
    };
  }

  // =========================
  // LOGOUT ALL DEVICES
  // =========================

  @Patch('logout-all')
  async logoutAll(@GetUser() user: any) {
    await this.sessionService.deactivateAllUserSessions(user._id);

    return {
      message: 'All sessions logged out',
    };
  }

  // =========================
  // ADMIN SESSION VIEW
  // =========================

  @Get('user/:userId')
  getUserSessions(
    @Param('userId')
    userId: string,
  ) {
    return this.sessionService.getUserSessions(userId);
  }

  @Patch(':sessionId/revoke')
  revokeSession(
    @Param('sessionId')
    sessionId: string,
  ) {
    return this.sessionService.revokeSession(sessionId);
  }
}
