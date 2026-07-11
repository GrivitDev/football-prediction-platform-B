import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { InternalAdsController } from './internal-ads.controller';
import { InternalAdsService } from './internal-ads.service';

import { InternalAd, InternalAdSchema } from './schemas/internal-ad.schema';

import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: InternalAd.name,
        schema: InternalAdSchema,
      },
    ]),

    UploadsModule,
  ],

  controllers: [InternalAdsController],

  providers: [InternalAdsService],

  exports: [InternalAdsService],
})
export class InternalAdsModule {}
