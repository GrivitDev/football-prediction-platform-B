// src/sports/sports.module.ts

import { Module } from '@nestjs/common';

import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';
import { FootballDataService } from './football-data.service';

@Module({
  controllers: [SportsController],

  providers: [SportsService, FootballDataService],

  exports: [SportsService, FootballDataService],
})
export class SportsModule {}
