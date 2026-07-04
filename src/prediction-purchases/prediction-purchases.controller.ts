import { Body, Controller, Param, Post, UseGuards, Get } from '@nestjs/common';

import { PredictionPurchasesService } from './prediction-purchases.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('purchases')
export class PredictionPurchasesController {
  constructor(private readonly service: PredictionPurchasesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('initialize')
  initialize(@GetUser() user: any, @Body() body: { predictionId: string }) {
    return this.service.initializePurchase(user._id, body.predictionId);
  }

  // ADMIN OR PAYMENT SYSTEM
  @Post('success/:reference')
  markSuccess(@Param('reference') reference: string) {
    return this.service.markAsSuccess(reference);
  }
  @UseGuards(JwtAuthGuard)
  @Get('me')
  myPurchases(@GetUser() user: any) {
    return this.service.getMyPurchases(user._id);
  }
}
