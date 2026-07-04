import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';

import { UsersService } from './users.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@GetUser() user: any) {
    return this.usersService.findById(user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateProfile(
    @GetUser() user: any,
    @Body()
    body: {
      fullName?: string;
      username?: string;
      phoneNumber?: string;
    },
  ) {
    return this.usersService.updateProfile(user._id, body);
  }
}
