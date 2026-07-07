import { Module } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';

import { MongooseModule } from '@nestjs/mongoose';

import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';

import { UsersModule } from './users/users.module';

import { OtpModule } from './otp/otp.module';

import { PredictionsModule } from './predictions/predictions.module';

import { PaymentsModule } from './payments/payments.module';

import { SubscriptionsModule } from './subscriptions/subscriptions.module';

import { PostsModule } from './posts/posts.module';

import { UploadsModule } from './uploads/uploads.module';

import { AnalyticsModule } from './analytics/analytics.module';

import { SportsModule } from './sports/sports.module';
import { UserSessionModule } from './user-session/user-session.module';

import { AdminUsersModule } from './admin-users/admin-users.module';

import { CronModule } from './cron/cron.module';
import { PredictionPurchasesModule } from './prediction-purchases/prediction-purchases.module';
import { TelegramModule } from './telegram/telegram.module';
import { PlanConfigModule } from './plan-config/plan-config.module';
import { AdminGateway } from './realtime/admin.gateway';
import { LivescoreModule } from './livescore/livescore.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),

    AuthModule,

    UsersModule,

    OtpModule,

    PredictionsModule,

    PaymentsModule,

    SubscriptionsModule,

    PostsModule,

    UploadsModule,

    AnalyticsModule,

    CronModule,
    AdminUsersModule,

    UserSessionModule,
    TelegramModule,
    PlanConfigModule,

    LivescoreModule,

    PredictionPurchasesModule,
    SportsModule,
  ],
  providers: [AdminGateway],
})
export class AppModule {}
