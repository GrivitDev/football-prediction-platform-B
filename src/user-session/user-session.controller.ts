import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { UserSessionService } from './user-session.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UserSessionController {
  constructor(private readonly sessionService: UserSessionService) {}

  // =========================
  // GET USER SESSIONS
  // =========================
  @UseGuards(JwtAuthGuard)
  @Get('user/:userId')
  getUserSessions(@Param('userId') userId: string) {
    return this.sessionService.getUserSessions(userId);
  }

  // =========================
  // REVOKE SESSION
  // =========================
  @Patch(':sessionId/revoke')
  revokeSession(@Param('sessionId') sessionId: string) {
    return this.sessionService.revokeSession(sessionId);
  }

  // =========================
  // REVOKE ALL USER SESSIONS
  // =========================
  @Patch('user/:userId/revoke-all')
  revokeAll(@Param('userId') userId: string) {
    return this.sessionService.revokeAllUserSessions(userId);
  }
}
