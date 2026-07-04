import { Body, Controller, Post } from '@nestjs/common';

import { OtpService } from './otp.service';

import { VerifyOtpDto } from './dto/verify-otp.dto';

import { ResendOtpDto } from './dto/resend-otp.dto';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('verify')
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.otpService.verifyOtp(verifyOtpDto);
  }

  @Post('resend')
  resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.otpService.resendOtp(resendOtpDto);
  }
}
