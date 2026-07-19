import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { UsersModule } from '../users/users.module';
import { UserSessionModule } from '../user-session/user-session.module'; // ✅ FIX ADDED

import { JwtStrategy } from './strategies/jwt.strategy';

import { OtpModule } from '../otp/otp.module';
import { EmailService } from '../notifications/email.service';
import { TelegramModule } from 'src/telegram/telegram.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { PromosModule } from '../promos/promos.module';
import { EmailModule } from 'src/notifications/email.module';

@Module({
  imports: [
    UsersModule,
    UserSessionModule,
    ReferralsModule,
    OtpModule,
    TelegramModule,
    PromosModule,
    EmailModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>('JWT_EXPIRES_IN') as '7d',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy, EmailService],

  exports: [PassportModule, JwtStrategy],
})
export class AuthModule {}
