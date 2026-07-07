import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { League } from '../schemas/league.schema';
import { LEAGUE_NAMES } from '../constants/leagues.constant';

const TRACKED_LEAGUES = [
  'PL',
  'ELC',
  'PD',
  'BL1',
  'SA',
  'FL1',
  'DED',
  'PPL',
  'TSL',
  'SPLSA',
  'MLS',
  'BSAA',
  'LPF',
  'NPFL',
  'PSL',
  'EPLEG',
  'BOTOLA',
  'CL',
  'EL',
  'CAFCL',
];

@Injectable()
export class LeagueSeedService implements OnModuleInit {
  constructor(
    @InjectModel(League.name)
    private leagueModel: Model<League>,
  ) {}

  async onModuleInit() {
    for (const code of Object.keys(LEAGUE_NAMES)) {
      await this.leagueModel.findOneAndUpdate(
        {
          code,
        },

        {
          code,

          name: LEAGUE_NAMES[code],

          isActive: true,

          isTracked: TRACKED_LEAGUES.includes(code),

          priority: TRACKED_LEAGUES.includes(code) ? 1 : 99,
        },

        {
          upsert: true,
        },
      );
    }

    console.log('League seed completed');
  }
}
