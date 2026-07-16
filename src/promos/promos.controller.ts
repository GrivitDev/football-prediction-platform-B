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
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

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
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
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

  @Get(':promoId/status')
  @UseGuards(AuthGuard('jwt'))
  async getJoinStatus(@Param('promoId') promoId: string, @Req() req: any) {
    return this.promoEngineService.getJoinStatus(
      promoId,
      req.user._id.toString(),
    );
  }

  @Get('my-progress')
  @UseGuards(AuthGuard('jwt'))
  getMyProgress(@Req() req: any) {
    return this.promoEngineService.getUserPromoProgress(
      req.user._id.toString(),
    );
  }

  @Post(':promoId/join')
  @UseGuards(AuthGuard('jwt'))
  joinReferralCampaign(@Param('promoId') promoId: string, @Req() req: any) {
    return this.promoEngineService.joinReferralCampaign(
      promoId,
      req.user._id.toString(),
    );
  }

  // ==========================
  // ADMIN - ALL AWARDED REWARDS
  // ==========================

  @Get('admin/rewards')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getAllAwardedRewards() {
    return this.promoEngineService.getAllAwardedRewards();
  }

  @Patch('rewards/:id/pay')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  markCashRewardPaid(@Param('id') id: string) {
    return this.promoEngineService.markCashRewardPaid(id);
  }
  // ==========================
  // GET SINGLE PROMO
  // ==========================

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  findOne(@Param('id') id: string) {
    return this.promosService.findOne(id);
  }

  // ==========================
  // UPDATE PROMO
  // ==========================

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdatePromoDto) {
    return this.promosService.updatePromo(id, dto);
  }

  // ==========================
  // DISABLE PROMO
  // ==========================

  @Patch(':id/deactivate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  deactivate(@Param('id') id: string) {
    return this.promosService.deactivatePromo(id);
  }

  @Get('active/direct')
  getDirectPromos() {
    return this.promosService.getActiveDirectPromos();
  }

  @Get('active/referral')
  getReferralPromos() {
    return this.promosService.getActiveReferralPromos();
  }

  // ==========================
  // ADMIN - PROMO REWARDS
  // ==========================

  @Get(':promoId/rewards')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getPromoRewards(@Param('promoId') promoId: string) {
    return this.promoEngineService.getPromoRewards(promoId);
  }

  // ==========================
  // MY REWARDS
  // ==========================

  @Get('my-rewards')
  @UseGuards(AuthGuard('jwt'))
  getMyRewards(@Req() req: any) {
    return this.promoEngineService.getUserRewards(req.user._id.toString());
  }

  // ==========================
  // ADMIN - ALL CLAIMED REWARDS
  // ==========================

  @Get('admin/claimed-rewards')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getAllClaimedRewards() {
    return this.promoEngineService.getAllClaimedRewards();
  }

  // ==========================
  // ADMIN - CASH PAYOUT QUEUE
  // ==========================

  @Get('admin/pending-cash')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getPendingCashRewards() {
    return this.promoEngineService.getPendingCashRewards();
  }
}
