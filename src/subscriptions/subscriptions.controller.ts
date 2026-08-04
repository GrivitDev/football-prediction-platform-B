import { Controller, Get, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { PlanConfigService } from 'src/plan-config/plan-config.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly service: SubscriptionsService,
    private readonly planConfigService: PlanConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMySubscription(@GetUser() user: any) {
    return this.service.getActiveSubscription(user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@GetUser() user: any) {
    const subscription = await this.service.getActiveSubscription(user._id);

    const plan = await this.service.getUserPlan(user._id);

    return {
      plan,
      subscription,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('upgrade-price')
  async getUpgradePrice(@GetUser() user: any) {
    const config = await this.planConfigService.get();

    return this.service.calculateUpgradePrice(
      user._id,
      config.regularPrice,
      config.vipPrice,
      config.subscriptionDurationDays,
    );
  }
}
