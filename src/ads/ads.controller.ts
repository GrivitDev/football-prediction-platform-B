import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { AdsService } from './ads.service';

import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';

import { AdPage } from './enums/ad-page.enum';

import { AdDevice } from './enums/ad-device.enum';

@Controller('ads')
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  // =====================================================
  // EXTERNAL ADS POLICY
  // Determines who sees external ads
  // =====================================================

  @Get('policy')
  @UseGuards(OptionalJwtAuthGuard)
  async getPolicy(@Req() req: Request) {
    const user = req.user as any;

    return this.adsService.getPolicy(user?._id?.toString());
  }

  // =====================================================
  // GET INTERNAL ADS FOR PAGE
  // =====================================================

  @Get()
  async getAds(
    @Query('page') page: AdPage,

    @Query('device') device: AdDevice,
  ) {
    return this.adsService.getPageAds(
      page,

      device,
    );
  }

  // =====================================================
  // RECORD IMPRESSION
  // =====================================================

  @Post(':id/impression')
  async recordImpression(
    @Param('id')
    id: string,
  ) {
    return this.adsService.recordImpression(id);
  }

  // =====================================================
  // RECORD CLICK
  // =====================================================

  @Post(':id/click')
  async recordClick(
    @Param('id')
    id: string,
  ) {
    return this.adsService.recordClick(id);
  }
}
