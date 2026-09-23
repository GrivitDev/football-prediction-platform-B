import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { SettlementService } from './settlement.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { RolesGuard } from '../../common/guards/roles.guard';

import { Roles } from '../../common/decorators/roles.decorator';

@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  // ==========================================================
  // SETTLE FROM ESPN
  // ==========================================================

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id')
  settle(@Param('id') id: string) {
    return this.settlementService.settlePrediction(id, 'ESPN');
  }

  // ==========================================================
  // MANUAL VOID
  // ==========================================================

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/void')
  voidPrediction(@Param('id') id: string) {
    return this.settlementService.settlePrediction(id, 'VOID');
  }
}
