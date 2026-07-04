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

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private userSessionService: UserSessionService,
    private jwtService: JwtService,
    private otpService: OtpService,
    private emailService: EmailService,
    private telegramService: TelegramService,
  ) {}

  // ======================
  // REGISTER
  // ======================
  async register(registerDto: RegisterDto) {
    const { fullName, username, phoneNumber, email, password } = registerDto;

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

    const user = await this.usersService.create({
      fullName,
      username: normalizedUsername,
      phoneNumber,
      email,
      password: hashedPassword,
    });
    await this.telegramService.notifyNewUser({
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
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

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException('Account is temporarily banned');
    }

    // UPDATE LOGIN INFO
    await this.usersService.updateLoginInfo(user._id.toString());

    // CREATE SESSION (IMPORTANT)
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
  // PASSWORD RESET
  // ======================
  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmailWithPassword(email);

    const message = {
      message: 'If the email exists, a reset link has been sent',
    };

    if (!user) return message;

    const token = crypto.randomBytes(32).toString('hex');

    user.passwordResetToken = await bcrypt.hash(token, 10);
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?email=${user.email}&token=${token}`;

    await this.emailService.sendPasswordResetEmail(user.email, resetLink);

    return message;
  }

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

    return { message: 'Password reset successful' };
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

    const valid = await bcrypt.compare(
      currentPassword,
      userWithPassword!.password,
    );

    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    userWithPassword!.password = await bcrypt.hash(newPassword, 10);

    await userWithPassword!.save();

    return {
      message: 'Password changed successfully',
    };
  }
}
