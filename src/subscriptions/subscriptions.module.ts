import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { SubscriptionsController } from './subscriptions.controller';

import { SubscriptionsService } from './subscriptions.service';

import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';

import { UsersModule } from '../users/users.module';
import { SubscriptionsScheduler } from './subscriptions.scheduler';
import { EmailModule } from 'src/notifications/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Subscription.name,
        schema: SubscriptionSchema,
      },
    ]),

    UsersModule,
    EmailModule,
  ],

  controllers: [SubscriptionsController],

  providers: [SubscriptionsService, SubscriptionsScheduler],

  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
