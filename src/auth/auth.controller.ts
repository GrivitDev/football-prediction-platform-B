import { Body, Controller, Get, Post, UseGuards, Req } from '@nestjs/common';

import type { Request } from 'express';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ======================
  // REGISTER
  // ======================
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // ======================
  // LOGIN (SESSION ENABLED)
  // ======================
  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '';

    const userAgent = req.headers['user-agent'] || '';

    return this.authService.login(loginDto, ip.toString(), userAgent);
  }

  // ======================
  // CURRENT USER
  // ======================
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getCurrentUser(@GetUser() user: any) {
    return user;
  }

  // ======================
  // PASSWORD RESET REQUEST
  // ======================
  @Post('request-password-reset')
  requestPasswordReset(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email);
  }

  // ======================
  // RESET PASSWORD
  // ======================
  @Post('reset-password')
  resetPassword(
    @Body()
    body: {
      email: string;
      token: string;
      newPassword: string;
    },
  ) {
    return this.authService.resetPassword(
      body.email,
      body.token,
      body.newPassword,
    );
  }
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @GetUser() user: any,
    @Body()
    body: {
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.changePassword(
      user._id,
      body.currentPassword,
      body.newPassword,
    );
  }
}
