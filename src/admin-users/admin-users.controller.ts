import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  // =========================
  // GET USERS LIST
  // =========================
  @Get()
  getUsers(@Query() query: any) {
    return this.adminUsersService.getUsers(query);
  }

  // =========================
  // GET USER DETAILS
  // =========================
  @Get(':id/details')
  getUserDetails(@Param('id') id: string) {
    return this.adminUsersService.getUserDetails(id);
  }

  // =========================
  // SUSPEND USER
  // =========================
  @Patch(':id/suspend')
  suspend(@Param('id') id: string, @Body() body: any) {
    return this.adminUsersService.suspendUser(id, body);
  }

  // =========================
  // ACTIVATE USER
  // =========================
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.adminUsersService.activateUser(id);
  }

  // =========================
  // DELETE USER
  // =========================
  @Patch(':id/delete')
  delete(@Param('id') id: string) {
    return this.adminUsersService.deleteUser(id);
  }

  // =========================
  // FORCE LOGOUT ALL DEVICES
  // =========================
  @Patch(':id/logout-all')
  logoutAll(@Param('id') id: string) {
    return this.adminUsersService.logoutAll(id);
  }

  @Get(':id/sessions')
  getUserSessions(@Param('id') id: string) {
    return this.adminUsersService.getUserSessions(id);
  }

  @Patch(':id/sessions/:sessionId/revoke')
  revokeSession(@Param('sessionId') sessionId: string) {
    return this.adminUsersService.revokeSession(sessionId);
  }
}
