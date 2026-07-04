import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
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
  @Post()
  create(@GetUser() user: any, @Body() dto: CreateSubscriptionDto) {
    // FREE PLAN SAFE GUARD
    if (dto.plan === 'free') {
      return {
        message: 'Free plan does not require subscription',
        subscription: null,
      };
    }

    return this.service.createSubscription({
      userId: user._id,
      email: user.email,
      plan: dto.plan,
      amount: dto.amount,
      durationDays: 30,
    });
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
