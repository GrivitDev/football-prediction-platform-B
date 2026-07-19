import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { UsersService } from '../users/users.service';
import { UserSessionService } from '../user-session/user-session.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { OtpService } from '../otp/otp.service';
import { EmailService } from '../notifications/email.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { ReferralsService } from '../referrals/referrals.service';
import { PromosService } from 'src/promos/promos.service';
import { PromoEngineService } from 'src/promos/promo-engine.service';
import { UserStatus } from 'src/users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private userSessionService: UserSessionService,
    private jwtService: JwtService,
    private otpService: OtpService,
    private emailService: EmailService,
    private telegramService: TelegramService,
    private referralsService: ReferralsService,
    private promosService: PromosService,
    private promoEngineService: PromoEngineService,
  ) {}

  // ======================
  // REGISTER
  // ======================
  async register(registerDto: RegisterDto) {
    const {
      fullName,
      username,
      phoneNumber,
      email,
      password,
      referralCode,
      promoCode,
    } = registerDto;

    const normalizedUsername = username.trim().toLowerCase();

    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) {
      throw new BadRequestException('Email already exists');
    }

    const existingUsername = await this.usersService.findByUsername(username);
    if (existingUsername) {
      throw new BadRequestException('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let referredBy: string | undefined;
    let referrer: any = null;

    if (referralCode) {
      const normalizedReferralCode = referralCode.trim().toLowerCase();

      referrer = await this.usersService.findByUsername(normalizedReferralCode);

      if (!referrer) {
        throw new BadRequestException('Invalid referral code');
      }

      if (referrer.username === normalizedUsername) {
        throw new BadRequestException('You cannot use your own referral code');
      }

      referredBy = referrer._id.toString();
    }
    if (promoCode) {
      const promo = await this.promosService.findActivePromoByCode(promoCode);

      if (!promo) {
        throw new BadRequestException('Invalid or expired promo code');
      }
    }
    const user = await this.usersService.create({
      fullName,
      username: normalizedUsername,
      phoneNumber,
      email,
      password: hashedPassword,
      referredBy,
    });

    if (referredBy) {
      await this.referralsService.createReferral(
        referredBy,
        user._id.toString(),
      );
    }

    if (promoCode) {
      await this.promoEngineService.joinDirectCampaign(
        promoCode,
        user._id.toString(),
      );
    }

    await this.telegramService.notifyNewUser({
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,

      referred: !!referredBy,

      referredBy: referrer
        ? {
            id: referrer._id.toString(),
            fullName: referrer.fullName,
            username: referrer.username,
            email: referrer.email,
          }
        : undefined,
    });

    await this.otpService.createOtp(user.email);
    return {
      message: 'Registration successful. OTP sent to email.',
    };
  }

  // ======================
  // LOGIN
  // ======================
  async login(loginDto: LoginDto, ip?: string, userAgent?: string) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordMatched = await bcrypt.compare(password, user.password);

    if (!isPasswordMatched) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ACCOUNT CHECKS
    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your account');
    }

    if (user.isDeleted) {
      throw new UnauthorizedException('Account has been deleted');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException('Account is temporarily banned');
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily banned');
    }

    // UPDATE LOGIN INFO
    await this.usersService.updateLoginInfo(user._id.toString());

    // CLEAN OLD EXPIRED SESSIONS

    await this.userSessionService.cleanupUserSessions(user._id.toString());

    // CREATE NEW SESSION

    const session = await this.userSessionService.createSession({
      userId: user._id,

      userAgent: userAgent || 'unknown',

      ipAddress: ip || 'unknown',

      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // CREATE JWT
    const token = this.jwtService.sign({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      sessionId: session._id.toString(),
    });

    return {
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ======================
  // REQUEST PASSWORD RESET
  // ======================
  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');

    const hashedToken = await bcrypt.hash(rawToken, 10);

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await user.save();

    const frontendUrl =
      process.env.FRONTEND_URL || 'https://www.honestpredict.com';

    const resetLink =
      `${frontendUrl}/reset-password` +
      `?email=${encodeURIComponent(user.email)}` +
      `&token=${encodeURIComponent(rawToken)}`;

    await this.emailService.sendPasswordResetEmail(user.email, resetLink);
    return {
      message: 'Password reset email sent.',
    };
  }

  // ======================
  // PASSWORD RESET
  // ======================
  async resetPassword(email: string, token: string, newPassword: string) {
    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user || !user.passwordResetToken || !user.passwordResetExpires) {
      throw new BadRequestException('Invalid or expired reset request');
    }

    if (user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token expired');
    }

    const isValid = await bcrypt.compare(token, user.passwordResetToken);

    if (!isValid) {
      throw new BadRequestException('Invalid token');
    }

    user.password = await bcrypt.hash(newPassword, 10);

    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    // Logout every device
    await this.userSessionService.deactivateAllUserSessions(
      user._id.toString(),
    );

    return {
      message: 'Password reset successful. Please login again on all devices.',
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException();
    }

    const userWithPassword = await this.usersService.findByEmailWithPassword(
      user.email,
    );

    if (!userWithPassword) {
      throw new UnauthorizedException();
    }

    const valid = await bcrypt.compare(
      currentPassword,
      userWithPassword.password,
    );

    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Prevent using same password
    const samePassword = await bcrypt.compare(
      newPassword,
      userWithPassword.password,
    );

    if (samePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    userWithPassword.password = await bcrypt.hash(newPassword, 10);

    await userWithPassword.save();

    // Logout all devices
    await this.userSessionService.deactivateAllUserSessions(userId);

    return {
      message:
        'Password changed successfully. Please login again on all devices.',
    };
  }
}
