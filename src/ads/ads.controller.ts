import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import type { Request } from 'express';

import { AdsService } from './ads.service';

import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get('policy')
  @UseGuards(OptionalJwtAuthGuard)
  async getPolicy(@Req() req: Request) {
    const user = req.user as any;

    return this.adsService.getPolicy(user?._id?.toString());
  }
}
