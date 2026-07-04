import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';

import { SettlementService } from './settlement.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('settlement')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id')
  settle(
    @Param('id') id: string,
    @Body()
    body: {
      result: 'HOME' | 'AWAY' | 'DRAW' | 'VOID';
    },
  ) {
    return this.settlementService.settlePrediction(id, body.result);
  }
}
