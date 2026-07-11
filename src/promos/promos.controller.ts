import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { PromosService } from './promos.service';

import { CreatePromoDto } from './dto/create-promo.dto';

import { UpdatePromoDto } from './dto/update-promo.dto';

import { PromoEngineService } from './promo-engine.service';

@Controller('promos')
export class PromosController {
  constructor(
    private readonly promosService: PromosService,

    private readonly promoEngineService: PromoEngineService,
  ) {}

  // ==========================
  // CREATE PROMO
  // ==========================

  @Post()
  create(@Body() dto: CreatePromoDto) {
    return this.promosService.createPromo(dto);
  }

  // ==========================
  // GET ALL PROMOS
  // ==========================

  @Get()
  findAll() {
    return this.promosService.findAll();
  }

  // ==========================
  // ACTIVE PROMOS
  // ==========================

  @Get('active')
  active() {
    return this.promosService.getActivePromos();
  }

  // ==========================
  // USER PROMO PROGRESS
  // ==========================

  @Get('my-progress')
  @UseGuards(AuthGuard('jwt'))
  getMyProgress(@Req() req: any) {
    return this.promoEngineService.getUserPromoProgress(
      req.user._id.toString(),
    );
  }

  // ==========================
  // UPDATE PROMO
  // ==========================

  @Patch(':id')
  update(
    @Param('id') id: string,

    @Body() dto: UpdatePromoDto,
  ) {
    return this.promosService.updatePromo(id, dto);
  }

  // ==========================
  // DISABLE PROMO
  // ==========================

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.promosService.deactivatePromo(id);
  }
}
