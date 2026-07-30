import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { GetUser } from '../common/decorators/get-user.decorator';

import { CommunityService } from './community.service';

import { CreatePostDto } from './dto/create-post.dto';

import { CreateReplyDto } from './dto/create-reply.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get()
  findAll() {
    return this.communityService.findAll();
  }

  @Get('featured')
  featured() {
    return this.communityService.featured();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@GetUser() user: any, @Body() dto: CreatePostDto) {
    return this.communityService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() dto: CreateReplyDto,
  ) {
    return this.communityService.reply(id, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/react')
  react(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body('emoji') emoji: string,
  ) {
    return this.communityService.react(id, user._id, emoji);
  }
}
