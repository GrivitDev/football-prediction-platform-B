import { Body, Controller, Get, Post, UseGuards, Param } from '@nestjs/common'; 
import { FeedbackService } from './feedback.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { GetUser } from '../common/decorators/get-user.decorator';

import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  findAll() {
    return this.feedbackService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @GetUser() user: any,

    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/react')
  react(
    @Param('id') id: string,

    @GetUser() user: any,

    @Body('emoji') emoji: string,
  ) {
    return this.feedbackService.react(id, user._id, emoji);
  }
}
