import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { ReferralsService } from './referrals.service';

import { UsersService } from '../users/users.service';

@Controller('referrals')
export class ReferralsController {
  constructor(
    private readonly referralsService: ReferralsService,

    private readonly usersService: UsersService,
  ) {}

  // =====================================
  // GET USER REFERRAL LINK
  // =====================================

  @Get('my-link')
  @UseGuards(AuthGuard('jwt'))
  async getMyReferralLink(@Req() req: any) {
    const user = await this.usersService.findById(req.user._id.toString());

    if (!user) {
      return null;
    }

    const referralCode = user.username;

    return {
      referralCode,

      referralUrl: `${process.env.FRONTEND_URL}/register?ref=${referralCode}`,
    };
  }

  // =====================================
  // GET MY REFERRALS
  // =====================================

  @Get('my-referrals')
  @UseGuards(AuthGuard('jwt'))
  async getMyReferrals(@Req() req: any) {
    return this.referralsService.getUserReferrals(req.user._id.toString());
  }

  // =====================================
  // REFERRAL STATS
  // =====================================

  @Get('stats')
  @UseGuards(AuthGuard('jwt'))
  async getStats(@Req() req: any) {
    const userId = req.user._id.toString();

    const total = await this.referralsService.countReferrals(userId);

    const referrals = await this.referralsService.getUserReferrals(userId);

    const registered = referrals.filter(
      (referral) => referral.registered,
    ).length;

    const regularSubscribers = referrals.filter(
      (referral) => referral.regularSubscription,
    ).length;

    const vipSubscribers = referrals.filter(
      (referral) => referral.vipSubscription,
    ).length;

    const predictions = referrals.filter(
      (referral) => referral.predictionPurchased,
    ).length;

    return {
      total,

      registered,

      regularSubscribers,

      vipSubscribers,

      predictionPurchases: predictions,
    };
  }

  // =====================================
  // TEST
  // =====================================

  @Get('test')
  test() {
    return {
      message: 'Referral module working',
    };
  }
}
