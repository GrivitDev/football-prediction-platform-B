import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';

import { PredictionsService } from './predictions.service';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { PredictionUserService } from './prediction-user.service';

@Controller('predictions')
export class PredictionsController {
  constructor(
    private readonly service: PredictionsService,
    private readonly userService: PredictionUserService,
  ) {}

  // ======================
  // PUBLIC LIST (TABLE)
  // ======================
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // ======================
  // USER ACCESS VIEW (FIXED)
  // ======================
  @UseGuards(JwtAuthGuard)
  @Get('user/:id')
  getForUser(@Param('id') id: string, @GetUser() user: any) {
    return this.userService.getUserPredictionById(user, id);
  }

  // ======================
  // SINGLE RAW (ADMIN ONLY / DEBUG)
  // ======================
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ======================
  // ADMIN ONLY
  // ======================
  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(@Body() dto: CreatePredictionDto) {
    return this.service.create(dto);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePredictionDto) {
    return this.service.update(id, dto);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
