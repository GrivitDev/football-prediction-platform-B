import { BadRequestException, Injectable } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import { Otp } from './schemas/otp.schema';

import { VerifyOtpDto } from './dto/verify-otp.dto';

import { ResendOtpDto } from './dto/resend-otp.dto';

import { UsersService } from '../users/users.service';

import { EmailService } from '../notifications/email.service';

@Injectable()
export class OtpService {
  constructor(
    @InjectModel(Otp.name)
    private otpModel: Model<Otp>,

    private usersService: UsersService,

    private emailService: EmailService,
  ) {}

  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createOtp(email: string) {
    const existingOtp = await this.otpModel.findOne({
      email,
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
      email,
    });

    const otpCode = this.generateOtp();

    await this.otpModel.create({
      email,
      code: otpCode,
    });

    await this.emailService.sendOtpEmail(email, otpCode);

    return {
      message: 'OTP sent successfully',
    };
  }
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, code } = verifyOtpDto;

    const otp = await this.otpModel.findOne({
      email,
      code,
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.usersService.verifyUser(email);

    await this.otpModel.deleteMany({
      email,
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

    await this.createOtp(email);

    return {
      message: 'OTP resent successfully',
    };
  }
}
