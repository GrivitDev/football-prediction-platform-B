import { BadRequestException, Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Otp } from './schemas/otp.schema';

import { VerifyOtpDto } from './dto/verify-otp.dto';

import { ResendOtpDto } from './dto/resend-otp.dto';

import { UsersService } from '../users/users.service';

import { EmailService } from '../notifications/email.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { ReferralsService } from 'src/referrals/referrals.service';
import { PromoEngineService } from 'src/promos/promo-engine.service';

@Injectable()
export class OtpService {
  constructor(
    @InjectModel(Otp.name)
    private otpModel: Model<Otp>,

    private usersService: UsersService,

    private emailService: EmailService,
    private telegramService: TelegramService,
    private referralsService: ReferralsService,
    private promoEngineService: PromoEngineService,
  ) {}

  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const existingOtp = await this.otpModel.findOne({
      email: normalizedEmail,
    });

    if (existingOtp) {
      const diffInSeconds = Math.floor(
        (Date.now() - existingOtp.createdAt.getTime()) / 1000,
      );

      if (diffInSeconds < 60) {
        throw new BadRequestException(
          'Please wait before requesting another OTP',
        );
      }
    }

    await this.otpModel.deleteMany({
      email: normalizedEmail,
    });

    const otpCode = this.generateOtp();

    await this.otpModel.create({
      email: normalizedEmail,
      code: otpCode,
    });

    await this.emailService.sendOtpEmail(normalizedEmail, otpCode);

    return {
      message: 'OTP sent successfully',
    };
  }
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, code } = verifyOtpDto;

    const normalizedEmail = email.trim().toLowerCase();

    const otp = await this.otpModel.findOne({
      email: normalizedEmail,
      code,
      createdAt: {
        $gt: new Date(Date.now() - 20 * 60 * 1000),
      },
    });
    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const pendingUser = await this.usersService.findByEmail(normalizedEmail);

    const pendingPromoCode = pendingUser?.pendingPromoCode;

    const user = await this.usersService.verifyUser(normalizedEmail);
    if (!user) {
      throw new BadRequestException(
        'Verification expired or account could not be verified',
      );
    }

    await this.otpModel.deleteMany({
      email: normalizedEmail,
    });

    if (user.referredBy) {
      await this.referralsService.createReferral(
        user.referredBy,
        user._id.toString(),
      );
    }

    if (pendingPromoCode) {
      await this.promoEngineService.joinDirectCampaign(
        pendingPromoCode,
        user._id.toString(),
      );
    }

    await this.emailService.sendWelcomeEmail({
      email: user.email,
      fullName: user.fullName,
    });

    await this.telegramService.notifyNewUser({
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      referred: Boolean(user.referredBy),
    });

    return {
      message: 'Account verified successfully',
    };
  }

  async resendOtp(resendOtpDto: ResendOtpDto) {
    const { email } = resendOtpDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    if (
      !user.verificationExpiresAt ||
      user.verificationExpiresAt <= new Date()
    ) {
      await this.usersService.deleteExpiredUnverifiedRegistration(
        email,
        user.username,
      );

      throw new BadRequestException(
        'Registration expired. Please register again.',
      );
    }

    await this.createOtp(email);

    return {
      message: 'OTP resent successfully',
    };
  }
}
