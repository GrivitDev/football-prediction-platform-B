import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { InternalAdsService } from './internal-ads.service';

import { CreateInternalAdDto } from './dto/create-internal-ad.dto';
import { UpdateInternalAdDto } from './dto/update-internal-ad.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

import { Roles } from '../common/decorators/roles.decorator';

@Controller('internal-ads')
export class InternalAdsController {
  constructor(private readonly adsService: InternalAdsService) {}

  // =============================
  // PUBLIC
  // =============================

  @Get()
  getActiveAds() {
    return this.adsService.getActiveAds();
  }

  // =============================
  // ADMIN
  // =============================

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  findAll() {
    return this.adsService.findAll();
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.adsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() createAdDto: CreateInternalAdDto) {
    return this.adsService.create(createAdDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() updateAdDto: UpdateInternalAdDto) {
    return this.adsService.update(id, updateAdDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.adsService.remove(id);
  }
}
