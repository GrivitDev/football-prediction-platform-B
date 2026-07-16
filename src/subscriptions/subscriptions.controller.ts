import { Controller, Get, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

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
}
