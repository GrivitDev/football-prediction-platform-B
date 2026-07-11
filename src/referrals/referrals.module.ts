import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Referral, ReferralSchema } from './schemas/referral.schema';

import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';

import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Referral.name,
        schema: ReferralSchema,
      },
    ]),

    UsersModule,
  ],

  controllers: [ReferralsController],

  providers: [ReferralsService],

  exports: [ReferralsService],
})
export class ReferralsModule {}
