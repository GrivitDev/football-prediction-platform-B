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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminAdsController {
  constructor(private readonly adsService: AdsService) {}

  /**
   * Create advertisement
   */
  @Post()
  async create(
    @Body() dto: CreateAdDto,

    @Req() req: Request,
  ) {
    const admin = req.user as any;

    return this.adsService.create(dto, admin._id.toString());
  }

  /**
   * Get all advertisements
   */
  @Get()
  async findAll() {
    return this.adsService.findAll();
  }

  /**
   * Get advertisement analytics
   */
  @Get('analytics')
  async analytics() {
    return this.adsService.getAnalytics();
  }

  /**
   * Get single advertisement
   */
  @Get(':id')
  async findOne(
    @Param('id')
    id: string,
  ) {
    return this.adsService.findOne(id);
  }

  /**
   * Update advertisement
   */
  @Patch(':id')
  async update(
    @Param('id')
    id: string,

    @Body()
    dto: UpdateAdDto,
  ) {
    return this.adsService.update(id, dto);
  }

  /**
   * Activate / deactivate advertisement
   */
  @Patch(':id/toggle')
  async toggle(
    @Param('id')
    id: string,
  ) {
    return this.adsService.toggleStatus(id);
  }

  /**
   * Delete advertisement
   */
  @Delete(':id')
  async remove(
    @Param('id')
    id: string,
  ) {
    return this.adsService.remove(id);
  }
}
