import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { AdsService } from './ads.service';

import { CreateAdDto } from './dto/create-ad.dto';

import { UpdateAdDto } from './dto/update-ad.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { RolesGuard } from '../common/guards/roles.guard';

import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/ads')
@UseGuards(
  JwtAuthGuard,

  RolesGuard,
)
@Roles('admin')
export class AdminAdsController {
  constructor(private readonly adsService: AdsService) {}

  // =====================================================
  // CREATE AD
  // =====================================================

  @Post()
  async create(
    @Body() dto: CreateAdDto,

    @Req() req: Request,
  ) {
    const user = req.user as any;

    return this.adsService.create(
      dto,

      user._id.toString(),
    );
  }

  // =====================================================
  // GET ALL ADS
  // =====================================================

  @Get()
  async findAll() {
    return this.adsService.findAll();
  }

  // =====================================================
  // GET SINGLE AD
  // =====================================================

  @Get(':id')
  async findOne(
    @Param('id')
    id: string,
  ) {
    return this.adsService.findOne(id);
  }

  // =====================================================
  // UPDATE AD
  // =====================================================

  @Patch(':id')
  async update(
    @Param('id')
    id: string,

    @Body() dto: UpdateAdDto,
  ) {
    return this.adsService.update(
      id,

      dto,
    );
  }

  // =====================================================
  // DELETE AD
  // =====================================================

  @Delete(':id')
  async remove(
    @Param('id')
    id: string,
  ) {
    return this.adsService.remove(id);
  }

  // =====================================================
  // TOGGLE ACTIVE STATUS
  // =====================================================

  @Patch(':id/status')
  async toggleStatus(
    @Param('id')
    id: string,
  ) {
    return this.adsService.toggleStatus(id);
  }

  // =====================================================
  // ANALYTICS
  // =====================================================

  @Get('analytics/overview')
  async analytics() {
    return this.adsService.getAnalytics();
  }
}
